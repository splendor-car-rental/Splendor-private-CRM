import { createDurable, runDurableTransaction, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals.js';
import type { RecordAuditFn } from './businessRules.js';
import type { BlocklistEntry, BlocklistIdentifierType, BlocklistTier, UserRole } from '../types/index.js';

// ----------------------------------------------------
// SECURITY BLOCKLIST / WATCHLIST (Splendor Master Rule Set, Module 03)
// ----------------------------------------------------
// RULE-B01: matched ONLY by an exact identifier pair (passport number +
// issuing country, or Emirates ID number) -- never by name alone, so two
// unrelated people who happen to share a name can never collide. RULE-B02:
// a block has a tier -- 'full' (booking rejected outright) or
// 'conditional' (allowed only with whatever the block's own note requires,
// e.g. a raised deposit or a specific manager's sign-off -- enforced by a
// human reading conditionalNote, not by this module inventing a business
// rule for what "conditional" means in every case). RULE-B04: removing a
// block goes through the same generic Segregation-of-Duties engine every
// other Procurement Phase 1 workflow uses (procurementApprovals.ts) --
// the person requesting removal is never the person who decides it.

export class BlocklistError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'BlocklistError';
  }
}

function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase();
}

export interface CreateBlocklistEntryInput {
  identifierType: BlocklistIdentifierType;
  identifierValue: string;
  identifierCountry?: string;
  customerName?: string;
  nationality?: string;
  tier: BlocklistTier;
  reason: string;
  conditionalNote?: string;
  createdBy: string;
  createdByName: string;
  createdByRole: UserRole;
}

export async function createBlocklistEntry(input: CreateBlocklistEntryInput, recordAudit: RecordAuditFn): Promise<BlocklistEntry> {
  if (!input.identifierValue || !input.identifierValue.trim()) {
    throw new BlocklistError('An identifier value is required.');
  }
  if (input.identifierType === 'passport' && (!input.identifierCountry || !input.identifierCountry.trim())) {
    throw new BlocklistError('A passport-based block requires the issuing country as well -- a passport number alone is not a unique enough match (RULE-B01).');
  }
  if (!input.reason || !input.reason.trim()) {
    throw new BlocklistError('A reason is required to block a customer.');
  }
  if (!input.customerName || !input.customerName.trim()) {
    throw new BlocklistError('The customer\'s full name is required, matching customer-registration policy -- it is recorded for display only and is never used to match a block (RULE-B01).');
  }
  if (input.tier === 'conditional' && (!input.conditionalNote || !input.conditionalNote.trim())) {
    throw new BlocklistError('A conditional block requires a note describing what is required to proceed (e.g. a raised deposit amount, or which manager must authorize an exception).');
  }

  const id = await issueNextNumber('BlocklistEntry');
  const now = new Date().toISOString();
  const entry: BlocklistEntry = {
    id,
    identifierType: input.identifierType,
    identifierValue: normalizeIdentifier(input.identifierValue),
    identifierCountry: input.identifierType === 'passport' ? normalizeIdentifier(input.identifierCountry!) : undefined,
    customerName: input.customerName,
    nationality: input.nationality,
    tier: input.tier,
    reason: input.reason,
    conditionalNote: input.conditionalNote,
    status: 'active',
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now
  };
  await createDurable('blocklist_entries', entry as unknown as { id: string });

  await recordAudit({
    userId: input.createdBy,
    userName: input.createdByName,
    userRole: input.createdByRole,
    entityType: 'BlocklistEntry',
    entityId: id,
    action: 'create',
    newValue: `${input.tier} block on ${input.identifierType} ${entry.identifierValue}${entry.identifierCountry ? ` (${entry.identifierCountry})` : ''}: ${input.reason}`,
    reason: input.reason
  });

  return entry;
}

/**
 * RULE-B01/B03: the proactive check called the instant an identifier is
 * entered anywhere a new customer/booking is being created. Matches ONLY
 * an exact (identifierType, identifierValue, identifierCountry-if-passport)
 * tuple against ACTIVE entries -- never a name, never a partial match.
 */
export async function checkBlocklist(identifierType: BlocklistIdentifierType, identifierValue: string, identifierCountry?: string): Promise<BlocklistEntry | null> {
  if (!identifierValue || !identifierValue.trim()) return null;
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('blocklist_entries').get();
  const normalizedValue = normalizeIdentifier(identifierValue);
  const normalizedCountry = identifierCountry ? normalizeIdentifier(identifierCountry) : undefined;

  const match = snap.docs
    .map((d: any) => d.data() as BlocklistEntry)
    .find((e) =>
      e.status === 'active' &&
      e.identifierType === identifierType &&
      e.identifierValue === normalizedValue &&
      (identifierType !== 'passport' || e.identifierCountry === normalizedCountry)
    );
  return match || null;
}

export async function listBlocklistEntries(): Promise<BlocklistEntry[]> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('blocklist_entries').get();
  return snap.docs.map((d: any) => d.data() as BlocklistEntry).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export interface RequestUnblockInput {
  entryId: string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

/** RULE-B04: requests removal of an active block -- decided by a different, authorized person via the shared Segregation-of-Duties engine. */
export async function requestUnblock(input: RequestUnblockInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('blocklist_entries').doc(input.entryId).get();
  if (!snap.exists) throw new BlocklistError(`Blocklist entry ${input.entryId} not found.`);
  const entry = snap.data() as BlocklistEntry;
  if (entry.status !== 'active') {
    throw new BlocklistError(`This entry is already ${entry.status}.`);
  }
  if (!input.reason || !input.reason.trim()) {
    throw new BlocklistError('A reason is required to request removal of this block.');
  }

  const approvalRequest = await createProcurementApproval({
    entityType: 'BlocklistEntry',
    entityId: entry.id,
    action: 'unblock',
    payload: { entryId: entry.id },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { approvalRequestId: approvalRequest.id };
}

// Read-check-write wrapped in a transaction (the same defensive pattern
// applied to every other approval handler audited this session) -- a
// concurrent second decide attempt on the same underlying entry (e.g. a
// duplicate unblock request racing this one) is forced to re-read
// up-to-date status rather than trusting a stale snapshot.
registerApprovalHandler('BlocklistEntry', 'unblock', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const entryId = request.payload.entryId as string;
  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('blocklist_entries').doc(entryId);
  const now = new Date().toISOString();

  const entry = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BlocklistError(`Blocklist entry ${entryId} not found.`);
    const current = snap.data() as BlocklistEntry;
    if (current.status !== 'active') {
      throw new BlocklistError(`Blocklist entry ${entryId} is already ${current.status}.`);
    }
    tx.set(ref, { status: 'removed', removedAt: now, removedBy: decider.uid, removedByName: decider.name }, { merge: true });
    return { ...current, status: 'removed' as const, removedAt: now, removedBy: decider.uid, removedByName: decider.name };
  });

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'BlocklistEntry',
    entityId: entryId,
    action: 'approval',
    newValue: `Unblock approved for ${entry.identifierType} ${entry.identifierValue}.`,
    reason: request.reason
  });
});
