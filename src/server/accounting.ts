import crypto from 'crypto';
import admin from 'firebase-admin';
import { issueNextNumber } from './idGenerator.js';
import type { RecordAuditFn } from './businessRules.js';
import type { Invoice, Payment, Deposit, SupplierInvoice, Vehicle, Contract } from '../types/index.js';
import {
  ACCOUNTING_CONTROL_ACCOUNTS,
  DEFAULT_CHART_OF_ACCOUNTS,
  defaultAccountByCode
} from '../config/accounting.js';
import {
  accountingPeriodBounds,
  accountingPeriodKey,
  adjustedInvoiceBalance,
  assertJournalAccounts,
  buildAPAging,
  buildARAging,
  buildBalanceSheet,
  buildCashBook,
  buildProfitLoss,
  buildTrialBalance,
  buildVatSummary,
  buildVehicleProfitability,
  money,
  validateJournalLines
} from '../lib/accounting.js';
import type {
  AccountingAccount,
  AccountingPeriod,
  AccountsPayableEntry,
  AccountsPayablePayment,
  FinanceDashboardSummary,
  FinanceExpense,
  FinancialNote,
  JournalEntry,
  JournalLine,
  PostingGap,
  SafeCustomerPaymentInput,
  SafeCustomerPaymentResult
} from '../accounting/types.js';

export interface AccountingActor {
  uid: string;
  name: string;
  role: string;
}

interface PostJournalInput {
  date: string;
  sourceType: string;
  sourceId: string;
  sourceAction: string;
  reference?: string;
  memo: string;
  lines: JournalLine[];
  actor: AccountingActor;
  directManualPosting?: boolean;
}

export interface ManualJournalRequest {
  id: string;
  date: string;
  reference?: string;
  memo: string;
  lines: JournalLine[];
  status: 'pending_approval' | 'approved' | 'rejected';
  requestedBy: string;
  requestedByName: string;
  requestedByRole: string;
  requestedAt: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionReason?: string;
  journalId?: string;
}

const COLLECTIONS = {
  accounts: 'accounting_accounts',
  journals: 'accounting_journals',
  periods: 'accounting_periods',
  expenses: 'accounting_expenses',
  payables: 'accounting_payables',
  payablePayments: 'accounting_payable_payments',
  notes: 'accounting_financial_notes',
  manualJournalRequests: 'accounting_manual_journal_requests'
} as const;

function db() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function journalIdFor(sourceType: string, sourceId: string, sourceAction: string): string {
  const digest = crypto.createHash('sha256').update(`${sourceType}:${sourceId}:${sourceAction}`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

function safeDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) throw new Error('A valid date is required.');
  return parsed.toISOString().slice(0, 10);
}

async function collectionData<T>(collection: string): Promise<T[]> {
  const snap = await db().collection(collection).get();
  return snap.docs.map(doc => doc.data() as T);
}

export async function getEffectiveChartOfAccounts(): Promise<AccountingAccount[]> {
  const overrides = await collectionData<AccountingAccount>(COLLECTIONS.accounts);
  const map = new Map(DEFAULT_CHART_OF_ACCOUNTS.map(account => [account.code, { ...account }]));
  for (const override of overrides) {
    const existing = map.get(override.code);
    map.set(override.code, existing ? { ...existing, ...override, code: existing.code } : { ...override, system: false });
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export async function configureAccountingAccount(
  code: string,
  patch: Partial<AccountingAccount>,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<AccountingAccount> {
  const trimmedCode = String(code || '').trim();
  if (!/^[0-9A-Z.-]{3,20}$/i.test(trimmedCode)) throw new Error('Account code is invalid.');
  const existingDefault = defaultAccountByCode(trimmedCode);
  const currentSnap = await db().collection(COLLECTIONS.accounts).doc(trimmedCode).get();
  const existing = currentSnap.exists ? (currentSnap.data() as AccountingAccount) : undefined;

  if (existingDefault) {
    // System control accounts may be relabelled or disabled, but their class,
    // normal side, and control-account semantics are invariants because
    // changing those would reinterpret historical journals.
    for (const protectedField of ['accountClass', 'normalSide', 'system', 'allowDirectPosting'] as const) {
      if (patch[protectedField] !== undefined && patch[protectedField] !== existingDefault[protectedField]) {
        throw new Error(`System account ${trimmedCode} cannot change ${protectedField}.`);
      }
    }
  }

  const now = new Date().toISOString();
  const account: AccountingAccount = existingDefault
    ? {
        ...existingDefault,
        ...existing,
        name: patch.name?.trim() || existing?.name || existingDefault.name,
        nameAr: patch.nameAr?.trim() || existing?.nameAr || existingDefault.nameAr,
        description: patch.description ?? existing?.description ?? existingDefault.description,
        descriptionAr: patch.descriptionAr ?? existing?.descriptionAr ?? existingDefault.descriptionAr,
        active: patch.active ?? existing?.active ?? existingDefault.active,
        updatedAt: now,
        updatedBy: actor.uid,
        updatedByName: actor.name
      }
    : {
        code: trimmedCode,
        name: patch.name?.trim() || '',
        nameAr: patch.nameAr?.trim() || '',
        accountClass: patch.accountClass as AccountingAccount['accountClass'],
        normalSide: patch.normalSide as AccountingAccount['normalSide'],
        parentCode: patch.parentCode,
        description: patch.description,
        descriptionAr: patch.descriptionAr,
        active: patch.active ?? true,
        system: false,
        allowDirectPosting: patch.allowDirectPosting ?? true,
        cashEquivalent: patch.cashEquivalent ?? false,
        updatedAt: now,
        updatedBy: actor.uid,
        updatedByName: actor.name
      };

  if (!account.name || !account.nameAr || !account.accountClass || !account.normalSide) {
    throw new Error('A custom account requires name, Arabic name, class, and normal side.');
  }
  await db().collection(COLLECTIONS.accounts).doc(trimmedCode).set(account, { merge: true });
  await recordAudit({
    userId: actor.uid,
    userName: actor.name,
    userRole: actor.role,
    entityType: 'AccountingAccount',
    entityId: trimmedCode,
    action: existing || existingDefault ? 'update' : 'create',
    previousValue: existing ? JSON.stringify(existing) : undefined,
    newValue: JSON.stringify(account),
    reason: 'Chart of Accounts configuration'
  });
  return account;
}

async function assertPeriodOpen(periodKey: string, transaction?: FirebaseFirestore.Transaction): Promise<void> {
  const ref = db().collection(COLLECTIONS.periods).doc(periodKey);
  const snap = transaction ? await transaction.get(ref) : await ref.get();
  if (snap.exists && (snap.data() as AccountingPeriod).status === 'closed') {
    const error = new Error(`Accounting period ${periodKey} is closed. Use a reversal or adjustment in an open period.`);
    (error as any).code = 'ACCOUNTING_PERIOD_CLOSED';
    throw error;
  }
}

function buildJournalDocument(input: PostJournalInput, id: string): JournalEntry {
  const date = safeDate(input.date);
  const periodKey = accountingPeriodKey(date);
  const { totalDebit, totalCredit } = validateJournalLines(input.lines);
  const now = new Date().toISOString();
  return {
    id,
    date,
    periodKey,
    currency: 'AED',
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceAction: input.sourceAction,
    reference: input.reference,
    memo: input.memo,
    status: 'posted',
    lines: input.lines.map(line => ({
      ...line,
      debit: money(line.debit),
      credit: money(line.credit)
    })),
    totalDebit,
    totalCredit,
    createdBy: input.actor.uid,
    createdByName: input.actor.name,
    createdByRole: input.actor.role,
    createdAt: now,
    postedAt: now
  };
}

async function validatePostingAccounts(lines: JournalLine[], directManualPosting = false): Promise<AccountingAccount[]> {
  const accounts = await getEffectiveChartOfAccounts();
  assertJournalAccounts(lines, accounts, directManualPosting);
  return accounts;
}

export async function postJournalEntry(input: PostJournalInput, recordAudit: RecordAuditFn): Promise<{ journal: JournalEntry; replayed: boolean }> {
  await validatePostingAccounts(input.lines, Boolean(input.directManualPosting));
  const id = journalIdFor(input.sourceType, input.sourceId, input.sourceAction);
  const journal = buildJournalDocument(input, id);
  const firestore = db();
  let replayed = false;

  await firestore.runTransaction(async tx => {
    const journalRef = firestore.collection(COLLECTIONS.journals).doc(id);
    const periodRef = firestore.collection(COLLECTIONS.periods).doc(journal.periodKey);
    // All transaction reads happen before writes.
    const [existing, periodSnap] = await Promise.all([tx.get(journalRef), tx.get(periodRef)]);
    if (existing.exists) {
      replayed = true;
      return;
    }
    if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') {
      throw new Error(`Accounting period ${journal.periodKey} is closed. Use a reversal or adjustment in an open period.`);
    }
    tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);
  });

  if (!replayed) {
    await recordAudit({
      userId: input.actor.uid,
      userName: input.actor.name,
      userRole: input.actor.role,
      entityType: 'JournalEntry',
      entityId: id,
      action: 'create',
      newValue: `Posted balanced journal ${id}: debit ${journal.totalDebit.toFixed(2)} / credit ${journal.totalCredit.toFixed(2)} AED from ${input.sourceType} ${input.sourceId}.`
    });
  }
  return { journal, replayed };
}

export async function listJournals(limit = 1000): Promise<JournalEntry[]> {
  const snap = await db().collection(COLLECTIONS.journals).orderBy('date', 'desc').limit(Math.max(1, Math.min(limit, 5000))).get();
  return snap.docs.map(doc => doc.data() as JournalEntry);
}

export async function requestManualJournal(
  input: { date: string; reference?: string; memo: string; lines: JournalLine[] },
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<ManualJournalRequest> {
  await validatePostingAccounts(input.lines, true);
  validateJournalLines(input.lines);
  await assertPeriodOpen(accountingPeriodKey(input.date));
  if (!input.memo?.trim()) throw new Error('Manual journal requires a memo.');

  const id = await issueNextNumber('ManualJournalRequest');
  const request: ManualJournalRequest = {
    id,
    date: safeDate(input.date),
    reference: input.reference?.trim(),
    memo: input.memo.trim(),
    lines: input.lines,
    status: 'pending_approval',
    requestedBy: actor.uid,
    requestedByName: actor.name,
    requestedByRole: actor.role,
    requestedAt: new Date().toISOString()
  };
  await db().collection(COLLECTIONS.manualJournalRequests).doc(id).create(request);
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'ManualJournalRequest', entityId: id, action: 'create',
    newValue: `Manual journal requested for ${request.date}: ${request.memo}.`
  });
  return request;
}

export async function decideManualJournal(
  requestId: string,
  decision: 'approve' | 'reject',
  reason: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<ManualJournalRequest> {
  if (!reason?.trim()) throw new Error('A decision reason is required.');
  const ref = db().collection(COLLECTIONS.manualJournalRequests).doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Manual journal request not found.');
  const request = snap.data() as ManualJournalRequest;
  if (request.status !== 'pending_approval') throw new Error(`Manual journal request is already ${request.status}.`);
  if (request.requestedBy === actor.uid) throw new Error('Segregation of duties: the requester cannot approve their own journal.');

  if (decision === 'reject') {
    const updated: ManualJournalRequest = {
      ...request,
      status: 'rejected',
      decidedBy: actor.uid,
      decidedByName: actor.name,
      decidedAt: new Date().toISOString(),
      decisionReason: reason.trim()
    };
    await ref.set(updated, { merge: true });
    await recordAudit({
      userId: actor.uid, userName: actor.name, userRole: actor.role,
      entityType: 'ManualJournalRequest', entityId: requestId, action: 'approval',
      newValue: 'Manual journal request rejected.', reason: reason.trim()
    });
    return updated;
  }

  const posted = await postJournalEntry({
    date: request.date,
    sourceType: 'ManualJournalRequest',
    sourceId: request.id,
    sourceAction: 'approve',
    reference: request.reference,
    memo: request.memo,
    lines: request.lines,
    actor,
    directManualPosting: true
  }, recordAudit);
  const updated: ManualJournalRequest = {
    ...request,
    status: 'approved',
    decidedBy: actor.uid,
    decidedByName: actor.name,
    decidedAt: new Date().toISOString(),
    decisionReason: reason.trim(),
    journalId: posted.journal.id
  };
  await ref.set(updated, { merge: true });
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'ManualJournalRequest', entityId: requestId, action: 'approval',
    newValue: `Manual journal approved and posted as ${posted.journal.id}.`, reason: reason.trim()
  });
  return updated;
}

/** Lists manual journal requests (e.g. a non-customer income source: financing received, partner capital support) for the pending-approval inbox. */
export async function listManualJournalRequests(limit = 500): Promise<ManualJournalRequest[]> {
  const snap = await db().collection(COLLECTIONS.manualJournalRequests)
    .orderBy('requestedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(doc => doc.data() as ManualJournalRequest);
}

export async function reverseJournal(
  journalId: string,
  reason: string,
  reversalDate: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<JournalEntry> {
  if (!reason?.trim()) throw new Error('A reversal reason is required.');
  const ref = db().collection(COLLECTIONS.journals).doc(journalId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Journal entry not found.');
  const original = snap.data() as JournalEntry;
  if (original.reversalJournalId) throw new Error(`Journal has already been reversed by ${original.reversalJournalId}.`);

  const result = await postJournalEntry({
    date: reversalDate,
    sourceType: 'JournalReversal',
    sourceId: original.id,
    sourceAction: 'reverse',
    reference: original.reference,
    memo: `REVERSAL: ${reason.trim()} — ${original.memo}`,
    lines: original.lines.map(line => ({
      ...line,
      debit: line.credit,
      credit: line.debit
    })),
    actor
  }, recordAudit);
  const now = new Date().toISOString();
  await ref.set({ reversalJournalId: result.journal.id, reversedAt: now, reversalReason: reason.trim() }, { merge: true });
  await db().collection(COLLECTIONS.journals).doc(result.journal.id).set({ reversalOfJournalId: original.id }, { merge: true });
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'JournalEntry', entityId: original.id, action: 'update',
    newValue: `Journal reversed by ${result.journal.id}.`, reason: reason.trim()
  });
  return { ...result.journal, reversalOfJournalId: original.id };
}

export async function listPeriods(): Promise<AccountingPeriod[]> {
  return (await collectionData<AccountingPeriod>(COLLECTIONS.periods)).sort((a, b) => b.id.localeCompare(a.id));
}

export async function closeAccountingPeriod(
  periodKey: string,
  reason: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<AccountingPeriod> {
  if (!reason?.trim()) throw new Error('Closing an accounting period requires a reason.');
  const bounds = accountingPeriodBounds(periodKey);
  const firestore = db();

  const [pendingExpenseSnap, pendingManualSnap] = await Promise.all([
    firestore.collection(COLLECTIONS.expenses)
      .where('date', '>=', bounds.startDate)
      .where('date', '<=', bounds.endDate)
      .where('approvalStatus', '==', 'approved')
      .get(),
    firestore.collection(COLLECTIONS.manualJournalRequests)
      .where('date', '>=', bounds.startDate)
      .where('date', '<=', bounds.endDate)
      .where('status', '==', 'pending_approval')
      .get()
  ]);
  const unpostedApprovedExpenses = pendingExpenseSnap.docs.filter(doc => (doc.data() as FinanceExpense).postingStatus !== 'posted');
  if (unpostedApprovedExpenses.length > 0 || !pendingManualSnap.empty) {
    throw new Error(`Period ${periodKey} cannot close while it contains ${unpostedApprovedExpenses.length} approved unposted expense(s) and ${pendingManualSnap.size} pending manual journal request(s).`);
  }

  const now = new Date().toISOString();
  const period: AccountingPeriod = {
    id: periodKey,
    ...bounds,
    status: 'closed',
    closedAt: now,
    closedBy: actor.uid,
    closedByName: actor.name,
    closeReason: reason.trim(),
    updatedAt: now
  };
  const ref = firestore.collection(COLLECTIONS.periods).doc(periodKey);
  await firestore.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (current.exists && (current.data() as AccountingPeriod).status === 'closed') throw new Error(`Period ${periodKey} is already closed.`);
    tx.set(ref, period, { merge: true });
  });
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'AccountingPeriod', entityId: periodKey, action: 'status_change',
    newValue: 'closed', reason: reason.trim()
  });
  return period;
}

export async function listFinanceExpenses(): Promise<FinanceExpense[]> {
  return (await collectionData<FinanceExpense>(COLLECTIONS.expenses)).sort((a, b) => b.date.localeCompare(a.date));
}

export async function createFinanceExpense(
  input: Omit<FinanceExpense, 'id' | 'approvalStatus' | 'postingStatus' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt' | 'journalId'>,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<FinanceExpense> {
  const amountBeforeVat = money(input.amountBeforeVat);
  const vatAmount = money(input.vatAmount);
  const totalAmount = money(input.totalAmount);
  if (amountBeforeVat < 0 || vatAmount < 0 || totalAmount <= 0) throw new Error('Expense amounts are invalid.');
  if (Math.abs(money(amountBeforeVat + vatAmount) - totalAmount) > 0.01) throw new Error('Expense total must equal amount before VAT plus VAT amount.');
  const accounts = await getEffectiveChartOfAccounts();
  const expenseAccount = accounts.find(a => a.code === input.expenseAccountCode);
  if (!expenseAccount || expenseAccount.accountClass !== 'expense' || !expenseAccount.active) throw new Error('A valid active expense account is required.');
  if (input.paymentStatus === 'paid') {
    const settlement = accounts.find(a => a.code === input.settlementAccountCode);
    if (!settlement || settlement.accountClass !== 'asset' || !settlement.active) throw new Error('A paid expense requires an active cash/bank/settlement asset account.');
  }
  const date = safeDate(input.date);
  await assertPeriodOpen(accountingPeriodKey(date));

  const id = await issueNextNumber('FinanceExpense');
  const now = new Date().toISOString();
  const expense: FinanceExpense = {
    ...input,
    id,
    date,
    amountBeforeVat,
    vatAmount,
    totalAmount,
    attachmentDocumentIds: input.attachmentDocumentIds || [],
    approvalStatus: 'pending_approval',
    postingStatus: 'unposted',
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: now,
    updatedAt: now
  };
  await db().collection(COLLECTIONS.expenses).doc(id).create(expense);
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'FinanceExpense', entityId: id, action: 'create',
    newValue: `Expense submitted for approval: ${totalAmount.toFixed(2)} AED (${expense.category}).`
  });
  return expense;
}

export async function decideFinanceExpense(
  expenseId: string,
  decision: 'approve' | 'reject',
  reason: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<FinanceExpense> {
  if (!reason?.trim()) throw new Error('A decision reason is required.');
  const ref = db().collection(COLLECTIONS.expenses).doc(expenseId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Expense not found.');
  const expense = snap.data() as FinanceExpense;
  if (expense.approvalStatus !== 'pending_approval') throw new Error(`Expense is already ${expense.approvalStatus}.`);
  if (expense.createdBy === actor.uid) throw new Error('Segregation of duties: the creator cannot approve their own expense.');
  const now = new Date().toISOString();

  if (decision === 'reject') {
    const updated: FinanceExpense = {
      ...expense,
      approvalStatus: 'rejected',
      rejectedBy: actor.uid,
      rejectedByName: actor.name,
      rejectedAt: now,
      rejectionReason: reason.trim(),
      updatedAt: now
    };
    await ref.set(updated, { merge: true });
    await recordAudit({
      userId: actor.uid, userName: actor.name, userRole: actor.role,
      entityType: 'FinanceExpense', entityId: expenseId, action: 'approval',
      newValue: 'Expense rejected.', reason: reason.trim()
    });
    return updated;
  }

  const creditAccount = expense.paymentStatus === 'paid' ? expense.settlementAccountCode! : ACCOUNTING_CONTROL_ACCOUNTS.accountsPayable;
  const dimensions = {
    vehicleId: expense.vehicleId,
    contractId: expense.contractId,
    supplierId: expense.supplierId,
    branchId: expense.branchId
  };
  const lines: JournalLine[] = [
    { accountCode: expense.expenseAccountCode, debit: expense.amountBeforeVat, credit: 0, memo: expense.category, dimensions }
  ];
  if (expense.vatAmount > 0) lines.push({ accountCode: ACCOUNTING_CONTROL_ACCOUNTS.vatInput, debit: expense.vatAmount, credit: 0, memo: 'Input VAT', dimensions });
  lines.push({ accountCode: creditAccount, debit: 0, credit: expense.totalAmount, memo: expense.vendor || expense.category, dimensions });

  const posted = await postJournalEntry({
    date: expense.date,
    sourceType: 'FinanceExpense',
    sourceId: expense.id,
    sourceAction: 'approve',
    reference: expense.reference,
    memo: `Expense ${expense.id}: ${expense.vendor || expense.category}`,
    lines,
    actor
  }, recordAudit);
  const updated: FinanceExpense = {
    ...expense,
    approvalStatus: 'approved',
    postingStatus: 'posted',
    journalId: posted.journal.id,
    approvedBy: actor.uid,
    approvedByName: actor.name,
    approvedAt: now,
    updatedAt: now
  };
  await ref.set(updated, { merge: true });
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'FinanceExpense', entityId: expense.id, action: 'approval',
    newValue: `Expense approved and posted to journal ${posted.journal.id}.`, reason: reason.trim()
  });
  return updated;
}

export async function listPayables(): Promise<AccountsPayableEntry[]> {
  return (await collectionData<AccountsPayableEntry>(COLLECTIONS.payables)).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
}

export async function postApprovedSupplierInvoiceToAP(
  supplierInvoiceId: string,
  input: { amountBeforeVat: number; vatAmount: number; dueDate: string; expenseAccountCode: string },
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<AccountsPayableEntry> {
  const firestore = db();
  const invoiceRef = firestore.collection('supplier_invoices').doc(supplierInvoiceId);
  const invoiceSnap = await invoiceRef.get();
  if (!invoiceSnap.exists) throw new Error('Supplier invoice not found.');
  const invoice = invoiceSnap.data() as SupplierInvoice;
  if (invoice.status !== 'approved') throw new Error('Supplier invoice must be approved before accounting posting.');
  const amountBeforeVat = money(input.amountBeforeVat);
  const vatAmount = money(input.vatAmount);
  if (Math.abs(money(amountBeforeVat + vatAmount) - money(invoice.amount)) > 0.01) {
    throw new Error('The supplied net amount plus VAT must equal the approved supplier invoice total. VAT is never guessed automatically.');
  }
  const accounts = await getEffectiveChartOfAccounts();
  const expenseAccount = accounts.find(a => a.code === input.expenseAccountCode);
  if (!expenseAccount || expenseAccount.accountClass !== 'expense' || !expenseAccount.active) throw new Error('A valid expense account is required.');
  const dueDate = safeDate(input.dueDate);
  const payableId = `AP-${supplierInvoiceId}`;
  const payableRef = firestore.collection(COLLECTIONS.payables).doc(payableId);
  const existing = await payableRef.get();
  if (existing.exists) return existing.data() as AccountsPayableEntry;

  const posted = await postJournalEntry({
    date: invoice.invoiceDate,
    sourceType: 'SupplierInvoice',
    sourceId: invoice.id,
    sourceAction: 'post_ap',
    reference: invoice.invoiceNumber,
    memo: `Supplier invoice ${invoice.invoiceNumber} — ${invoice.supplierName}`,
    lines: [
      { accountCode: input.expenseAccountCode, debit: amountBeforeVat, credit: 0, dimensions: { supplierId: invoice.supplierId, supplierInvoiceId: invoice.id } },
      ...(vatAmount > 0 ? [{ accountCode: ACCOUNTING_CONTROL_ACCOUNTS.vatInput, debit: vatAmount, credit: 0, dimensions: { supplierId: invoice.supplierId, supplierInvoiceId: invoice.id } } as JournalLine] : []),
      { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsPayable, debit: 0, credit: money(invoice.amount), dimensions: { supplierId: invoice.supplierId, supplierInvoiceId: invoice.id } }
    ],
    actor
  }, recordAudit);

  const now = new Date().toISOString();
  const payable: AccountsPayableEntry = {
    id: payableId,
    supplierInvoiceId: invoice.id,
    supplierId: invoice.supplierId,
    supplierName: invoice.supplierName,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: safeDate(invoice.invoiceDate),
    dueDate,
    expenseAccountCode: input.expenseAccountCode,
    amountBeforeVat,
    vatAmount,
    totalAmount: money(invoice.amount),
    paidAmount: 0,
    balance: money(invoice.amount),
    status: 'unpaid',
    journalId: posted.journal.id,
    createdAt: now,
    updatedAt: now
  };
  await payableRef.create(payable);
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'AccountsPayable', entityId: payable.id, action: 'create',
    newValue: `Posted supplier invoice ${invoice.id} to AP: ${payable.totalAmount.toFixed(2)} AED, due ${dueDate}.`
  });
  return payable;
}

export async function payAccountsPayable(
  payableId: string,
  input: { amount: number; settlementAccountCode: string; reference?: string; paymentDate?: string },
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<{ payable: AccountsPayableEntry; payment: AccountsPayablePayment }> {
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Supplier payment amount must be greater than zero.');
  const accounts = await getEffectiveChartOfAccounts();
  const settlementAccount = accounts.find(a => a.code === input.settlementAccountCode);
  if (!settlementAccount || settlementAccount.accountClass !== 'asset' || !settlementAccount.active) throw new Error('Supplier payment requires an active cash/bank settlement account.');
  const paymentDate = safeDate(input.paymentDate || new Date().toISOString());
  await assertPeriodOpen(accountingPeriodKey(paymentDate));

  const firestore = db();
  const payableRef = firestore.collection(COLLECTIONS.payables).doc(payableId);
  const paymentId = await issueNextNumber('AccountsPayablePayment');
  const paymentRef = firestore.collection(COLLECTIONS.payablePayments).doc(paymentId);
  const sourceAction = `pay:${paymentId}`;
  const journalId = journalIdFor('AccountsPayable', payableId, sourceAction);
  const journalRef = firestore.collection(COLLECTIONS.journals).doc(journalId);
  const periodRef = firestore.collection(COLLECTIONS.periods).doc(accountingPeriodKey(paymentDate));
  const now = new Date().toISOString();
  let updatedPayable!: AccountsPayableEntry;
  let payment!: AccountsPayablePayment;
  let journal!: JournalEntry;

  await firestore.runTransaction(async tx => {
    const [payableSnap, journalSnap, periodSnap] = await Promise.all([tx.get(payableRef), tx.get(journalRef), tx.get(periodRef)]);
    if (!payableSnap.exists) throw new Error('Accounts payable entry not found.');
    const current = payableSnap.data() as AccountsPayableEntry;
    if (current.status === 'cancelled' || current.balance <= 0) throw new Error('Accounts payable entry has no outstanding balance.');
    if (amount > current.balance + 0.005) throw new Error('Supplier payment exceeds the payable balance.');
    if (journalSnap.exists) throw new Error('Duplicate supplier payment posting detected.');
    if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') throw new Error(`Accounting period ${accountingPeriodKey(paymentDate)} is closed.`);

    const newPaid = money(current.paidAmount + amount);
    const newBalance = money(current.balance - amount);
    updatedPayable = {
      ...current,
      paidAmount: newPaid,
      balance: newBalance,
      status: newBalance === 0 ? 'paid' : 'partially_paid',
      updatedAt: now
    };
    journal = buildJournalDocument({
      date: paymentDate,
      sourceType: 'AccountsPayable',
      sourceId: payableId,
      sourceAction,
      reference: input.reference,
      memo: `Supplier payment ${paymentId} — ${current.supplierName}`,
      lines: [
        { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsPayable, debit: amount, credit: 0, dimensions: { supplierId: current.supplierId, supplierInvoiceId: current.supplierInvoiceId } },
        { accountCode: input.settlementAccountCode, debit: 0, credit: amount, dimensions: { supplierId: current.supplierId, supplierInvoiceId: current.supplierInvoiceId } }
      ],
      actor
    }, journalId);
    payment = {
      id: paymentId,
      payableId,
      supplierId: current.supplierId,
      supplierName: current.supplierName,
      amount,
      settlementAccountCode: input.settlementAccountCode,
      reference: input.reference,
      journalId,
      paidBy: actor.uid,
      paidByName: actor.name,
      paidAt: now
    };
    tx.set(payableRef, updatedPayable, { merge: true });
    tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);
    tx.create(paymentRef, payment);
  });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'AccountsPayable', entityId: payableId, action: 'update',
    newValue: `Supplier payment ${paymentId}: ${amount.toFixed(2)} AED. Remaining balance ${updatedPayable.balance.toFixed(2)} AED.`
  });
  return { payable: updatedPayable, payment };
}

export async function postInvoiceToAccounting(
  invoiceId: string,
  revenueAccountCode: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<JournalEntry> {
  const snap = await db().collection('invoices').doc(invoiceId).get();
  if (!snap.exists) throw new Error('Invoice not found.');
  const invoice = snap.data() as Invoice;
  if (invoice.status === 'draft' || invoice.status === 'cancelled') throw new Error('Only issued, non-cancelled invoices can be posted.');
  const accounts = await getEffectiveChartOfAccounts();
  const revenue = accounts.find(account => account.code === revenueAccountCode);
  if (!revenue || revenue.accountClass !== 'revenue' || !revenue.active) throw new Error('A valid active revenue account is required.');
  const lines: JournalLine[] = [
    { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, debit: money(invoice.totalAmount), credit: 0, dimensions: { customerId: invoice.customerId, contractId: invoice.contractId, reservationId: invoice.reservationId, invoiceId: invoice.id } },
    { accountCode: revenueAccountCode, debit: 0, credit: money(invoice.subtotal), dimensions: { customerId: invoice.customerId, contractId: invoice.contractId, reservationId: invoice.reservationId, invoiceId: invoice.id } }
  ];
  if (money(invoice.vatAmount) > 0) lines.push({ accountCode: ACCOUNTING_CONTROL_ACCOUNTS.vatOutput, debit: 0, credit: money(invoice.vatAmount), dimensions: { customerId: invoice.customerId, invoiceId: invoice.id } });
  const posted = await postJournalEntry({
    date: invoice.issueDate,
    sourceType: 'Invoice', sourceId: invoice.id, sourceAction: 'issue', reference: invoice.id,
    memo: `Customer invoice ${invoice.id} — ${invoice.customerName}`,
    lines, actor
  }, recordAudit);
  return posted.journal;
}

export async function postPaymentToAccounting(
  paymentId: string,
  settlementAccountCode: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<JournalEntry> {
  const snap = await db().collection('payments').doc(paymentId).get();
  if (!snap.exists) throw new Error('Payment not found.');
  const payment = snap.data() as Payment & { unallocatedAmount?: number };
  if (payment.status === 'refunded') throw new Error('A refunded payment cannot be posted as a current receipt.');
  const account = (await getEffectiveChartOfAccounts()).find(a => a.code === settlementAccountCode);
  if (!account || account.accountClass !== 'asset' || !account.active) throw new Error('A valid cash/bank settlement account is required.');
  const allocatedAmount = money((payment.allocatedTo || []).reduce((sum, allocation) => sum + allocation.amount, 0));
  const unallocatedAmount = money(payment.unallocatedAmount ?? Math.max(0, payment.amount - allocatedAmount));
  const lines: JournalLine[] = [
    { accountCode: settlementAccountCode, debit: money(payment.amount), credit: 0, dimensions: { customerId: payment.customerId, contractId: payment.contractId, reservationId: payment.reservationId } }
  ];
  if (allocatedAmount > 0) lines.push({ accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, debit: 0, credit: allocatedAmount, dimensions: { customerId: payment.customerId, contractId: payment.contractId } });
  if (unallocatedAmount > 0) lines.push({ accountCode: '2400', debit: 0, credit: unallocatedAmount, memo: 'Unallocated customer credit', dimensions: { customerId: payment.customerId } });
  const posted = await postJournalEntry({
    date: payment.receivedAt,
    sourceType: 'Payment', sourceId: payment.id, sourceAction: 'receive', reference: payment.receiptNumber,
    memo: `Customer receipt ${payment.receiptNumber} — ${payment.customerName}`,
    lines, actor
  }, recordAudit);
  await db().collection('payments').doc(payment.id).set({ accountingPostingStatus: 'posted', accountingJournalId: posted.journal.id, accountingAccountCode: settlementAccountCode }, { merge: true });
  return posted.journal;
}

export async function postDepositToAccounting(
  depositId: string,
  settlementAccountCode: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<JournalEntry> {
  const snap = await db().collection('deposits').doc(depositId).get();
  if (!snap.exists) throw new Error('Deposit not found.');
  const deposit = snap.data() as Deposit & { holdType?: string };
  if (deposit.holdType === 'gateway_authorization') throw new Error('An uncaptured authorization hold is not cash received and cannot be posted as a deposit receipt.');
  const account = (await getEffectiveChartOfAccounts()).find(a => a.code === settlementAccountCode);
  if (!account || account.accountClass !== 'asset' || !account.active) throw new Error('A valid cash/bank settlement account is required.');
  const posted = await postJournalEntry({
    date: deposit.createdAt,
    sourceType: 'Deposit', sourceId: deposit.id, sourceAction: 'receive', reference: deposit.transactionRef,
    memo: `Security deposit received — ${deposit.customerName}`,
    lines: [
      { accountCode: settlementAccountCode, debit: money(deposit.amount), credit: 0, dimensions: { customerId: deposit.customerId, contractId: deposit.contractId, reservationId: deposit.reservationId } },
      { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.customerDepositsHeld, debit: 0, credit: money(deposit.amount), dimensions: { customerId: deposit.customerId, contractId: deposit.contractId, reservationId: deposit.reservationId } }
    ], actor
  }, recordAudit);
  await db().collection('deposits').doc(deposit.id).set({ accountingPostingStatus: 'posted', accountingJournalId: posted.journal.id, accountingAccountCode: settlementAccountCode }, { merge: true });
  return posted.journal;
}

export async function createFinancialNote(
  type: 'credit_note' | 'debit_note',
  input: { invoiceId: string; issueDate: string; reason: string; amountBeforeVat: number; vatAmount: number; revenueAccountCode: string },
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<FinancialNote> {
  if (!input.reason?.trim()) throw new Error('Credit/debit note requires a reason.');
  const invoiceSnap = await db().collection('invoices').doc(input.invoiceId).get();
  if (!invoiceSnap.exists) throw new Error('Original invoice not found.');
  const invoice = invoiceSnap.data() as Invoice;
  if (invoice.status === 'draft' || invoice.status === 'cancelled') throw new Error('Notes can only be issued against an issued, non-cancelled invoice.');
  const amountBeforeVat = money(input.amountBeforeVat);
  const vatAmount = money(input.vatAmount);
  const totalAmount = money(amountBeforeVat + vatAmount);
  if (amountBeforeVat <= 0 || vatAmount < 0) throw new Error('Note amounts are invalid.');
  const revenue = (await getEffectiveChartOfAccounts()).find(a => a.code === input.revenueAccountCode);
  if (!revenue || revenue.accountClass !== 'revenue' || !revenue.active) throw new Error('A valid revenue account is required.');

  if (type === 'credit_note') {
    const existingNotes = await listFinancialNotes(input.invoiceId);
    const alreadyCredited = existingNotes.filter(note => note.type === 'credit_note' && note.status === 'posted').reduce((sum, note) => sum + note.totalAmount, 0);
    if (money(alreadyCredited + totalAmount) > money(invoice.totalAmount) + 0.01) throw new Error('Credit notes cannot reduce the original invoice below zero.');
  }

  const id = await issueNextNumber(type === 'credit_note' ? 'CreditNote' : 'DebitNote');
  const issueDate = safeDate(input.issueDate);
  const dimensions = { customerId: invoice.customerId, contractId: invoice.contractId, reservationId: invoice.reservationId, invoiceId: invoice.id };
  const lines: JournalLine[] = type === 'credit_note'
    ? [
        { accountCode: input.revenueAccountCode, debit: amountBeforeVat, credit: 0, dimensions },
        ...(vatAmount > 0 ? [{ accountCode: ACCOUNTING_CONTROL_ACCOUNTS.vatOutput, debit: vatAmount, credit: 0, dimensions } as JournalLine] : []),
        { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, debit: 0, credit: totalAmount, dimensions }
      ]
    : [
        { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, debit: totalAmount, credit: 0, dimensions },
        { accountCode: input.revenueAccountCode, debit: 0, credit: amountBeforeVat, dimensions },
        ...(vatAmount > 0 ? [{ accountCode: ACCOUNTING_CONTROL_ACCOUNTS.vatOutput, debit: 0, credit: vatAmount, dimensions } as JournalLine] : [])
      ];
  const posted = await postJournalEntry({
    date: issueDate, sourceType: type === 'credit_note' ? 'CreditNote' : 'DebitNote', sourceId: id, sourceAction: 'issue', reference: invoice.id,
    memo: `${type === 'credit_note' ? 'Credit note' : 'Debit note'} ${id} against ${invoice.id}: ${input.reason.trim()}`,
    lines, actor
  }, recordAudit);
  const now = new Date().toISOString();
  const note: FinancialNote = {
    id, type, invoiceId: invoice.id, customerId: invoice.customerId, customerName: invoice.customerName,
    issueDate, reason: input.reason.trim(), amountBeforeVat, vatAmount, totalAmount,
    revenueAccountCode: input.revenueAccountCode, status: 'posted', journalId: posted.journal.id,
    createdBy: actor.uid, createdByName: actor.name, createdAt: now
  };
  await db().collection(COLLECTIONS.notes).doc(id).create(note);

  // Customer.outstandingBalance is a derived operational metric, not the
  // immutable invoice. Keeping it synchronized with the note avoids showing
  // a stale customer balance while preserving the original invoice itself.
  const customerRef = db().collection('customers').doc(invoice.customerId);
  await db().runTransaction(async tx => {
    const customerSnap = await tx.get(customerRef);
    if (!customerSnap.exists) return;
    const current = Number((customerSnap.data() as any).outstandingBalance || 0);
    const delta = type === 'credit_note' ? -totalAmount : totalAmount;
    tx.set(customerRef, { outstandingBalance: Math.max(0, money(current + delta)), updatedAt: now }, { merge: true });
  });
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: type === 'credit_note' ? 'CreditNote' : 'DebitNote', entityId: id, action: 'create',
    newValue: `${type} ${id} issued for ${totalAmount.toFixed(2)} AED against invoice ${invoice.id}.`, reason: input.reason.trim()
  });
  return note;
}

export async function listFinancialNotes(invoiceId?: string): Promise<FinancialNote[]> {
  const notes = await collectionData<FinancialNote>(COLLECTIONS.notes);
  return notes.filter(note => !invoiceId || note.invoiceId === invoiceId).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

export async function recordSafeCustomerPayment(
  input: SafeCustomerPaymentInput,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<SafeCustomerPaymentResult> {
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Payment amount must be greater than zero.');
  if (!input.customerId) throw new Error('Customer is required.');
  const firestore = db();
  const customerRef = firestore.collection('customers').doc(input.customerId);
  const customerSnap = await customerRef.get();
  if (!customerSnap.exists) throw new Error('Customer not found.');
  const customer = customerSnap.data() as any;
  const requestedAllocations = (input.allocations && input.allocations.length > 0)
    ? input.allocations
    : input.invoiceId ? [{ invoiceId: input.invoiceId, amount }] : [];

  const consolidated = new Map<string, number>();
  for (const allocation of requestedAllocations) {
    const allocationAmount = money(allocation.amount);
    if (!allocation.invoiceId || allocationAmount <= 0) throw new Error('Every allocation requires an invoice and positive amount.');
    consolidated.set(allocation.invoiceId, money((consolidated.get(allocation.invoiceId) || 0) + allocationAmount));
  }
  const invoiceRefs = [...consolidated.keys()].map(id => firestore.collection('invoices').doc(id));
  const invoiceSnaps = await Promise.all(invoiceRefs.map(ref => ref.get()));
  const validatedAllocations: Array<{ invoiceId: string; amount: number }> = [];
  for (let i = 0; i < invoiceRefs.length; i += 1) {
    const snap = invoiceSnaps[i];
    if (!snap.exists) throw new Error(`Invoice ${invoiceRefs[i].id} not found.`);
    const invoice = snap.data() as Invoice;
    if (invoice.customerId !== input.customerId) throw new Error(`Invoice ${invoice.id} belongs to a different customer.`);
    if (invoice.status === 'cancelled' || invoice.status === 'draft') throw new Error(`Invoice ${invoice.id} cannot receive a payment in status ${invoice.status}.`);
    const requested = consolidated.get(invoice.id)!;
    if (requested > money(invoice.balanceDue) + 0.005) throw new Error(`Allocation to invoice ${invoice.id} exceeds its outstanding balance.`);
    validatedAllocations.push({ invoiceId: invoice.id, amount: requested });
  }
  const allocatedAmount = money(validatedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  if (allocatedAmount > amount + 0.005) throw new Error('Invoice allocations exceed the received payment amount.');
  const unallocatedAmount = money(amount - allocatedAmount);

  const paymentId = await issueNextNumber('Payment');
  const receiptNumber = await issueNextNumber('Receipt');
  const now = new Date().toISOString();
  const paymentDoc: any = {
    id: paymentId,
    customerId: input.customerId,
    customerName: input.customerName || customer.fullName || input.customerId,
    contractId: input.contractId,
    reservationId: input.reservationId,
    invoiceId: validatedAllocations.length === 1 ? validatedAllocations[0].invoiceId : undefined,
    amount,
    method: input.method,
    status: validatedAllocations.length > 0 ? 'allocated' : 'received',
    referenceNumber: input.referenceNumber || '',
    allocatedTo: validatedAllocations,
    unallocatedAmount,
    receivedBy: actor.uid,
    receivedAt: now,
    receiptNumber,
    notes: input.notes || '',
    proofDocumentId: input.proofDocumentId,
    verificationStatus: 'pending_review',
    accountingPostingStatus: 'unposted',
    createdAt: now
  };

  await firestore.runTransaction(async tx => {
    // Re-read everything inside the transaction to prevent concurrent
    // allocations from overpaying an invoice after the pre-validation.
    const invoiceTxSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
    for (const ref of invoiceRefs) invoiceTxSnaps.push(await tx.get(ref));
    const customerTxSnap = await tx.get(customerRef);
    for (let i = 0; i < invoiceRefs.length; i += 1) {
      const snap = invoiceTxSnaps[i];
      if (!snap.exists) throw new Error(`Invoice ${invoiceRefs[i].id} no longer exists.`);
      const invoice = snap.data() as Invoice;
      const allocation = consolidated.get(invoice.id)!;
      if (allocation > money(invoice.balanceDue) + 0.005) throw new Error(`Concurrent allocation changed invoice ${invoice.id}; payment was not recorded.`);
    }
    tx.create(firestore.collection('payments').doc(paymentId), paymentDoc);
    for (let i = 0; i < invoiceRefs.length; i += 1) {
      const invoice = invoiceTxSnaps[i].data() as Invoice;
      const allocation = consolidated.get(invoice.id)!;
      const paidAmount = money((invoice.paidAmount || 0) + allocation);
      const balanceDue = Math.max(0, money((invoice.totalAmount || 0) - paidAmount));
      tx.set(invoiceRefs[i], { paidAmount, balanceDue, status: balanceDue === 0 ? 'paid' : 'partially_paid', updatedAt: now }, { merge: true });
    }
    if (customerTxSnap.exists && allocatedAmount > 0) {
      const outstanding = Number((customerTxSnap.data() as any).outstandingBalance || 0);
      tx.set(customerRef, { outstandingBalance: Math.max(0, money(outstanding - allocatedAmount)), updatedAt: now }, { merge: true });
    }
  });

  let accountingPostingStatus: SafeCustomerPaymentResult['accountingPostingStatus'] = 'unposted';
  let accountingJournalId: string | undefined;
  if (input.settlementAccountCode) {
    const journal = await postPaymentToAccounting(paymentId, input.settlementAccountCode, actor, recordAudit);
    accountingPostingStatus = 'posted';
    accountingJournalId = journal.id;
  }
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'Payment', entityId: paymentId, action: 'create',
    newValue: `Payment ${paymentId} recorded: ${amount.toFixed(2)} AED; allocated ${allocatedAmount.toFixed(2)}; unallocated credit ${unallocatedAmount.toFixed(2)}.`
  });
  return { paymentId, receiptNumber, amount, allocatedAmount, unallocatedAmount, allocations: validatedAllocations, accountingPostingStatus, accountingJournalId };
}

export async function allocateExistingCustomerPayment(
  paymentId: string,
  allocations: Array<{ invoiceId: string; amount: number }>,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<any> {
  if (!allocations.length) throw new Error('At least one allocation is required.');
  const firestore = db();
  const paymentRef = firestore.collection('payments').doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new Error('Payment not found.');
  const payment = paymentSnap.data() as Payment & { unallocatedAmount?: number };
  const available = money(payment.unallocatedAmount ?? Math.max(0, payment.amount - (payment.allocatedTo || []).reduce((sum, a) => sum + a.amount, 0)));
  const consolidated = new Map<string, number>();
  for (const allocation of allocations) consolidated.set(allocation.invoiceId, money((consolidated.get(allocation.invoiceId) || 0) + allocation.amount));
  const requestedTotal = money([...consolidated.values()].reduce((sum, value) => sum + value, 0));
  if (requestedTotal <= 0 || requestedTotal > available + 0.005) throw new Error('Requested allocation exceeds the payment’s unallocated credit.');
  const invoiceRefs = [...consolidated.keys()].map(id => firestore.collection('invoices').doc(id));
  const now = new Date().toISOString();
  let updatedPayment: any;

  await firestore.runTransaction(async tx => {
    const freshPaymentSnap = await tx.get(paymentRef);
    if (!freshPaymentSnap.exists) throw new Error('Payment no longer exists.');
    const freshPayment = freshPaymentSnap.data() as any;
    const freshAvailable = money(freshPayment.unallocatedAmount ?? Math.max(0, freshPayment.amount - (freshPayment.allocatedTo || []).reduce((sum: number, a: any) => sum + a.amount, 0)));
    if (requestedTotal > freshAvailable + 0.005) throw new Error('Concurrent allocation changed this payment; no allocation was applied.');
    const invoiceSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
    for (const ref of invoiceRefs) invoiceSnaps.push(await tx.get(ref));
    const customerRef = firestore.collection('customers').doc(freshPayment.customerId);
    const customerSnap = await tx.get(customerRef);

    const newAllocations = [...(freshPayment.allocatedTo || [])];
    for (let i = 0; i < invoiceRefs.length; i += 1) {
      const snap = invoiceSnaps[i];
      if (!snap.exists) throw new Error(`Invoice ${invoiceRefs[i].id} not found.`);
      const invoice = snap.data() as Invoice;
      if (invoice.customerId !== freshPayment.customerId) throw new Error(`Invoice ${invoice.id} belongs to a different customer.`);
      const amountToAllocate = consolidated.get(invoice.id)!;
      if (amountToAllocate > money(invoice.balanceDue) + 0.005) throw new Error(`Allocation exceeds invoice ${invoice.id} balance.`);
      const paidAmount = money((invoice.paidAmount || 0) + amountToAllocate);
      const balanceDue = Math.max(0, money(invoice.totalAmount - paidAmount));
      tx.set(invoiceRefs[i], { paidAmount, balanceDue, status: balanceDue === 0 ? 'paid' : 'partially_paid', updatedAt: now }, { merge: true });
      const existingIndex = newAllocations.findIndex((a: any) => a.invoiceId === invoice.id);
      if (existingIndex >= 0) newAllocations[existingIndex] = { invoiceId: invoice.id, amount: money(newAllocations[existingIndex].amount + amountToAllocate) };
      else newAllocations.push({ invoiceId: invoice.id, amount: amountToAllocate });
    }
    const newUnallocated = money(freshAvailable - requestedTotal);
    updatedPayment = { ...freshPayment, allocatedTo: newAllocations, unallocatedAmount: newUnallocated, status: 'allocated', updatedAt: now };
    tx.set(paymentRef, { allocatedTo: newAllocations, unallocatedAmount: newUnallocated, status: 'allocated', updatedAt: now }, { merge: true });
    if (customerSnap.exists) {
      const currentOutstanding = Number((customerSnap.data() as any).outstandingBalance || 0);
      tx.set(customerRef, { outstandingBalance: Math.max(0, money(currentOutstanding - requestedTotal)), updatedAt: now }, { merge: true });
    }
  });
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'Payment', entityId: paymentId, action: 'update',
    newValue: `Allocated ${requestedTotal.toFixed(2)} AED of existing customer credit to ${allocations.length} invoice allocation(s).`
  });
  return updatedPayment;
}

export async function linkBankReconciliationToAccounting(
  bankTransactionId: string,
  journalId: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<void> {
  const firestore = db();
  const [bankSnap, journalSnap] = await Promise.all([
    firestore.collection('bank_transactions').doc(bankTransactionId).get(),
    firestore.collection(COLLECTIONS.journals).doc(journalId).get()
  ]);
  if (!bankSnap.exists) throw new Error('Bank transaction not found.');
  if (!journalSnap.exists) throw new Error('Accounting journal not found.');
  const bankTxn = bankSnap.data() as any;
  if (!bankTxn.reconciled) throw new Error('Only a reconciled bank transaction can be linked to an accounting posting.');
  await firestore.collection('bank_transactions').doc(bankTransactionId).set({ accountingJournalId: journalId, accountingPostingStatus: 'posted', accountingLinkedAt: new Date().toISOString(), accountingLinkedBy: actor.uid }, { merge: true });
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'BankTransaction', entityId: bankTransactionId, action: 'reconcile',
    newValue: `Linked reconciled bank transaction to accounting journal ${journalId}.`
  });
}

export async function getFinancialReports(input?: { startDate?: string; endDate?: string; asOf?: string }) {
  const accounts = await getEffectiveChartOfAccounts();
  const journals = await listJournals(5000);
  const today = new Date().toISOString().slice(0, 10);
  const startDate = input?.startDate || `${today.slice(0, 7)}-01`;
  const endDate = input?.endDate || today;
  const asOf = input?.asOf || endDate;
  return {
    trialBalance: buildTrialBalance(journals, accounts, undefined, asOf),
    profitLoss: buildProfitLoss(journals, accounts, startDate, endDate),
    balanceSheet: buildBalanceSheet(journals, accounts, asOf),
    vat: buildVatSummary(journals, startDate, endDate),
    cashBook: buildCashBook(journals, accounts)
  };
}

export async function getARAging(asOfDate = new Date().toISOString().slice(0, 10)) {
  const [invoices, notes] = await Promise.all([
    collectionData<Invoice>('invoices'),
    listFinancialNotes()
  ]);
  const noteGroups = new Map<string, FinancialNote[]>();
  for (const note of notes) noteGroups.set(note.invoiceId, [...(noteGroups.get(note.invoiceId) || []), note]);
  const adjusted: Record<string, number> = {};
  for (const invoice of invoices) adjusted[invoice.id] = adjustedInvoiceBalance(invoice, noteGroups.get(invoice.id) || []);
  return buildARAging(invoices, asOfDate, adjusted);
}

export async function getAPAging(asOfDate = new Date().toISOString().slice(0, 10)) {
  return buildAPAging(await listPayables(), asOfDate);
}

export async function getVehicleProfitability() {
  const [journals, accounts, vehicles, contracts] = await Promise.all([
    listJournals(5000),
    getEffectiveChartOfAccounts(),
    collectionData<Vehicle>('vehicles'),
    collectionData<Contract>('contracts')
  ]);
  const names: Record<string, string> = {};
  const acquisition: Record<string, number> = {};
  for (const vehicle of vehicles) {
    names[vehicle.id] = `${vehicle.make || ''} ${vehicle.model || ''}`.trim();
    acquisition[vehicle.id] = money(Number((vehicle as any).purchasePrice || (vehicle as any).acquisitionCost || 0));
  }
  const rentalDays: Record<string, number> = {};
  for (const contract of contracts) {
    if (!['active', 'completed'].includes(contract.status)) continue;
    const start = new Date(contract.startDateTime).getTime();
    const end = new Date(contract.endDateTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    rentalDays[contract.vehicleId] = (rentalDays[contract.vehicleId] || 0) + Math.max(1, Math.ceil((end - start) / 86_400_000));
  }
  return buildVehicleProfitability(journals, accounts, names, rentalDays, acquisition);
}

export async function getPostingGaps(): Promise<PostingGap[]> {
  const [journals, invoices, payments, deposits, supplierInvoices, bankTransactions] = await Promise.all([
    listJournals(5000),
    collectionData<Invoice>('invoices'),
    collectionData<Payment>('payments'),
    collectionData<Deposit>('deposits'),
    collectionData<SupplierInvoice>('supplier_invoices'),
    collectionData<any>('bank_transactions')
  ]);
  const key = (sourceType: string, sourceId: string, sourceAction: string) => `${sourceType}:${sourceId}:${sourceAction}`;
  const posted = new Set(journals.map(journal => key(journal.sourceType, journal.sourceId, journal.sourceAction)));
  const gaps: PostingGap[] = [];
  for (const invoice of invoices) {
    if (!['draft', 'cancelled'].includes(invoice.status) && !posted.has(key('Invoice', invoice.id, 'issue'))) {
      gaps.push({ sourceType: 'Invoice', sourceId: invoice.id, date: invoice.issueDate, description: `Customer invoice ${invoice.id}`, amount: invoice.totalAmount, reason: 'Issued invoice has no accounting journal. Use controlled lazy posting; do not backfill production automatically.' });
    }
  }
  for (const payment of payments) {
    if (payment.status !== 'refunded' && !posted.has(key('Payment', payment.id, 'receive'))) {
      gaps.push({ sourceType: 'Payment', sourceId: payment.id, date: payment.receivedAt, description: `Customer payment ${payment.receiptNumber || payment.id}`, amount: payment.amount, reason: 'Payment is recorded operationally but has not been assigned a cash/bank accounting account.' });
    }
  }
  for (const deposit of deposits) {
    if ((deposit as any).holdType !== 'gateway_authorization' && !posted.has(key('Deposit', deposit.id, 'receive'))) {
      gaps.push({ sourceType: 'Deposit', sourceId: deposit.id, date: deposit.createdAt, description: `Security deposit ${deposit.id}`, amount: deposit.amount, reason: 'Manual deposit has not been posted to the customer-deposit liability control account.' });
    }
  }
  for (const supplierInvoice of supplierInvoices) {
    if (supplierInvoice.status === 'approved' && !posted.has(key('SupplierInvoice', supplierInvoice.id, 'post_ap'))) {
      gaps.push({ sourceType: 'SupplierInvoice', sourceId: supplierInvoice.id, date: supplierInvoice.invoiceDate, description: `Supplier invoice ${supplierInvoice.invoiceNumber}`, amount: supplierInvoice.amount, reason: 'Approved supplier invoice needs explicit net/VAT/due-date metadata before AP posting; VAT is not guessed.' });
    }
  }
  for (const transaction of bankTransactions) {
    if (transaction.reconciled && !(transaction as any).accountingJournalId) {
      gaps.push({ sourceType: 'BankTransaction', sourceId: transaction.id, date: transaction.date, description: transaction.description || `Bank transaction ${transaction.id}`, amount: money(transaction.credit || transaction.debit || 0), reason: 'Reconciliation exists but is not yet linked to an accounting journal.' });
    }
  }
  return gaps.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function getFinanceDashboard(): Promise<FinanceDashboardSummary> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [accounts, journals, payables, invoices, deposits, gaps, periods, notes] = await Promise.all([
    getEffectiveChartOfAccounts(),
    listJournals(5000),
    listPayables(),
    collectionData<Invoice>('invoices'),
    collectionData<Deposit>('deposits'),
    getPostingGaps(),
    listPeriods(),
    listFinancialNotes()
  ]);
  const todayPL = buildProfitLoss(journals, accounts, today, today);
  const monthPL = buildProfitLoss(journals, accounts, monthStart, today);
  const yearPL = buildProfitLoss(journals, accounts, yearStart, today);
  const cashBook = buildCashBook(journals, accounts);
  const cashPosition = cashBook.length ? cashBook[cashBook.length - 1].runningBalance : 0;
  const noteGroups = new Map<string, FinancialNote[]>();
  for (const note of notes) noteGroups.set(note.invoiceId, [...(noteGroups.get(note.invoiceId) || []), note]);
  const arOutstanding = money(invoices.filter(i => i.status !== 'cancelled').reduce((sum, invoice) => sum + adjustedInvoiceBalance(invoice, noteGroups.get(invoice.id) || []), 0));
  const apOutstanding = money(payables.filter(p => p.status !== 'cancelled').reduce((sum, p) => sum + p.balance, 0));
  const vat = buildVatSummary(journals, monthStart, today);
  const securityDepositsHeld = money(deposits.filter(d => ['held', 'collected', 'partially_refunded', 'applied'].includes(d.status)).reduce((sum, d) => sum + (d.balance || 0), 0));
  return {
    generatedAt: new Date().toISOString(),
    revenueToday: todayPL.revenue,
    revenueMonth: monthPL.revenue,
    revenueYear: yearPL.revenue,
    expensesMonth: monthPL.expenses,
    grossProfitMonth: monthPL.grossProfit,
    netProfitMonth: monthPL.netProfit,
    cashPosition,
    arOutstanding,
    apOutstanding,
    vatPayable: vat.vatPayable,
    securityDepositsHeld,
    unpostedSourceCount: gaps.length,
    closedPeriodCount: periods.filter(period => period.status === 'closed').length
  };
}

export async function getSupplierStatement(supplierId: string) {
  const payables = (await listPayables()).filter(payable => payable.supplierId === supplierId);
  const payments = (await collectionData<AccountsPayablePayment>(COLLECTIONS.payablePayments)).filter(payment => payment.supplierId === supplierId);
  return {
    supplierId,
    supplierName: payables[0]?.supplierName || payments[0]?.supplierName || supplierId,
    totalInvoiced: money(payables.reduce((sum, p) => sum + p.totalAmount, 0)),
    totalPaid: money(payments.reduce((sum, p) => sum + p.amount, 0)),
    outstanding: money(payables.reduce((sum, p) => sum + p.balance, 0)),
    payables,
    payments: payments.sort((a, b) => b.paidAt.localeCompare(a.paidAt))
  };
}

export async function getCustomerAccountingStatement(customerId: string) {
  const [invoices, payments, notes] = await Promise.all([
    collectionData<Invoice>('invoices'),
    collectionData<Payment>('payments'),
    listFinancialNotes()
  ]);
  const customerInvoices = invoices.filter(invoice => invoice.customerId === customerId).sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  const customerPayments = payments.filter(payment => payment.customerId === customerId).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const customerNotes = notes.filter(note => note.customerId === customerId).sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  return {
    customerId,
    customerName: customerInvoices[0]?.customerName || customerPayments[0]?.customerName || customerNotes[0]?.customerName || customerId,
    totalInvoiced: money(customerInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0)),
    totalPaid: money(customerPayments.reduce((sum, payment) => sum + payment.amount, 0)),
    totalCreditNotes: money(customerNotes.filter(note => note.type === 'credit_note' && note.status === 'posted').reduce((sum, note) => sum + note.totalAmount, 0)),
    totalDebitNotes: money(customerNotes.filter(note => note.type === 'debit_note' && note.status === 'posted').reduce((sum, note) => sum + note.totalAmount, 0)),
    outstanding: money(customerInvoices.reduce((sum, invoice) => sum + adjustedInvoiceBalance(invoice, customerNotes.filter(note => note.invoiceId === invoice.id)), 0)),
    invoices: customerInvoices,
    payments: customerPayments,
    notes: customerNotes
  };
}
