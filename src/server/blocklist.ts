import { runDurableTransaction, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals';
import type { RecordAuditFn } from './businessRules';
import type { BlocklistEntry, BlocklistTier, UserRole } from '../types';

export type ExtendedBlocklistIdentifierType =
  | 'emirates_id'
  | 'passport'
  | 'gcc_id'
  | 'national_id'
  | 'driving_license'
  | 'international_driving_permit'
  | 'trade_license'
  | 'company_registration'
  | 'tax_registration'
  | 'phone'
  | 'email'
  | 'other';

export type BlocklistSubjectType = 'individual' | 'company';

export interface BlocklistIdentifier {
  type: ExtendedBlocklistIdentifierType;
  value: string;
  issuingCountry?: string;
  expiryDate?: string;
  label?: string;
}

export interface BlocklistProfile {
  fullName?: string;
  nationality?: string;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  address?: string;
  legalName?: string;
  tradeName?: string;
  registrationCountry?: string;
  managerName?: string;
  managerPhone?: string;
  notes?: string;
}

export type ExtendedBlocklistEntry = BlocklistEntry & {
  subjectType?: BlocklistSubjectType;
  identifiers?: BlocklistIdentifier[];
  profile?: BlocklistProfile;
};

export class BlocklistError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'BlocklistError';
  }
}

const AUDIT_RECOVERY_COLLECTION = 'security_audit_recovery';
const COUNTRY_SENSITIVE_TYPES = new Set<ExtendedBlocklistIdentifierType>([
  'passport', 'driving_license', 'international_driving_permit', 'national_id', 'gcc_id'
]);

function normalizeCountry(value?: string): string | undefined {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || undefined;
}

/**
 * Identifier normalization is intentionally type-aware. Names are never
 * automatic match keys. Official document numbers are compared without
 * cosmetic whitespace/hyphens; email and phone use their own canonical
 * forms. This lets the same real identifier match regardless of UI format
 * without broad fuzzy matching that could block the wrong person.
 */
export function normalizeBlocklistIdentifier(type: ExtendedBlocklistIdentifierType, value: string): string {
  const raw = String(value || '').trim();
  if (type === 'email') return raw.toLowerCase();
  if (type === 'phone') {
    const hasPlus = raw.startsWith('+');
    const digits = raw.replace(/\D/g, '');
    return `${hasPlus ? '+' : ''}${digits}`;
  }
  if (type === 'other') return raw.toUpperCase().replace(/\s+/g, ' ');
  return raw.toUpperCase().replace(/[\s-]+/g, '');
}

function normalizeProfile(input?: BlocklistProfile): BlocklistProfile | undefined {
  if (!input) return undefined;
  const output: BlocklistProfile = {};
  for (const [key, value] of Object.entries(input)) {
    const cleaned = typeof value === 'string' ? value.trim() : '';
    if (cleaned) (output as Record<string, string>)[key] = cleaned;
  }
  return Object.keys(output).length ? output : undefined;
}

function normalizeIdentifiers(input: BlocklistIdentifier[]): BlocklistIdentifier[] {
  const seen = new Set<string>();
  const identifiers: BlocklistIdentifier[] = [];
  for (const item of input.slice(0, 40)) {
    const type = item?.type as ExtendedBlocklistIdentifierType;
    if (!type || ![
      'emirates_id', 'passport', 'gcc_id', 'national_id', 'driving_license',
      'international_driving_permit', 'trade_license', 'company_registration',
      'tax_registration', 'phone', 'email', 'other'
    ].includes(type)) throw new BlocklistError(`Unsupported blocklist identifier type: ${String(type || '')}.`);
    const value = normalizeBlocklistIdentifier(type, item.value);
    if (!value) continue;
    const issuingCountry = normalizeCountry(item.issuingCountry);
    if (COUNTRY_SENSITIVE_TYPES.has(type) && type === 'passport' && !issuingCountry) {
      throw new BlocklistError('A passport identifier requires its issuing country.');
    }
    const key = `${type}:${value}:${issuingCountry || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    identifiers.push({
      type,
      value,
      ...(issuingCountry ? { issuingCountry } : {}),
      ...(item.expiryDate?.trim() ? { expiryDate: item.expiryDate.trim() } : {}),
      ...(item.label?.trim() ? { label: item.label.trim() } : {})
    });
  }
  if (!identifiers.length) throw new BlocklistError('At least one reliable identifier is required to create a block.');
  return identifiers;
}

function identifiersForEntry(entry: ExtendedBlocklistEntry): BlocklistIdentifier[] {
  if (Array.isArray(entry.identifiers) && entry.identifiers.length) return entry.identifiers;
  const legacyType = entry.identifierType as ExtendedBlocklistIdentifierType;
  if (!legacyType || !entry.identifierValue) return [];
  return [{
    type: legacyType,
    value: entry.identifierValue,
    ...(entry.identifierCountry ? { issuingCountry: entry.identifierCountry } : {})
  }];
}

function sameIdentifier(a: BlocklistIdentifier, b: BlocklistIdentifier): boolean {
  if (a.type !== b.type) return false;
  if (normalizeBlocklistIdentifier(a.type, a.value) !== normalizeBlocklistIdentifier(b.type, b.value)) return false;
  const aCountry = normalizeCountry(a.issuingCountry);
  const bCountry = normalizeCountry(b.issuingCountry);
  // Where either record carries jurisdiction, require it to agree. This
  // avoids treating two passports/licences from different countries as the
  // same person while still supporting older entries that lack country.
  return !aCountry && !bCountry ? true : aCountry === bCountry;
}

async function recordAuditWithRecovery(
  entry: ExtendedBlocklistEntry,
  actor: { uid: string; name: string; role: UserRole },
  recordAudit: RecordAuditFn
) {
  const primary = identifiersForEntry(entry)[0];
  const auditPayload = {
    userId: actor.uid,
    userName: actor.name,
    userRole: actor.role,
    entityType: 'BlocklistEntry',
    entityId: entry.id,
    action: 'create' as const,
    newValue: `${entry.tier} ${entry.subjectType || 'individual'} block on ${primary?.type || entry.identifierType} ${primary?.value || entry.identifierValue}; ${identifiersForEntry(entry).length} identifier(s): ${entry.reason}`,
    reason: entry.reason
  };
  try {
    await recordAudit(auditPayload);
  } catch (auditError: any) {
    const admin = (await import('firebase-admin')).default;
    await admin.firestore().collection(AUDIT_RECOVERY_COLLECTION).doc(`Blocklist_${entry.id}`).set({
      id: `Blocklist_${entry.id}`,
      status: 'pending',
      auditPayload,
      error: String(auditError?.message || auditError || 'Audit write failed'),
      createdAt: new Date().toISOString()
    }, { merge: true }).catch(recoveryError => {
      console.error('[blocklist] entry committed but audit recovery persistence failed:', recoveryError);
    });
    // A committed security block must never be reported to the operator as
    // "save failed" merely because the secondary audit writer was down.
    console.error(`[blocklist] ${entry.id} committed; audit queued for recovery.`);
  }
}

export interface CreateBlocklistEntryInput {
  /** Legacy single-identifier fields remain accepted for old callers. */
  identifierType?: ExtendedBlocklistIdentifierType;
  identifierValue?: string;
  identifierCountry?: string;
  subjectType?: BlocklistSubjectType;
  identifiers?: BlocklistIdentifier[];
  profile?: BlocklistProfile;
  customerName?: string;
  tier: BlocklistTier;
  reason: string;
  conditionalNote?: string;
  createdBy: string;
  createdByName: string;
  createdByRole: UserRole;
}

export async function createBlocklistEntry(input: CreateBlocklistEntryInput, recordAudit: RecordAuditFn): Promise<ExtendedBlocklistEntry> {
  if (!input.reason || !input.reason.trim()) throw new BlocklistError('A reason is required to create a block.');
  if (!['full', 'conditional'].includes(input.tier)) throw new BlocklistError('Block tier must be full or conditional.');
  if (input.tier === 'conditional' && !input.conditionalNote?.trim()) {
    throw new BlocklistError('A conditional block requires a note describing the exception/approval condition.');
  }

  const rawIdentifiers: BlocklistIdentifier[] = Array.isArray(input.identifiers) ? input.identifiers : [];
  if (input.identifierType && input.identifierValue) {
    rawIdentifiers.unshift({
      type: input.identifierType,
      value: input.identifierValue,
      issuingCountry: input.identifierCountry
    });
  }
  const identifiers = normalizeIdentifiers(rawIdentifiers);
  const primary = identifiers[0];
  const subjectType: BlocklistSubjectType = input.subjectType === 'company' ? 'company' : 'individual';
  const profile = normalizeProfile(input.profile);
  const displayName = String(
    input.customerName || profile?.fullName || profile?.legalName || profile?.tradeName || ''
  ).trim() || undefined;

  const id = await issueNextNumber('BlocklistEntry');
  const now = new Date().toISOString();
  const entry: ExtendedBlocklistEntry = {
    id,
    identifierType: primary.type as any,
    identifierValue: primary.value,
    identifierCountry: primary.issuingCountry,
    customerName: displayName,
    subjectType,
    identifiers,
    profile,
    tier: input.tier,
    reason: input.reason.trim(),
    conditionalNote: input.conditionalNote?.trim(),
    status: 'active',
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now
  };

  const admin = (await import('firebase-admin')).default;
  const db = admin.firestore();
  await runDurableTransaction(async tx => {
    const allSnap = await tx.get(db.collection('blocklist_entries'));
    for (const doc of allSnap.docs) {
      const existing = doc.data() as ExtendedBlocklistEntry;
      if (existing.status !== 'active') continue;
      const overlap = identifiers.some(candidate => identifiersForEntry(existing).some(current => sameIdentifier(candidate, current)));
      if (overlap) {
        throw new BlocklistError(`An active block already exists with one of these identifiers (${existing.id}).`);
      }
    }
    tx.create(db.collection('blocklist_entries').doc(id), entry as unknown as FirebaseFirestore.DocumentData);
    return entry;
  });

  await recordAuditWithRecovery(entry, { uid: input.createdBy, name: input.createdByName, role: input.createdByRole }, recordAudit);
  return entry;
}

/** Exact identifier lookup across both legacy single-key entries and the new multi-identifier profile. */
export async function checkBlocklist(
  identifierType: ExtendedBlocklistIdentifierType,
  identifierValue: string,
  identifierCountry?: string
): Promise<ExtendedBlocklistEntry | null> {
  if (!identifierValue?.trim()) return null;
  const candidate: BlocklistIdentifier = {
    type: identifierType,
    value: normalizeBlocklistIdentifier(identifierType, identifierValue),
    issuingCountry: normalizeCountry(identifierCountry)
  };
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('blocklist_entries').get();
  return snap.docs
    .map((d: any) => d.data() as ExtendedBlocklistEntry)
    .find(entry => entry.status === 'active' && identifiersForEntry(entry).some(current => sameIdentifier(candidate, current))) || null;
}

export async function listBlocklistEntries(): Promise<ExtendedBlocklistEntry[]> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('blocklist_entries').get();
  return snap.docs.map((d: any) => d.data() as ExtendedBlocklistEntry).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export interface RequestUnblockInput {
  entryId: string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

export async function requestUnblock(input: RequestUnblockInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('blocklist_entries').doc(input.entryId).get();
  if (!snap.exists) throw new BlocklistError(`Blocklist entry ${input.entryId} not found.`);
  const entry = snap.data() as ExtendedBlocklistEntry;
  if (entry.status !== 'active') throw new BlocklistError(`This entry is already ${entry.status}.`);
  if (!input.reason?.trim()) throw new BlocklistError('A reason is required to request removal of this block.');

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

registerApprovalHandler('BlocklistEntry', 'unblock', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const entryId = request.payload.entryId as string;
  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('blocklist_entries').doc(entryId);
  const now = new Date().toISOString();

  const entry = await runDurableTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BlocklistError(`Blocklist entry ${entryId} not found.`);
    const current = snap.data() as ExtendedBlocklistEntry;
    if (current.status !== 'active') throw new BlocklistError(`Blocklist entry ${entryId} is already ${current.status}.`);
    tx.set(ref, { status: 'removed', removedAt: now, removedBy: decider.uid, removedByName: decider.name }, { merge: true });
    return { ...current, status: 'removed' as const, removedAt: now, removedBy: decider.uid, removedByName: decider.name };
  });

  const primary = identifiersForEntry(entry)[0];
  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'BlocklistEntry',
    entityId: entryId,
    action: 'approval',
    newValue: `Unblock approved for ${primary?.type || entry.identifierType} ${primary?.value || entry.identifierValue}.`,
    reason: request.reason
  });
});
