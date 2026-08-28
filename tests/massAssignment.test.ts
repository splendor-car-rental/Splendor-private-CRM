/**
 * Mass Assignment / ID-Redirection Hardening (Phase 12)
 * =======================================================
 *
 * Several PUT routes built their updated record as `{ ...prev, ...req.body }`
 * without ever re-pinning `id` afterward. Since `req.body` wins over `prev`
 * in that spread, a client that includes an `id` field in the PUT body
 * (whether by a frontend bug that round-trips the whole object, or a
 * deliberate attack) got it silently substituted in: the route still looked
 * up the record via `req.params.id`, but then durably wrote the merged
 * result under the SPOOFED id instead -- overwriting a completely different
 * record's Firestore document with a blend of the original record's fields,
 * the attacker's fields, and whatever collided between them.
 *
 * This suite proves, for every affected route (customers, leads,
 * opportunities, fleet, tasks), that a spoofed `id` in the request body is
 * silently ignored: the response and the durable write both stay pinned to
 * the record named in the URL, and the OTHER record (whose id was spoofed
 * in the body) is completely untouched. It also proves fleet's
 * server-owned computed/audit-trail fields (totalRevenue, plateHistory,
 * lifecycleStatus, etc.) can't be set through the generic vehicle-details
 * PUT.
 *
 * ISOLATION: firebase-admin is fully mocked (same in-memory Firestore
 * simulation as tests/authorization.test.ts) -- no real Firebase project is
 * contacted, and nothing here reads or writes real production data.
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
let globalStore: any;
let adminMock: { verifyIdToken: Mock; usersDb: Map<string, { role: string; name: string }> };

const CEO_UID = 'ceo-uid';

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(CEO_UID, { role: 'ceo', name: 'Test CEO' });

  const serverModule = await import('../server');
  app = serverModule.default;

  const dataStoreModule = await import('../src/server/dataStore');
  globalStore = dataStoreModule.globalStore;
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

describe('PUT /api/customers/:id -- ignores a spoofed id in the body', () => {
  it('keeps the write pinned to the URL id and never touches the spoofed target', async () => {
    globalStore.customers.push(
      { id: 'CUS-TARGET', fullName: 'Victim Customer', phone: '111', lifetimeValue: 999999 } as any,
      { id: 'CUS-SOURCE', fullName: 'Attacker-Controlled Source', phone: '222', lifetimeValue: 0 } as any
    );

    const res = await request(app)
      .put('/api/customers/CUS-SOURCE')
      .set(authAs(CEO_UID))
      .send({ id: 'CUS-TARGET', fullName: 'Overwritten Name', lifetimeValue: 50 });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('CUS-SOURCE');
    expect(res.body.fullName).toBe('Overwritten Name');

    const target = globalStore.customers.find((c: any) => c.id === 'CUS-TARGET');
    expect(target.fullName).toBe('Victim Customer'); // untouched
    expect(target.lifetimeValue).toBe(999999); // untouched

    const source = globalStore.customers.find((c: any) => c.id === 'CUS-SOURCE');
    expect(source.fullName).toBe('Overwritten Name');
    expect(source.lifetimeValue).toBe(0); // server-owned field: client-supplied 50 is ignored
  });
});

describe('PUT /api/leads/:id -- ignores a spoofed id in the body', () => {
  it('keeps the write pinned to the URL id and never touches the spoofed target', async () => {
    globalStore.leads.push(
      { id: 'LEAD-TARGET', fullName: 'Victim Lead' } as any,
      { id: 'LEAD-SOURCE', fullName: 'Source Lead' } as any
    );

    const res = await request(app)
      .put('/api/leads/LEAD-SOURCE')
      .set(authAs(CEO_UID))
      .send({ id: 'LEAD-TARGET', fullName: 'Overwritten Lead' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('LEAD-SOURCE');

    const target = globalStore.leads.find((l: any) => l.id === 'LEAD-TARGET');
    expect(target.fullName).toBe('Victim Lead');
  });
});

describe('PUT /api/opportunities/:id -- ignores a spoofed id in the body', () => {
  it('keeps the write pinned to the URL id and never touches the spoofed target', async () => {
    globalStore.opportunities.push(
      { id: 'OPP-TARGET', title: 'Victim Opportunity' } as any,
      { id: 'OPP-SOURCE', title: 'Source Opportunity' } as any
    );

    const res = await request(app)
      .put('/api/opportunities/OPP-SOURCE')
      .set(authAs(CEO_UID))
      .send({ id: 'OPP-TARGET', title: 'Overwritten Opportunity' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('OPP-SOURCE');

    const target = globalStore.opportunities.find((o: any) => o.id === 'OPP-TARGET');
    expect(target.title).toBe('Victim Opportunity');
  });
});

describe('PUT /api/tasks/:id -- ignores a spoofed id in the body', () => {
  it('keeps the write pinned to the URL id and never touches the spoofed target', async () => {
    globalStore.tasks.push(
      { id: 'TSK-TARGET', title: 'Victim Task' } as any,
      { id: 'TSK-SOURCE', title: 'Source Task' } as any
    );

    const res = await request(app)
      .put('/api/tasks/TSK-SOURCE')
      .set(authAs(CEO_UID))
      .send({ id: 'TSK-TARGET', title: 'Overwritten Task' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('TSK-SOURCE');

    const target = globalStore.tasks.find((t: any) => t.id === 'TSK-TARGET');
    expect(target.title).toBe('Victim Task');
  });
});

describe('PUT /api/fleet/:id -- ignores a spoofed id and server-owned fields', () => {
  it('keeps the write pinned to the URL id, never touches the spoofed target, and ignores computed/audit fields', async () => {
    globalStore.vehicles.push(
      { id: 'VEH-TARGET', make: 'Ferrari', model: 'Victim', totalRevenue: 500000, plateHistory: [{ real: true }] } as any,
      { id: 'VEH-SOURCE', make: 'Bentley', model: 'Source', totalRevenue: 1000, plateHistory: [] } as any
    );

    const res = await request(app)
      .put('/api/fleet/VEH-SOURCE')
      .set(authAs(CEO_UID))
      .send({
        id: 'VEH-TARGET',
        model: 'Renamed',
        totalRevenue: 99999999,
        profitabilityScore: 100,
        lifecycleStatus: 'SOLD',
        plateHistory: [{ fabricated: true }]
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('VEH-SOURCE');
    expect(res.body.model).toBe('Renamed');
    expect(res.body.totalRevenue).toBe(1000); // server-owned: ignored
    expect(res.body.lifecycleStatus).toBeUndefined(); // server-owned: ignored
    expect(res.body.plateHistory).toEqual([]); // server-owned: ignored

    const target = globalStore.vehicles.find((v: any) => v.id === 'VEH-TARGET');
    expect(target.model).toBe('Victim'); // untouched
    expect(target.totalRevenue).toBe(500000); // untouched
  });
});
