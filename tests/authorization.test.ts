/**
 * Financial Route Authorization Audit (Phase 6)
 * ==============================================
 *
 * Proves that every money-moving route enforces its role gate on the
 * SERVER, not just in the frontend UI: a provisioned-but-unauthorized
 * role gets a deterministic 403, and an unauthenticated request gets a
 * deterministic 401 -- for every route the remediation pass added
 * requireRole(...) to. This does not attempt to prove full business-logic
 * correctness for each route (that's covered by tests/durablePersistence.test.ts
 * and tests/tollImportSecurity.test.ts); it proves the authorization gate
 * itself cannot be bypassed by an authenticated user who simply lacks the
 * right role.
 *
 * ISOLATION: firebase-admin is fully mocked (same in-memory Firestore
 * simulation as tests/tollImportSecurity.test.ts) -- no real Firebase
 * project is contacted, and nothing here reads or writes real production
 * data.
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
    initializeApp: (_opts: any) => {
      appsArr.push({});
    },
    auth: () => ({ verifyIdToken }),
    firestore: () => firestoreObj,
    storage: () => ({ bucket: () => ({ file: () => ({}) }) }),
    __test: { verifyIdToken, usersDb, appsArr, store }
  };

  return { default: admin };
});

let app: any;
let adminMock: {
  verifyIdToken: Mock;
  usersDb: Map<string, { role: string; name: string }>;
  store: Map<string, Map<string, any>>;
};

const CEO_UID = 'ceo-uid';
const FINANCE_UID = 'finance-uid';
const SALES_UID = 'sales-uid';
const OPERATIONS_UID = 'operations-uid';
const FLEET_UID = 'fleet-uid';

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(CEO_UID, { role: 'ceo', name: 'Test CEO' });
  adminMock.usersDb.set(FINANCE_UID, { role: 'finance', name: 'Test Finance' });
  adminMock.usersDb.set(SALES_UID, { role: 'sales', name: 'Test Sales' });
  adminMock.usersDb.set(OPERATIONS_UID, { role: 'operations', name: 'Test Operations' });
  adminMock.usersDb.set(FLEET_UID, { role: 'fleet', name: 'Test Fleet' });

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

type RouteCase = {
  name: string;
  method: 'post' | 'put' | 'patch' | 'delete';
  path: string;
  deniedUid: string;
  allowedUid: string;
  body?: Record<string, unknown>;
};

// Every entry mirrors an actual requireRole(...) gate in server.ts.
// deniedUid is a provisioned, authenticated user whose role is NOT in that
// route's allow-list; allowedUid IS in the allow-list. The assertion is
// deliberately just "not blocked by the role gate" for the allowed case
// (status !== 401 && !== 403) since driving each route to full business
// success would require a fully-seeded vehicle/customer/contract fixture
// per route -- that end-to-end behavior is covered elsewhere. What this
// suite exists to prove is that the gate itself is real and server-side.
const CASES: RouteCase[] = [
  { name: 'POST /api/contracts', method: 'post', path: '/api/contracts', deniedUid: FLEET_UID, allowedUid: CEO_UID, body: {} },
  { name: 'POST /api/contracts/:id/handover', method: 'post', path: '/api/contracts/CON-2026-00001/handover', deniedUid: SALES_UID, allowedUid: CEO_UID, body: {} },
  { name: 'POST /api/contracts/:id/return', method: 'post', path: '/api/contracts/CON-2026-00001/return', deniedUid: FINANCE_UID, allowedUid: CEO_UID, body: {} },
  { name: 'POST /api/contracts/:id/extend', method: 'post', path: '/api/contracts/CON-2026-00001/extend', deniedUid: FLEET_UID, allowedUid: CEO_UID, body: {} },
  { name: 'POST /api/charges', method: 'post', path: '/api/charges', deniedUid: SALES_UID, allowedUid: FINANCE_UID, body: {} },
  { name: 'POST /api/deposits', method: 'post', path: '/api/deposits', deniedUid: FLEET_UID, allowedUid: FINANCE_UID, body: {} },
  { name: 'POST /api/deposits/:id/apply', method: 'post', path: '/api/deposits/DEP-000001/apply', deniedUid: SALES_UID, allowedUid: FINANCE_UID, body: {} },
  { name: 'POST /api/deposits/:id/refund', method: 'post', path: '/api/deposits/DEP-000001/refund', deniedUid: OPERATIONS_UID, allowedUid: FINANCE_UID, body: {} },
  { name: 'POST /api/payments', method: 'post', path: '/api/payments', deniedUid: SALES_UID, allowedUid: FINANCE_UID, body: {} },
  { name: 'POST /api/bank-batches', method: 'post', path: '/api/bank-batches', deniedUid: OPERATIONS_UID, allowedUid: FINANCE_UID, body: {} },
  { name: 'POST /api/bank-transactions/:id/reconcile', method: 'post', path: '/api/bank-transactions/BTX-000001/reconcile', deniedUid: FLEET_UID, allowedUid: FINANCE_UID, body: {} },
  { name: 'DELETE /api/tolls/:id', method: 'delete', path: '/api/tolls/TOL-000001', deniedUid: SALES_UID, allowedUid: FINANCE_UID },
  { name: 'PUT /api/fleet/:id', method: 'put', path: '/api/fleet/VEH-0001', deniedUid: SALES_UID, allowedUid: CEO_UID, body: {} },
  { name: 'POST /api/fleet/:id/assign-plate', method: 'post', path: '/api/fleet/VEH-0001/assign-plate', deniedUid: SALES_UID, allowedUid: CEO_UID, body: { plateNumber: 'A 1', plateCity: 'Dubai' } }
];

describe('Phase 6 — financial/fleet route authorization audit', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      it('rejects an authenticated but unauthorized role with 403', async () => {
        const req = request(app)[c.method](c.path).set(authAs(c.deniedUid));
        const res = c.body !== undefined ? await req.send(c.body) : await req;
        expect(res.status).toBe(403);
        expect(res.body.error).toBeTruthy();
      });

      it('rejects an unauthenticated request with 401', async () => {
        const req = request(app)[c.method](c.path);
        const res = c.body !== undefined ? await req.send(c.body) : await req;
        expect(res.status).toBe(401);
      });

      it('does not block an authorized role at the authorization layer', async () => {
        const req = request(app)[c.method](c.path).set(authAs(c.allowedUid));
        const res = c.body !== undefined ? await req.send(c.body) : await req;
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });
  }
});

describe('GET /api/fleet — Firestore source-of-truth read', () => {
  it('returns Firestore vehicles even when the process cache is empty', async () => {
    const vehicle = {
      id: 'VEH-FIRESTORE-ONLY',
      make: 'Mercedes-Benz',
      model: 'G 63',
      status: 'available',
      plateNumber: 'A 12345',
      plateCity: 'Dubai'
    };
    adminMock.store.set('vehicles', new Map([[vehicle.id, vehicle]]));

    const { globalStore } = await import('../src/server/dataStore');
    globalStore.vehicles = [];

    const res = await request(app).get('/api/fleet').set(authAs(CEO_UID));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: vehicle.id, make: vehicle.make, model: vehicle.model });
    expect(globalStore.vehicles).toHaveLength(1);
  });
});
