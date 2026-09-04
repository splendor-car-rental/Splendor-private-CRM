/**
 * Regression test for a live production bug: PATCH
 * /api/notification-configs/:eventKey (and the customer-facing equivalent)
 * 404'd with "Unknown notification event" for event keys that are very much
 * real and current in src/config/notificationEvents.ts -- reproduced live
 * for customer_created, customer_blocklisted, and customer_document_expiring.
 *
 * Root cause: hydrateStoreFromFirestore() blindly replaced
 * globalStore.notificationEventConfigs / customerNotificationConfigs with
 * whatever was in the persisted Firestore collection, discarding any event
 * key that exists in the current NOTIFICATION_EVENTS / CUSTOMER_NOTIFICATION_EVENTS
 * definitions but wasn't yet in Firestore (e.g. because it was added to the
 * CRM after the collection was first written). This is the same failure
 * mode the customFields/numberingConfigs/paymentMethods collections were
 * already special-cased against, just not extended to these two.
 *
 * ISOLATION: firebase-admin is fully mocked (same in-memory pattern as
 * tests/tollImportSecurity.test.ts) -- no real Firebase project is contacted.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const appsArr: any[] = [];
  const store = new Map<string, Map<string, any>>();
  const collectionOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  const makeCollectionRef = (name: string): any => ({
    doc: (id: string) => ({
      id,
      get: async () => {
        const data = collectionOf(name).get(id);
        return { exists: data !== undefined, data: () => data, id };
      }
    }),
    get: async () => {
      const col = collectionOf(name);
      const docs = Array.from(col.entries()).map(([id, data]) => ({ id, data: () => data }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
  });

  const firestoreObj: any = {
    collection: (name: string) => makeCollectionRef(name)
  };

  const admin: any = {
    apps: appsArr,
    credential: { cert: (x: any) => x },
    initializeApp: (_opts: any) => {
      appsArr.push({});
    },
    auth: () => ({ verifyIdToken: () => Promise.reject(new Error('not used in this test')) }),
    firestore: () => firestoreObj,
    storage: () => ({ bucket: () => ({ file: () => ({}) }) }),
    __test: { store }
  };

  return { default: admin };
});

let hydrateStoreFromFirestore: () => Promise<void>;
let globalStore: any;
let adminStore: Map<string, Map<string, any>>;

beforeAll(async () => {
  process.env.VERCEL = '1'; // skip app.listen()/Vite dev middleware
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}'; // any parseable JSON -- admin.initializeApp is mocked

  const adminModule = await import('firebase-admin');
  adminStore = (adminModule.default as any).__test.store;

  // Seed a stale Firestore snapshot BEFORE server.ts (and its fire-and-forget
  // boot hydration) is imported: only two of the many real event keys, one
  // of them with a real staff assignment and a non-default `enabled: false`,
  // simulating "this collection was written a while ago, before newer
  // events like customer_document_expiring existed."
  const notifCol = new Map<string, any>();
  notifCol.set('customer_created', {
    eventKey: 'customer_created', enabled: false, broadcastToGroup: true, staffRecipientIds: ['USR-999']
  });
  notifCol.set('contract_created', {
    eventKey: 'contract_created', enabled: true, broadcastToGroup: false, staffRecipientIds: []
  });
  adminStore.set('notification_event_configs', notifCol);

  const custNotifCol = new Map<string, any>();
  custNotifCol.set('customer_payment_receipt', { eventKey: 'customer_payment_receipt', enabled: false });
  adminStore.set('customer_notification_configs', custNotifCol);

  const serverModule = await import('../server');
  hydrateStoreFromFirestore = serverModule.hydrateStoreFromFirestore;

  const dataStoreModule = await import('../src/server/dataStore');
  globalStore = dataStoreModule.globalStore;
});

afterAll(() => {
  delete process.env.VERCEL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
});

describe('notification config hydration backfill', () => {
  it('backfills every current NOTIFICATION_EVENTS key even when Firestore only has a stale subset', async () => {
    await hydrateStoreFromFirestore();

    const { NOTIFICATION_EVENTS } = await import('../src/config/notificationEvents');
    const keys = globalStore.notificationEventConfigs.map((c: any) => c.eventKey);

    // Every currently-defined event must have a config row -- this is
    // exactly what PATCH /api/notification-configs/:eventKey looks up, and
    // a missing one is the live "Unknown notification event" 404.
    for (const def of NOTIFICATION_EVENTS) {
      expect(keys).toContain(def.key);
    }
    expect(new Set(keys).size).toBe(NOTIFICATION_EVENTS.length);
  });

  it('preserves the persisted state for a key that already existed in Firestore', async () => {
    await hydrateStoreFromFirestore();

    const existing = globalStore.notificationEventConfigs.find((c: any) => c.eventKey === 'customer_created');
    expect(existing).toBeDefined();
    expect(existing.enabled).toBe(false);
    expect(existing.broadcastToGroup).toBe(true);
    expect(existing.staffRecipientIds).toEqual(['USR-999']);
  });

  it('backfills a newer key not present in Firestore with safe defaults', async () => {
    await hydrateStoreFromFirestore();

    const backfilled = globalStore.notificationEventConfigs.find((c: any) => c.eventKey === 'customer_document_expiring');
    expect(backfilled).toBeDefined();
    expect(backfilled.enabled).toBe(true);
    expect(backfilled.broadcastToGroup).toBe(false);
    expect(backfilled.staffRecipientIds).toEqual([]);
  });

  it('applies the same backfill-merge to customerNotificationConfigs', async () => {
    await hydrateStoreFromFirestore();

    const { CUSTOMER_NOTIFICATION_EVENTS } = await import('../src/config/notificationEvents');
    const keys = globalStore.customerNotificationConfigs.map((c: any) => c.eventKey);
    for (const def of CUSTOMER_NOTIFICATION_EVENTS) {
      expect(keys).toContain(def.key);
    }

    const preserved = globalStore.customerNotificationConfigs.find((c: any) => c.eventKey === 'customer_payment_receipt');
    expect(preserved.enabled).toBe(false);

    const backfilled = globalStore.customerNotificationConfigs.find((c: any) => c.eventKey === 'lto_settlement');
    expect(backfilled.enabled).toBe(true);
  });
});
