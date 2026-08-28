import { createDurable, updateDurable, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals';
import type { RecordAuditFn } from './businessRules';
import type { Debt, DebtType, DebtSettlementMovement, DebtCorrection, DebtCancellation, ProcurementPaymentMethod, UserRole } from '../types';

// ----------------------------------------------------
// DEBTS / CHARGES: fixed type list, lifecycle, multiple settlement methods
// (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// A debt is raised directly (like the existing customer-facing charge it
// sits alongside), then moves through open -> partially_paid -> paid as
// settlement movements are recorded, on any of the fixed payment methods,
// as many times as needed. Nothing about a debt is ever edited or deleted
// in place: a wrong amount goes through a correction request (before/after
// amount, approval-gated), a debt that should never have existed goes
// through a cancellation request (also approval-gated), and a wrong
// settlement is reversed by recording a NEW, negative, linked movement --
// never by editing or removing the original movement.

export class DebtError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'DebtError';
  }
}

function recomputeFromSettlements(debt: Pick<Debt, 'originalAmount' | 'settlements'>): { paidAmount: number; remainingAmount: number; status: Debt['status'] } {
  const paidAmount = Math.max(0, Math.round(debt.settlements.reduce((sum, m) => sum + m.amount, 0) * 100) / 100);
  const remainingAmount = Math.max(0, Math.round((debt.originalAmount - paidAmount) * 100) / 100);
  const status: Debt['status'] = remainingAmount <= 0 ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'open';
  return { paidAmount, remainingAmount, status };
}

export interface CreateDebtInput {
  customerId: string;
  customerName: string;
  type: DebtType;
  typeOther?: string;
  description: string;
  evidenceDocumentIds?: string[];
  originalAmount: number;
  relatedContractId?: string;
  relatedOperationId?: string;
  createdBy: string;
  createdByName: string;
  createdByRole: UserRole;
}

export async function createDebt(input: CreateDebtInput, recordAudit: RecordAuditFn): Promise<Debt> {
  if (typeof input.originalAmount !== 'number' || input.originalAmount <= 0) {
    throw new DebtError('A debt requires an amount greater than zero.');
  }
  if (input.type === 'other' && !input.typeOther?.trim()) {
    throw new DebtError('Selecting "other" as the debt type requires a description.');
  }

  const id = await issueNextNumber('Debt');
  const now = new Date().toISOString();
  const debt: Debt = {
    id,
    customerId: input.customerId,
    customerName: input.customerName,
    type: input.type,
    typeOther: input.typeOther,
    description: input.description,
    evidenceDocumentIds: input.evidenceDocumentIds || [],
    originalAmount: input.originalAmount,
    settlements: [],
    paidAmount: 0,
    remainingAmount: input.originalAmount,
    status: 'open',
    corrections: [],
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    relatedContractId: input.relatedContractId,
    relatedOperationId: input.relatedOperationId,
    createdAt: now,
    updatedAt: now
  };
  await createDurable('debts', debt as unknown as { id: string });

  await recordAudit({
    userId: input.createdBy,
    userName: input.createdByName,
    userRole: input.createdByRole,
    entityType: 'Debt',
    entityId: id,
    action: 'create',
    newValue: `Raised ${input.type} debt of ${input.originalAmount.toLocaleString()} AED for customer ${input.customerId}: ${input.description}`
  });

  return debt;
}

async function loadDebt(id: string): Promise<Debt> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('debts').doc(id).get();
  if (!snap.exists) throw new DebtError(`Debt ${id} not found.`);
  return snap.data() as Debt;
}

export interface AddDebtSettlementInput {
  debtId: string;
  method: ProcurementPaymentMethod;
  methodOther?: string;
  amount: number;
  recordedBy: string;
  recordedByName: string;
  recordedByRole: UserRole;
}

/** Records one settlement movement toward a debt -- any of the fixed payment methods, as many separate movements as needed. */
export async function addDebtSettlement(input: AddDebtSettlementInput, recordAudit: RecordAuditFn): Promise<Debt> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new DebtError('A settlement requires an amount greater than zero.');
  }
  if (input.method === 'other' && !input.methodOther?.trim()) {
    throw new DebtError('Selecting "other" as the settlement method requires a description.');
  }

  const debt = await loadDebt(input.debtId);
  if (debt.status === 'paid' || debt.status === 'cancelled') {
    throw new DebtError(`This debt is already ${debt.status} and cannot take further settlements.`);
  }
  if (input.amount > debt.remainingAmount) {
    throw new DebtError(`Settlement amount (${input.amount.toLocaleString()}) exceeds the remaining debt (${debt.remainingAmount.toLocaleString()}).`);
  }

  const now = new Date().toISOString();
  const movement: DebtSettlementMovement = {
    id: `${debt.id}-M${debt.settlements.length + 1}`,
    method: input.method,
    methodOther: input.methodOther,
    amount: input.amount,
    recordedBy: input.recordedBy,
    recordedByName: input.recordedByName,
    recordedAt: now
  };
  const settlements = [...debt.settlements, movement];
  const { paidAmount, remainingAmount, status } = recomputeFromSettlements({ originalAmount: debt.originalAmount, settlements });

  await updateDurable('debts', debt.id, { settlements, paidAmount, remainingAmount, status, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.recordedBy,
    userName: input.recordedByName,
    userRole: input.recordedByRole,
    entityType: 'Debt',
    entityId: debt.id,
    action: 'update',
    newValue: `Settlement of ${input.amount.toLocaleString()} AED via ${input.method} recorded against debt ${debt.id}. Remaining: ${remainingAmount.toLocaleString()} AED.`
  });

  return { ...debt, settlements, paidAmount, remainingAmount, status, updatedAt: now };
}

export interface RequestDebtSettlementReversalInput {
  debtId: string;
  movementId: string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

/** A wrong settlement is never edited or deleted -- reversing it is a new, linked, negative movement, approval-gated like every other financial correction. */
export async function requestDebtSettlementReversal(input: RequestDebtSettlementReversalInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  const debt = await loadDebt(input.debtId);
  const movement = debt.settlements.find((m) => m.id === input.movementId);
  if (!movement) throw new DebtError(`Settlement movement ${input.movementId} not found on debt ${input.debtId}.`);
  if (movement.isReversal) throw new DebtError('Cannot reverse a movement that is itself already a reversal.');
  if (debt.settlements.some((m) => m.reversedMovementId === input.movementId)) {
    throw new DebtError('This settlement has already been reversed.');
  }

  const approvalRequest = await createProcurementApproval({
    entityType: 'Debt',
    entityId: debt.id,
    action: 'approve_settlement_reversal',
    payload: { debtId: debt.id, movementId: input.movementId },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'Debt',
    entityId: debt.id,
    action: 'update',
    newValue: `Requested reversal of settlement ${input.movementId} (${movement.amount.toLocaleString()} AED via ${movement.method}).`,
    reason: input.reason
  });

  return { approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('Debt', 'approve_settlement_reversal', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const debtId = request.payload.debtId as string;
  const movementId = request.payload.movementId as string;
  const debt = await loadDebt(debtId);
  const original = debt.settlements.find((m) => m.id === movementId);
  if (!original) throw new DebtError(`Settlement movement ${movementId} not found on debt ${debtId}.`);

  const now = new Date().toISOString();
  const reversal: DebtSettlementMovement = {
    id: `${debt.id}-M${debt.settlements.length + 1}`,
    method: original.method,
    methodOther: original.methodOther,
    amount: -original.amount,
    recordedBy: decider.uid,
    recordedByName: decider.name,
    recordedAt: now,
    reversedMovementId: movementId,
    isReversal: true
  };
  const settlements = [...debt.settlements, reversal];
  const { paidAmount, remainingAmount, status } = recomputeFromSettlements({ originalAmount: debt.originalAmount, settlements });

  await updateDurable('debts', debt.id, { settlements, paidAmount, remainingAmount, status, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'Debt',
    entityId: debt.id,
    action: 'approval',
    newValue: `Settlement ${movementId} reversed (${original.amount.toLocaleString()} AED via ${original.method}). Remaining: ${remainingAmount.toLocaleString()} AED.`,
    reason: request.reason
  });
});

export interface RequestDebtCorrectionInput {
  debtId: string;
  newAmount: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

export async function requestDebtCorrection(input: RequestDebtCorrectionInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  if (typeof input.newAmount !== 'number' || input.newAmount <= 0) {
    throw new DebtError('The corrected amount must be greater than zero.');
  }
  const debt = await loadDebt(input.debtId);
  if (debt.status === 'cancelled') throw new DebtError('Cannot correct a cancelled debt.');

  const now = new Date().toISOString();
  const correction: DebtCorrection = {
    reason: input.reason,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedAt: now,
    amountBefore: debt.originalAmount,
    amountAfter: input.newAmount,
    status: 'pending_approval'
  };
  const corrections = [...(debt.corrections || []), correction];
  await updateDurable('debts', debt.id, { corrections, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'Debt',
    entityId: debt.id,
    action: 'update',
    newValue: `Requested correction of debt ${debt.id}: ${debt.originalAmount.toLocaleString()} -> ${input.newAmount.toLocaleString()} AED.`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'Debt',
    entityId: debt.id,
    action: 'approve_correction',
    payload: { debtId: debt.id, correctionIndex: corrections.length - 1 },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('Debt', 'approve_correction', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const debtId = request.payload.debtId as string;
  const correctionIndex = request.payload.correctionIndex as number;
  const debt = await loadDebt(debtId);
  const corrections = [...(debt.corrections || [])];
  const correction = corrections[correctionIndex];
  if (!correction || correction.status !== 'pending_approval') {
    throw new DebtError(`Correction request on debt ${debtId} not found or already decided.`);
  }

  const now = new Date().toISOString();
  corrections[correctionIndex] = { ...correction, status: 'approved', approvedBy: decider.uid, approvedByName: decider.name, approvedAt: now };

  const originalAmount = correction.amountAfter;
  const { paidAmount, remainingAmount, status } = recomputeFromSettlements({ originalAmount, settlements: debt.settlements });

  await updateDurable('debts', debt.id, {
    originalAmount,
    corrections,
    paidAmount,
    remainingAmount,
    status,
    updatedAt: now
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'Debt',
    entityId: debt.id,
    action: 'approval',
    newValue: `Debt ${debt.id} corrected: ${correction.amountBefore.toLocaleString()} -> ${correction.amountAfter.toLocaleString()} AED.`,
    reason: request.reason
  });
});

export interface RequestDebtCancellationInput {
  debtId: string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

export async function requestDebtCancellation(input: RequestDebtCancellationInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  const debt = await loadDebt(input.debtId);
  if (debt.status === 'cancelled') throw new DebtError('This debt is already cancelled.');
  if (debt.status === 'paid') throw new DebtError('Cannot cancel a debt that has already been fully paid.');
  if (debt.cancellation?.status === 'pending_approval') throw new DebtError('This debt already has a pending cancellation request.');

  const now = new Date().toISOString();
  const cancellation: DebtCancellation = {
    reason: input.reason,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedAt: now,
    status: 'pending_approval'
  };
  await updateDurable('debts', debt.id, { cancellation, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'Debt',
    entityId: debt.id,
    action: 'update',
    newValue: `Requested cancellation of debt ${debt.id}.`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'Debt',
    entityId: debt.id,
    action: 'approve_cancellation',
    payload: { debtId: debt.id },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('Debt', 'approve_cancellation', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const debtId = request.payload.debtId as string;
  const debt = await loadDebt(debtId);
  if (!debt.cancellation || debt.cancellation.status !== 'pending_approval') {
    throw new DebtError(`Debt ${debtId} has no pending cancellation request.`);
  }

  const now = new Date().toISOString();
  const cancellation: DebtCancellation = { ...debt.cancellation, status: 'approved', approvedBy: decider.uid, approvedByName: decider.name, approvedAt: now };
  await updateDurable('debts', debt.id, { status: 'cancelled', cancellation, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'Debt',
    entityId: debt.id,
    action: 'approval',
    newValue: `Debt ${debt.id} cancelled.`,
    reason: request.reason
  });
});
