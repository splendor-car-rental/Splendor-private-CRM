import crypto from 'node:crypto';
import admin from 'firebase-admin';
import type { JournalEntry } from '../accounting/types';
import type { TaxReconciliationPostingGapEvidence } from '../tax/reconciliationTypes';
import type { TaxPeriod } from '../tax/types';

export const TAX_RECONCILIATION_JOURNAL_COLLECTION = 'accounting_journals';

export function reconciliationMoney(value: unknown): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function dateInPeriod(value: unknown, period: TaxPeriod): boolean {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= period.periodStart && date <= period.periodEnd;
}

function journalAmountOnEitherSide(journal: JournalEntry, amount: number): boolean {
  return journal.lines.some(line =>
    Math.abs(reconciliationMoney(line.debit) - amount) <= 0.01 ||
    Math.abs(reconciliationMoney(line.credit) - amount) <= 0.01
  );
}

export function journalEvidenceHash(journals: JournalEntry[]): string {
  const normalized = [...journals]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map(journal => ({
      id: journal.id,
      date: journal.date,
      periodKey: journal.periodKey,
      currency: journal.currency,
      sourceType: journal.sourceType,
      sourceId: journal.sourceId,
      sourceAction: journal.sourceAction,
      status: journal.status,
      totalDebit: reconciliationMoney(journal.totalDebit),
      totalCredit: reconciliationMoney(journal.totalCredit),
      reversalJournalId: journal.reversalJournalId,
      reversalOfJournalId: journal.reversalOfJournalId,
      lines: journal.lines.map(line => ({
        accountCode: line.accountCode,
        debit: reconciliationMoney(line.debit),
        credit: reconciliationMoney(line.credit),
        dimensions: line.dimensions || null
      }))
    }));
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function buildPostingGaps(
  period: TaxPeriod,
  allPeriodJournals: JournalEntry[],
  invoices: any[],
  payments: any[],
  deposits: any[],
  supplierInvoices: any[],
  bankTransactions: any[],
  charges: any[] = []
): TaxReconciliationPostingGapEvidence[] {
  const key = (sourceType: string, sourceId: string, sourceAction: string) => `${sourceType}:${sourceId}:${sourceAction}`;
  const journalKeys = new Set(allPeriodJournals.map(journal => key(journal.sourceType, journal.sourceId, journal.sourceAction)));
  const journalById = new Map(allPeriodJournals.map(journal => [journal.id, journal]));
  const depositJournals = new Map<string, JournalEntry[]>();
  for (const journal of allPeriodJournals) {
    if (journal.sourceType !== 'Deposit') continue;
    depositJournals.set(journal.sourceId, [...(depositJournals.get(journal.sourceId) || []), journal]);
  }
  const gaps: TaxReconciliationPostingGapEvidence[] = [];

  const addGap = (sourceType: string, sourceId: string, date: string, description: string, amount: unknown, reason: string) => {
    gaps.push({ sourceType, sourceId: String(sourceId), date: String(date).slice(0, 10), description, amount: reconciliationMoney(amount), reason });
  };

  for (const invoice of invoices) {
    if (!dateInPeriod(invoice.issueDate, period)) continue;
    if (!['draft', 'cancelled'].includes(invoice.status) && !journalKeys.has(key('Invoice', invoice.id, 'issue'))) {
      addGap('Invoice', invoice.id, invoice.issueDate, `Customer invoice ${invoice.id}`, invoice.totalAmount, 'Issued invoice has no accounting journal. Use controlled lazy posting; do not backfill production automatically.');
    }
  }
  for (const payment of payments) {
    if (!dateInPeriod(payment.receivedAt, period)) continue;
    if (payment.status !== 'refunded' && !journalKeys.has(key('Payment', payment.id, 'receive'))) {
      addGap('Payment', payment.id, payment.receivedAt, `Customer payment ${payment.receiptNumber || payment.id}`, payment.amount, 'Payment is recorded operationally but has not been assigned a cash/bank accounting account.');
    }
  }
  for (const deposit of deposits) {
    if (dateInPeriod(deposit.createdAt, period) && deposit.holdType !== 'gateway_authorization' && !journalKeys.has(key('Deposit', deposit.id, 'receive'))) {
      addGap('Deposit', deposit.id, deposit.createdAt, `Security deposit ${deposit.id}`, deposit.amount, 'Manual deposit has not been posted to the customer-deposit liability control account.');
    }

    const related = depositJournals.get(String(deposit.id)) || [];
    const appliedInLedger = reconciliationMoney(related
      .filter(journal => journal.sourceAction.startsWith('apply:'))
      .reduce((sum, journal) => sum + Number(journal.totalDebit || 0), 0));
    const refundedInLedger = reconciliationMoney(related
      .filter(journal => journal.sourceAction.startsWith('refund:'))
      .reduce((sum, journal) => sum + Number(journal.totalDebit || 0), 0));
    const operationalApplied = reconciliationMoney(deposit.appliedAmount || 0);
    const operationalRefunded = reconciliationMoney(deposit.refundedAmount || 0);
    const lifecycleDate = deposit.updatedAt || deposit.refundDate || deposit.createdAt;
    if (dateInPeriod(lifecycleDate, period) && operationalApplied > appliedInLedger + 0.01) {
      addGap('DepositApplication', deposit.id, lifecycleDate, `Security deposit ${deposit.id} application`, operationalApplied - appliedInLedger, 'Operational deposit application exceeds posted deposit-application journal evidence.');
    }
    if (dateInPeriod(deposit.refundDate || lifecycleDate, period) && operationalRefunded > refundedInLedger + 0.01) {
      addGap('DepositRefund', deposit.id, deposit.refundDate || lifecycleDate, `Security deposit ${deposit.id} refund`, operationalRefunded - refundedInLedger, 'Operational deposit refund exceeds posted deposit-refund journal evidence.');
    }
  }
  for (const supplierInvoice of supplierInvoices) {
    if (!dateInPeriod(supplierInvoice.invoiceDate, period)) continue;
    if (supplierInvoice.status === 'approved' && !journalKeys.has(key('SupplierInvoice', supplierInvoice.id, 'post_ap'))) {
      addGap('SupplierInvoice', supplierInvoice.id, supplierInvoice.invoiceDate, `Supplier invoice ${supplierInvoice.invoiceNumber}`, supplierInvoice.amount, 'Approved supplier invoice needs explicit net/VAT/due-date metadata before AP posting; VAT is not guessed.');
    }
  }
  for (const charge of charges) {
    const chargeDate = charge.timestamp || charge.approvedAt || charge.createdAt;
    if (!dateInPeriod(chargeDate, period) || charge.approvalStatus !== 'approved') continue;
    if (!journalKeys.has(key('AdditionalCharge', charge.id, 'approve'))) {
      addGap('AdditionalCharge', charge.id, chargeDate, `Approved additional charge ${charge.id}`, charge.totalAmount, 'Approved additional charge has no posted Accounts Receivable/revenue/VAT journal.');
    }
  }
  for (const transaction of bankTransactions) {
    if (!dateInPeriod(transaction.date, period) || !transaction.reconciled) continue;
    const journalId = String(transaction.accountingJournalId || '');
    if (!journalId) {
      addGap('BankTransaction', transaction.id, transaction.date, transaction.description || `Bank transaction ${transaction.id}`, transaction.credit || transaction.debit || 0, 'Reconciliation exists but is not linked to an accounting journal.');
      continue;
    }
    const journal = journalById.get(journalId);
    const amount = reconciliationMoney(transaction.credit || transaction.debit || 0);
    if (!journal || journal.status !== 'posted') {
      addGap('BankTransaction', transaction.id, transaction.date, transaction.description || `Bank transaction ${transaction.id}`, amount, 'Linked accounting journal is missing from the authoritative period ledger or is not posted.');
      continue;
    }
    if (String(journal.date).slice(0, 10) !== String(transaction.date).slice(0, 10)) {
      addGap('BankTransaction', transaction.id, transaction.date, transaction.description || `Bank transaction ${transaction.id}`, amount, 'Linked accounting journal date does not match the bank transaction date.');
      continue;
    }
    if (amount <= 0 || !journalAmountOnEitherSide(journal, amount)) {
      addGap('BankTransaction', transaction.id, transaction.date, transaction.description || `Bank transaction ${transaction.id}`, amount, 'Linked accounting journal does not contain a debit/credit amount matching the reconciled bank transaction.');
    }
  }

  return gaps.sort((a, b) => a.date.localeCompare(b.date) || a.sourceType.localeCompare(b.sourceType) || a.sourceId.localeCompare(b.sourceId));
}

export async function readAuthoritativeReconciliationEvidence(
  tx: admin.firestore.Transaction,
  firestore: admin.firestore.Firestore,
  period: TaxPeriod
): Promise<{ postedJournals: JournalEntry[]; postingGaps: TaxReconciliationPostingGapEvidence[] }> {
  const journalQuery = firestore.collection(TAX_RECONCILIATION_JOURNAL_COLLECTION)
    .where('date', '>=', period.periodStart)
    .where('date', '<=', period.periodEnd);
  const [journalSnap, invoiceSnap, paymentSnap, depositSnap, supplierInvoiceSnap, bankTransactionSnap, chargeSnap] = await Promise.all([
    tx.get(journalQuery),
    tx.get(firestore.collection('invoices')),
    tx.get(firestore.collection('payments')),
    tx.get(firestore.collection('deposits')),
    tx.get(firestore.collection('supplier_invoices')),
    tx.get(firestore.collection('bank_transactions')),
    tx.get(firestore.collection('charges'))
  ]);
  const allPeriodJournals = journalSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry));
  const postedJournals = allPeriodJournals.filter(journal => journal.status === 'posted');
  return {
    postedJournals,
    postingGaps: buildPostingGaps(
      period,
      allPeriodJournals,
      invoiceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      paymentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      depositSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      supplierInvoiceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      bankTransactionSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      chargeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    )
  };
}
