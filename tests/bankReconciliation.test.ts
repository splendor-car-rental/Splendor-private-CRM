/**
 * Collections & Bank Reconciliation Engine -- Test Suite
 * =======================================================
 *
 * Covers the required scenarios from the mission brief:
 *  - Matching: exact reference match, customer-in-description + exact
 *    open-invoice-balance match.
 *  - Amount mismatch: reference match / customer match with a differing
 *    amount.
 *  - Unrecorded transfer: a credit nothing in the CRM can explain.
 *  - Duplicate detection: a bank line that repeats an earlier transaction,
 *    both cross-batch (against globalStore.bankTransactions) and
 *    within-batch (two identical rows in the same uploaded file).
 *  - "Payment not found in the bank" report (findUnmatchedCrmPayments).
 *  - Manual approval: POST /api/bank-transactions/:id/reconcile actually
 *    posts the invoice/customer balance update, and a transaction flagged
 *    as a probable duplicate is refused without an explicit override
 *    reason.
 *  - THE ABSOLUTE RULE: nothing in the import pipeline (preview or
 *    confirmed) ever creates or touches a Payment record or an Invoice
 *    balance by itself -- only a human's explicit, per-transaction
 *    /reconcile call does that.
 *
 * Parts 1-3 (classifyBankRow, findUnmatchedCrmPayments, the CSV/Excel
 * parsers) are pure-function unit tests -- no server, no mocks. Part 4
 * exercises the real routes in server.ts against the same in-memory
 * firebase-admin mock tests/tollImportSecurity.test.ts and
 * tests/paymentGateway.test.ts already use, so no real Firebase project is
 * ever contacted.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { classifyBankRow, findUnmatchedCrmPayments } from '../src/server/bankReconciliation';
import { parseBankStatementCsv, parseBankStatementExcel, parseGridToBankRows } from '../src/server/bankStatementParsers';
import type { Customer, Invoice, Payment, BankTransaction } from '../src/types';

// ---------------------------------------------------------------------
// Part 1: classifyBankRow -- pure unit tests
// ---------------------------------------------------------------------

const CUSTOMER: Customer = { id: 'CUS-001', fullName: 'Ahmed Al-Farsi' } as any;
const OPEN_INVOICE: Invoice = { id: 'INV-001', customerId: 'CUS-001', balanceDue: 5000, contractId: 'CON-001' } as any;
const RECORDED_PAYMENT: Payment = {
  id: 'PAY-001', customerId: 'CUS-001', customerName: 'Ahmed Al-Farsi', invoiceId: 'INV-001',
  amount: 5000, method: 'bank_transfer', referenceNumber: 'REF-999'
} as any;

function baseRow(overrides: Partial<{ date: string; description: string; reference: string; debit: number; credit: number }> = {}) {
  return { date: '2026-08-10', description: '', reference: '', debit: 0, credit: 0, ...overrides };
}

describe('classifyBankRow', () => {
  it('classifies an exact reference + amount match as matched (high confidence)', () => {
    const result = classifyBankRow({
      row: baseRow({ reference: 'REF-999', credit: 5000 }),
      customers: [CUSTOMER], invoices: [OPEN_INVOICE], payments: [RECORDED_PAYMENT], priorTransactions: []
    });
    expect(result.classification).toBe('matched');
    expect(result.suggestedMatch?.confidence).toBeGreaterThanOrEqual(90);
    expect(result.suggestedMatch?.invoiceId).toBe('INV-001');
  });

  it('classifies a reference match with a differing amount as amount_mismatch', () => {
    const result = classifyBankRow({
      row: baseRow({ reference: 'REF-999', credit: 4500 }),
      customers: [CUSTOMER], invoices: [OPEN_INVOICE], payments: [RECORDED_PAYMENT], priorTransactions: []
    });
    expect(result.classification).toBe('amount_mismatch');
    expect(result.reasonEn).toMatch(/differs/i);
  });

  it('classifies an ambiguous reference (matches more than one payment) as needs_review', () => {
    const secondPayment: Payment = { ...RECORDED_PAYMENT, id: 'PAY-002', amount: 1000 } as any;
    const result = classifyBankRow({
      row: baseRow({ reference: 'REF-999', credit: 5000 }),
      customers: [CUSTOMER], invoices: [OPEN_INVOICE], payments: [RECORDED_PAYMENT, secondPayment], priorTransactions: []
    });
    expect(result.classification).toBe('needs_review');
  });

  it('matches by customer name in the description against an exact open-invoice balance', () => {
    const result = classifyBankRow({
      row: baseRow({ description: 'TRANSFER FROM AHMED AL-FARSI', credit: 5000 }),
      customers: [CUSTOMER], invoices: [OPEN_INVOICE], payments: [], priorTransactions: []
    });
    expect(result.classification).toBe('matched');
    expect(result.suggestedMatch?.customerId).toBe('CUS-001');
  });

  it('flags a customer-identified row with the wrong amount as amount_mismatch', () => {
    const result = classifyBankRow({
      row: baseRow({ description: 'TRANSFER FROM AHMED AL-FARSI', credit: 999 }),
      customers: [CUSTOMER], invoices: [OPEN_INVOICE], payments: [], priorTransactions: []
    });
    expect(result.classification).toBe('amount_mismatch');
  });

  it('flags a customer-identified row with no open invoice as needs_review', () => {
    const result = classifyBankRow({
      row: baseRow({ description: 'TRANSFER FROM AHMED AL-FARSI', credit: 5000 }),
      customers: [CUSTOMER], invoices: [], payments: [], priorTransactions: []
    });
    expect(result.classification).toBe('needs_review');
  });

  it('classifies a credit nothing can explain as unrecorded_transfer', () => {
    const result = classifyBankRow({
      row: baseRow({ description: 'UNKNOWN INBOUND WIRE', credit: 750 }),
      customers: [CUSTOMER], invoices: [OPEN_INVOICE], payments: [], priorTransactions: []
    });
    expect(result.classification).toBe('unrecorded_transfer');
    expect(result.suggestedMatch).toBeUndefined();
  });

  it('routes a debit (money leaving the account) to needs_review, never to payment matching', () => {
    const result = classifyBankRow({
      row: baseRow({ description: 'BANK FEE', debit: 25 }),
      customers: [CUSTOMER], invoices: [OPEN_INVOICE], payments: [RECORDED_PAYMENT], priorTransactions: []
    });
    expect(result.classification).toBe('needs_review');
  });

  it('flags a row repeating an earlier (cross-batch) transaction as duplicate_transaction', () => {
    const priorTxn: BankTransaction = { id: 'BTX-0001', batchId: 'BATCH-OLD', date: '2026-08-10', reference: 'REF-999', debit: 0, credit: 5000, balance: 0, status: 'unmatched', reconciled: false } as any;
    const result = classifyBankRow({
      row: baseRow({ reference: 'REF-999', credit: 5000 }),
      customers: [], invoices: [], payments: [], priorTransactions: [priorTxn]
    });
    expect(result.classification).toBe('duplicate_transaction');
    expect(result.duplicateOfTransactionId).toBe('BTX-0001');
  });

  it('flags a same-date-and-amount row with no reference on either side as a duplicate too (safe default)', () => {
    const priorTxn: BankTransaction = { id: 'BTX-0002', batchId: 'BATCH-OLD', date: '2026-08-10', reference: '', debit: 0, credit: 300, balance: 0, status: 'unmatched', reconciled: false } as any;
    const result = classifyBankRow({
      row: baseRow({ credit: 300 }),
      customers: [], invoices: [], payments: [], priorTransactions: [priorTxn]
    });
    expect(result.classification).toBe('duplicate_transaction');
  });

  it('does NOT flag a duplicate when references differ even with the same date/amount', () => {
    const priorTxn: BankTransaction = { id: 'BTX-0003', batchId: 'BATCH-OLD', date: '2026-08-10', reference: 'REF-A', debit: 0, credit: 300, balance: 0, status: 'unmatched', reconciled: false } as any;
    const result = classifyBankRow({
      row: baseRow({ reference: 'REF-B', credit: 300 }),
      customers: [], invoices: [], payments: [], priorTransactions: [priorTxn]
    });
    expect(result.classification).not.toBe('duplicate_transaction');
  });
});

// ---------------------------------------------------------------------
// Part 2: findUnmatchedCrmPayments -- "دفعة غير موجودة بالبنك"
// ---------------------------------------------------------------------

describe('findUnmatchedCrmPayments', () => {
  const bankVisiblePayment: Payment = {
    id: 'PAY-010', customerId: 'CUS-001', customerName: 'Ahmed Al-Farsi', amount: 1200,
    method: 'bank_transfer', referenceNumber: 'REF-100', receivedAt: '2026-08-05'
  } as any;
  const cashPayment: Payment = {
    id: 'PAY-011', customerId: 'CUS-002', customerName: 'Sara Ali', amount: 400,
    method: 'cash', referenceNumber: '', receivedAt: '2026-08-05'
  } as any;

  it('flags a bank-visible payment that never appears in the statement', () => {
    const entries = findUnmatchedCrmPayments([], [bankVisiblePayment], '2026-08-01', '2026-08-10');
    expect(entries).toHaveLength(1);
    expect(entries[0].paymentId).toBe('PAY-010');
  });

  it('does not flag a payment method that would never appear on a bank statement (cash)', () => {
    const entries = findUnmatchedCrmPayments([], [cashPayment], '2026-08-01', '2026-08-10');
    expect(entries).toHaveLength(0);
  });

  it('does not flag a bank-visible payment that IS found in the statement by reference', () => {
    const rows = [{ date: '2026-08-05', description: '', reference: 'REF-100', debit: 0, credit: 1200 }];
    const entries = findUnmatchedCrmPayments(rows, [bankVisiblePayment], '2026-08-01', '2026-08-10');
    expect(entries).toHaveLength(0);
  });

  it('ignores a payment outside the statement period', () => {
    const outOfPeriod: Payment = { ...bankVisiblePayment, id: 'PAY-012', receivedAt: '2026-01-01' } as any;
    const entries = findUnmatchedCrmPayments([], [outOfPeriod], '2026-08-01', '2026-08-10');
    expect(entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Part 3: bankStatementParsers -- CSV/Excel parsing
// ---------------------------------------------------------------------

describe('parseBankStatementCsv', () => {
  it('parses a well-formed CSV export with Date/Description/Reference/Debit/Credit columns', async () => {
    const csv = [
      'Date,Description,Reference,Debit,Credit,Balance',
      '10/08/2026,TRANSFER FROM CUSTOMER,REF-001,,5000,15000',
      '11/08/2026,BANK FEE,,25,,14975'
    ].join('\n');
    const result = await parseBankStatementCsv(Buffer.from(csv, 'utf8'));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ date: '2026-08-10', reference: 'REF-001', credit: 5000 });
    expect(result.rows[1]).toMatchObject({ date: '2026-08-11', debit: 25 });
  });

  it('parses a single Amount column with a Dr/Cr indicator', async () => {
    const csv = [
      'Date,Description,Amount,Type',
      '10-Aug-2026,INBOUND WIRE,2500,CR',
      '11-Aug-2026,SERVICE CHARGE,50,DR'
    ].join('\n');
    const result = await parseBankStatementCsv(Buffer.from(csv, 'utf8'));
    expect(result.rows[0]).toMatchObject({ credit: 2500, debit: 0 });
    expect(result.rows[1]).toMatchObject({ debit: 50, credit: 0 });
  });

  it('parses accounting-negative parentheses as a negative amount', async () => {
    const csv = ['Date,Description,Amount', '10-Aug-2026,REVERSAL,(150)'].join('\n');
    const result = await parseBankStatementCsv(Buffer.from(csv, 'utf8'));
    expect(result.rows[0].debit).toBe(150);
  });

  it('warns but still returns rows when the reference column is missing', async () => {
    const csv = ['Date,Description,Credit', '10-Aug-2026,DEPOSIT,100'].join('\n');
    const result = await parseBankStatementCsv(Buffer.from(csv, 'utf8'));
    expect(result.rows).toHaveLength(1);
    expect(result.warnings.some(w => /reference/i.test(w))).toBe(true);
  });

  it('throws a controlled error when no Date+Amount header can be detected', async () => {
    const csv = ['Foo,Bar,Baz', '1,2,3'].join('\n');
    await expect(parseBankStatementCsv(Buffer.from(csv, 'utf8'))).rejects.toThrow(/Could not detect a header row/i);
  });

  it('skips a row with an unparseable date and records a warning', async () => {
    const csv = ['Date,Description,Credit', 'not-a-date,DEPOSIT,100', '10-Aug-2026,DEPOSIT,200'].join('\n');
    const result = await parseBankStatementCsv(Buffer.from(csv, 'utf8'));
    expect(result.rows).toHaveLength(1);
    expect(result.warnings.some(w => /could not parse date/i.test(w))).toBe(true);
  });
});

describe('parseBankStatementExcel', () => {
  function bufferFromAoa(aoa: any[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Statement');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  it('parses a realistic Excel statement export with an account-summary banner row', async () => {
    const aoa = [
      ['Account No: AE090260001234567890'],
      ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'],
      ['10-Aug-2026', 'CUSTOMER TRANSFER', 'REF-777', '', 3000, 20000]
    ];
    const result = await parseBankStatementExcel(bufferFromAoa(aoa));
    expect(result.meta.accountNumber).toContain('AE09');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ date: '2026-08-10', reference: 'REF-777', credit: 3000 });
  });

  it('reads a genuine Excel date-typed cell the same as a text date', async () => {
    const aoa = [
      ['Date', 'Description', 'Credit'],
      [new Date(Date.UTC(2026, 7, 15)), 'DEPOSIT', 500]
    ];
    const result = await parseBankStatementExcel(bufferFromAoa(aoa));
    expect(result.rows[0].date).toBe('2026-08-15');
  });
});

// ---------------------------------------------------------------------
// Part 4: route-level tests against the real server.ts routes
// ---------------------------------------------------------------------

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
    initializeApp: (_opts: any) => { appsArr.push({}); },
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

const FINANCE_UID = 'finance-uid-bankrecon';

function csvBase64(lines: string[]): string {
  return Buffer.from(lines.join('\n'), 'utf8').toString('base64');
}

function authAs(uid: string) {
  adminMock.verifyIdToken.mockResolvedValueOnce({ uid });
  return { Authorization: 'Bearer test-token' };
}

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(FINANCE_UID, { role: 'finance', name: 'Test Finance' });

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

describe('POST /api/bank-batches -- preview never mutates the store', () => {
  it('returns a classified preview without writing any BankTransaction/BankImportBatch', async () => {
    const beforeTxns = globalStore.bankTransactions.length;
    const beforeBatches = globalStore.bankImportBatches.length;

    const csv = csvBase64(['Date,Description,Reference,Credit', '10-Aug-2026,UNKNOWN WIRE,,900']);
    const res = await request(app)
      .post('/api/bank-batches')
      .set(authAs(FINANCE_UID))
      .send({ fileName: 'statement.csv', fileBase64: csv });

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.transactions[0].matchClassification).toBe('unrecorded_transfer');
    expect(globalStore.bankTransactions.length).toBe(beforeTxns);
    expect(globalStore.bankImportBatches.length).toBe(beforeBatches);
  });
});

describe('POST /api/bank-batches -- confirmed import persists transactions but NEVER a Payment', () => {
  it('creates BankTransaction/BankImportBatch records and leaves globalStore.payments untouched', async () => {
    const beforePayments = globalStore.payments.length;
    const beforeTxns = globalStore.bankTransactions.length;

    const csv = csvBase64([
      'Date,Description,Reference,Credit',
      '10-Aug-2026,UNKNOWN INBOUND WIRE,,1234'
    ]);
    const res = await request(app)
      .post('/api/bank-batches')
      .set(authAs(FINANCE_UID))
      .send({ fileName: 'statement.csv', fileBase64: csv, confirm: true });

    expect(res.status).toBe(201);
    expect(res.body.preview).toBe(false);
    expect(globalStore.bankTransactions.length).toBe(beforeTxns + 1);
    // The absolute rule: importing/confirming a bank statement never creates a Payment.
    expect(globalStore.payments.length).toBe(beforePayments);
  });

  it('detects a within-batch duplicate: two identical rows in the same file', async () => {
    const csv = csvBase64([
      'Date,Description,Reference,Credit',
      '12-Aug-2026,DUPLICATE TEST ROW,REF-DUP-1,777',
      '12-Aug-2026,DUPLICATE TEST ROW,REF-DUP-1,777'
    ]);
    const res = await request(app)
      .post('/api/bank-batches')
      .set(authAs(FINANCE_UID))
      .send({ fileName: 'dup.csv', fileBase64: csv, confirm: true });

    expect(res.status).toBe(201);
    const classifications = res.body.transactions.map((t: any) => t.matchClassification);
    expect(classifications).toContain('duplicate_transaction');
    expect(res.body.batch.duplicateCount).toBeGreaterThanOrEqual(1);
  });

  it('detects a cross-batch duplicate against a previously confirmed import', async () => {
    const csv = csvBase64(['Date,Description,Reference,Credit', '13-Aug-2026,CROSS BATCH ROW,REF-XB-1,555']);
    const first = await request(app)
      .post('/api/bank-batches')
      .set(authAs(FINANCE_UID))
      .send({ fileName: 'xb1.csv', fileBase64: csv, confirm: true });
    expect(first.status).toBe(201);
    expect(first.body.transactions[0].matchClassification).not.toBe('duplicate_transaction');

    const second = await request(app)
      .post('/api/bank-batches')
      .set(authAs(FINANCE_UID))
      .send({ fileName: 'xb2.csv', fileBase64: csv, confirm: true });
    expect(second.status).toBe(201);
    expect(second.body.transactions[0].matchClassification).toBe('duplicate_transaction');
  });
});

describe('POST /api/bank-transactions/:id/reconcile -- manual approval & duplicate override', () => {
  it('rejects reconciling a transaction flagged as a duplicate without an override reason', async () => {
    const csv = csvBase64([
      'Date,Description,Reference,Credit',
      '14-Aug-2026,OVERRIDE TEST ROW,REF-OV-1,321',
      '14-Aug-2026,OVERRIDE TEST ROW,REF-OV-1,321'
    ]);
    const importRes = await request(app)
      .post('/api/bank-batches')
      .set(authAs(FINANCE_UID))
      .send({ fileName: 'override.csv', fileBase64: csv, confirm: true });
    const dupTxn = importRes.body.transactions.find((t: any) => t.matchClassification === 'duplicate_transaction');
    expect(dupTxn).toBeTruthy();

    const res = await request(app)
      .post(`/api/bank-transactions/${dupTxn.id}/reconcile`)
      .set(authAs(FINANCE_UID))
      .send({ targetRecordType: 'invoice', targetRecordId: '', classification: 'unclassified' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/duplicate/i);
    expect(globalStore.bankTransactions.find((t: any) => t.id === dupTxn.id).reconciled).toBe(false);
  });

  it('allows reconciling a duplicate-flagged transaction once an explicit override reason is supplied', async () => {
    const csv = csvBase64([
      'Date,Description,Reference,Credit',
      '15-Aug-2026,OVERRIDE TEST ROW 2,REF-OV-2,111',
      '15-Aug-2026,OVERRIDE TEST ROW 2,REF-OV-2,111'
    ]);
    const importRes = await request(app)
      .post('/api/bank-batches')
      .set(authAs(FINANCE_UID))
      .send({ fileName: 'override2.csv', fileBase64: csv, confirm: true });
    const dupTxn = importRes.body.transactions.find((t: any) => t.matchClassification === 'duplicate_transaction');

    const res = await request(app)
      .post(`/api/bank-transactions/${dupTxn.id}/reconcile`)
      .set(authAs(FINANCE_UID))
      .send({
        targetRecordType: 'invoice', targetRecordId: '', classification: 'unclassified',
        duplicateOverrideReason: 'Confirmed with the bank -- two genuinely separate transfers.'
      });

    expect(res.status).toBe(200);
    expect(res.body.transaction.reconciled).toBe(true);
  });

  it('a plain (non-duplicate) manual reconcile posts the invoice balance -- the only path that ever does', async () => {
    const customer = { id: 'CUS-RECON-1', fullName: 'Manual Approval Customer', outstandingBalance: 5000 };
    const invoice = { id: 'INV-RECON-1', customerId: customer.id, totalAmount: 5000, paidAmount: 0, balanceDue: 5000, status: 'unpaid' };
    globalStore.customers.push(customer as any);
    globalStore.invoices.push(invoice as any);

    const csv = csvBase64(['Date,Description,Reference,Credit', '16-Aug-2026,MANUAL APPROVAL ROW,,5000']);
    const importRes = await request(app)
      .post('/api/bank-batches')
      .set(authAs(FINANCE_UID))
      .send({ fileName: 'manual.csv', fileBase64: csv, confirm: true });
    const txn = importRes.body.transactions[0];
    expect(txn.reconciled).toBe(false); // never auto-confirmed by the import itself

    const res = await request(app)
      .post(`/api/bank-transactions/${txn.id}/reconcile`)
      .set(authAs(FINANCE_UID))
      .send({ targetRecordType: 'invoice', targetRecordId: invoice.id, classification: 'settlement' });

    expect(res.status).toBe(200);
    const updatedInvoice = globalStore.invoices.find((i: any) => i.id === invoice.id);
    expect(updatedInvoice.paidAmount).toBe(5000);
    expect(updatedInvoice.status).toBe('paid');
  });
});
