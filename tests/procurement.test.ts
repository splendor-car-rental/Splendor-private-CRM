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

async function createApprovedPO(overrides: { supplierName?: string; lineItems?: any[] } = {}) {
  const supplier = await registerSupplier({ legalName: overrides.supplierName || 'Amendment Test Supplier LLC' });
  const createRes = await request(app)
    .post('/api/purchase-orders')
    .set(authAs(OPS_UID))
    .send({
      kind: 'regular',
      supplierId: supplier.id,
      reason: 'Setup for amendment/cancellation test',
      lineItems: overrides.lineItems || [
        { operationType: 'spare_parts', description: 'Brake pads', quantity: 2, unitPrice: 100 },
        { operationType: 'spare_parts', description: 'Oil filters', quantity: 5, unitPrice: 20 }
      ]
    });
  expect(createRes.status).toBe(201);
  await request(app)
    .post(`/api/procurement/approvals/${createRes.body.approvalRequestId}/decide`)
    .set(authAs(CEO_UID))
    .send({ decision: 'approved', note: 'Approved.' });
  const poRes = await request(app).get(`/api/purchase-orders/${createRes.body.po.id}`).set(authAs(OPS_UID));
  return poRes.body;
}

describe('#7/#8 PO amendment (rules 10-11): new version, old version retained, value re-evaluated', () => {
  it('amending a line item creates a new version, keeps the old version in history, and recomputes the total', async () => {
    const po = await createApprovedPO();
    expect(po.version).toBe(1);
    const brakePads = po.lineItems.find((li: any) => li.description === 'Brake pads');

    const amendRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/amendment-requests`)
      .set(authAs(OPS_UID))
      .send({
        reason: 'Supplier increased the unit price',
        lineItems: [{ id: brakePads.id, operationType: 'spare_parts', description: 'Brake pads', quantity: 2, unitPrice: 150 }]
      });
    expect(amendRes.status).toBe(201);
    expect(amendRes.body.amendmentRequest.proposedTotalValue).toBe(400); // (2*150) + (5*20)

    // Requester cannot approve their own amendment.
    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${amendRes.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    const decideRes = await request(app)
      .post(`/api/procurement/approvals/${amendRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Price increase confirmed with supplier.' });
    expect(decideRes.status).toBe(200);

    const updatedPO = (await request(app).get(`/api/purchase-orders/${po.id}`).set(authAs(OPS_UID))).body;
    expect(updatedPO.version).toBe(2);
    expect(updatedPO.totalValue).toBe(400);
    expect(updatedPO.history).toHaveLength(2);
    // Old version is fully retained, not overwritten.
    expect(updatedPO.history[0].version).toBe(1);
    expect(updatedPO.history[0].totalValue).toBe(po.totalValue);
    expect(updatedPO.history[1].version).toBe(2);
    expect(updatedPO.history[1].totalValue).toBe(400);
    // The unchanged line item (oil filters) was carried forward untouched.
    const oilFilters = updatedPO.lineItems.find((li: any) => li.description === 'Oil filters');
    expect(oilFilters.unitPrice).toBe(20);
    expect(oilFilters.operationId).toBeTruthy();
  });

  it('an amendment can add a brand-new line item, which gets its own Operation on approval', async () => {
    const po = await createApprovedPO();

    const amendRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/amendment-requests`)
      .set(authAs(OPS_UID))
      .send({
        reason: 'Adding a third item to the same order',
        lineItems: [{ operationType: 'spare_parts', description: 'Wiper blades', quantity: 1, unitPrice: 60 }]
      });
    expect(amendRes.status).toBe(201);
    expect(amendRes.body.amendmentRequest.proposedLineItems).toHaveLength(3);

    await request(app)
      .post(`/api/procurement/approvals/${amendRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Added item approved.' });

    const updatedPO = (await request(app).get(`/api/purchase-orders/${po.id}`).set(authAs(OPS_UID))).body;
    const newLine = updatedPO.lineItems.find((li: any) => li.description === 'Wiper blades');
    expect(newLine).toBeTruthy();
    expect(newLine.operationId).toBeTruthy();
  });

  it('rejects an amendment on a purchase order that is still pending_approval (not yet approved once)', async () => {
    const supplier = await registerSupplier({ legalName: 'Not Yet Approved Supplier LLC' });
    const createRes = await request(app)
      .post('/api/purchase-orders')
      .set(authAs(OPS_UID))
      .send({
        kind: 'regular',
        supplierId: supplier.id,
        reason: 'test',
        lineItems: [{ operationType: 'services', description: 'Service', quantity: 1, unitPrice: 100 }]
      });
    const amendRes = await request(app)
      .post(`/api/purchase-orders/${createRes.body.po.id}/amendment-requests`)
      .set(authAs(OPS_UID))
      .send({ reason: 'test', lineItems: [{ operationType: 'services', description: 'Service', quantity: 2, unitPrice: 100 }] });
    expect(amendRes.status).toBe(400);
  });
});

describe('#5 Partial line-item cancellation: one line of a multi-vehicle PO, request -> review -> approval', () => {
  it('cancelling one line item leaves the rest untouched, never deletes, and marks the PO partially_cancelled', async () => {
    const po = await createApprovedPO();
    const oilFilters = po.lineItems.find((li: any) => li.description === 'Oil filters');

    const cancelRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/line-items/${oilFilters.id}/cancel`)
      .set(authAs(OPS_UID))
      .send({ reason: 'No longer needed', financialImpact: 'Reduces PO value by 100 AED' });
    expect(cancelRes.status).toBe(201);

    // Same requester cannot approve their own cancellation.
    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${cancelRes.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${cancelRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Cancellation confirmed.' });

    const updatedPO = (await request(app).get(`/api/purchase-orders/${po.id}`).set(authAs(OPS_UID))).body;
    expect(updatedPO.status).toBe('partially_cancelled');
    expect(updatedPO.totalValue).toBe(200); // brake pads only: 2*100
    const cancelledLine = updatedPO.lineItems.find((li: any) => li.id === oilFilters.id);
    expect(cancelledLine.status).toBe('cancelled');
    expect(cancelledLine.cancellation.status).toBe('approved');
    expect(cancelledLine.cancellation.reason).toBe('No longer needed');
    // Never deleted -- the line item record still exists on the PO.
    expect(updatedPO.lineItems).toHaveLength(2);
    const otherLine = updatedPO.lineItems.find((li: any) => li.id !== oilFilters.id);
    expect(otherLine.status).not.toBe('cancelled');
  });

  it('rejects cancelling a line item that is already cancelled', async () => {
    const po = await createApprovedPO();
    const line = po.lineItems[0];
    const cancelRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/line-items/${line.id}/cancel`)
      .set(authAs(OPS_UID))
      .send({ reason: 'first cancellation' });
    await request(app)
      .post(`/api/procurement/approvals/${cancelRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'ok' });

    const secondAttempt = await request(app)
      .post(`/api/purchase-orders/${po.id}/line-items/${line.id}/cancel`)
      .set(authAs(OPS_UID))
      .send({ reason: 'second cancellation attempt' });
    expect(secondAttempt.status).toBe(400);
  });
});

describe('#6 Full PO cancellation: same workflow, status only, number never reused', () => {
  it('cancels every remaining line item, cascades to open Operations, and keeps the PO id intact', async () => {
    const po = await createApprovedPO({
      lineItems: [
        { operationType: 'vehicle_supply_rental', description: 'Vehicle A', quantity: 1, unitPrice: 40000 },
        { operationType: 'vehicle_supply_rental', description: 'Vehicle B', quantity: 1, unitPrice: 45000 }
      ]
    });

    const cancelRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/cancel`)
      .set(authAs(OPS_UID))
      .send({ reason: 'Deal fell through with the supplier' });
    expect(cancelRes.status).toBe(201);

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${cancelRes.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${cancelRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Full cancellation confirmed.' });

    const updatedPO = (await request(app).get(`/api/purchase-orders/${po.id}`).set(authAs(OPS_UID))).body;
    expect(updatedPO.id).toBe(po.id); // number never reused / never changed
    expect(updatedPO.status).toBe('cancelled');
    expect(updatedPO.cancellation.status).toBe('approved');
    updatedPO.lineItems.forEach((li: any) => expect(li.status).toBe('cancelled'));

    const opsRes = await request(app).get('/api/procurement/operations').set(authAs(OPS_UID));
    const linkedOps = opsRes.body.filter((o: any) => o.purchaseOrderId === po.id);
    expect(linkedOps.length).toBeGreaterThan(0);
    linkedOps.forEach((op: any) => expect(op.status).toBe('cancelled'));
  });

  it('rejects a second full-cancellation request once the PO is already cancelled', async () => {
    const po = await createApprovedPO();
    const cancelRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/cancel`)
      .set(authAs(OPS_UID))
      .send({ reason: 'first cancellation' });
    await request(app)
      .post(`/api/procurement/approvals/${cancelRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'ok' });

    const secondAttempt = await request(app)
      .post(`/api/purchase-orders/${po.id}/cancel`)
      .set(authAs(OPS_UID))
      .send({ reason: 'second attempt' });
    expect(secondAttempt.status).toBe(400);
  });
});

describe('#4 Partial fulfillment: n of m line items received, PO stays open', () => {
  it('marks one line item received while the PO stays partially_fulfilled until every line is in', async () => {
    const po = await createApprovedPO({
      lineItems: [
        { operationType: 'vehicle_supply_rental', description: 'Vehicle A', quantity: 1, unitPrice: 40000 },
        { operationType: 'vehicle_supply_rental', description: 'Vehicle B', quantity: 1, unitPrice: 45000 }
      ]
    });
    const [lineA, lineB] = po.lineItems;

    const receiveRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/line-items/${lineA.id}/receive`)
      .set(authAs(OPS_UID));
    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.status).toBe('partially_fulfilled');

    const receiveSecond = await request(app)
      .post(`/api/purchase-orders/${po.id}/line-items/${lineB.id}/receive`)
      .set(authAs(OPS_UID));
    expect(receiveSecond.status).toBe(200);
    expect(receiveSecond.body.status).toBe('fulfilled');
  });

  it('rejects receiving the same line item twice', async () => {
    const po = await createApprovedPO();
    const line = po.lineItems[0];
    await request(app).post(`/api/purchase-orders/${po.id}/line-items/${line.id}/receive`).set(authAs(OPS_UID));
    const secondAttempt = await request(app).post(`/api/purchase-orders/${po.id}/line-items/${line.id}/receive`).set(authAs(OPS_UID));
    expect(secondAttempt.status).toBe(400);
  });
});

describe('Supplier quotes/offers: every offer documented, known source, staff recommends / approver approves', () => {
  it('records an official-quote offer and rejects a zero/negative price', async () => {
    const supplier = await registerSupplier({ legalName: 'Quote Supplier LLC' });
    const goodQuote = await request(app)
      .post('/api/supplier-quotes')
      .set(authAs(OPS_UID))
      .send({ supplierId: supplier.id, source: 'official_quote', price: 1200, terms: 'Net 30' });
    expect(goodQuote.status).toBe(201);
    expect(goodQuote.body.id).toMatch(/^QTV-/);
    expect(goodQuote.body.isSelected).toBe(false);

    const badQuote = await request(app)
      .post('/api/supplier-quotes')
      .set(authAs(OPS_UID))
      .send({ supplierId: supplier.id, source: 'official_quote', price: 0 });
    expect(badQuote.status).toBe(400);
  });

  it('requires a responsible contact name and phone number for a phone-call quote', async () => {
    const supplier = await registerSupplier({ legalName: 'Phone Quote Supplier LLC' });

    const missingContact = await request(app)
      .post('/api/supplier-quotes')
      .set(authAs(OPS_UID))
      .send({ supplierId: supplier.id, source: 'phone_call', price: 900 });
    expect(missingContact.status).toBe(400);

    const withContact = await request(app)
      .post('/api/supplier-quotes')
      .set(authAs(OPS_UID))
      .send({
        supplierId: supplier.id, source: 'phone_call', price: 900,
        phoneContactPersonName: 'Ahmed (Sales)', phoneContactPersonPhone: '971509876543'
      });
    expect(withContact.status).toBe(201);
    expect(withContact.body.phoneContactPersonName).toBe('Ahmed (Sales)');
  });

  it('staff recommends an offer, a different approver selects it, and it supersedes the prior selected offer for the same PO', async () => {
    const po = await createApprovedPO({ supplierName: 'Quote Selection Supplier LLC' });
    const supplierId = po.supplierId;

    const quoteA = await request(app)
      .post('/api/supplier-quotes')
      .set(authAs(OPS_UID))
      .send({ purchaseOrderId: po.id, supplierId, source: 'email', price: 1000 });
    const quoteB = await request(app)
      .post('/api/supplier-quotes')
      .set(authAs(OPS_UID))
      .send({ purchaseOrderId: po.id, supplierId, source: 'whatsapp', price: 950 });

    // Select quote A first.
    const selectA = await request(app)
      .post(`/api/supplier-quotes/${quoteA.body.id}/select`)
      .set(authAs(OPS_UID))
      .send({ reason: 'Best terms at the time' });
    expect(selectA.status).toBe(201);

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${selectA.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${selectA.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Approved quote A.' });

    let refreshedA = (await request(app).get(`/api/supplier-quotes/${quoteA.body.id}`).set(authAs(OPS_UID))).body;
    expect(refreshedA.isSelected).toBe(true);
    expect(refreshedA.approvedBy).toBe(CEO_UID);

    // A cheaper quote comes in later and is selected instead -- quote A stays
    // on record (never deleted), only its isSelected flag flips.
    const selectB = await request(app)
      .post(`/api/supplier-quotes/${quoteB.body.id}/select`)
      .set(authAs(OPS_UID))
      .send({ reason: 'Cheaper offer received' });
    await request(app)
      .post(`/api/procurement/approvals/${selectB.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Switching to the cheaper offer.' });

    refreshedA = (await request(app).get(`/api/supplier-quotes/${quoteA.body.id}`).set(authAs(OPS_UID))).body;
    const refreshedB = (await request(app).get(`/api/supplier-quotes/${quoteB.body.id}`).set(authAs(OPS_UID))).body;
    expect(refreshedA.isSelected).toBe(false);
    expect(refreshedA.price).toBe(1000); // original recorded price untouched
    expect(refreshedB.isSelected).toBe(true);
  });

  it('rejects a second selection request while one is already pending for the same quote', async () => {
    const po = await createApprovedPO({ supplierName: 'Duplicate Selection Supplier LLC' });
    const quote = await request(app)
      .post('/api/supplier-quotes')
      .set(authAs(OPS_UID))
      .send({ purchaseOrderId: po.id, supplierId: po.supplierId, source: 'email', price: 500 });

    const first = await request(app)
      .post(`/api/supplier-quotes/${quote.body.id}/select`)
      .set(authAs(OPS_UID))
      .send({ reason: 'First recommendation' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/supplier-quotes/${quote.body.id}/select`)
      .set(authAs(OPS_UID))
      .send({ reason: 'Duplicate recommendation attempt' });
    expect(second.status).toBe(400);
  });
});

describe('Supplier payments: post_verification vs advance tracks, mandatory Segregation of Duties', () => {
  it('rejects a post_verification payment when nothing on the PO has been received yet', async () => {
    const po = await createApprovedPO();
    const res = await request(app)
      .post('/api/supplier-payment-requests')
      .set(authAs(OPS_UID))
      .send({
        purchaseOrderId: po.id, track: 'post_verification', amount: 200,
        paymentMethod: 'bank_transfer', reason: 'Paying for brake pads'
      });
    expect(res.status).toBe(400);
  });

  it('allows a post_verification payment once a line item is received, and a different approver must decide it', async () => {
    const po = await createApprovedPO();
    const line = po.lineItems[0];
    await request(app).post(`/api/purchase-orders/${po.id}/line-items/${line.id}/receive`).set(authAs(OPS_UID));

    const res = await request(app)
      .post('/api/supplier-payment-requests')
      .set(authAs(OPS_UID))
      .send({
        purchaseOrderId: po.id, operationId: line.operationId, track: 'post_verification', amount: 200,
        paymentMethod: 'bank_transfer', reason: 'Paying for received brake pads'
      });
    expect(res.status).toBe(201);
    expect(res.body.paymentRequest.status).toBe('pending_approval');

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${res.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    const decideRes = await request(app)
      .post(`/api/procurement/approvals/${res.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Verified and approved.' });
    expect(decideRes.status).toBe(200);

    const paymentRes = await request(app).get(`/api/supplier-payment-requests/${res.body.paymentRequest.id}`).set(authAs(OPS_UID));
    expect(paymentRes.body.status).toBe('approved');

    // Marking paid is a separate, later step recording that funds actually moved.
    const markPaid = await request(app)
      .post(`/api/supplier-payment-requests/${res.body.paymentRequest.id}/mark-paid`)
      .set(authAs(FINANCE_UID));
    expect(markPaid.status).toBe(200);
    expect(markPaid.body.status).toBe('paid');
    expect(markPaid.body.paidAt).toBeTruthy();

    // The Operation now shows this payment linked to it.
    const opRes = await request(app).get(`/api/procurement/operations/${line.operationId}`).set(authAs(OPS_UID));
    expect(opRes.body.supplierPaymentIds).toContain(res.body.paymentRequest.id);
  });

  it('allows an advance payment with nothing received yet, and an advance can be increased as a new independent movement', async () => {
    const po = await createApprovedPO();

    const advanceRes = await request(app)
      .post('/api/supplier-payment-requests')
      .set(authAs(OPS_UID))
      .send({ purchaseOrderId: po.id, track: 'advance', amount: 100, paymentMethod: 'bank_transfer', reason: 'Advance to secure the order' });
    expect(advanceRes.status).toBe(201);
    await request(app)
      .post(`/api/procurement/approvals/${advanceRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Advance approved.' });

    // A further advance is a brand-new, independent request, not an edit.
    const increaseRes = await request(app)
      .post('/api/supplier-payment-requests')
      .set(authAs(OPS_UID))
      .send({
        purchaseOrderId: po.id, track: 'advance', amount: 50, paymentMethod: 'bank_transfer',
        isIncreaseOfRequestId: advanceRes.body.paymentRequest.id, reason: 'Supplier requested more upfront'
      });
    expect(increaseRes.status).toBe(201);
    expect(increaseRes.body.paymentRequest.id).not.toBe(advanceRes.body.paymentRequest.id);
    expect(increaseRes.body.paymentRequest.isIncreaseOfRequestId).toBe(advanceRes.body.paymentRequest.id);

    // Rejects increasing a non-advance (post_verification) track.
    const badTrack = await request(app)
      .post('/api/supplier-payment-requests')
      .set(authAs(OPS_UID))
      .send({
        purchaseOrderId: po.id, track: 'post_verification', amount: 50, paymentMethod: 'bank_transfer',
        isIncreaseOfRequestId: advanceRes.body.paymentRequest.id, reason: 'bad'
      });
    expect(badTrack.status).toBe(400);
  });

  it('creates an advance settlement when a PO is cancelled after an advance was paid, approval-gated, human-supplied terms', async () => {
    const po = await createApprovedPO();
    const advanceRes = await request(app)
      .post('/api/supplier-payment-requests')
      .set(authAs(OPS_UID))
      .send({ purchaseOrderId: po.id, track: 'advance', amount: 300, paymentMethod: 'bank_transfer', reason: 'Advance paid' });
    await request(app)
      .post(`/api/procurement/approvals/${advanceRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'ok' });

    const cancelRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/cancel`)
      .set(authAs(OPS_UID))
      .send({ reason: 'Order no longer needed' });
    await request(app)
      .post(`/api/procurement/approvals/${cancelRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Cancellation approved.' });

    const settlementRes = await request(app)
      .post('/api/advance-settlements')
      .set(authAs(FINANCE_UID))
      .send({
        purchaseOrderId: po.id, originalAdvanceAmount: 300,
        amountDueToSupplierPerCancellationTerms: 50, deductionsOrFees: 10,
        reason: 'Supplier cancellation terms allow them to retain 50 AED'
      });
    expect(settlementRes.status).toBe(201);
    expect(settlementRes.body.settlement.amountToBeRefunded).toBe(250);
    expect(settlementRes.body.settlement.netRefund).toBe(240);
    expect(settlementRes.body.settlement.refundStatus).toBe('pending');

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${settlementRes.body.approvalRequestId}/decide`)
      .set(authAs(FINANCE_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${settlementRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Settlement approved.' });

    const settlementsRes = await request(app).get(`/api/advance-settlements?purchaseOrderId=${po.id}`).set(authAs(FINANCE_UID));
    expect(settlementsRes.body[0].refundStatus).toBe('in_progress');

    const completeRes = await request(app)
      .post(`/api/advance-settlements/${settlementRes.body.settlement.id}/mark-completed`)
      .set(authAs(FINANCE_UID));
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.refundStatus).toBe('completed');
  });

  it('rejects a payment request with a zero amount, and rejects "other" payment method without a description', async () => {
    const po = await createApprovedPO();
    const zeroAmount = await request(app)
      .post('/api/supplier-payment-requests')
      .set(authAs(OPS_UID))
      .send({ purchaseOrderId: po.id, track: 'advance', amount: 0, paymentMethod: 'cash', reason: 'test' });
    expect(zeroAmount.status).toBe(400);

    const missingOther = await request(app)
      .post('/api/supplier-payment-requests')
      .set(authAs(OPS_UID))
      .send({ purchaseOrderId: po.id, track: 'advance', amount: 100, paymentMethod: 'other', reason: 'test' });
    expect(missingOther.status).toBe(400);
  });
});

describe('Balances: opening balances, offsetting (mandatory reason, never automatic, blocked while disputed)', () => {
  it('records a supplier opening balance and requires a different approver to confirm it', async () => {
    const supplier = await registerSupplier({ legalName: 'Opening Balance Supplier LLC' });

    const res = await request(app)
      .post('/api/party-opening-balances')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'supplier', partyId: supplier.id, amount: 5000, direction: 'owed_by_us' });
    expect(res.status).toBe(201);

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${res.body.approvalRequestId}/decide`)
      .set(authAs(FINANCE_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${res.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Confirmed against supplier statement.' });

    const balanceRes = await request(app).get(`/api/balances/supplier/${supplier.id}`).set(authAs(FINANCE_UID));
    expect(balanceRes.status).toBe(200);
    expect(balanceRes.body.direction).toBe('owed_by_us');
    expect(balanceRes.body.netAmount).toBe(-5000);
    expect(balanceRes.body.offsetEligibility).toBe('offsettable');
  });

  it('offsets a supplier balance with a mandatory reason and a different approver, moving it toward zero', async () => {
    const supplier = await registerSupplier({ legalName: 'Offset Supplier LLC' });
    const obRes = await request(app)
      .post('/api/party-opening-balances')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'supplier', partyId: supplier.id, amount: 1000, direction: 'owed_to_us' });
    await request(app)
      .post(`/api/procurement/approvals/${obRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'ok' });

    const missingReason = await request(app)
      .post('/api/offset-requests')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'supplier', partyId: supplier.id, offsetAmount: 400 });
    expect(missingReason.status).toBe(400);

    const offsetRes = await request(app)
      .post('/api/offset-requests')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'supplier', partyId: supplier.id, offsetAmount: 400, reason: 'Applied against next PO payment' });
    expect(offsetRes.status).toBe(201);
    expect(offsetRes.body.offsetRequest.balanceBefore).toBe(1000);

    // Rejects an offset larger than the outstanding balance.
    const tooLarge = await request(app)
      .post('/api/offset-requests')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'supplier', partyId: supplier.id, offsetAmount: 5000, reason: 'Too much' });
    expect(tooLarge.status).toBe(400);

    await request(app)
      .post(`/api/procurement/approvals/${offsetRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Offset approved.' });

    const balanceRes = await request(app).get(`/api/balances/supplier/${supplier.id}`).set(authAs(FINANCE_UID));
    expect(balanceRes.body.netAmount).toBe(600);
  });

  it('blocks offsetting a customer balance while a dispute is open, and unblocks it once resolved', async () => {
    const customerId = 'CUS-TEST-DISPUTE-1';
    const obRes = await request(app)
      .post('/api/party-opening-balances')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'customer', partyId: customerId, amount: 800, direction: 'owed_to_us' });
    await request(app)
      .post(`/api/procurement/approvals/${obRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'ok' });

    const disputeRes = await request(app)
      .post('/api/customer-disputes')
      .set(authAs(OPS_UID))
      .send({ customerId, amount: 800, objectionReason: 'Customer says this charge is wrong' });
    expect(disputeRes.status).toBe(201);
    expect(disputeRes.body.status).toBe('open');

    const blockedOffset = await request(app)
      .post('/api/offset-requests')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'customer', partyId: customerId, offsetAmount: 100, reason: 'Trying to offset while disputed' });
    expect(blockedOffset.status).toBe(400);
    expect(blockedOffset.body.error).toMatch(/not offsettable/i);

    const resolveRes = await request(app)
      .post(`/api/customer-disputes/${disputeRes.body.id}/resolve`)
      .set(authAs(FINANCE_UID))
      .send({ resolutionType: 'resolved_upheld', resolution: 'Charge confirmed correct after review.' });
    expect(resolveRes.status).toBe(201);

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${resolveRes.body.approvalRequestId}/decide`)
      .set(authAs(FINANCE_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${resolveRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Resolution confirmed.' });

    const disputesRes = await request(app).get(`/api/customer-disputes?customerId=${customerId}`).set(authAs(FINANCE_UID));
    expect(disputesRes.body.find((d: any) => d.id === disputeRes.body.id).status).toBe('resolved_upheld');

    const unblockedOffset = await request(app)
      .post('/api/offset-requests')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'customer', partyId: customerId, offsetAmount: 100, reason: 'Dispute resolved, now offsetting' });
    expect(unblockedOffset.status).toBe(201);
  });
});
