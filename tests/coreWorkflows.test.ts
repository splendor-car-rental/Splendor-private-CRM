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

  const makeDocRef = (collectionName: string, id: string) => ({
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
    }
  });

  const makeCollectionRef = (name: string): any => ({
    doc: (id: string) => makeDocRef(name, id),
    get: async () => {
      const col = collectionOf(name);
      const docs = Array.from(col.entries()).map(([id, data]) => ({ id, data: () => data }));
      return { docs, size: docs.length };
    },
    where: () => makeCollectionRef(name)
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

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(FINANCE_UID, { role: 'finance', name: 'Test Finance' });
  adminMock.usersDb.set(OPS_UID, { role: 'operations', name: 'Test Ops' });

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
  it('applies part of a held deposit against outstanding charges', async () => {
    seedDoc('deposits', 'DEP-APPLY-1', { id: 'DEP-APPLY-1', amount: 1000, appliedAmount: 0, refundedAmount: 0, balance: 1000, status: 'held' });
    const res = await request(app)
      .post('/api/deposits/DEP-APPLY-1/apply')
      .set(authAs(FINANCE_UID))
      .send({ applyAmount: 300, reason: 'Fuel shortfall' });
    expect(res.status).toBe(200);
    expect(res.body.deposit.appliedAmount).toBe(300);
    expect(res.body.deposit.balance).toBe(700);
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
    seedDoc('deposits', 'DEP-OVERAPPLY-1', { id: 'DEP-OVERAPPLY-1', amount: 500, appliedAmount: 0, refundedAmount: 0, balance: 500, status: 'held' });
    const res = await request(app)
      .post('/api/deposits/DEP-OVERAPPLY-1/apply')
      .set(authAs(FINANCE_UID))
      .send({ applyAmount: 5000, reason: 'Too much' });
    expect(res.status).not.toBe(200);
  });
});

describe('POST /api/bank-transactions/:id/reconcile', () => {
  it('reconciles a pending transaction against an invoice', async () => {
    seedDoc('bank_transactions', 'BTX-REC-1', { id: 'BTX-REC-1', reference: 'REF1', credit: 500, reconciled: false, status: 'pending' });
    seedDoc('invoices', 'INV-REC-1', { id: 'INV-REC-1', totalAmount: 1000, paidAmount: 0, balanceDue: 1000, status: 'unpaid' });

    const res = await request(app)
      .post('/api/bank-transactions/BTX-REC-1/reconcile')
      .set(authAs(FINANCE_UID))
      .send({ targetRecordType: 'invoice', targetRecordId: 'INV-REC-1' });

    expect(res.status).toBe(200);
    expect(adminMock.store.get('bank_transactions')?.get('BTX-REC-1').reconciled).toBe(true);
    expect(adminMock.store.get('invoices')?.get('INV-REC-1').paidAmount).toBe(500);
  });

  it('rejects reconciling the same transaction twice', async () => {
    seedDoc('bank_transactions', 'BTX-REC-2', { id: 'BTX-REC-2', reference: 'REF2', credit: 100, reconciled: true, status: 'approved' });
    const res = await request(app)
      .post('/api/bank-transactions/BTX-REC-2/reconcile')
      .set(authAs(FINANCE_UID))
      .send({ targetRecordType: 'invoice', targetRecordId: 'INV-REC-1' });
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
