import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { fingerprintRequest, runIdempotent } from './idempotency';
import type { RecordAuditFn } from './businessRules';
import { accountingPeriodKey, adjustedInvoiceBalance, assertJournalAccounts, money, validateJournalLines } from '../lib/accounting';
import { getEffectiveChartOfAccounts, type AccountingActor } from './accounting';
import type { Invoice, Payment } from '../types';
import type { AccountingPeriod, FinancialNote, JournalEntry, JournalLine } from '../accounting/types';

const JOURNALS = 'accounting_journals';
const PERIODS = 'accounting_periods';
const NOTES = 'accounting_financial_notes';
const AUDIT_RECOVERY = 'accounting_audit_recovery';

function db() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function finiteMoney(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label} must be a finite number.`);
  return money(numeric);
}

function refundJournalId(paymentId: string, refundId: string): string {
  const digest = crypto.createHash('sha256').update(`Payment:${paymentId}:gateway-refund:${refundId}`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

/**
 * Reverses a gateway-confirmed invoice receipt without creating a parallel
 * ledger. This function is intentionally narrow: the payment must be a
 * trusted, accounting-posted online-link receipt with exactly one invoice
 * allocation (the invariant produced by invoice PaymentIntents).
 */
export async function applyGatewayAccountingPaymentRefund(
  paymentId: string,
  refundAmount: number,
  refundId: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<{ payment: Payment; invoice: Invoice; journal: JournalEntry; replayed: boolean }> {
  if (!paymentId || !refundId) throw new Error('Payment and refund identifiers are required.');
  const amount = finiteMoney(refundAmount, 'Refund amount');
  if (amount <= 0) throw new Error('Refund amount must be greater than zero.');

  const firestore = db();
  const paymentRef = firestore.collection('payments').doc(paymentId);
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const periodKey = accountingPeriodKey(date);
  const jId = refundJournalId(paymentId, refundId);
  const requestFingerprint = fingerprintRequest({ paymentId, refundId, amount });
  const accounts = await getEffectiveChartOfAccounts();

  const outcome = await runIdempotent<{ payment: Payment; invoice: Invoice; journal: JournalEntry }>(
    `accounting-gateway-payment-refund:${paymentId}`,
    refundId,
    async tx => {
      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists) throw new Error('Gateway payment not found.');
      const payment = paymentSnap.data() as Payment & {
        refundedAmount?: number;
        accountingPostingStatus?: string;
        accountingJournalId?: string;
        accountingAccountCode?: string;
      };

      if (!payment.gatewayPaymentIntentId || payment.method !== 'online_link') throw new Error('Only gateway-confirmed online-link receipts can use this refund path.');
      if (payment.verificationStatus !== 'verified') throw new Error('Gateway payment verification evidence is missing.');
      if (payment.accountingPostingStatus !== 'posted' || !payment.accountingJournalId) throw new Error('Gateway payment is not posted to accounting.');
      const allocations = Array.isArray(payment.allocatedTo) ? payment.allocatedTo : [];
      if (allocations.length !== 1 || !allocations[0]?.invoiceId) throw new Error('Gateway invoice refund requires exactly one authoritative invoice allocation.');
      const allocationAmount = finiteMoney(allocations[0].amount, 'Original invoice allocation');
      const originalAmount = finiteMoney(payment.amount, 'Original payment amount');
      const alreadyRefunded = finiteMoney((payment as any).refundedAmount || 0, 'Previously refunded amount');
      const remainingRefundable = money(originalAmount - alreadyRefunded);
      if (amount > remainingRefundable + 0.005) throw new Error('Refund exceeds the remaining gateway payment amount.');
      if (amount > allocationAmount - alreadyRefunded + 0.005) throw new Error('Refund exceeds the remaining invoice allocation.');

      const invoiceRef = firestore.collection('invoices').doc(allocations[0].invoiceId);
      const customerRef = firestore.collection('customers').doc(payment.customerId);
      const journalRef = firestore.collection(JOURNALS).doc(jId);
      const periodRef = firestore.collection(PERIODS).doc(periodKey);
      const notesQuery = firestore.collection(NOTES).where('invoiceId', '==', allocations[0].invoiceId);
      const [invoiceSnap, customerSnap, journalSnap, periodSnap, notesSnap] = await Promise.all([
        tx.get(invoiceRef), tx.get(customerRef), tx.get(journalRef), tx.get(periodRef), tx.get(notesQuery)
      ]);
      if (!invoiceSnap.exists) throw new Error('Linked invoice not found.');
      if (!customerSnap.exists) throw new Error('Payment customer not found.');
      if (journalSnap.exists) throw new Error('Duplicate gateway-refund journal detected.');
      if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') throw new Error(`Accounting period ${periodKey} is closed.`);

      const invoice = invoiceSnap.data() as Invoice;
      if (invoice.customerId !== payment.customerId) throw new Error('Payment and invoice customer bindings do not match.');
      const invoicePaid = finiteMoney(invoice.paidAmount || 0, 'Invoice paid amount');
      const invoiceTotal = finiteMoney(invoice.totalAmount || 0, 'Invoice total');
      if (amount > invoicePaid + 0.005) throw new Error('Refund exceeds the amount currently credited to the invoice.');
      const customer = customerSnap.data() as any;
      const outstanding = Number(customer.outstandingBalance || 0);
      if (!Number.isFinite(outstanding)) throw new Error('Customer outstanding balance is invalid and requires accounting review.');

      const settlementAccountCode = String(payment.accountingAccountCode || '');
      const settlement = accounts.find(account => account.code === settlementAccountCode);
      if (!settlement || !settlement.active || settlement.accountClass !== 'asset' || !settlement.cashEquivalent) {
        throw new Error('Original gateway settlement account is unavailable or invalid.');
      }
      const lines: JournalLine[] = [
        { accountCode: '1300', debit: amount, credit: 0, dimensions: { customerId: payment.customerId, contractId: payment.contractId, invoiceId: invoice.id } },
        { accountCode: settlementAccountCode, debit: 0, credit: amount, dimensions: { customerId: payment.customerId, contractId: payment.contractId, invoiceId: invoice.id } }
      ];
      assertJournalAccounts(lines, accounts, false);
      const totals = validateJournalLines(lines);
      const journal: JournalEntry = {
        id: jId,
        date,
        periodKey,
        currency: 'AED',
        sourceType: 'Payment',
        sourceId: paymentId,
        sourceAction: `gateway-refund:${refundId}`,
        reference: refundId,
        memo: `Gateway-confirmed refund ${refundId} for receipt ${payment.receiptNumber}`,
        status: 'posted',
        lines,
        totalDebit: totals.totalDebit,
        totalCredit: totals.totalCredit,
        createdBy: actor.uid,
        createdByName: actor.name,
        createdByRole: actor.role,
        createdAt: now,
        postedAt: now
      };

      const newPaidAmount = Math.max(0, money(invoicePaid - amount));
      const newBalanceDue = Math.max(0, money(invoiceTotal - newPaidAmount));
      const notes = notesSnap.docs.map(doc => doc.data() as FinancialNote);
      const adjustedDue = adjustedInvoiceBalance({ ...invoice, paidAmount: newPaidAmount, balanceDue: newBalanceDue } as Invoice, notes);
      const nextRefunded = money(alreadyRefunded + amount);
      const fullyRefunded = nextRefunded + 0.005 >= originalAmount;
      const updatedPayment = {
        ...payment,
        refundedAmount: nextRefunded,
        status: fullyRefunded ? 'refunded' : 'allocated',
        updatedAt: now
      } as Payment;
      const updatedInvoice = {
        ...invoice,
        paidAmount: newPaidAmount,
        balanceDue: newBalanceDue,
        status: adjustedDue <= 0.005 ? 'paid' : newPaidAmount > 0 ? 'partially_paid' : 'issued',
        updatedAt: now
      } as Invoice;

      tx.set(paymentRef, { refundedAmount: nextRefunded, status: updatedPayment.status, updatedAt: now }, { merge: true });
      tx.set(invoiceRef, { paidAmount: newPaidAmount, balanceDue: newBalanceDue, status: updatedInvoice.status, updatedAt: now }, { merge: true });
      tx.set(customerRef, { outstandingBalance: money(outstanding + amount), updatedAt: now }, { merge: true });
      tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);
      return { payment: updatedPayment, invoice: updatedInvoice, journal };
    },
    requestFingerprint
  );

  if (!outcome.replayed) {
    const auditPayload = {
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'Payment',
      entityId: paymentId,
      action: 'refund' as const,
      newValue: `Gateway refund ${refundId} reversed ${amount.toFixed(2)} AED of receipt ${paymentId}; accounting journal ${outcome.result.journal.id}.`
    };
    try {
      await recordAudit(auditPayload);
    } catch (auditError: any) {
      await firestore.collection(AUDIT_RECOVERY).doc(`GatewayPaymentRefund_${refundId}`).set({
        id: `GatewayPaymentRefund_${refundId}`,
        status: 'pending',
        auditPayload,
        error: String(auditError?.message || auditError || 'Audit write failed'),
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(recoveryError => console.error('[accounting] gateway refund audit recovery persistence failed:', recoveryError));
    }
  }

  return { ...outcome.result, replayed: outcome.replayed };
}
