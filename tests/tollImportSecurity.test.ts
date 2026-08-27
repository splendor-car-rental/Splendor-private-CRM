/**
 * Salik/Darb Toll Import — Security Mitigation Test Suite (TEST 01–10)
 * =====================================================================
 *
 * Covers the hardening added to POST /api/tolls/import in server.ts:
 *   - role restriction (requireRole('ceo', 'admin', 'finance'))
 *   - a server-side file-size cap enforced BEFORE parsing
 *   - magic-byte file-type validation (src/server/tollImportGuard.ts)
 *     enforced BEFORE parsing
 *   - the existing preview-before-confirm flow, unchanged
 *
 * This does NOT test xlsx@0.18.5 itself for the Prototype Pollution/ReDoS
 * advisories it carries -- that library is intentionally unchanged by this
 * pass (see the comment above the route in server.ts). These tests only
 * prove the mitigations layered in front of it behave correctly.
 *
 * ISOLATION: firebase-admin is fully mocked below (no real Firebase project
 * is contacted), and every test that touches globalStore only asserts on
 * the delta in array length caused by its own request, snapshotted
 * immediately before that request. Nothing here reads or writes real
 * production data or a real Firestore project.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------
// Mock firebase-admin BEFORE server.ts (imported dynamically below) can
// see it. vitest hoists vi.mock calls to the top of the module, so this
// applies regardless of where it's written relative to imports.
// ---------------------------------------------------------------------
vi.mock('firebase-admin', () => {
  const appsArr: any[] = [];
  const verifyIdToken = vi.fn();
  const usersDb = new Map<string, { role: string; name: string }>();

  const admin: any = {
    apps: appsArr,
    credential: { cert: (x: any) => x },
    initializeApp: (_opts: any) => {
      appsArr.push({});
    },
    auth: () => ({ verifyIdToken }),
    firestore: () => ({
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            if (name === 'users') {
              const u = usersDb.get(id);
              return { exists: !!u, data: () => u };
            }
            return { exists: false, data: () => undefined };
          },
          set: async () => {}
        }),
        // Collection-level get(), used by hydrateStoreFromFirestore() at
        // module load -- returns an empty snapshot for every collection so
        // startup hydration is a harmless no-op in this test process.
        get: async () => ({ docs: [] })
      }),
      batch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} })
    }),
    storage: () => ({ bucket: () => ({ file: () => ({}) }) }),
    __test: { verifyIdToken, usersDb, appsArr }
  };

  return { default: admin };
});

let app: any;
let globalStore: any;
let adminMock: { verifyIdToken: Mock; usersDb: Map<string, { role: string; name: string }> };

const CEO_UID = 'ceo-uid';
const FINANCE_UID = 'finance-uid';
const SALES_UID = 'sales-uid'; // provisioned, but not an authorized role for toll import

beforeAll(async () => {
  process.env.VERCEL = '1'; // skip app.listen()/Vite dev middleware
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}'; // any parseable JSON -- admin.initializeApp is mocked

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(CEO_UID, { role: 'ceo', name: 'Test CEO' });
  adminMock.usersDb.set(FINANCE_UID, { role: 'finance', name: 'Test Finance' });
  adminMock.usersDb.set(SALES_UID, { role: 'sales', name: 'Test Sales' });

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

/** A real, parseable Salik "Trips Report" workbook -- built with the same
 * xlsx library the app uses, so this is a faithful fixture, not a mock of
 * the parser itself. */
function buildValidSalikXlsxBase64(): string {
  const aoa = [
    ['Salik Trips Report'],
    ['Account No: 123456'],
    ['Trip(s) From 01-01-2026 To 02-01-2026'],
    ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount'],
    ['TXN001', '01-Jan-2026', '10:00:00 AM', 'Al Garhoud Bridge', 'Dubai', 'TAG001', 'A12345', '4'],
    ['TXN002', '02-Jan-2026', '11:00:00 AM', 'Al Maktoum Bridge', 'Sharjah', 'TAG002', 'B67890', '4']
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Trips');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf.toString('base64');
}

/** Valid ZIP/OOXML magic bytes (passes the pre-parse file-kind gate) but a
 * corrupt body, so XLSX.read() itself throws once it actually runs. */
function buildMalformedXlsxBase64(): string {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('this-is-not-a-real-zip-central-directory-garbage-data')
  ]).toString('base64');
}

describe('TEST 01 — authorized (finance) role can import a valid Salik file', () => {
  it('returns a preview for a provisioned finance-role user', async () => {
    const res = await request(app)
      .post('/api/tolls/import')
      .set(authAs(FINANCE_UID))
      .send({ type: 'salik', fileName: 'trips.xlsx', fileBase64: buildValidSalikXlsxBase64() });

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.transactions.length).toBe(2);
  });
});

describe('TEST 02 — authenticated but unauthorized role is denied', () => {
  it('rejects a provisioned sales-role user with a deterministic 403', async () => {
    const res = await request(app)
      .post('/api/tolls/import')
      .set(authAs(SALES_UID))
      .send({ type: 'salik', fileName: 'trips.xlsx', fileBase64: buildValidSalikXlsxBase64() });

    expect(res.status).toBe(403);
    expect(res.body.error).toBeTruthy();
  });
});

describe('TEST 03 — unauthenticated request is denied', () => {
  it('rejects a request with no Authorization header with a deterministic 401', async () => {
    const res = await request(app)
      .post('/api/tolls/import')
      .send({ type: 'salik', fileName: 'trips.xlsx', fileBase64: buildValidSalikXlsxBase64() });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });
});

describe('TEST 04 — oversized file is rejected before parser execution', () => {
  it('rejects a file above the configured cap with the size-limit error, not a parser error', async () => {
    const { TOLL_IMPORT_MAX_FILE_BYTES } = await import('../src/server/tollImportGuard');
    const oversized = Buffer.alloc(TOLL_IMPORT_MAX_FILE_BYTES + 1024, 0);

    const res = await request(app)
      .post('/api/tolls/import')
      .set(authAs(FINANCE_UID))
      .send({ type: 'salik', fileName: 'huge.xlsx', fileBase64: oversized.toString('base64') });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/i);
  });
});

describe('TEST 05 — unsupported file type is rejected safely', () => {
  it('rejects a plain-text payload with a controlled error, without attempting to parse it', async () => {
    const notAFile = Buffer.from('just some plain text, not a spreadsheet or a PDF at all');

    const res = await request(app)
      .post('/api/tolls/import')
      .set(authAs(FINANCE_UID))
      .send({ type: 'salik', fileName: 'notes.txt', fileBase64: notAFile.toString('base64') });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported|unrecognized/i);
  });
});

describe('TEST 06 — malformed XLSX produces a controlled error, not a crash', () => {
  it('rejects a corrupt-but-magic-byte-valid file with a JSON error and no stack trace', async () => {
    const res = await request(app)
      .post('/api/tolls/import')
      .set(authAs(FINANCE_UID))
      .send({ type: 'salik', fileName: 'corrupt.xlsx', fileBase64: buildMalformedXlsxBase64() });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error).not.toMatch(/at Object\.|\.ts:\d+|\.js:\d+/); // no stack-trace-shaped text leaked
  });
});

describe('TEST 07 — preview does not mutate the store', () => {
  it('leaves tollTransactions/tollImportBatches untouched when confirm is not set', async () => {
    const beforeTx = globalStore.tollTransactions.length;
    const beforeBatches = globalStore.tollImportBatches.length;

    const res = await request(app)
      .post('/api/tolls/import')
      .set(authAs(FINANCE_UID))
      .send({ type: 'salik', fileName: 'trips.xlsx', fileBase64: buildValidSalikXlsxBase64() });

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(globalStore.tollTransactions.length).toBe(beforeTx);
    expect(globalStore.tollImportBatches.length).toBe(beforeBatches);
  });
});

describe('TEST 08 — confirmed import preserves the existing behavior', () => {
  it('persists exactly the parsed rows to globalStore when confirm=true', async () => {
    const beforeTx = globalStore.tollTransactions.length;
    const beforeBatches = globalStore.tollImportBatches.length;

    const res = await request(app)
      .post('/api/tolls/import')
      .set(authAs(FINANCE_UID))
      .send({ type: 'salik', fileName: 'trips.xlsx', fileBase64: buildValidSalikXlsxBase64(), confirm: true });

    expect(res.status).toBe(201);
    expect(res.body.preview).toBe(false);
    expect(globalStore.tollTransactions.length).toBe(beforeTx + 2);
    expect(globalStore.tollImportBatches.length).toBe(beforeBatches + 1);
  });
});

describe('TEST 09 — parser failure leaves no partial persistence', () => {
  it('does not touch the store when the file fails to parse, even with confirm=true', async () => {
    const beforeTx = globalStore.tollTransactions.length;
    const beforeBatches = globalStore.tollImportBatches.length;

    const res = await request(app)
      .post('/api/tolls/import')
      .set(authAs(FINANCE_UID))
      .send({ type: 'salik', fileName: 'corrupt.xlsx', fileBase64: buildMalformedXlsxBase64(), confirm: true });

    expect(res.status).toBe(400);
    expect(globalStore.tollTransactions.length).toBe(beforeTx);
    expect(globalStore.tollImportBatches.length).toBe(beforeBatches);
  });
});

describe('TEST 10 — existing toll functionality is unaffected (regression)', () => {
  it('GET /api/tolls reflects a confirmed import end-to-end, same as before this change', async () => {
    const importRes = await request(app)
      .post('/api/tolls/import')
      .set(authAs(FINANCE_UID))
      .send({ type: 'salik', fileName: 'trips.xlsx', fileBase64: buildValidSalikXlsxBase64(), confirm: true });
    expect(importRes.status).toBe(201);

    const listRes = await request(app).get('/api/tolls').set(authAs(FINANCE_UID));
    expect(listRes.status).toBe(200);
    const importedIds = new Set(importRes.body.transactions.map((t: any) => t.id));
    const found = listRes.body.filter((t: any) => importedIds.has(t.id));
    expect(found.length).toBe(importRes.body.transactions.length);
  });
});
