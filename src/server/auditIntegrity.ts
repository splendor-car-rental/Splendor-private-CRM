import crypto from 'node:crypto';

// Tamper-evident hash-chaining for the audit trail (RULE-A01, Splendor
// Master Rule Set, Module 12). Before this, recordAudit() was a plain
// sequential append -- no application code path could delete an entry
// (no delete route exists, and firestore.rules denies client writes
// entirely to audit_logs), but nothing detected a direct Admin-SDK/
// console-level deletion or edit. This closes that specific gap.
//
// Design choice: rather than a single global Firestore transaction
// serializing every audit write through one "chain head" document (which
// would turn every mutating request in the entire app into a contention
// point on that one document), the chain head is read and updated as two
// separate, cheap, single-document operations. Two audit writes racing
// each other can both read the same previousHash and both point at the
// same parent -- a harmless fork, not corruption: every entry still has a
// real, existing parent, so verifyAuditChainIntegrity() below never raises
// a false tamper alarm from ordinary concurrency. What a fork CANNOT do is
// hide a deleted entry: removing any entry breaks the link for whatever
// entry declared that removed entry's hash as its own previousHash, and
// directly editing a stored entry's fields changes its recomputed content
// hash away from what's stored -- both are what this module detects.

export const AUDIT_CHAIN_GENESIS = 'GENESIS';

export interface AuditChainFields {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  entityType: string;
  entityId: string;
  action: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
  timestamp: string;
}

/** Deterministic content hash over exactly the fields that make an audit entry what it is -- excludes contentHash/previousHash themselves. */
export function computeAuditContentHash(entry: AuditChainFields): string {
  const canonical = JSON.stringify({
    id: entry.id,
    userId: entry.userId,
    userName: entry.userName,
    userRole: entry.userRole,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    previousValue: entry.previousValue ?? null,
    newValue: entry.newValue ?? null,
    reason: entry.reason ?? null,
    timestamp: entry.timestamp
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** Reads the current chain head, computes this entry's content hash, advances the head. Call once per audit entry, before persisting it. */
export async function appendToAuditChain(entryFields: AuditChainFields): Promise<{ contentHash: string; previousHash: string }> {
  const admin = (await import('firebase-admin')).default;
  const db = admin.firestore();
  const headRef = db.collection('system_state').doc('audit_chain_head');

  const headSnap = await headRef.get();
  const previousHash: string = headSnap.exists && (headSnap.data() as any)?.lastHash
    ? (headSnap.data() as any).lastHash
    : AUDIT_CHAIN_GENESIS;

  const contentHash = computeAuditContentHash(entryFields);

  await headRef.set({ lastHash: contentHash, lastEntryId: entryFields.id, updatedAt: new Date().toISOString() }, { merge: true });

  return { contentHash, previousHash };
}

export interface AuditIntegrityReport {
  ok: boolean;
  totalEntries: number;
  verifiedEntries: number;
  unhashedEntries: number; // entries written before this feature existed -- not flagged as tampered, just unverifiable
  contentMismatches: string[]; // audit entry ids whose stored content no longer matches their recorded hash
  brokenLinks: string[]; // audit entry ids whose previousHash points at a hash that doesn't exist -- implies a deleted or forged entry
}

/**
 * Walks the entire audit trail and verifies every hash-chained entry.
 * Not on any request hot path -- intended for an admin-triggered check or
 * a periodic job, not per-mutation overhead.
 */
export async function verifyAuditChainIntegrity(): Promise<AuditIntegrityReport> {
  const admin = (await import('firebase-admin')).default;
  const db = admin.firestore();
  const snap = await db.collection('audit_logs').get();
  const entries = snap.docs.map((d: any) => d.data() as any);

  const knownHashes = new Set<string>();
  const contentMismatches: string[] = [];
  let unhashedEntries = 0;

  for (const e of entries) {
    if (!e.contentHash) { unhashedEntries++; continue; }
    const recomputed = computeAuditContentHash(e);
    if (recomputed !== e.contentHash) contentMismatches.push(e.id);
    knownHashes.add(e.contentHash);
  }

  const brokenLinks: string[] = [];
  for (const e of entries) {
    if (!e.contentHash) continue;
    if (!e.previousHash || e.previousHash === AUDIT_CHAIN_GENESIS) continue;
    if (!knownHashes.has(e.previousHash)) brokenLinks.push(e.id);
  }

  return {
    ok: contentMismatches.length === 0 && brokenLinks.length === 0,
    totalEntries: entries.length,
    verifiedEntries: entries.length - unhashedEntries,
    unhashedEntries,
    contentMismatches,
    brokenLinks
  };
}
