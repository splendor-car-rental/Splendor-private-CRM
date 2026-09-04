import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { issueNextNumber } from './idGenerator.js';
import { fingerprintRequest, runIdempotent } from './idempotency.js';
import type { RecordAuditFn } from './businessRules.js';
import { ACCOUNTING_CONTROL_ACCOUNTS } from '../config/accounting.js';
import { accountingPeriodKey, assertJournalAccounts, money, validateJournalLines } from '../lib/accounting.js';
import { getEffectiveChartOfAccounts, type AccountingActor } from './accounting.js';
import { globalStore } from './dataStore.js';
import type { Deposit, PaymentMethod } from '../types/index.js';
import type { AccountingPeriod, JournalEntry, JournalLine } from '../accounting/types.js';

const JOURNALS = 'accounting_journals';
const PERIODS = 'accounting_periods';
const AUDIT_RECOVERY = 'accounting_audit_recovery';

export interface SafeManualDepositInput {
  customerId: string;
  customerName?: string;
  contractId?: string;
  reservationId?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  settlementAccountCode?: string;
  holdReleaseDueDate?: string;
  notes?: string;
  transactionRef?: string;
}

function db() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function journalId(depositId: string): string {
  const digest = crypto.createHash('sha256').update(`Deposit:${depositId}:receive`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

function defaultSettlementAccount(method: PaymentMethod): string | undefined {
  if (method === 'cash') return ACCOUNTING_CONTROL_ACCOUNTS.cash;
  if (method === 'bank_transfer') return ACCOUNTING_CONTROL_ACCOUNTS.bank;
  if (['card', 'pos_card', 'online_link', 'cheque'].includes(method)) return ACCOUNTING_CONTROL_ACCOUNTS.cardClearing;
  return undefined;
}

export async function createManualDepositAtomic(
  input: SafeManualDepositInput,
  actor: AccountingActor,
  idempotencyKey: string | undefined,
  recordAudit: RecordAuditFn
): Promise<{ deposit: Deposit; journal: JournalEntry; replayed: boolean }> {
  if (!idempotencyKey) throw new Error('Idempotency-Key is required for manual security deposits.');
  if (!input.customerId) throw new Error('Customer is required.');
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Security deposit amount must be greater than zero.');
  if (input.paymentMethod === 'corporate_credit') throw new Error('Corporate credit is not a received security deposit.');

  const settlementAccountCode = String(input.settlementAccountCode || defaultSettlementAccount(input.paymentMethod) || '');
  if (!settlementAccountCode) throw new Error('This deposit payment method requires an explicit cash/bank/clearing settlement account.');
  const accounts = await getEffectiveChartOfAccounts();
  const settlement = accounts.find(account => account.code === settlementAccountCode);
  if (!settlement || !settlement.active || settlement.accountClass !== 'asset' || !settlement.cashEquivalent) {
    throw new Error('Security deposit must post to an active cash, bank, card-clearing, or payment-clearing account.');
  }

  const depositId = await issueNextNumber('Deposit');
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const periodKey = accountingPeriodKey(date);
  const jId = journalId(depositId);
  const lines: JournalLine[] = [
    { accountCode: settlementAccountCode, debit: amount, credit: 0, dimensions: { customerId: input.customerId, contractId: input.contractId, reservationId: input.reservationId } },
    { accountCode: ACCOUNTING_CONTROL_ACCOUNTS.customerDepositsHeld, debit: 0, credit: amount, dimensions: { customerId: input.customerId, contractId: input.contractId, reservationId: input.reservationId } }
  ];
  assertJournalAccounts(lines, accounts, false);
  const totals = validateJournalLines(lines);
  const journal: JournalEntry = {
    id: jId,
    date,
    periodKey,
    currency: 'AED',
    sourceType: 'Deposit',
    sourceId: depositId,
    sourceAction: 'receive',
    reference: input.transactionRef,
    memo: `Security deposit received — ${input.customerName || input.customerId}`,
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
  const firestore = db();
  const requestFingerprint = fingerprintRequest({
    customerId: input.customerId,
    contractId: input.contractId || '',
    reservationId: input.reservationId || '',
    amount,
    paymentMethod: input.paymentMethod,
    settlementAccountCode,
    transactionRef: input.transactionRef || '',
    holdReleaseDueDate: input.holdReleaseDueDate || '',
    notes: input.notes || ''
  });

  const outcome = await runIdempotent<{ deposit: Deposit; journal: JournalEntry }>(
    'accounting-manual-deposit-create',
    idempotencyKey,
    async tx => {
      const customerRef = firestore.collection('customers').doc(input.customerId);
      const depositRef = firestore.collection('deposits').doc(depositId);
      const journalRef = firestore.collection(JOURNALS).doc(jId);
      const periodRef = firestore.collection(PERIODS).doc(periodKey);
      const [customerSnap, periodSnap, existingDeposit, existingJournal] = await Promise.all([
        tx.get(customerRef), tx.get(periodRef), tx.get(depositRef), tx.get(journalRef)
      ]);
      if (!customerSnap.exists) throw new Error('Customer not found.');
      if (periodSnap.exists && (periodSnap.data() as AccountingPeriod).status === 'closed') throw new Error(`Accounting period ${periodKey} is closed.`);
      if (existingDeposit.exists || existingJournal.exists) throw new Error('Duplicate security deposit posting detected.');

      const customer = customerSnap.data() as any;
      const customerName = input.customerName || customer.fullName || input.customerId;
      const deposit = {
        id: depositId,
        customerId: input.customerId,
        customerName,
        contractId: input.contractId,
        reservationId: input.reservationId,
        amount,
        appliedAmount: 0,
        refundedAmount: 0,
        balance: amount,
        paymentMethod: input.paymentMethod,
        status: 'held',
        holdType: 'manual',
        holdReleaseDueDate: input.holdReleaseDueDate || now,
        notes: input.notes || '',
        transactionRef: input.transactionRef,
        accountingPostingStatus: 'posted',
        accountingJournalId: jId,
        accountingAccountCode: settlementAccountCode,
        createdAt: now,
        updatedAt: now
      } as unknown as Deposit;

      tx.create(depositRef, deposit as unknown as FirebaseFirestore.DocumentData);
      tx.create(journalRef, { ...journal, memo: `Security deposit received — ${customerName}` } as unknown as FirebaseFirestore.DocumentData);
      tx.set(customerRef, {
        securityDepositsHeld: money(Number(customer.securityDepositsHeld || 0) + amount),
        updatedAt: now
      }, { merge: true });
      return { deposit, journal: { ...journal, memo: `Security deposit received — ${customerName}` } };
    },
    requestFingerprint
  );

  if (!outcome.replayed) {
    globalStore.deposits.unshift(outcome.result.deposit as any);
    const customer = globalStore.customers.find(item => item.id === input.customerId);
    if (customer) customer.securityDepositsHeld = money((customer.securityDepositsHeld || 0) + amount);
    const auditPayload = {
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'Deposit',
      entityId: outcome.result.deposit.id,
      action: 'create' as const,
      newValue: `Security deposit ${outcome.result.deposit.id} received atomically for ${amount.toFixed(2)} AED; journal ${outcome.result.journal.id}.`
    };
    try {
      await recordAudit(auditPayload);
    } catch (auditError: any) {
      await firestore.collection(AUDIT_RECOVERY).doc(`DepositCreate_${outcome.result.deposit.id}`).set({
        id: `DepositCreate_${outcome.result.deposit.id}`,
        status: 'pending',
        auditPayload,
        error: String(auditError?.message || auditError || 'Audit write failed'),
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(recoveryError => console.error('[accounting] deposit creation audit recovery persistence failed:', recoveryError));
    }
  }

  return { ...outcome.result, replayed: outcome.replayed };
}

/**
 * The single request-handling entry point for POST /api/deposits, called
 * from both api/index.ts (the real Vercel production route) and server.ts
 * (local dev / the route the test suite exercises via supertest). Keeping
 * one implementation here -- instead of api/index.ts and server.ts each
 * carrying their own copy of this request/response logic -- is what
 * actually closes the split-brain: server.ts used to call the older,
 * non-idempotent, no-journal `createSecurityDeposit` from `deposits.ts`
 * directly, which was silently dead in production but still what local
 * dev and every test ran against.
 */
export async function handleSafeManualDepositCreate(
  req: Request,
  res: Response,
  actor: AccountingActor,
  recordAudit: RecordAuditFn
) {
  const body = req.body || {};
  if (body.holdType === 'gateway_authorization') {
    return res.status(400).json({ error: 'Gateway authorization holds must be created by the signed payment-gateway lifecycle.' });
  }
  const idempotencyKeyHeader = req.headers['idempotency-key'];
  const idempotencyKey = Array.isArray(idempotencyKeyHeader) ? idempotencyKeyHeader[0] : idempotencyKeyHeader;
  try {
    const result = await createManualDepositAtomic({
      customerId: String(body.customerId || ''),
      customerName: body.customerName,
      contractId: body.contractId,
      reservationId: body.reservationId,
      amount: Number(body.amount),
      paymentMethod: body.paymentMethod,
      settlementAccountCode: body.settlementAccountCode,
      holdReleaseDueDate: body.holdReleaseDueDate,
      notes: body.notes,
      transactionRef: body.transactionRef
    }, actor, idempotencyKey, recordAudit);
    return res.status(result.replayed ? 200 : 201).json(result.deposit);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Security deposit request failed.';
    const lowered = message.toLowerCase();
    const status = lowered.includes('idempotency-key') || lowered.includes('duplicate') || lowered.includes('closed') ? 409 : 400;
    return res.status(status).json({ error: message });
  }
}
