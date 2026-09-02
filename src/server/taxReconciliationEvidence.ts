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
  bankTransactions: any[]
): TaxReconciliationPostingGapEvidence[] {
  const key = (sourceType: string, sourceId: string, sourceAction: string) => `${sourceType}:${sourceId}:${sourceAction}`;
  // Match the accounting engine's posting-gap invariant: a historical source
  // remains accounted for when its original journal exists even if that
  // journal was later reversed through a controlled reversal journal.
  const journalKeys = new Set(allPeriodJournals.map(journal => key(journal.sourceType, journal.sourceId, journal.sourceAction)));
  const gaps: TaxReconciliationPostingGapEvidence[] = [];

  for (const invoice of invoices) {
    if (!dateInPeriod(invoice.issueDate, period)) continue;
    if (!['draft', 'cancelled'].includes(invoice.status) && !journalKeys.has(key('Invoice', invoice.id, 'issue'))) {
      gaps.push({ sourceType: 'Invoice', sourceId: String(invoice.id), date: String(invoice.issueDate).slice(0, 10), description: `Customer invoice ${invoice.id}`, amount: reconciliationMoney(invoice.totalAmount), reason: 'Issued invoice has no accounting journal. Use controlled lazy posting; do not backfill production automatically.' });
    }
  }
  for (const payment of payments) {
    if (!dateInPeriod(payment.receivedAt, period)) continue;
    if (payment.status !== 'refunded' && !journalKeys.has(key('Payment', payment.id, 'receive'))) {
      gaps.push({ sourceType: 'Payment', sourceId: String(payment.id), date: String(payment.receivedAt).slice(0, 10), description: `Customer payment ${payment.receiptNumber || payment.id}`, amount: reconciliationMoney(payment.amount), reason: 'Payment is recorded operationally but has not been assigned a cash/bank accounting account.' });
    }
  }
  for (const deposit of deposits) {
    if (!dateInPeriod(deposit.createdAt, period)) continue;
    if (deposit.holdType !== 'gateway_authorization' && !journalKeys.has(key('Deposit', deposit.id, 'receive'))) {
      gaps.push({ sourceType: 'Deposit', sourceId: String(deposit.id), date: String(deposit.createdAt).slice(0, 10), description: `Security deposit ${deposit.id}`, amount: reconciliationMoney(deposit.amount), reason: 'Manual deposit has not been posted to the customer-deposit liability control account.' });
    }
  }
  for (const supplierInvoice of supplierInvoices) {
    if (!dateInPeriod(supplierInvoice.invoiceDate, period)) continue;
    if (supplierInvoice.status === 'approved' && !journalKeys.has(key('SupplierInvoice', supplierInvoice.id, 'post_ap'))) {
      gaps.push({ sourceType: 'SupplierInvoice', sourceId: String(supplierInvoice.id), date: String(supplierInvoice.invoiceDate).slice(0, 10), description: `Supplier invoice ${supplierInvoice.invoiceNumber}`, amount: reconciliationMoney(supplierInvoice.amount), reason: 'Approved supplier invoice needs explicit net/VAT/due-date metadata before AP posting; VAT is not guessed.' });
    }
  }
  for (const transaction of bankTransactions) {
    if (!dateInPeriod(transaction.date, period)) continue;
    if (transaction.reconciled && !transaction.accountingJournalId) {
      gaps.push({ sourceType: 'BankTransaction', sourceId: String(transaction.id), date: String(transaction.date).slice(0, 10), description: transaction.description || `Bank transaction ${transaction.id}`, amount: reconciliationMoney(transaction.credit || transaction.debit || 0), reason: 'Reconciliation exists but is not yet linked to an accounting journal.' });
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
  const [journalSnap, invoiceSnap, paymentSnap, depositSnap, supplierInvoiceSnap, bankTransactionSnap] = await Promise.all([
    tx.get(journalQuery),
    tx.get(firestore.collection('invoices')),
    tx.get(firestore.collection('payments')),
    tx.get(firestore.collection('deposits')),
    tx.get(firestore.collection('supplier_invoices')),
    tx.get(firestore.collection('bank_transactions'))
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
      bankTransactionSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    )
  };
}
