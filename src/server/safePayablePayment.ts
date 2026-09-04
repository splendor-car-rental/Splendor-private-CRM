import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { issueNextNumber } from './idGenerator.js';
import { fingerprintRequest, runIdempotent } from './idempotency.js';
import type { RecordAuditFn } from './businessRules.js';
import { ACCOUNTING_CONTROL_ACCOUNTS } from '../config/accounting.js';
import { accountingPeriodKey, assertJournalAccounts, money, validateJournalLines } from '../lib/accounting.js';
import { getEffectiveChartOfAccounts, type AccountingActor } from './accounting.js';
import type { AccountingPeriod, AccountsPayableEntry, AccountsPayablePayment, JournalEntry, JournalLine } from '../accounting/types.js';

const JOURNAL_COLLECTION = 'accounting_journals';
const PERIOD_COLLECTION = 'accounting_periods';
const PAYABLE_COLLECTION = 'accounting_payables';
const PAYMENT_COLLECTION = 'accounting_payable_payments';
const AUDIT_RECOVERY_COLLECTION = 'accounting_audit_recovery';

function db() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function safeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('A valid supplier payment date is required.');
  return parsed.toISOString().slice(0, 10);
}

function journalIdFor(payableId: string, paymentId: string): string {
  const digest = crypto.createHash('sha256').update(`AccountsPayable:${payableId}:pay:${paymentId}`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

export async function payAccountsPayableAtomic(
  payableId: string,
  input: { amount: number; settlementAccountCode: string; reference?: string; paymentDate?: string },
  actor: AccountingActor,
  idempotencyKey: string | undefined,
  recordAudit: RecordAuditFn
): Promise<{ payable: AccountsPayableEntry; payment: AccountsPayablePayment; journal: JournalEntry; replayed: boolean }> {
  if (!idempotencyKey) throw new Error('Idempotency-Key is required for supplier payments.');
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Supplier payment amount must be greater than zero.');
  const paymentDate = safeDate(input.paymentDate || new Date().toISOString());
  const accounts = await getEffectiveChartOfAccounts();
  const settlementAccount = accounts.find(account => account.code === input.settlementAccountCode);
  if (!settlementAccount || !settlementAccount.active || settlementAccount.accountClass !== 'asset' || !settlementAccount.cashEquivalent) {
    throw new Error('Supplier payment requires an active cash, bank, card-clearing, or payment-clearing account.');
  }

  const paymentId = await issueNextNumber('AccountsPayablePayment');
  const firestore = db();
  const payableRef = firestore.collection(PAYABLE_COLLECTION).doc(payableId);
  const paymentRef = firestore.collection(PAYMENT_COLLECTION).doc(paymentId);
  const journalRef = firestore.collection(JOURNAL_COLLECTION).doc(journalIdFor(payableId, paymentId));
  const periodRef = firestore.collection(PERIOD_COLLECTION).doc(accountingPeriodKey(paymentDate));
  const requestFingerprint = fingerprintRequest({ payableId, amount, settlementAccountCode: input.settlementAccountCode, reference: input.reference || '', paymentDate });

  const outcome = await runIdempotent<{ payable: AccountsPayableEntry; payment: AccountsPayablePayment; journal: JournalEntry }>(
    `accounting-ap-payment:${payableId}`,
    idempotencyKey,
    async tx => {
      const [payableSnap, periodSnap, existingPayment, existingJournal] = await Promise.all([
        tx.get(payableRef),
        tx.get(periodRef),
        tx.get(paymentRef),
        tx.get(journalRef)
      ]);
      if (!payableSnap.exists) throw new Error('Accounts payable entry not found.');
      const payable = payableSnap.data() as AccountsPayableEntry;
      if (payable.status === 'cancelled' || payable.balance <= 0) throw new Error('Accounts payable entry has no outstanding balance.');
      if (amount > payable.balance + 0.005) throw new Error('Supplier payment exceeds the payable balance.');
      if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') throw new Error(`Accounting period ${accountingPeriodKey(paymentDate)} is closed.`);
      if (existingPayment.exists || existingJournal.exists) throw new Error('Duplicate supplier payment posting detected.');

      const newPaidAmount = money(payable.paidAmount + amount);
      const newBalance = money(payable.balance - amount);
      const now = new Date().toISOString();
      const updatedPayable: AccountsPayableEntry = {
        ...payable,
        paidAmount: newPaidAmount,
        balance: newBalance,
        status: newBalance <= 0.005 ? 'paid' : 'partially_paid',
        updatedAt: now
      };

      const lines: JournalLine[] = [
        { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsPayable, debit: amount, credit: 0, dimensions: { supplierId: payable.supplierId, supplierInvoiceId: payable.supplierInvoiceId } },
        { accountCode: input.settlementAccountCode, debit: 0, credit: amount, dimensions: { supplierId: payable.supplierId, supplierInvoiceId: payable.supplierInvoiceId } }
      ];
      assertJournalAccounts(lines, accounts, false);
      const totals = validateJournalLines(lines);
      const journal: JournalEntry = {
        id: journalRef.id,
        date: paymentDate,
        periodKey: accountingPeriodKey(paymentDate),
        currency: 'AED',
        sourceType: 'AccountsPayable',
        sourceId: payableId,
        sourceAction: `pay:${paymentId}`,
        reference: input.reference,
        memo: `Supplier payment ${paymentId} — ${payable.supplierName}`,
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
      const payment: AccountsPayablePayment = {
        id: paymentId,
        payableId,
        supplierId: payable.supplierId,
        supplierName: payable.supplierName,
        amount,
        settlementAccountCode: input.settlementAccountCode,
        reference: input.reference,
        journalId: journal.id,
        paidBy: actor.uid,
        paidByName: actor.name,
        paidAt: now
      };

      tx.set(payableRef, updatedPayable, { merge: true });
      tx.create(paymentRef, payment as unknown as FirebaseFirestore.DocumentData);
      tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);
      return { payable: updatedPayable, payment, journal };
    },
    requestFingerprint
  );

  if (!outcome.replayed) {
    const auditPayload = {
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'AccountsPayable',
      entityId: payableId,
      action: 'update' as const,
      newValue: `Supplier payment ${outcome.result.payment.id}: ${amount.toFixed(2)} AED; remaining ${outcome.result.payable.balance.toFixed(2)} AED; journal ${outcome.result.journal.id}.`
    };
    try {
      await recordAudit(auditPayload);
    } catch (auditError: any) {
      await firestore.collection(AUDIT_RECOVERY_COLLECTION).doc(`AccountsPayablePayment_${outcome.result.payment.id}`).set({
        id: `AccountsPayablePayment_${outcome.result.payment.id}`,
        status: 'pending',
        auditPayload,
        error: String(auditError?.message || auditError || 'Audit write failed'),
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(recoveryError => console.error('[accounting] AP payment audit recovery persistence failed:', recoveryError));
    }
  }

  return { ...outcome.result, replayed: outcome.replayed };
}
