import { createDurable, updateDurable, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals.js';
import type { RecordAuditFn } from './businessRules.js';
import type { OperationalExpense, ExpenseDocumentationLevel, ProcurementPaymentMethod, UserRole } from '../types/index.js';

// ----------------------------------------------------
// OPERATIONAL EXPENSES: expense-without-invoice, fully-undocumented
// expense (strict conditions, always flagged) (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// A standalone operational expense not funded from an employee's own
// float or custody -- e.g. an emergency purchase made under a retroactive
// PO before an invoice ever existed. Three documentation levels: a normal
// invoice, no invoice but SOME alternate document (delivery note, receipt,
// screenshot -- a reason and at least one alternate document are both
// mandatory), or fully undocumented (strictest: a reason AND a detailed
// description are both mandatory, and it is always flagged in the audit
// trail and approval reason for extra scrutiny -- never silently treated
// like a normal expense). None of this auto-blocks; it always goes to a
// human for review via the same Segregation-of-Duties approval as every
// other workflow in this phase. Pairs naturally with a retroactive/
// emergency-purchase PO by sharing that PO's operationId -- no separate
// "combined" record is needed since both already carry the same field.

export class OperationalExpenseError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'OperationalExpenseError';
  }
}

export interface SubmitOperationalExpenseInput {
  operationId?: string;
  documentationLevel: ExpenseDocumentationLevel;
  category: string;
  categoryOther?: string;
  amount: number;
  date: string;
  vendorOrPartyName?: string;
  reasonForNoInvoice?: string;
  alternateDocumentIds?: string[];
  paymentMethod: ProcurementPaymentMethod;
  paymentMethodOther?: string;
  detailedDescription?: string;
  evidenceIds?: string[];
  createdBy: string;
  createdByName: string;
  createdByRole: UserRole;
}

export async function submitOperationalExpense(input: SubmitOperationalExpenseInput, recordAudit: RecordAuditFn): Promise<{ expense: OperationalExpense; approvalRequestId: string }> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new OperationalExpenseError('An expense requires an amount greater than zero.');
  }
  if (input.paymentMethod === 'other' && !input.paymentMethodOther?.trim()) {
    throw new OperationalExpenseError('Selecting "other" as the payment method requires a description.');
  }
  if (input.documentationLevel === 'no_invoice_has_alternate_document') {
    if (!input.reasonForNoInvoice?.trim()) {
      throw new OperationalExpenseError('An expense with no invoice requires a reason.');
    }
    if (!input.alternateDocumentIds || input.alternateDocumentIds.length === 0) {
      throw new OperationalExpenseError('An expense with no invoice requires at least one alternate document.');
    }
  }
  if (input.documentationLevel === 'undocumented') {
    // Strictest tier -- there is no document to fall back on at all, so
    // both a reason and a full written account are mandatory.
    if (!input.reasonForNoInvoice?.trim()) {
      throw new OperationalExpenseError('A fully undocumented expense requires a reason.');
    }
    if (!input.detailedDescription?.trim()) {
      throw new OperationalExpenseError('A fully undocumented expense requires a detailed description.');
    }
  }

  const id = await issueNextNumber('OperationalExpense');
  const now = new Date().toISOString();
  const expense: OperationalExpense = {
    id,
    operationId: input.operationId,
    documentationLevel: input.documentationLevel,
    category: input.category,
    categoryOther: input.categoryOther,
    amount: input.amount,
    date: input.date,
    vendorOrPartyName: input.vendorOrPartyName,
    reasonForNoInvoice: input.reasonForNoInvoice,
    alternateDocumentIds: input.alternateDocumentIds,
    paymentMethod: input.paymentMethod,
    paymentMethodOther: input.paymentMethodOther,
    detailedDescription: input.detailedDescription,
    evidenceIds: input.evidenceIds,
    status: 'pending_approval',
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now
  };
  await createDurable('operational_expenses', expense as unknown as { id: string });

  // "Always flagged" for the strictest tier -- a clearly-tagged audit entry
  // and approval reason, so it can never be mistaken for a routine,
  // fully-documented expense during review.
  const flagPrefix = input.documentationLevel === 'undocumented' ? 'UNDOCUMENTED EXPENSE -- REQUIRES SCRUTINY: ' : '';

  await recordAudit({
    userId: input.createdBy,
    userName: input.createdByName,
    userRole: input.createdByRole,
    entityType: 'OperationalExpense',
    entityId: id,
    action: 'create',
    newValue: `${flagPrefix}Submitted ${input.documentationLevel} expense of ${input.amount.toLocaleString()} AED (${input.category}).`
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'OperationalExpense',
    entityId: id,
    action: 'approve_operational_expense',
    payload: { expenseId: id },
    requestedBy: input.createdBy,
    requestedByName: input.createdByName,
    requestedByRole: input.createdByRole,
    reason: `${flagPrefix}${input.category} expense (${input.documentationLevel})${input.operationId ? ` for operation ${input.operationId}` : ''}`
  }, recordAudit);

  return { expense, approvalRequestId: approvalRequest.id };
}

async function loadOperationalExpense(id: string): Promise<OperationalExpense> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('operational_expenses').doc(id).get();
  if (!snap.exists) throw new OperationalExpenseError(`Expense ${id} not found.`);
  return snap.data() as OperationalExpense;
}

registerApprovalHandler('OperationalExpense', 'approve_operational_expense', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const expenseId = request.payload.expenseId as string;
  const expense = await loadOperationalExpense(expenseId);
  if (expense.status !== 'pending_approval') {
    throw new OperationalExpenseError(`Expense ${expenseId} has already been ${expense.status}.`);
  }

  const now = new Date().toISOString();
  await updateDurable('operational_expenses', expenseId, {
    status: 'approved',
    approvedBy: decider.uid,
    approvedByName: decider.name,
    approvedAt: now
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'OperationalExpense',
    entityId: expenseId,
    action: 'approval',
    newValue: `Expense ${expenseId} approved: ${expense.amount.toLocaleString()} AED (${expense.documentationLevel}).`,
    reason: request.reason
  });
});

export interface MarkOperationalExpenseRejectedInput {
  expenseId: string;
  reason: string;
  actor: ProcurementApprovalActor;
}

export async function markOperationalExpenseRejected(input: MarkOperationalExpenseRejectedInput, recordAudit: RecordAuditFn): Promise<OperationalExpense> {
  const expense = await loadOperationalExpense(input.expenseId);
  if (expense.status !== 'pending_approval') {
    throw new OperationalExpenseError(`Expense ${input.expenseId} has already been ${expense.status}.`);
  }

  await updateDurable('operational_expenses', expense.id, { status: 'rejected' } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.actor.uid,
    userName: input.actor.name,
    userRole: input.actor.role,
    entityType: 'OperationalExpense',
    entityId: expense.id,
    action: 'approval',
    newValue: `Expense ${expense.id} rejected: ${input.reason}`,
    reason: input.reason
  });

  return { ...expense, status: 'rejected' };
}
