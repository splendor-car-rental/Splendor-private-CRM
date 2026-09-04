import admin from 'firebase-admin';
import { createDurable, updateDurable, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import type { RecordAuditFn } from './businessRules.js';
import type { UserRole } from '../types/index.js';

// ----------------------------------------------------
// PROCUREMENT APPROVAL ENGINE (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// Rule 85 ("منشئ الحركة لا يعتمد حركته بنفسه" -- the creator of a movement
// never approves their own movement) applies to roughly fifteen different
// workflows across this spec: PO creation/amendment/cancellation, supplier
// payments (post-paid and advance), advance increases, quote selection,
// offset requests, customer refunds, debt corrections/cancellations,
// employee expense approval, supplier-invoice value-variance approval,
// operational-expense approval, and vehicle-reservation-severity approval
// before handover. Rather than build fifteen near-identical
// request/approve/apply systems, this is ONE generic engine (the same
// Segregation-of-Duties primitive already proven in
// src/server/approvals.ts for Phase 23's Business Rules Engine, generalized
// so any procurement workflow can reuse it) plus a small plugin registry:
// each entity module (purchaseOrders.ts, supplierPayments.ts, ...) registers
// its own "what actually happens when this gets approved" handler at
// load time, keeping this file itself fully decoupled from any specific
// entity's business logic.

export interface ProcurementApprovalRequest {
  id: string; // PAPR-000001
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedByName?: string;
  decidedByRole?: string;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
}

export class ProcurementApprovalError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'ProcurementApprovalError';
  }
}

export interface ProcurementApprovalActor {
  uid: string;
  name: string;
  role: UserRole;
}

type ApprovalHandler = (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => Promise<void>;

const handlerRegistry = new Map<string, ApprovalHandler>();

function handlerKey(entityType: string, action: string): string {
  return `${entityType}:${action}`;
}

/** Called once, at module load, by each entity module (purchaseOrders.ts etc.) to register what actually happens when its own request type is approved. */
export function registerApprovalHandler(entityType: string, action: string, handler: ApprovalHandler): void {
  handlerRegistry.set(handlerKey(entityType, action), handler);
}

export interface CreateProcurementApprovalInput {
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
  reason: string;
}

/** Creates a pending approval request. `reason` is mandatory -- every workflow in this spec requires a stated reason before anything can be requested. */
export async function createProcurementApproval(input: CreateProcurementApprovalInput, recordAudit: RecordAuditFn): Promise<ProcurementApprovalRequest> {
  if (!input.reason || !input.reason.trim()) {
    throw new ProcurementApprovalError('A reason is required to request this action.');
  }

  const id = await issueNextNumber('ProcurementApproval');
  const now = new Date().toISOString();
  const request: ProcurementApprovalRequest = {
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: input.payload,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason,
    status: 'pending',
    createdAt: now
  };

  await createDurable('procurement_approvals', request as unknown as { id: string });

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: input.entityType,
    entityId: input.entityId,
    action: 'approval',
    newValue: `Requested ${input.action} (${id}): ${JSON.stringify(input.payload)}`,
    reason: input.reason
  });

  return request;
}

/**
 * Approves or rejects a pending request. Enforces Segregation of Duties at
 * the data layer: the decider can never be the same person who requested
 * the action, even if they hold an eligible role. On approval, looks up and
 * runs the registered handler for (entityType, action) -- if none is
 * registered, the decision is rejected with a clear error rather than
 * silently marking something "approved" that nothing will ever act on.
 */
export async function decideProcurementApproval(
  id: string,
  decision: 'approved' | 'rejected',
  note: string,
  decider: ProcurementApprovalActor,
  recordAudit: RecordAuditFn
): Promise<ProcurementApprovalRequest> {
  if (!note || !note.trim()) {
    throw new ProcurementApprovalError('A decision note is required.');
  }

  const db = admin.firestore();
  const ref = db.collection('procurement_approvals').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new ProcurementApprovalError('Approval request not found.');
  }
  const request = snap.data() as ProcurementApprovalRequest;

  if (request.status !== 'pending') {
    throw new ProcurementApprovalError(`This request has already been ${request.status}.`);
  }
  if (request.requestedBy === decider.uid) {
    throw new ProcurementApprovalError('You cannot decide your own request -- a different authorized person must approve or reject it.');
  }

  if (decision === 'approved') {
    const handler = handlerRegistry.get(handlerKey(request.entityType, request.action));
    if (!handler) {
      throw new ProcurementApprovalError(`No approval handler registered for ${request.entityType}:${request.action}.`);
    }
  }

  const now = new Date().toISOString();
  const decided: ProcurementApprovalRequest = {
    ...request,
    status: decision,
    decidedBy: decider.uid,
    decidedByName: decider.name,
    decidedByRole: decider.role,
    decisionNote: note,
    decidedAt: now
  };
  await updateDurable('procurement_approvals', id, decided as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: request.entityType,
    entityId: request.entityId,
    action: 'approval',
    newValue: `${decision.toUpperCase()} (${id}): ${request.action}`,
    reason: note
  });

  if (decision === 'approved') {
    const handler = handlerRegistry.get(handlerKey(request.entityType, request.action))!;
    await handler(decided, decider, recordAudit);
  }

  return decided;
}

export async function listProcurementApprovals(status?: 'pending' | 'approved' | 'rejected', entityType?: string): Promise<ProcurementApprovalRequest[]> {
  const db = admin.firestore();
  const snap = await db.collection('procurement_approvals').get();
  let all = snap.docs.map((d) => d.data() as ProcurementApprovalRequest);
  if (status) all = all.filter((r) => r.status === status);
  if (entityType) all = all.filter((r) => r.entityType === entityType);
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)).slice(0, 500);
}

export async function getProcurementApproval(id: string): Promise<ProcurementApprovalRequest | null> {
  const snap = await admin.firestore().collection('procurement_approvals').doc(id).get();
  return snap.exists ? (snap.data() as ProcurementApprovalRequest) : null;
}
