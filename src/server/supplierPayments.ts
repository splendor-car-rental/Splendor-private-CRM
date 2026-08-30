import { createDurable, updateDurable, runDurableTransaction, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals';
import type { RecordAuditFn } from './businessRules';
import type {
  PurchaseOrder, SupplierPaymentRequest, SupplierPaymentTrack, ProcurementPaymentMethod,
  AdvanceSettlement, ProcurementOperation, UserRole
} from '../types';

// ----------------------------------------------------
// SUPPLIER PAYMENTS: post-verification vs advance tracks (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// Two payment tracks: post_verification (paid only after something on the
// PO has actually been received/verified) and advance (paid ahead of
// verification, by definition). Every payment request goes through the
// same Segregation-of-Duties engine as everything else -- the requester
// can never approve their own payment. An advance is never "topped up" by
// editing the original request: a further advance is always a NEW,
// independent SupplierPaymentRequest linked back via isIncreaseOfRequestId.
// If a PO/operation is cancelled after an advance was paid, the money
// owed back is tracked as an AdvanceSettlement -- its actual terms
// (amountDueToSupplierPerCancellationTerms) are a business/contractual
// judgment call this system cannot compute on its own, so it is always
// supplied by a human, never invented here.

export class SupplierPaymentError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'SupplierPaymentError';
  }
}

async function loadPO(poId: string): Promise<PurchaseOrder> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('purchase_orders').doc(poId).get();
  if (!snap.exists) throw new SupplierPaymentError(`Purchase order ${poId} not found.`);
  return snap.data() as PurchaseOrder;
}

async function loadSupplierPaymentRequest(id: string): Promise<SupplierPaymentRequest> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('supplier_payment_requests').doc(id).get();
  if (!snap.exists) throw new SupplierPaymentError(`Payment request ${id} not found.`);
  return snap.data() as SupplierPaymentRequest;
}

export interface RequestSupplierPaymentInput {
  purchaseOrderId: string;
  operationId?: string;
  track: SupplierPaymentTrack;
  amount: number;
  paymentMethod: ProcurementPaymentMethod;
  paymentMethodOther?: string;
  isIncreaseOfRequestId?: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
  reason: string;
}

export async function requestSupplierPayment(input: RequestSupplierPaymentInput, recordAudit: RecordAuditFn): Promise<{ paymentRequest: SupplierPaymentRequest; approvalRequestId: string }> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new SupplierPaymentError('A payment request requires an amount greater than zero.');
  }
  if (input.paymentMethod === 'other' && !input.paymentMethodOther?.trim()) {
    throw new SupplierPaymentError('Selecting "other" as the payment method requires a description.');
  }

  const po = await loadPO(input.purchaseOrderId);
  if (po.status === 'cancelled') {
    throw new SupplierPaymentError('Cannot request a payment against a fully cancelled purchase order.');
  }

  let operation: ProcurementOperation | undefined;
  if (input.operationId) {
    const line = po.lineItems.find((li) => li.operationId === input.operationId);
    if (!line) throw new SupplierPaymentError(`Operation ${input.operationId} does not belong to purchase order ${po.id}.`);
  }

  if (input.track === 'post_verification') {
    // Paid only after something has actually been verified/received -- never
    // before. A minimal, technically-necessary gate: at least one relevant
    // line item must already be marked received.
    const relevantLines = input.operationId
      ? po.lineItems.filter((li) => li.operationId === input.operationId)
      : po.lineItems;
    const anyReceived = relevantLines.some((li) => li.status === 'received');
    if (!anyReceived) {
      throw new SupplierPaymentError('A post-verification payment requires at least one verified/received line item -- use the advance track if nothing has been received yet.');
    }
  }

  if (input.isIncreaseOfRequestId) {
    if (input.track !== 'advance') {
      throw new SupplierPaymentError('An increase of a prior advance must itself be on the advance track.');
    }
    const originalAdvance = await loadSupplierPaymentRequest(input.isIncreaseOfRequestId);
    if (originalAdvance.track !== 'advance') {
      throw new SupplierPaymentError('isIncreaseOfRequestId must reference a prior advance payment.');
    }
    if (originalAdvance.status !== 'approved' && originalAdvance.status !== 'paid') {
      throw new SupplierPaymentError('Cannot increase an advance that was never approved.');
    }
    if (originalAdvance.purchaseOrderId !== po.id) {
      throw new SupplierPaymentError('The advance being increased belongs to a different purchase order.');
    }
  }

  const id = await issueNextNumber('SupplierPaymentRequest');
  const now = new Date().toISOString();
  const paymentRequest: SupplierPaymentRequest = {
    id,
    purchaseOrderId: po.id,
    operationId: input.operationId,
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    track: input.track,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    paymentMethodOther: input.paymentMethodOther,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedAt: now,
    reason: input.reason,
    status: 'pending_approval',
    isIncreaseOfRequestId: input.isIncreaseOfRequestId
  };

  await createDurable('supplier_payment_requests', paymentRequest as unknown as { id: string });

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'SupplierPaymentRequest',
    entityId: id,
    action: 'create',
    newValue: `Requested ${input.track} payment of ${input.amount.toLocaleString()} AED to ${po.supplierName} (PO ${po.id})${input.isIncreaseOfRequestId ? `, increasing advance ${input.isIncreaseOfRequestId}` : ''}.`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'SupplierPaymentRequest',
    entityId: id,
    action: 'approve_payment',
    payload: { paymentRequestId: id },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { paymentRequest, approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('SupplierPaymentRequest', 'approve_payment', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const id = request.payload.paymentRequestId as string;
  const paymentRequest = await loadSupplierPaymentRequest(id);
  if (paymentRequest.status !== 'pending_approval') {
    throw new SupplierPaymentError(`Payment request ${id} has already been ${paymentRequest.status}.`);
  }

  const now = new Date().toISOString();
  await updateDurable('supplier_payment_requests', id, {
    status: 'approved',
    decidedBy: decider.uid,
    decidedByName: decider.name,
    decidedAt: now,
    decisionNote: request.decisionNote
  } as unknown as Record<string, unknown>);

  if (paymentRequest.operationId) {
    const admin = (await import('firebase-admin')).default;
    const opsSnap = await admin.firestore().collection('procurement_operations').doc(paymentRequest.operationId).get();
    if (opsSnap.exists) {
      const operation = opsSnap.data() as ProcurementOperation;
      await updateDurable('procurement_operations', operation.id, {
        supplierPaymentIds: [...operation.supplierPaymentIds, id],
        updatedAt: now
      } as unknown as Record<string, unknown>);
    }
  }

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'SupplierPaymentRequest',
    entityId: id,
    action: 'approval',
    newValue: `Payment ${id} approved: ${paymentRequest.amount.toLocaleString()} AED (${paymentRequest.track}) to ${paymentRequest.supplierName}.`,
    reason: request.reason
  });
});

export interface MarkSupplierPaymentPaidInput {
  paymentRequestId: string;
  actor: ProcurementApprovalActor;
}

/**
 * Records that an already-approved payment was actually executed (funds
 * sent). This is fact-recording, not a new financial decision -- the
 * authorization already happened at approval.
 *
 * The status guard used to be a plain read-then-write: two concurrent
 * "mark paid" calls could both read status 'approved' and both write
 * 'paid', producing a duplicate audit-log entry (and any future
 * downstream side effect, e.g. a paid-notification) for a single real
 * payment. Guarding the read+write inside one transaction makes the
 * second concurrent call see the already-'paid' status and reject.
 */
export async function markSupplierPaymentPaid(input: MarkSupplierPaymentPaidInput, recordAudit: RecordAuditFn): Promise<SupplierPaymentRequest> {
  const now = new Date().toISOString();
  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('supplier_payment_requests').doc(input.paymentRequestId);

  const paymentRequest = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new SupplierPaymentError(`Payment request ${input.paymentRequestId} not found.`);
    const current = snap.data() as SupplierPaymentRequest;
    if (current.status !== 'approved') {
      throw new SupplierPaymentError(`Payment request ${input.paymentRequestId} must be approved before it can be marked paid (current status: ${current.status}).`);
    }
    tx.set(ref, { status: 'paid', paidAt: now }, { merge: true });
    return { ...current, status: 'paid' as const, paidAt: now };
  });

  await recordAudit({
    userId: input.actor.uid,
    userName: input.actor.name,
    userRole: input.actor.role,
    entityType: 'SupplierPaymentRequest',
    entityId: paymentRequest.id,
    action: 'update',
    newValue: `Payment ${paymentRequest.id} marked as paid (${paymentRequest.amount.toLocaleString()} AED to ${paymentRequest.supplierName}).`
  });

  return paymentRequest;
}

// ----------------------------------------------------
// ADVANCE SETTLEMENT: created when a PO/operation is cancelled or reduced
// after an advance was already paid. amountDueToSupplierPerCancellationTerms
// is always supplied by a human (it depends on that supplier's cancellation
// terms) -- this system never invents that number.
// ----------------------------------------------------

export interface RequestAdvanceSettlementInput {
  purchaseOrderId: string;
  operationId?: string;
  originalAdvanceAmount: number;
  amountDueToSupplierPerCancellationTerms: number;
  deductionsOrFees?: number;
  reason: string;
  createdBy: string;
  createdByName: string;
  createdByRole: UserRole;
}

export async function requestAdvanceSettlement(input: RequestAdvanceSettlementInput, recordAudit: RecordAuditFn): Promise<{ settlement: AdvanceSettlement; approvalRequestId: string }> {
  if (typeof input.originalAdvanceAmount !== 'number' || input.originalAdvanceAmount <= 0) {
    throw new SupplierPaymentError('originalAdvanceAmount must be greater than zero.');
  }
  if (typeof input.amountDueToSupplierPerCancellationTerms !== 'number' || input.amountDueToSupplierPerCancellationTerms < 0) {
    throw new SupplierPaymentError('amountDueToSupplierPerCancellationTerms is required (0 if the supplier retains nothing).');
  }
  const po = await loadPO(input.purchaseOrderId);
  const deductionsOrFees = input.deductionsOrFees ?? 0;
  const amountToBeRefunded = input.originalAdvanceAmount - input.amountDueToSupplierPerCancellationTerms;
  const netRefund = amountToBeRefunded - deductionsOrFees;

  const id = await issueNextNumber('AdvanceSettlement');
  const now = new Date().toISOString();
  const settlement: AdvanceSettlement = {
    id,
    purchaseOrderId: po.id,
    operationId: input.operationId,
    supplierId: po.supplierId,
    originalAdvanceAmount: input.originalAdvanceAmount,
    amountDueToSupplierPerCancellationTerms: input.amountDueToSupplierPerCancellationTerms,
    amountToBeRefunded,
    deductionsOrFees,
    netRefund,
    refundStatus: 'pending',
    reason: input.reason,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now
  };

  await createDurable('advance_settlements', settlement as unknown as { id: string });

  await recordAudit({
    userId: input.createdBy,
    userName: input.createdByName,
    userRole: input.createdByRole,
    entityType: 'AdvanceSettlement',
    entityId: id,
    action: 'create',
    newValue: `Advance settlement for PO ${po.id}: advance ${input.originalAdvanceAmount.toLocaleString()}, due to supplier ${input.amountDueToSupplierPerCancellationTerms.toLocaleString()}, net refund ${netRefund.toLocaleString()} AED.`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'AdvanceSettlement',
    entityId: id,
    action: 'approve_settlement',
    payload: { settlementId: id },
    requestedBy: input.createdBy,
    requestedByName: input.createdByName,
    requestedByRole: input.createdByRole,
    reason: input.reason
  }, recordAudit);

  return { settlement, approvalRequestId: approvalRequest.id };
}

async function loadAdvanceSettlement(id: string): Promise<AdvanceSettlement> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('advance_settlements').doc(id).get();
  if (!snap.exists) throw new SupplierPaymentError(`Advance settlement ${id} not found.`);
  return snap.data() as AdvanceSettlement;
}

registerApprovalHandler('AdvanceSettlement', 'approve_settlement', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const id = request.payload.settlementId as string;
  const settlement = await loadAdvanceSettlement(id);
  if (settlement.refundStatus !== 'pending') {
    throw new SupplierPaymentError(`Advance settlement ${id} is already ${settlement.refundStatus}.`);
  }

  const now = new Date().toISOString();
  await updateDurable('advance_settlements', id, {
    refundStatus: 'in_progress',
    approvedBy: decider.uid,
    approvedByName: decider.name,
    approvedAt: now
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'AdvanceSettlement',
    entityId: id,
    action: 'approval',
    newValue: `Advance settlement ${id} approved: net refund ${settlement.netRefund.toLocaleString()} AED.`,
    reason: request.reason
  });
});

export interface MarkAdvanceSettlementCompletedInput {
  settlementId: string;
  actor: ProcurementApprovalActor;
}

// Same duplicate-completion race as markSupplierPaymentPaid above --
// guarded with a transaction so a second concurrent "mark completed" call
// sees the already-'completed' status and rejects instead of writing a
// duplicate audit entry for the same real refund.
export async function markAdvanceSettlementCompleted(input: MarkAdvanceSettlementCompletedInput, recordAudit: RecordAuditFn): Promise<AdvanceSettlement> {
  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('advance_settlements').doc(input.settlementId);

  const settlement = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new SupplierPaymentError(`Advance settlement ${input.settlementId} not found.`);
    const current = snap.data() as AdvanceSettlement;
    if (current.refundStatus !== 'in_progress') {
      throw new SupplierPaymentError(`Advance settlement ${input.settlementId} must be approved (in_progress) before it can be marked completed (current status: ${current.refundStatus}).`);
    }
    tx.set(ref, { refundStatus: 'completed' }, { merge: true });
    return { ...current, refundStatus: 'completed' as const };
  });

  await recordAudit({
    userId: input.actor.uid,
    userName: input.actor.name,
    userRole: input.actor.role,
    entityType: 'AdvanceSettlement',
    entityId: settlement.id,
    action: 'update',
    newValue: `Advance settlement ${settlement.id} completed: net refund ${settlement.netRefund.toLocaleString()} AED received.`
  });

  return settlement;
}
