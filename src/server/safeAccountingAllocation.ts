import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { fingerprintRequest, runIdempotent } from './idempotency.js';
import type { RecordAuditFn } from './businessRules.js';
import { ACCOUNTING_CONTROL_ACCOUNTS } from '../config/accounting.js';
import { accountingPeriodKey, adjustedInvoiceBalance, assertJournalAccounts, money, validateJournalLines } from '../lib/accounting.js';
import { getEffectiveChartOfAccounts, type AccountingActor } from './accounting.js';
import type { Invoice, Payment } from '../types/index.js';
import type { AccountingPeriod, FinancialNote, JournalEntry, JournalLine } from '../accounting/types.js';

const JOURNAL_COLLECTION = 'accounting_journals';
const PERIOD_COLLECTION = 'accounting_periods';
const NOTE_COLLECTION = 'accounting_financial_notes';
const AUDIT_RECOVERY_COLLECTION = 'accounting_audit_recovery';

function db() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function allocationJournalId(paymentId: string, idempotencyKey: string): string {
  const digest = crypto.createHash('sha256').update(`PaymentAllocation:${paymentId}:${idempotencyKey}`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

export async function allocateCustomerCreditAtomic(
  paymentId: string,
  allocations: Array<{ invoiceId: string; amount: number }>,
  actor: AccountingActor,
  idempotencyKey: string | undefined,
  recordAudit: RecordAuditFn
): Promise<{ payment: Payment & { unallocatedAmount?: number }; journal: JournalEntry; replayed: boolean }> {
  if (!idempotencyKey) throw new Error('Idempotency-Key is required for customer-credit allocation.');
  if (!allocations.length) throw new Error('At least one allocation is required.');

  const consolidated = new Map<string, number>();
  for (const allocation of allocations) {
    const amount = money(allocation.amount);
    if (!allocation.invoiceId || amount <= 0) throw new Error('Every allocation requires an invoice and positive amount.');
    consolidated.set(allocation.invoiceId, money((consolidated.get(allocation.invoiceId) || 0) + amount));
  }
  const requestedTotal = money([...consolidated.values()].reduce((sum, value) => sum + value, 0));
  const accounts = await getEffectiveChartOfAccounts();
  const firestore = db();
  const paymentRef = firestore.collection('payments').doc(paymentId);
  const invoiceRefs = [...consolidated.keys()].map(id => firestore.collection('invoices').doc(id));
  const noteQueries = invoiceRefs.map(ref => firestore.collection(NOTE_COLLECTION).where('invoiceId', '==', ref.id));
  const journalRef = firestore.collection(JOURNAL_COLLECTION).doc(allocationJournalId(paymentId, idempotencyKey));
  const today = new Date().toISOString().slice(0, 10);
  const periodRef = firestore.collection(PERIOD_COLLECTION).doc(accountingPeriodKey(today));
  const requestFingerprint = fingerprintRequest({ paymentId, allocations: [...consolidated.entries()].sort(([a], [b]) => a.localeCompare(b)) });

  const outcome = await runIdempotent<{ payment: Payment & { unallocatedAmount?: number }; journal: JournalEntry }>(
    `accounting-payment-allocation:${paymentId}`,
    idempotencyKey,
    async tx => {
      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists) throw new Error('Payment not found.');
      const payment = paymentSnap.data() as Payment & { unallocatedAmount?: number; accountingPostingStatus?: string; accountingJournalId?: string };
      if (payment.accountingPostingStatus !== 'posted' || !payment.accountingJournalId) {
        throw new Error('The received payment must be posted to accounting before customer credit can be allocated.');
      }
      const available = money(payment.unallocatedAmount ?? Math.max(0, payment.amount - (payment.allocatedTo || []).reduce((sum, item) => sum + item.amount, 0)));
      if (requestedTotal > available + 0.005) throw new Error('Requested allocation exceeds the unallocated customer credit.');

      const invoiceSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
      for (const ref of invoiceRefs) invoiceSnaps.push(await tx.get(ref));
      const noteSnaps: FirebaseFirestore.QuerySnapshot[] = [];
      for (const query of noteQueries) noteSnaps.push(await tx.get(query));
      const customerRef = firestore.collection('customers').doc(payment.customerId);
      const [customerSnap, periodSnap, existingJournal] = await Promise.all([
        tx.get(customerRef),
        tx.get(periodRef),
        tx.get(journalRef)
      ]);
      if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') throw new Error(`Accounting period ${accountingPeriodKey(today)} is closed.`);
      if (existingJournal.exists) throw new Error('Duplicate customer-credit allocation journal detected.');

      const newAllocations = [...(payment.allocatedTo || [])];
      const arLines: JournalLine[] = [];
      for (let i = 0; i < invoiceRefs.length; i += 1) {
        const snap = invoiceSnaps[i];
        if (!snap.exists) throw new Error(`Invoice ${invoiceRefs[i].id} not found.`);
        const invoice = snap.data() as Invoice;
        if (invoice.customerId !== payment.customerId) throw new Error(`Invoice ${invoice.id} belongs to a different customer.`);
        if (invoice.status === 'draft' || invoice.status === 'cancelled') throw new Error(`Invoice ${invoice.id} cannot receive an allocation in status ${invoice.status}.`);
        const notes = noteSnaps[i].docs.map(doc => doc.data() as FinancialNote);
        const availableInvoiceBalance = adjustedInvoiceBalance(invoice, notes);
        const amountToAllocate = consolidated.get(invoice.id)!;
        if (amountToAllocate > availableInvoiceBalance + 0.005) throw new Error(`Allocation exceeds invoice ${invoice.id} accounting-adjusted balance.`);

        const paidAmount = money((invoice.paidAmount || 0) + amountToAllocate);
        const balanceDue = Math.max(0, money((invoice.totalAmount || 0) - paidAmount));
        tx.set(invoiceRefs[i], {
          paidAmount,
          balanceDue,
          status: adjustedInvoiceBalance({ ...invoice, paidAmount, balanceDue } as Invoice, notes) <= 0.005 ? 'paid' : 'partially_paid',
          updatedAt: new Date().toISOString()
        }, { merge: true });

        const existingIndex = newAllocations.findIndex(item => item.invoiceId === invoice.id);
        if (existingIndex >= 0) newAllocations[existingIndex] = { invoiceId: invoice.id, amount: money(newAllocations[existingIndex].amount + amountToAllocate) };
        else newAllocations.push({ invoiceId: invoice.id, amount: amountToAllocate });
        arLines.push({
          accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable,
          debit: 0,
          credit: amountToAllocate,
          dimensions: { customerId: payment.customerId, invoiceId: invoice.id, contractId: invoice.contractId, reservationId: invoice.reservationId }
        });
      }

      const newUnallocated = money(available - requestedTotal);
      const now = new Date().toISOString();
      const updatedPayment = {
        ...payment,
        allocatedTo: newAllocations,
        unallocatedAmount: newUnallocated,
        status: 'allocated' as const,
        updatedAt: now
      };
      tx.set(paymentRef, { allocatedTo: newAllocations, unallocatedAmount: newUnallocated, status: 'allocated', updatedAt: now }, { merge: true });
      if (customerSnap.exists) {
        const currentOutstanding = Number((customerSnap.data() as any).outstandingBalance || 0);
        tx.set(customerRef, { outstandingBalance: Math.max(0, money(currentOutstanding - requestedTotal)), updatedAt: now }, { merge: true });
      }

      const lines: JournalLine[] = [
        { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.customerCredits, debit: requestedTotal, credit: 0, dimensions: { customerId: payment.customerId } },
        ...arLines
      ];
      assertJournalAccounts(lines, accounts, false);
      const totals = validateJournalLines(lines);
      const journal: JournalEntry = {
        id: journalRef.id,
        date: today,
        periodKey: accountingPeriodKey(today),
        currency: 'AED',
        sourceType: 'PaymentAllocation',
        sourceId: paymentId,
        sourceAction: `allocate:${idempotencyKey}`,
        reference: payment.receiptNumber,
        memo: `Allocate customer credit from receipt ${payment.receiptNumber || paymentId}`,
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
      tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);
      return { payment: updatedPayment, journal };
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
      action: 'update' as const,
      newValue: `Allocated ${requestedTotal.toFixed(2)} AED of customer credit and posted journal ${outcome.result.journal.id}.`
    };
    try {
      await recordAudit(auditPayload);
    } catch (auditError: any) {
      await firestore.collection(AUDIT_RECOVERY_COLLECTION).doc(`PaymentAllocation_${journalRef.id}`).set({
        id: `PaymentAllocation_${journalRef.id}`,
        status: 'pending',
        auditPayload,
        error: String(auditError?.message || auditError || 'Audit write failed'),
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(recoveryError => console.error('[accounting] allocation audit recovery persistence failed:', recoveryError));
    }
  }

  return { ...outcome.result, replayed: outcome.replayed };
}
