/**
 * Audit-Trail Hash-Chain Integrity (RULE-A01, Splendor Master Rule Set)
 * =======================================================================
 *
 * Before this, recordAudit() was a plain sequential append -- no code path
 * could delete an entry, but nothing detected a direct Admin-SDK/console
 * edit or deletion of an existing entry. appendToAuditChain() /
 * verifyAuditChainIntegrity() (src/server/auditIntegrity.ts) close that
 * gap: each entry stores a hash of its own content plus a link to the
 * previous entry's hash, and the verifier detects either a content edit
 * (recomputed hash no longer matches) or a broken link (an entry whose
 * previousHash points at a hash that no longer exists -- because that
 * entry was deleted).
 *
 * Runs against the real Firestore emulator (not the mocked firebase-admin
 * double), since this specifically proves a real-content-tampering
 * scenario a mock can't meaningfully simulate.
 */

import { generateKeyPairSync } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

let admin: typeof import('firebase-admin');
let db: FirebaseFirestore.Firestore;
let appendToAuditChain: typeof import('../src/server/auditIntegrity').appendToAuditChain;
let verifyAuditChainIntegrity: typeof import('../src/server/auditIntegrity').verifyAuditChainIntegrity;
let computeAuditContentHash: typeof import('../src/server/auditIntegrity').computeAuditContentHash;

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-splendor-crm-rules-test';

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set -- run via `npm test` (firebase emulators:exec), not vitest directly.');
  }

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

  ({ appendToAuditChain, verifyAuditChainIntegrity, computeAuditContentHash } = await import('../src/server/auditIntegrity'));
});

afterAll(async () => {
  await Promise.all(admin.apps.map((app) => app?.delete()));
});

async function clearCollection(name: string) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

afterEach(async () => {
  await Promise.all(['audit_logs', 'system_state'].map(clearCollection));
});

function makeEntry(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    userId: 'U1',
    userName: 'Test User',
    userRole: 'finance',
    entityType: 'Debt',
    entityId: 'DBT-1',
    action: 'update',
    newValue: `entry ${id}`,
    timestamp: new Date().toISOString(),
    ...overrides
  };
}

async function writeChainedEntry(fields: ReturnType<typeof makeEntry>) {
  const { contentHash, previousHash } = await appendToAuditChain(fields as any);
  const doc = { ...fields, contentHash, previousHash };
  await db.collection('audit_logs').doc(fields.id).set(doc);
  return doc;
}

describe('Audit trail hash-chain integrity', () => {
  it('a normal, untouched chain of entries verifies clean', async () => {
    await writeChainedEntry(makeEntry('AUD-1'));
    await writeChainedEntry(makeEntry('AUD-2'));
    await writeChainedEntry(makeEntry('AUD-3'));

    const report = await verifyAuditChainIntegrity();
    expect(report.ok).toBe(true);
    expect(report.totalEntries).toBe(3);
    expect(report.contentMismatches).toHaveLength(0);
    expect(report.brokenLinks).toHaveLength(0);
  });

  it('each entry correctly links to the immediately preceding entry\'s content hash', async () => {
    const first = await writeChainedEntry(makeEntry('AUD-1'));
    const second = await writeChainedEntry(makeEntry('AUD-2'));
    expect(second.previousHash).toBe(first.contentHash);
  });

  it('directly editing a stored entry\'s content in Firestore is detected as a content mismatch', async () => {
    await writeChainedEntry(makeEntry('AUD-1'));
    await writeChainedEntry(makeEntry('AUD-2'));

    // Simulate a direct Admin-SDK/console edit -- the kind of access this
    // feature exists specifically to catch, since no application route can
    // do this.
    await db.collection('audit_logs').doc('AUD-1').update({ newValue: 'TAMPERED: this was never the real value' });

    const report = await verifyAuditChainIntegrity();
    expect(report.ok).toBe(false);
    expect(report.contentMismatches).toContain('AUD-1');
  });

  it('deleting an entry breaks the chain link for whatever entry pointed to it', async () => {
    await writeChainedEntry(makeEntry('AUD-1'));
    await writeChainedEntry(makeEntry('AUD-2'));
    await writeChainedEntry(makeEntry('AUD-3'));

    // Simulate a direct deletion -- no application route can do this
    // (audit_logs has no delete route and firestore.rules denies client
    // writes entirely), but a console/Admin-SDK actor could.
    await db.collection('audit_logs').doc('AUD-2').delete();

    const report = await verifyAuditChainIntegrity();
    expect(report.ok).toBe(false);
    expect(report.brokenLinks).toContain('AUD-3'); // AUD-3's previousHash pointed at AUD-2's hash, which no longer exists
  });

  it('entries written before this feature existed (no contentHash) are treated as unverifiable, not tampered', async () => {
    await db.collection('audit_logs').doc('LEGACY-1').set(makeEntry('LEGACY-1'));
    await writeChainedEntry(makeEntry('AUD-1'));

    const report = await verifyAuditChainIntegrity();
    expect(report.ok).toBe(true); // the legacy entry doesn't fail verification
    expect(report.unhashedEntries).toBe(1);
    expect(report.verifiedEntries).toBe(1);
  });

  it('concurrent audit writes each get a real, valid parent hash (a benign fork, not corruption)', async () => {
    // Two "concurrent" writes both reading the same chain head before
    // either updates it -- simulated here by computing both hashes before
    // persisting either, mirroring the actual race window in
    // appendToAuditChain() (read head, THEN persist).
    const a = makeEntry('AUD-A');
    const b = makeEntry('AUD-B');
    const [chainA, chainB] = await Promise.all([appendToAuditChain(a as any), appendToAuditChain(b as any)]);
    await db.collection('audit_logs').doc('AUD-A').set({ ...a, contentHash: chainA.contentHash, previousHash: chainA.previousHash });
    await db.collection('audit_logs').doc('AUD-B').set({ ...b, contentHash: chainB.contentHash, previousHash: chainB.previousHash });

    const report = await verifyAuditChainIntegrity();
    // Both forked from the same genesis parent -- neither is a broken
    // link, since GENESIS is never checked against knownHashes.
    expect(report.ok).toBe(true);
    expect(report.brokenLinks).toHaveLength(0);
  });

  it('computeAuditContentHash is deterministic for identical input and changes on any field change', () => {
    const entry = makeEntry('AUD-X');
    const h1 = computeAuditContentHash(entry as any);
    const h2 = computeAuditContentHash({ ...entry } as any);
    expect(h1).toBe(h2);

    const changed = computeAuditContentHash({ ...entry, newValue: 'different' } as any);
    expect(changed).not.toBe(h1);
  });
});
