import { createDurable, updateDurable, runDurableTransaction, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals';
import type { RecordAuditFn } from './businessRules';
import type { EmployeeCustody, EmployeeCustodyMovement, EmployeeExpense, EmployeeExpenseFundingSource, EmployeeExpenseRejection, UserRole } from '../types';

// ----------------------------------------------------
// EMPLOYEE CUSTODY / FLOAT + EXPENSES (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// A custody/float account tracks cash issued to an employee to spend on
// the company's behalf. Issuing money into it is a financial disbursement
// (Segregation of Duties, same as every other movement in this phase);
// an employee handing back leftover cash is just fact-recording. An
// expense submitted against the float is pending_review until approved --
// only on approval does it actually debit the float, so a rejected
// request never touches the balance. If an employee pays with their OWN
// money (fundingSource employee_own_money) instead of the float, the
// company owes them that amount back -- recorded directly on approval,
// never inferred from the float running dry. A rejected expense keeps its
// full rejection history and can be resubmitted; a possible duplicate is
// flagged, never auto-blocked.

export class EmployeeCustodyError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'EmployeeCustodyError';
  }
}

async function findCustodyByEmployee(employeeId: string): Promise<EmployeeCustody | null> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('employee_custodies').get();
  const match = snap.docs.map((d: any) => d.data() as EmployeeCustody).find((c) => c.employeeId === employeeId);
  return match || null;
}

export interface RequestIssueCustodyFloatInput {
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

/** Issuing cash into an employee's float -- opens the account on the first issuance, tops it up on any later one. Always request -> review -> approval. */
export async function requestIssueCustodyFloat(input: RequestIssueCustodyFloatInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new EmployeeCustodyError('An issuance requires an amount greater than zero.');
  }

  const existing = await findCustodyByEmployee(input.employeeId);
  const approvalRequest = await createProcurementApproval({
    entityType: 'EmployeeCustody',
    entityId: existing?.id || `NEW:${input.employeeId}`,
    action: 'approve_issue_float',
    payload: { employeeId: input.employeeId, employeeName: input.employeeName, amount: input.amount, custodyId: existing?.id },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('EmployeeCustody', 'approve_issue_float', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const { employeeId, employeeName, amount, custodyId } = request.payload as { employeeId: string; employeeName: string; amount: number; custodyId?: string };
  const now = new Date().toISOString();

  if (!custodyId) {
    const id = await issueNextNumber('EmployeeCustody');
    const movement: EmployeeCustodyMovement = {
      id: `${id}-M1`,
      type: 'opening_balance',
      amount,
      recordedBy: decider.uid,
      recordedByName: decider.name,
      recordedAt: now
    };
    const custody: EmployeeCustody = {
      id,
      employeeId,
      employeeName,
      movements: [movement],
      currentBalance: amount,
      createdAt: now,
      updatedAt: now
    };
    await createDurable('employee_custodies', custody as unknown as { id: string });
    await recordAudit({
      userId: decider.uid, userName: decider.name, userRole: decider.role,
      entityType: 'EmployeeCustody', entityId: id, action: 'create',
      newValue: `Opened custody float for ${employeeName}: ${amount.toLocaleString()} AED.`, reason: request.reason
    });
  } else {
    // A read-then-overwrite race on the same custody document, same class
    // as the debt-settlement bug fixed elsewhere in this audit: two
    // concurrent movements against the same float (an issuance racing a
    // return, or an issuance racing an expense approval) could both read
    // the same currentBalance/movements and one write would silently
    // erase the other. Wrapped in a transaction so a concurrent write to
    // the same custody document forces a retry against the up-to-date
    // state.
    const admin = (await import('firebase-admin')).default;
    const custodyRef = admin.firestore().collection('employee_custodies').doc(custodyId);
    const { employeeName, currentBalance } = await runDurableTransaction(async (tx) => {
      const snap = await tx.get(custodyRef);
      if (!snap.exists) throw new EmployeeCustodyError(`Custody account ${custodyId} not found.`);
      const custody = snap.data() as EmployeeCustody;
      const movement: EmployeeCustodyMovement = {
        id: `${custody.id}-M${custody.movements.length + 1}`,
        type: 'amount_issued',
        amount,
        recordedBy: decider.uid,
        recordedByName: decider.name,
        recordedAt: now
      };
      const movements = [...custody.movements, movement];
      const currentBalance = Math.round((custody.currentBalance + amount) * 100) / 100;
      tx.set(custodyRef, { movements, currentBalance, updatedAt: now }, { merge: true });
      return { employeeName: custody.employeeName, currentBalance };
    });
    await recordAudit({
      userId: decider.uid, userName: decider.name, userRole: decider.role,
      entityType: 'EmployeeCustody', entityId: custodyId, action: 'update',
      newValue: `Issued ${amount.toLocaleString()} AED into ${employeeName}'s float. New balance: ${currentBalance.toLocaleString()} AED.`, reason: request.reason
    });
  }
});

export interface RecordCustodyReturnInput {
  custodyId: string;
  amount: number;
  actor: ProcurementApprovalActor;
  note?: string;
}

/**
 * An employee handing back leftover cash is fact-recording, not a new
 * financial decision -- no approval gate. Same lost-update race as the
 * issuance branch above, on the same custody document -- e.g. a return
 * racing a concurrent expense approval against the same float. Wrapped in
 * a transaction for the same reason.
 */
export async function recordCustodyReturn(input: RecordCustodyReturnInput, recordAudit: RecordAuditFn): Promise<EmployeeCustody> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new EmployeeCustodyError('A return requires an amount greater than zero.');
  }

  const now = new Date().toISOString();
  const admin = (await import('firebase-admin')).default;
  const custodyRef = admin.firestore().collection('employee_custodies').doc(input.custodyId);

  const updated = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(custodyRef);
    if (!snap.exists) throw new EmployeeCustodyError(`Custody account ${input.custodyId} not found.`);
    const custody = snap.data() as EmployeeCustody;
    if (input.amount > custody.currentBalance) {
      throw new EmployeeCustodyError(`Return amount (${input.amount.toLocaleString()}) exceeds the current float balance (${custody.currentBalance.toLocaleString()}).`);
    }

    const movement: EmployeeCustodyMovement = {
      id: `${custody.id}-M${custody.movements.length + 1}`,
      type: 'amount_returned',
      amount: input.amount,
      recordedBy: input.actor.uid,
      recordedByName: input.actor.name,
      recordedAt: now,
      note: input.note
    };
    const movements = [...custody.movements, movement];
    const currentBalance = Math.round((custody.currentBalance - input.amount) * 100) / 100;
    tx.set(custodyRef, { movements, currentBalance, updatedAt: now }, { merge: true });
    return { ...custody, movements, currentBalance, updatedAt: now };
  });

  await recordAudit({
    userId: input.actor.uid, userName: input.actor.name, userRole: input.actor.role,
    entityType: 'EmployeeCustody', entityId: updated.id, action: 'update',
    newValue: `${updated.employeeName} returned ${input.amount.toLocaleString()} AED to their float. New balance: ${updated.currentBalance.toLocaleString()} AED.`
  });

  return updated;
}

// ----------------------------------------------------
// EMPLOYEE EXPENSES
// ----------------------------------------------------

async function loadExpense(id: string): Promise<EmployeeExpense> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('employee_expenses').doc(id).get();
  if (!snap.exists) throw new EmployeeCustodyError(`Expense ${id} not found.`);
  return snap.data() as EmployeeExpense;
}

async function findPossibleDuplicate(employeeId: string, amount: number, date: string, vendorOrPartyName?: string): Promise<string | undefined> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('employee_expenses').get();
  const match = snap.docs
    .map((d: any) => d.data() as EmployeeExpense)
    .find((e) => e.employeeId === employeeId && e.status !== 'rejected' && e.amount === amount && e.date === date && (!vendorOrPartyName || e.vendorOrPartyName === vendorOrPartyName));
  return match?.id;
}

export interface SubmitEmployeeExpenseInput {
  employeeId: string;
  employeeName: string;
  custodyId?: string;
  fundingSource: EmployeeExpenseFundingSource;
  category: string;
  categoryOther?: string;
  amount: number;
  date: string;
  vendorOrPartyName?: string;
  documentIds?: string[];
  submittedBy: string;
  submittedByName: string;
  submittedByRole: UserRole;
}

export async function submitEmployeeExpense(input: SubmitEmployeeExpenseInput, recordAudit: RecordAuditFn): Promise<{ expense: EmployeeExpense; approvalRequestId: string }> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new EmployeeCustodyError('An expense requires an amount greater than zero.');
  }
  if (input.fundingSource === 'custody_float' && !input.custodyId) {
    throw new EmployeeCustodyError('A custody_float expense requires a custodyId.');
  }

  const duplicateOf = await findPossibleDuplicate(input.employeeId, input.amount, input.date, input.vendorOrPartyName);

  const id = await issueNextNumber('EmployeeExpense');
  const now = new Date().toISOString();
  const expense: EmployeeExpense = {
    id,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    custodyId: input.custodyId,
    fundingSource: input.fundingSource,
    category: input.category,
    categoryOther: input.categoryOther,
    amount: input.amount,
    date: input.date,
    vendorOrPartyName: input.vendorOrPartyName,
    documentIds: input.documentIds || [],
    status: 'pending_review',
    rejectionHistory: [],
    duplicateWarning: duplicateOf ? { possibleDuplicateOfExpenseId: duplicateOf } : undefined,
    createdAt: now,
    updatedAt: now
  };
  await createDurable('employee_expenses', expense as unknown as { id: string });

  await recordAudit({
    userId: input.submittedBy, userName: input.submittedByName, userRole: input.submittedByRole,
    entityType: 'EmployeeExpense', entityId: id, action: 'create',
    newValue: `Submitted ${input.fundingSource} expense of ${input.amount.toLocaleString()} AED (${input.category}) for ${input.employeeName}.${duplicateOf ? ` Possible duplicate of ${duplicateOf} -- flagged, not blocked.` : ''}`
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'EmployeeExpense',
    entityId: id,
    action: 'approve_expense',
    payload: { expenseId: id },
    requestedBy: input.submittedBy,
    requestedByName: input.submittedByName,
    requestedByRole: input.submittedByRole,
    reason: `${input.category} expense for ${input.employeeName}`
  }, recordAudit);

  return { expense, approvalRequestId: approvalRequest.id };
}

// Same lost-update race as the custody issuance/return fixes above -- the
// custody-float debit here used to be a separate, non-transactional
// read-then-write, so two expenses approved moments apart against the
// same float (or an approval racing an issuance/return) could each read
// the same currentBalance and one write would erase the other's debit.
// Both the custody debit and the expense-status write now happen inside
// one transaction (reads for both documents hoisted before either write,
// as Firestore transactions require).
registerApprovalHandler('EmployeeExpense', 'approve_expense', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const expenseId = request.payload.expenseId as string;
  const now = new Date().toISOString();
  const admin = (await import('firebase-admin')).default;
  const expenseRef = admin.firestore().collection('employee_expenses').doc(expenseId);

  const expense = await runDurableTransaction(async (tx) => {
    const expenseSnap = await tx.get(expenseRef);
    if (!expenseSnap.exists) throw new EmployeeCustodyError(`Expense ${expenseId} not found.`);
    const expense = expenseSnap.data() as EmployeeExpense;
    if (expense.status !== 'pending_review') {
      throw new EmployeeCustodyError(`Expense ${expenseId} has already been ${expense.status}.`);
    }

    const custodyRef = expense.fundingSource === 'custody_float' && expense.custodyId
      ? admin.firestore().collection('employee_custodies').doc(expense.custodyId)
      : null;
    const custodySnap = custodyRef ? await tx.get(custodyRef) : null;
    if (custodyRef && (!custodySnap || !custodySnap.exists)) {
      throw new EmployeeCustodyError(`Custody account ${expense.custodyId} not found.`);
    }

    const updates: Partial<EmployeeExpense> = {
      status: 'approved',
      approvedBy: decider.uid,
      approvedByName: decider.name,
      approvedAt: now,
      updatedAt: now
    };

    if (custodyRef && custodySnap) {
      const custody = custodySnap.data() as EmployeeCustody;
      if (expense.amount > custody.currentBalance) {
        throw new EmployeeCustodyError(`Insufficient custody float balance (${custody.currentBalance.toLocaleString()} AED) to cover this expense (${expense.amount.toLocaleString()} AED).`);
      }
      const movement: EmployeeCustodyMovement = {
        id: `${custody.id}-M${custody.movements.length + 1}`,
        type: 'expense',
        amount: expense.amount,
        relatedExpenseId: expense.id,
        recordedBy: decider.uid,
        recordedByName: decider.name,
        recordedAt: now
      };
      const movements = [...custody.movements, movement];
      const currentBalance = Math.round((custody.currentBalance - expense.amount) * 100) / 100;
      tx.set(custodyRef, { movements, currentBalance, updatedAt: now }, { merge: true });
    } else if (expense.fundingSource === 'employee_own_money') {
      // The employee paid with their own money -- the company owes it back,
      // recorded directly, never inferred from a float running dry.
      updates.amountOwedToEmployee = expense.amount;
    }

    tx.set(expenseRef, updates, { merge: true });
    return { ...expense, ...updates };
  });

  await recordAudit({
    userId: decider.uid, userName: decider.name, userRole: decider.role,
    entityType: 'EmployeeExpense', entityId: expenseId, action: 'approval',
    newValue: `Expense ${expenseId} approved: ${expense.amount.toLocaleString()} AED (${expense.fundingSource}).${expense.fundingSource === 'employee_own_money' ? ' Amount now owed to employee.' : ''}`,
    reason: request.reason
  });
});

export interface MarkEmployeeExpenseRejectedInput {
  expenseId: string;
  reason: string;
  actor: ProcurementApprovalActor;
}

/** Rejection never touches the float (nothing was debited yet) -- it just records the rejection, keeping every prior rejection on the same expense's history so a resubmission trail is never lost. */
export async function markEmployeeExpenseRejected(input: MarkEmployeeExpenseRejectedInput, recordAudit: RecordAuditFn): Promise<EmployeeExpense> {
  const expense = await loadExpense(input.expenseId);
  if (expense.status !== 'pending_review') {
    throw new EmployeeCustodyError(`Expense ${input.expenseId} has already been ${expense.status}.`);
  }

  const now = new Date().toISOString();
  const rejection: EmployeeExpenseRejection = {
    reason: input.reason,
    rejectedBy: input.actor.uid,
    rejectedByName: input.actor.name,
    rejectedAt: now
  };
  const rejectionHistory = [...(expense.rejectionHistory || []), rejection];
  await updateDurable('employee_expenses', expense.id, { status: 'rejected', rejectionHistory, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.actor.uid, userName: input.actor.name, userRole: input.actor.role,
    entityType: 'EmployeeExpense', entityId: expense.id, action: 'approval',
    newValue: `Expense ${expense.id} rejected: ${input.reason}`, reason: input.reason
  });

  return { ...expense, status: 'rejected', rejectionHistory, updatedAt: now };
}

export interface ResubmitEmployeeExpenseInput {
  expenseId: string;
  amount?: number;
  category?: string;
  categoryOther?: string;
  documentIds?: string[];
  resubmittedBy: string;
  resubmittedByName: string;
  resubmittedByRole: UserRole;
}

/** After a rejection, the employee can resubmit -- the rejection history is kept, never erased, and a fresh approval request is opened. */
export async function resubmitEmployeeExpense(input: ResubmitEmployeeExpenseInput, recordAudit: RecordAuditFn): Promise<{ expense: EmployeeExpense; approvalRequestId: string }> {
  const expense = await loadExpense(input.expenseId);
  if (expense.status !== 'rejected') {
    throw new EmployeeCustodyError(`Only a rejected expense can be resubmitted (current status: ${expense.status}).`);
  }

  const now = new Date().toISOString();
  const updates: Partial<EmployeeExpense> = {
    status: 'pending_review',
    resubmittedAt: now,
    updatedAt: now
  };
  if (typeof input.amount === 'number') updates.amount = input.amount;
  if (input.category) updates.category = input.category;
  if (input.categoryOther !== undefined) updates.categoryOther = input.categoryOther;
  if (input.documentIds) updates.documentIds = input.documentIds;

  await updateDurable('employee_expenses', expense.id, updates as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.resubmittedBy, userName: input.resubmittedByName, userRole: input.resubmittedByRole,
    entityType: 'EmployeeExpense', entityId: expense.id, action: 'update',
    newValue: `Expense ${expense.id} resubmitted after rejection.`
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'EmployeeExpense',
    entityId: expense.id,
    action: 'approve_expense',
    payload: { expenseId: expense.id },
    requestedBy: input.resubmittedBy,
    requestedByName: input.resubmittedByName,
    requestedByRole: input.resubmittedByRole,
    reason: `Resubmission of ${expense.category} expense for ${expense.employeeName}`
  }, recordAudit);

  return { expense: { ...expense, ...updates } as EmployeeExpense, approvalRequestId: approvalRequest.id };
}
