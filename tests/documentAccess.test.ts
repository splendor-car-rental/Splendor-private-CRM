/**
 * Customer Document URL Security (Phase 13)
 * ===========================================
 *
 * POST /api/upload previously returned a Firebase Storage signed URL for
 * customer documents (Emirates ID / passport / driving license scans)
 * expiring "01-01-2500" -- a de-facto permanent, unauthenticated public
 * link. Anyone who ever obtained that URL could read the document forever,
 * completely bypassing this app's login system.
 *
 * This suite proves the replacement, GET /api/documents/file (an
 * authenticated proxy that streams the file from Storage itself instead of
 * ever handing out a Storage credential):
 *   - requires a valid session, same as every other /api/* route
 *   - rejects a path outside the two folders POST /api/upload ever writes
 *     to, and any path containing ".." (traversal)
 *   - streams back a file that exists, with its real content type
 *   - returns 404 for a path that doesn't exist in Storage
 *
 * ISOLATION: firebase-admin (including a minimal Storage mock backed by an
 * in-memory Map) is fully mocked -- no real Firebase project or Storage
 * bucket is contacted.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import request from 'supertest';
import { Readable } from 'stream';

vi.mock('firebase-admin', () => {
  const appsArr: any[] = [];
  const verifyIdToken = vi.fn();
  const usersDb = new Map<string, { role: string; name: string }>();
  const firestoreStore = new Map<string, Map<string, any>>();
  const collectionOf = (name: string) => {
    if (!firestoreStore.has(name)) firestoreStore.set(name, new Map());
    return firestoreStore.get(name)!;
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
    delete: async () => { collectionOf(collectionName).delete(id); }
  });
  const firestoreObj: any = {
    collection: (name: string) => ({ doc: (id: string) => makeDocRef(name, id), where: () => firestoreObj.collection(name) }),
    // Needed because POST /api/upload now writes an audit_logs entry
    // (Phase 23.5 — every mutation logs to the immutable audit trail, not
    // just financial routes), which goes through issueNextNumber() ->
    // db.runTransaction(). This suite's original scope (Phase 13) never
    // needed transactions, so this mock never implemented it.
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

  // Minimal in-memory Storage bucket: object name -> { buffer, contentType }.
  const storageStore = new Map<string, { buffer: Buffer; contentType: string }>();
  const makeStorageFile = (name: string) => ({
    save: async (buffer: Buffer, opts?: { metadata?: { contentType?: string } }) => {
      storageStore.set(name, { buffer, contentType: opts?.metadata?.contentType || 'application/octet-stream' });
    },
    exists: async () => [storageStore.has(name)],
    getMetadata: async () => [{ contentType: storageStore.get(name)?.contentType || 'application/octet-stream' }],
    createReadStream: () => Readable.from(storageStore.get(name)?.buffer || Buffer.alloc(0)),
    getSignedUrl: async () => [`https://storage.example.test/${name}?signed=1`]
  });

  const admin: any = {
    apps: appsArr,
    credential: { cert: (x: any) => x },
    initializeApp: () => { appsArr.push({}); },
    auth: () => ({ verifyIdToken }),
    firestore: () => firestoreObj,
    storage: () => ({ bucket: () => ({ file: (name: string) => makeStorageFile(name) }) }),
    __test: { verifyIdToken, usersDb, appsArr, storageStore }
  };

  return { default: admin };
});

let app: any;
let adminMock: { verifyIdToken: Mock; usersDb: Map<string, { role: string; name: string }>; storageStore: Map<string, any> };

const STAFF_UID = 'staff-uid';

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(STAFF_UID, { role: 'operations', name: 'Test Staff' });

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

describe('GET /api/documents/file -- authenticated proxy', () => {
  it('rejects an unauthenticated request with 401 (same as every other /api/* route)', async () => {
    const res = await request(app).get('/api/documents/file').query({ path: 'customer-documents/CUS-0001/id.pdf' });
    expect(res.status).toBe(401);
  });

  it('rejects a path outside the allowed upload folders', async () => {
    const res = await request(app)
      .get('/api/documents/file')
      .set(authAs(STAFF_UID))
      .query({ path: 'some-other-bucket-prefix/secret.json' });
    expect(res.status).toBe(400);
  });

  it('rejects a path traversal attempt', async () => {
    const res = await request(app)
      .get('/api/documents/file')
      .set(authAs(STAFF_UID))
      .query({ path: 'customer-documents/../../secrets.env' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a path that does not exist in Storage', async () => {
    const res = await request(app)
      .get('/api/documents/file')
      .set(authAs(STAFF_UID))
      .query({ path: 'customer-documents/CUS-9999/does-not-exist.pdf' });
    expect(res.status).toBe(404);
  });

  it('streams back an uploaded document with its real content type, to an authenticated caller', async () => {
    const uploadRes = await request(app)
      .post('/api/upload')
      .set(authAs(STAFF_UID))
      .send({
        folder: 'customer-documents',
        fileName: 'emirates-id.pdf',
        fileType: 'application/pdf',
        dataBase64: Buffer.from('%PDF-1.4 fake id scan contents').toString('base64'),
        customerId: 'CUS-0001'
      });
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.url).toMatch(/^\/api\/documents\/file\?path=/);
    expect(uploadRes.body.url).not.toMatch(/storage\.googleapis\.com|X-Goog-Signature|GoogleAccessId/i);

    const fileRes = await request(app)
      .get('/api/documents/file')
      .set(authAs(STAFF_UID))
      .query({ path: uploadRes.body.path });

    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-type']).toMatch(/application\/pdf/);
    expect(Buffer.isBuffer(fileRes.body) ? fileRes.body.toString('utf8') : fileRes.text).toBe('%PDF-1.4 fake id scan contents');
  });

  it('a different authenticated staff member (not just the uploader) can also read the document', async () => {
    const otherUid = 'other-staff-uid';
    adminMock.usersDb.set(otherUid, { role: 'finance', name: 'Other Staff' });

    const uploadRes = await request(app)
      .post('/api/upload')
      .set(authAs(STAFF_UID))
      .send({
        folder: 'customer-documents',
        fileName: 'license.pdf',
        fileType: 'application/pdf',
        dataBase64: Buffer.from('license-scan-bytes').toString('base64'),
        customerId: 'CUS-0002'
      });

    const fileRes = await request(app)
      .get('/api/documents/file')
      .set(authAs(otherUid))
      .query({ path: uploadRes.body.path });

    expect(fileRes.status).toBe(200);
    expect(Buffer.isBuffer(fileRes.body) ? fileRes.body.toString('utf8') : fileRes.text).toBe('license-scan-bytes');
  });
});
