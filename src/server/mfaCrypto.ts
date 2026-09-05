import crypto from 'crypto';

/**
 * AES-256-GCM at-rest encryption for TOTP secrets. The key is never stored
 * in Firestore alongside the ciphertext -- it comes only from MFA_ENCRYPTION_KEY
 * (a 32-byte key, base64-encoded), matching this app's established pattern of
 * refusing to run until an operator has configured a real secret (see
 * leaseToOwnPolicy.ts's requireConfiguredRule) rather than inventing one.
 */
function getKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) throw new Error('MFA_ENCRYPTION_KEY غير مُعدّ. لا يمكن استخدام المصادقة الثنائية حتى يتم ضبط هذا المتغير البيئي على الخادم.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY يجب أن يكون مفتاحاً من 32 بايت مُرمّزاً بصيغة base64.');
  return key;
}

/** iv(12) + authTag(16) + ciphertext, all base64-joined -- self-contained, no separate IV storage needed. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

/** 8 codes like "A1B2-C3D4", shown once in plaintext at confirm time -- only their SHA-256 hashes are ever persisted. */
export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}
