/**
 * WhatsApp Cloud API Webhook Hardening (Phase 10)
 * ================================================
 *
 * Before this remediation, POST /api/whatsapp/webhook was (a) silently
 * unreachable in production -- it sat behind the same requireAuth gate as
 * every other /api/* route, and Meta's servers never carry a Firebase ID
 * token, so every real delivery 401'd -- and (b) even if reachable, had no
 * signature verification at all, so exempting it from requireAuth would
 * have made it genuinely public. This suite proves:
 *   - the GET handshake still requires the correct hub.verify_token
 *   - the route is NOT blocked by requireAuth (no Authorization header
 *     needed) once past the signature check
 *   - a POST with a missing/invalid X-Hub-Signature-256 is rejected (403)
 *     and never touches Firestore
 *   - a POST with a VALID signature is accepted, durably persisted, and
 *     acknowledged with 200
 *   - a retried delivery of the SAME message id is a safe no-op (no
 *     duplicate document), matching Meta's own retry-on-anything-but-200
 *     behavior
 *
 * ISOLATION: firebase-admin is fully mocked (no real Firebase project is
 * contacted); WHATSAPP_APP_SECRET is a throwaway test value.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

const TEST_APP_SECRET = 'test-whatsapp-app-secret';
const TEST_VERIFY_TOKEN = 'test-verify-token';

vi.mock('firebase-admin', () => {
  const appsArr: any[] = [];
  const verifyIdToken = vi.fn();
  const store = new Map<string, Map<string, any>>();
  const collectionOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  const makeDocRef = (collectionName: string, id: string) => ({
    id,
    __collection: collectionName,
    get: async () => {
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
      return {
        set: () => {},
        create: () => {},
        delete: () => {},
        commit: async () => { ops.forEach((op) => op()); }
      };
    },
    runTransaction: async (fn: any) => {
      const tx = {
        get: async (refOrQuery: any) => refOrQuery.get(),
        set: () => {},
        create: () => {},
        delete: () => {}
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
    __test: { verifyIdToken, appsArr, store }
  };

  return { default: admin };
});

let app: any;
let adminMock: { appsArr: any[]; store: Map<string, Map<string, any>> };

function signedRequest(bodyObj: unknown, secret: string | null = TEST_APP_SECRET) {
  const raw = JSON.stringify(bodyObj);
  const req = request(app).post('/api/whatsapp/webhook').set('Content-Type', 'application/json');
  if (secret) {
    const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    req.set('X-Hub-Signature-256', signature);
  }
  return req.send(raw);
}

function inboundMessagePayload(messageId: string, from = '971501112222', body = 'Hello Splendor') {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{ id: messageId, from, type: 'text', text: { body } }]
        }
      }]
    }]
  };
}

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';
  process.env.WHATSAPP_APP_SECRET = TEST_APP_SECRET;
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;

  const serverModule = await import('../server');
  app = serverModule.default;
});

afterAll(() => {
  delete process.env.VERCEL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
});

beforeEach(() => {
  adminMock.store.get('whatsapp_inbound_events')?.clear();
});

describe('GET /api/whatsapp/webhook -- subscription handshake', () => {
  it('echoes hub.challenge when hub.verify_token matches', async () => {
    const res = await request(app)
      .get('/api/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': TEST_VERIFY_TOKEN, 'hub.challenge': 'abc123' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
  });

  it('rejects an incorrect hub.verify_token with 403', async () => {
    const res = await request(app)
      .get('/api/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'abc123' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/whatsapp/webhook -- not blocked by session auth', () => {
  it('is reachable with NO Authorization header at all (Meta never sends one)', async () => {
    const res = await signedRequest(inboundMessagePayload('wamid.NOAUTH1'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/whatsapp/webhook -- signature verification', () => {
  it('rejects a delivery with no X-Hub-Signature-256 header at all', async () => {
    const raw = JSON.stringify(inboundMessagePayload('wamid.NOSIG'));
    const res = await request(app).post('/api/whatsapp/webhook').set('Content-Type', 'application/json').send(raw);
    expect(res.status).toBe(403);
    expect(adminMock.store.get('whatsapp_inbound_events')?.size ?? 0).toBe(0);
  });

  it('rejects a delivery signed with the WRONG secret', async () => {
    const res = await signedRequest(inboundMessagePayload('wamid.WRONGSIG'), 'not-the-real-secret');
    expect(res.status).toBe(403);
    expect(adminMock.store.get('whatsapp_inbound_events')?.size ?? 0).toBe(0);
  });

  it('rejects a delivery whose body was tampered with after signing', async () => {
    const raw = JSON.stringify(inboundMessagePayload('wamid.TAMPERED'));
    const signature = 'sha256=' + crypto.createHmac('sha256', TEST_APP_SECRET).update(raw).digest('hex');
    const tamperedRaw = JSON.stringify(inboundMessagePayload('wamid.TAMPERED', '971500000000', 'attacker-modified body'));
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(tamperedRaw);
    expect(res.status).toBe(403);
  });

  it('accepts a delivery with a valid signature and persists it durably', async () => {
    const res = await signedRequest(inboundMessagePayload('wamid.VALID1', '971501112222', 'Booking question'));
    expect(res.status).toBe(200);
    const stored = adminMock.store.get('whatsapp_inbound_events')?.get('msg_wamid.VALID1');
    expect(stored).toBeTruthy();
    expect(stored.phone).toBe('971501112222');
    expect(stored.body).toBe('Booking question');
    expect(stored.direction).toBe('inbound');
  });
});

describe('POST /api/whatsapp/webhook -- duplicate-delivery idempotency', () => {
  it('does not create a second record when Meta retries the same message id', async () => {
    const first = await signedRequest(inboundMessagePayload('wamid.RETRY1'));
    expect(first.status).toBe(200);
    const second = await signedRequest(inboundMessagePayload('wamid.RETRY1'));
    expect(second.status).toBe(200);

    const col = adminMock.store.get('whatsapp_inbound_events');
    const matching = Array.from(col?.keys() ?? []).filter(k => k === 'msg_wamid.RETRY1');
    expect(matching.length).toBe(1);
  });
});

describe('POST /api/whatsapp/webhook -- status updates', () => {
  it('persists a delivery-status event keyed by message id + status', async () => {
    const payload = {
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.SENT1', status: 'delivered', recipient_id: '971501112222' }] } }] }]
    };
    const res = await signedRequest(payload);
    expect(res.status).toBe(200);
    const stored = adminMock.store.get('whatsapp_inbound_events')?.get('status_wamid.SENT1_delivered');
    expect(stored).toBeTruthy();
    expect(stored.status).toBe('delivered');
  });
});
