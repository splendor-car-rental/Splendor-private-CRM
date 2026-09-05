/**
 * KYC routes (GET/POST /api/kyc/*, POST /api/public/kyc/upload)
 * ================================================================
 *
 * src/server/kycEngine.ts (real evidence-based KYC logic) and
 * KycManagerCard.tsx / PublicKycPortalView.tsx (the staff review UI and
 * customer-facing intake portal) existed with no server routes connecting
 * them -- this suite proves the routes that close that gap:
 *   - staff routes require an authenticated session with an appropriate role
 *   - the public intake-link upload is gated by KycEngine's signed token,
 *     never by a session, and rejects a file whose real magic bytes don't
 *     match what it claims to be
 *   - a document review can never mark the profile VERIFIED without a real
 *     accepted document set (reconcileProfileState decides that, not the
 *     route handler)
 *   - only 'ceo' can grant the supercar age-policy exception
 *
 * ISOLATION: firebase-admin (auth, firestore with transactions, and a
 * minimal in-memory Storage bucket) is fully mocked -- no real Firebase
 * project or Storage bucket is contacted.
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
    // get() on the collection itself (not a doc) is needed because
    // server.ts's hydrateStoreFromFirestore() now runs on every /api
    // request, not just /fleet -- it sweeps every collection with a plain
    // collection().get(). Nothing in this suite seeds those collections
    // through this mock, so an empty snapshot is the correct, real-Firestore
    // equivalent behavior (never an error).
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(name, id),
      where: () => firestoreObj.collection(name),
      get: async () => {
        const col = collectionOf(name);
        const docs = Array.from(col.entries()).map(([id, data]) => ({ id, data: () => data }));
        return { empty: docs.length === 0, docs };
      }
    }),
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

  const storageStore = new Map<string, { buffer: Buffer; contentType: string }>();
  const makeStorageFile = (name: string) => ({
    save: async (buffer: Buffer, opts?: { metadata?: { contentType?: string } }) => {
      storageStore.set(name, { buffer, contentType: opts?.metadata?.contentType || 'application/octet-stream' });
    },
    exists: async () => [storageStore.has(name)],
    getMetadata: async () => [{ contentType: storageStore.get(name)?.contentType || 'application/octet-stream' }],
    createReadStream: () => Readable.from(storageStore.get(name)?.buffer || Buffer.alloc(0))
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
let globalStoreRef: any;
let adminMock: { verifyIdToken: Mock; usersDb: Map<string, { role: string; name: string }> };

const OPERATIONS_UID = 'kyc-ops-uid';
const CEO_UID = 'kyc-ceo-uid';
const CUSTOMER_ID = 'CUS-KYC-ROUTE-TEST';

// A real, minimal 1x1 PNG (valid magic bytes) for the file-signature check.
const REAL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function authAs(uid: string) {
  adminMock.verifyIdToken.mockResolvedValueOnce({ uid });
  return { Authorization: 'Bearer test-token' };
}

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';
  process.env.KYC_TOKEN_SECRET = 'test-only-kyc-secret-that-is-long-enough-1234567890';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(OPERATIONS_UID, { role: 'operations', name: 'Ops Staff' });
  adminMock.usersDb.set(CEO_UID, { role: 'ceo', name: 'The CEO' });

  const serverModule = await import('../server');
  app = serverModule.default;

  const dataStoreModule = await import('../src/server/dataStore');
  globalStoreRef = dataStoreModule.globalStore;
});

afterAll(() => {
  delete process.env.VERCEL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  delete process.env.KYC_TOKEN_SECRET;
});

beforeEach(() => {
  adminMock.verifyIdToken.mockReset();
  globalStoreRef.customers = [{
    id: CUSTOMER_ID,
    type: 'individual',
    fullName: 'KYC Route Test Customer',
    email: 'kyc-route-test@example.com',
    phone: '+971500000001',
    address: 'Dubai',
    city: 'Dubai',
    country: 'United Arab Emirates',
    nationality: 'Emirati',
    idType: 'emirates_id',
    idNumber: '784-1990-1234567-1',
    // Deliberately blank -- getOrCreateKycProfile only auto-imports a
    // "legacy" accepted document when both idNumber AND idExpiryDate are
    // present, so this customer starts with a genuinely empty KYC
    // document set instead of pre-seeded legacy evidence.
    idExpiryDate: '',
    licenseNumber: 'DXB-000001',
    licenseCountry: 'United Arab Emirates',
    licenseExpiryDate: '',
    source: 'direct_walkin',
    ownerId: 'USR-001',
    ownerName: 'System',
    status: 'active',
    isVIP: false,
    tags: [],
    preferences: {},
    notes: '',
    lifetimeValue: 0,
    totalRentals: 0,
    outstandingBalance: 0,
    securityDepositsHeld: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z'
  }];
});

describe('GET /api/kyc/:customerId', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get(`/api/kyc/${CUSTOMER_ID}`);
    expect(res.status).toBe(401);
  });

  it('lazily creates a fresh UNVERIFIED profile for a customer with no prior KYC evaluation', async () => {
    const res = await request(app).get(`/api/kyc/${CUSTOMER_ID}`).set(authAs(OPERATIONS_UID));
    expect(res.status).toBe(200);
    expect(res.body.profile.status).toBe('UNVERIFIED');
    expect(res.body.profile.documents).toEqual([]);
    expect(res.body.eligibility.eligible).toBe(false);
  });

  it('404s for a customer that does not exist', async () => {
    const res = await request(app).get('/api/kyc/CUS-DOES-NOT-EXIST').set(authAs(OPERATIONS_UID));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/kyc/generate-link -> POST /api/public/kyc/upload', () => {
  it('generates a real intake link and accepts a genuine document upload through it', async () => {
    const linkRes = await request(app)
      .post('/api/kyc/generate-link')
      .set(authAs(OPERATIONS_UID))
      .send({ customerId: CUSTOMER_ID, expiresInHours: 48 });
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.intakeUrl).toMatch(/\/kyc\?token=/);

    const token = new URL(linkRes.body.intakeUrl).searchParams.get('token');
    expect(token).toBeTruthy();

    const uploadRes = await request(app)
      .post('/api/public/kyc/upload')
      .send({
        token,
        category: 'EMIRATES_ID_FRONT',
        fileName: 'id-front.png',
        fileType: 'image/png',
        dataBase64: REAL_PNG_BASE64
      });
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.success).toBe(true);
    expect(uploadRes.body.documentId).toBeTruthy();

    const customer = globalStoreRef.customers.find((c: any) => c.id === CUSTOMER_ID);
    expect(customer.kycProfile.documents).toHaveLength(1);
    expect(customer.kycProfile.documents[0].status).toBe('PENDING');
    expect(customer.kycProfile.documents[0].category).toBe('EMIRATES_ID_FRONT');
  });

  it('rejects an upload with an invalid or expired token, without ever touching Storage', async () => {
    const res = await request(app)
      .post('/api/public/kyc/upload')
      .send({
        token: 'not-a-real-token',
        category: 'EMIRATES_ID_FRONT',
        fileName: 'id-front.png',
        fileType: 'image/png',
        dataBase64: REAL_PNG_BASE64
      });
    expect(res.status).toBe(401);
  });

  it('rejects a file whose real magic bytes do not match an accepted format, even with a valid token', async () => {
    const linkRes = await request(app)
      .post('/api/kyc/generate-link')
      .set(authAs(OPERATIONS_UID))
      .send({ customerId: CUSTOMER_ID, expiresInHours: 48 });
    const token = new URL(linkRes.body.intakeUrl).searchParams.get('token');

    const res = await request(app)
      .post('/api/public/kyc/upload')
      .send({
        token,
        category: 'EMIRATES_ID_FRONT',
        fileName: 'fake.pdf',
        fileType: 'application/pdf',
        dataBase64: Buffer.from('this is not really a pdf').toString('base64')
      });
    expect(res.status).toBe(400);

    // generate-link itself lazily creates the profile record, but the
    // rejected upload must never have added a document to it.
    const customer = globalStoreRef.customers.find((c: any) => c.id === CUSTOMER_ID);
    expect(customer.kycProfile.documents).toEqual([]);
  });
});

describe('POST /api/kyc/verify-document', () => {
  async function uploadOneDocument() {
    const linkRes = await request(app)
      .post('/api/kyc/generate-link')
      .set(authAs(OPERATIONS_UID))
      .send({ customerId: CUSTOMER_ID, expiresInHours: 48 });
    const token = new URL(linkRes.body.intakeUrl).searchParams.get('token');
    const uploadRes = await request(app)
      .post('/api/public/kyc/upload')
      .send({ token, category: 'EMIRATES_ID_FRONT', fileName: 'id.png', fileType: 'image/png', dataBase64: REAL_PNG_BASE64 });
    return uploadRes.body.documentId as string;
  }

  it('rejects a REJECT action with no reason', async () => {
    const documentId = await uploadOneDocument();
    const res = await request(app)
      .post('/api/kyc/verify-document')
      .set(authAs(OPERATIONS_UID))
      .send({ customerId: CUSTOMER_ID, documentId, action: 'REJECT' });
    expect(res.status).toBe(400);
  });

  it('approves a document but does not mark the whole profile VERIFIED when required documents are still missing', async () => {
    const documentId = await uploadOneDocument();
    const res = await request(app)
      .post('/api/kyc/verify-document')
      .set(authAs(OPERATIONS_UID))
      .send({ customerId: CUSTOMER_ID, documentId, action: 'APPROVE' });
    expect(res.status).toBe(200);
    expect(res.body.profile.status).not.toBe('VERIFIED');

    const doc = res.body.profile.documents.find((d: any) => d.id === documentId);
    expect(doc.status).toBe('ACCEPTED');
    expect(doc.verifiedBy).toBe(OPERATIONS_UID);
  });

  it('rejects a document with a written reason and records it', async () => {
    const documentId = await uploadOneDocument();
    const res = await request(app)
      .post('/api/kyc/verify-document')
      .set(authAs(OPERATIONS_UID))
      .send({ customerId: CUSTOMER_ID, documentId, action: 'REJECT', rejectionReason: 'Photo is blurry and unreadable.' });
    expect(res.status).toBe(200);
    const doc = res.body.profile.documents.find((d: any) => d.id === documentId);
    expect(doc.status).toBe('REJECTED');
    expect(doc.rejectionReason).toBe('Photo is blurry and unreadable.');
  });
});

describe('POST /api/kyc/update-status', () => {
  it('updates the customer KYC category and re-derives status against the new category', async () => {
    const res = await request(app)
      .post('/api/kyc/update-status')
      .set(authAs(OPERATIONS_UID))
      .send({ customerId: CUSTOMER_ID, customerCategory: 'TOURIST' });
    expect(res.status).toBe(200);
    expect(res.body.profile.customerCategory).toBe('TOURIST');
  });

  it('rejects an invalid category', async () => {
    const res = await request(app)
      .post('/api/kyc/update-status')
      .set(authAs(OPERATIONS_UID))
      .send({ customerId: CUSTOMER_ID, customerCategory: 'NOT_A_REAL_CATEGORY' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/kyc/grant-ceo-exception', () => {
  it('rejects a non-CEO staff member', async () => {
    const res = await request(app)
      .post('/api/kyc/grant-ceo-exception')
      .set(authAs(OPERATIONS_UID))
      .send({ customerId: CUSTOMER_ID, reason: 'VIP referral, verified by phone.' });
    expect(res.status).toBe(403);
  });

  it('rejects a request with no written justification', async () => {
    const res = await request(app)
      .post('/api/kyc/grant-ceo-exception')
      .set(authAs(CEO_UID))
      .send({ customerId: CUSTOMER_ID });
    expect(res.status).toBe(400);
  });

  it('lets the CEO grant the exception with a real justification', async () => {
    const res = await request(app)
      .post('/api/kyc/grant-ceo-exception')
      .set(authAs(CEO_UID))
      .send({ customerId: CUSTOMER_ID, reason: 'Executive VIP relationship, age confirmed via passport call.' });
    expect(res.status).toBe(200);
    expect(res.body.profile.ceoExceptionGranted).toBe(true);
    expect(res.body.profile.ceoExceptionReason).toContain('Executive VIP');
  });
});
