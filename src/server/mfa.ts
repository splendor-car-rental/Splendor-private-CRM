import admin from 'firebase-admin';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { encryptSecret, decryptSecret, hashRecoveryCode, generateRecoveryCodes } from './mfaCrypto.js';
import type { RecordAuditFn } from './businessRules.js';

const COLLECTION = 'user_mfa';
/** How long a successful code verification is trusted before the server asks again. */
const MFA_SESSION_HOURS = 12;
const ISSUER = 'Splendor CRM';

export interface MfaActor {
  uid: string;
  name: string;
  role: string;
}

interface UserMfaDoc {
  uid: string;
  enabled: boolean;
  pendingSecretEncrypted?: string;
  secretEncrypted?: string;
  recoveryCodesHashed?: string[];
  confirmedAt?: string;
  mfaVerifiedUntil?: string;
  updatedAt: string;
}

export class MfaError extends Error {}

async function loadDoc(uid: string): Promise<UserMfaDoc | null> {
  const snap = await admin.firestore().collection(COLLECTION).doc(uid).get();
  return snap.exists ? (snap.data() as UserMfaDoc) : null;
}

function makeTotp(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32)
  });
}

/** Server-side gate other modules call after resolving role -- MFA is opt-in per account, so an account that never enrolled is never blocked. */
export async function isMfaSatisfied(uid: string, role: string): Promise<boolean> {
  if (!['ceo', 'admin'].includes(role)) return true;
  const doc = await loadDoc(uid);
  if (!doc?.enabled) return true;
  const until = doc.mfaVerifiedUntil ? new Date(doc.mfaVerifiedUntil).getTime() : 0;
  return until > Date.now();
}

export async function getMfaStatus(uid: string): Promise<{ enabled: boolean }> {
  const doc = await loadDoc(uid);
  return { enabled: !!doc?.enabled };
}

/** Starts (or restarts) enrollment: a brand-new secret is generated and stored as PENDING only -- it becomes the real, enforced secret only once confirmSetup() verifies the user actually scanned it and can produce a valid code. */
export async function startMfaSetup(actor: MfaActor): Promise<{ otpauthUrl: string; qrCodeDataUrl: string; secret: string }> {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = makeTotp(secret.base32, actor.name || actor.uid);
  const otpauthUrl = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  const now = new Date().toISOString();
  await admin.firestore().collection(COLLECTION).doc(actor.uid).set({
    uid: actor.uid,
    enabled: false,
    pendingSecretEncrypted: encryptSecret(secret.base32),
    updatedAt: now
  }, { merge: true });

  return { otpauthUrl, qrCodeDataUrl, secret: secret.base32 };
}

/** Verifies the first code against the PENDING secret; only on success does MFA become enforced -- prevents a mistyped/unscanned setup from locking the account out. */
export async function confirmMfaSetup(actor: MfaActor, code: string, recordAudit: RecordAuditFn): Promise<{ recoveryCodes: string[] }> {
  const doc = await loadDoc(actor.uid);
  if (!doc?.pendingSecretEncrypted) throw new MfaError('لا يوجد إعداد مصادقة ثنائية معلّق. ابدأ الإعداد أولاً.');

  const pendingSecret = decryptSecret(doc.pendingSecretEncrypted);
  const totp = makeTotp(pendingSecret, actor.name || actor.uid);
  if (totp.validate({ token: String(code || '').trim(), window: 1 }) === null) {
    throw new MfaError('الرمز غير صحيح. تأكد من مزامنة الوقت في تطبيق المصادقة وحاول مرة أخرى.');
  }

  const recoveryCodes = generateRecoveryCodes();
  const now = new Date().toISOString();
  await admin.firestore().collection(COLLECTION).doc(actor.uid).set({
    uid: actor.uid,
    enabled: true,
    secretEncrypted: encryptSecret(pendingSecret),
    pendingSecretEncrypted: admin.firestore.FieldValue.delete(),
    recoveryCodesHashed: recoveryCodes.map(hashRecoveryCode),
    confirmedAt: now,
    mfaVerifiedUntil: new Date(Date.now() + MFA_SESSION_HOURS * 60 * 60 * 1000).toISOString(),
    updatedAt: now
  }, { merge: true });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'UserMfa', entityId: actor.uid, action: 'update',
    newValue: 'تم تفعيل المصادقة الثنائية لهذا الحساب.'
  });

  return { recoveryCodes };
}

/** Called both at login-time challenge and to re-confirm mid-session. A matching recovery code is also accepted and is then burned (single use). */
export async function verifyMfaCode(actor: MfaActor, code: string): Promise<{ verified: true }> {
  const doc = await loadDoc(actor.uid);
  if (!doc?.enabled || !doc.secretEncrypted) throw new MfaError('المصادقة الثنائية غير مفعّلة على هذا الحساب.');

  const trimmed = String(code || '').trim();
  const totp = makeTotp(decryptSecret(doc.secretEncrypted), actor.name || actor.uid);
  const validTotp = totp.validate({ token: trimmed, window: 1 }) !== null;

  if (!validTotp) {
    const codeHash = hashRecoveryCode(trimmed);
    const recoveryCodes = doc.recoveryCodesHashed || [];
    const matchIndex = recoveryCodes.indexOf(codeHash);
    if (matchIndex === -1) throw new MfaError('رمز التحقق غير صحيح.');
    const remaining = recoveryCodes.filter((_, i) => i !== matchIndex);
    await admin.firestore().collection(COLLECTION).doc(actor.uid).set({
      recoveryCodesHashed: remaining,
      mfaVerifiedUntil: new Date(Date.now() + MFA_SESSION_HOURS * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return { verified: true };
  }

  await admin.firestore().collection(COLLECTION).doc(actor.uid).set({
    mfaVerifiedUntil: new Date(Date.now() + MFA_SESSION_HOURS * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  }, { merge: true });
  return { verified: true };
}

/** Requires a currently-valid code (or recovery code) to turn MFA off -- never a bare toggle, so a stolen but not-yet-MFA-verified session cannot disable protection on its own. */
export async function disableMfa(actor: MfaActor, code: string, recordAudit: RecordAuditFn): Promise<void> {
  await verifyMfaCode(actor, code);
  await admin.firestore().collection(COLLECTION).doc(actor.uid).set({
    enabled: false,
    secretEncrypted: admin.firestore.FieldValue.delete(),
    pendingSecretEncrypted: admin.firestore.FieldValue.delete(),
    recoveryCodesHashed: admin.firestore.FieldValue.delete(),
    mfaVerifiedUntil: admin.firestore.FieldValue.delete(),
    updatedAt: new Date().toISOString()
  }, { merge: true });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'UserMfa', entityId: actor.uid, action: 'update',
    newValue: 'تم إلغاء تفعيل المصادقة الثنائية لهذا الحساب.'
  });
}
