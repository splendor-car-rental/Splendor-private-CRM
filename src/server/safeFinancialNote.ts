import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { issueNextNumber } from './idGenerator.js';
import { fingerprintRequest, runIdempotent } from './idempotency.js';
import type { RecordAuditFn } from './businessRules.js';
import { ACCOUNTING_CONTROL_ACCOUNTS } from '../config/accounting.js';
import { accountingPeriodKey, assertJournalAccounts, money, validateJournalLines } from '../lib/accounting.js';
import { getEffectiveChartOfAccounts, type AccountingActor } from './accounting.js';
import type { Invoice } from '../types/index.js';
import type { AccountingPeriod, FinancialNote, JournalEntry, JournalLine } from '../accounting/types.js';

const JOURNAL_COLLECTION = 'accounting_journals';
const PERIOD_COLLECTION = 'accounting_periods';
const NOTE_COLLECTION = 'accounting_financial_notes';
const AUDIT_RECOVERY_COLLECTION = 'accounting_audit_recovery';

type NoteType = 'credit_note' | 'debit_note';

export interface AtomicFinancialNoteInput {
  invoiceId: string;
  issueDate: string;
  reason: string;
  amountBeforeVat: number;
  vatAmount: number;
  revenueAccountCode: string;
}

function db() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function safeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('A valid issue date is required.');
  return parsed.toISOString().slice(0, 10);
}

function journalIdFor(type: NoteType, noteId: string): string {
  const sourceType = type === 'credit_note' ? 'CreditNote' : 'DebitNote';
  const digest = crypto.createHash('sha256').update(`${sourceType}:${noteId}:issue`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

function buildJournal(
  type: NoteType,
  noteId: string,
  invoice: Invoice,
  issueDate: string,
  amountBeforeVat: number,
  vatAmount: number,
  revenueAccountCode: string,
  reason: string,
  actor: AccountingActor
): JournalEntry {
  const totalAmount = money(amountBeforeVat + vatAmount);
  const dimensions = {
    customerId: invoice.customerId,
    contractId: invoice.contractId,
    reservationId: invoice.reservationId,
    invoiceId: invoice.id
  };
  const lines: JournalLine[] = type === 'credit_note'
    ? [
        { accountCode: revenueAccountCode, debit: amountBeforeVat, credit: 0, dimensions },
        ...(vatAmount > 0 ? [{ accountCode: ACCOUNTING_CONTROL_ACCOUNTS.vatOutput, debit: vatAmount, credit: 0, dimensions } as JournalLine] : []),
        { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, debit: 0, credit: totalAmount, dimensions }
      ]
    : [
        { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, debit: totalAmount, credit: 0, dimensions },
        { accountCode: revenueAccountCode, debit: 0, credit: amountBeforeVat, dimensions },
        ...(vatAmount > 0 ? [{ accountCode: ACCOUNTING_CONTROL_ACCOUNTS.vatOutput, debit: 0, credit: vatAmount, dimensions } as JournalLine] : [])
      ];
  const totals = validateJournalLines(lines);
  const now = new Date().toISOString();
  const sourceType = type === 'credit_note' ? 'CreditNote' : 'DebitNote';
  return {
    id: journalIdFor(type, noteId),
    date: issueDate,
    periodKey: accountingPeriodKey(issueDate),
    currency: 'AED',
    sourceType,
    sourceId: noteId,
    sourceAction: 'issue',
    reference: invoice.id,
    memo: `${sourceType} ${noteId} against ${invoice.id}: ${reason}`,
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

export async function createAtomicFinancialNote(
  type: NoteType,
  input: AtomicFinancialNoteInput,
  actor: AccountingActor,
  idempotencyKey: string | undefined,
  recordAudit: RecordAuditFn
): Promise<{ note: FinancialNote; replayed: boolean }> {
  if (!input.reason?.trim()) throw new Error('Credit/debit note requires a reason.');
  const amountBeforeVat = money(input.amountBeforeVat);
  const vatAmount = money(input.vatAmount);
  const totalAmount = money(amountBeforeVat + vatAmount);
  if (amountBeforeVat <= 0 || vatAmount < 0) throw new Error('Note amounts are invalid.');
  const issueDate = safeDate(input.issueDate);

  const accounts = await getEffectiveChartOfAccounts();
  const revenue = accounts.find(account => account.code === input.revenueAccountCode);
  if (!revenue || !revenue.active || revenue.accountClass !== 'revenue') throw new Error('A valid active revenue account is required.');

  const noteId = await issueNextNumber(type === 'credit_note' ? 'CreditNote' : 'DebitNote');
  const firestore = db();
  const invoiceRef = firestore.collection('invoices').doc(input.invoiceId);
  const noteRef = firestore.collection(NOTE_COLLECTION).doc(noteId);
  const journalRef = firestore.collection(JOURNAL_COLLECTION).doc(journalIdFor(type, noteId));
  const periodRef = firestore.collection(PERIOD_COLLECTION).doc(accountingPeriodKey(issueDate));
  const customerRef = (customerId: string) => firestore.collection('customers').doc(customerId);
  const notesQuery = firestore.collection(NOTE_COLLECTION).where('invoiceId', '==', input.invoiceId);

  const requestFingerprint = fingerprintRequest({ type, ...input, amountBeforeVat, vatAmount, issueDate });
  const outcome = await runIdempotent<FinancialNote>(
    `accounting-${type}-create`,
    idempotencyKey,
    async tx => {
      const invoiceSnap = await tx.get(invoiceRef);
      if (!invoiceSnap.exists) throw new Error('Original invoice not found.');
      const invoice = invoiceSnap.data() as Invoice;
      if (invoice.status === 'draft' || invoice.status === 'cancelled') throw new Error('Notes can only be issued against an issued, non-cancelled invoice.');

      const [notesSnap, periodSnap, existingJournal, existingNote, customerSnap] = await Promise.all([
        tx.get(notesQuery),
        tx.get(periodRef),
        tx.get(journalRef),
        tx.get(noteRef),
        tx.get(customerRef(invoice.customerId))
      ]);
      if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') {
        throw new Error(`Accounting period ${accountingPeriodKey(issueDate)} is closed.`);
      }
      if (existingJournal.exists || existingNote.exists) throw new Error('Duplicate financial note posting detected.');

      const existingNotes = notesSnap.docs.map(doc => doc.data() as FinancialNote);
      if (type === 'credit_note') {
        const alreadyCredited = money(existingNotes
          .filter(note => note.type === 'credit_note' && note.status === 'posted')
          .reduce((sum, note) => sum + note.totalAmount, 0));
        if (money(alreadyCredited + totalAmount) > money(invoice.totalAmount) + 0.01) {
          throw new Error('Credit notes cannot reduce the original invoice below zero.');
        }
      }

      const journal = buildJournal(type, noteId, invoice, issueDate, amountBeforeVat, vatAmount, input.revenueAccountCode, input.reason.trim(), actor);
      assertJournalAccounts(journal.lines, accounts, false);
      const now = new Date().toISOString();
      const note: FinancialNote = {
        id: noteId,
        type,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        issueDate,
        reason: input.reason.trim(),
        amountBeforeVat,
        vatAmount,
        totalAmount,
        revenueAccountCode: input.revenueAccountCode,
        status: 'posted',
        journalId: journal.id,
        createdBy: actor.uid,
        createdByName: actor.name,
        createdAt: now
      };

      tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);
      tx.create(noteRef, note as unknown as FirebaseFirestore.DocumentData);
      if (customerSnap.exists) {
        const current = Number((customerSnap.data() as any).outstandingBalance || 0);
        const delta = type === 'credit_note' ? -totalAmount : totalAmount;
        tx.set(customerRef(invoice.customerId), {
          outstandingBalance: Math.max(0, money(current + delta)),
          updatedAt: now
        }, { merge: true });
      }
      return note;
    },
    requestFingerprint
  );

  if (!outcome.replayed) {
    const auditPayload = {
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: type === 'credit_note' ? 'CreditNote' : 'DebitNote',
      entityId: outcome.result.id,
      action: 'create' as const,
      newValue: `${type} ${outcome.result.id} issued atomically for ${totalAmount.toFixed(2)} AED against invoice ${input.invoiceId}.`,
      reason: input.reason.trim()
    };
    try {
      await recordAudit(auditPayload);
    } catch (auditError: any) {
      await firestore.collection(AUDIT_RECOVERY_COLLECTION).doc(`${auditPayload.entityType}_${outcome.result.id}`).set({
        id: `${auditPayload.entityType}_${outcome.result.id}`,
        status: 'pending',
        auditPayload,
        error: String(auditError?.message || auditError || 'Audit write failed'),
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(recoveryError => {
        console.error('[accounting] financial note audit recovery persistence failed:', recoveryError);
      });
    }
  }

  return { note: outcome.result, replayed: outcome.replayed };
}
