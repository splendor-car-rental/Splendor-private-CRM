import { runDurableTransaction, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { globalStore } from './dataStore.js';
import { RecordAuditFn } from './businessRules.js';
import type { Deposit } from '../types/index.js';

/**
 * Security deposit create/refund -- extracted, behavior-preserving, from
 * the bodies of `POST /api/deposits` and `POST /api/deposits/:id/refund`
 * in server.ts (which now just call these). Reused a second time by the
 * Payment Gateway layer (src/server/paymentIntents.ts): a gateway-backed
 * deposit HOLD (an uncaptured card authorization) becomes exactly this
 * same Deposit record once the gateway confirms the authorization, tagged
 * `holdType:'gateway_authorization'`; releasing that hold reuses this same
 * refund function once the gateway confirms the void/refund. One Deposit
 * lifecycle, two ways to reach it -- never a second deposit system.
 */
export class DepositError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'DepositError';
  }
}

export interface CreateSecurityDepositInput {
  customerId?: string;
  customerName?: string;
  contractId?: string;
  reservationId?: string;
  amount: number;
  paymentMethod: Deposit['paymentMethod'];
  status?: Deposit['status'];
  holdReleaseDueDate?: string;
  notes?: string;
  actorId?: string;
  actorName?: string;
  /** Set only for a gateway-backed authorization hold -- never for a manually-collected (cash/bank transfer) deposit. */
  holdType?: 'gateway_authorization' | 'manual';
  gatewayPaymentIntentId?: string;
}

export async function createSecurityDeposit(data: CreateSecurityDepositInput, recordAudit: RecordAuditFn): Promise<Deposit> {
  const newId = await issueNextNumber('Deposit');
  const amount = Number(data.amount) || 0;
  const now = new Date().toISOString();
  const deposit: Deposit = {
    ...data,
    id: newId,
    amount,
    appliedAmount: 0,
    refundedAmount: 0,
    balance: amount,
    status: data.status || 'held',
    holdType: data.holdType || 'manual',
    holdReleaseDueDate: data.holdReleaseDueDate || now,
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now
  } as unknown as Deposit;

  await runDurableTransaction(async (tx, db) => {
    // Read before write -- see the same ordering note on every other
    // transaction in this codebase (real Firestore rejects a read that
    // follows a write in the same transaction).
    const customerRef = data.customerId ? db.collection('customers').doc(data.customerId) : null;
    const snap = customerRef ? await tx.get(customerRef) : null;
    tx.create(db.collection('deposits').doc(newId), deposit as unknown as Record<string, unknown>);
    if (customerRef && snap?.exists) {
      tx.set(customerRef, { securityDepositsHeld: ((snap.data() as any).securityDepositsHeld || 0) + amount, updatedAt: now }, { merge: true });
    }
  });

  globalStore.deposits.unshift(deposit as any);
  const customer = globalStore.customers.find(c => c.id === deposit.customerId);
  if (customer) customer.securityDepositsHeld += amount;

  await recordAudit({
    userId: data.actorId || 'USR-004',
    userName: data.actorName || 'Finance Manager',
    userRole: 'finance',
    entityType: 'Deposit',
    entityId: newId,
    action: 'create',
    newValue: `Took a ${amount.toLocaleString()} AED security deposit${deposit.customerId ? ` from customer ${deposit.customerId}` : ''}${data.holdType === 'gateway_authorization' ? ' via a card authorization hold (gateway-confirmed)' : ''}.`
  });

  return deposit;
}

export async function refundOrReleaseDeposit(
  depositId: string,
  refundAmount: number | undefined,
  actor: { id: string; name: string },
  recordAudit: RecordAuditFn,
  reason?: string
): Promise<Deposit> {
  const now = new Date().toISOString();
  let amt = 0;

  const updatedDeposit = await runDurableTransaction(async (tx, db) => {
    const depositRef = db.collection('deposits').doc(depositId);
    const snap = await tx.get(depositRef);
    if (!snap.exists) throw new DepositError('Deposit not found');
    const deposit = snap.data() as Deposit;
    amt = Number(refundAmount) || deposit.balance;
    if (amt > deposit.balance) throw new DepositError('Refund amount exceeds held balance');

    const customerRef = deposit.customerId ? db.collection('customers').doc(deposit.customerId) : null;
    const customerSnap = customerRef ? await tx.get(customerRef) : null;

    const updated: Deposit = {
      ...deposit,
      refundedAmount: deposit.refundedAmount + amt,
      balance: deposit.balance - amt,
      status: deposit.balance - amt === 0 ? 'refunded' : 'partially_refunded',
      refundDate: now,
      updatedAt: now
    };
    tx.set(depositRef, updated as unknown as Record<string, unknown>, { merge: true });

    if (customerRef && customerSnap?.exists) {
      const held = (customerSnap.data() as any).securityDepositsHeld || 0;
      tx.set(customerRef, { securityDepositsHeld: Math.max(0, held - amt), updatedAt: now }, { merge: true });
    }
    return updated;
  });

  const index = globalStore.deposits.findIndex(d => d.id === depositId);
  if (index !== -1) globalStore.deposits[index] = updatedDeposit as any;
  const customer = globalStore.customers.find(c => c.id === updatedDeposit.customerId);
  if (customer) customer.securityDepositsHeld = Math.max(0, customer.securityDepositsHeld - amt);

  await recordAudit({
    userId: actor.id,
    userName: actor.name,
    userRole: 'finance',
    entityType: 'Deposit',
    entityId: updatedDeposit.id,
    action: 'refund',
    newValue: `Processed deposit refund of ${amt} AED to customer ${updatedDeposit.customerName}`,
    reason: reason || (updatedDeposit.holdType === 'gateway_authorization' ? 'Card authorization hold released/voided (gateway-confirmed)' : 'Vehicle return inspection clear with no outstanding penalties')
  });

  return updatedDeposit;
}
