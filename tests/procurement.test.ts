/**
 * Splendor Procurement, Phase 1 -- Suppliers + Purchase Orders foundation
 * ==========================================================================
 * Covers required test scenarios: #1 (regular PO), #2 (retroactive PO),
 * #3 (multi-vehicle PO -> independent operations), plus supplier
 * registration/eligibility and PO Four-Eyes segregation of duties.
 *
 * ISOLATION: firebase-admin is fully mocked (same in-memory Firestore
 * simulation pattern as tests/governanceEngine.test.ts) -- no real Firebase
 * project is contacted, and nothing here reads or writes real production data.
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
    delete: async () => { collectionOf(collectionName).delete(id); }
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
let adminMock: { verifyIdToken: Mock; usersDb: Map<string, { role: string; name: string }> };

const CEO_UID = 'proc-ceo-uid';
const ADMIN2_UID = 'proc-admin2-uid';
const OPS_UID = 'proc-ops-uid';
const FINANCE_UID = 'proc-finance-uid';

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(CEO_UID, { role: 'ceo', name: 'Test CEO' });
  adminMock.usersDb.set(ADMIN2_UID, { role: 'admin', name: 'Test Admin (2nd approver)' });
  adminMock.usersDb.set(OPS_UID, { role: 'operations', name: 'Test Operations' });
  adminMock.usersDb.set(FINANCE_UID, { role: 'finance', name: 'Test Finance' });

  const serverModule = await import('../server');
  app = serverModule.default;
});

afterAll(() => {
  delete process.env.VERCEL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
});

beforeEach(() => {
  adminMock.verifyIdToken.mockReset();
});

function authAs(uid: string) {
  adminMock.verifyIdToken.mockResolvedValueOnce({ uid });
  return { Authorization: 'Bearer test-token' };
}

async function registerSupplier(overrides: Record<string, any> = {}) {
  const res = await request(app)
    .post('/api/suppliers')
    .set(authAs(OPS_UID))
    .send({
      legalName: 'Test Fleet Supplier LLC',
      tradeLicenseNumber: 'DED-12345',
      phone: '971501234567',
      ...overrides
    });
  expect(res.status).toBe(201);
  return res.body;
}

describe('Suppliers (rules 4-7)', () => {
  it('activates a supplier the moment core-mandatory fields exist, even with optional data missing', async () => {
    const supplier = await registerSupplier();
    expect(supplier.status).toBe('active');
  });

  it('leaves a supplier pending_completion when a core-mandatory field is missing', async () => {
    const res = await request(app)
      .post('/api/suppliers')
      .set(authAs(OPS_UID))
      .send({ legalName: 'Incomplete Supplier LLC' }); // no tradeLicenseNumber, no phone
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_completion');
  });

  it('rejects a PO referencing a supplier id that was never registered -- no free-text supplier names', async () => {
    const res = await request(app)
      .post('/api/purchase-orders')
      .set(authAs(OPS_UID))
      .send({
        kind: 'regular',
        supplierId: 'SUP-DOES-NOT-EXIST',
        reason: 'Test',
        lineItems: [{ operationType: 'spare_parts', description: 'Brake pads', quantity: 1, unitPrice: 500 }]
      });
    expect(res.status).toBe(404);
  });

  it('eligibility check reports a blocking gap for vehicle_supply_rental when bank details are missing, but not for spare_parts', async () => {
    const supplier = await registerSupplier({ legalName: 'No-Bank-Details Supplier LLC' });

    const vehicleCheck = await request(app).get(`/api/suppliers/${supplier.id}/eligibility?operationType=vehicle_supply_rental`).set(authAs(OPS_UID));
    expect(vehicleCheck.body.status).toBe('blocking_gap');
    expect(vehicleCheck.body.missingFields).toContain('bankDetails');

    const partsCheck = await request(app).get(`/api/suppliers/${supplier.id}/eligibility?operationType=spare_parts`).set(authAs(OPS_UID));
    expect(partsCheck.body.status).not.toBe('blocking_gap');
  });
});

describe('Purchase Orders -- regular PO, sequencing (rules 1, 9, 85)', () => {
  it('#1 regular PO: creates with a PO-SCR-1xx number, starts pending_approval, requires a different approver', async () => {
    const supplier = await registerSupplier({ legalName: 'Regular PO Supplier LLC' });

    const createRes = await request(app)
      .post('/api/purchase-orders')
      .set(authAs(OPS_UID))
      .send({
        kind: 'regular',
        supplierId: supplier.id,
        reason: 'Routine spare parts restock',
        lineItems: [{ operationType: 'spare_parts', description: 'Oil filters', quantity: 10, unitPrice: 50 }]
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.po.id).toMatch(/^PO-SCR-\d{3}$/);
    expect(createRes.body.po.status).toBe('pending_approval');
    expect(createRes.body.po.totalValue).toBe(500);

    // The requester cannot approve their own PO.
    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${createRes.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID)) // same uid as requester -- but this route requires ceo/admin anyway
      .send({ decision: 'approved', note: 'trying to self-approve' });
    expect(selfApprove.status).toBe(403); // blocked by role (operations isn't a decider role) before it would even reach the SoD check

    // A different authorized person approves.
    const decideRes = await request(app)
      .post(`/api/procurement/approvals/${createRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Reviewed and approved.' });
    expect(decideRes.status).toBe(200);
    expect(decideRes.body.status).toBe('approved');

    const poRes = await request(app).get(`/api/purchase-orders/${createRes.body.po.id}`).set(authAs(OPS_UID));
    expect(poRes.body.status).toBe('approved');
    expect(poRes.body.approvedBy).toBe(CEO_UID);
  });

  it('a PO requester who also holds ceo/admin cannot approve their own PO (Segregation of Duties)', async () => {
    const supplier = await registerSupplier({ legalName: 'SoD Test Supplier LLC' });
    const createRes = await request(app)
      .post('/api/purchase-orders')
      .set(authAs(CEO_UID))
      .send({
        kind: 'regular',
        supplierId: supplier.id,
        reason: 'Testing self-approval block',
        lineItems: [{ operationType: 'services', description: 'Detailing service', quantity: 1, unitPrice: 300 }]
      });
    expect(createRes.status).toBe(201);

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${createRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Approving my own PO.' });
    expect(selfApprove.status).toBe(409);
    expect(selfApprove.body.error).toMatch(/cannot decide your own request/i);
  });

  it('#2 retroactive PO: requires a fixed reason, is labeled clearly, keeps the real historical date', async () => {
    const supplier = await registerSupplier({ legalName: 'Retroactive PO Supplier LLC' });

    const missingReason = await request(app)
      .post('/api/purchase-orders')
      .set(authAs(FINANCE_UID))
      .send({
        kind: 'retroactive',
        supplierId: supplier.id,
        reason: 'Invoice arrived unexpectedly',
        lineItems: [{ operationType: 'maintenance_repair', description: 'Emergency AC repair', quantity: 1, unitPrice: 800 }]
      });
    expect(missingReason.status).toBe(400); // no retroactiveReason supplied

    const createRes = await request(app)
      .post('/api/purchase-orders')
      .set(authAs(FINANCE_UID))
      .send({
        kind: 'retroactive',
        retroactiveReason: 'emergency_purchase',
        actualOperationDate: '2026-01-05T10:00:00.000Z',
        supplierId: supplier.id,
        reason: 'Invoice arrived unexpectedly',
        lineItems: [{ operationType: 'maintenance_repair', description: 'Emergency AC repair', quantity: 1, unitPrice: 800 }]
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.po.kind).toBe('retroactive');
    expect(createRes.body.po.retroactiveReason).toBe('emergency_purchase');
    expect(createRes.body.po.actualOperationDate).toBe('2026-01-05T10:00:00.000Z');
    // Uses the SAME sequence as a regular PO -- no separate numbering scheme.
    expect(createRes.body.po.id).toMatch(/^PO-SCR-\d{3}$/);
  });

  it('#3 multi-vehicle PO: each line item becomes its own independent Operation once approved', async () => {
    const supplier = await registerSupplier({ legalName: 'Multi-Vehicle Supplier LLC', bankDetails: { iban: 'AE000000000000000000000' } });

    const createRes = await request(app)
      .post('/api/purchase-orders')
      .set(authAs(OPS_UID))
      .send({
        kind: 'regular',
        supplierId: supplier.id,
        reason: 'Fleet expansion -- 3 vehicles',
        lineItems: [
          { operationType: 'vehicle_supply_rental', description: 'Vehicle 1', quantity: 1, unitPrice: 50000 },
          { operationType: 'vehicle_supply_rental', description: 'Vehicle 2', quantity: 1, unitPrice: 55000 },
          { operationType: 'vehicle_supply_rental', description: 'Vehicle 3', quantity: 1, unitPrice: 60000 }
        ]
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.po.lineItems).toHaveLength(3);
    expect(createRes.body.po.totalValue).toBe(165000);

    await request(app)
      .post(`/api/procurement/approvals/${createRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Approved fleet expansion.' });

    const opsRes = await request(app).get('/api/procurement/operations').set(authAs(OPS_UID));
    const linkedOps = opsRes.body.filter((o: any) => o.purchaseOrderId === createRes.body.po.id);
    expect(linkedOps).toHaveLength(3);
    // Every operation is independently trackable but still linked back to the same parent PO.
    linkedOps.forEach((op: any) => {
      expect(op.purchaseOrderId).toBe(createRes.body.po.id);
      expect(op.status).toBe('open');
    });

    const poRes = await request(app).get(`/api/purchase-orders/${createRes.body.po.id}`).set(authAs(OPS_UID));
    poRes.body.lineItems.forEach((li: any) => expect(li.operationId).toBeTruthy());
  });

  it('rejects a PO with zero line items', async () => {
    const supplier = await registerSupplier({ legalName: 'Empty PO Supplier LLC' });
    const res = await request(app)
      .post('/api/purchase-orders')
      .set(authAs(OPS_UID))
      .send({ kind: 'regular', supplierId: supplier.id, reason: 'test', lineItems: [] });
    expect(res.status).toBe(400);
  });

  it('rejects a PO with no reason -- every request needs a mandatory reason', async () => {
    const supplier = await registerSupplier({ legalName: 'No Reason Supplier LLC' });
    const res = await request(app)
      .post('/api/purchase-orders')
      .set(authAs(OPS_UID))
      .send({ kind: 'regular', supplierId: supplier.id, lineItems: [{ operationType: 'services', description: 'x', quantity: 1, unitPrice: 1 }] });
    expect(res.status).toBe(400);
  });
});
