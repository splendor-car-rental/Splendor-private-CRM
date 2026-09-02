import { runDurableTransaction, PersistenceError } from './persistence';
import { runIdempotent, runIdempotentCreate, fingerprintRequest } from './idempotency';
import { issueNextNumber } from './idGenerator';
import { globalStore } from './dataStore';
import { RecordAuditFn } from './businessRules';
import type { Deposit } from '../types';

/**
 * Security-deposit lifecycle.
 *
 * Financial invariants enforced here (not in the browser):
 *  - a newly-created deposit is always a positive, finite HELD amount;
 *  - every deposit is bound to a real customer, and any contract/
 *    reservation linkage must belong to that same customer;
 *  - gateway authorization holds can only be released/refunded by the
 *    gateway-confirmed path, never the manual refund API;
 *  - create/refund operations can be protected by durable idempotency keys
 *    so network retries/concurrent serverless requests never double-count.
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

export interface DepositRefundOptions {
  source?: 'manual' | 'gateway_confirmed';
  idempotencyKey?: string | null;
}

export async function createSecurityDeposit(
  data: CreateSecurityDepositInput,
  recordAudit: RecordAuditFn,
  idempotencyKey?: string | null
): Promise<Deposit> {
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DepositError('A positive finite deposit amount is required.');
  }
  if (!data.paymentMethod) {
    throw new DepositError('A paymentMethod is required for a security deposit.');
  }

  const holdType = data.holdType === 'gateway_authorization' ? 'gateway_authorization' : 'manual';
  if (holdType === 'gateway_authorization' && !data.gatewayPaymentIntentId) {
    throw new DepositError('A gateway authorization deposit must be bound to its PaymentIntent.');
  }

  const fingerprint = fingerprintRequest({
    customerId: data.customerId || null,
    contractId: data.contractId || null,
    reservationId: data.reservationId || null,
    amount,
    paymentMethod: data.paymentMethod,
    holdType,
    gatewayPaymentIntentId: data.gatewayPaymentIntentId || null
  });

  const outcome = await runIdempotentCreate('deposit-create', idempotencyKey, fingerprint, async () => {
    const newId = await issueNextNumber('Deposit');
    const now = new Date().toISOString();

    const deposit = await runDurableTransaction(async (tx, db) => {
      let resolvedCustomerId = data.customerId ? String(data.customerId) : '';
      let resolvedCustomerName = data.customerName ? String(data.customerName) : '';

      if (data.contractId) {
        const contractSnap = await tx.get(db.collection('contracts').doc(String(data.contractId)));
        if (!contractSnap.exists) throw new DepositError('Linked contract not found.');
        const contract = contractSnap.data() as any;
        if (resolvedCustomerId && contract.customerId !== resolvedCustomerId) {
          throw new DepositError('Linked contract does not belong to the deposit customer.');
        }
        resolvedCustomerId = resolvedCustomerId || String(contract.customerId || '');
        resolvedCustomerName = resolvedCustomerName || String(contract.customerName || '');
      }

      if (data.reservationId) {
        const reservationSnap = await tx.get(db.collection('reservations').doc(String(data.reservationId)));
        if (!reservationSnap.exists) throw new DepositError('Linked reservation not found.');
        const reservation = reservationSnap.data() as any;
        if (resolvedCustomerId && reservation.customerId !== resolvedCustomerId) {
          throw new DepositError('Linked reservation does not belong to the deposit customer.');
        }
        resolvedCustomerId = resolvedCustomerId || String(reservation.customerId || '');
        resolvedCustomerName = resolvedCustomerName || String(reservation.customerName || '');
      }

      if (!resolvedCustomerId) throw new DepositError('A real customer binding is required for a security deposit.');
      const customerRef = db.collection('customers').doc(resolvedCustomerId);
      const customerSnap = await tx.get(customerRef);
      if (!customerSnap.exists) throw new DepositError('Deposit customer not found.');
      const customer = customerSnap.data() as any;
      resolvedCustomerName = resolvedCustomerName || String(customer.fullName || customer.name || '');

      const created: Deposit = {
        ...data,
        id: newId,
        customerId: resolvedCustomerId,
        customerName: resolvedCustomerName,
        amount,
        appliedAmount: 0,
        refundedAmount: 0,
        balance: amount,
        // A newly accepted security deposit is never born refunded/applied
        // just because a browser supplied a status field.
        status: 'held',
        holdType,
        ...(holdType === 'gateway_authorization' ? { gatewayPaymentIntentId: data.gatewayPaymentIntentId } : { gatewayPaymentIntentId: undefined }),
        holdReleaseDueDate: data.holdReleaseDueDate || now,
        notes: data.notes || '',
        createdAt: now,
        updatedAt: now
      } as unknown as Deposit;

      tx.create(db.collection('deposits').doc(newId), created as unknown as Record<string, unknown>);
      tx.set(customerRef, {
        securityDepositsHeld: Number(customer.securityDepositsHeld || 0) + amount,
        updatedAt: now
      }, { merge: true });
      return created;
    });

    globalStore.deposits.unshift(deposit as any);
    const customer = globalStore.customers.find(c => c.id === deposit.customerId);
    if (customer) customer.securityDepositsHeld = Number(customer.securityDepositsHeld || 0) + amount;
    return deposit;
  });

  if (!outcome.replayed) {
    await recordAudit({
      userId: data.actorId || 'USR-004',
      userName: data.actorName || 'Finance Manager',
      userRole: 'finance',
      entityType: 'Deposit',
      entityId: outcome.result.id,
      action: 'create',
      newValue: `Took a ${amount.toLocaleString()} AED security deposit from customer ${outcome.result.customerId}${holdType === 'gateway_authorization' ? ' via a gateway-confirmed card authorization hold' : ''}.`
    });
  }

  return outcome.result;
}

export async function refundOrReleaseDeposit(
  depositId: string,
  refundAmount: number | undefined,
  actor: { id: string; name: string },
  recordAudit: RecordAuditFn,
  reason?: string,
  options: DepositRefundOptions = {}
): Promise<Deposit> {
  const requestedAmount = refundAmount === undefined ? null : Number(refundAmount);
  if (requestedAmount !== null && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
    throw new DepositError('Refund amount must be a positive finite number.');
  }

  const now = new Date().toISOString();
  let appliedRefundAmount = 0;
  const fingerprint = fingerprintRequest({
    depositId,
    refundAmount: requestedAmount,
    source: options.source || 'manual'
  });

  const outcome = await runIdempotent('deposit-refund', options.idempotencyKey, async (tx, db) => {
    const depositRef = db.collection('deposits').doc(depositId);
    const snap = await tx.get(depositRef);
    if (!snap.exists) throw new DepositError('Deposit not found');
    const deposit = snap.data() as Deposit;

    if (deposit.holdType === 'gateway_authorization' && options.source !== 'gateway_confirmed') {
      throw new DepositError('Gateway authorization deposits must be released/refunded through the gateway-confirmed workflow.');
    }

    const balance = Number(deposit.balance);
    if (!Number.isFinite(balance) || balance <= 0) {
      throw new DepositError('Deposit has no refundable held balance.');
    }

    const amt = requestedAmount === null ? balance : requestedAmount;
    if (amt > balance + 0.001) throw new DepositError('Refund amount exceeds held balance');
    appliedRefundAmount = amt;

    const customerRef = deposit.customerId ? db.collection('customers').doc(deposit.customerId) : null;
    const customerSnap = customerRef ? await tx.get(customerRef) : null;
    if (!customerRef || !customerSnap?.exists) throw new DepositError('Deposit customer not found.');

    const nextBalance = Math.max(0, balance - amt);
    const updated: Deposit = {
      ...deposit,
      refundedAmount: Number(deposit.refundedAmount || 0) + amt,
      balance: nextBalance,
      status: nextBalance <= 0.001 ? 'refunded' : 'partially_refunded',
      refundDate: now,
      updatedAt: now
    };
    tx.set(depositRef, updated as unknown as Record<string, unknown>, { merge: true });

    const held = Number((customerSnap.data() as any).securityDepositsHeld || 0);
    tx.set(customerRef, { securityDepositsHeld: Math.max(0, held - amt), updatedAt: now }, { merge: true });
    return updated;
  }, fingerprint);

  if (!outcome.replayed) {
    const index = globalStore.deposits.findIndex(d => d.id === depositId);
    if (index !== -1) globalStore.deposits[index] = outcome.result as any;
    const customer = globalStore.customers.find(c => c.id === outcome.result.customerId);
    if (customer) customer.securityDepositsHeld = Math.max(0, Number(customer.securityDepositsHeld || 0) - appliedRefundAmount);

    await recordAudit({
      userId: actor.id,
      userName: actor.name,
      userRole: 'finance',
      entityType: 'Deposit',
      entityId: outcome.result.id,
      action: 'refund',
      newValue: `Processed deposit refund/release of ${appliedRefundAmount} AED to customer ${outcome.result.customerName}`,
      reason: reason || (outcome.result.holdType === 'gateway_authorization'
        ? 'Card authorization hold released/refunded after gateway confirmation'
        : 'Authorized manual security-deposit refund')
    });
  }

  return outcome.result;
}
