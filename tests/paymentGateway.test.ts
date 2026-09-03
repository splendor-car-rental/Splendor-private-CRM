/**
 * Payment Gateway (Production-Grade Payment & Settlement Layer)
 * =================================================================
 *
 * Covers the required scenarios from the mission brief:
 *  - Idempotency: a retried "create PaymentIntent" with the same
 *    Idempotency-Key never opens a second gateway charge attempt; reusing
 *    the key for a genuinely different request is refused, not replayed.
 *  - Webhook: signature verification (a forged/missing signature is
 *    rejected), and event-id dedupe (a redelivered event is a no-op, never
 *    a double-applied effect).
 *  - Success is ONLY ever driven by a webhook -- the synchronous response
 *    from creating an intent never marks anything as paid.
 *  - Failure/retry: a failed intent leaves the underlying invoice
 *    untouched, and a fresh intent can be opened as a real retry.
 *  - Refund: a webhook-confirmed refund reverses the exact Payment/Invoice
 *    it came from -- via the same function the manual finance-entry route
 *    uses, not a parallel ledger.
 *  - Security Deposit Hold/Release: a confirmed authorization becomes a
 *    real Deposit (holdType: gateway_authorization); releasing it voids
 *    the authorization and only actually refunds the Deposit once THAT is
 *    itself webhook-confirmed.
 *
 * ISOLATION: firebase-admin is fully mocked (same in-memory Firestore
 * simulation as tests/vehicleMasterProfile.test.ts) -- no real gateway and
 * no real Firebase project is contacted. PAYMENT_GATEWAY_PROVIDER is left
 * unset so the real, non-mocked sandbox adapter (src/server/
 * paymentGatewayAdapter.ts) is exercised -- including its real HMAC
 * signature verification code path, the same one a production gateway
 * integration would use.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import request from 'supertest';
import { signHmacPayload } from '../src/server/paymentGatewayAdapter';

vi.mock('firebase-admin', () => {
  const appsArr: any[] = [];
  const verifyIdToken = vi.fn();
  const usersDb = new Map<string, { role: string; name: string }>();
  const store = new Map<string, Map<string, any>>();
  const collectionOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  const makeDocRef = (collectionName: string, id: string) => ({
    id,
    __collection: collectionName,
    get: async () => {
      if (collectionName === 'users') {
        const u = usersDb.get(id);
        return { exists: !!u, data: () => (u ? { status: 'active', ...u } : u), id };
      }
      const data = collectionOf(collectionName).get(id);
      return { exists: data !== undefined, data: () => data, id };
    },
    set: async (data: any, opts?: { merge?: boolean }) => {
      const col = collectionOf(collectionName);
      const existing = col.get(id);
      col.set(id, opts?.merge && existing ? { ...existing, ...data } : data);
    },
    create: async (data: any) => {
      const col = collectionOf(collectionName);
      if (col.has(id)) {
        const err: any = new Error('ALREADY_EXISTS');
        err.code = 6;
        throw err;
      }
      col.set(id, data);
    },
    delete: async () => {
      collectionOf(collectionName).delete(id);
    }
  });

  const makeCollectionRef = (name: string): any => ({
    doc: (id: string) => makeDocRef(name, id),
    get: async () => {
      const col = collectionOf(name);
      const docs = Array.from(col.entries()).map(([id, data]) => ({ id, data: () => data }));
      return { docs, size: docs.length };
    },
    where: (field: string, _op: string, value: any) => ({
      get: async () => {
        const col = collectionOf(name);
        const docs = Array.from(col.entries())
          .filter(([, data]) => data && data[field] === value)
          .map(([id, data]) => ({ id, data: () => data }));
        return { docs, size: docs.length };
      }
    })
  });

  const firestoreObj: any = {
    collection: (name: string) => makeCollectionRef(name),
    batch: () => {
      const ops: Array<() => void> = [];
      const applySet = (ref: any, data: any, opts?: { merge?: boolean }) => {
        const col = collectionOf(ref.__collection);
        const existing = col.get(ref.id);
        col.set(ref.id, opts?.merge && existing ? { ...existing, ...data } : data);
      };
      return {
        set: (ref: any, data: any, opts?: any) => ops.push(() => applySet(ref, data, opts)),
        create: (ref: any, data: any) => ops.push(() => collectionOf(ref.__collection).set(ref.id, data)),
        delete: (ref: any) => ops.push(() => collectionOf(ref.__collection).delete(ref.id)),
        commit: async () => { ops.forEach((op) => op()); }
      };
    },
    runTransaction: async (fn: any) => {
      const applySet = (ref: any, data: any, opts?: { merge?: boolean }) => {
        const col = collectionOf(ref.__collection);
        const existing = col.get(ref.id);
        col.set(ref.id, opts?.merge && existing ? { ...existing, ...data } : data);
      };
      const tx = {
        get: async (refOrQuery: any) => refOrQuery.get(),
        set: (ref: any, data: any, opts?: any) => applySet(ref, data, opts),
        create: (ref: any, data: any) => {
          const col = collectionOf(ref.__collection);
          if (col.has(ref.id)) {
            const err: any = new Error('ALREADY_EXISTS');
            err.code = 6;
            throw err;
          }
          col.set(ref.id, data);
        },
        delete: (ref: any) => collectionOf(ref.__collection).delete(ref.id)
      };
      return fn(tx, firestoreObj);
    }
  };

  const admin: any = {
    apps: appsArr,
    credential: { cert: (x: any) => x },
    initializeApp: (_opts: any) => { appsArr.push({}); },
    auth: () => ({ verifyIdToken }),
    firestore: () => firestoreObj,
    storage: () => ({ bucket: () => ({ file: () => ({}) }) }),
    __test: { verifyIdToken, usersDb, appsArr, store }
  };

  return { default: admin };
});

let app: any;
let globalStore: any;
let adminMock: { verifyIdToken: Mock; usersDb: Map<string, { role: string; name: string }>; store: Map<string, Map<string, any>> };

const FINANCE_UID = 'finance-uid';
const CEO_UID = 'ceo-uid';
const WEBHOOK_SECRET = 'test-webhook-secret';

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';
  process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(FINANCE_UID, { role: 'finance', name: 'Test Finance' });
  adminMock.usersDb.set(CEO_UID, { role: 'ceo', name: 'Test CEO' });

  const serverModule = await import('../server');
  app = serverModule.default;

  const dataStoreModule = await import('../src/server/dataStore');
  globalStore = dataStoreModule.globalStore;
});

afterAll(() => {
  delete process.env.VERCEL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  delete process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;
});

beforeEach(() => {
  adminMock.verifyIdToken.mockReset();
});

afterEach(() => {
  globalStore.payments.length = 0;
  globalStore.deposits.length = 0;
  globalStore.invoices.length = 0;
  globalStore.customers.length = 0;
  adminMock.store.clear();
});

function authAs(uid: string) {
  adminMock.verifyIdToken.mockResolvedValueOnce({ uid });
  return { Authorization: 'Bearer test-token' };
}

function seedDoc(collection: string, id: string, data: any) {
  if (!adminMock.store.has(collection)) adminMock.store.set(collection, new Map());
  adminMock.store.get(collection)!.set(id, data);
}

/** Posts a correctly-signed sandbox webhook event -- the same signature mechanism a real gateway's webhook would use, never a bypass. */
async function postWebhookEvent(event: { id: string; type: string; data: Record<string, string> }) {
  const rawBody = JSON.stringify(event);
  const signature = signHmacPayload(Buffer.from(rawBody, 'utf8'), WEBHOOK_SECRET);
  return request(app)
    .post('/api/payment-gateway/webhook')
    .set('Content-Type', 'application/json')
    .set('x-gateway-signature', signature)
    .send(rawBody);
}

describe('POST /api/payment-intents -- idempotent creation', () => {
  it('replays the same PaymentIntent for a retried Idempotency-Key, and refuses a reused key for a different request', async () => {
    seedDoc('customers', 'CUS-PG-1', { id: 'CUS-PG-1', fullName: 'Ahmed', outstandingBalance: 0, securityDepositsHeld: 0 });
    const key = 'intent-retry-key-1';

    const first = await request(app)
      .post('/api/payment-intents')
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', key)
      .send({ purpose: 'security_deposit', amount: 5000, customerId: 'CUS-PG-1', customerName: 'Ahmed' });
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('requires_payment'); // never "succeeded" synchronously

    const second = await request(app)
      .post('/api/payment-intents')
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', key)
      .send({ purpose: 'security_deposit', amount: 5000, customerId: 'CUS-PG-1', customerName: 'Ahmed' });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.replayed).toBe(true);

    const conflict = await request(app)
      .post('/api/payment-intents')
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', key)
      .send({ purpose: 'security_deposit', amount: 9999, customerId: 'CUS-PG-1', customerName: 'Ahmed' });
    expect(conflict.status).toBe(409);
  });

  it('never accepts a client-supplied amount for an invoice_payment intent -- always derives it from the real invoice balance', async () => {
    seedDoc('invoices', 'INV-PG-1', { id: 'INV-PG-1', customerId: 'CUS-PG-1', customerName: 'Ahmed', totalAmount: 1000, paidAmount: 0, balanceDue: 750 });
    const res = await request(app)
      .post('/api/payment-intents')
      .set(authAs(FINANCE_UID))
      .send({ purpose: 'invoice_payment', invoiceId: 'INV-PG-1', amount: 1 }); // attempted amount tampering
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(750); // the real balance, not the tampered "1"
  });
});

describe('POST /api/payment-gateway/webhook -- signature verification and dedupe', () => {
  it('rejects a delivery with a missing or invalid signature', async () => {
    const rawBody = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: {} });
    const res = await request(app)
      .post('/api/payment-gateway/webhook')
      .set('Content-Type', 'application/json')
      .set('x-gateway-signature', 'deadbeef')
      .send(rawBody);
    expect(res.status).toBe(403);
  });

  it('applies a correctly-signed event exactly once, and a redelivery of the same event id is a no-op', async () => {
    seedDoc('invoices', 'INV-PG-2', { id: 'INV-PG-2', customerId: 'CUS-PG-2', customerName: 'Sara', totalAmount: 400, paidAmount: 0, balanceDue: 400 });
    seedDoc('customers', 'CUS-PG-2', { id: 'CUS-PG-2', fullName: 'Sara', outstandingBalance: 400, securityDepositsHeld: 0 });

    const createRes = await request(app)
      .post('/api/payment-intents')
      .set(authAs(FINANCE_UID))
      .send({ purpose: 'invoice_payment', invoiceId: 'INV-PG-2' });
    const providerIntentId = createRes.body.providerIntentId;

    const event = { id: 'evt_dedupe_1', type: 'payment_intent.succeeded', data: { providerIntentId } };
    const first = await postWebhookEvent(event);
    expect(first.status).toBe(200);
    expect(first.body.processed).toBe(true);

    const second = await postWebhookEvent(event);
    expect(second.status).toBe(200);
    expect(second.body.processed).toBe(false);
    expect(second.body.reason).toBe('duplicate_event');

    // The effect happened exactly once -- not twice.
    expect(adminMock.store.get('invoices')?.get('INV-PG-2').paidAmount).toBe(400);
    const payments = Array.from(adminMock.store.get('payments')?.values() || []);
    expect(payments.length).toBe(1);
  });
});

describe('Invoice payment via gateway -- success only via webhook, never the client response', () => {
  it('leaves the invoice untouched until the webhook confirms success, then records the exact same Payment a manual entry would', async () => {
    seedDoc('invoices', 'INV-PG-3', { id: 'INV-PG-3', customerId: 'CUS-PG-3', customerName: 'Khalid', totalAmount: 1200, paidAmount: 0, balanceDue: 1200 });
    seedDoc('customers', 'CUS-PG-3', { id: 'CUS-PG-3', fullName: 'Khalid', outstandingBalance: 1200, securityDepositsHeld: 0 });

    const createRes = await request(app)
      .post('/api/payment-intents')
      .set(authAs(FINANCE_UID))
      .send({ purpose: 'invoice_payment', invoiceId: 'INV-PG-3' });
    expect(createRes.status).toBe(201);
    const { id: intentId, providerIntentId } = createRes.body;

    // Not yet paid -- the intent's creation response is not success.
    expect(adminMock.store.get('invoices')?.get('INV-PG-3').paidAmount).toBe(0);

    const webhookRes = await postWebhookEvent({ id: 'evt_success_1', type: 'payment_intent.succeeded', data: { providerIntentId } });
    expect(webhookRes.status).toBe(200);

    const invoice = adminMock.store.get('invoices')?.get('INV-PG-3');
    expect(invoice.paidAmount).toBe(1200);
    expect(invoice.status).toBe('paid');

    const intentSnap = await request(app).get(`/api/payment-intents/${intentId}`).set(authAs(FINANCE_UID));
    expect(intentSnap.body.status).toBe('succeeded');

    const payments = Array.from(adminMock.store.get('payments')?.values() || []) as any[];
    expect(payments.length).toBe(1);
    expect(payments[0].gatewayPaymentIntentId).toBe(intentId);
    expect(payments[0].method).toBe('online_link');
    // No raw card data anywhere on the record.
    expect(payments[0].cardNumber).toBeUndefined();
    expect(payments[0].cvv).toBeUndefined();
  });
});

describe('Failure / retry', () => {
  it('a failed intent never touches the invoice, and a fresh retry intent can still be created', async () => {
    seedDoc('invoices', 'INV-PG-4', { id: 'INV-PG-4', customerId: 'CUS-PG-4', customerName: 'Noura', totalAmount: 600, paidAmount: 0, balanceDue: 600 });

    const createRes = await request(app)
      .post('/api/payment-intents')
      .set(authAs(FINANCE_UID))
      .send({ purpose: 'invoice_payment', invoiceId: 'INV-PG-4' });
    const { id: intentId, providerIntentId } = createRes.body;

    await postWebhookEvent({ id: 'evt_fail_1', type: 'payment_intent.failed', data: { providerIntentId } });

    const intentSnap = await request(app).get(`/api/payment-intents/${intentId}`).set(authAs(FINANCE_UID));
    expect(intentSnap.body.status).toBe('failed');
    expect(adminMock.store.get('invoices')?.get('INV-PG-4').paidAmount).toBe(0); // untouched
    expect(Array.from(adminMock.store.get('payments')?.values() || []).length).toBe(0);

    // A real retry -- the invoice still has its full balance due, so a new intent is a normal creation.
    const retryRes = await request(app)
      .post('/api/payment-intents')
      .set(authAs(FINANCE_UID))
      .send({ purpose: 'invoice_payment', invoiceId: 'INV-PG-4' });
    expect(retryRes.status).toBe(201);
    expect(retryRes.body.id).not.toBe(intentId);
    expect(retryRes.body.amount).toBe(600);
  });
});

describe('Refund -- webhook-confirmed, reverses the exact original Payment', () => {
  it('only reverses the invoice/payment once refund.succeeded is confirmed, never on the refund request alone', async () => {
    seedDoc('invoices', 'INV-PG-5', { id: 'INV-PG-5', customerId: 'CUS-PG-5', customerName: 'Fatima', totalAmount: 900, paidAmount: 0, balanceDue: 900 });
    seedDoc('customers', 'CUS-PG-5', { id: 'CUS-PG-5', fullName: 'Fatima', outstandingBalance: 900, securityDepositsHeld: 0 });

    const createRes = await request(app).post('/api/payment-intents').set(authAs(FINANCE_UID)).send({ purpose: 'invoice_payment', invoiceId: 'INV-PG-5' });
    const { id: intentId, providerIntentId } = createRes.body;
    await postWebhookEvent({ id: 'evt_success_ref', type: 'payment_intent.succeeded', data: { providerIntentId } });
    expect(adminMock.store.get('invoices')?.get('INV-PG-5').paidAmount).toBe(900);

    const refundRes = await request(app)
      .post(`/api/payment-intents/${intentId}/refund`)
      .set(authAs(CEO_UID))
      .send({ reason: 'Customer canceled the rental after payment.' });
    expect(refundRes.status).toBe(201);
    expect(refundRes.body.status).toBe('processing');

    // Not yet reversed -- only the refund request was made, not yet confirmed.
    expect(adminMock.store.get('invoices')?.get('INV-PG-5').paidAmount).toBe(900);

    const providerRefundId = refundRes.body.providerRefundId;
    const webhookRes = await postWebhookEvent({ id: 'evt_refund_1', type: 'refund.succeeded', data: { providerRefundId } });
    expect(webhookRes.status).toBe(200);

    const invoice = adminMock.store.get('invoices')?.get('INV-PG-5');
    expect(invoice.paidAmount).toBe(0);
    expect(invoice.status).toBe('unpaid');
    const payments = Array.from(adminMock.store.get('payments')?.values() || []) as any[];
    expect(payments[0].status).toBe('refunded');
  });

  it('requires a reason and rejects refunding a not-yet-succeeded intent', async () => {
    seedDoc('invoices', 'INV-PG-6', { id: 'INV-PG-6', customerId: 'CUS-PG-6', customerName: 'Omar', totalAmount: 300, paidAmount: 0, balanceDue: 300 });
    const createRes = await request(app).post('/api/payment-intents').set(authAs(FINANCE_UID)).send({ purpose: 'invoice_payment', invoiceId: 'INV-PG-6' });

    const noReason = await request(app).post(`/api/payment-intents/${createRes.body.id}/refund`).set(authAs(CEO_UID)).send({});
    expect(noReason.status).toBe(400);

    const notSucceeded = await request(app).post(`/api/payment-intents/${createRes.body.id}/refund`).set(authAs(CEO_UID)).send({ reason: 'test' });
    expect(notSucceeded.status).toBe(400); // still 'requires_payment', never succeeded
  });
});

describe('Security Deposit Hold/Release -- gateway authorization lifecycle', () => {
  it('a confirmed authorization becomes a real, tagged Deposit; releasing it voids the hold only once webhook-confirmed', async () => {
    seedDoc('customers', 'CUS-PG-7', { id: 'CUS-PG-7', fullName: 'Yousef', outstandingBalance: 0, securityDepositsHeld: 0 });

    const createRes = await request(app)
      .post('/api/payment-intents')
      .set(authAs(FINANCE_UID))
      .send({ purpose: 'security_deposit', amount: 15000, customerId: 'CUS-PG-7', customerName: 'Yousef' });
    const { id: intentId, providerIntentId } = createRes.body;

    await postWebhookEvent({ id: 'evt_hold_1', type: 'payment_intent.succeeded', data: { providerIntentId } });

    const intentAfterHold = await request(app).get(`/api/payment-intents/${intentId}`).set(authAs(FINANCE_UID));
    expect(intentAfterHold.body.status).toBe('succeeded');
    const depositId = intentAfterHold.body.depositId;
    expect(depositId).toBeTruthy();

    const deposit = adminMock.store.get('deposits')?.get(depositId);
    expect(deposit.status).toBe('held');
    expect(deposit.holdType).toBe('gateway_authorization');
    expect(deposit.amount).toBe(15000);
    expect(adminMock.store.get('customers')?.get('CUS-PG-7').securityDepositsHeld).toBe(15000);

    // Release the hold -- the request alone must not yet change anything.
    const releaseRes = await request(app).post(`/api/payment-intents/${intentId}/release`).set(authAs(CEO_UID)).send({});
    expect(releaseRes.status).toBe(200);
    expect(adminMock.store.get('deposits')?.get(depositId).status).toBe('held'); // still held -- not yet webhook-confirmed

    await postWebhookEvent({ id: 'evt_release_1', type: 'payment_intent.canceled', data: { providerIntentId } });

    const releasedDeposit = adminMock.store.get('deposits')?.get(depositId);
    expect(releasedDeposit.status).toBe('refunded'); // fully released, no funds ever captured
    expect(adminMock.store.get('customers')?.get('CUS-PG-7').securityDepositsHeld).toBe(0);

    const finalIntent = await request(app).get(`/api/payment-intents/${intentId}`).set(authAs(FINANCE_UID));
    expect(finalIntent.body.status).toBe('canceled');
  });
});
