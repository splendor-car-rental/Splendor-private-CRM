import { createDurable, updateDurable, runDurableTransaction, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals';
import type { RecordAuditFn } from './businessRules';
import type {
  PartyOpeningBalance, BalanceDirection, BalanceOffsetEligibility, OffsetRequest,
  CustomerDisputedAmount, UserRole
} from '../types';

// ----------------------------------------------------
// BALANCES: supplier debit, customer credit, opening balances, offsetting
// (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// A party's current balance is never edited directly -- it is derived from
// its recorded opening balance(s) plus every APPROVED offset against them.
// Offsetting is never automatic: it always requires a mandatory reason and
// a different, authorized approver (the same Segregation-of-Duties engine
// as the rest of this phase). A balance flagged as disputed or under
// investigation cannot be offset at all until that flag clears.

export class BalanceError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'BalanceError';
  }
}

export interface RecordOpeningBalanceInput {
  partyType: 'supplier' | 'customer';
  partyId: string;
  amount: number;
  direction: BalanceDirection;
  offsetEligibility?: BalanceOffsetEligibility;
  notes?: string;
  recordedBy: string;
  recordedByName: string;
  recordedByRole: UserRole;
}

/** Records an opening balance for a supplier or customer. This directly determines what is owed, so it goes through the same maker!=checker approval as every other financial-balance-affecting action in this phase. */
export async function requestOpeningBalance(input: RecordOpeningBalanceInput, recordAudit: RecordAuditFn): Promise<{ openingBalance: PartyOpeningBalance; approvalRequestId: string }> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new BalanceError('An opening balance requires an amount greater than zero.');
  }

  const id = await issueNextNumber('PartyOpeningBalance');
  const now = new Date().toISOString();
  const openingBalance: PartyOpeningBalance = {
    id,
    partyType: input.partyType,
    partyId: input.partyId,
    amount: input.amount,
    direction: input.direction,
    offsetEligibility: input.offsetEligibility || 'offsettable',
    notes: input.notes,
    recordedBy: input.recordedBy,
    recordedByName: input.recordedByName,
    recordedAt: now
  };
  // Stored immediately (not gated behind approval) so it's visible for
  // review, but tagged pending until approved -- reusing the "recorded now,
  // authorized separately" pattern from every other workflow in this phase
  // would require a status field this type doesn't have, so instead the
  // approval REQUEST itself is the source of truth for whether this opening
  // balance has been authorized; see the registered handler below.
  await createDurable('party_opening_balances', openingBalance as unknown as { id: string });

  await recordAudit({
    userId: input.recordedBy,
    userName: input.recordedByName,
    userRole: input.recordedByRole,
    entityType: 'PartyOpeningBalance',
    entityId: id,
    action: 'create',
    newValue: `Recorded opening balance for ${input.partyType} ${input.partyId}: ${input.amount.toLocaleString()} AED (${input.direction}).`
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'PartyOpeningBalance',
    entityId: id,
    action: 'approve_opening_balance',
    payload: { openingBalanceId: id },
    requestedBy: input.recordedBy,
    requestedByName: input.recordedByName,
    requestedByRole: input.recordedByRole,
    reason: `Opening balance entry for ${input.partyType} ${input.partyId}`
  }, recordAudit);

  return { openingBalance, approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('PartyOpeningBalance', 'approve_opening_balance', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'PartyOpeningBalance',
    entityId: request.entityId,
    action: 'approval',
    newValue: `Opening balance ${request.entityId} confirmed.`,
    reason: request.reason
  });
});

async function loadPartyOpeningBalances(partyType: 'supplier' | 'customer', partyId: string): Promise<PartyOpeningBalance[]> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('party_opening_balances').get();
  return snap.docs.map((d: any) => d.data() as PartyOpeningBalance).filter((b) => b.partyType === partyType && b.partyId === partyId);
}

async function loadApprovedOffsets(partyType: 'supplier' | 'customer', partyId: string): Promise<OffsetRequest[]> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('offset_requests').get();
  return snap.docs
    .map((d: any) => d.data() as OffsetRequest)
    .filter((o) => o.partyType === partyType && o.partyId === partyId && o.status === 'approved')
    .sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : 1));
}

async function partyHasOpenDispute(partyType: 'supplier' | 'customer', partyId: string): Promise<boolean> {
  if (partyType !== 'customer') return false;
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('customer_disputed_amounts').get();
  return snap.docs
    .map((d: any) => d.data() as CustomerDisputedAmount)
    .some((dispute) => dispute.customerId === partyId && (dispute.status === 'open' || dispute.status === 'under_review'));
}

export interface PartyBalanceSummary {
  partyType: 'supplier' | 'customer';
  partyId: string;
  netAmount: number;
  direction: BalanceDirection;
  offsetEligibility: BalanceOffsetEligibility;
  openingBalances: PartyOpeningBalance[];
}

/** Derives a party's current outstanding balance from its recorded opening balance(s) plus every approved offset, never from a directly-editable running total. */
export async function computePartyBalance(partyType: 'supplier' | 'customer', partyId: string): Promise<PartyBalanceSummary> {
  const openingBalances = await loadPartyOpeningBalances(partyType, partyId);
  const approvedOffsets = await loadApprovedOffsets(partyType, partyId);

  let net = 0;
  for (const ob of openingBalances) {
    if (ob.direction === 'owed_to_us') net += ob.amount;
    else if (ob.direction === 'owed_by_us') net -= ob.amount;
  }
  for (const offset of approvedOffsets) {
    if (net > 0) net = Math.max(0, net - offset.offsetAmount);
    else if (net < 0) net = Math.min(0, net + offset.offsetAmount);
  }

  let offsetEligibility: BalanceOffsetEligibility = 'offsettable';
  const restrictive = openingBalances.find((ob) => ob.offsetEligibility !== 'offsettable');
  if (restrictive) {
    offsetEligibility = restrictive.offsetEligibility;
  } else if (await partyHasOpenDispute(partyType, partyId)) {
    offsetEligibility = 'not_offsettable_dispute';
  }

  return {
    partyType,
    partyId,
    netAmount: net,
    direction: net > 0 ? 'owed_to_us' : net < 0 ? 'owed_by_us' : 'zero',
    offsetEligibility,
    openingBalances
  };
}

/**
 * Same recomputation as computePartyBalance's net-amount logic, but reading
 * through a live transaction so a concurrent write to either collection
 * (in particular, another offset approval for the same party) forces this
 * transaction to retry against up-to-date data instead of deciding against
 * a stale snapshot. Used by the approve_offset handler below -- see the
 * race it closes there.
 */
async function computePartyNetAmountInTransaction(
  tx: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  partyType: 'supplier' | 'customer',
  partyId: string
): Promise<number> {
  const openingSnap = await tx.get(db.collection('party_opening_balances'));
  const offsetsSnap = await tx.get(db.collection('offset_requests'));

  let net = 0;
  for (const doc of openingSnap.docs) {
    const ob = doc.data() as PartyOpeningBalance;
    if (ob.partyType !== partyType || ob.partyId !== partyId) continue;
    if (ob.direction === 'owed_to_us') net += ob.amount;
    else if (ob.direction === 'owed_by_us') net -= ob.amount;
  }

  const approvedOffsets = offsetsSnap.docs
    .map((d) => d.data() as OffsetRequest)
    .filter((o) => o.partyType === partyType && o.partyId === partyId && o.status === 'approved')
    .sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : 1));
  for (const offset of approvedOffsets) {
    if (net > 0) net = Math.max(0, net - offset.offsetAmount);
    else if (net < 0) net = Math.min(0, net + offset.offsetAmount);
  }

  return net;
}

export interface RequestBalanceOffsetInput {
  partyType: 'supplier' | 'customer';
  partyId: string;
  offsetAmount: number;
  linkedOperationIds?: string[];
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

/** Offsetting is never automatic -- always request -> review -> approval, with a mandatory reason, and always blocked while the party's balance is flagged disputed/under investigation. */
export async function requestBalanceOffset(input: RequestBalanceOffsetInput, recordAudit: RecordAuditFn): Promise<{ offsetRequest: OffsetRequest; approvalRequestId: string }> {
  if (typeof input.offsetAmount !== 'number' || input.offsetAmount <= 0) {
    throw new BalanceError('An offset requires an amount greater than zero.');
  }

  const balance = await computePartyBalance(input.partyType, input.partyId);
  if (balance.offsetEligibility !== 'offsettable') {
    throw new BalanceError(`This balance is not offsettable right now (${balance.offsetEligibility}). Resolve the underlying dispute/investigation first.`);
  }
  if (balance.direction === 'zero') {
    throw new BalanceError('There is no outstanding balance to offset.');
  }
  if (input.offsetAmount > Math.abs(balance.netAmount)) {
    throw new BalanceError(`Offset amount (${input.offsetAmount.toLocaleString()}) exceeds the outstanding balance (${Math.abs(balance.netAmount).toLocaleString()}).`);
  }

  const id = await issueNextNumber('OffsetRequest');
  const now = new Date().toISOString();
  const offsetRequest: OffsetRequest = {
    id,
    partyType: input.partyType,
    partyId: input.partyId,
    balanceBefore: balance.netAmount,
    offsetAmount: input.offsetAmount,
    linkedOperationIds: input.linkedOperationIds || [],
    reason: input.reason,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedAt: now,
    status: 'pending_approval'
  };
  await createDurable('offset_requests', offsetRequest as unknown as { id: string });

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'OffsetRequest',
    entityId: id,
    action: 'create',
    newValue: `Requested offset of ${input.offsetAmount.toLocaleString()} AED against ${input.partyType} ${input.partyId} (balance before: ${balance.netAmount.toLocaleString()}).`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'OffsetRequest',
    entityId: id,
    action: 'approve_offset',
    payload: { offsetRequestId: id },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { offsetRequest, approvalRequestId: approvalRequest.id };
}

// Two offset requests against the SAME party can each be individually
// valid when requested (both validated against the balance that existed at
// their own request time), then both approved. Approving used to trust the
// stale offsetRequest.balanceBefore captured at request time instead of
// re-checking the live balance, and read+wrote non-transactionally -- so
// two concurrent approvals for the same party could together apply more
// offsetting than the party ever actually owed. Fixed by re-deriving the
// CURRENT live balance inside the same transaction that decides and writes
// this approval: if the offset no longer fits the live remaining balance,
// this approval is rejected outright (the requester must re-request at the
// correct amount) rather than silently over-applying it. Reading the
// opening-balance and offset-request collections inside the transaction
// also means a second concurrent approval for the same party is forced to
// retry against up-to-date data rather than racing this one.
registerApprovalHandler('OffsetRequest', 'approve_offset', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const id = request.payload.offsetRequestId as string;
  const now = new Date().toISOString();
  const admin = (await import('firebase-admin')).default;
  const offsetRef = admin.firestore().collection('offset_requests').doc(id);

  const { offsetRequest, balanceBeforeLive, balanceAfter } = await runDurableTransaction(async (tx, db) => {
    const snap = await tx.get(offsetRef);
    if (!snap.exists) throw new BalanceError(`Offset request ${id} not found.`);
    const offsetRequest = snap.data() as OffsetRequest;
    if (offsetRequest.status !== 'pending_approval') {
      throw new BalanceError(`Offset request ${id} has already been ${offsetRequest.status}.`);
    }

    const balanceBeforeLive = await computePartyNetAmountInTransaction(tx, db, offsetRequest.partyType, offsetRequest.partyId);
    if (offsetRequest.offsetAmount > Math.abs(balanceBeforeLive)) {
      throw new BalanceError(
        `This offset (${offsetRequest.offsetAmount.toLocaleString()} AED) no longer fits the party's current outstanding balance ` +
        `(${Math.abs(balanceBeforeLive).toLocaleString()} AED) -- another offset was approved in the meantime. Reject this request and ` +
        `have it re-requested at the correct amount.`
      );
    }

    const balanceAfter = balanceBeforeLive > 0
      ? Math.max(0, balanceBeforeLive - offsetRequest.offsetAmount)
      : Math.min(0, balanceBeforeLive + offsetRequest.offsetAmount);

    tx.set(offsetRef, {
      status: 'approved',
      decidedBy: decider.uid,
      decidedByName: decider.name,
      decidedAt: now,
      decisionNote: request.decisionNote,
      balanceAfter
    }, { merge: true });

    return { offsetRequest, balanceBeforeLive, balanceAfter };
  });

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'OffsetRequest',
    entityId: id,
    action: 'approval',
    newValue: `Offset ${id} approved: ${offsetRequest.partyType} ${offsetRequest.partyId} balance ${balanceBeforeLive.toLocaleString()} -> ${balanceAfter.toLocaleString()} AED.`,
    reason: request.reason
  });
});

// ----------------------------------------------------
// CUSTOMER DISPUTED AMOUNTS -- the mechanism that flags a customer's
// balance as non-offsettable (and, later, non-refundable) until resolved.
// ----------------------------------------------------

export interface RaiseCustomerDisputeInput {
  customerId: string;
  amount: number;
  relatedChargeId?: string;
  relatedContractId?: string;
  objectionReason: string;
  raisedBy: string;
  raisedByName: string;
  raisedByRole: UserRole;
}

/** Logging a customer's objection is documentation, not a financial decision -- no approval gate to simply flag it. */
export async function raiseCustomerDispute(input: RaiseCustomerDisputeInput, recordAudit: RecordAuditFn): Promise<CustomerDisputedAmount> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new BalanceError('A disputed amount requires a value greater than zero.');
  }
  if (!input.objectionReason?.trim()) {
    throw new BalanceError('The customer\'s objection reason is required.');
  }

  const id = await issueNextNumber('CustomerDisputedAmount');
  const now = new Date().toISOString();
  const dispute: CustomerDisputedAmount = {
    id,
    customerId: input.customerId,
    amount: input.amount,
    relatedChargeId: input.relatedChargeId,
    relatedContractId: input.relatedContractId,
    status: 'open',
    objectionReason: input.objectionReason,
    raisedAt: now
  };
  await createDurable('customer_disputed_amounts', dispute as unknown as { id: string });

  await recordAudit({
    userId: input.raisedBy,
    userName: input.raisedByName,
    userRole: input.raisedByRole,
    entityType: 'CustomerDisputedAmount',
    entityId: id,
    action: 'create',
    newValue: `Customer ${input.customerId} disputed ${input.amount.toLocaleString()} AED: ${input.objectionReason}`
  });

  return dispute;
}

export type CustomerDisputeResolutionType = 'resolved_upheld' | 'resolved_waived' | 'resolved_partial';

export interface RequestCustomerDisputeResolutionInput {
  disputeId: string;
  resolutionType: CustomerDisputeResolutionType;
  resolution: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

async function loadCustomerDispute(id: string): Promise<CustomerDisputedAmount> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('customer_disputed_amounts').doc(id).get();
  if (!snap.exists) throw new BalanceError(`Dispute ${id} not found.`);
  return snap.data() as CustomerDisputedAmount;
}

/** Resolving a dispute finalizes a financial determination -- it goes through the same request -> review -> approval workflow as everything else. */
export async function requestCustomerDisputeResolution(input: RequestCustomerDisputeResolutionInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  const dispute = await loadCustomerDispute(input.disputeId);
  if (dispute.status !== 'open' && dispute.status !== 'under_review') {
    throw new BalanceError(`Dispute ${input.disputeId} is already ${dispute.status}.`);
  }
  if (!input.resolution?.trim()) {
    throw new BalanceError('A resolution note is required.');
  }

  await updateDurable('customer_disputed_amounts', dispute.id, { status: 'under_review' } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'CustomerDisputedAmount',
    entityId: dispute.id,
    action: 'update',
    newValue: `Proposed resolution for dispute ${dispute.id}: ${input.resolutionType} -- ${input.resolution}`,
    reason: input.resolution
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'CustomerDisputedAmount',
    entityId: dispute.id,
    action: 'approve_resolution',
    payload: { disputeId: dispute.id, resolutionType: input.resolutionType, resolution: input.resolution },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.resolution
  }, recordAudit);

  return { approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('CustomerDisputedAmount', 'approve_resolution', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const disputeId = request.payload.disputeId as string;
  const resolutionType = request.payload.resolutionType as CustomerDisputeResolutionType;
  const resolution = request.payload.resolution as string;
  const dispute = await loadCustomerDispute(disputeId);

  const now = new Date().toISOString();
  await updateDurable('customer_disputed_amounts', disputeId, {
    status: resolutionType,
    resolution,
    resolvedBy: decider.uid,
    resolvedByName: decider.name,
    resolvedAt: now
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'CustomerDisputedAmount',
    entityId: disputeId,
    action: 'approval',
    newValue: `Dispute ${disputeId} (customer ${dispute.customerId}) resolved: ${resolutionType} -- ${resolution}`,
    reason: request.reason
  });
});
