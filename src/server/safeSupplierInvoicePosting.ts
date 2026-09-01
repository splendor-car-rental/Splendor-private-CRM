import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { fingerprintRequest, runIdempotent } from './idempotency';
import type { RecordAuditFn } from './businessRules';
import { ACCOUNTING_CONTROL_ACCOUNTS } from '../config/accounting';
import { accountingPeriodKey, assertJournalAccounts, money, validateJournalLines } from '../lib/accounting';
import { getEffectiveChartOfAccounts, type AccountingActor } from './accounting';
import type { SupplierInvoice } from '../types';
import type { AccountingPeriod, AccountsPayableEntry, JournalEntry, JournalLine } from '../accounting/types';

const JOURNAL_COLLECTION = 'accounting_journals';
const PERIOD_COLLECTION = 'accounting_periods';
const PAYABLE_COLLECTION = 'accounting_payables';
const AUDIT_RECOVERY_COLLECTION = 'accounting_audit_recovery';

function db() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function safeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('A valid date is required.');
  return parsed.toISOString().slice(0, 10);
}

function journalIdFor(supplierInvoiceId: string): string {
  const digest = crypto.createHash('sha256').update(`SupplierInvoice:${supplierInvoiceId}:post_ap`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

export async function postSupplierInvoiceToAPAtomic(
  supplierInvoiceId: string,
  input: { amountBeforeVat: number; vatAmount: number; dueDate: string; expenseAccountCode: string },
  actor: AccountingActor,
  idempotencyKey: string | undefined,
  recordAudit: RecordAuditFn
): Promise<{ payable: AccountsPayableEntry; journal: JournalEntry; replayed: boolean }> {
  const amountBeforeVat = money(input.amountBeforeVat);
  const vatAmount = money(input.vatAmount);
  if (amountBeforeVat < 0 || vatAmount < 0) throw new Error('Supplier invoice amounts are invalid.');
  const dueDate = safeDate(input.dueDate);
  const accounts = await getEffectiveChartOfAccounts();
  const expenseAccount = accounts.find(account => account.code === input.expenseAccountCode);
  if (!expenseAccount || !expenseAccount.active || expenseAccount.accountClass !== 'expense') throw new Error('A valid active expense account is required.');

  const firestore = db();
  const invoiceRef = firestore.collection('supplier_invoices').doc(supplierInvoiceId);
  const payableRef = firestore.collection(PAYABLE_COLLECTION).doc(`AP-${supplierInvoiceId}`);
  const journalRef = firestore.collection(JOURNAL_COLLECTION).doc(journalIdFor(supplierInvoiceId));
  const requestFingerprint = fingerprintRequest({ supplierInvoiceId, amountBeforeVat, vatAmount, dueDate, expenseAccountCode: input.expenseAccountCode });

  const outcome = await runIdempotent<{ payable: AccountsPayableEntry; journal: JournalEntry }>(
    `accounting-supplier-invoice-post:${supplierInvoiceId}`,
    idempotencyKey,
    async tx => {
      const invoiceSnap = await tx.get(invoiceRef);
      if (!invoiceSnap.exists) throw new Error('Supplier invoice not found.');
      const invoice = invoiceSnap.data() as SupplierInvoice;
      if (invoice.status !== 'approved') throw new Error('Supplier invoice must be approved before accounting posting.');
      const totalAmount = money(invoice.amount);
      if (Math.abs(money(amountBeforeVat + vatAmount) - totalAmount) > 0.01) {
        throw new Error('The supplied net amount plus VAT must equal the approved supplier invoice total. VAT is never guessed automatically.');
      }
      const invoiceDate = safeDate(invoice.invoiceDate);
      const periodRef = firestore.collection(PERIOD_COLLECTION).doc(accountingPeriodKey(invoiceDate));
      const [existingPayable, existingJournal, periodSnap] = await Promise.all([
        tx.get(payableRef),
        tx.get(journalRef),
        tx.get(periodRef)
      ]);
      if (existingPayable.exists && existingJournal.exists) {
        return { payable: existingPayable.data() as AccountsPayableEntry, journal: existingJournal.data() as JournalEntry };
      }
      if (existingPayable.exists !== existingJournal.exists) {
        throw new Error('Supplier invoice accounting state is inconsistent: payable and journal must exist together.');
      }
      if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') throw new Error(`Accounting period ${accountingPeriodKey(invoiceDate)} is closed.`);

      const dimensions = { supplierId: invoice.supplierId, supplierInvoiceId: invoice.id };
      const lines: JournalLine[] = [
        { accountCode: input.expenseAccountCode, debit: amountBeforeVat, credit: 0, dimensions },
        ...(vatAmount > 0 ? [{ accountCode: ACCOUNTING_CONTROL_ACCOUNTS.vatInput, debit: vatAmount, credit: 0, dimensions } as JournalLine] : []),
        { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsPayable, debit: 0, credit: totalAmount, dimensions }
      ];
      assertJournalAccounts(lines, accounts, false);
      const totals = validateJournalLines(lines);
      const now = new Date().toISOString();
      const journal: JournalEntry = {
        id: journalRef.id,
        date: invoiceDate,
        periodKey: accountingPeriodKey(invoiceDate),
        currency: 'AED',
        sourceType: 'SupplierInvoice',
        sourceId: invoice.id,
        sourceAction: 'post_ap',
        reference: invoice.invoiceNumber,
        memo: `Supplier invoice ${invoice.invoiceNumber} — ${invoice.supplierName}`,
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
      const payable: AccountsPayableEntry = {
        id: payableRef.id,
        supplierInvoiceId: invoice.id,
        supplierId: invoice.supplierId,
        supplierName: invoice.supplierName,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate,
        dueDate,
        expenseAccountCode: input.expenseAccountCode,
        amountBeforeVat,
        vatAmount,
        totalAmount,
        paidAmount: 0,
        balance: totalAmount,
        status: 'unpaid',
        journalId: journal.id,
        createdAt: now,
        updatedAt: now
      };
      tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);
      tx.create(payableRef, payable as unknown as FirebaseFirestore.DocumentData);
      return { payable, journal };
    },
    requestFingerprint
  );

  if (!outcome.replayed) {
    const auditPayload = {
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'AccountsPayable',
      entityId: outcome.result.payable.id,
      action: 'create' as const,
      newValue: `Supplier invoice ${supplierInvoiceId} posted atomically to AP for ${outcome.result.payable.totalAmount.toFixed(2)} AED; journal ${outcome.result.journal.id}.`
    };
    try {
      await recordAudit(auditPayload);
    } catch (auditError: any) {
      await firestore.collection(AUDIT_RECOVERY_COLLECTION).doc(`SupplierInvoicePosting_${supplierInvoiceId}`).set({
        id: `SupplierInvoicePosting_${supplierInvoiceId}`,
        status: 'pending',
        auditPayload,
        error: String(auditError?.message || auditError || 'Audit write failed'),
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(recoveryError => console.error('[accounting] supplier invoice audit recovery persistence failed:', recoveryError));
    }
  }

  return { ...outcome.result, replayed: outcome.replayed };
}
