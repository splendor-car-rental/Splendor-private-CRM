import crypto from 'node:crypto';
import admin from 'firebase-admin';
import type { RecordAuditFn } from './businessRules';
import { ACCOUNTING_CONTROL_ACCOUNTS } from '../config/accounting';
import { accountingPeriodKey, assertJournalAccounts, money, validateJournalLines } from '../lib/accounting';
import { getEffectiveChartOfAccounts, type AccountingActor } from './accounting';
import type { Deposit } from '../types';
import type { AccountingPeriod, JournalEntry, JournalLine } from '../accounting/types';

const JOURNALS = 'accounting_journals';
const PERIODS = 'accounting_periods';
const AUDIT_RECOVERY = 'accounting_audit_recovery';

function db() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function journalId(depositId: string): string {
  const digest = crypto.createHash('sha256').update(`Deposit:${depositId}:receive`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

export async function postManualDepositReceiptAtomic(
  depositId: string,
  settlementAccountCode: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<{ deposit: Deposit; journal: JournalEntry; replayed: boolean }> {
  const accounts = await getEffectiveChartOfAccounts();
  const settlement = accounts.find(account => account.code === settlementAccountCode);
  if (!settlement || !settlement.active || settlement.accountClass !== 'asset' || !settlement.cashEquivalent) {
    throw new Error('A valid active cash/bank/clearing settlement account is required.');
  }

  const firestore = db();
  const depositRef = firestore.collection('deposits').doc(depositId);
  const initial = await depositRef.get();
  if (!initial.exists) throw new Error('Deposit not found.');
  const deposit = initial.data() as Deposit & { holdType?: string };
  if (deposit.holdType === 'gateway_authorization') {
    throw new Error('An uncaptured gateway authorization hold is not cash received and cannot be posted as a manual deposit receipt.');
  }
  if (money(deposit.amount) <= 0) throw new Error('Deposit amount must be greater than zero.');

  const date = new Date(deposit.createdAt).toISOString().slice(0, 10);
  const lines: JournalLine[] = [
    { accountCode: settlementAccountCode, debit: money(deposit.amount), credit: 0, dimensions: { customerId: deposit.customerId, contractId: deposit.contractId, reservationId: deposit.reservationId } },
    { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.customerDepositsHeld, debit: 0, credit: money(deposit.amount), dimensions: { customerId: deposit.customerId, contractId: deposit.contractId, reservationId: deposit.reservationId } }
  ];
  assertJournalAccounts(lines, accounts, false);
  const totals = validateJournalLines(lines);
  const id = journalId(depositId);
  const periodKey = accountingPeriodKey(date);
  const journal: JournalEntry = {
    id,
    date,
    periodKey,
    currency: 'AED',
    sourceType: 'Deposit',
    sourceId: depositId,
    sourceAction: 'receive',
    reference: deposit.transactionRef,
    memo: `Security deposit received — ${deposit.customerName}`,
    status: 'posted',
    lines,
    totalDebit: totals.totalDebit,
    totalCredit: totals.totalCredit,
    createdBy: actor.uid,
    createdByName: actor.name,
    createdByRole: actor.role,
    createdAt: new Date().toISOString(),
    postedAt: new Date().toISOString()
  };

  let replayed = false;
  let resultingDeposit = deposit;
  await firestore.runTransaction(async tx => {
    const journalRef = firestore.collection(JOURNALS).doc(id);
    const periodRef = firestore.collection(PERIODS).doc(periodKey);
    const [freshDepositSnap, existingJournal, periodSnap] = await Promise.all([
      tx.get(depositRef), tx.get(journalRef), tx.get(periodRef)
    ]);
    if (!freshDepositSnap.exists) throw new Error('Deposit not found.');
    const freshDeposit = freshDepositSnap.data() as Deposit & { holdType?: string; accountingPostingStatus?: string; accountingJournalId?: string; accountingAccountCode?: string };
    if (freshDeposit.holdType === 'gateway_authorization') throw new Error('Gateway authorization hold cannot use the manual receipt route.');
    if (existingJournal.exists) {
      replayed = true;
      tx.set(depositRef, { accountingPostingStatus: 'posted', accountingJournalId: id, accountingAccountCode: settlementAccountCode }, { merge: true });
      resultingDeposit = { ...freshDeposit, accountingPostingStatus: 'posted', accountingJournalId: id, accountingAccountCode: settlementAccountCode } as Deposit;
      return;
    }
    if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') throw new Error(`Accounting period ${periodKey} is closed.`);
    tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);
    tx.set(depositRef, { accountingPostingStatus: 'posted', accountingJournalId: id, accountingAccountCode: settlementAccountCode, updatedAt: new Date().toISOString() }, { merge: true });
    resultingDeposit = { ...freshDeposit, accountingPostingStatus: 'posted', accountingJournalId: id, accountingAccountCode: settlementAccountCode } as Deposit;
  });

  if (!replayed) {
    const auditPayload = {
      userId: actor.uid, userName: actor.name, userRole: actor.role,
      entityType: 'Deposit', entityId: depositId, action: 'update' as const,
      newValue: `Security deposit ${depositId} posted atomically for ${money(deposit.amount).toFixed(2)} AED as journal ${id}.`
    };
    try {
      await recordAudit(auditPayload);
    } catch (auditError: any) {
      await firestore.collection(AUDIT_RECOVERY).doc(`DepositReceipt_${depositId}`).set({
        id: `DepositReceipt_${depositId}`,
        status: 'pending',
        auditPayload,
        error: String(auditError?.message || auditError || 'Audit write failed'),
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(recoveryError => console.error('[accounting] deposit receipt audit recovery persistence failed:', recoveryError));
    }
  }

  return { deposit: resultingDeposit, journal, replayed };
}
