import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { issueNextNumber } from './idGenerator';
import { fingerprintRequest, runIdempotent } from './idempotency';
import type { RecordAuditFn } from './businessRules';
import { ACCOUNTING_CONTROL_ACCOUNTS } from '../config/accounting';
import {
  accountingPeriodKey,
  adjustedInvoiceBalance,
  assertJournalAccounts,
  money,
  validateJournalLines
} from '../lib/accounting';
import { getEffectiveChartOfAccounts, type AccountingActor } from './accounting';
import { globalStore } from './dataStore';
import type { Invoice, Payment } from '../types';
import type {
  AccountingPeriod,
  FinancialNote,
  JournalEntry,
  JournalLine,
  SafeCustomerPaymentInput,
  SafeCustomerPaymentResult
} from '../accounting/types';

const JOURNAL_COLLECTION = 'accounting_journals';
const PERIOD_COLLECTION = 'accounting_periods';
const NOTE_COLLECTION = 'accounting_financial_notes';
const AUDIT_RECOVERY_COLLECTION = 'accounting_audit_recovery';

function firestore() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function journalIdForPayment(paymentId: string): string {
  const digest = crypto.createHash('sha256').update(`Payment:${paymentId}:receive`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

function buildPaymentJournal(
  paymentId: string,
  receiptNumber: string,
  date: string,
  customerId: string,
  customerName: string,
  contractId: string | undefined,
  reservationId: string | undefined,
  settlementAccountCode: string,
  amount: number,
  allocatedAmount: number,
  unallocatedAmount: number,
  actor: AccountingActor
): JournalEntry {
  const lines: JournalLine[] = [
    {
      accountCode: settlementAccountCode,
      debit: amount,
      credit: 0,
      dimensions: { customerId, contractId, reservationId }
    }
  ];
  if (allocatedAmount > 0) {
    lines.push({
      accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable,
      debit: 0,
      credit: allocatedAmount,
      dimensions: { customerId, contractId }
    });
  }
  if (unallocatedAmount > 0) {
    lines.push({
      accountCode: ACCOUNTING_CONTROL_ACCOUNTS.customerCredits,
      debit: 0,
      credit: unallocatedAmount,
      memo: 'Unallocated customer credit',
      dimensions: { customerId }
    });
  }
  const totals = validateJournalLines(lines);
  const now = new Date().toISOString();
  return {
    id: journalIdForPayment(paymentId),
    date,
    periodKey: accountingPeriodKey(date),
    currency: 'AED',
    sourceType: 'Payment',
    sourceId: paymentId,
    sourceAction: 'receive',
    reference: receiptNumber,
    memo: `Customer receipt ${receiptNumber} — ${customerName}`,
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
}

/**
 * Records receipt + invoice allocations + customer balance + accounting
 * journal in ONE Firestore transaction. The idempotency record is written
 * by runIdempotent in that same transaction, so a browser retry can never
 * create a second receipt after a partial-success response failure.
 */
export async function recordAtomicAccountingPayment(
  input: SafeCustomerPaymentInput,
  actor: AccountingActor,
  idempotencyKey: string | undefined,
  recordAudit: RecordAuditFn
): Promise<{ result: SafeCustomerPaymentResult; replayed: boolean }> {
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Payment amount must be greater than zero.');
  if (!input.customerId) throw new Error('Customer is required.');
  if (!input.settlementAccountCode) throw new Error('A settlement account is required for every received payment.');

  const accounts = await getEffectiveChartOfAccounts();
  const settlement = accounts.find(account => account.code === input.settlementAccountCode);
  if (!settlement || !settlement.active || settlement.accountClass !== 'asset' || !settlement.cashEquivalent) {
    throw new Error('Received payment must post to an active cash, bank, card-clearing, or payment-clearing account.');
  }

  const requestedAllocations = input.allocations?.length
    ? input.allocations
    : input.invoiceId ? [{ invoiceId: input.invoiceId, amount }] : [];
  const consolidated = new Map<string, number>();
  for (const allocation of requestedAllocations) {
    const allocationAmount = money(allocation.amount);
    if (!allocation.invoiceId || allocationAmount <= 0) throw new Error('Every allocation requires an invoice and positive amount.');
    consolidated.set(allocation.invoiceId, money((consolidated.get(allocation.invoiceId) || 0) + allocationAmount));
  }
  const requestedAllocatedAmount = money([...consolidated.values()].reduce((sum, value) => sum + value, 0));
  if (requestedAllocatedAmount > amount + 0.005) throw new Error('Invoice allocations exceed the received payment amount.');
  const unallocatedAmount = money(amount - requestedAllocatedAmount);

  const paymentId = await issueNextNumber('Payment');
  const receiptNumber = await issueNextNumber('Receipt');
  const receivedAt = new Date().toISOString();
  const paymentDate = receivedAt.slice(0, 10);
  const db = firestore();
  const paymentRef = db.collection('payments').doc(paymentId);
  const customerRef = db.collection('customers').doc(input.customerId);
  const invoiceRefs = [...consolidated.keys()].map(id => db.collection('invoices').doc(id));
  const noteQueries = invoiceRefs.map(ref => db.collection(NOTE_COLLECTION).where('invoiceId', '==', ref.id));
  const journalId = journalIdForPayment(paymentId);
  const journalRef = db.collection(JOURNAL_COLLECTION).doc(journalId);
  const periodRef = db.collection(PERIOD_COLLECTION).doc(accountingPeriodKey(paymentDate));

  const requestFingerprint = fingerprintRequest({
    customerId: input.customerId,
    amount,
    method: input.method,
    referenceNumber: input.referenceNumber || '',
    contractId: input.contractId || '',
    reservationId: input.reservationId || '',
    allocations: [...consolidated.entries()].sort(([a], [b]) => a.localeCompare(b)),
    settlementAccountCode: input.settlementAccountCode,
    proofDocumentId: input.proofDocumentId || ''
  });

  const outcome = await runIdempotent<{ summary: SafeCustomerPaymentResult; paymentRecord: Payment }>(
    'accounting-payment-create',
    idempotencyKey,
    async tx => {
      // Firestore requires every read before every write. Queries are also
      // transaction reads, so notes are captured in the same consistency
      // boundary as each invoice balance.
      const customerSnap = await tx.get(customerRef);
      if (!customerSnap.exists) throw new Error('Customer not found.');
      const invoiceSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
      for (const ref of invoiceRefs) invoiceSnaps.push(await tx.get(ref));
      const noteSnaps: FirebaseFirestore.QuerySnapshot[] = [];
      for (const query of noteQueries) noteSnaps.push(await tx.get(query));
      const [periodSnap, existingJournalSnap] = await Promise.all([tx.get(periodRef), tx.get(journalRef)]);

      if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') {
        throw new Error(`Accounting period ${accountingPeriodKey(paymentDate)} is closed.`);
      }
      if (existingJournalSnap.exists) throw new Error('Duplicate payment journal detected.');

      const customer = customerSnap.data() as any;
      const customerName = customer.fullName || input.customerName || input.customerId;
      const validatedAllocations: Array<{ invoiceId: string; amount: number }> = [];
      for (let i = 0; i < invoiceRefs.length; i += 1) {
        const snap = invoiceSnaps[i];
        if (!snap.exists) throw new Error(`Invoice ${invoiceRefs[i].id} not found.`);
        const invoice = snap.data() as Invoice;
        if (invoice.customerId !== input.customerId) throw new Error(`Invoice ${invoice.id} belongs to a different customer.`);
        if (invoice.status === 'cancelled' || invoice.status === 'draft') throw new Error(`Invoice ${invoice.id} cannot receive a payment in status ${invoice.status}.`);
        const notes = noteSnaps[i].docs.map(doc => doc.data() as FinancialNote);
        const availableBalance = adjustedInvoiceBalance(invoice, notes);
        const requested = consolidated.get(invoice.id)!;
        if (requested > availableBalance + 0.005) {
          throw new Error(`Allocation to invoice ${invoice.id} exceeds its accounting-adjusted outstanding balance.`);
        }
        validatedAllocations.push({ invoiceId: invoice.id, amount: requested });
      }

      const journal = buildPaymentJournal(
        paymentId,
        receiptNumber,
        paymentDate,
        input.customerId,
        customerName,
        input.contractId,
        input.reservationId,
        input.settlementAccountCode!,
        amount,
        requestedAllocatedAmount,
        unallocatedAmount,
        actor
      );
      assertJournalAccounts(journal.lines, accounts, false);

      const paymentDoc = {
        id: paymentId,
        customerId: input.customerId,
        customerName,
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
        receivedAt,
        receiptNumber,
        notes: input.notes || '',
        proofDocumentId: input.proofDocumentId,
        verificationStatus: 'pending_review',
        accountingPostingStatus: 'posted',
        accountingJournalId: journal.id,
        accountingAccountCode: input.settlementAccountCode,
        createdAt: receivedAt
      };

      tx.create(paymentRef, paymentDoc);
      for (let i = 0; i < invoiceRefs.length; i += 1) {
        const invoice = invoiceSnaps[i].data() as Invoice;
        const allocation = consolidated.get(invoice.id)!;
        const paidAmount = money((invoice.paidAmount || 0) + allocation);
        // Keep the legacy operational balance field tied to the immutable
        // original invoice. Accounting reports separately incorporate
        // credit/debit notes, so the original invoice itself is not rewritten.
        const balanceDue = Math.max(0, money((invoice.totalAmount || 0) - paidAmount));
        tx.set(invoiceRefs[i], {
          paidAmount,
          balanceDue,
          status: adjustedInvoiceBalance({ ...invoice, paidAmount, balanceDue } as Invoice, noteSnaps[i].docs.map(doc => doc.data() as FinancialNote)) <= 0.005 ? 'paid' : 'partially_paid',
          updatedAt: receivedAt
        }, { merge: true });
      }
      if (requestedAllocatedAmount > 0) {
        const outstanding = Number(customer.outstandingBalance || 0);
        tx.set(customerRef, {
          outstandingBalance: Math.max(0, money(outstanding - requestedAllocatedAmount)),
          updatedAt: receivedAt
        }, { merge: true });
      }
      tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);

      return {
        summary: {
          paymentId,
          receiptNumber,
          amount,
          allocatedAmount: requestedAllocatedAmount,
          unallocatedAmount,
          allocations: validatedAllocations,
          accountingPostingStatus: 'posted' as const,
          accountingJournalId: journal.id
        },
        paymentRecord: paymentDoc as unknown as Payment
      };
    },
    requestFingerprint
  );

  if (!outcome.replayed) {
    // Mirror into the in-memory globalStore the same way every other
    // Firestore-writing route does -- GET /api/payments still serves
    // globalStore.payments, so skipping this would make a successfully
    // recorded payment invisible in the UI until the process restarts.
    globalStore.payments.unshift(outcome.result.paymentRecord);
    const auditPayload = {
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'Payment',
      entityId: outcome.result.summary.paymentId,
      action: 'create' as const,
      newValue: `Payment ${outcome.result.summary.paymentId} recorded atomically: ${amount.toFixed(2)} AED; allocated ${requestedAllocatedAmount.toFixed(2)}; unallocated customer credit ${unallocatedAmount.toFixed(2)}; journal ${outcome.result.summary.accountingJournalId}.`
    };
    try {
      await recordAudit(auditPayload);
    } catch (auditError: any) {
      // A financial transaction must never be reported as failed after its
      // durable atomic commit merely because the secondary tamper-evident
      // audit writer was temporarily unavailable. Persist an explicit
      // recovery item instead of silently losing the audit obligation.
      console.error('[accounting] payment committed but audit write failed:', auditError);
      await db.collection(AUDIT_RECOVERY_COLLECTION).doc(`Payment_${outcome.result.summary.paymentId}`).set({
        id: `Payment_${outcome.result.summary.paymentId}`,
        status: 'pending',
        auditPayload,
        error: String(auditError?.message || auditError || 'Audit write failed'),
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(recoveryError => {
        console.error('[accounting] audit recovery persistence also failed:', recoveryError);
      });
    }
  }

  return { result: outcome.result.summary, replayed: outcome.replayed };
}
