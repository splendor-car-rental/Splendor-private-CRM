import { createDurable, updateDurable, runDurableTransaction, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals';
import type { RecordAuditFn } from './businessRules';
import type { CustomerCreditBalance, CustomerCreditBalanceSource, CustomerRefundRequest, ProcurementPaymentMethod, UserRole } from '../types';

// ----------------------------------------------------
// CUSTOMER CREDIT BALANCES & REFUNDS (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// A customer credit balance (from an overpayment, a cancellation refund
// due, or a goodwill adjustment) is never revenue and is never
// automatically used or refunded -- it just sits on the customer's record
// until a human explicitly decides what to do with it. Booking one is a
// financial fact ("Splendor now owes this customer money"), so it goes
// through the same Segregation-of-Duties approval as everything else.
// Refunding it is never a direct action by operations staff -- always
// request -> review -> approval, and a refund can only be requested against
// money actually recorded as owed (an existing, open credit balance),
// never invented on the spot. A refund can be partial, leaving the
// remainder of the credit balance open for later use.

export class CustomerRefundError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerRefundError';
  }
}

export interface RequestCustomerCreditBalanceInput {
  customerId: string;
  amount: number;
  source: CustomerCreditBalanceSource;
  sourceOther?: string;
  relatedContractId?: string;
  recordedBy: string;
  recordedByName: string;
  recordedByRole: UserRole;
  reason: string;
}

export async function requestCustomerCreditBalance(input: RequestCustomerCreditBalanceInput, recordAudit: RecordAuditFn): Promise<{ creditBalance: CustomerCreditBalance; approvalRequestId: string }> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new CustomerRefundError('A credit balance requires an amount greater than zero.');
  }
  if (input.source === 'other' && !input.sourceOther?.trim()) {
    throw new CustomerRefundError('Selecting "other" as the credit balance source requires a description.');
  }

  const id = await issueNextNumber('CustomerCreditBalance');
  const now = new Date().toISOString();
  const creditBalance: CustomerCreditBalance = {
    id,
    customerId: input.customerId,
    amount: input.amount,
    originalAmount: input.amount,
    source: input.source,
    sourceOther: input.sourceOther,
    relatedContractId: input.relatedContractId,
    status: 'open',
    createdAt: now,
    updatedAt: now
  };
  await createDurable('customer_credit_balances', creditBalance as unknown as { id: string });

  await recordAudit({
    userId: input.recordedBy,
    userName: input.recordedByName,
    userRole: input.recordedByRole,
    entityType: 'CustomerCreditBalance',
    entityId: id,
    action: 'create',
    newValue: `Requested credit balance for customer ${input.customerId}: ${input.amount.toLocaleString()} AED (${input.source}). Never revenue -- stays as credit until used or refunded.`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'CustomerCreditBalance',
    entityId: id,
    action: 'approve_credit_balance',
    payload: { creditBalanceId: id },
    requestedBy: input.recordedBy,
    requestedByName: input.recordedByName,
    requestedByRole: input.recordedByRole,
    reason: input.reason
  }, recordAudit);

  return { creditBalance, approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('CustomerCreditBalance', 'approve_credit_balance', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'CustomerCreditBalance',
    entityId: request.entityId,
    action: 'approval',
    newValue: `Credit balance ${request.entityId} confirmed.`,
    reason: request.reason
  });
});

async function loadCustomerCreditBalance(id: string): Promise<CustomerCreditBalance> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('customer_credit_balances').doc(id).get();
  if (!snap.exists) throw new CustomerRefundError(`Credit balance ${id} not found.`);
  return snap.data() as CustomerCreditBalance;
}

export interface RequestCustomerRefundInput {
  customerId: string;
  creditBalanceId: string;
  amount: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

/** Never a direct action by operations staff -- always request -> review -> approval, and only against money already recorded as an open credit balance. */
export async function requestCustomerRefund(input: RequestCustomerRefundInput, recordAudit: RecordAuditFn): Promise<{ refundRequest: CustomerRefundRequest; approvalRequestId: string }> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new CustomerRefundError('A refund requires an amount greater than zero.');
  }

  const creditBalance = await loadCustomerCreditBalance(input.creditBalanceId);
  if (creditBalance.customerId !== input.customerId) {
    throw new CustomerRefundError('This credit balance does not belong to the specified customer.');
  }
  if (creditBalance.status !== 'open' && creditBalance.status !== 'partially_used') {
    throw new CustomerRefundError(`This credit balance is ${creditBalance.status} and cannot be refunded from.`);
  }
  if (input.amount > creditBalance.amount) {
    throw new CustomerRefundError(`Refund amount (${input.amount.toLocaleString()}) exceeds the remaining credit balance (${creditBalance.amount.toLocaleString()}).`);
  }

  const id = await issueNextNumber('CustomerRefundRequest');
  const now = new Date().toISOString();
  const refundRequest: CustomerRefundRequest = {
    id,
    customerId: input.customerId,
    creditBalanceId: input.creditBalanceId,
    amount: input.amount,
    reason: input.reason,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedAt: now,
    status: 'pending_approval'
  };
  await createDurable('customer_refund_requests', refundRequest as unknown as { id: string });

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'CustomerRefundRequest',
    entityId: id,
    action: 'create',
    newValue: `Requested refund of ${input.amount.toLocaleString()} AED to customer ${input.customerId} from credit balance ${input.creditBalanceId}.`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'CustomerRefundRequest',
    entityId: id,
    action: 'approve_refund',
    payload: { refundRequestId: id },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { refundRequest, approvalRequestId: approvalRequest.id };
}

async function loadCustomerRefundRequest(id: string): Promise<CustomerRefundRequest> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('customer_refund_requests').doc(id).get();
  if (!snap.exists) throw new CustomerRefundError(`Refund request ${id} not found.`);
  return snap.data() as CustomerRefundRequest;
}

// The credit balance is "spent" at approval time, not execution time -- the
// comment here used to claim this prevents two concurrently-approved refund
// requests from together overdrawing the same credit balance, but the actual
// read (loadCustomerCreditBalance) and write (updateDurable) were two
// separate, non-transactional calls: two refund requests approved moments
// apart against the SAME credit balance could both read the same
// creditBalance.amount and both compute their own "remaining", and the
// second write would silently overwrite the first's decrement -- the
// balance could be left overdrawn rather than fully spent. Both documents
// are now read and written inside a single transaction, so a concurrent
// approval against the same credit balance is forced to retry against the
// up-to-date amount.
registerApprovalHandler('CustomerRefundRequest', 'approve_refund', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const id = request.payload.refundRequestId as string;
  const admin = (await import('firebase-admin')).default;
  const refundRef = admin.firestore().collection('customer_refund_requests').doc(id);
  const now = new Date().toISOString();

  const { refundRequest } = await runDurableTransaction(async (tx) => {
    const refundSnap = await tx.get(refundRef);
    if (!refundSnap.exists) throw new CustomerRefundError(`Refund request ${id} not found.`);
    const refundRequest = refundSnap.data() as CustomerRefundRequest;
    if (refundRequest.status !== 'pending_approval') {
      throw new CustomerRefundError(`Refund request ${id} has already been ${refundRequest.status}.`);
    }

    const creditBalanceRef = refundRequest.creditBalanceId
      ? admin.firestore().collection('customer_credit_balances').doc(refundRequest.creditBalanceId)
      : null;
    const creditBalanceSnap = creditBalanceRef ? await tx.get(creditBalanceRef) : null;
    if (creditBalanceRef && (!creditBalanceSnap || !creditBalanceSnap.exists)) {
      throw new CustomerRefundError(`Credit balance ${refundRequest.creditBalanceId} not found.`);
    }

    tx.set(refundRef, {
      status: 'approved',
      decidedBy: decider.uid,
      decidedByName: decider.name,
      decidedAt: now,
      decisionNote: request.decisionNote
    }, { merge: true });

    if (creditBalanceRef && creditBalanceSnap) {
      const creditBalance = creditBalanceSnap.data() as CustomerCreditBalance;
      const remaining = Math.round((creditBalance.amount - refundRequest.amount) * 100) / 100;
      tx.set(creditBalanceRef, {
        amount: remaining,
        status: remaining <= 0 ? 'refunded' : 'partially_used',
        updatedAt: now
      }, { merge: true });
    }

    return { refundRequest };
  });

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'CustomerRefundRequest',
    entityId: id,
    action: 'approval',
    newValue: `Refund ${id} approved: ${refundRequest.amount.toLocaleString()} AED to customer ${refundRequest.customerId}.`,
    reason: request.reason
  });
});

export interface MarkCustomerRefundExecutedInput {
  refundRequestId: string;
  paymentMethod: ProcurementPaymentMethod;
  actor: ProcurementApprovalActor;
}

/** Records that an approved refund's funds were actually sent -- a separate, later fact from the approval decision itself. */
export async function markCustomerRefundExecuted(input: MarkCustomerRefundExecutedInput, recordAudit: RecordAuditFn): Promise<CustomerRefundRequest> {
  const refundRequest = await loadCustomerRefundRequest(input.refundRequestId);
  if (refundRequest.status !== 'approved') {
    throw new CustomerRefundError(`Refund request ${input.refundRequestId} must be approved before it can be executed (current status: ${refundRequest.status}).`);
  }

  const now = new Date().toISOString();
  await updateDurable('customer_refund_requests', refundRequest.id, {
    status: 'executed',
    executedBy: input.actor.uid,
    executedByName: input.actor.name,
    executedAt: now,
    paymentMethod: input.paymentMethod
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.actor.uid,
    userName: input.actor.name,
    userRole: input.actor.role,
    entityType: 'CustomerRefundRequest',
    entityId: refundRequest.id,
    action: 'update',
    newValue: `Refund ${refundRequest.id} executed via ${input.paymentMethod}: ${refundRequest.amount.toLocaleString()} AED to customer ${refundRequest.customerId}.`
  });

  return { ...refundRequest, status: 'executed', executedBy: input.actor.uid, executedByName: input.actor.name, executedAt: now, paymentMethod: input.paymentMethod };
}
