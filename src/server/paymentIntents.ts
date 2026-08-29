import admin from 'firebase-admin';
import { createDurable, updateDurable, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { RecordAuditFn } from './businessRules';
import { fingerprintRequest, runIdempotentCreate, IdempotencyConflictError } from './idempotency';
import {
  getActiveGatewayAdapter, GatewayNotConfiguredError, type GatewayWebhookEvent
} from './paymentGatewayAdapter';
import { createConfirmedPayment, applyConfirmedPaymentRefund, PaymentError } from './payments';
import { createSecurityDeposit, refundOrReleaseDeposit, DepositError } from './deposits';
import { recordLtoInstallmentPayment, LtoError, type LtoActor } from './leaseToOwn';
import type {
  PaymentIntent, PaymentIntentPurpose, PaymentGatewayEvent, PaymentRefund, Invoice, LtoInstallment
} from '../types';

/**
 * Payment Gateway business logic (Production-Grade Payment & Settlement
 * Layer). Extends the existing Invoice/Payment/Deposit/LtoInstallment
 * lifecycle -- no parallel financial ledger:
 *
 *  - A PaymentIntent's `amount` is ALWAYS derived from the real linked
 *    entity's own outstanding balance (Invoice.balanceDue,
 *    LtoInstallment.remainingAmount) -- never accepted from the client.
 *    Only a `security_deposit` intent (which has no pre-existing entity to
 *    derive an amount from) takes an explicit amount.
 *  - A PaymentIntent's status ONLY ever advances in handleGatewayWebhook(),
 *    in response to a signature-verified webhook event -- never from the
 *    synchronous return of createPaymentIntent()/refundPaymentIntent(), and
 *    never from anything the frontend reports. This is the literal
 *    implementation of "the frontend's response is never success; only a
 *    trusted gateway webhook is."
 *  - The actual financial effect of a confirmed intent/refund is applied by
 *    calling straight into the SAME functions the manual (cash/bank
 *    transfer) finance-entry routes already use
 *    (createConfirmedPayment/createSecurityDeposit/refundOrReleaseDeposit/
 *    recordLtoInstallmentPayment) -- an online (gateway) payment and a
 *    manually recorded one become the exact same Payment/Deposit/
 *    LtoInstallment record, never two parallel systems.
 */

const PAYMENT_INTENTS = 'payment_intents';
const PAYMENT_GATEWAY_EVENTS = 'payment_gateway_events';
const PAYMENT_REFUNDS = 'payment_refunds';

export class PaymentIntentError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentIntentError';
  }
}

const SYSTEM_ACTOR: LtoActor = { uid: 'system', name: 'Payment Gateway (webhook-confirmed)', role: 'finance' };

export interface CreatePaymentIntentInput {
  purpose: PaymentIntentPurpose;
  invoiceId?: string;
  ltoInstallmentId?: string;
  /** Required (and only used) for `security_deposit` -- there is no pre-existing entity to derive an amount from. Ignored for invoice_payment/lto_installment: their amount always comes from the real linked record. */
  amount?: number;
  customerId?: string;
  customerName?: string;
  contractId?: string;
  currency?: string;
}

interface ResolvedIntentLinkage {
  amount: number;
  customerId?: string;
  customerName?: string;
  contractId?: string;
}

/** Never trusts a client-supplied amount for a purpose that has a real linked entity -- always re-derives it server-side from that entity's own current outstanding balance. */
async function resolveIntentLinkage(input: CreatePaymentIntentInput): Promise<ResolvedIntentLinkage> {
  if (input.purpose === 'invoice_payment') {
    if (!input.invoiceId) throw new PaymentIntentError('invoiceId is required for an invoice_payment intent.');
    const snap = await admin.firestore().collection('invoices').doc(input.invoiceId).get();
    if (!snap.exists) throw new PaymentIntentError(`Invoice ${input.invoiceId} not found.`);
    const invoice = snap.data() as Invoice;
    if (invoice.balanceDue <= 0) throw new PaymentIntentError('This invoice has no outstanding balance to pay.');
    return { amount: invoice.balanceDue, customerId: invoice.customerId, customerName: invoice.customerName, contractId: invoice.contractId };
  }
  if (input.purpose === 'lto_installment') {
    if (!input.ltoInstallmentId) throw new PaymentIntentError('ltoInstallmentId is required for an lto_installment intent.');
    const snap = await admin.firestore().collection('lto_installments').doc(input.ltoInstallmentId).get();
    if (!snap.exists) throw new PaymentIntentError(`Installment ${input.ltoInstallmentId} not found.`);
    const installment = snap.data() as LtoInstallment;
    if (installment.remainingAmount <= 0) throw new PaymentIntentError('This installment has no remaining amount due.');
    return { amount: installment.remainingAmount, customerId: installment.customerId, customerName: installment.customerName, contractId: installment.contractId };
  }
  // security_deposit -- no pre-existing entity; the amount is the deposit itself being requested.
  const amount = Number(input.amount) || 0;
  if (amount <= 0) throw new PaymentIntentError('A positive amount is required to place a security deposit hold.');
  return { amount, customerId: input.customerId, customerName: input.customerName, contractId: input.contractId };
}

/**
 * Idempotency-Key protected: a double-click or network retry on "create a
 * checkout" must never open two separate PaymentIntents (and therefore two
 * separate gateway charge attempts) for the same invoice/installment/
 * deposit request. A replay with the same key returns the original
 * PaymentIntent instead of creating a second one; a reused key with a
 * genuinely different request body is refused (IdempotencyConflictError),
 * never silently applied to the wrong request.
 */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
  actor: { uid: string; name: string },
  recordAudit: RecordAuditFn,
  idempotencyKey?: string | null
): Promise<{ intent: PaymentIntent; replayed: boolean }> {
  const { result: intent, replayed } = await runIdempotentCreate(
    'payment-intent-create', idempotencyKey, fingerprintRequest(input),
    async () => {
      const linkage = await resolveIntentLinkage(input);
      const adapter = getActiveGatewayAdapter();
      const id = await issueNextNumber('PaymentIntent');
      const currency = input.currency || 'AED';

      let gatewayResult;
      try {
        gatewayResult = await adapter.createIntent({
          amount: linkage.amount,
          currency,
          purpose: input.purpose,
          metadata: {
            internalIntentId: id,
            ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
            ...(input.ltoInstallmentId ? { ltoInstallmentId: input.ltoInstallmentId } : {}),
            ...(linkage.customerId ? { customerId: linkage.customerId } : {})
          }
        });
      } catch (err) {
        if (err instanceof GatewayNotConfiguredError) throw new PaymentIntentError(err.message);
        throw err;
      }

      const now = new Date().toISOString();
      const created: PaymentIntent = {
        id,
        provider: adapter.provider,
        providerIntentId: gatewayResult.providerIntentId,
        purpose: input.purpose,
        amount: linkage.amount,
        currency,
        status: gatewayResult.status,
        ...(linkage.customerId ? { customerId: linkage.customerId } : {}),
        ...(linkage.customerName ? { customerName: linkage.customerName } : {}),
        ...(linkage.contractId ? { contractId: linkage.contractId } : {}),
        ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
        ...(input.ltoInstallmentId ? { ltoInstallmentId: input.ltoInstallmentId } : {}),
        ...(gatewayResult.clientSecret ? { clientSecret: gatewayResult.clientSecret } : {}),
        createdBy: actor.uid,
        createdByName: actor.name,
        createdAt: now,
        updatedAt: now
      };

      await createDurable(PAYMENT_INTENTS, created as unknown as { id: string });

      await recordAudit({
        userId: actor.uid, userName: actor.name, userRole: 'finance',
        entityType: 'PaymentIntent', entityId: id, action: 'create',
        newValue: `Created a ${linkage.amount} ${currency} ${input.purpose} payment intent via ${adapter.provider} (${gatewayResult.providerIntentId}).`
      });

      return created;
    }
  );

  return { intent, replayed };
}

export async function getPaymentIntent(id: string): Promise<PaymentIntent | null> {
  const snap = await admin.firestore().collection(PAYMENT_INTENTS).doc(id).get();
  return snap.exists ? (snap.data() as PaymentIntent) : null;
}

/**
 * Applies the real financial effect of a newly-succeeded PaymentIntent by
 * calling into the exact same functions a manually-recorded (cash/bank
 * transfer) finance entry already uses -- never a parallel effect.
 */
async function applyConfirmedIntentEffect(intent: PaymentIntent, recordAudit: RecordAuditFn): Promise<void> {
  if (intent.purpose === 'invoice_payment') {
    await createConfirmedPayment({
      customerId: intent.customerId,
      customerName: intent.customerName,
      contractId: intent.contractId,
      invoiceId: intent.invoiceId,
      amount: intent.amount,
      method: 'online_link',
      receivedById: 'system',
      receivedByName: 'Payment Gateway (webhook-confirmed)',
      notes: `Confirmed via ${intent.provider} gateway (${intent.providerIntentId}).`,
      gatewayPaymentIntentId: intent.id
    }, intent.id, recordAudit); // the intent id IS the idempotency key -- a redelivered webhook can never double-credit
    return;
  }

  if (intent.purpose === 'lto_installment') {
    if (!intent.ltoInstallmentId) throw new PaymentIntentError('PaymentIntent is missing its linked LTO installment.');
    await recordLtoInstallmentPayment(
      intent.ltoInstallmentId, intent.amount, 'online_link', SYSTEM_ACTOR,
      intent.id, fingerprintRequest({ intentId: intent.id }), recordAudit
    );
    return;
  }

  // security_deposit: a confirmed authorization becomes the real Deposit
  // record, tagged as a gateway-backed hold.
  const deposit = await createSecurityDeposit({
    customerId: intent.customerId,
    customerName: intent.customerName,
    contractId: intent.contractId,
    amount: intent.amount,
    paymentMethod: 'card',
    holdType: 'gateway_authorization',
    gatewayPaymentIntentId: intent.id,
    actorId: 'system',
    actorName: 'Payment Gateway (webhook-confirmed)'
  }, recordAudit);

  await updateDurable(PAYMENT_INTENTS, intent.id, { depositId: deposit.id, updatedAt: new Date().toISOString() });
}

/**
 * Applies the real financial reversal of a webhook-confirmed refund, by
 * calling into the same reversal logic the manual finance-entry refund
 * routes use.
 */
async function applyConfirmedRefundEffect(refund: PaymentRefund, intent: PaymentIntent, recordAudit: RecordAuditFn): Promise<void> {
  if (intent.purpose === 'invoice_payment') {
    // The Payment created for this intent used the intent id as its own
    // reference -- find it the same way any other lookup by
    // gatewayPaymentIntentId would.
    const snap = await admin.firestore().collection('payments').where('gatewayPaymentIntentId', '==', intent.id).get();
    const paymentDoc = snap.docs[0];
    if (!paymentDoc) throw new PaymentIntentError(`No Payment record found for intent ${intent.id} to reverse.`);
    await applyConfirmedPaymentRefund(paymentDoc.id, refund.amount, refund.id, recordAudit);
    return;
  }

  if (intent.purpose === 'security_deposit') {
    if (!intent.depositId) throw new PaymentIntentError(`PaymentIntent ${intent.id} has no linked Deposit to refund.`);
    await refundOrReleaseDeposit(intent.depositId, refund.amount, { id: 'system', name: 'Payment Gateway (webhook-confirmed)' }, recordAudit,
      'Card authorization captured funds reversed via gateway-confirmed refund.');
    return;
  }

  // lto_installment refunds are a rare correction path (LTO's normal
  // unwind mechanisms are Early Settlement/Termination, not raw refunds) --
  // out of scope for this pass; fail loudly rather than silently no-op.
  throw new PaymentIntentError('Refunding an lto_installment PaymentIntent directly is not supported -- use LTO Early Settlement/Termination.');
}

/**
 * Processes one verified webhook delivery. Signature verification and
 * event-id dedupe both happen here, BEFORE any business effect -- a
 * redelivered event (every real gateway retries) is a durable no-op via
 * the `${provider}:${providerEventId}` document, never a second charge.
 */
export async function handleGatewayWebhook(rawBody: Buffer, signatureHeader: string | undefined, recordAudit: RecordAuditFn): Promise<{ processed: boolean; reason?: string }> {
  const adapter = getActiveGatewayAdapter();
  if (!adapter.verifyWebhookSignature(rawBody, signatureHeader)) {
    return { processed: false, reason: 'invalid_signature' };
  }

  const parsed: GatewayWebhookEvent | null = adapter.parseWebhookEvent(rawBody);
  if (!parsed) {
    return { processed: false, reason: 'unrecognized_payload' };
  }

  const eventDocId = `${adapter.provider}:${parsed.providerEventId}`;
  const eventRef = admin.firestore().collection(PAYMENT_GATEWAY_EVENTS).doc(eventDocId);
  const existing = await eventRef.get();
  if (existing.exists && (existing.data() as PaymentGatewayEvent).processedAt) {
    return { processed: false, reason: 'duplicate_event' }; // already applied -- not an error, just a no-op
  }

  const now = new Date().toISOString();
  const eventLog: PaymentGatewayEvent = {
    id: eventDocId,
    provider: adapter.provider,
    providerEventId: parsed.providerEventId,
    type: parsed.type,
    ...(parsed.providerIntentId ? { providerIntentId: parsed.providerIntentId } : {}),
    ...(parsed.providerRefundId ? { providerRefundId: parsed.providerRefundId } : {}),
    receivedAt: now
  };
  await eventRef.set(eventLog, { merge: true });

  try {
    await applyWebhookEvent(parsed, recordAudit);
    await eventRef.set({ processedAt: new Date().toISOString() }, { merge: true });
    return { processed: true };
  } catch (err: any) {
    await eventRef.set({ processingError: err?.message || String(err) }, { merge: true });
    throw err;
  }
}

async function findIntentByProviderIntentId(providerIntentId: string): Promise<{ id: string; intent: PaymentIntent } | null> {
  const snap = await admin.firestore().collection(PAYMENT_INTENTS).where('providerIntentId', '==', providerIntentId).get();
  const doc = snap.docs[0];
  return doc ? { id: doc.id, intent: doc.data() as PaymentIntent } : null;
}

async function findRefundByProviderRefundId(providerRefundId: string): Promise<{ id: string; refund: PaymentRefund } | null> {
  const snap = await admin.firestore().collection(PAYMENT_REFUNDS).where('providerRefundId', '==', providerRefundId).get();
  const doc = snap.docs[0];
  return doc ? { id: doc.id, refund: doc.data() as PaymentRefund } : null;
}

async function applyWebhookEvent(event: GatewayWebhookEvent, recordAudit: RecordAuditFn): Promise<void> {
  const now = new Date().toISOString();

  if (event.type === 'refund.succeeded' || event.type === 'refund.failed') {
    if (!event.providerRefundId) throw new PaymentIntentError('Refund webhook event is missing providerRefundId.');
    const found = await findRefundByProviderRefundId(event.providerRefundId);
    if (!found) throw new PaymentIntentError(`No PaymentRefund found for gateway refund ${event.providerRefundId}.`);
    if (found.refund.status !== 'pending' && found.refund.status !== 'processing') {
      return; // already finalized -- nothing to do (defense in depth alongside the event-level dedupe)
    }

    if (event.type === 'refund.failed') {
      await updateDurable(PAYMENT_REFUNDS, found.id, { status: 'failed', failureReason: 'Gateway reported the refund failed.' });
      return;
    }

    const intentSnap = await admin.firestore().collection(PAYMENT_INTENTS).doc(found.refund.paymentIntentId).get();
    if (!intentSnap.exists) throw new PaymentIntentError(`PaymentIntent ${found.refund.paymentIntentId} not found for refund ${found.id}.`);
    const intent = intentSnap.data() as PaymentIntent;

    await applyConfirmedRefundEffect(found.refund, intent, recordAudit);
    await updateDurable(PAYMENT_REFUNDS, found.id, { status: 'succeeded', confirmedAt: now });
    return;
  }

  // Payment Intent lifecycle events. Note: 'succeeded' is NOT always
  // terminal here -- for a security_deposit intent it means "the
  // authorization hold was placed", and a legitimate 'canceled' (release)
  // event can still follow it. 'failed'/'canceled' ARE always terminal.
  // Each branch below additionally checks it isn't re-applying an event
  // the intent already reflects -- defense in depth alongside the
  // event-level dedupe above.
  if (!event.providerIntentId) throw new PaymentIntentError('PaymentIntent webhook event is missing providerIntentId.');
  const found = await findIntentByProviderIntentId(event.providerIntentId);
  if (!found) throw new PaymentIntentError(`No PaymentIntent found for gateway reference ${event.providerIntentId}.`);
  const intent = found.intent;

  if (intent.status === 'failed' || intent.status === 'canceled') {
    return; // always terminal -- nothing can legitimately follow either state
  }

  if (event.type === 'payment_intent.failed') {
    await updateDurable(PAYMENT_INTENTS, found.id, { status: 'failed', failureReason: 'Gateway reported the payment failed.', updatedAt: now });
    return;
  }
  if (event.type === 'payment_intent.canceled') {
    // A canceled security_deposit intent whose authorization already
    // became a real Deposit record must release that Deposit too -- the
    // gateway confirming the void is exactly the trusted signal to do so,
    // reusing the same refund/release function the manual finance route
    // uses for a full-balance release.
    if (intent.purpose === 'security_deposit' && intent.depositId) {
      await refundOrReleaseDeposit(intent.depositId, undefined, { id: 'system', name: 'Payment Gateway (webhook-confirmed)' }, recordAudit,
        'Card authorization hold voided/released via gateway-confirmed cancellation.');
    }
    await updateDurable(PAYMENT_INTENTS, found.id, { status: 'canceled', canceledAt: now, updatedAt: now });
    return;
  }
  if (event.type === 'payment_intent.requires_capture') {
    if (intent.status !== 'requires_payment' && intent.status !== 'processing') return; // already past this point
    await updateDurable(PAYMENT_INTENTS, found.id, { status: 'requires_capture', updatedAt: now });
    return;
  }
  if (event.type === 'payment_intent.succeeded') {
    if (intent.status === 'succeeded') return; // already applied -- never re-run the confirmed effect
    // Apply the real effect FIRST -- if it throws (e.g. the linked invoice
    // was deleted between intent creation and confirmation), the intent
    // itself is never marked succeeded, so a legitimate retry of this same
    // webhook delivery can still apply it once the underlying issue is
    // fixed, rather than the intent being stuck "succeeded" with no
    // matching Payment/Deposit ever created.
    await applyConfirmedIntentEffect({ ...intent, id: found.id }, recordAudit);
    await updateDurable(PAYMENT_INTENTS, found.id, { status: 'succeeded', confirmedAt: now, updatedAt: now });
  }
}

export interface RequestRefundInput {
  paymentIntentId: string;
  amount?: number; // defaults to the intent's full amount
  reason: string;
}

export async function refundPaymentIntent(
  input: RequestRefundInput,
  actor: { uid: string; name: string },
  recordAudit: RecordAuditFn
): Promise<PaymentRefund> {
  if (!input.reason || !input.reason.trim()) {
    throw new PaymentIntentError('A reason is required to request a refund.');
  }
  const intent = await getPaymentIntent(input.paymentIntentId);
  if (!intent) throw new PaymentIntentError(`PaymentIntent ${input.paymentIntentId} not found.`);
  if (intent.status !== 'succeeded') {
    throw new PaymentIntentError(`Only a succeeded PaymentIntent can be refunded (current status: ${intent.status}).`);
  }
  const amount = input.amount !== undefined ? Number(input.amount) : intent.amount;
  if (amount <= 0 || amount > intent.amount) {
    throw new PaymentIntentError(`Refund amount must be between 0 and the original ${intent.amount} ${intent.currency}.`);
  }

  const adapter = getActiveGatewayAdapter();
  const gatewayResult = await adapter.refund(intent.providerIntentId, amount);

  const id = await issueNextNumber('PaymentRefund');
  const now = new Date().toISOString();
  const refund: PaymentRefund = {
    id,
    paymentIntentId: intent.id,
    provider: adapter.provider,
    providerRefundId: gatewayResult.providerRefundId,
    amount,
    reason: input.reason,
    status: 'processing',
    requestedBy: actor.uid,
    requestedByName: actor.name,
    requestedAt: now
  };
  await createDurable(PAYMENT_REFUNDS, refund as unknown as { id: string });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: 'finance',
    entityType: 'PaymentIntent', entityId: intent.id, action: 'refund',
    newValue: `Requested a ${amount} ${intent.currency} refund (${gatewayResult.providerRefundId}) -- pending gateway confirmation.`,
    reason: input.reason
  });

  return refund;
}

/** Voids a not-yet-captured security-deposit authorization hold -- the actual Deposit status only flips to 'refunded' once the corresponding webhook confirms the void. */
export async function releaseSecurityDepositHold(
  paymentIntentId: string,
  actor: { uid: string; name: string },
  recordAudit: RecordAuditFn
): Promise<PaymentIntent> {
  const intent = await getPaymentIntent(paymentIntentId);
  if (!intent) throw new PaymentIntentError(`PaymentIntent ${paymentIntentId} not found.`);
  if (intent.purpose !== 'security_deposit') throw new PaymentIntentError('Only a security_deposit PaymentIntent can be released as a hold.');
  if (intent.status === 'canceled') return intent; // already released

  const adapter = getActiveGatewayAdapter();
  await adapter.cancelIntent(intent.providerIntentId);

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: 'finance',
    entityType: 'PaymentIntent', entityId: intent.id, action: 'update',
    newValue: `Requested release of the ${intent.amount} ${intent.currency} security deposit hold -- pending gateway confirmation.`
  });

  return intent; // status only changes once the payment_intent.canceled webhook lands
}

export { PaymentError, DepositError, LtoError, IdempotencyConflictError };
