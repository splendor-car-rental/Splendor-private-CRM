import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { fingerprintRequest, runIdempotent } from './idempotency';
import type { RecordAuditFn } from './businessRules';
import { ACCOUNTING_CONTROL_ACCOUNTS } from '../config/accounting';
import { accountingPeriodKey, assertJournalAccounts, money, validateJournalLines } from '../lib/accounting';
import { getEffectiveChartOfAccounts, type AccountingActor } from './accounting';
import { globalStore } from './dataStore';
import type { AdditionalCharge, Deposit } from '../types';
import type { AccountingPeriod, JournalEntry, JournalLine } from '../accounting/types';

const JOURNAL_COLLECTION = 'accounting_journals';
const PERIOD_COLLECTION = 'accounting_periods';
const AUDIT_RECOVERY_COLLECTION = 'accounting_audit_recovery';

interface ChargeDepositAllocation {
  depositId: string;
  amount: number;
  appliedAt: string;
  appliedBy: string;
  appliedByName: string;
  journalId: string;
}

type AccountingCharge = AdditionalCharge & {
  accountingJournalId?: string;
  accountingPostingStatus?: string;
  updatedAt?: string;
  /** Cumulative amount actually settled from one or more deposits. */
  depositAppliedAmount?: number;
  /** Immutable append-only evidence for each deposit allocation. */
  depositAllocations?: ChargeDepositAllocation[];
};

function db() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function assertFiniteMoney(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label} must be a finite number.`);
  return money(numeric);
}

function journalId(sourceType: string, sourceId: string, sourceAction: string): string {
  const digest = crypto.createHash('sha256').update(`${sourceType}:${sourceId}:${sourceAction}`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

function makeJournal(input: {
  date: string;
  sourceType: string;
  sourceId: string;
  sourceAction: string;
  reference?: string;
  memo: string;
  lines: JournalLine[];
  actor: AccountingActor;
}): JournalEntry {
  const date = new Date(input.date).toISOString().slice(0, 10);
  const totals = validateJournalLines(input.lines);
  const now = new Date().toISOString();
  return {
    id: journalId(input.sourceType, input.sourceId, input.sourceAction),
    date,
    periodKey: accountingPeriodKey(date),
    currency: 'AED',
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceAction: input.sourceAction,
    reference: input.reference,
    memo: input.memo,
    status: 'posted',
    lines: input.lines.map(line => ({ ...line, debit: money(line.debit), credit: money(line.credit) })),
    totalDebit: totals.totalDebit,
    totalCredit: totals.totalCredit,
    createdBy: input.actor.uid,
    createdByName: input.actor.name,
    createdByRole: input.actor.role,
    createdAt: now,
    postedAt: now
  };
}

async function persistAuditRecovery(recordAudit: RecordAuditFn, auditPayload: Parameters<RecordAuditFn>[0], recoveryId: string) {
  try {
    await recordAudit(auditPayload);
  } catch (auditError: any) {
    await db().collection(AUDIT_RECOVERY_COLLECTION).doc(recoveryId).set({
      id: recoveryId,
      status: 'pending',
      auditPayload,
      error: String(auditError?.message || auditError || 'Audit write failed'),
      createdAt: new Date().toISOString()
    }, { merge: true }).catch(recoveryError => console.error('[accounting] deposit audit recovery persistence failed:', recoveryError));
  }
}

export async function postApprovedChargeAtomic(
  chargeId: string,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
): Promise<{ charge: AdditionalCharge; journal: JournalEntry; replayed: boolean }> {
  const firestore = db();
  const chargeRef = firestore.collection('charges').doc(chargeId);
  const accounts = await getEffectiveChartOfAccounts();

  const chargeSnap = await chargeRef.get();
  if (!chargeSnap.exists) throw new Error('Charge not found.');
  const charge = chargeSnap.data() as AccountingCharge;
  if (charge.approvalStatus !== 'approved') throw new Error('Charge must be approved before accounting posting.');
  const total = assertFiniteMoney(charge.totalAmount, 'Charge total');
  const net = assertFiniteMoney(charge.amount, 'Charge amount');
  const vat = assertFiniteMoney(charge.vatAmount, 'Charge VAT');
  if (total <= 0 || net < 0 || vat < 0 || Math.abs(money(net + vat) - total) > 0.01) {
    throw new Error('Charge amount/VAT/total values are inconsistent.');
  }

  const issueDate = new Date(charge.timestamp).toISOString().slice(0, 10);
  const sourceAction = 'approve';
  const journal = makeJournal({
    date: issueDate,
    sourceType: 'AdditionalCharge',
    sourceId: charge.id,
    sourceAction,
    reference: charge.relatedContractId,
    memo: `Approved additional charge ${charge.id} — ${charge.description}`,
    lines: [
      { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, debit: total, credit: 0, dimensions: { customerId: charge.customerId, contractId: charge.relatedContractId, vehicleId: charge.vehicleId } },
      { accountCode: '4200', debit: 0, credit: net, dimensions: { customerId: charge.customerId, contractId: charge.relatedContractId, vehicleId: charge.vehicleId } },
      ...(vat > 0 ? [{ accountCode: ACCOUNTING_CONTROL_ACCOUNTS.vatOutput, debit: 0, credit: vat, dimensions: { customerId: charge.customerId, contractId: charge.relatedContractId, vehicleId: charge.vehicleId } } as JournalLine] : [])
    ],
    actor
  });
  assertJournalAccounts(journal.lines, accounts, false);

  let replayed = false;
  let resultingCharge = charge;
  await firestore.runTransaction(async tx => {
    const periodRef = firestore.collection(PERIOD_COLLECTION).doc(journal.periodKey);
    const journalRef = firestore.collection(JOURNAL_COLLECTION).doc(journal.id);
    const customerRef = charge.customerId ? firestore.collection('customers').doc(charge.customerId) : null;
    const reads = [tx.get(chargeRef), tx.get(periodRef), tx.get(journalRef)] as Promise<FirebaseFirestore.DocumentSnapshot>[];
    if (customerRef) reads.push(tx.get(customerRef));
    const [freshChargeSnap, periodSnap, existingJournal, customerSnap] = await Promise.all(reads);
    if (!freshChargeSnap.exists) throw new Error('Charge not found.');
    const freshCharge = freshChargeSnap.data() as AccountingCharge;
    if (freshCharge.approvalStatus !== 'approved') throw new Error('Charge must be approved before accounting posting.');
    if (!customerRef || !customerSnap?.exists) throw new Error('Charge customer not found.');

    const freshTotal = assertFiniteMoney(freshCharge.totalAmount, 'Charge total');
    const freshNet = assertFiniteMoney(freshCharge.amount, 'Charge amount');
    const freshVat = assertFiniteMoney(freshCharge.vatAmount, 'Charge VAT');
    const financialFieldsChanged = freshTotal !== total
      || freshNet !== net
      || freshVat !== vat
      || freshCharge.customerId !== charge.customerId
      || freshCharge.relatedContractId !== charge.relatedContractId
      || freshCharge.vehicleId !== charge.vehicleId;
    if (financialFieldsChanged) {
      throw new Error('Charge financial fields changed while accounting posting was being prepared. Retry from the latest approved charge state.');
    }

    if (existingJournal.exists) {
      const posted = existingJournal.data() as JournalEntry;
      if (posted.sourceType !== 'AdditionalCharge' || posted.sourceId !== charge.id || posted.sourceAction !== sourceAction || Math.abs(money(posted.totalDebit) - total) > 0.01 || Math.abs(money(posted.totalCredit) - total) > 0.01) {
        throw new Error('Existing charge journal does not match the approved charge. Manual accounting review is required.');
      }
      const now = new Date().toISOString();
      tx.set(chargeRef, { accountingPostingStatus: 'posted', accountingJournalId: journal.id, updatedAt: now }, { merge: true });
      replayed = true;
      resultingCharge = { ...freshCharge, accountingPostingStatus: 'posted', accountingJournalId: journal.id };
      return;
    }
    if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') throw new Error(`Accounting period ${journal.periodKey} is closed.`);

    const now = new Date().toISOString();
    tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);
    tx.set(chargeRef, { accountingPostingStatus: 'posted', accountingJournalId: journal.id, updatedAt: now }, { merge: true });
    const currentOutstanding = Number((customerSnap.data() as any).outstandingBalance || 0);
    if (!Number.isFinite(currentOutstanding)) throw new Error('Customer outstanding balance is invalid and requires accounting review.');
    tx.set(customerRef, { outstandingBalance: money(currentOutstanding + total), updatedAt: now }, { merge: true });
    resultingCharge = { ...freshCharge, accountingPostingStatus: 'posted', accountingJournalId: journal.id };
  });

  if (!replayed) {
    const chargeIndex = globalStore.charges.findIndex(item => item.id === chargeId);
    if (chargeIndex >= 0) globalStore.charges[chargeIndex] = { ...globalStore.charges[chargeIndex], accountingPostingStatus: 'posted', accountingJournalId: journal.id } as any;
    const customer = globalStore.customers.find(item => item.id === charge.customerId);
    if (customer) customer.outstandingBalance = money((customer.outstandingBalance || 0) + total);
    await persistAuditRecovery(recordAudit, {
      userId: actor.uid, userName: actor.name, userRole: actor.role,
      entityType: 'Charge', entityId: charge.id, action: 'update',
      newValue: `Approved charge ${charge.id} posted to AR for ${total.toFixed(2)} AED as journal ${journal.id}.`
    }, `AdditionalCharge_${charge.id}`);
  }

  return { charge: resultingCharge, journal, replayed };
}

export async function applyDepositToApprovedChargeAtomic(
  depositId: string,
  input: { amount: number; chargeId: string; reason?: string },
  actor: AccountingActor,
  idempotencyKey: string | undefined,
  recordAudit: RecordAuditFn
): Promise<{ deposit: Deposit; charge: AdditionalCharge; journal: JournalEntry; replayed: boolean }> {
  if (!idempotencyKey) throw new Error('Idempotency-Key is required for deposit application.');
  const amount = assertFiniteMoney(input.amount, 'Deposit application amount');
  if (amount <= 0) throw new Error('Deposit application amount must be greater than zero.');
  if (!input.chargeId) throw new Error('chargeId is required.');

  // The charge must first exist in AR so the deposit application is a clean
  // liability-to-receivable settlement, never direct/ambiguous revenue.
  await postApprovedChargeAtomic(input.chargeId, actor, recordAudit);

  const accounts = await getEffectiveChartOfAccounts();
  const firestore = db();
  const depositRef = firestore.collection('deposits').doc(depositId);
  const chargeRef = firestore.collection('charges').doc(input.chargeId);
  const now = new Date().toISOString();
  const sourceAction = `apply:${input.chargeId}:${idempotencyKey}`;
  const journal = makeJournal({
    date: now,
    sourceType: 'Deposit',
    sourceId: depositId,
    sourceAction,
    reference: input.chargeId,
    memo: `Security deposit applied to approved charge ${input.chargeId}`,
    lines: [
      { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.customerDepositsHeld, debit: amount, credit: 0 },
      { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, debit: 0, credit: amount }
    ],
    actor
  });
  assertJournalAccounts(journal.lines, accounts, false);
  const requestFingerprint = fingerprintRequest({ depositId, chargeId: input.chargeId, amount, reason: input.reason || '' });

  const outcome = await runIdempotent<{ deposit: Deposit; charge: AdditionalCharge; journal: JournalEntry }>(
    `accounting-deposit-apply:${depositId}`,
    idempotencyKey,
    async tx => {
      const periodRef = firestore.collection(PERIOD_COLLECTION).doc(journal.periodKey);
      const journalRef = firestore.collection(JOURNAL_COLLECTION).doc(journal.id);
      const [depositSnap, chargeSnap, periodSnap, existingJournal] = await Promise.all([
        tx.get(depositRef), tx.get(chargeRef), tx.get(periodRef), tx.get(journalRef)
      ]);
      if (!depositSnap.exists) throw new Error('Deposit not found.');
      if (!chargeSnap.exists) throw new Error('Charge not found.');
      const deposit = depositSnap.data() as Deposit & { holdType?: string; accountingPostingStatus?: string; accountingJournalId?: string };
      const charge = chargeSnap.data() as AccountingCharge;
      const customerRef = deposit.customerId ? firestore.collection('customers').doc(deposit.customerId) : null;
      const customerSnap = customerRef ? await tx.get(customerRef) : null;

      // All reads must happen before writes. Validation below is deliberately
      // exhaustive because this operation moves money between two control
      // accounts and is also used as contract-close settlement evidence.
      if (!customerRef || !customerSnap?.exists) throw new Error('Deposit customer not found.');
      if (deposit.holdType === 'gateway_authorization') throw new Error('An uncaptured gateway authorization cannot be applied as accounting cash. Capture/settle it through the gateway lifecycle first.');
      if (deposit.accountingPostingStatus !== 'posted' || !deposit.accountingJournalId) throw new Error('Deposit receipt must be posted to accounting before it can be applied.');
      if (!['held', 'partially_refunded'].includes(String(deposit.status || ''))) throw new Error(`Deposit cannot be applied in status ${deposit.status || 'unknown'}.`);
      const depositBalance = assertFiniteMoney(deposit.balance, 'Held deposit balance');
      if (depositBalance <= 0) throw new Error('Deposit has no held balance available to apply.');
      if (amount > depositBalance + 0.005) throw new Error('Apply amount exceeds held deposit balance.');
      if (charge.customerId !== deposit.customerId) throw new Error('Charge does not belong to this deposit customer.');
      if (deposit.contractId && charge.relatedContractId !== deposit.contractId) {
        throw new Error('A contract-bound deposit can only settle charges from the same contract.');
      }
      if (charge.approvalStatus !== 'approved') throw new Error('Charge must be approved before deposit application.');
      if (charge.accountingPostingStatus !== 'posted' || !charge.accountingJournalId) throw new Error('Charge must be posted to accounting before deposit application.');
      if (charge.deductedFromDepositId) throw new Error('Charge has already been fully settled from deposit funds.');
      const chargeTotal = assertFiniteMoney(charge.totalAmount, 'Approved charge total');
      const previouslyApplied = assertFiniteMoney(charge.depositAppliedAmount || 0, 'Previously applied deposit amount');
      const chargeRemaining = money(chargeTotal - previouslyApplied);
      if (chargeRemaining <= 0.005) throw new Error('Charge is already fully settled from deposit funds.');
      if (amount > chargeRemaining + 0.005) throw new Error('Apply amount exceeds the remaining approved charge balance.');
      if (existingJournal.exists) throw new Error('Duplicate deposit-application journal detected.');
      if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') throw new Error(`Accounting period ${journal.periodKey} is closed.`);

      const updatedDeposit = {
        ...deposit,
        appliedAmount: money((deposit.appliedAmount || 0) + amount),
        balance: money(depositBalance - amount),
        appliedReason: input.reason || `${charge.type}: ${charge.description}`,
        status: money(depositBalance - amount) <= 0.005 ? 'applied' : 'held',
        updatedAt: now
      } as Deposit;
      const nextApplied = money(previouslyApplied + amount);
      const fullySettled = nextApplied + 0.005 >= chargeTotal;
      const allocation: ChargeDepositAllocation = {
        depositId: deposit.id,
        amount,
        appliedAt: now,
        appliedBy: actor.uid,
        appliedByName: actor.name,
        journalId: journal.id
      };
      const updatedCharge: AccountingCharge = {
        ...charge,
        depositAppliedAmount: nextApplied,
        depositAllocations: [...(Array.isArray(charge.depositAllocations) ? charge.depositAllocations : []), allocation],
        ...(fullySettled ? { deductedFromDepositId: deposit.id } : {}),
        updatedAt: now
      };

      tx.set(depositRef, updatedDeposit as unknown as FirebaseFirestore.DocumentData, { merge: true });
      tx.set(chargeRef, {
        depositAppliedAmount: nextApplied,
        depositAllocations: updatedCharge.depositAllocations,
        ...(fullySettled ? { deductedFromDepositId: deposit.id } : {}),
        updatedAt: now
      }, { merge: true });
      tx.create(journalRef, {
        ...journal,
        lines: journal.lines.map(line => ({ ...line, dimensions: { customerId: deposit.customerId, contractId: deposit.contractId || charge.relatedContractId, reservationId: deposit.reservationId } }))
      } as unknown as FirebaseFirestore.DocumentData);

      const customer = customerSnap.data() as any;
      const held = Number(customer.securityDepositsHeld || 0);
      const outstanding = Number(customer.outstandingBalance || 0);
      if (!Number.isFinite(held) || !Number.isFinite(outstanding)) throw new Error('Customer financial balances are invalid and require accounting review.');
      tx.set(customerRef, {
        securityDepositsHeld: Math.max(0, money(held - amount)),
        outstandingBalance: Math.max(0, money(outstanding - amount)),
        updatedAt: now
      }, { merge: true });
      return { deposit: updatedDeposit, charge: updatedCharge as AdditionalCharge, journal };
    },
    requestFingerprint
  );

  if (!outcome.replayed) {
    const depositIndex = globalStore.deposits.findIndex(item => item.id === depositId);
    if (depositIndex >= 0) globalStore.deposits[depositIndex] = outcome.result.deposit as any;
    const chargeIndex = globalStore.charges.findIndex(item => item.id === input.chargeId);
    if (chargeIndex >= 0) Object.assign(globalStore.charges[chargeIndex] as any, outcome.result.charge);
    const customer = globalStore.customers.find(item => item.id === outcome.result.deposit.customerId);
    if (customer) {
      customer.securityDepositsHeld = Math.max(0, money((customer.securityDepositsHeld || 0) - amount));
      customer.outstandingBalance = Math.max(0, money((customer.outstandingBalance || 0) - amount));
    }
    const chargeState = outcome.result.charge as AccountingCharge;
    await persistAuditRecovery(recordAudit, {
      userId: actor.uid, userName: actor.name, userRole: actor.role,
      entityType: 'Deposit', entityId: depositId, action: 'update',
      newValue: `Applied ${amount.toFixed(2)} AED of deposit ${depositId} to approved charge ${input.chargeId}; cumulative deposit settlement ${money(chargeState.depositAppliedAmount || 0).toFixed(2)} / ${money(chargeState.totalAmount).toFixed(2)} AED; journal ${journal.id}.`,
      reason: input.reason || 'Approved charge settlement from held security deposit'
    }, `DepositApply_${journal.id}`);
  }

  return { ...outcome.result, replayed: outcome.replayed };
}

export async function refundManualDepositAtomic(
  depositId: string,
  input: { amount: number; settlementAccountCode?: string; reason?: string; refundDate?: string },
  actor: AccountingActor,
  idempotencyKey: string | undefined,
  recordAudit: RecordAuditFn
): Promise<{ deposit: Deposit; journal: JournalEntry; replayed: boolean }> {
  if (!idempotencyKey) throw new Error('Idempotency-Key is required for deposit refunds.');
  const amount = assertFiniteMoney(input.amount, 'Refund amount');
  if (amount <= 0) throw new Error('Refund amount must be greater than zero.');
  const accounts = await getEffectiveChartOfAccounts();
  const firestore = db();
  const depositRef = firestore.collection('deposits').doc(depositId);
  const initialSnap = await depositRef.get();
  if (!initialSnap.exists) throw new Error('Deposit not found.');
  const initialDeposit = initialSnap.data() as Deposit & { holdType?: string; accountingPostingStatus?: string; accountingJournalId?: string; accountingAccountCode?: string };
  if (initialDeposit.holdType === 'gateway_authorization') throw new Error('Gateway authorization holds must be released/refunded by the signed gateway lifecycle, not the manual accounting refund route.');
  if (initialDeposit.accountingPostingStatus !== 'posted' || !initialDeposit.accountingJournalId) throw new Error('Deposit receipt must be posted to accounting before refund.');
  const settlementAccountCode = String(input.settlementAccountCode || initialDeposit.accountingAccountCode || '');
  const settlement = accounts.find(account => account.code === settlementAccountCode);
  if (!settlement || !settlement.active || settlement.accountClass !== 'asset' || !settlement.cashEquivalent) throw new Error('Refund requires an active cash/bank/clearing account.');

  const refundDate = input.refundDate ? new Date(input.refundDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const sourceAction = `refund:${idempotencyKey}`;
  const journal = makeJournal({
    date: refundDate,
    sourceType: 'Deposit',
    sourceId: depositId,
    sourceAction,
    reference: initialDeposit.transactionRef,
    memo: `Security deposit refund — ${initialDeposit.customerName}`,
    lines: [
      { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.customerDepositsHeld, debit: amount, credit: 0, dimensions: { customerId: initialDeposit.customerId, contractId: initialDeposit.contractId, reservationId: initialDeposit.reservationId } },
      { accountCode: settlementAccountCode, debit: 0, credit: amount, dimensions: { customerId: initialDeposit.customerId, contractId: initialDeposit.contractId, reservationId: initialDeposit.reservationId } }
    ],
    actor
  });
  assertJournalAccounts(journal.lines, accounts, false);
  const requestFingerprint = fingerprintRequest({ depositId, amount, settlementAccountCode, refundDate, reason: input.reason || '' });

  const outcome = await runIdempotent<{ deposit: Deposit; journal: JournalEntry }>(
    `accounting-deposit-refund:${depositId}`,
    idempotencyKey,
    async tx => {
      const periodRef = firestore.collection(PERIOD_COLLECTION).doc(journal.periodKey);
      const journalRef = firestore.collection(JOURNAL_COLLECTION).doc(journal.id);
      const depositSnap = await tx.get(depositRef);
      if (!depositSnap.exists) throw new Error('Deposit not found.');
      const deposit = depositSnap.data() as Deposit & { holdType?: string; accountingPostingStatus?: string; accountingJournalId?: string };
      const customerRef = deposit.customerId ? firestore.collection('customers').doc(deposit.customerId) : null;
      const [customerSnap, periodSnap, existingJournal] = await Promise.all([
        customerRef ? tx.get(customerRef) : Promise.resolve(null),
        tx.get(periodRef),
        tx.get(journalRef)
      ]);
      if (!customerRef || !customerSnap?.exists) throw new Error('Deposit customer not found.');
      if (deposit.holdType === 'gateway_authorization') throw new Error('Gateway authorization holds cannot use the manual refund route.');
      if (deposit.accountingPostingStatus !== 'posted' || !deposit.accountingJournalId) throw new Error('Deposit receipt must be posted to accounting before refund.');
      if (!['held', 'partially_refunded'].includes(String(deposit.status || ''))) throw new Error(`Deposit cannot be refunded in status ${deposit.status || 'unknown'}.`);
      const heldBalance = assertFiniteMoney(deposit.balance, 'Held deposit balance');
      if (heldBalance <= 0) throw new Error('Deposit has no refundable held balance.');
      if (amount > heldBalance + 0.005) throw new Error('Refund amount exceeds held deposit balance.');
      if (existingJournal.exists) throw new Error('Duplicate deposit-refund journal detected.');
      if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') throw new Error(`Accounting period ${journal.periodKey} is closed.`);

      const now = new Date().toISOString();
      const balance = money(heldBalance - amount);
      const updatedDeposit = {
        ...deposit,
        refundedAmount: money((deposit.refundedAmount || 0) + amount),
        balance,
        status: balance <= 0.005 ? 'refunded' : 'partially_refunded',
        refundDate: now,
        updatedAt: now
      } as Deposit;
      tx.set(depositRef, updatedDeposit as unknown as FirebaseFirestore.DocumentData, { merge: true });
      tx.create(journalRef, journal as unknown as FirebaseFirestore.DocumentData);

      const held = Number((customerSnap.data() as any).securityDepositsHeld || 0);
      if (!Number.isFinite(held)) throw new Error('Customer held-deposit balance is invalid and requires accounting review.');
      tx.set(customerRef, { securityDepositsHeld: Math.max(0, money(held - amount)), updatedAt: now }, { merge: true });
      return { deposit: updatedDeposit, journal };
    },
    requestFingerprint
  );

  if (!outcome.replayed) {
    const depositIndex = globalStore.deposits.findIndex(item => item.id === depositId);
    if (depositIndex >= 0) globalStore.deposits[depositIndex] = outcome.result.deposit as any;
    const customer = globalStore.customers.find(item => item.id === outcome.result.deposit.customerId);
    if (customer) customer.securityDepositsHeld = Math.max(0, money((customer.securityDepositsHeld || 0) - amount));
    await persistAuditRecovery(recordAudit, {
      userId: actor.uid, userName: actor.name, userRole: actor.role,
      entityType: 'Deposit', entityId: depositId, action: 'refund',
      newValue: `Refunded ${amount.toFixed(2)} AED from deposit ${depositId}; journal ${journal.id}.`,
      reason: input.reason || 'Security deposit refund'
    }, `DepositRefund_${journal.id}`);
  }

  return { ...outcome.result, replayed: outcome.replayed };
}
