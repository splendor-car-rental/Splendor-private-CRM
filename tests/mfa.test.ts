/**
 * Two-Factor Authentication (src/server/mfa.ts, src/server/mfaCrypto.ts)
 * ===========================================================================
 *
 * Runs against the real Firestore emulator, same pattern as
 * tests/leaseToOwn.test.ts. Covers: setup only becomes enforced after a
 * correct confirmation code (never on a mistyped/unscanned setup); the
 * eligibility gate (isMfaSatisfied) never blocks a non-ceo/admin role and
 * never blocks an account that hasn't enrolled; a wrong code is rejected; a
 * recovery code is accepted exactly once; disabling requires a currently
 * valid code.
 */

import crypto from 'crypto';
import { generateKeyPairSync } from 'crypto';
import * as OTPAuth from 'otpauth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let admin: typeof import('firebase-admin');
let db: FirebaseFirestore.Firestore;
let mfa: typeof import('../src/server/mfa');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-splendor-crm-rules-test';
const CEO = { uid: 'mfa-ceo-uid', name: 'Test CEO', role: 'ceo' as const };
const SALES = { uid: 'mfa-sales-uid', name: 'Test Sales', role: 'sales' as const };
const noopAudit = vi.fn().mockResolvedValue({ id: 'AL-1', timestamp: new Date().toISOString() } as any);

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set -- run via `npm test` (firebase emulators:exec), not vitest directly.');
  }
  process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const fakeServiceAccount = {
    type: 'service_account',
    project_id: PROJECT_ID,
    private_key_id: 'test-key',
    private_key: privateKey,
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`,
    client_id: '000000000000000000000',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token'
  };

  const adminModule = await import('firebase-admin');
  admin = adminModule.default ?? (adminModule as any);
  admin.initializeApp({ credential: admin.credential.cert(fakeServiceAccount as any), projectId: PROJECT_ID });
  db = admin.firestore();

  mfa = await import('../src/server/mfa');
});

afterAll(async () => {
  await Promise.all(admin.apps.map((app) => app?.delete()));
});

afterEach(async () => {
  const snap = await db.collection('user_mfa').get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
});

function generateValidCode(secretBase32: string): string {
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secretBase32), digits: 6, period: 30, algorithm: 'SHA1' });
  return totp.generate();
}

describe('isMfaSatisfied -- the gate every protected route calls', () => {
  it('never blocks a non-ceo/admin role, regardless of enrollment state', async () => {
    expect(await mfa.isMfaSatisfied(SALES.uid, 'sales')).toBe(true);
    await db.collection('user_mfa').doc(SALES.uid).set({ uid: SALES.uid, enabled: true, mfaVerifiedUntil: '2000-01-01T00:00:00.000Z' });
    expect(await mfa.isMfaSatisfied(SALES.uid, 'sales')).toBe(true);
  });

  it('never blocks a ceo/admin account that has not enrolled', async () => {
    expect(await mfa.isMfaSatisfied(CEO.uid, 'ceo')).toBe(true);
  });

  it('blocks an enrolled ceo/admin account whose verification window has expired', async () => {
    await db.collection('user_mfa').doc(CEO.uid).set({ uid: CEO.uid, enabled: true, mfaVerifiedUntil: '2000-01-01T00:00:00.000Z' });
    expect(await mfa.isMfaSatisfied(CEO.uid, 'ceo')).toBe(false);
  });

  it('allows an enrolled ceo/admin account with a currently-valid verification window', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.collection('user_mfa').doc(CEO.uid).set({ uid: CEO.uid, enabled: true, mfaVerifiedUntil: future });
    expect(await mfa.isMfaSatisfied(CEO.uid, 'ceo')).toBe(true);
  });
});

describe('Setup + confirm lifecycle', () => {
  it('startMfaSetup stores only a PENDING secret -- MFA is not yet enforced', async () => {
    await mfa.startMfaSetup(CEO);
    expect(await mfa.isMfaSatisfied(CEO.uid, 'ceo')).toBe(true);
    const doc = (await db.collection('user_mfa').doc(CEO.uid).get()).data();
    expect(doc?.enabled).toBe(false);
    expect(doc?.pendingSecretEncrypted).toBeDefined();
    expect(doc?.secretEncrypted).toBeUndefined();
  });

  it('confirmMfaSetup rejects a wrong code and leaves MFA unenforced', async () => {
    await mfa.startMfaSetup(CEO);
    await expect(mfa.confirmMfaSetup(CEO, '000000', noopAudit)).rejects.toThrow(/الرمز غير صحيح/);
    expect(await mfa.isMfaSatisfied(CEO.uid, 'ceo')).toBe(true);
  });

  it('confirmMfaSetup with the correct code enables MFA, issues 8 recovery codes, and immediately satisfies the gate', async () => {
    const setup = await mfa.startMfaSetup(CEO);
    const code = generateValidCode(setup.secret);
    const result = await mfa.confirmMfaSetup(CEO, code, noopAudit);
    expect(result.recoveryCodes).toHaveLength(8);
    // Right after confirmation the account is enrolled AND already verified
    // for this session (confirm itself sets mfaVerifiedUntil).
    expect(await mfa.isMfaSatisfied(CEO.uid, 'ceo')).toBe(true);
    const doc = (await db.collection('user_mfa').doc(CEO.uid).get()).data();
    expect(doc?.enabled).toBe(true);
    expect(doc?.pendingSecretEncrypted).toBeUndefined();
    expect(new Date(doc?.mfaVerifiedUntil).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('verifyMfaCode', () => {
  async function enroll(): Promise<{ secret: string; recoveryCodes: string[] }> {
    const setup = await mfa.startMfaSetup(CEO);
    const { recoveryCodes } = await mfa.confirmMfaSetup(CEO, generateValidCode(setup.secret), noopAudit);
    return { secret: setup.secret, recoveryCodes };
  }

  it('accepts a currently-valid TOTP code', async () => {
    const { secret } = await enroll();
    await expect(mfa.verifyMfaCode(CEO, generateValidCode(secret))).resolves.toEqual({ verified: true });
  });

  it('rejects a wrong code that is also not a recovery code', async () => {
    await enroll();
    await expect(mfa.verifyMfaCode(CEO, '111111')).rejects.toThrow(/رمز التحقق غير صحيح/);
  });

  it('accepts a recovery code exactly once, then rejects it on reuse', async () => {
    const { recoveryCodes } = await enroll();
    const code = recoveryCodes[0];
    await expect(mfa.verifyMfaCode(CEO, code)).resolves.toEqual({ verified: true });
    await expect(mfa.verifyMfaCode(CEO, code)).rejects.toThrow(/رمز التحقق غير صحيح/);
  });
});

describe('disableMfa', () => {
  it('refuses to disable without a currently-valid code', async () => {
    const setup = await mfa.startMfaSetup(CEO);
    await mfa.confirmMfaSetup(CEO, generateValidCode(setup.secret), noopAudit);
    await expect(mfa.disableMfa(CEO, '000000', noopAudit)).rejects.toThrow(/رمز التحقق غير صحيح/);
    const doc = (await db.collection('user_mfa').doc(CEO.uid).get()).data();
    expect(doc?.enabled).toBe(true);
  });

  it('disables MFA given a currently-valid code, and the gate stops applying', async () => {
    const setup = await mfa.startMfaSetup(CEO);
    await mfa.confirmMfaSetup(CEO, generateValidCode(setup.secret), noopAudit);
    await mfa.disableMfa(CEO, generateValidCode(setup.secret), noopAudit);
    const doc = (await db.collection('user_mfa').doc(CEO.uid).get()).data();
    expect(doc?.enabled).toBe(false);
    expect(doc?.secretEncrypted).toBeUndefined();
    expect(await mfa.isMfaSatisfied(CEO.uid, 'ceo')).toBe(true);
  });
});
