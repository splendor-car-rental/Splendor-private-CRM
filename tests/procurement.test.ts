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

  // An approver REJECTING an amendment (distinct from the case above, where
  // the amendment request itself was invalid) must leave a real trail: the
  // amendment request's own record has to say 'rejected', not sit at
  // 'pending_approval' forever, and the PO itself must be untouched.
  it('rejecting an amendment leaves the amendment request marked rejected and the PO unchanged', async () => {
    const po = await createApprovedPO();
    const brakePads = po.lineItems.find((li: any) => li.description === 'Brake pads');

    const amendRes = await request(app)
      .post(`/api/purchase-orders/${po.id}/amendment-requests`)
      .set(authAs(OPS_UID))
      .send({
        reason: 'Supplier increased the unit price',
        lineItems: [{ id: brakePads.id, operationType: 'spare_parts', description: 'Brake pads', quantity: 2, unitPrice: 999 }]
      });
    expect(amendRes.status).toBe(201);

    const decideRes = await request(app)
      .post(`/api/procurement/approvals/${amendRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'rejected', note: 'Price increase not confirmed with supplier.' });
    expect(decideRes.status).toBe(200);

    const amendmentList = (await request(app)
      .get(`/api/purchase-orders/${po.id}/amendment-requests`)
      .set(authAs(OPS_UID))).body;
    const rejected = amendmentList.find((ar: any) => ar.id === amendRes.body.amendmentRequest.id);
    expect(rejected.status).toBe('rejected');
    expect(rejected.decisionNote).toBe('Price increase not confirmed with supplier.');

    const updatedPO = (await request(app).get(`/api/purchase-orders/${po.id}`).set(authAs(OPS_UID))).body;
    expect(updatedPO.version).toBe(1);
    expect(updatedPO.totalValue).toBe(po.totalValue);
  });

  it('GET amendment-requests lists requests scoped to the given PO only', async () => {
    const poA = await createApprovedPO();
    const poB = await createApprovedPO();
    const lineA = poA.lineItems[0];

    await request(app)
      .post(`/api/purchase-orders/${poA.id}/amendment-requests`)
      .set(authAs(OPS_UID))
      .send({ reason: 'test A', lineItems: [{ id: lineA.id, operationType: lineA.operationType, description: lineA.description, quantity: lineA.quantity, unitPrice: 12345 }] });

    const listA = (await request(app).get(`/api/purchase-orders/${poA.id}/amendment-requests`).set(authAs(OPS_UID))).body;
    const listB = (await request(app).get(`/api/purchase-orders/${poB.id}/amendment-requests`).set(authAs(OPS_UID))).body;
    expect(listA.length).toBeGreaterThan(0);
    expect(listA.every((ar: any) => ar.purchaseOrderId === poA.id)).toBe(true);
    expect(listB.length).toBe(0);
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

  it('CONCURRENCY: a second offset that no longer fits the LIVE balance is rejected at approval time, not silently over-applied', async () => {
    const supplier = await registerSupplier({ legalName: 'Race Offset Supplier LLC' });
    const obRes = await request(app)
      .post('/api/party-opening-balances')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'supplier', partyId: supplier.id, amount: 1000, direction: 'owed_to_us' });
    await request(app)
      .post(`/api/procurement/approvals/${obRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'ok' });

    // Two offset requests, each individually valid against the SAME 1000
    // balance that existed when both were requested -- exactly the
    // pre-fix condition that let both later get approved and together
    // over-offset the party.
    const offsetA = await request(app)
      .post('/api/offset-requests')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'supplier', partyId: supplier.id, offsetAmount: 700, reason: 'Offset A' });
    expect(offsetA.status).toBe(201);
    expect(offsetA.body.offsetRequest.balanceBefore).toBe(1000);

    const offsetB = await request(app)
      .post('/api/offset-requests')
      .set(authAs(FINANCE_UID))
      .send({ partyType: 'supplier', partyId: supplier.id, offsetAmount: 700, reason: 'Offset B' });
    expect(offsetB.status).toBe(201);
    expect(offsetB.body.offsetRequest.balanceBefore).toBe(1000);

    // Approve A first -- succeeds, live balance drops to 300.
    const approveA = await request(app)
      .post(`/api/procurement/approvals/${offsetA.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Approve A.' });
    expect(approveA.status).toBe(200);
    const balanceAfterA = await request(app).get(`/api/balances/supplier/${supplier.id}`).set(authAs(FINANCE_UID));
    expect(balanceAfterA.body.netAmount).toBe(300);

    // Approve B -- its own stale balanceBefore (1000) would still make this
    // look valid, but the live balance is now only 300. Must be rejected
    // outright rather than silently applied, which would otherwise leave
    // the party appearing to owe -400 (over-offset).
    const approveB = await request(app)
      .post(`/api/procurement/approvals/${offsetB.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Approve B.' });
    expect(approveB.status).toBe(400);
    expect(approveB.body.error).toMatch(/no longer fits/i);

    // The balance was never over-offset, and B is still pending (not
    // silently marked approved or rejected -- a human decides what to do
    // with it, e.g. re-request it at 300).
    const finalBalance = await request(app).get(`/api/balances/supplier/${supplier.id}`).set(authAs(FINANCE_UID));
    expect(finalBalance.body.netAmount).toBe(300);
    const offsetsList = await request(app).get('/api/offset-requests').set(authAs(FINANCE_UID)).query({ partyType: 'supplier', partyId: supplier.id });
    const stillPendingB = offsetsList.body.find((o: any) => o.id === offsetB.body.offsetRequest.id);
    expect(stillPendingB?.status).toBe('pending_approval');
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

describe('Customer credit balances & refunds: never revenue, never auto-used/refunded, always approval-gated', () => {
  it('books an overpayment as a credit balance (never revenue) through Segregation of Duties', async () => {
    const customerId = 'CUS-TEST-OVERPAY-1';
    const res = await request(app)
      .post('/api/customer-credit-balances')
      .set(authAs(OPS_UID))
      .send({ customerId, amount: 300, source: 'overpayment', reason: 'Customer paid 300 AED more than the invoice' });
    expect(res.status).toBe(201);
    expect(res.body.creditBalance.status).toBe('open');

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${res.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${res.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Overpayment confirmed against the invoice.' });

    const balancesRes = await request(app).get(`/api/customer-credit-balances?customerId=${customerId}`).set(authAs(OPS_UID));
    expect(balancesRes.body[0].source).toBe('overpayment');
  });

  it('rejects a refund request for more than the remaining credit balance, and never lets ops execute a refund directly', async () => {
    const customerId = 'CUS-TEST-REFUND-1';
    const cbRes = await request(app)
      .post('/api/customer-credit-balances')
      .set(authAs(OPS_UID))
      .send({ customerId, amount: 500, source: 'cancellation_refund_due', reason: 'Booking cancelled, refund owed' });
    await request(app)
      .post(`/api/procurement/approvals/${cbRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'ok' });

    const tooMuch = await request(app)
      .post('/api/customer-refund-requests')
      .set(authAs(FINANCE_UID))
      .send({ customerId, creditBalanceId: cbRes.body.creditBalance.id, amount: 600, reason: 'Full refund requested' });
    expect(tooMuch.status).toBe(400);

    // Operations role cannot even reach the approval-decide route (requireRole ceo/admin).
    const opsAttempt = await request(app)
      .post('/api/customer-refund-requests')
      .set(authAs(OPS_UID))
      .send({ customerId, creditBalanceId: cbRes.body.creditBalance.id, amount: 200, reason: 'Ops trying to request a refund' });
    expect(opsAttempt.status).toBe(403);
  });

  it('processes a partial refund -- leaves the remainder of the credit balance open, then a second refund closes it out', async () => {
    const customerId = 'CUS-TEST-PARTIAL-REFUND-1';
    const cbRes = await request(app)
      .post('/api/customer-credit-balances')
      .set(authAs(OPS_UID))
      .send({ customerId, amount: 500, source: 'cancellation_refund_due', reason: 'Booking cancelled, refund owed' });
    await request(app)
      .post(`/api/procurement/approvals/${cbRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'ok' });

    const firstRefund = await request(app)
      .post('/api/customer-refund-requests')
      .set(authAs(FINANCE_UID))
      .send({ customerId, creditBalanceId: cbRes.body.creditBalance.id, amount: 200, reason: 'Partial refund requested by customer' });
    expect(firstRefund.status).toBe(201);
    await request(app)
      .post(`/api/procurement/approvals/${firstRefund.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Partial refund approved.' });

    let cbCheck = (await request(app).get(`/api/customer-credit-balances?customerId=${customerId}`).set(authAs(FINANCE_UID))).body[0];
    expect(cbCheck.amount).toBe(300);
    expect(cbCheck.status).toBe('partially_used');
    expect(cbCheck.originalAmount).toBe(500); // original recorded amount never overwritten

    // Execute records the actual money movement, separate from approval.
    const execRes = await request(app)
      .post(`/api/customer-refund-requests/${firstRefund.body.refundRequest.id}/execute`)
      .set(authAs(FINANCE_UID))
      .send({ paymentMethod: 'bank_transfer' });
    expect(execRes.status).toBe(200);
    expect(execRes.body.status).toBe('executed');

    const secondRefund = await request(app)
      .post('/api/customer-refund-requests')
      .set(authAs(FINANCE_UID))
      .send({ customerId, creditBalanceId: cbRes.body.creditBalance.id, amount: 300, reason: 'Remaining balance refunded' });
    await request(app)
      .post(`/api/procurement/approvals/${secondRefund.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Final refund approved.' });

    cbCheck = (await request(app).get(`/api/customer-credit-balances?customerId=${customerId}`).set(authAs(FINANCE_UID))).body[0];
    expect(cbCheck.amount).toBe(0);
    expect(cbCheck.status).toBe('refunded');
  });
});

describe('Debts: fixed types, lifecycle, multiple settlement methods, corrective reversals never edits', () => {
  it('creates a debt, settles it across two different payment methods, and marks it paid', async () => {
    const createRes = await request(app)
      .post('/api/debts')
      .set(authAs(OPS_UID))
      .send({ customerId: 'CUS-DBT-1', customerName: 'Debt Test Customer', type: 'traffic_fine', description: 'Speeding fine', originalAmount: 500 });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('open');

    const firstSettle = await request(app)
      .post(`/api/debts/${createRes.body.id}/settlements`)
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', 'debt-settle-1a')
      .send({ method: 'cash', amount: 200 });
    expect(firstSettle.status).toBe(200);
    expect(firstSettle.body.status).toBe('partially_paid');
    expect(firstSettle.body.remainingAmount).toBe(300);

    const secondSettle = await request(app)
      .post(`/api/debts/${createRes.body.id}/settlements`)
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', 'debt-settle-1b')
      .send({ method: 'bank_transfer', amount: 300 });
    expect(secondSettle.status).toBe(200);
    expect(secondSettle.body.status).toBe('paid');
    expect(secondSettle.body.remainingAmount).toBe(0);
    expect(secondSettle.body.settlements).toHaveLength(2);
  });

  it('rejects a settlement with no Idempotency-Key -- a double-click/retry must never silently double-record a customer payment', async () => {
    const createRes = await request(app)
      .post('/api/debts')
      .set(authAs(OPS_UID))
      .send({ customerId: 'CUS-DBT-IDEMP-1', customerName: 'Idempotency Test Customer', type: 'salik', description: 'Toll charges', originalAmount: 200 });
    const res = await request(app)
      .post(`/api/debts/${createRes.body.id}/settlements`)
      .set(authAs(FINANCE_UID))
      .send({ method: 'cash', amount: 100 });
    expect(res.status).toBe(409);
  });

  it('replays the same settlement result for a retried Idempotency-Key instead of recording it twice', async () => {
    const createRes = await request(app)
      .post('/api/debts')
      .set(authAs(OPS_UID))
      .send({ customerId: 'CUS-DBT-IDEMP-2', customerName: 'Idempotency Test Customer 2', type: 'salik', description: 'Toll charges', originalAmount: 200 });
    const key = 'debt-settle-retry-key-1';
    const first = await request(app)
      .post(`/api/debts/${createRes.body.id}/settlements`)
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', key)
      .send({ method: 'cash', amount: 100 });
    expect(first.status).toBe(200);
    expect(first.body.settlements).toHaveLength(1);

    const second = await request(app)
      .post(`/api/debts/${createRes.body.id}/settlements`)
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', key)
      .send({ method: 'cash', amount: 100 });
    expect(second.status).toBe(200);
    expect(second.body.settlements).toHaveLength(1); // replayed, not a second movement
    expect(second.body.remainingAmount).toBe(first.body.remainingAmount);
  });

  it('rejects a settlement exceeding the remaining debt', async () => {
    const createRes = await request(app)
      .post('/api/debts')
      .set(authAs(OPS_UID))
      .send({ customerId: 'CUS-DBT-2', customerName: 'Debt Test Customer 2', type: 'salik', description: 'Toll charges', originalAmount: 100 });
    const res = await request(app)
      .post(`/api/debts/${createRes.body.id}/settlements`)
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', 'debt-settle-2')
      .send({ method: 'cash', amount: 500 });
    expect(res.status).toBe(400);
  });

  it('reverses a wrong settlement via a new corrective movement -- never edits or deletes the original', async () => {
    const createRes = await request(app)
      .post('/api/debts')
      .set(authAs(OPS_UID))
      .send({ customerId: 'CUS-DBT-3', customerName: 'Debt Test Customer 3', type: 'damage', description: 'Minor scratch', originalAmount: 400 });
    const settleRes = await request(app)
      .post(`/api/debts/${createRes.body.id}/settlements`)
      .set(authAs(FINANCE_UID))
      .set('Idempotency-Key', 'debt-settle-3')
      .send({ method: 'cash', amount: 400 });
    expect(settleRes.body.status).toBe('paid');
    const movementId = settleRes.body.settlements[0].id;

    const reverseRes = await request(app)
      .post(`/api/debts/${createRes.body.id}/settlements/${movementId}/reverse`)
      .set(authAs(FINANCE_UID))
      .send({ reason: 'Recorded against the wrong debt by mistake' });
    expect(reverseRes.status).toBe(201);

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${reverseRes.body.approvalRequestId}/decide`)
      .set(authAs(FINANCE_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${reverseRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Reversal confirmed.' });

    const debtRes = await request(app).get(`/api/debts/${createRes.body.id}`).set(authAs(FINANCE_UID));
    expect(debtRes.body.status).toBe('open');
    expect(debtRes.body.remainingAmount).toBe(400);
    expect(debtRes.body.settlements).toHaveLength(2); // original + reversal, both retained
    expect(debtRes.body.settlements[0].amount).toBe(400); // original untouched
    expect(debtRes.body.settlements[1].isReversal).toBe(true);
    expect(debtRes.body.settlements[1].amount).toBe(-400);
  });

  it('corrects a debt amount through approval, and cancels a debt through approval', async () => {
    const createRes = await request(app)
      .post('/api/debts')
      .set(authAs(OPS_UID))
      .send({ customerId: 'CUS-DBT-4', customerName: 'Debt Test Customer 4', type: 'fuel_shortage', description: 'Fuel gauge shortfall', originalAmount: 150 });

    const correctionRes = await request(app)
      .post(`/api/debts/${createRes.body.id}/correction-requests`)
      .set(authAs(OPS_UID))
      .send({ newAmount: 120, reason: 'Recalculated fuel price' });
    expect(correctionRes.status).toBe(201);
    await request(app)
      .post(`/api/procurement/approvals/${correctionRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Correction confirmed.' });

    let debtRes = await request(app).get(`/api/debts/${createRes.body.id}`).set(authAs(FINANCE_UID));
    expect(debtRes.body.originalAmount).toBe(120);
    expect(debtRes.body.remainingAmount).toBe(120);

    const cancelRes = await request(app)
      .post(`/api/debts/${createRes.body.id}/cancel`)
      .set(authAs(OPS_UID))
      .send({ reason: 'Fuel level dispute resolved in customer\'s favor' });
    expect(cancelRes.status).toBe(201);
    await request(app)
      .post(`/api/procurement/approvals/${cancelRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Cancellation confirmed.' });

    debtRes = await request(app).get(`/api/debts/${createRes.body.id}`).set(authAs(FINANCE_UID));
    expect(debtRes.body.status).toBe('cancelled');
  });
});

describe('Procurement create-route idempotency (network retry / double-click protection)', () => {
  it('POST /api/debts: same Idempotency-Key + identical body replays the SAME debt, never creates a second one', async () => {
    const before = await request(app).get('/api/debts').set(authAs(OPS_UID));
    const countBefore = before.body.length;
    const key = 'debt-idem-key-1';
    const body = { customerId: 'CUS-IDEM-1', customerName: 'Idempotency Test Customer', type: 'salik', description: 'Toll charge', originalAmount: 250 };

    const first = await request(app).post('/api/debts').set(authAs(OPS_UID)).set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/debts').set(authAs(OPS_UID)).set('Idempotency-Key', key).send(body);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id); // replayed the same record, not a new one

    const after = await request(app).get('/api/debts').set(authAs(OPS_UID));
    expect(after.body.length).toBe(countBefore + 1); // exactly one new debt, not two
  });

  it('POST /api/debts: reusing the same Idempotency-Key for a genuinely different request is rejected, not silently misapplied', async () => {
    const key = 'debt-idem-key-2';
    const first = await request(app)
      .post('/api/debts')
      .set(authAs(OPS_UID))
      .set('Idempotency-Key', key)
      .send({ customerId: 'CUS-IDEM-2', customerName: 'Idempotency Conflict Customer', type: 'salik', description: 'Toll charge', originalAmount: 250 });
    expect(first.status).toBe(201);

    const conflicting = await request(app)
      .post('/api/debts')
      .set(authAs(OPS_UID))
      .set('Idempotency-Key', key)
      .send({ customerId: 'CUS-IDEM-2', customerName: 'Idempotency Conflict Customer', type: 'salik', description: 'A DIFFERENT toll charge', originalAmount: 999 });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error).toMatch(/already used for a different request/i);
  });

  it('POST /api/debts: two CONCURRENT identical requests with the same key still produce only one debt', async () => {
    const key = 'debt-idem-key-concurrent-1';
    const body = { customerId: 'CUS-IDEM-3', customerName: 'Concurrent Idempotency Customer', type: 'salik', description: 'Toll charge', originalAmount: 250 };

    const [a, b] = await Promise.all([
      request(app).post('/api/debts').set(authAs(OPS_UID)).set('Idempotency-Key', key).send(body),
      request(app).post('/api/debts').set(authAs(OPS_UID)).set('Idempotency-Key', key).send(body)
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id); // one winner, one replay -- never two separate debts

    const listRes = await request(app).get('/api/debts').set(authAs(OPS_UID));
    expect(listRes.body.filter((d: any) => d.id === a.body.id)).toHaveLength(1);
  });

  it('POST /api/purchase-orders: same Idempotency-Key replays the same PO (proves the same protection on a different module)', async () => {
    const supplier = await registerSupplier({ legalName: 'Idempotency PO Supplier LLC' });
    const key = 'po-idem-key-1';
    const body = { kind: 'regular', supplierId: supplier.id, reason: 'Idempotency test restock', lineItems: [{ operationType: 'spare_parts', description: 'Filters', quantity: 2, unitPrice: 50 }] };

    const first = await request(app).post('/api/purchase-orders').set(authAs(OPS_UID)).set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/purchase-orders').set(authAs(OPS_UID)).set('Idempotency-Key', key).send(body);
    expect(second.status).toBe(201);
    expect(second.body.po.id).toBe(first.body.po.id);
    expect(second.body.approvalRequestId).toBe(first.body.approvalRequestId);

    // No duplicate approval request was created for the replayed PO either.
    const approvalsRes = await request(app).get('/api/procurement/approvals').set(authAs(OPS_UID));
    const matching = approvalsRes.body.filter((a: any) => a.entityId === first.body.po.id);
    expect(matching).toHaveLength(1);
  });

  it('POST /api/debts: omitting the Idempotency-Key preserves prior behavior -- each call creates its own debt', async () => {
    const body = { customerId: 'CUS-IDEM-NOKEY', customerName: 'No Key Customer', type: 'salik', description: 'Toll charge', originalAmount: 250 };
    const first = await request(app).post('/api/debts').set(authAs(OPS_UID)).send(body);
    const second = await request(app).post('/api/debts').set(authAs(OPS_UID)).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id); // no key -- no dedup, exactly as before this fix
  });
});

describe('Employee custody/float + expenses: approval-gated issuance, pending/rejected/resubmitted, duplicates flagged not blocked', () => {
  it('opens a custody float through Segregation of Duties, and a later top-up increases the existing balance', async () => {
    const issueRes = await request(app)
      .post('/api/employee-custodies/issue')
      .set(authAs(OPS_UID))
      .send({ employeeId: 'EMP-CUST-1', employeeName: 'Test Employee', amount: 1000, reason: 'Monthly float' });
    expect(issueRes.status).toBe(201);

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${issueRes.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${issueRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Float issued.' });

    let custodyRes = (await request(app).get('/api/employee-custodies?employeeId=EMP-CUST-1').set(authAs(OPS_UID))).body[0];
    expect(custodyRes.currentBalance).toBe(1000);
    expect(custodyRes.movements[0].type).toBe('opening_balance');

    const topUpRes = await request(app)
      .post('/api/employee-custodies/issue')
      .set(authAs(OPS_UID))
      .send({ employeeId: 'EMP-CUST-1', employeeName: 'Test Employee', amount: 200, reason: 'Extra float for a trip' });
    await request(app)
      .post(`/api/procurement/approvals/${topUpRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Top-up approved.' });

    custodyRes = (await request(app).get('/api/employee-custodies?employeeId=EMP-CUST-1').set(authAs(OPS_UID))).body[0];
    expect(custodyRes.currentBalance).toBe(1200);
    expect(custodyRes.movements).toHaveLength(2);
  });

  it('an approved custody_float expense debits the float; an insufficient balance is rejected at approval', async () => {
    const issueRes = await request(app)
      .post('/api/employee-custodies/issue')
      .set(authAs(OPS_UID))
      .send({ employeeId: 'EMP-CUST-2', employeeName: 'Float Spender', amount: 300, reason: 'Float' });
    await request(app)
      .post(`/api/procurement/approvals/${issueRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'ok' });
    const custody = (await request(app).get('/api/employee-custodies?employeeId=EMP-CUST-2').set(authAs(OPS_UID))).body[0];

    const expenseRes = await request(app)
      .post('/api/employee-expenses')
      .set(authAs(OPS_UID))
      .send({
        employeeId: 'EMP-CUST-2', employeeName: 'Float Spender', custodyId: custody.id, fundingSource: 'custody_float',
        category: 'fuel', amount: 150, date: '2026-01-10'
      });
    expect(expenseRes.status).toBe(201);
    expect(expenseRes.body.expense.status).toBe('pending_review');

    await request(app)
      .post(`/api/procurement/approvals/${expenseRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Expense approved.' });

    const custodyAfter = (await request(app).get(`/api/employee-custodies/${custody.id}`).set(authAs(OPS_UID))).body;
    expect(custodyAfter.currentBalance).toBe(150);

    // Now try to approve an expense larger than what's left in the float.
    const tooLargeExpenseRes = await request(app)
      .post('/api/employee-expenses')
      .set(authAs(OPS_UID))
      .send({
        employeeId: 'EMP-CUST-2', employeeName: 'Float Spender', custodyId: custody.id, fundingSource: 'custody_float',
        category: 'maintenance', amount: 500, date: '2026-01-11'
      });
    const decideRes = await request(app)
      .post(`/api/procurement/approvals/${tooLargeExpenseRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Trying to approve anyway.' });
    expect(decideRes.status).toBe(400); // handler blocks it -- insufficient float balance, not silently overdrawn
  });

  it('own-money expense records amountOwedToEmployee on approval; rejecting keeps the float untouched and preserves rejection history for resubmission', async () => {
    const ownMoneyRes = await request(app)
      .post('/api/employee-expenses')
      .set(authAs(OPS_UID))
      .send({ employeeId: 'EMP-CUST-3', employeeName: 'Own Money Spender', fundingSource: 'employee_own_money', category: 'transport', amount: 80, date: '2026-01-12' });
    expect(ownMoneyRes.status).toBe(201);
    await request(app)
      .post(`/api/procurement/approvals/${ownMoneyRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Reimbursement approved.' });

    const ownMoneyExpense = (await request(app).get(`/api/employee-expenses/${ownMoneyRes.body.expense.id}`).set(authAs(OPS_UID))).body;
    expect(ownMoneyExpense.amountOwedToEmployee).toBe(80);

    // Rejection flow + resubmission.
    const rejectableRes = await request(app)
      .post('/api/employee-expenses')
      .set(authAs(OPS_UID))
      .send({ employeeId: 'EMP-CUST-3', employeeName: 'Own Money Spender', fundingSource: 'employee_own_money', category: 'meals', amount: 40, date: '2026-01-13' });
    await request(app)
      .post(`/api/procurement/approvals/${rejectableRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'rejected', note: 'Missing receipt.' });

    let rejectedExpense = (await request(app).get(`/api/employee-expenses/${rejectableRes.body.expense.id}`).set(authAs(OPS_UID))).body;
    expect(rejectedExpense.status).toBe('rejected');
    expect(rejectedExpense.rejectionHistory).toHaveLength(1);
    expect(rejectedExpense.rejectionHistory[0].reason).toBe('Missing receipt.');

    const resubmitRes = await request(app)
      .post(`/api/employee-expenses/${rejectableRes.body.expense.id}/resubmit`)
      .set(authAs(OPS_UID))
      .send({ documentIds: ['DOC-RECEIPT-1'] });
    expect(resubmitRes.status).toBe(201);
    expect(resubmitRes.body.expense.status).toBe('pending_review');

    await request(app)
      .post(`/api/procurement/approvals/${resubmitRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Receipt attached, approved.' });

    rejectedExpense = (await request(app).get(`/api/employee-expenses/${rejectableRes.body.expense.id}`).set(authAs(OPS_UID))).body;
    expect(rejectedExpense.status).toBe('approved');
    expect(rejectedExpense.rejectionHistory).toHaveLength(1); // rejection history preserved, never erased
  });

  it('flags a possible duplicate expense (same employee/amount/date) without blocking submission', async () => {
    await request(app)
      .post('/api/employee-expenses')
      .set(authAs(OPS_UID))
      .send({ employeeId: 'EMP-CUST-4', employeeName: 'Dup Test', fundingSource: 'employee_own_money', category: 'fuel', amount: 60, date: '2026-01-14', vendorOrPartyName: 'ADNOC' });

    const dupRes = await request(app)
      .post('/api/employee-expenses')
      .set(authAs(OPS_UID))
      .send({ employeeId: 'EMP-CUST-4', employeeName: 'Dup Test', fundingSource: 'employee_own_money', category: 'fuel', amount: 60, date: '2026-01-14', vendorOrPartyName: 'ADNOC' });
    expect(dupRes.status).toBe(201); // never blocked
    expect(dupRes.body.expense.duplicateWarning).toBeTruthy();
    expect(dupRes.body.expense.duplicateWarning.possibleDuplicateOfExpenseId).toBeTruthy();
  });
});

describe('Supplier invoices: matched against the PO, corrections linked to originals, duplicates flagged', () => {
  it('invoice matching the PO exactly needs no variance approval note, and approving it never auto-creates a payment', async () => {
    const po = await createApprovedPO({
      lineItems: [{ operationType: 'spare_parts', description: 'Brake pads', quantity: 2, unitPrice: 100 }, { operationType: 'spare_parts', description: 'Oil filters', quantity: 5, unitPrice: 20 }]
    });
    const invRes = await request(app)
      .post('/api/supplier-invoices')
      .set(authAs(OPS_UID))
      .send({ supplierId: po.supplierId, purchaseOrderId: po.id, invoiceNumber: 'SUP-INV-001', invoiceDate: '2026-01-15', amount: po.totalValue });
    expect(invRes.status).toBe(201);
    expect(invRes.body.invoice.poVarianceAmount).toBe(0);
    expect(invRes.body.invoice.status).toBe('pending_review');

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${invRes.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${invRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Matches PO exactly.' });

    const invoiceCheck = (await request(app).get(`/api/supplier-invoices/${invRes.body.invoice.id}`).set(authAs(OPS_UID))).body;
    expect(invoiceCheck.status).toBe('approved');
    // No payment request was auto-created by invoice approval.
    const payments = (await request(app).get(`/api/supplier-payment-requests?purchaseOrderId=${po.id}`).set(authAs(OPS_UID))).body;
    expect(payments).toHaveLength(0);
  });

  it('flags an invoice that exceeds the PO as needing re-evaluated approval, and never auto-debts an under-PO invoice', async () => {
    const po = await createApprovedPO({ lineItems: [{ operationType: 'spare_parts', description: 'Brake pads', quantity: 1, unitPrice: 100 }] });

    const overRes = await request(app)
      .post('/api/supplier-invoices')
      .set(authAs(OPS_UID))
      .send({ supplierId: po.supplierId, purchaseOrderId: po.id, invoiceNumber: 'SUP-INV-OVER', invoiceDate: '2026-01-16', amount: 150 });
    expect(overRes.status).toBe(201);
    expect(overRes.body.invoice.poVarianceAmount).toBe(50);
    expect(overRes.body.invoice.varianceApprovalRequestId).toBe(overRes.body.approvalRequestId);

    const underRes = await request(app)
      .post('/api/supplier-invoices')
      .set(authAs(OPS_UID))
      .send({ supplierId: po.supplierId, purchaseOrderId: po.id, invoiceNumber: 'SUP-INV-UNDER', invoiceDate: '2026-01-16', amount: 80 });
    expect(underRes.status).toBe(201);
    expect(underRes.body.invoice.poVarianceAmount).toBe(-20);

    // No debt was auto-created for the under-PO invoice.
    const debtsRes = await request(app).get(`/api/debts?customerId=${po.supplierId}`).set(authAs(OPS_UID));
    expect(debtsRes.body).toHaveLength(0);
  });

  it('a corrective/replacement invoice is a new record linked to the original, which is cancelled with a forward reference', async () => {
    const po = await createApprovedPO({ lineItems: [{ operationType: 'spare_parts', description: 'Brake pads', quantity: 1, unitPrice: 100 }] });
    const originalRes = await request(app)
      .post('/api/supplier-invoices')
      .set(authAs(OPS_UID))
      .send({ supplierId: po.supplierId, purchaseOrderId: po.id, invoiceNumber: 'SUP-INV-ORIG', invoiceDate: '2026-01-17', amount: 100 });

    const correctionRes = await request(app)
      .post('/api/supplier-invoices')
      .set(authAs(OPS_UID))
      .send({
        supplierId: po.supplierId, purchaseOrderId: po.id, invoiceNumber: 'SUP-INV-ORIG-R1', invoiceDate: '2026-01-18', amount: 110,
        correctionOfInvoiceId: originalRes.body.invoice.id, correctionReason: 'Supplier issued a corrected invoice with VAT included'
      });
    expect(correctionRes.status).toBe(201);
    expect(correctionRes.body.invoice.correctionOfInvoiceId).toBe(originalRes.body.invoice.id);

    const originalCheck = (await request(app).get(`/api/supplier-invoices/${originalRes.body.invoice.id}`).set(authAs(OPS_UID))).body;
    expect(originalCheck.status).toBe('cancelled');
    expect(originalCheck.cancellation.replacementInvoiceId).toBe(correctionRes.body.invoice.id);
  });

  it('flags a duplicate invoice (same supplier + invoice number) without blocking submission, and supports reject + separate cancellation-after-approval', async () => {
    const po = await createApprovedPO({ lineItems: [{ operationType: 'spare_parts', description: 'Brake pads', quantity: 1, unitPrice: 100 }] });
    await request(app)
      .post('/api/supplier-invoices')
      .set(authAs(OPS_UID))
      .send({ supplierId: po.supplierId, purchaseOrderId: po.id, invoiceNumber: 'SUP-INV-DUP', invoiceDate: '2026-01-19', amount: 100 });

    const dupRes = await request(app)
      .post('/api/supplier-invoices')
      .set(authAs(OPS_UID))
      .send({ supplierId: po.supplierId, purchaseOrderId: po.id, invoiceNumber: 'SUP-INV-DUP', invoiceDate: '2026-01-19', amount: 100 });
    expect(dupRes.status).toBe(201); // never blocked
    expect(dupRes.body.invoice.duplicateWarning.possibleDuplicateOfInvoiceId).toBeTruthy();

    await request(app)
      .post(`/api/procurement/approvals/${dupRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'rejected', note: 'Confirmed duplicate, rejecting.' });
    const rejectedCheck = (await request(app).get(`/api/supplier-invoices/${dupRes.body.invoice.id}`).set(authAs(OPS_UID))).body;
    expect(rejectedCheck.status).toBe('cancelled');
    expect(rejectedCheck.cancellation.reason).toBe('Confirmed duplicate, rejecting.');

    // Separately, an already-approved invoice can be cancelled through its own approval workflow.
    const anotherRes = await request(app)
      .post('/api/supplier-invoices')
      .set(authAs(OPS_UID))
      .send({ supplierId: po.supplierId, purchaseOrderId: po.id, invoiceNumber: 'SUP-INV-CANCEL-LATER', invoiceDate: '2026-01-20', amount: 100 });
    await request(app)
      .post(`/api/procurement/approvals/${anotherRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'ok' });

    const cancelReqRes = await request(app)
      .post(`/api/supplier-invoices/${anotherRes.body.invoice.id}/cancel`)
      .set(authAs(OPS_UID))
      .send({ reason: 'Duplicate discovered after approval' });
    expect(cancelReqRes.status).toBe(201);
    await request(app)
      .post(`/api/procurement/approvals/${cancelReqRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Cancellation confirmed.' });

    const finalCheck = (await request(app).get(`/api/supplier-invoices/${anotherRes.body.invoice.id}`).set(authAs(OPS_UID))).body;
    expect(finalCheck.status).toBe('cancelled');
  });
});

describe('Operational expenses: expense-without-invoice / fully-undocumented (strict conditions, always flagged), never auto-blocked', () => {
  it('requires a reason and an alternate document for a no-invoice expense', async () => {
    const missingReason = await request(app)
      .post('/api/operational-expenses')
      .set(authAs(OPS_UID))
      .send({ documentationLevel: 'no_invoice_has_alternate_document', category: 'maintenance', amount: 200, date: '2026-01-20', paymentMethod: 'cash' });
    expect(missingReason.status).toBe(400);

    const missingDoc = await request(app)
      .post('/api/operational-expenses')
      .set(authAs(OPS_UID))
      .send({ documentationLevel: 'no_invoice_has_alternate_document', category: 'maintenance', amount: 200, date: '2026-01-20', paymentMethod: 'cash', reasonForNoInvoice: 'Roadside repair, no invoice given' });
    expect(missingDoc.status).toBe(400);

    const ok = await request(app)
      .post('/api/operational-expenses')
      .set(authAs(OPS_UID))
      .send({
        documentationLevel: 'no_invoice_has_alternate_document', category: 'maintenance', amount: 200, date: '2026-01-20', paymentMethod: 'cash',
        reasonForNoInvoice: 'Roadside repair, no invoice given', alternateDocumentIds: ['DOC-PHOTO-1']
      });
    expect(ok.status).toBe(201);
    expect(ok.body.expense.status).toBe('pending_approval');
  });

  it('requires a reason AND a detailed description for a fully undocumented expense, and always flags it', async () => {
    const missingBoth = await request(app)
      .post('/api/operational-expenses')
      .set(authAs(OPS_UID))
      .send({ documentationLevel: 'undocumented', category: 'other_purchases', amount: 100, date: '2026-01-21', paymentMethod: 'cash' });
    expect(missingBoth.status).toBe(400);

    const missingDescription = await request(app)
      .post('/api/operational-expenses')
      .set(authAs(OPS_UID))
      .send({ documentationLevel: 'undocumented', category: 'other_purchases', amount: 100, date: '2026-01-21', paymentMethod: 'cash', reasonForNoInvoice: 'Cash-only vendor, no receipt available' });
    expect(missingDescription.status).toBe(400);

    const ok = await request(app)
      .post('/api/operational-expenses')
      .set(authAs(OPS_UID))
      .send({
        documentationLevel: 'undocumented', category: 'other_purchases', amount: 100, date: '2026-01-21', paymentMethod: 'cash',
        reasonForNoInvoice: 'Cash-only vendor, no receipt available', detailedDescription: 'Emergency tow rope purchased from a roadside stall near the highway exit.'
      });
    expect(ok.status).toBe(201);

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${ok.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${ok.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Reviewed with extra scrutiny given no documentation.' });

    const finalCheck = (await request(app).get(`/api/operational-expenses/${ok.body.expense.id}`).set(authAs(OPS_UID))).body;
    expect(finalCheck.status).toBe('approved');
  });

  it('rejects an operational expense without blocking future submissions, and never invents a category', async () => {
    const res = await request(app)
      .post('/api/operational-expenses')
      .set(authAs(OPS_UID))
      .send({
        documentationLevel: 'no_invoice_has_alternate_document', category: 'other', categoryOther: 'Parking validation stickers',
        amount: 50, date: '2026-01-22', paymentMethod: 'cash', reasonForNoInvoice: 'Vendor does not issue invoices', alternateDocumentIds: ['DOC-2']
      });
    expect(res.status).toBe(201);

    await request(app)
      .post(`/api/procurement/approvals/${res.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'rejected', note: 'Not a legitimate operational cost.' });

    const rejected = (await request(app).get(`/api/operational-expenses/${res.body.expense.id}`).set(authAs(OPS_UID))).body;
    expect(rejected.status).toBe('rejected');
  });
});

describe('Vehicle receiving: reservation-severity levels form a baseline, impactful needs handover approval, dangerous_safety blocks', () => {
  it('a matching receipt proceeds with no approval needed', async () => {
    const po = await createApprovedPO({ lineItems: [{ operationType: 'vehicle_supply_rental', description: 'Vehicle A', quantity: 1, unitPrice: 40000 }] });
    const opId = po.lineItems[0].operationId;

    const res = await request(app)
      .post('/api/vehicle-receiving-records')
      .set(authAs(OPS_UID))
      .send({ operationId: opId, purchaseOrderId: po.id, supplierId: po.supplierId, result: 'matching', description: 'Vehicle matches the order exactly.' });
    expect(res.status).toBe(201);
    expect(res.body.record.decision).toBe('proceed');
    expect(res.body.approvalRequestId).toBeUndefined();
  });

  it('a simple reservation proceeds; an impactful one requires handover approval; a dangerous_safety one is blocked', async () => {
    const po = await createApprovedPO({ lineItems: [{ operationType: 'vehicle_supply_rental', description: 'Vehicle A', quantity: 1, unitPrice: 40000 }] });
    const opId = po.lineItems[0].operationId;

    const simpleRes = await request(app)
      .post('/api/vehicle-receiving-records')
      .set(authAs(OPS_UID))
      .send({ operationId: opId, purchaseOrderId: po.id, supplierId: po.supplierId, result: 'with_reservation', reservationSeverity: 'simple', reservationReason: 'Minor scuff on the bumper', description: 'Otherwise fine.' });
    expect(simpleRes.body.record.decision).toBe('proceed');

    const impactfulRes = await request(app)
      .post('/api/vehicle-receiving-records')
      .set(authAs(OPS_UID))
      .send({ operationId: opId, purchaseOrderId: po.id, supplierId: po.supplierId, result: 'with_reservation', reservationSeverity: 'impactful', reservationReason: 'AC not cooling properly', description: 'Needs review before customer handover.' });
    expect(impactfulRes.body.record.decision).toBe('requires_approval_before_handover');
    expect(impactfulRes.body.approvalRequestId).toBeTruthy();

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${impactfulRes.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${impactfulRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'AC checked, minor issue, cleared for handover.' });

    const clearedCheck = (await request(app).get(`/api/vehicle-receiving-records/${impactfulRes.body.record.id}`).set(authAs(OPS_UID))).body;
    expect(clearedCheck.approvedForHandoverAt).toBeTruthy();

    const dangerousRes = await request(app)
      .post('/api/vehicle-receiving-records')
      .set(authAs(OPS_UID))
      .send({ operationId: opId, purchaseOrderId: po.id, supplierId: po.supplierId, result: 'with_reservation', reservationSeverity: 'dangerous_safety', reservationReason: 'Brakes failing', description: 'Do not drive.' });
    expect(dangerousRes.body.record.decision).toBe('blocked');
    expect(dangerousRes.body.approvalRequestId).toBeUndefined();
  });

  it('a rejected vehicle is always blocked', async () => {
    const po = await createApprovedPO({ lineItems: [{ operationType: 'vehicle_supply_rental', description: 'Vehicle A', quantity: 1, unitPrice: 40000 }] });
    const res = await request(app)
      .post('/api/vehicle-receiving-records')
      .set(authAs(OPS_UID))
      .send({ operationId: po.lineItems[0].operationId, purchaseOrderId: po.id, supplierId: po.supplierId, result: 'rejected', description: 'Wrong model entirely.' });
    expect(res.body.record.decision).toBe('blocked');
  });
});

describe('TARS: 3-hour deadline from the REAL signed-contract time, supplier delay never blocks Splendor operations', () => {
  it('computes the deadline as exactly 3 hours from contractSignedAt (not from any listing time), and on-time execution is not flagged delayed', async () => {
    const signedAt = new Date().toISOString(); // "now" -- so an immediate execution is comfortably on time
    const createRes = await request(app)
      .post('/api/tars-records')
      .set(authAs(OPS_UID))
      .send({ contractId: 'CON-TARS-1', contractSignedAt: signedAt });
    expect(createRes.status).toBe(201);
    expect(new Date(createRes.body.deadlineAt).getTime() - new Date(signedAt).getTime()).toBe(3 * 60 * 60 * 1000);

    const execRes = await request(app)
      .post(`/api/tars-records/${createRes.body.id}/execute`)
      .set(authAs(OPS_UID));
    expect(execRes.status).toBe(200);
    expect(execRes.body.isDelayed).toBe(false);
  });

  it('a delayed TARS transfer attributes the fine to the supplier when linked to an operation, and to Splendor when not', async () => {
    const pastSignedAt = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // 5h ago -> deadline already 2h in the past
    const supplierLinkedRes = await request(app)
      .post('/api/tars-records')
      .set(authAs(OPS_UID))
      .send({ operationId: 'OPS-TEST-1', contractId: 'CON-TARS-2', contractSignedAt: pastSignedAt });
    const execRes = await request(app)
      .post(`/api/tars-records/${supplierLinkedRes.body.id}/execute`)
      .set(authAs(OPS_UID));
    expect(execRes.body.isDelayed).toBe(true);
    expect(execRes.body.fineResponsibility).toBe('supplier');
    expect(execRes.body.supplierListingDelay).toBe(true);

    const splendorOwnedRes = await request(app)
      .post('/api/tars-records')
      .set(authAs(OPS_UID))
      .send({ contractId: 'CON-TARS-3', contractSignedAt: pastSignedAt }); // no operationId -- Splendor-owned vehicle
    const execRes2 = await request(app)
      .post(`/api/tars-records/${splendorOwnedRes.body.id}/execute`)
      .set(authAs(OPS_UID));
    expect(execRes2.body.fineResponsibility).toBe('splendor');
  });

  it('the return-to-supplier flow records both timestamps and flags an unusually long gap', async () => {
    const createRes = await request(app)
      .post('/api/tars-records')
      .set(authAs(OPS_UID))
      .send({ contractId: 'CON-TARS-4', contractSignedAt: new Date().toISOString() });
    await request(app).post(`/api/tars-records/${createRes.body.id}/execute`).set(authAs(OPS_UID));

    const returnRes = await request(app).post(`/api/tars-records/${createRes.body.id}/return-to-supplier`).set(authAs(OPS_UID));
    expect(returnRes.status).toBe(200);
    expect(returnRes.body.returnedToSupplierAt).toBeTruthy();

    const closeRes = await request(app).post(`/api/tars-records/${createRes.body.id}/close-return`).set(authAs(OPS_UID));
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.returnClosedAt).toBeTruthy();
    expect(closeRes.body.closingDelayed).toBe(false); // closed immediately, well under the threshold
  });

  it('escalation monitoring flags an overdue, not-yet-executed TARS record without blocking anything', async () => {
    const veryOldSignedAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(); // 10h ago -> 7h overdue past the 3h deadline
    await request(app)
      .post('/api/tars-records')
      .set(authAs(OPS_UID))
      .send({ contractId: 'CON-TARS-URGENT', contractSignedAt: veryOldSignedAt });

    const escalationsRes = await request(app).get('/api/tars-records/escalations').set(authAs(CEO_UID));
    expect(escalationsRes.status).toBe(200);
    expect(escalationsRes.body.some((r: any) => r.contractId === 'CON-TARS-URGENT' && r.escalationLevel === 'urgent')).toBe(true);
  });
});

describe('Customer late fee: 1h grace, round-to-nearest-hour (exact 30min rounds up), 6h-past-grace converts to a full extra day, waiver never erases the original', () => {
  it('rounds correctly and never charges within grace, via the compute endpoint', async () => {
    const withinGrace = await request(app)
      .post('/api/late-fees/compute')
      .set(authAs(FINANCE_UID))
      .send({ dailyRate: 240, scheduledReturnAt: '2026-01-01T10:00:00.000Z', actualReturnAt: '2026-01-01T10:45:00.000Z' }); // 45 min, within 1h grace
    expect(withinGrace.body.feeAmount).toBe(0);
    expect(withinGrace.body.withinGrace).toBe(true);

    // 1h grace + 1h29m past grace -> rounds DOWN to 1 billable hour.
    const roundsDown = await request(app)
      .post('/api/late-fees/compute')
      .set(authAs(FINANCE_UID))
      .send({ dailyRate: 240, scheduledReturnAt: '2026-01-01T10:00:00.000Z', actualReturnAt: '2026-01-01T12:29:00.000Z' });
    expect(roundsDown.body.billableHours).toBe(1);
    expect(roundsDown.body.feeAmount).toBe(10); // 1 * (240/24)

    // 1h grace + exactly 1h30m past grace -> exact half-hour rounds UP to 2.
    const roundsUpAtHalf = await request(app)
      .post('/api/late-fees/compute')
      .set(authAs(FINANCE_UID))
      .send({ dailyRate: 240, scheduledReturnAt: '2026-01-01T10:00:00.000Z', actualReturnAt: '2026-01-01T12:30:00.000Z' });
    expect(roundsUpAtHalf.body.billableHours).toBe(2);

    // 1h grace + more than 6h past grace -> converts to one full extra day, not hourly.
    const convertsToDay = await request(app)
      .post('/api/late-fees/compute')
      .set(authAs(FINANCE_UID))
      .send({ dailyRate: 240, scheduledReturnAt: '2026-01-01T10:00:00.000Z', actualReturnAt: '2026-01-01T17:30:00.000Z' }); // 1h grace + 6h31m
    expect(convertsToDay.body.convertedToExtraDay).toBe(true);
    expect(convertsToDay.body.feeAmount).toBe(240);
  });

  it('waiving a late fee always computes the original first, requires a mandatory reason, and is approval-gated', async () => {
    const missingReason = await request(app)
      .post('/api/late-fee-waivers')
      .set(authAs(OPS_UID))
      .send({ contractId: 'CON-LATE-1', dailyRate: 240, scheduledReturnAt: '2026-01-01T10:00:00.000Z', actualReturnAt: '2026-01-01T12:30:00.000Z', waivedAmount: 20 });
    expect(missingReason.status).toBe(400);

    const waiveRes = await request(app)
      .post('/api/late-fee-waivers')
      .set(authAs(OPS_UID))
      .send({
        contractId: 'CON-LATE-1', dailyRate: 240, scheduledReturnAt: '2026-01-01T10:00:00.000Z', actualReturnAt: '2026-01-01T12:30:00.000Z',
        waivedAmount: 20, reason: 'Customer notified of a family emergency, goodwill gesture.'
      });
    expect(waiveRes.status).toBe(201);
    expect(waiveRes.body.originalLateFeeAmount).toBe(20); // 2 billable hours * 10

    const selfApprove = await request(app)
      .post(`/api/procurement/approvals/${waiveRes.body.approvalRequestId}/decide`)
      .set(authAs(OPS_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfApprove.status).toBe(403);

    await request(app)
      .post(`/api/procurement/approvals/${waiveRes.body.approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Waiver approved.' });

    const waiversRes = await request(app).get('/api/late-fee-waivers?contractId=CON-LATE-1').set(authAs(FINANCE_UID));
    expect(waiversRes.body).toHaveLength(1);
    expect(waiversRes.body[0].originalLateFeeAmount).toBe(20);
    expect(waiversRes.body[0].waivedAmount).toBe(20);
  });

  it('rejects waiving more than the original computed fee', async () => {
    const res = await request(app)
      .post('/api/late-fee-waivers')
      .set(authAs(OPS_UID))
      .send({
        contractId: 'CON-LATE-2', dailyRate: 240, scheduledReturnAt: '2026-01-01T10:00:00.000Z', actualReturnAt: '2026-01-01T12:30:00.000Z',
        waivedAmount: 999, reason: 'Trying to waive more than the fee itself'
      });
    expect(res.status).toBe(400);
  });

  // CONFIG-002: the grace period and full-day-conversion thresholds used to
  // be hardcoded literals in src/config/procurement.ts. They're now real,
  // editable Business Rules -- this proves the compute endpoint actually
  // reads the CURRENT rule value on every call, not a value baked in at
  // import time.
  it('CONFIG-002: changing the grace-period business rule immediately changes what the compute endpoint charges', async () => {
    // 90 minutes late is 30 min past the default 1h grace -> exactly a
    // half-hour, which rounds UP to 1 billable hour under the default rule.
    const beforeChange = await request(app)
      .post('/api/late-fees/compute')
      .set(authAs(FINANCE_UID))
      .send({ dailyRate: 240, scheduledReturnAt: '2026-01-01T10:00:00.000Z', actualReturnAt: '2026-01-01T11:30:00.000Z' });
    expect(beforeChange.body.withinGrace).toBe(false);
    expect(beforeChange.body.billableHours).toBe(1);

    const patchRes = await request(app)
      .patch('/api/business-rules/lateFeeGracePeriodHours')
      .set(authAs(CEO_UID))
      .send({ value: 2, reason: 'QA verification of CONFIG-002 live wiring.' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('applied');

    // The exact same 90-minutes-late scenario is now WITHIN the new 2h
    // grace period -- no fee at all. If this module still read the old
    // hardcoded constant instead of the live rule, this would still
    // charge 1 billable hour.
    const afterChange = await request(app)
      .post('/api/late-fees/compute')
      .set(authAs(FINANCE_UID))
      .send({ dailyRate: 240, scheduledReturnAt: '2026-01-01T10:00:00.000Z', actualReturnAt: '2026-01-01T11:30:00.000Z' });
    expect(afterChange.body.withinGrace).toBe(true);
    expect(afterChange.body.feeAmount).toBe(0);

    // Restore the default so it doesn't leak into other tests in this file.
    await request(app)
      .patch('/api/business-rules/lateFeeGracePeriodHours')
      .set(authAs(CEO_UID))
      .send({ value: 1, reason: 'Restore default after QA verification.' });
  });
});
