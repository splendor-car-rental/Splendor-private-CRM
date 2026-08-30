/**
 * Core Workflow Coverage Expansion (Phase 15)
 * =============================================
 *
 * Fills gaps identified against the directive's minimum test-coverage
 * list that weren't already exercised by the other test files in this
 * suite (tests/durablePersistence.test.ts covers ID generation,
 * concurrent ID generation, reservation availability/concurrency, and
 * contract creation/pricing/idempotency against a REAL Firestore emulator;
 * tests/authorization.test.ts covers RBAC; tests/whatsappWebhook.test.ts
 * covers the WhatsApp webhook; tests/tollFileParsers.test.ts /
 * tollImportSecurity.test.ts cover the Salik parser and malicious-file
 * rejection; tests/documentAccess.test.ts covers upload security).
 *
 * This file covers: contract handover/return/extend, payment recording
 * (+ idempotency replay), deposit apply/refund, bank reconciliation
 * (+ rejecting a double-reconcile), the public website intake endpoints
 * (leads/reservations), a Firestore-failure-behaves-as-a-controlled-
 * failure case (never a false success), public-DTO data-leakage
 * sanitization, and that the AI endpoints require authentication.
 *
 * Every case here tests a FAILURE condition alongside its happy path,
 * per the directive -- not just "does the happy path work".
 *
 * ISOLATION: firebase-admin is fully mocked (same in-memory Firestore
 * simulation as tests/authorization.test.ts) -- no real Firebase project
 * is contacted, and nothing here reads or writes real production data.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import request from 'supertest';

vi.mock('firebase-admin', () => {
  const appsArr: any[] = [];
  const verifyIdToken = vi.fn();
  const usersDb = new Map<string, { role: string; name: string }>();
  const store = new Map<string, Map<string, any>>();
  const collectionOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  // Toggle to make the NEXT write against a given collection throw, to
  // prove a durability failure surfaces as a controlled API failure
  // instead of a false success.
  const failNextWriteFor = new Set<string>();

  const maybeFail = (collectionName: string) => {
    if (failNextWriteFor.has(collectionName)) {
      failNextWriteFor.delete(collectionName);
      throw new Error('Simulated Firestore outage');
    }
  };

  const makeDocRef = (collectionName: string, id: string): any => ({
    id,
    __collection: collectionName,
    get: async () => {
      if (collectionName === 'users') {
        const u = usersDb.get(id);
        return { exists: !!u, data: () => u, id };
      }
      const data = collectionOf(collectionName).get(id);
      return { exists: data !== undefined, data: () => data, id };
    },
    set: async (data: any, opts?: { merge?: boolean }) => {
      maybeFail(collectionName);
      const col = collectionOf(collectionName);
      const existing = col.get(id);
      col.set(id, opts?.merge && existing ? { ...existing, ...data } : data);
    },
    create: async (data: any) => {
      maybeFail(collectionName);
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
    },
    // A doc's subcollection is just another top-level collection keyed by
    // "<collection>/<docId>/<subName>" -- enough for whatsappConversation.ts's
    // messages subcollection to round-trip through set/get/orderBy/limit.
    collection: (subName: string) => makeCollectionRef(`${collectionName}/${id}/${subName}`)
  });

  const makeCollectionRef = (name: string): any => ({
    doc: (id: string) => makeDocRef(name, id),
    get: async () => {
      const col = collectionOf(name);
      const docs = Array.from(col.entries()).map(([id, data]) => ({ id, data: () => data }));
      return { docs, size: docs.length };
    },
    where: () => makeCollectionRef(name),
    orderBy: () => makeCollectionRef(name),
    limit: () => makeCollectionRef(name)
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
        maybeFail(ref.__collection);
        const col = collectionOf(ref.__collection);
        const existing = col.get(ref.id);
        col.set(ref.id, opts?.merge && existing ? { ...existing, ...data } : data);
      };
      const tx = {
        get: async (refOrQuery: any) => refOrQuery.get(),
        set: (ref: any, data: any, opts?: any) => applySet(ref, data, opts),
        create: (ref: any, data: any) => {
          maybeFail(ref.__collection);
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
    initializeApp: () => { appsArr.push({}); },
    auth: () => ({ verifyIdToken }),
    firestore: () => firestoreObj,
    storage: () => ({ bucket: () => ({ file: () => ({}) }) }),
    __test: { verifyIdToken, usersDb, appsArr, store, failNextWriteFor }
  };

  return { default: admin };
});

let app: any;
let globalStore: any;
let SplendorConnectEngine: any;
let adminMock: {
  verifyIdToken: Mock;
  usersDb: Map<string, { role: string; name: string }>;
  store: Map<string, Map<string, any>>;
  failNextWriteFor: Set<string>;
};

const FINANCE_UID = 'finance-uid';
const OPS_UID = 'ops-uid';
const CEO_UID = 'ceo-uid';
const SALES_UID = 'sales-uid';

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(FINANCE_UID, { role: 'finance', name: 'Test Finance' });
  adminMock.usersDb.set(OPS_UID, { role: 'operations', name: 'Test Ops' });
  adminMock.usersDb.set(CEO_UID, { role: 'ceo', name: 'Test CEO' });
  adminMock.usersDb.set(SALES_UID, { role: 'sales', name: 'Test Sales' });

  const serverModule = await import('../server');
  app = serverModule.default;

  const dataStoreModule = await import('../src/server/dataStore');
  globalStore = dataStoreModule.globalStore;

  const engineModule = await import('../src/server/splendorConnectEngine');
  SplendorConnectEngine = engineModule.SplendorConnectEngine;
});

afterAll(() => {
  delete process.env.VERCEL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
});

beforeEach(() => {
  adminMock.verifyIdToken.mockReset();
  adminMock.failNextWriteFor.clear();
});

function authAs(uid: string) {
  adminMock.verifyIdToken.mockResolvedValueOnce({ uid });
  return { Authorization: 'Bearer test-token' };
}

function seedContract(id: string, overrides: Record<string, any> = {}) {
  const contract = {
    id, vehicleId: 'VEH-CW-1', customerId: 'CUS-CW-1', customerName: 'CW Test Customer',
    status: 'confirmed', startDateTime: '2026-01-01T10:00:00.000Z', endDateTime: '2026-01-05T10:00:00.000Z',
    dailyRate: 1000, rentalTotal: 4000, vatAmount: 200, grandTotal: 4200, ...overrides
  };
  adminMock.store.get('contracts') || adminMock.store.set('contracts', new Map());
  adminMock.store.get('contracts')!.set(id, contract);
  return contract;
}

function seedDoc(collection: string, id: string, data: any) {
  if (!adminMock.store.has(collection)) adminMock.store.set(collection, new Map());
  adminMock.store.get(collection)!.set(id, data);
}

describe('POST /api/contracts/:id/handover', () => {
  it('activates a signed contract and marks the vehicle rented', async () => {
    seedContract('CON-HANDOVER-1', { status: 'signed' });
    seedDoc('vehicles', 'VEH-CW-1', { id: 'VEH-CW-1', status: 'reserved' });
    seedDoc('customers', 'CUS-CW-1', { id: 'CUS-CW-1', totalRentals: 0 });

    const res = await request(app)
      .post('/api/contracts/CON-HANDOVER-1/handover')
      .set(authAs(OPS_UID))
      .send({ handoverData: { startMileage: 1000, fuelLevel: 'full' } });

    expect(res.status).toBe(200);
    expect(res.body.contract.status).toBe('active');
    expect(adminMock.store.get('vehicles')?.get('VEH-CW-1').status).toBe('rented');
  });

  it('rejects a second handover on the same contract (already active)', async () => {
    seedContract('CON-HANDOVER-2', { status: 'active' });
    const res = await request(app)
      .post('/api/contracts/CON-HANDOVER-2/handover')
      .set(authAs(OPS_UID))
      .send({ handoverData: {} });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/contracts/:id/return', () => {
  it('completes an active contract and frees the vehicle', async () => {
    seedContract('CON-RETURN-1', { status: 'active' });
    seedDoc('vehicles', 'VEH-CW-1', { id: 'VEH-CW-1', status: 'rented' });

    const res = await request(app)
      .post('/api/contracts/CON-RETURN-1/return')
      .set(authAs(OPS_UID))
      .send({ returnData: { endMileage: 1200, fuelLevel: 'full' } });

    expect(res.status).toBe(200);
    expect(res.body.contract.status).toBe('completed');
  });

  it('rejects returning a contract that was never handed over (still signed, not active)', async () => {
    seedContract('CON-RETURN-2', { status: 'signed' });
    const res = await request(app)
      .post('/api/contracts/CON-RETURN-2/return')
      .set(authAs(OPS_UID))
      .send({ returnData: {} });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/contracts/:id/extend', () => {
  it('extends the end date and recalculates the grand total server-side', async () => {
    seedContract('CON-EXTEND-1', { endDateTime: '2026-01-05T10:00:00.000Z', dailyRate: 1000, rentalTotal: 4000, vatAmount: 200, grandTotal: 4200 });
    const res = await request(app)
      .post('/api/contracts/CON-EXTEND-1/extend')
      .set(authAs(OPS_UID))
      .send({ newEndDateTime: '2026-01-07T10:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(res.body.extraDays).toBe(2);
    expect(res.body.contract.grandTotal).toBeCloseTo(4200 + 2 * 1000 * 1.05, 5);
  });

  it('rejects an extension to a date before the current end date', async () => {
    seedContract('CON-EXTEND-2', { endDateTime: '2026-01-05T10:00:00.000Z' });
    const res = await request(app)
      .post('/api/contracts/CON-EXTEND-2/extend')
      .set(authAs(OPS_UID))
      .send({ newEndDateTime: '2026-01-01T10:00:00.000Z' });
    expect(res.status).not.toBe(200);
  });
});

describe('POST /api/payments -- idempotent payment recording', () => {
  it('records a payment and replays the same result for a retried Idempotency-Key', async () => {
    const key = 'payment-retry-key-1';
    const first = await request(app)
      .post('/api/payments')
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', key)
      .send({ customerId: 'CUS-CW-1', amount: 500, method: 'card' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/payments')
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', key)
      .send({ customerId: 'CUS-CW-1', amount: 500, method: 'card' });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id); // same payment, not a duplicate
  });

  it('rejects a non-positive payment amount', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set(authAs(FINANCE_UID))
      .send({ customerId: 'CUS-CW-1', amount: 0 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/deposits/:id/apply and /refund', () => {
  it('applies part of a held deposit against an existing, approved charge -- and marks that charge consumed', async () => {
    seedDoc('deposits', 'DEP-APPLY-1', { id: 'DEP-APPLY-1', customerId: 'CUS-DEP-1', amount: 1000, appliedAmount: 0, refundedAmount: 0, balance: 1000, status: 'held' });
    seedDoc('charges', 'CHG-DEP-1', { id: 'CHG-DEP-1', customerId: 'CUS-DEP-1', type: 'fuel', totalAmount: 300, description: 'Fuel shortfall', approvalStatus: 'approved' });
    const res = await request(app)
      .post('/api/deposits/DEP-APPLY-1/apply')
      .set(authAs(FINANCE_UID))
      .send({ applyAmount: 300, chargeId: 'CHG-DEP-1' });
    expect(res.status).toBe(200);
    expect(res.body.deposit.appliedAmount).toBe(300);
    expect(res.body.deposit.balance).toBe(700);
    expect(adminMock.store.get('charges')?.get('CHG-DEP-1').deductedFromDepositId).toBe('DEP-APPLY-1');
  });

  it('refunds a held deposit', async () => {
    seedDoc('deposits', 'DEP-REFUND-1', { id: 'DEP-REFUND-1', amount: 1000, appliedAmount: 0, refundedAmount: 0, balance: 1000, status: 'held' });
    const res = await request(app)
      .post('/api/deposits/DEP-REFUND-1/refund')
      .set(authAs(FINANCE_UID))
      .send({ refundAmount: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.deposit.refundedAmount).toBe(1000);
  });

  it('rejects applying more than the remaining deposit balance', async () => {
    seedDoc('deposits', 'DEP-OVERAPPLY-1', { id: 'DEP-OVERAPPLY-1', customerId: 'CUS-DEP-1', amount: 500, appliedAmount: 0, refundedAmount: 0, balance: 500, status: 'held' });
    seedDoc('charges', 'CHG-DEP-2', { id: 'CHG-DEP-2', customerId: 'CUS-DEP-1', type: 'damage', totalAmount: 5000, description: 'Too much', approvalStatus: 'approved' });
    const res = await request(app)
      .post('/api/deposits/DEP-OVERAPPLY-1/apply')
      .set(authAs(FINANCE_UID))
      .send({ applyAmount: 5000, chargeId: 'CHG-DEP-2' });
    expect(res.status).not.toBe(200);
  });

  it('rejects a deposit deduction with no chargeId -- never a direct deduction without a backing charge/claim', async () => {
    seedDoc('deposits', 'DEP-NOCHG-1', { id: 'DEP-NOCHG-1', customerId: 'CUS-DEP-1', amount: 500, appliedAmount: 0, refundedAmount: 0, balance: 500, status: 'held' });
    const res = await request(app)
      .post('/api/deposits/DEP-NOCHG-1/apply')
      .set(authAs(FINANCE_UID))
      .send({ applyAmount: 100, reason: 'No charge attached' });
    expect(res.status).toBe(400);
  });

  it('rejects deducting against a charge that is not yet approved', async () => {
    seedDoc('deposits', 'DEP-PENDCHG-1', { id: 'DEP-PENDCHG-1', customerId: 'CUS-DEP-1', amount: 500, appliedAmount: 0, refundedAmount: 0, balance: 500, status: 'held' });
    seedDoc('charges', 'CHG-DEP-3', { id: 'CHG-DEP-3', customerId: 'CUS-DEP-1', type: 'damage', totalAmount: 200, description: 'Pending review', approvalStatus: 'pending_approval' });
    const res = await request(app)
      .post('/api/deposits/DEP-PENDCHG-1/apply')
      .set(authAs(FINANCE_UID))
      .send({ applyAmount: 100, chargeId: 'CHG-DEP-3' });
    expect(res.status).toBe(400);
  });

  it('rejects deducting against a charge that was already deducted from a deposit', async () => {
    seedDoc('deposits', 'DEP-REUSED-1', { id: 'DEP-REUSED-1', customerId: 'CUS-DEP-1', amount: 500, appliedAmount: 0, refundedAmount: 0, balance: 500, status: 'held' });
    seedDoc('charges', 'CHG-DEP-4', { id: 'CHG-DEP-4', customerId: 'CUS-DEP-1', type: 'damage', totalAmount: 200, description: 'Already used', approvalStatus: 'approved', deductedFromDepositId: 'DEP-SOME-OTHER' });
    const res = await request(app)
      .post('/api/deposits/DEP-REUSED-1/apply')
      .set(authAs(FINANCE_UID))
      .send({ applyAmount: 100, chargeId: 'CHG-DEP-4' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bank-transactions/:id/reconcile', () => {
  it('reconciles a pending transaction against an invoice with a real classification', async () => {
    seedDoc('bank_transactions', 'BTX-REC-1', { id: 'BTX-REC-1', reference: 'REF1', credit: 500, reconciled: false, status: 'pending' });
    seedDoc('invoices', 'INV-REC-1', { id: 'INV-REC-1', totalAmount: 1000, paidAmount: 0, balanceDue: 1000, status: 'unpaid' });

    const res = await request(app)
      .post('/api/bank-transactions/BTX-REC-1/reconcile')
      .set(authAs(FINANCE_UID))
      .send({ targetRecordType: 'invoice', targetRecordId: 'INV-REC-1', classification: 'settlement' });

    expect(res.status).toBe(200);
    const txn = adminMock.store.get('bank_transactions')?.get('BTX-REC-1');
    expect(txn.reconciled).toBe(true);
    expect(txn.receivedAmountClassification).toBe('settlement');
    expect(txn.classificationHistory).toHaveLength(1);
    expect(adminMock.store.get('invoices')?.get('INV-REC-1').paidAmount).toBe(500);
  });

  // FIN-002: classification is required and never guessed -- omitting it
  // must fail loudly (400), not silently default to something.
  it('rejects reconciliation with no classification', async () => {
    seedDoc('bank_transactions', 'BTX-REC-3', { id: 'BTX-REC-3', reference: 'REF3', credit: 200, reconciled: false, status: 'pending' });
    const res = await request(app)
      .post('/api/bank-transactions/BTX-REC-3/reconcile')
      .set(authAs(FINANCE_UID))
      .send({ targetRecordType: 'invoice', targetRecordId: 'INV-REC-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/classification is required/i);
  });

  it('rejects reconciliation with an invalid classification value', async () => {
    seedDoc('bank_transactions', 'BTX-REC-4', { id: 'BTX-REC-4', reference: 'REF4', credit: 200, reconciled: false, status: 'pending' });
    const res = await request(app)
      .post('/api/bank-transactions/BTX-REC-4/reconcile')
      .set(authAs(FINANCE_UID))
      .send({ targetRecordType: 'invoice', targetRecordId: 'INV-REC-1', classification: 'made_up_value' });
    expect(res.status).toBe(400);
  });

  it('rejects reconciling the same transaction twice', async () => {
    seedDoc('bank_transactions', 'BTX-REC-2', { id: 'BTX-REC-2', reference: 'REF2', credit: 100, reconciled: true, status: 'approved' });
    const res = await request(app)
      .post('/api/bank-transactions/BTX-REC-2/reconcile')
      .set(authAs(FINANCE_UID))
      .send({ targetRecordType: 'invoice', targetRecordId: 'INV-REC-1', classification: 'settlement' });
    expect(res.status).toBe(409);
  });

  it('does not touch the invoices collection when targetRecordType is not invoice', async () => {
    seedDoc('bank_transactions', 'BTX-REC-5', { id: 'BTX-REC-5', reference: 'REF5', credit: 300, reconciled: false, status: 'pending' });
    seedDoc('invoices', 'INV-REC-1', { id: 'INV-REC-1', totalAmount: 1000, paidAmount: 0, balanceDue: 1000, status: 'unpaid' });
    const res = await request(app)
      .post('/api/bank-transactions/BTX-REC-5/reconcile')
      .set(authAs(FINANCE_UID))
      .send({ targetRecordType: 'deposit', targetRecordId: 'INV-REC-1', classification: 'security_deposit' });
    expect(res.status).toBe(200);
    // Same id happens to collide with the invoice seeded above -- the fix
    // means that invoice's paidAmount must stay untouched.
    expect(adminMock.store.get('invoices')?.get('INV-REC-1').paidAmount).toBe(0);
  });
});

describe('POST /api/bank-transactions/:id/reclassify', () => {
  it('changes only the classification, never the settled amount', async () => {
    seedDoc('bank_transactions', 'BTX-RCL-1', {
      id: 'BTX-RCL-1', reference: 'REFRCL1', credit: 700, reconciled: true, status: 'approved',
      receivedAmountClassification: 'settlement', classificationHistory: [{ classification: 'settlement', setBy: 'x', setByName: 'x', setAt: 'now' }]
    });
    const res = await request(app)
      .post('/api/bank-transactions/BTX-RCL-1/reclassify')
      .set(authAs(FINANCE_UID))
      .send({ classification: 'advance_payment', reason: 'Turned out there was no invoice yet.' });
    expect(res.status).toBe(200);
    const txn = adminMock.store.get('bank_transactions')?.get('BTX-RCL-1');
    expect(txn.receivedAmountClassification).toBe('advance_payment');
    expect(txn.classificationHistory).toHaveLength(2);
    expect(txn.credit).toBe(700); // unchanged
  });

  it('rejects reclassification without a reason', async () => {
    seedDoc('bank_transactions', 'BTX-RCL-2', { id: 'BTX-RCL-2', reference: 'REFRCL2', credit: 100, reconciled: true, status: 'approved', receivedAmountClassification: 'settlement' });
    const res = await request(app)
      .post('/api/bank-transactions/BTX-RCL-2/reclassify')
      .set(authAs(FINANCE_UID))
      .send({ classification: 'credit_balance' });
    expect(res.status).toBe(400);
  });

  it('rejects reclassifying a transaction that was never reconciled', async () => {
    seedDoc('bank_transactions', 'BTX-RCL-3', { id: 'BTX-RCL-3', reference: 'REFRCL3', credit: 100, reconciled: false, status: 'pending' });
    const res = await request(app)
      .post('/api/bank-transactions/BTX-RCL-3/reclassify')
      .set(authAs(FINANCE_UID))
      .send({ classification: 'credit_balance', reason: 'test' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/public/leads and /api/public/reservations -- durable public intake', () => {
  it('accepts a public lead with no Authorization header and persists it durably', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({ fullName: 'Public Website Visitor', email: 'visitor@example.com', phone: '971500000001' });
    expect(res.status).toBe(201);
    expect(res.body.leadId).toBeTruthy();
    expect(adminMock.store.get('leads')?.has(res.body.leadId)).toBe(true);
  });

  it('rejects a public lead missing both email and phone', async () => {
    const res = await request(app).post('/api/public/leads').send({ fullName: 'No Contact Info' });
    expect(res.status).toBe(400);
  });

  it('rejects a public reservation for an unknown vehicle identifier without falling back to any real vehicle', async () => {
    const res = await request(app)
      .post('/api/public/reservations')
      .send({
        publicVehicleId: 'GHOST-VEHICLE-DOES-NOT-EXIST',
        fullName: 'Public Guest', email: 'guest@example.com', phone: '971500000002',
        pickupDateTime: '2026-05-01T10:00:00.000Z', returnDateTime: '2026-05-03T10:00:00.000Z'
      });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

describe('Firestore failure behaves as a controlled API failure, never a false success', () => {
  it('POST /api/charges returns 502 (not 201) when the durable write fails, and does not add to in-memory state', async () => {
    const before = globalStore.charges.length;
    adminMock.failNextWriteFor.add('charges');

    const res = await request(app)
      .post('/api/charges')
      .set(authAs(FINANCE_UID))
      .send({ type: 'salik', amount: 10, customerId: 'CUS-CW-1' });

    expect(res.status).toBe(502);
    expect(globalStore.charges.length).toBe(before); // never inserted on failure
  });
});

describe('AI endpoints require authentication', () => {
  it('POST /api/ai/query rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/ai/query').send({ prompt: 'How is the fleet performing?' });
    expect(res.status).toBe(401);
  });
});

describe('Public vehicle DTO sanitization (data leakage prevention)', () => {
  it('never exposes VIN, cost, or profitability data in the public-facing shape', () => {
    const vehicle: any = {
      id: 'VEH-DTO-1', vin: 'SECRET-VIN-12345', make: 'Ferrari', model: '296 GTB', year: 2026,
      trim: 'Base', category: 'supercar', exteriorColor: 'Rosso', interiorColor: 'Nero',
      horsepower: 819, transmission: 'auto', fuelType: 'hybrid', dailyRate: 5000, weeklyRate: 30000,
      monthlyRate: 100000, minDeposit: 20000, status: 'available', lifecycleStatus: 'ACTIVE',
      totalRevenue: 999999, totalExpenses: 123456, profitabilityScore: 87,
      website: { enabled: true, visibility: 'PUBLIC' }
    };
    const dto = SplendorConnectEngine.toPublicVehicleDTO(vehicle);
    expect(dto).not.toBeNull();
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain('SECRET-VIN-12345');
    expect((dto as any).vin).toBeUndefined();
    expect((dto as any).totalRevenue).toBeUndefined();
    expect((dto as any).totalExpenses).toBeUndefined();
    expect((dto as any).profitabilityScore).toBeUndefined();
  });

  it('returns null for a vehicle not published to the public website (never leaks internal-only inventory)', () => {
    const vehicle: any = {
      id: 'VEH-DTO-2', vin: 'SECRET-VIN-2', make: 'Bentley', model: 'Flying Spur', lifecycleStatus: 'ACTIVE',
      website: { enabled: false, visibility: 'INTERNAL_ONLY' }
    };
    expect(SplendorConnectEngine.toPublicVehicleDTO(vehicle)).toBeNull();
  });
});

describe('Security Blocklist / Watchlist (RULE-B01-B05, Splendor Master Rule Set)', () => {
  it('rejects a passport-based block that is missing the issuing country -- passport number alone is not a unique enough match', async () => {
    const res = await request(app)
      .post('/api/blocklist')
      .set(authAs(OPS_UID))
      .send({ identifierType: 'passport', identifierValue: 'P1234567', tier: 'full', reason: 'Reckless driving on a prior rental' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/issuing country/i);
  });

  it('creates a full block and rejects a new-customer registration matching the exact identifier pair', async () => {
    const create = await request(app)
      .post('/api/blocklist')
      .set(authAs(OPS_UID))
      .send({ identifierType: 'passport', identifierValue: 'p9988776', identifierCountry: 'united kingdom', tier: 'full', reason: 'Fraud attempt on a prior booking' });
    expect(create.status).toBe(201);
    expect(create.body.identifierValue).toBe('P9988776'); // normalized uppercase

    const blocked = await request(app)
      .post('/api/customers')
      .set(authAs(SALES_UID))
      .send({ fullName: 'Blocked Person', email: 'blocked@example.com', phone: '+971500000001', idType: 'passport', idNumber: 'P9988776', nationality: 'United Kingdom' });
    expect(blocked.status).toBe(403);
  });

  it('never matches by name alone -- a different passport number with the same name is NOT blocked', async () => {
    await request(app)
      .post('/api/blocklist')
      .set(authAs(OPS_UID))
      .send({ identifierType: 'passport', identifierValue: 'P1111111', identifierCountry: 'France', customerName: 'Jean Dupont', tier: 'full', reason: 'Damage dispute' });

    const differentPassport = await request(app)
      .post('/api/customers')
      .set(authAs(SALES_UID))
      .send({ fullName: 'Jean Dupont', email: 'jean2@example.com', phone: '+971500000002', idType: 'passport', idNumber: 'P2222222', nationality: 'France' });
    expect(differentPassport.status).toBe(201); // same name, different passport -- not a match
  });

  it('never matches a passport number alone without the correct issuing country', async () => {
    await request(app)
      .post('/api/blocklist')
      .set(authAs(OPS_UID))
      .send({ identifierType: 'passport', identifierValue: 'P3333333', identifierCountry: 'Germany', tier: 'full', reason: 'Unpaid fines' });

    const sameNumberDifferentCountry = await request(app)
      .post('/api/customers')
      .set(authAs(SALES_UID))
      .send({ fullName: 'Someone Else', email: 'someone@example.com', phone: '+971500000003', idType: 'passport', idNumber: 'P3333333', nationality: 'Spain' });
    expect(sameNumberDifferentCountry.status).toBe(201); // same passport number, different country -- correctly NOT a match
  });

  it('a conditional block allows the customer through with a warning, not a rejection', async () => {
    await request(app)
      .post('/api/blocklist')
      .set(authAs(OPS_UID))
      .send({ identifierType: 'emirates_id', identifierValue: '784-1111-1111111-1', tier: 'conditional', conditionalNote: 'Requires a 5,000 AED raised deposit and operations-manager sign-off.', reason: 'Minor prior damage dispute, resolved' });

    const res = await request(app)
      .post('/api/customers')
      .set(authAs(SALES_UID))
      .send({ fullName: 'Conditional Customer', email: 'conditional@example.com', phone: '+971500000004', idType: 'emirates_id', idNumber: '784-1111-1111111-1' });
    expect(res.status).toBe(201);
    expect(res.body.blocklistWarning).toMatch(/raised deposit/i);
  });

  it('RULE-B04: unblocking requires a DIFFERENT, authorized approver -- the requester cannot decide their own request', async () => {
    const create = await request(app)
      .post('/api/blocklist')
      .set(authAs(OPS_UID))
      .send({ identifierType: 'emirates_id', identifierValue: '784-2222-2222222-2', tier: 'full', reason: 'Reckless driving' });

    const unblockReq = await request(app)
      .post(`/api/blocklist/${create.body.id}/unblock-requests`)
      .set(authAs(OPS_UID))
      .send({ reason: 'Customer provided evidence disputing the original claim.' });
    expect(unblockReq.status).toBe(201);

    // Same requester attempting to decide their own request is rejected.
    const selfDecide = await request(app)
      .post(`/api/procurement/approvals/${unblockReq.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self-approving' });
    expect(selfDecide.status).toBe(403); // operations isn't a decider role either, blocked before the SoD check even runs

    // A different, authorized decider (CEO) approves it.
    const decide = await request(app)
      .post(`/api/procurement/approvals/${unblockReq.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Evidence reviewed and accepted.' });
    expect(decide.status).toBe(200);

    // The customer can now be registered -- the block was actually removed.
    const afterUnblock = await request(app)
      .post('/api/customers')
      .set(authAs(SALES_UID))
      .send({ fullName: 'Unblocked Customer', email: 'unblocked@example.com', phone: '+971500000005', idType: 'emirates_id', idNumber: '784-2222-2222222-2' });
    expect(afterUnblock.status).toBe(201);
  });

  it('a role without blocklist-management permission cannot create a block', async () => {
    const res = await request(app)
      .post('/api/blocklist')
      .set(authAs(SALES_UID))
      .send({ identifierType: 'emirates_id', identifierValue: '784-9999-9999999-9', tier: 'full', reason: 'Attempted' });
    expect(res.status).toBe(403);
  });
});

describe('Quotation discount ceiling (RULE-P01, Splendor Master Rule Set)', () => {
  it('applies a discount at or below the 5% ceiling immediately, with no approval needed', async () => {
    const res = await request(app)
      .post('/api/quotations')
      .set(authAs(SALES_UID))
      .send({
        customerName: 'Within Ceiling Client', vehicleName: 'GT3 RS', dailyRate: 2000, durationDays: 5,
        discountAmount: 500, // 500 / 10000 = 5% exactly -- at the ceiling, not above it
        ownerId: SALES_UID, ownerName: 'Test Sales'
      });
    expect(res.status).toBe(201);
    expect(res.body.discountAmount).toBe(500);
    expect(res.body.discountOverridePending).toBeFalsy();
    expect(res.body.discountApprovalId).toBeUndefined();
  });

  it('caps a non-manager discount above the ceiling and opens a pending manager-approval request', async () => {
    const res = await request(app)
      .post('/api/quotations')
      .set(authAs(SALES_UID))
      .send({
        customerName: 'Above Ceiling Client', vehicleName: 'Cullinan', dailyRate: 3000, durationDays: 4,
        discountAmount: 2400, // 2400 / 12000 = 20% -- well above the 5% ceiling
        ownerId: SALES_UID, ownerName: 'Test Sales'
      });
    expect(res.status).toBe(201);
    expect(res.body.discountOverridePending).toBe(true);
    expect(res.body.discountAmount).toBe(600); // capped at 5% of 12000
    expect(res.body.requestedDiscountAmount).toBe(2400);
    expect(res.body.grandTotal).toBeLessThan(12000); // the capped (safe) total, not the fully-discounted one
    expect(res.body.discountApprovalId).toBeTruthy();

    const approvals = await request(app).get('/api/procurement/approvals').set(authAs(CEO_UID));
    const pending = approvals.body.find((a: any) => a.id === res.body.discountApprovalId);
    expect(pending.entityType).toBe('Quotation');
    expect(pending.action).toBe('discount_override');
    expect(pending.status).toBe('pending');

    // A different authorized decider (CEO) approves the full requested discount.
    const decide = await request(app)
      .post(`/api/procurement/approvals/${res.body.discountApprovalId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'VIP client, approved by sales manager.' });
    expect(decide.status).toBe(200);

    const quotations = await request(app).get('/api/quotations').set(authAs(CEO_UID));
    const updated = quotations.body.find((q: any) => q.id === res.body.id);
    expect(updated.discountAmount).toBe(2400);
    expect(updated.discountOverridePending).toBe(false);
    expect(updated.grandTotal).toBeLessThan(res.body.grandTotal); // the full discount is now reflected
  });

  it('a non-manager cannot approve their own quotation discount-override request', async () => {
    const create = await request(app)
      .post('/api/quotations')
      .set(authAs(SALES_UID))
      .send({ customerName: 'Self Approve Attempt', vehicleName: 'Urus', dailyRate: 1000, durationDays: 10, discountAmount: 3000, ownerId: SALES_UID, ownerName: 'Test Sales' });
    expect(create.body.discountOverridePending).toBe(true);

    const selfDecide = await request(app)
      .post(`/api/procurement/approvals/${create.body.discountApprovalId}/decide`)
      .set(authAs(SALES_UID))
      .send({ decision: 'approved', note: 'self-approving' });
    expect(selfDecide.status).toBe(403); // sales isn't a decider role at all, blocked before the SoD check even runs
  });

  it('ceo/admin can apply any discount immediately -- they are the manager approval, not subject to the ceiling', async () => {
    const res = await request(app)
      .post('/api/quotations')
      .set(authAs(CEO_UID))
      .send({ customerName: 'Manager Override Client', vehicleName: 'Phantom', dailyRate: 5000, durationDays: 2, discountAmount: 3000, ownerId: CEO_UID, ownerName: 'Test CEO' });
    expect(res.status).toBe(201);
    expect(res.body.discountAmount).toBe(3000); // full amount, 30% of 10000, applied without a ceiling check
    expect(res.body.discountOverridePending).toBeFalsy();
  });
});

describe('Vehicle Inspection & Photo Evidence (Splendor Master Rule Set, Module 08)', () => {
  function seedVehicleForInspection(id: string, overrides: Record<string, any> = {}) {
    const vehicle = { id, make: 'Test', model: 'Car', plateNumber: `P-${id}`, status: 'available', ...overrides };
    globalStore.vehicles.push(vehicle);
    return vehicle;
  }

  function seedContractForInspection(id: string, vehicleId: string, overrides: Record<string, any> = {}) {
    const contract = { id, vehicleId, contractNumber: id, status: 'active', ...overrides };
    globalStore.contracts.push(contract);
    return contract;
  }

  it('rejects starting an inspection from a role without operational access', async () => {
    seedVehicleForInspection('VEH-INSP-1');
    const res = await request(app)
      .post('/api/inspections')
      .set(authAs(SALES_UID))
      .send({ vehicleId: 'VEH-INSP-1', type: 'pre_delivery' });
    expect(res.status).toBe(403);
  });

  it('requires vehicleId and rejects an unknown vehicle', async () => {
    const missingField = await request(app).post('/api/inspections').set(authAs(OPS_UID)).send({ type: 'pre_delivery' });
    expect(missingField.status).toBe(400);

    const unknownVehicle = await request(app).post('/api/inspections').set(authAs(OPS_UID)).send({ vehicleId: 'VEH-DOES-NOT-EXIST', type: 'pre_delivery' });
    expect(unknownVehicle.status).toBe(404);
  });

  it('rejects a contract that is not actually associated with the given vehicle', async () => {
    seedVehicleForInspection('VEH-INSP-2');
    seedVehicleForInspection('VEH-INSP-3');
    seedContractForInspection('CON-INSP-1', 'VEH-INSP-3');

    const res = await request(app)
      .post('/api/inspections')
      .set(authAs(OPS_UID))
      .send({ vehicleId: 'VEH-INSP-2', contractId: 'CON-INSP-1', type: 'handover' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not associated/i);
  });

  it('requires a contract for a handover inspection', async () => {
    seedVehicleForInspection('VEH-INSP-4');
    const res = await request(app)
      .post('/api/inspections')
      .set(authAs(OPS_UID))
      .send({ vehicleId: 'VEH-INSP-4', type: 'handover' });
    expect(res.status).toBe(400);
  });

  it('starts a draft pre_delivery inspection as operations', async () => {
    seedVehicleForInspection('VEH-INSP-5');
    const res = await request(app)
      .post('/api/inspections')
      .set(authAs(OPS_UID))
      .send({ vehicleId: 'VEH-INSP-5', type: 'pre_delivery' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.requiredPhotoCategories).toContain('front');

    const fetched = await request(app).get(`/api/inspections/${res.body.id}`).set(authAs(OPS_UID));
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(res.body.id);

    const notFound = await request(app).get('/api/inspections/INS-NOPE').set(authAs(OPS_UID));
    expect(notFound.status).toBe(404);
  });

  it('two concurrent identical start requests with the same Idempotency-Key create exactly one inspection', async () => {
    seedVehicleForInspection('VEH-INSP-6');
    const body = { vehicleId: 'VEH-INSP-6', type: 'pre_delivery' };
    const [a, b] = await Promise.all([
      request(app).post('/api/inspections').set(authAs(OPS_UID)).set('Idempotency-Key', 'insp-concurrent-1').send(body),
      request(app).post('/api/inspections').set(authAs(OPS_UID)).set('Idempotency-Key', 'insp-concurrent-1').send(body)
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
  });

  it('damage review requires a note and a decider role, and completion is blocked until every damage record is reviewed', async () => {
    seedVehicleForInspection('VEH-INSP-7');
    const start = await request(app).post('/api/inspections').set(authAs(OPS_UID)).send({ vehicleId: 'VEH-INSP-7', type: 'in_rental' });
    const id = start.body.id;

    const damage = await request(app)
      .post(`/api/inspections/${id}/damage`)
      .set(authAs(OPS_UID))
      .send({ part: 'hood', severity: 'dent', classification: 'new', description: 'Found during rental.' });
    expect(damage.status).toBe(201);
    const damageId = damage.body.damages[0].id;

    const noteless = await request(app)
      .put(`/api/inspections/${id}/damage/${damageId}/review`)
      .set(authAs(CEO_UID))
      .send({ liabilityStatus: 'customer_liable', reviewNotes: '' });
    expect(noteless.status).toBe(400);

    const wrongRole = await request(app)
      .put(`/api/inspections/${id}/damage/${damageId}/review`)
      .set(authAs(SALES_UID))
      .send({ liabilityStatus: 'customer_liable', reviewNotes: 'Confirmed.' });
    expect(wrongRole.status).toBe(403);

    const beforeReview = await request(app).post(`/api/inspections/${id}/photos`).set(authAs(OPS_UID)).send({ category: 'damage', documentPath: 'vehicle-inspections/x/1.jpg', fileUrl: '/api/documents/file?path=x' });
    expect(beforeReview.status).toBe(201);
    const stillPending = await request(app).post(`/api/inspections/${id}/complete`).set(authAs(OPS_UID)).send({});
    expect(stillPending.status).toBe(409);

    const reviewed = await request(app)
      .put(`/api/inspections/${id}/damage/${damageId}/review`)
      .set(authAs(CEO_UID))
      .send({ liabilityStatus: 'customer_liable', reviewNotes: 'Confirmed against handover photos.' });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.damages[0].liabilityStatus).toBe('customer_liable');

    const completed = await request(app).post(`/api/inspections/${id}/complete`).set(authAs(OPS_UID)).send({});
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('completed');
  });

  it('a completed inspection is immutable -- no further mutation is accepted from anyone', async () => {
    seedVehicleForInspection('VEH-INSP-8');
    const start = await request(app).post('/api/inspections').set(authAs(OPS_UID)).send({ vehicleId: 'VEH-INSP-8', type: 'in_rental' });
    const id = start.body.id;
    await request(app).post(`/api/inspections/${id}/photos`).set(authAs(OPS_UID)).send({ category: 'damage', documentPath: 'x', fileUrl: 'y' });
    const completed = await request(app).post(`/api/inspections/${id}/complete`).set(authAs(OPS_UID)).send({});
    expect(completed.body.status).toBe('completed');

    const lateEdit = await request(app).patch(`/api/inspections/${id}`).set(authAs(CEO_UID)).send({ notes: 'trying to sneak in a change' });
    expect(lateEdit.status).toBe(409);

    const lateDamage = await request(app)
      .post(`/api/inspections/${id}/damage`)
      .set(authAs(CEO_UID))
      .send({ part: 'hood', severity: 'dent', classification: 'new', description: 'too late' });
    expect(lateDamage.status).toBe(409);
  });

  it('only ceo/admin may void an inspection', async () => {
    seedVehicleForInspection('VEH-INSP-9');
    const start = await request(app).post('/api/inspections').set(authAs(OPS_UID)).send({ vehicleId: 'VEH-INSP-9', type: 'pre_delivery' });
    const id = start.body.id;

    const deniedVoid = await request(app).post(`/api/inspections/${id}/void`).set(authAs(OPS_UID)).send({ reason: 'test' });
    expect(deniedVoid.status).toBe(403);

    const allowedVoid = await request(app).post(`/api/inspections/${id}/void`).set(authAs(CEO_UID)).send({ reason: 'Started on the wrong vehicle.' });
    expect(allowedVoid.status).toBe(200);
    expect(allowedVoid.body.status).toBe('voided');
  });
});

describe('WhatsApp Unified Inbox (Splendor Master Rule Set, Module 13)', () => {
  // Route-level authorization + basic behavior only -- the real state
  // machine, customer matching, and reservation-creation flow are covered
  // against the REAL Firestore emulator in tests/whatsappConversation.test.ts
  // (listConversations()'s .where() queries only work correctly there; this
  // mock's .where() is a no-op passthrough, same limitation documented for
  // listInspections() above).
  function seedConversation(phone: string, overrides: Record<string, any> = {}) {
    const col = adminMock.store.get('whatsapp_conversations') || new Map();
    adminMock.store.set('whatsapp_conversations', col);
    col.set(phone, {
      id: phone, phone, customerMatchStatus: 'unmatched', state: 'BROWSING', botActive: true,
      priority: 'normal', tags: [], draft: {}, unread: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      ...overrides
    });
  }

  it('rejects a non-operational role from reading the inbox', async () => {
    const res = await request(app).get('/api/whatsapp/conversations').set(authAs(FINANCE_UID));
    expect(res.status).toBe(403);
  });

  it('lists conversations for an authorized role', async () => {
    seedConversation('971500000100');
    const res = await request(app).get('/api/whatsapp/conversations').set(authAs(OPS_UID));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('404s for an unknown conversation', async () => {
    const res = await request(app).get('/api/whatsapp/conversations/971500000999').set(authAs(OPS_UID));
    expect(res.status).toBe(404);
  });

  it('fetches a single conversation with its message thread', async () => {
    seedConversation('971500000101');
    const res = await request(app).get('/api/whatsapp/conversations/971500000101').set(authAs(OPS_UID));
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('971500000101');
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it('rejects assign/handoff/reply from a role without operational access', async () => {
    seedConversation('971500000102');
    const assign = await request(app).post('/api/whatsapp/conversations/971500000102/assign').set(authAs(FINANCE_UID)).send({ priority: 'vip' });
    expect(assign.status).toBe(403);
    const handoff = await request(app).post('/api/whatsapp/conversations/971500000102/handoff').set(authAs(FINANCE_UID)).send({ botActive: false });
    expect(handoff.status).toBe(403);
    const reply = await request(app).post('/api/whatsapp/conversations/971500000102/reply').set(authAs(FINANCE_UID)).send({ text: 'hi' });
    expect(reply.status).toBe(403);
  });

  it('assigns priority/employee as operations, and audits the change', async () => {
    seedConversation('971500000103');
    const res = await request(app)
      .post('/api/whatsapp/conversations/971500000103/assign')
      .set(authAs(OPS_UID))
      .send({ priority: 'vip', employeeId: 'USR-002', employeeName: 'Fleet Manager' });
    expect(res.status).toBe(200);
    expect(res.body.priority).toBe('vip');
    expect(res.body.assignedEmployeeId).toBe('USR-002');
  });

  it('refuses a manual reply while the bot is still active, and accepts one once a human has taken over', async () => {
    seedConversation('971500000104', { botActive: true });
    const tooEarly = await request(app).post('/api/whatsapp/conversations/971500000104/reply').set(authAs(OPS_UID)).send({ text: 'hello' });
    expect(tooEarly.status).toBe(409);

    const handoff = await request(app).post('/api/whatsapp/conversations/971500000104/handoff').set(authAs(OPS_UID)).send({ botActive: false });
    expect(handoff.status).toBe(200);
    expect(handoff.body.botActive).toBe(false);
    expect(handoff.body.state).toBe('HUMAN_ASSISTANCE');

    const reply = await request(app).post('/api/whatsapp/conversations/971500000104/reply').set(authAs(OPS_UID)).send({ text: 'A team member will call you shortly.' });
    expect(reply.status).toBe(201);
  });

  it('requires reply text', async () => {
    seedConversation('971500000105', { botActive: false });
    const res = await request(app).post('/api/whatsapp/conversations/971500000105/reply').set(authAs(OPS_UID)).send({ text: '' });
    expect(res.status).toBe(400);
  });

  it('returning to automation resets state to BROWSING', async () => {
    seedConversation('971500000106', { botActive: false, state: 'HUMAN_ASSISTANCE' });
    const res = await request(app).post('/api/whatsapp/conversations/971500000106/handoff').set(authAs(OPS_UID)).send({ botActive: true });
    expect(res.status).toBe(200);
    expect(res.body.botActive).toBe(true);
    expect(res.body.state).toBe('BROWSING');
  });
});
