import admin from 'firebase-admin';
import { createDurable, updateDurable, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { applyRuleValue, RuleChangeActor, RecordAuditFn } from './businessRules';
import { canDecideApproval } from '../config/businessRules';
import type { ApprovalRequest, ApprovalRequestStatus, ApprovalRequestType, UserRole } from '../types';

// ----------------------------------------------------
// FOUR-EYES APPROVAL + SEGREGATION OF DUTIES (Phase 23.2)
// IMMUTABLE APPROVAL HISTORY (Phase 23.3)
// ----------------------------------------------------
// A pending request records Who -> What -> When -> Why -> Before -> After;
// a decision appends Decision -> Decided-by -> Decided-when -> Decision
// note. Once decided, a request is never edited or deleted again -- this
// module rejects any second decide attempt on the same request
// (`status !== 'pending'` check below) rather than allowing an overwrite.
//
// Approval requests are read directly from Firestore rather than through
// the in-memory globalStore cache the rest of server.ts uses for
// high-traffic entities -- this collection is low-volume by nature (a
// governance action, not a customer-facing one) and approval state must
// never be served stale, so a direct read is the safer choice here.

export class ApprovalError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalError';
  }
}

export interface CreateApprovalRequestInput {
  type: ApprovalRequestType;
  entityType: string;
  entityId: string;
  fieldPath?: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
  reason: string;
  beforeValue: number | boolean | string | null;
  afterValue: number | boolean | string | null;
}

/** Creates a pending approval request. `reason` is mandatory -- this is the "mandatory reason for overrides" control. */
export async function createApprovalRequest(input: CreateApprovalRequestInput, recordAudit: RecordAuditFn): Promise<ApprovalRequest> {
  if (!input.reason || !input.reason.trim()) {
    throw new ApprovalError('A reason is required to request this change.');
  }

  const id = await issueNextNumber('ApprovalRequest');
  const now = new Date().toISOString();
  const request: ApprovalRequest = {
    id,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    fieldPath: input.fieldPath,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason,
    beforeValue: input.beforeValue,
    afterValue: input.afterValue,
    status: 'pending',
    createdAt: now
  };

  await createDurable('approval_requests', request as unknown as { id: string });

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: input.entityType,
    entityId: input.entityId,
    action: 'rule_change',
    previousValue: JSON.stringify(input.beforeValue),
    newValue: JSON.stringify(input.afterValue),
    reason: `Approval requested (${id}): ${input.reason}`
  });

  return request;
}

/**
 * Approves or rejects a pending request. Enforces Four-Eyes / Segregation
 * of Duties at the data layer, not just a role check: the decider can never
 * be the same person who requested the change, even if they hold an
 * eligible decider role (e.g. an Admin cannot approve their own request --
 * a DIFFERENT Admin or the CEO must). On approval of a 'rule_change'
 * request, applies the new value through the exact same versioned writer
 * every other rule change goes through.
 */
export async function decideApprovalRequest(
  id: string,
  decision: Exclude<ApprovalRequestStatus, 'pending'>,
  note: string,
  decider: RuleChangeActor,
  recordAudit: RecordAuditFn
): Promise<ApprovalRequest> {
  if (!note || !note.trim()) {
    throw new ApprovalError('A decision note is required.');
  }
  if (!canDecideApproval(decider.role)) {
    throw new ApprovalError('You do not have permission to decide approval requests.');
  }

  const db = admin.firestore();
  const ref = db.collection('approval_requests').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new ApprovalError('Approval request not found.');
  }
  const request = snap.data() as ApprovalRequest;

  if (request.status !== 'pending') {
    throw new ApprovalError(`This request has already been ${request.status}.`);
  }
  if (request.requestedBy === decider.uid) {
    throw new ApprovalError('You cannot decide your own request -- a different authorized person must approve or reject it.');
  }

  const now = new Date().toISOString();
  const decided: ApprovalRequest = {
    ...request,
    status: decision,
    decidedBy: decider.uid,
    decidedByName: decider.name,
    decidedByRole: decider.role,
    decisionNote: note,
    decidedAt: now
  };
  await updateDurable('approval_requests', id, decided as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: request.entityType,
    entityId: request.entityId,
    action: 'approval_decision',
    previousValue: JSON.stringify(request.beforeValue),
    newValue: JSON.stringify(request.afterValue),
    reason: `${decision.toUpperCase()} (request ${id}): ${note}`
  });

  if (decision === 'approved' && request.type === 'rule_change' && request.afterValue !== null && request.afterValue !== undefined) {
    await applyRuleValue(request.entityId, request.afterValue, `Approved override (request ${id}): ${note}`, decider, recordAudit, id);
  }

  return decided;
}

/**
 * Filters and sorts in JS rather than with Firestore query operators
 * (orderBy/where) -- this collection is low-volume by nature (a governance
 * action, not a customer-facing one), so a plain collection.get() avoids
 * requiring a composite index for the status+createdAt combination and
 * keeps this function portable across every Firestore-like backing store
 * this codebase already runs against (real Firestore, the local emulator,
 * and the in-memory mocks the test suite uses for HTTP-level route tests).
 */
export async function listApprovalRequests(status?: ApprovalRequestStatus): Promise<ApprovalRequest[]> {
  const db = admin.firestore();
  const snap = await db.collection('approval_requests').get();
  const all = snap.docs.map((d) => d.data() as ApprovalRequest);
  const filtered = status ? all.filter((r) => r.status === status) : all;
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)).slice(0, 200);
}
