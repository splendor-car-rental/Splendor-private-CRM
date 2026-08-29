import { runIdempotent, IdempotentOutcome } from './idempotency';
import { issueNextNumber } from './idGenerator';
import { PersistenceError } from './persistence';
import { globalStore } from './dataStore';
import { RecordAuditFn } from './businessRules';
import { dispatchNotificationEvent, dispatchCustomerNotification } from './notificationEngine';
import type { Payment } from '../types';

/**
 * Payment recording -- extracted, behavior-preserving, from the body of
 * `POST /api/payments` in server.ts (which now just calls this). Reused a
 * second time by the Payment Gateway webhook handler
 * (src/server/paymentIntents.ts) once a gateway confirms an online charge
 * actually succeeded, so an online (gateway) payment and a manually
 * recorded one (cash/bank transfer) become the exact same Payment record
 * and go through the exact same invoice/customer-balance update -- never
 * two parallel "a payment happened" code paths.
 */
export class PaymentError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentError';
  }
}

export interface CreateConfirmedPaymentInput {
  customerId?: string;
  customerName?: string;
  contractId?: string;
  reservationId?: string;
  invoiceId?: string;
  amount: number;
  method: Payment['method'];
  receivedById?: string;
  receivedByName?: string;
  notes?: string;
  /** Set only when this Payment originates from a gateway-confirmed PaymentIntent -- never for a manually recorded payment. */
  gatewayPaymentIntentId?: string;
  /** CRMDocument id of the proof-of-payment upload (see POST /api/upload's 'payment-proofs' folder), when one was attached at recording time. */
  proofDocumentId?: string;
}

export async function createConfirmedPayment(
  data: CreateConfirmedPaymentInput,
  idempotencyKey: string | undefined | null,
  recordAudit: RecordAuditFn
): Promise<IdempotentOutcome<Payment>> {
  const amount = Number(data.amount) || 0;
  if (amount <= 0) {
    throw new PaymentError('A positive payment amount is required.');
  }

  const newId = await issueNextNumber('Payment');
  const receiptNum = await issueNextNumber('Receipt');
  const now = new Date().toISOString();

  // Every manually recorded payment (RULE requirement: "حالة التحقق" --
  // verification status) starts unverified regardless of method, even when
  // a proof file was attached at recording time -- attaching a file is not
  // the same as a finance reviewer having actually checked it. It only
  // ever moves to 'verified'/'rejected' via POST /api/payments/:id/verify,
  // a distinct, human-initiated action, or via the bank reconciliation
  // confirm flow -- never automatically here.
  const initialVerificationStatus = 'pending_review' as const;

  const { result: payment, replayed } = await runIdempotent('payment-create', idempotencyKey, async (tx, db) => {
    const paymentDoc: Payment = {
      ...data,
      id: newId,
      amount,
      status: 'allocated',
      allocatedTo: [],
      receivedBy: data.receivedById || 'USR-004',
      receivedAt: now,
      receiptNumber: receiptNum,
      notes: data.notes || '',
      verificationStatus: initialVerificationStatus,
      createdAt: now
    } as unknown as Payment;

    let invoiceRef: FirebaseFirestore.DocumentReference | null = null;
    let invoiceSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (data.invoiceId) {
      invoiceRef = db.collection('invoices').doc(data.invoiceId);
      invoiceSnap = await tx.get(invoiceRef);
    }
    let customerRef: FirebaseFirestore.DocumentReference | null = null;
    let customerSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (data.customerId) {
      customerRef = db.collection('customers').doc(data.customerId);
      customerSnap = await tx.get(customerRef);
    }

    tx.create(db.collection('payments').doc(newId), paymentDoc as unknown as Record<string, unknown>);

    if (invoiceRef && invoiceSnap?.exists) {
      const inv = invoiceSnap.data() as any;
      const paidAmount = inv.paidAmount + amount;
      const balanceDue = Math.max(0, inv.totalAmount - paidAmount);
      tx.set(invoiceRef, { paidAmount, balanceDue, status: balanceDue === 0 ? 'paid' : 'partially_paid', updatedAt: now }, { merge: true });
    }
    if (customerRef && customerSnap?.exists) {
      const cust = customerSnap.data() as any;
      tx.set(customerRef, { outstandingBalance: Math.max(0, (cust.outstandingBalance || 0) - amount), updatedAt: now }, { merge: true });
    }

    return paymentDoc;
  });

  if (!replayed) {
    globalStore.payments.unshift(payment as any);
    if (data.invoiceId) {
      const inv = globalStore.invoices.find(i => i.id === data.invoiceId);
      if (inv) {
        inv.paidAmount += amount;
        inv.balanceDue = Math.max(0, inv.totalAmount - inv.paidAmount);
        inv.status = inv.balanceDue === 0 ? 'paid' : 'partially_paid';
      }
    }
    const customer = globalStore.customers.find(c => c.id === data.customerId);
    if (customer) customer.outstandingBalance = Math.max(0, customer.outstandingBalance - amount);

    await recordAudit({
      userId: data.receivedById || 'USR-004',
      userName: data.receivedByName || 'Faisal Al-Hashimi',
      userRole: 'finance',
      entityType: 'Payment',
      entityId: newId,
      action: 'create',
      newValue: `Recorded payment of ${amount} AED (${data.method}) from ${data.customerName}. Receipt: ${receiptNum}.${data.gatewayPaymentIntentId ? ` Gateway intent: ${data.gatewayPaymentIntentId}.` : ''}`
    });

    try {
      await dispatchNotificationEvent('payment_received',
        `Payment of ${amount} AED received from ${data.customerName} (${data.method}). Receipt ${receiptNum}.`,
        `تم استلام دفعة بقيمة ${amount} درهم من ${data.customerName} (${data.method}). إيصال ${receiptNum}.`
      );
      if (data.customerId) {
        await dispatchCustomerNotification('customer_payment_receipt', data.customerId, data.customerName || '', customer?.phone,
          `Payment received -- ${amount.toLocaleString()} AED (${data.method}). Receipt No. ${receiptNum}. Thank you.`,
          `تم استلام دفعتكم بقيمة ${amount.toLocaleString()} درهم (${data.method}). رقم الإيصال ${receiptNum}. شكراً لكم.`);
      }
    } catch (err) {
      console.error('WhatsApp dispatch failed (payment_received):', err);
    }
  }

  return { result: payment, replayed };
}

/**
 * Reverses a previously-confirmed Payment once a gateway refund is itself
 * webhook-confirmed (see paymentIntents.ts) -- the exact inverse of
 * createConfirmedPayment's invoice/customer-balance update, never a
 * separate ledger. Idempotent the same way: replaying with the same
 * idempotencyKey (the PaymentRefund id) returns the original result rather
 * than double-reversing.
 */
export async function applyConfirmedPaymentRefund(
  paymentId: string,
  refundAmount: number,
  idempotencyKey: string | undefined | null,
  recordAudit: RecordAuditFn
): Promise<IdempotentOutcome<{ paymentId: string; refundedAmount: number }>> {
  const now = new Date().toISOString();

  return runIdempotent('payment-refund-apply', idempotencyKey, async (tx, db) => {
    const paymentRef = db.collection('payments').doc(paymentId);
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists) throw new PaymentError(`Payment ${paymentId} not found.`);
    const payment = paymentSnap.data() as Payment;

    let invoiceRef: FirebaseFirestore.DocumentReference | null = null;
    let invoiceSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (payment.invoiceId) {
      invoiceRef = db.collection('invoices').doc(payment.invoiceId);
      invoiceSnap = await tx.get(invoiceRef);
    }
    let customerRef: FirebaseFirestore.DocumentReference | null = null;
    let customerSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (payment.customerId) {
      customerRef = db.collection('customers').doc(payment.customerId);
      customerSnap = await tx.get(customerRef);
    }

    tx.set(paymentRef, { status: 'refunded', updatedAt: now }, { merge: true });
    if (invoiceRef && invoiceSnap?.exists) {
      const inv = invoiceSnap.data() as any;
      const paidAmount = Math.max(0, inv.paidAmount - refundAmount);
      const balanceDue = Math.max(0, inv.totalAmount - paidAmount);
      const status = paidAmount === 0 ? 'unpaid' : balanceDue === 0 ? 'paid' : 'partially_paid';
      tx.set(invoiceRef, { paidAmount, balanceDue, status, updatedAt: now }, { merge: true });
    }
    if (customerRef && customerSnap?.exists) {
      const cust = customerSnap.data() as any;
      tx.set(customerRef, { outstandingBalance: (cust.outstandingBalance || 0) + refundAmount, updatedAt: now }, { merge: true });
    }

    const paymentIndex = globalStore.payments.findIndex(p => p.id === paymentId);
    if (paymentIndex !== -1) globalStore.payments[paymentIndex] = { ...globalStore.payments[paymentIndex], status: 'refunded' };
    if (payment.invoiceId) {
      const inv = globalStore.invoices.find(i => i.id === payment.invoiceId);
      if (inv) {
        inv.paidAmount = Math.max(0, inv.paidAmount - refundAmount);
        inv.balanceDue = Math.max(0, inv.totalAmount - inv.paidAmount);
        inv.status = inv.balanceDue === 0 ? (inv.paidAmount === 0 ? 'unpaid' : 'paid') : 'partially_paid';
      }
    }
    const customer = globalStore.customers.find(c => c.id === payment.customerId);
    if (customer) customer.outstandingBalance += refundAmount;

    await recordAudit({
      userId: 'system', userName: 'Payment Gateway (webhook-confirmed refund)', userRole: 'finance',
      entityType: 'Payment', entityId: paymentId, action: 'refund',
      newValue: `Refunded ${refundAmount} AED against payment ${paymentId} following a gateway-confirmed refund.`
    });

    return { paymentId, refundedAmount: refundAmount };
  });
}
