/**
 * Tax/VAT Governance -- Tax Period review workflow
 * ==================================================
 *
 * This module is deliberately a review-and-sign-off record, never a
 * filing: no Filing API, no Submit Return, no Filed/READY_FOR_FILING
 * status, no DELETE (Splendor OS 3.0 execution blueprint, Rule 15). These
 * tests prove: the underlying VAT figures come from the same
 * buildVatSummary() the rest of Finance already uses (no invented tax
 * math), review is blocked while posting gaps exist in the period,
 * review requires a different person than whoever prepared it (reusing
 * the existing Procurement Approval Four-Eyes engine), and a period
 * already reviewed is correctly detected as stale -- never left silently
 * "reviewed" -- the moment a new posting lands in it.
 *
 * ISOLATION: firebase-admin is fully mocked (same in-memory Firestore
 * simulation pattern as tests/coreWorkflows.test.ts) -- no real Firebase
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

  const makeDocRef = (collectionName: string, id: string): any => ({
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

  const makeCollectionRef = (name: string): any => ({
    doc: (id: string) => makeDocRef(name, id),
    get: async () => {
      const col = collectionOf(name);
      const docs = Array.from(col.entries()).map(([id, data]) => ({ id, data: () => data }));
      return { docs, size: docs.length };
    },
    where: () => makeCollectionRef(name),
    orderBy: () => makeCollectionRef(name),
    limit: () => makeCollectionRef(name)
  });

  const firestoreObj: any = {
    collection: (name: string) => makeCollectionRef(name),
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
    __test: { verifyIdToken, usersDb, appsArr, store }
  };

  return { default: admin };
});

let app: any;
let adminMock: { verifyIdToken: Mock; usersDb: Map<string, { role: string; name: string }>; store: Map<string, Map<string, any>> };

const CEO_UID = 'tax-ceo-uid';
const ADMIN2_UID = 'tax-admin2-uid';
const FINANCE_UID = 'tax-finance-uid';
const SALES_UID = 'tax-sales-uid';

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(CEO_UID, { role: 'ceo', name: 'Test CEO' });
  adminMock.usersDb.set(ADMIN2_UID, { role: 'admin', name: 'Test Admin (2nd approver)' });
  adminMock.usersDb.set(FINANCE_UID, { role: 'finance', name: 'Test Finance' });
  adminMock.usersDb.set(SALES_UID, { role: 'sales', name: 'Test Sales' });

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

function seedJournal(id: string, date: string, outputVatCredit: number) {
  adminMock.store.get('accounting_journals') || adminMock.store.set('accounting_journals', new Map());
  adminMock.store.get('accounting_journals')!.set(id, {
    id, date, status: 'posted', sourceType: 'Invoice', sourceId: id, sourceAction: 'issue',
    totalDebit: outputVatCredit, totalCredit: outputVatCredit,
    lines: [
      { accountCode: '1300', debit: outputVatCredit, credit: 0 },
      { accountCode: '2200', debit: 0, credit: outputVatCredit }
    ]
  });
}

function seedUnpostedDeposit(id: string, date: string) {
  adminMock.store.get('deposits') || adminMock.store.set('deposits', new Map());
  adminMock.store.get('deposits')!.set(id, { id, createdAt: date, amount: 1000, holdType: 'manual' });
}

describe('GET /api/tax/periods/:periodKey', () => {
  it('rejects a malformed period key', async () => {
    const res = await request(app)
      .get('/api/tax/periods/not-a-period')
      .set(authAs(FINANCE_UID));
    expect(res.status).toBe(400);
  });

  it('returns a fresh draft view with zero figures when nothing has been prepared yet', async () => {
    const res = await request(app)
      .get('/api/tax/periods/2031-01')
      .set(authAs(FINANCE_UID));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('draft');
    expect(res.body.outputVat).toBe(0);
    expect(res.body.stale).toBe(false);
  });

  it('computes output VAT from the same journals Finance already posts -- no invented tax math', async () => {
    seedJournal('JRN-TAX-A', '2031-02-10', 100);
    seedJournal('JRN-TAX-B', '2031-02-20', 50);
    seedJournal('JRN-TAX-OUTSIDE', '2031-03-01', 999); // different period, must not leak in

    const res = await request(app)
      .get('/api/tax/periods/2031-02')
      .set(authAs(FINANCE_UID));
    expect(res.status).toBe(200);
    expect(res.body.outputVat).toBe(150);
    expect(res.body.vatPayable).toBe(150); // no input VAT postings in this fixture
  });
});

describe('POST /api/tax/periods/:periodKey/prepare and /request-review', () => {
  it('blocks review while a posting gap exists in the period', async () => {
    seedJournal('JRN-TAX-C', '2031-04-05', 200);
    seedUnpostedDeposit('DEP-TAX-GAP-1', '2031-04-06'); // no matching journal -> a real posting gap

    const prepareRes = await request(app)
      .post('/api/tax/periods/2031-04/prepare')
      .set(authAs(FINANCE_UID))
      .send({});
    expect(prepareRes.status).toBe(200);
    expect(prepareRes.body.postingGapCount).toBeGreaterThan(0);

    const reviewRes = await request(app)
      .post('/api/tax/periods/2031-04/request-review')
      .set(authAs(FINANCE_UID))
      .send({ reason: 'Month-end VAT review' });
    expect(reviewRes.status).toBe(409);
    expect(reviewRes.body.error).toMatch(/posting gap/i);
  });

  it('requests review once gap-free, and a different authorized person must decide it (Four-Eyes)', async () => {
    seedJournal('JRN-TAX-D', '2031-05-05', 300);

    // The generic decide route is itself restricted to ceo/admin, so the
    // requester here must already be in that set to reach the
    // self-approval check at all (a finance requester deciding their own
    // request would 403 on role alone, before Four-Eyes is even checked).
    const reviewRes = await request(app)
      .post('/api/tax/periods/2031-05/request-review')
      .set(authAs(CEO_UID))
      .send({ reason: 'Month-end VAT review' });
    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.taxPeriod.status).toBe('under_review');
    const approvalRequestId = reviewRes.body.approvalRequestId;

    // The preparer/requester cannot decide their own request.
    const selfDecide = await request(app)
      .post(`/api/procurement/approvals/${approvalRequestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'self' });
    expect(selfDecide.status).toBe(409);

    // A different CEO/admin can.
    const decide = await request(app)
      .post(`/api/procurement/approvals/${approvalRequestId}/decide`)
      .set(authAs(ADMIN2_UID))
      .send({ decision: 'approved', note: 'Figures verified against the accounting ledger.' });
    expect(decide.status).toBe(200);

    const view = await request(app)
      .get('/api/tax/periods/2031-05')
      .set(authAs(FINANCE_UID));
    expect(view.body.status).toBe('reviewed');
    expect(view.body.outputVat).toBe(300);
    expect(view.body.reviewedBy).toBe(ADMIN2_UID);
    expect(view.body.stale).toBe(false);
  });

  it('detects a reviewed period as stale the moment a new posting lands in it, without ever silently keeping it "reviewed"', async () => {
    seedJournal('JRN-TAX-E', '2031-06-05', 400);
    const reviewRes = await request(app)
      .post('/api/tax/periods/2031-06/request-review')
      .set(authAs(FINANCE_UID))
      .send({ reason: 'Month-end VAT review' });

    await request(app)
      .post(`/api/procurement/approvals/${reviewRes.body.approvalRequestId}/decide`)
      .set(authAs(ADMIN2_UID))
      .send({ decision: 'approved', note: 'Verified.' });

    const beforeLatePosting = await request(app).get('/api/tax/periods/2031-06').set(authAs(FINANCE_UID));
    expect(beforeLatePosting.body.status).toBe('reviewed');

    // A late correction/posting lands in the already-reviewed period.
    seedJournal('JRN-TAX-E-LATE', '2031-06-28', 999);

    const staleView = await request(app).get('/api/tax/periods/2031-06').set(authAs(FINANCE_UID));
    expect(staleView.status).toBe(200);
    expect(staleView.body.stale).toBe(true);
    expect(staleView.body.status).toBe('draft'); // never left showing "reviewed" against stale figures
    expect(staleView.body.outputVat).toBe(1399); // reports the current, live figure
    expect(staleView.body.staleNote).toBeTruthy();

    // Re-preparing persists the reset, not just the GET view.
    const reprepared = await request(app)
      .post('/api/tax/periods/2031-06/prepare')
      .set(authAs(FINANCE_UID))
      .send({});
    expect(reprepared.body.status).toBe('draft');
    expect(reprepared.body.reviewedBy).toBeUndefined();
  });

  it('rejects a request-review with no reason', async () => {
    const res = await request(app)
      .post('/api/tax/periods/2031-07/request-review')
      .set(authAs(FINANCE_UID))
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects a sales-role user from preparing or reviewing a tax period', async () => {
    const res = await request(app)
      .post('/api/tax/periods/2031-08/prepare')
      .set(authAs(SALES_UID))
      .send({});
    expect(res.status).toBe(403);
  });
});
