import { createDurable, updateDurable, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { TARS_DEADLINE_HOURS } from '../config/procurement.js';
import type { RecordAuditFn } from './businessRules.js';
import type { TarsRecord, UserRole } from '../types/index.js';

// ----------------------------------------------------
// TARS (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// The real deadline is TARS_DEADLINE_HOURS (3, from spec) after the
// ACTUAL SIGNED CUSTOMER CONTRACT time -- never from mere TARS listing or
// vehicle availability. A supplier's TARS-transfer delay never blocks
// Splendor from operating a vehicle already in hand: nothing in this
// module (or anywhere else in this codebase) gates a handover or contract
// on TARS status, by design -- TARS delay is tracked purely for
// accountability and fine attribution, in parallel with, never in
// series with, actual operations. Execution/return/closing timestamps are
// always the real current time when recorded, never a client-supplied
// value -- so a delay can never be edited away after the fact.

export class TarsError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'TarsError';
  }
}

export interface CreateTarsRecordInput {
  operationId?: string;
  contractId: string;
  vehicleId?: string;
  contractSignedAt: string;
  createdBy: string;
  createdByName: string;
  createdByRole: UserRole;
}

export async function createTarsRecord(input: CreateTarsRecordInput, recordAudit: RecordAuditFn): Promise<TarsRecord> {
  const signed = new Date(input.contractSignedAt);
  if (Number.isNaN(signed.getTime())) {
    throw new TarsError('contractSignedAt must be a valid date/time.');
  }

  const id = await issueNextNumber('TarsRecord');
  const now = new Date().toISOString();
  const deadlineAt = new Date(signed.getTime() + TARS_DEADLINE_HOURS * 60 * 60 * 1000).toISOString();
  const record: TarsRecord = {
    id,
    operationId: input.operationId,
    contractId: input.contractId,
    vehicleId: input.vehicleId,
    contractSignedAt: input.contractSignedAt,
    deadlineAt,
    escalationLevel: 'none',
    createdAt: now,
    updatedAt: now
  };
  await createDurable('tars_records', record as unknown as { id: string });

  await recordAudit({
    userId: input.createdBy,
    userName: input.createdByName,
    userRole: input.createdByRole,
    entityType: 'TarsRecord',
    entityId: id,
    action: 'create',
    newValue: `TARS deadline opened for contract ${input.contractId}: due ${deadlineAt} (${TARS_DEADLINE_HOURS}h from signed contract time, never from TARS listing).`
  });

  return record;
}

async function loadTarsRecord(id: string): Promise<TarsRecord> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('tars_records').doc(id).get();
  if (!snap.exists) throw new TarsError(`TARS record ${id} not found.`);
  return snap.data() as TarsRecord;
}

export interface RecordTarsExecutionInput {
  tarsRecordId: string;
  proofDocumentIds?: string[];
  actor: { uid: string; name: string; role: UserRole };
}

/** Records the real TARS transfer execution. The timestamp is always "now" -- never a value supplied by the caller -- so a delay can never be hidden by backdating. */
export async function recordTarsExecution(input: RecordTarsExecutionInput, recordAudit: RecordAuditFn): Promise<TarsRecord> {
  const record = await loadTarsRecord(input.tarsRecordId);
  if (record.executedAt) throw new TarsError(`TARS record ${input.tarsRecordId} already has a recorded execution.`);

  const now = new Date().toISOString();
  const executedAtMs = new Date(now).getTime();
  const deadlineMs = new Date(record.deadlineAt).getTime();
  const isDelayed = executedAtMs > deadlineMs;
  const delayMinutes = isDelayed ? Math.round((executedAtMs - deadlineMs) / 60000) : 0;
  // Rule: the vehicle's supplier is responsible for their own TARS-transfer
  // delay fine; the same structure applies to a Splendor-owned vehicle
  // (no operationId -- no external supplier to attribute the delay to) --
  // computed from data already on the record, never guessed.
  const fineResponsibility: TarsRecord['fineResponsibility'] | undefined = isDelayed ? (record.operationId ? 'supplier' : 'splendor') : undefined;

  const updates: Partial<TarsRecord> = {
    executedAt: now,
    executedBy: input.actor.uid,
    executedByName: input.actor.name,
    proofDocumentIds: input.proofDocumentIds,
    isDelayed,
    delayMinutes,
    fineResponsibility,
    supplierListingDelay: isDelayed,
    updatedAt: now
  };
  await updateDurable('tars_records', record.id, updates as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.actor.uid,
    userName: input.actor.name,
    userRole: input.actor.role,
    entityType: 'TarsRecord',
    entityId: record.id,
    action: 'update',
    newValue: isDelayed
      ? `TARS transfer executed ${delayMinutes} minutes late (deadline ${record.deadlineAt}). Fine responsibility: ${fineResponsibility}. This delay does NOT block Splendor's own operation of the vehicle.`
      : `TARS transfer executed on time (deadline ${record.deadlineAt}).`
  });

  return { ...record, ...updates } as TarsRecord;
}

export interface RecordReturnToSupplierInput {
  tarsRecordId: string;
  actor: { uid: string; name: string; role: UserRole };
}

export async function recordReturnToSupplier(input: RecordReturnToSupplierInput, recordAudit: RecordAuditFn): Promise<TarsRecord> {
  const record = await loadTarsRecord(input.tarsRecordId);
  if (record.returnedToSupplierAt) throw new TarsError(`TARS record ${input.tarsRecordId} already has a recorded return to supplier.`);

  const now = new Date().toISOString();
  await updateDurable('tars_records', record.id, { returnedToSupplierAt: now, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.actor.uid,
    userName: input.actor.name,
    userRole: input.actor.role,
    entityType: 'TarsRecord',
    entityId: record.id,
    action: 'update',
    newValue: `Vehicle returned to supplier under TARS record ${record.id}.`
  });

  return { ...record, returnedToSupplierAt: now, updatedAt: now };
}

// Starter threshold -- NEEDS BUSINESS REVIEW: the spec requires the return
// leg to be monitored for its own closing delay but does not give a real
// number the way it did for the 3-hour TARS deadline or the 1h/6h late-fee
// rule. 24 hours is a conservative, clearly-labeled default.
const RETURN_CLOSING_DELAY_THRESHOLD_HOURS = 24;

export interface CloseTarsReturnInput {
  tarsRecordId: string;
  actor: { uid: string; name: string; role: UserRole };
}

export async function closeTarsReturn(input: CloseTarsReturnInput, recordAudit: RecordAuditFn): Promise<TarsRecord> {
  const record = await loadTarsRecord(input.tarsRecordId);
  if (!record.returnedToSupplierAt) throw new TarsError('Cannot close a return that was never recorded as returned to the supplier.');
  if (record.returnClosedAt) throw new TarsError(`TARS record ${input.tarsRecordId} already has a recorded return closing.`);

  const now = new Date().toISOString();
  const gapHours = (new Date(now).getTime() - new Date(record.returnedToSupplierAt).getTime()) / (60 * 60 * 1000);
  const closingDelayed = gapHours > RETURN_CLOSING_DELAY_THRESHOLD_HOURS;

  await updateDurable('tars_records', record.id, { returnClosedAt: now, closingDelayed, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.actor.uid,
    userName: input.actor.name,
    userRole: input.actor.role,
    entityType: 'TarsRecord',
    entityId: record.id,
    action: 'update',
    newValue: `Return closed for TARS record ${record.id}${closingDelayed ? ' -- closing was delayed' : ''}.`
  });

  return { ...record, returnClosedAt: now, closingDelayed, updatedAt: now };
}

/**
 * Pure monitoring/escalation scan over currently-open TARS records --
 * never blocks anything, only classifies for a human dashboard. Mirrors
 * the same "detection, never enforcement" shape as anomalyDetection.ts.
 */
export function computeTarsEscalations(records: TarsRecord[], now: Date = new Date()): Array<TarsRecord & { escalationLevel: NonNullable<TarsRecord['escalationLevel']> }> {
  const nowMs = now.getTime();
  return records
    .filter((r) => !r.executedAt) // only still-pending transfers need escalation
    .map((r) => {
      const deadlineMs = new Date(r.deadlineAt).getTime();
      const overdueMs = nowMs - deadlineMs;
      let escalationLevel: NonNullable<TarsRecord['escalationLevel']> = 'none';
      if (overdueMs > 0) escalationLevel = 'normal';
      if (overdueMs > TARS_DEADLINE_HOURS * 60 * 60 * 1000) escalationLevel = 'urgent'; // overdue by more than the original deadline window again
      return { ...r, escalationLevel };
    })
    .filter((r) => r.escalationLevel !== 'none');
}
