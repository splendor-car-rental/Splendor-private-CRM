/**
 * Accounting API Dispatcher & Atomic Posting Integration
 * =========================================================
 *
 * Covers the confirmed gap: nothing in the existing suite exercised
 * accountingApi.ts's dispatcher (path parsing, role gating) or the
 * Firestore-facing engine in accounting.ts / the safe*.ts atomic modules --
 * only the pure calculators in src/lib/accounting.ts were tested
 * (tests/accountingCore.test.ts).
 *
 *  - Dispatcher routing: a representative sample of real path+method
 *    combinations reaches the correct engine function.
 *  - Role gating: assertFinanceActor rejects a non-finance role (403);
 *    assertExecutiveActor additionally rejects a finance-but-not-executive
 *    role for period-close and journal-reverse.
 *  - Atomic financial correctness: an idempotent supplier payment never
 *    double-pays on Idempotency-Key retry; supplier-invoice posting never
 *    creates a second AP entry/journal on retry or duplicate call; a
 *    reversed journal is balanced, flips debit/credit vs. the original, and
 *    never mutates the original journal's lines in place.
 *
 * handleAccountingRequest is only wired into api/index.ts (the bare Vercel
 * entrypoint), not into server.ts's Express app -- so it is called directly
 * here with minimal req/res doubles rather than through supertest.
 *
 * ISOLATION: firebase-admin is fully mocked (same in-memory Firestore
 * simulation as tests/vehicleMasterProfile.test.ts and
 * tests/paymentGateway.test.ts) -- no real Firebase project is contacted.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const appsArr: any[] = [];
  const store = new Map<string, Map<string, any>>();
  const collectionOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  function matchesFilter(data: any, filter: { field: string; op: string; value: any }): boolean {
    if (!data) return false;
    const actual = data[filter.field];
    switch (filter.op) {
      case '==': return actual === filter.value;
      case '!=': return actual !== filter.value;
      case '>=': return actual >= filter.value;
      case '<=': return actual <= filter.value;
      case '>': return actual > filter.value;
      case '<': return actual < filter.value;
      default: return true;
    }
  }

  function makeQuery(name: string, filters: Array<{ field: string; op: string; value: any }>, order: { field: string; dir: string } | null, limitN: number | null): any {
    return {
      where: (field: string, op: string, value: any) => makeQuery(name, [...filters, { field, op, value }], order, limitN),
      orderBy: (field: string, dir = 'asc') => makeQuery(name, filters, { field, dir }, limitN),
      limit: (n: number) => makeQuery(name, filters, order, n),
      get: async () => {
        let entries = Array.from(collectionOf(name).entries()) as Array<[string, any]>;
        entries = entries.filter(([, data]) => filters.every(f => matchesFilter(data, f)));
        if (order) {
          entries.sort((a, b) => {
            const av = a[1][order.field];
            const bv = b[1][order.field];
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return order.dir === 'desc' ? -cmp : cmp;
          });
        }
        if (limitN !== null) entries = entries.slice(0, limitN);
        const docs = entries.map(([id, data]) => ({ id, data: () => data }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      }
    };
  }

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
    ...makeQuery(name, [], null, null)
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
        commit: async () => { ops.forEach(op => op()); }
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
    firestore: () => firestoreObj,
    __test: { store, appsArr }
  };

  return { default: admin };
});

let adminMock: { store: Map<string, Map<string, any>>; appsArr: any[] };
let handleAccountingRequest: typeof import('../src/server/accountingApi.js')['handleAccountingRequest'];

const FINANCE_ACTOR = { uid: 'finance-1', name: 'Finance Officer', role: 'finance' };
const FINANCE_ACTOR_2 = { uid: 'finance-2', name: 'Second Finance Officer', role: 'finance' };
const CEO_ACTOR = { uid: 'ceo-1', name: 'CEO', role: 'ceo' };
const SALES_ACTOR = { uid: 'sales-1', name: 'Sales Rep', role: 'sales' };

beforeAll(async () => {
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';
  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.appsArr.push({});

  const apiModule = await import('../src/server/accountingApi.js');
  handleAccountingRequest = apiModule.handleAccountingRequest;
});

afterEach(() => {
  adminMock.store.clear();
});

function seedDoc(collection: string, id: string, data: any) {
  if (!adminMock.store.has(collection)) adminMock.store.set(collection, new Map());
  adminMock.store.get(collection)!.set(id, data);
}

function getDoc(collection: string, id: string) {
  return adminMock.store.get(collection)?.get(id);
}

function allDocs(collection: string): any[] {
  return Array.from(adminMock.store.get(collection)?.values() || []);
}

interface FakeReq {
  path: string;
  url: string;
  method: string;
  body: any;
  query: Record<string, any>;
  headers: Record<string, any>;
}

function makeReq(method: string, path: string, opts: { body?: any; query?: Record<string, any>; headers?: Record<string, any> } = {}): FakeReq {
  return {
    path,
    url: path,
    method,
    body: opts.body || {},
    query: opts.query || {},
    headers: opts.headers || {}
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    setHeader() {
      return this;
    }
  };
  return res;
}

async function call(actor: any, method: string, path: string, opts: { body?: any; query?: Record<string, any>; headers?: Record<string, any> } = {}) {
  const req = makeReq(method, path, opts);
  const res = makeRes();
  await handleAccountingRequest(req as any, res, actor);
  return res;
}

describe('handleAccountingRequest -- dispatcher routing to the correct engine function', () => {
  it('GET /api/accounting/chart-of-accounts returns the effective chart of accounts', async () => {
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/chart-of-accounts');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((a: any) => a.code === '1000')).toBe(true);
  });

  it('PUT /api/accounting/chart-of-accounts/:code creates a new custom account, then edits it, from the Chart of Accounts tab', async () => {
    const create = await call(FINANCE_ACTOR, 'PUT', '/api/accounting/chart-of-accounts/5200', {
      body: { name: 'Vehicle Detailing', nameAr: 'تلميع المركبات', accountClass: 'expense', normalSide: 'debit', active: true, allowDirectPosting: true }
    });
    expect(create.statusCode).toBe(200);
    expect(create.body.code).toBe('5200');
    expect(create.body.system).toBe(false);

    const listAfterCreate = await call(FINANCE_ACTOR, 'GET', '/api/accounting/chart-of-accounts');
    expect(listAfterCreate.body.some((a: any) => a.code === '5200' && a.nameAr === 'تلميع المركبات')).toBe(true);

    const edit = await call(FINANCE_ACTOR, 'PUT', '/api/accounting/chart-of-accounts/5200', {
      body: { name: 'Vehicle Detailing', nameAr: 'تلميع المركبات', accountClass: 'expense', normalSide: 'debit', active: false, allowDirectPosting: true }
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.body.active).toBe(false);
  });

  it('PUT /api/accounting/chart-of-accounts/:code refuses to change a system account\'s class, normal side, or direct-posting flag', async () => {
    const res = await call(FINANCE_ACTOR, 'PUT', '/api/accounting/chart-of-accounts/1000', {
      body: { name: 'Cash on Hand', nameAr: 'النقدية', accountClass: 'liability', normalSide: 'debit', active: true, allowDirectPosting: true }
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/cannot change accountClass/i);
  });

  it('GET /api/accounting/journals lists journals', async () => {
    seedDoc('accounting_journals', 'JRN-1', { id: 'JRN-1', date: '2026-09-01', sourceType: 'Test', sourceId: 'S1', sourceAction: 'x', lines: [], totalDebit: 0, totalCredit: 0 });
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/journals');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('JRN-1');
  });

  it('POST /api/accounting/journals/manual requests a manual journal (pending approval, not yet posted)', async () => {
    const res = await call(FINANCE_ACTOR, 'POST', '/api/accounting/journals/manual', {
      body: { date: '2026-09-01', memo: 'Manual test entry', lines: [
        { accountCode: '1000', debit: 100, credit: 0 },
        { accountCode: '3000', debit: 0, credit: 100 }
      ] }
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('pending_approval');
    expect(allDocs('accounting_journals')).toHaveLength(0);
  });

  it('GET /api/accounting/expenses lists finance expenses', async () => {
    seedDoc('accounting_expenses', 'EXP-1', { id: 'EXP-1', date: '2026-09-01', approvalStatus: 'pending_approval' });
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/expenses');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('POST /api/accounting/expenses creates a pending finance expense', async () => {
    const res = await call(FINANCE_ACTOR, 'POST', '/api/accounting/expenses', {
      body: {
        date: '2026-09-01', vendor: 'ACME Garage', category: 'maintenance', expenseAccountCode: '5000',
        amountBeforeVat: 100, vatAmount: 5, totalAmount: 105, paymentStatus: 'unpaid'
      }
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.approvalStatus).toBe('pending_approval');
    expect(res.body.postingStatus).toBe('unposted');
  });

  it('GET /api/accounting/ar-aging and /api/accounting/ap-aging both route correctly', async () => {
    const ar = await call(FINANCE_ACTOR, 'GET', '/api/accounting/ar-aging');
    expect(ar.statusCode).toBe(200);
    expect(Array.isArray(ar.body)).toBe(true);

    const ap = await call(FINANCE_ACTOR, 'GET', '/api/accounting/ap-aging');
    expect(ap.statusCode).toBe(200);
    expect(Array.isArray(ap.body)).toBe(true);
  });

  it('GET /api/accounting/payables lists accounts payable entries', async () => {
    seedDoc('accounting_payables', 'AP-1', { id: 'AP-1', invoiceDate: '2026-09-01', balance: 500, status: 'unpaid' });
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/payables');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/accounting/periods lists accounting periods', async () => {
    seedDoc('accounting_periods', '2026-08', { id: '2026-08', status: 'closed' });
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/periods');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/accounting/vehicle-profitability and /api/accounting/posting-gaps route correctly', async () => {
    const profitability = await call(FINANCE_ACTOR, 'GET', '/api/accounting/vehicle-profitability');
    expect(profitability.statusCode).toBe(200);
    expect(Array.isArray(profitability.body)).toBe(true);

    const gaps = await call(FINANCE_ACTOR, 'GET', '/api/accounting/posting-gaps');
    expect(gaps.statusCode).toBe(200);
    expect(Array.isArray(gaps.body)).toBe(true);
  });

  it('GET /api/accounting/executive-dashboard combines the finance dashboard, cash-flow forecast, and vehicle profitability leaders for the Executive KPI Dashboard, and is CEO/admin-only', async () => {
    const inHorizon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const beyondHorizon = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    seedDoc('invoices', 'INV-CFF-1', {
      id: 'INV-CFF-1', customerId: 'CUST-CFF-1', customerName: 'Cash Flow Forecast Customer',
      issueDate: '2026-09-01', dueDate: inHorizon, subtotal: 300, vatAmount: 0, totalAmount: 300,
      paidAmount: 0, balanceDue: 300, status: 'unpaid', items: [], createdAt: '2026-09-01', updatedAt: '2026-09-01'
    });
    seedDoc('invoices', 'INV-CFF-2', {
      id: 'INV-CFF-2', customerId: 'CUST-CFF-2', customerName: 'Beyond Horizon Customer',
      issueDate: '2026-09-01', dueDate: beyondHorizon, subtotal: 900, vatAmount: 0, totalAmount: 900,
      paidAmount: 0, balanceDue: 900, status: 'unpaid', items: [], createdAt: '2026-09-01', updatedAt: '2026-09-01'
    });
    seedDoc('accounting_payables', 'AP-CFF-1', {
      id: 'AP-CFF-1', supplierInvoiceId: 'SINV-CFF-1', supplierId: 'SUP-CFF-1', supplierName: 'Cash Flow Forecast Supplier',
      invoiceNumber: 'INV-SUP-CFF-1', invoiceDate: '2026-09-01', dueDate: inHorizon, expenseAccountCode: '5170',
      amountBeforeVat: 200, vatAmount: 0, totalAmount: 200, paidAmount: 0, balance: 200, status: 'unpaid',
      journalId: 'JRN-SEED-CFF', createdAt: '2026-09-01', updatedAt: '2026-09-01'
    });

    const res = await call(CEO_ACTOR, 'GET', '/api/accounting/executive-dashboard');
    expect(res.statusCode).toBe(200);
    expect(res.body.dashboard).toHaveProperty('cashPosition');
    expect(res.body.cashFlowForecast.horizonDays).toBe(30);
    expect(res.body.cashFlowForecast.expectedInflows).toBeGreaterThanOrEqual(300);
    expect(res.body.cashFlowForecast.expectedInflows).toBeLessThan(1200); // the beyond-horizon invoice must be excluded
    expect(res.body.cashFlowForecast.expectedOutflows).toBeGreaterThanOrEqual(200);
    expect(Array.isArray(res.body.topVehicles)).toBe(true);
    expect(Array.isArray(res.body.bottomVehicles)).toBe(true);

    const financeAttempt = await call(FINANCE_ACTOR, 'GET', '/api/accounting/executive-dashboard');
    expect(financeAttempt.statusCode).toBe(403);
  });

  it('GET /api/accounting/financial-notes lists credit/debit notes', async () => {
    seedDoc('accounting_financial_notes', 'CRN-1', { id: 'CRN-1', type: 'credit_note', invoiceId: 'INV-1', issueDate: '2026-09-01' });
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/financial-notes');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/accounting/dashboard (also the root path) returns the finance dashboard summary', async () => {
    const rootRes = await call(FINANCE_ACTOR, 'GET', '/api/accounting');
    expect(rootRes.statusCode).toBe(200);
    expect(rootRes.body).toHaveProperty('cashPosition');
    expect(rootRes.body).toHaveProperty('unpostedSourceCount');

    const dashboardRes = await call(FINANCE_ACTOR, 'GET', '/api/accounting/dashboard');
    expect(dashboardRes.statusCode).toBe(200);
    expect(dashboardRes.body).toHaveProperty('arOutstanding');
  });

  it('GET /api/accounting/reports returns combined financial reports plus cash flow', async () => {
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/reports');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('trialBalance');
    expect(res.body).toHaveProperty('profitLoss');
    expect(res.body).toHaveProperty('balanceSheet');
    expect(res.body).toHaveProperty('cashFlow');
  });

  it('GET /api/accounting/reports/profitLoss breaks revenue and expenses down per account, feeding the Income Statement tab', async () => {
    seedDoc('accounting_journals', 'JRN-PL-1', {
      id: 'JRN-PL-1', date: new Date().toISOString().slice(0, 10), periodKey: new Date().toISOString().slice(0, 7),
      currency: 'AED', sourceType: 'Invoice', sourceId: 'INV-PL-1', sourceAction: 'post', memo: 'Test revenue',
      status: 'posted', lines: [
        { accountCode: '1100', debit: 1000, credit: 0 },
        { accountCode: '4000', debit: 0, credit: 1000 }
      ],
      totalDebit: 1000, totalCredit: 1000, createdBy: 'x', createdByName: 'x', createdByRole: 'finance',
      createdAt: new Date().toISOString(), postedAt: new Date().toISOString()
    });
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/reports');
    expect(res.statusCode).toBe(200);
    const revenueRow = res.body.profitLoss.revenueAccounts.find((r: any) => r.accountCode === '4000');
    expect(revenueRow).toBeDefined();
    expect(revenueRow.credit).toBe(1000);
    expect(res.body.profitLoss.revenue).toBeGreaterThanOrEqual(1000);
  });

  it('GET /api/accounting/customers/:id/statement returns the real invoices/payments/notes evidence for the Customer 360 statement tab', async () => {
    seedDoc('invoices', 'INV-STMT-1', {
      id: 'INV-STMT-1', customerId: 'CUST-STMT-1', customerName: 'Statement Test Customer',
      issueDate: '2026-09-01', dueDate: '2026-09-15', subtotal: 1000, vatAmount: 50, totalAmount: 1050,
      paidAmount: 500, balanceDue: 550, status: 'partially_paid', items: [], createdAt: '2026-09-01', updatedAt: '2026-09-01'
    });
    seedDoc('payments', 'PAY-STMT-1', {
      id: 'PAY-STMT-1', customerId: 'CUST-STMT-1', customerName: 'Statement Test Customer', invoiceId: 'INV-STMT-1',
      amount: 500, method: 'bank_transfer', status: 'confirmed', referenceNumber: 'REF-1', allocatedTo: [],
      receivedBy: 'x', receivedAt: '2026-09-02', receiptNumber: 'RCPT-1', notes: '', createdAt: '2026-09-02'
    });
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/customers/CUST-STMT-1/statement');
    expect(res.statusCode).toBe(200);
    expect(res.body.customerId).toBe('CUST-STMT-1');
    expect(res.body.totalInvoiced).toBe(1050);
    expect(res.body.totalPaid).toBe(500);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.payments).toHaveLength(1);
  });

  it('GET /api/accounting/suppliers/:id/statement returns the real payables/payments evidence for the Suppliers statement modal', async () => {
    seedDoc('accounting_payables', 'AP-STMT-1', {
      id: 'AP-STMT-1', supplierInvoiceId: 'SINV-STMT-1', supplierId: 'SUP-STMT-1', supplierName: 'Statement Test Supplier',
      invoiceNumber: 'INV-SUP-1', invoiceDate: '2026-09-01', dueDate: '2026-09-15', expenseAccountCode: '5170',
      amountBeforeVat: 2000, vatAmount: 100, totalAmount: 2100, paidAmount: 2100, balance: 0, status: 'paid',
      journalId: 'JRN-SEED-STMT', createdAt: '2026-09-01', updatedAt: '2026-09-01'
    });
    seedDoc('accounting_payable_payments', 'APP-STMT-1', {
      id: 'APP-STMT-1', payableId: 'AP-STMT-1', supplierId: 'SUP-STMT-1', supplierName: 'Statement Test Supplier',
      amount: 2100, settlementAccountCode: '1100', reference: 'PAY-REF-1', journalId: 'JRN-PAY-STMT',
      paidBy: 'finance-1', paidByName: 'Finance Officer', paidAt: '2026-09-05'
    });
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/suppliers/SUP-STMT-1/statement');
    expect(res.statusCode).toBe(200);
    expect(res.body.supplierId).toBe('SUP-STMT-1');
    expect(res.body.totalInvoiced).toBe(2100);
    expect(res.body.totalPaid).toBe(2100);
    expect(res.body.outstanding).toBe(0);
    expect(res.body.payables).toHaveLength(1);
    expect(res.body.payments).toHaveLength(1);
  });

  it('derives the resource path from req.url when req.path is absent, matching how api/index.ts (Vercel) invokes this dispatcher', async () => {
    const req: any = { url: '/api/accounting/ar-aging?asOf=2026-09-01', method: 'GET', body: {}, query: { asOf: '2026-09-01' }, headers: {} };
    const res = makeRes();
    await handleAccountingRequest(req, res, FINANCE_ACTOR);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('an unrecognized route returns 404', async () => {
    const res = await call(FINANCE_ACTOR, 'GET', '/api/accounting/not-a-real-resource');
    expect(res.statusCode).toBe(404);
  });
});

describe('handleAccountingRequest -- role gating', () => {
  const financeGatedRoutes: Array<{ method: string; path: string }> = [
    { method: 'GET', path: '/api/accounting/chart-of-accounts' },
    { method: 'GET', path: '/api/accounting/journals' },
    { method: 'GET', path: '/api/accounting/expenses' },
    { method: 'GET', path: '/api/accounting/payables' },
    { method: 'GET', path: '/api/accounting/ar-aging' },
    { method: 'GET', path: '/api/accounting/ap-aging' },
    { method: 'GET', path: '/api/accounting/periods' },
    { method: 'GET', path: '/api/accounting/vehicle-profitability' },
    { method: 'GET', path: '/api/accounting/posting-gaps' },
    { method: 'GET', path: '/api/accounting/financial-notes' },
    { method: 'GET', path: '/api/accounting/dashboard' },
    { method: 'GET', path: '/api/accounting/reports' }
  ];

  it.each(financeGatedRoutes)('rejects a non-finance role (sales) with 403 for $method $path', async ({ method, path }) => {
    const res = await call(SALES_ACTOR, method, path);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/permission/i);
  });

  it('a finance role (not executive) is rejected with 403 for period close', async () => {
    seedDoc('accounting_periods', '2026-09', { id: '2026-09', status: 'open' });
    const res = await call(FINANCE_ACTOR, 'POST', '/api/accounting/periods/2026-09/close', { body: { reason: 'Month end.' } });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/executive/i);
  });

  it('a finance role (not executive) is rejected with 403 for journal reversal', async () => {
    seedDoc('accounting_journals', 'JRN-REV-1', {
      id: 'JRN-REV-1', date: '2026-09-01', periodKey: '2026-09', sourceType: 'Test', sourceId: 'S1', sourceAction: 'x',
      lines: [{ accountCode: '1000', debit: 100, credit: 0 }, { accountCode: '3000', debit: 0, credit: 100 }],
      totalDebit: 100, totalCredit: 100
    });
    const res = await call(FINANCE_ACTOR, 'POST', '/api/accounting/journals/JRN-REV-1/reverse', { body: { reason: 'Posted in error.' } });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/executive/i);
  });

  it('an executive role (ceo) IS allowed to close a period and reverse a journal', async () => {
    seedDoc('accounting_periods', '2026-01', { id: '2026-01', status: 'open' });
    const closeRes = await call(CEO_ACTOR, 'POST', '/api/accounting/periods/2026-01/close', { body: { reason: 'Month end close.' } });
    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.body.status).toBe('closed');

    seedDoc('accounting_journals', 'JRN-REV-2', {
      id: 'JRN-REV-2', date: '2026-09-01', periodKey: '2026-09', sourceType: 'Test', sourceId: 'S2', sourceAction: 'x',
      lines: [{ accountCode: '1000', debit: 100, credit: 0 }, { accountCode: '3000', debit: 0, credit: 100 }],
      totalDebit: 100, totalCredit: 100
    });
    const reverseRes = await call(CEO_ACTOR, 'POST', '/api/accounting/journals/JRN-REV-2/reverse', { body: { reason: 'Posted in error.' } });
    expect(reverseRes.statusCode).toBe(200);
  });
});

describe('Atomic flow -- idempotent supplier payment never double-pays on Idempotency-Key retry', () => {
  it('retrying the exact same payment with the same Idempotency-Key replays the first result instead of paying twice', async () => {
    seedDoc('accounting_payables', 'AP-100', {
      id: 'AP-100', supplierInvoiceId: 'SINV-100', supplierId: 'SUP-1', supplierName: 'Test Supplier', invoiceNumber: 'INV-100',
      invoiceDate: '2026-09-01', dueDate: '2026-09-15', expenseAccountCode: '5170',
      amountBeforeVat: 1000, vatAmount: 50, totalAmount: 1050, paidAmount: 0, balance: 1050, status: 'unpaid',
      journalId: 'JRN-SEED', createdAt: '2026-09-01', updatedAt: '2026-09-01'
    });
    const idKey = 'ap-pay-retry-key-1';
    const body = { amount: 1050, settlementAccountCode: '1100' };

    const first = await call(FINANCE_ACTOR, 'POST', '/api/accounting/payables/AP-100/pay', {
      body, headers: { 'idempotency-key': idKey }
    });
    expect(first.statusCode).toBe(201);
    expect(first.body.payable.status).toBe('paid');
    expect(first.body.payable.balance).toBe(0);

    const second = await call(FINANCE_ACTOR, 'POST', '/api/accounting/payables/AP-100/pay', {
      body, headers: { 'idempotency-key': idKey }
    });
    expect(second.statusCode).toBe(200);
    expect(second.body.payment.id).toBe(first.body.payment.id);

    // The real financial-correctness check: only ONE payment record and the
    // payable balance was only ever reduced once, not twice.
    const payments = allDocs('accounting_payable_payments');
    expect(payments).toHaveLength(1);
    const payable = getDoc('accounting_payables', 'AP-100');
    expect(payable.balance).toBe(0);
    expect(payable.paidAmount).toBe(1050);
  });

  it('reusing the same Idempotency-Key for a genuinely different payment request is refused, not silently replayed', async () => {
    seedDoc('accounting_payables', 'AP-101', {
      id: 'AP-101', supplierInvoiceId: 'SINV-101', supplierId: 'SUP-2', supplierName: 'Another Supplier', invoiceNumber: 'INV-101',
      invoiceDate: '2026-09-01', dueDate: '2026-09-15', expenseAccountCode: '5170',
      amountBeforeVat: 2000, vatAmount: 100, totalAmount: 2100, paidAmount: 0, balance: 2100, status: 'unpaid',
      journalId: 'JRN-SEED-2', createdAt: '2026-09-01', updatedAt: '2026-09-01'
    });
    const idKey = 'ap-pay-conflict-key-1';
    const first = await call(FINANCE_ACTOR, 'POST', '/api/accounting/payables/AP-101/pay', {
      body: { amount: 500, settlementAccountCode: '1100' }, headers: { 'idempotency-key': idKey }
    });
    expect(first.statusCode).toBe(201);

    const conflicting = await call(FINANCE_ACTOR, 'POST', '/api/accounting/payables/AP-101/pay', {
      body: { amount: 999, settlementAccountCode: '1100' }, headers: { 'idempotency-key': idKey }
    });
    expect(conflicting.statusCode).toBe(409);
    // Balance only reflects the ONE payment that actually ran (500), not the tampered retry.
    expect(getDoc('accounting_payables', 'AP-101').balance).toBe(1600);
  });
});

describe('Atomic flow -- supplier invoice posting to AP never double-posts', () => {
  it('posting an approved supplier invoice twice returns the same payable/journal instead of creating a duplicate', async () => {
    seedDoc('supplier_invoices', 'SINV-200', {
      id: 'SINV-200', status: 'approved', supplierId: 'SUP-3', supplierName: 'Parts Co', invoiceNumber: 'PC-200',
      invoiceDate: '2026-09-01', amount: 525
    });
    const body = { amountBeforeVat: 500, vatAmount: 25, dueDate: '2026-09-20', expenseAccountCode: '5170' };
    const idKey = 'sinv-post-retry-key-1';

    const first = await call(FINANCE_ACTOR, 'POST', '/api/accounting/supplier-invoices/SINV-200/post', {
      body, headers: { 'idempotency-key': idKey }
    });
    expect(first.statusCode).toBe(201);
    expect(first.body.payable.totalAmount).toBe(525);
    expect(first.body.payable.balance).toBe(525);

    const second = await call(FINANCE_ACTOR, 'POST', '/api/accounting/supplier-invoices/SINV-200/post', {
      body, headers: { 'idempotency-key': idKey }
    });
    expect(second.statusCode).toBe(200);
    expect(second.body.payable.id).toBe(first.body.payable.id);
    expect(second.body.journal.id).toBe(first.body.journal.id);

    // Real financial-correctness check: exactly one payable and one journal exist -- a
    // regression here would silently double the company's recorded supplier liability.
    expect(allDocs('accounting_payables')).toHaveLength(1);
    const journals = allDocs('accounting_journals').filter((j: any) => j.sourceType === 'SupplierInvoice');
    expect(journals).toHaveLength(1);
    expect(journals[0].totalDebit).toBe(525);
    expect(journals[0].totalCredit).toBe(525);
  });

  it('rejects posting when the supplied net + VAT does not equal the approved invoice total', async () => {
    seedDoc('supplier_invoices', 'SINV-201', {
      id: 'SINV-201', status: 'approved', supplierId: 'SUP-4', supplierName: 'Mismatch Co', invoiceNumber: 'MC-201',
      invoiceDate: '2026-09-01', amount: 1000
    });
    const res = await call(FINANCE_ACTOR, 'POST', '/api/accounting/supplier-invoices/SINV-201/post', {
      body: { amountBeforeVat: 500, vatAmount: 25, dueDate: '2026-09-20', expenseAccountCode: '5170' }
    });
    expect(res.statusCode).toBe(400);
    expect(allDocs('accounting_payables')).toHaveLength(0);
  });
});

describe('Atomic flow -- manual journal reversal is balanced, flips debit/credit, and never mutates the original', () => {
  it('reversing a posted journal creates a new balanced journal with debit/credit swapped, and only tags the original, never rewrites its lines', async () => {
    const originalLines = [
      { accountCode: '1300', debit: 1050, credit: 0 },
      { accountCode: '4000', debit: 0, credit: 1000 },
      { accountCode: '2200', debit: 0, credit: 50 }
    ];
    seedDoc('accounting_journals', 'JRN-ORIG-1', {
      id: 'JRN-ORIG-1', date: '2026-09-01', periodKey: '2026-09', currency: 'AED',
      sourceType: 'Invoice', sourceId: 'INV-1', sourceAction: 'issue', memo: 'Customer invoice INV-1',
      status: 'posted', lines: originalLines, totalDebit: 1050, totalCredit: 1050,
      createdBy: 'U1', createdByName: 'Finance', createdByRole: 'finance',
      createdAt: '2026-09-01T10:00:00.000Z', postedAt: '2026-09-01T10:00:00.000Z'
    });

    const res = await call(CEO_ACTOR, 'POST', '/api/accounting/journals/JRN-ORIG-1/reverse', {
      body: { reason: 'Invoice was issued to the wrong customer.', date: '2026-09-05T00:00:00.000Z' }
    });
    expect(res.statusCode).toBe(200);
    const reversal = res.body;

    // The reversal is itself a valid, balanced double-entry journal.
    expect(reversal.totalDebit).toBe(reversal.totalCredit);
    expect(reversal.totalDebit).toBe(1050);
    expect(reversal.id).not.toBe('JRN-ORIG-1');
    expect(reversal.reversalOfJournalId).toBe('JRN-ORIG-1');

    // Every line's debit/credit is exactly flipped vs. the original.
    for (const line of originalLines) {
      const reversedLine = reversal.lines.find((l: any) => l.accountCode === line.accountCode);
      expect(reversedLine.debit).toBe(line.credit);
      expect(reversedLine.credit).toBe(line.debit);
    }

    // The original journal is tagged as reversed, but its own lines/totals are untouched.
    const original = getDoc('accounting_journals', 'JRN-ORIG-1');
    expect(original.reversalJournalId).toBe(reversal.id);
    expect(original.lines).toEqual(originalLines);
    expect(original.totalDebit).toBe(1050);
    expect(original.totalCredit).toBe(1050);
    expect(original.status).toBe('posted');

    // The reversal journal itself is durably persisted, not just returned.
    const storedReversal = getDoc('accounting_journals', reversal.id);
    expect(storedReversal.sourceType).toBe('JournalReversal');
    expect(storedReversal.totalDebit).toBe(storedReversal.totalCredit);
  });

  it('refuses to reverse an already-reversed journal a second time', async () => {
    seedDoc('accounting_journals', 'JRN-ORIG-2', {
      id: 'JRN-ORIG-2', date: '2026-09-01', periodKey: '2026-09', currency: 'AED',
      sourceType: 'Invoice', sourceId: 'INV-2', sourceAction: 'issue', memo: 'Customer invoice INV-2',
      status: 'posted', lines: [{ accountCode: '1300', debit: 100, credit: 0 }, { accountCode: '4000', debit: 0, credit: 100 }],
      totalDebit: 100, totalCredit: 100, reversalJournalId: 'JRN-ALREADY-REVERSED',
      createdBy: 'U1', createdByName: 'Finance', createdByRole: 'finance',
      createdAt: '2026-09-01T10:00:00.000Z', postedAt: '2026-09-01T10:00:00.000Z'
    });
    const res = await call(CEO_ACTOR, 'POST', '/api/accounting/journals/JRN-ORIG-2/reverse', { body: { reason: 'Trying again.' } });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already been reversed/i);
  });

  it('requires a reversal reason', async () => {
    seedDoc('accounting_journals', 'JRN-ORIG-3', {
      id: 'JRN-ORIG-3', date: '2026-09-01', periodKey: '2026-09', currency: 'AED',
      sourceType: 'Invoice', sourceId: 'INV-3', sourceAction: 'issue', memo: 'x', status: 'posted',
      lines: [{ accountCode: '1300', debit: 100, credit: 0 }, { accountCode: '4000', debit: 0, credit: 100 }],
      totalDebit: 100, totalCredit: 100, createdBy: 'U1', createdByName: 'Finance', createdByRole: 'finance',
      createdAt: '2026-09-01T10:00:00.000Z', postedAt: '2026-09-01T10:00:00.000Z'
    });
    const res = await call(CEO_ACTOR, 'POST', '/api/accounting/journals/JRN-ORIG-3/reverse', { body: {} });
    expect(res.statusCode).toBe(400);
  });
});
