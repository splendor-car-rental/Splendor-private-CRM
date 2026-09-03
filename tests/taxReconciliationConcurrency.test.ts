/**
 * Firestore-emulator concurrency tests for Tax Compliance aggregate updates.
 * No production project or production data is contacted.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TaxActor } from '../src/server/taxCompliancePolicy';
import { createException, resolveException } from '../src/server/taxExceptionApi';
import { captureReconciliation, resolvePostingGapBlocker } from '../src/server/taxReconciliationApi';
import type { TaxPeriod } from '../src/tax/types';

let admin: typeof import('firebase-admin');
let app: any;
let createdApp = false;
let db: FirebaseFirestore.Firestore;

// A dedicated emulator project namespace prevents parallel test files from
// clearing or counting this suite's transaction/audit documents.
const PROJECT_ID = 'demo-splendor-tax-concurrency-test';
const COLLECTIONS = [
  'tax_periods',
  'tax_period_exceptions',
  'tax_reconciliation_snapshots',
  'tax_reconciliation_states',
  'tax_audit_events',
  'accounting_journals',
  'invoices',
  'payments',
  'deposits',
  'supplier_invoices',
  'bank_transactions',
  'charges'
];

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set -- run through the repository test command.');
  }
  const adminModule = await import('firebase-admin');
  admin = adminModule.default ?? (adminModule as any);
  try {
    app = admin.app();
  } catch {
    app = admin.initializeApp({ projectId: PROJECT_ID });
    createdApp = true;
  }
  db = admin.firestore(app);
});

afterAll(async () => {
  if (createdApp && app) await app.delete();
});

async function clearCollection(name: string) {
  const snapshot = await db.collection(name).get();
  await Promise.all(snapshot.docs.map(document => document.ref.delete()));
}

afterEach(async () => {
  await Promise.all(COLLECTIONS.map(clearCollection));
});

function openPeriod(id: string): TaxPeriod {
  return {
    id,
    domain: 'VAT',
    periodStart: '2099-04-01',
    periodEnd: '2099-04-30',
    filingDeadline: '2099-05-28',
    deadlineBasis: 'OFFICIAL_SOURCE',
    deadlineSourceId: 'SYNTHETIC-EMULATOR-SOURCE',
    deadlineSourceVersionUpdatedAt: '2099-03-01T00:00:00.000Z',
    taxProfileVersionUpdatedAt: '2099-03-01T00:00:00.000Z',
    status: 'open',
    ruleVersionIds: [],
    blockingExceptionCount: 0,
    governanceReadiness: 'IN_PREPARATION',
    preparationStartedBy: 'finance-preparer',
    preparationStartedByName: 'Finance Preparer',
    preparationStartedAt: '2099-05-01T00:00:00.000Z',
    createdBy: 'finance-preparer',
    createdByName: 'Finance Preparer',
    createdAt: '2099-03-01T00:00:00.000Z',
    updatedAt: '2099-05-01T00:00:00.000Z'
  };
}

const preparer: TaxActor = { uid: 'finance-preparer', name: 'Finance Preparer', role: 'finance' };
const reviewerA: TaxActor = { uid: 'admin-reviewer-a', name: 'Admin Reviewer A', role: 'admin' };
const reviewerB: TaxActor = { uid: 'ceo-reviewer-b', name: 'CEO Reviewer B', role: 'ceo' };

function responseRecorder() {
  const state = { status: 200, body: undefined as any };
  const res: any = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    }
  };
  return { res, state };
}

async function invoke(
  operation: (req: any, res: any, actor: TaxActor) => Promise<any>,
  actor: TaxActor,
  body: Record<string, unknown>,
  query: Record<string, unknown> = {}
) {
  const { res, state } = responseRecorder();
  await operation({ body, query } as any, res, actor);
  return state;
}

describe('Tax Reconciliation transaction serialization', () => {
  it('keeps snapshot versions, the managed blocker, blocker count, and audit events consistent under concurrent capture/review', async () => {
    const period = openPeriod(`TAXPERIOD-CONCURRENT-RECON-${randomUUID()}`);
    await Promise.all([
      db.collection('tax_periods').doc(period.id).set(period),
      db.collection('invoices').doc('INV-CONCURRENT-GAP').set({
        issueDate: '2099-04-15',
        status: 'issued',
        totalAmount: 525
      })
    ]);

    const captures = await Promise.all([
      invoke(captureReconciliation, preparer, { periodId: period.id }),
      invoke(captureReconciliation, preparer, { periodId: period.id })
    ]);
    expect(captures.map(result => result.status)).toEqual([201, 201]);

    const [capturedSnapshots, openBlockers, stateAfterCapture, periodAfterCapture, auditsAfterCapture] = await Promise.all([
      db.collection('tax_reconciliation_snapshots').where('periodId', '==', period.id).get(),
      db.collection('tax_period_exceptions').where('periodId', '==', period.id).get(),
      db.collection('tax_reconciliation_states').doc(period.id).get(),
      db.collection('tax_periods').doc(period.id).get(),
      db.collection('tax_audit_events').get()
    ]);
    expect(capturedSnapshots.docs.map(doc => Number(doc.data().version)).sort()).toEqual([1, 2]);
    expect(openBlockers.size).toBe(1);
    expect(openBlockers.docs[0].data()).toMatchObject({
      status: 'open',
      managedBy: 'TAX_RECONCILIATION',
      managedKey: 'POSTING_GAPS'
    });
    expect(stateAfterCapture.data()).toMatchObject({ lastVersion: 2 });
    expect(periodAfterCapture.data()).toMatchObject({ blockingExceptionCount: 1, latestReconciliationPostingGapCount: 1 });
    expect(auditsAfterCapture.size).toBe(5);

    await db.collection('invoices').doc('INV-CONCURRENT-GAP').update({ status: 'cancelled' });
    const reviews = await Promise.all([
      invoke(resolvePostingGapBlocker, reviewerA, { periodId: period.id }),
      invoke(resolvePostingGapBlocker, reviewerB, { periodId: period.id })
    ]);
    expect(reviews.map(result => result.status).sort()).toEqual([200, 400]);

    const [allSnapshots, resolvedBlockers, finalState, finalPeriod, finalAudits] = await Promise.all([
      db.collection('tax_reconciliation_snapshots').where('periodId', '==', period.id).get(),
      db.collection('tax_period_exceptions').where('periodId', '==', period.id).get(),
      db.collection('tax_reconciliation_states').doc(period.id).get(),
      db.collection('tax_periods').doc(period.id).get(),
      db.collection('tax_audit_events').get()
    ]);
    expect(allSnapshots.docs.map(doc => Number(doc.data().version)).sort()).toEqual([1, 2, 3]);
    expect(allSnapshots.docs.filter(doc => doc.data().status === 'reviewed_clean')).toHaveLength(1);
    expect(resolvedBlockers.size).toBe(1);
    expect(resolvedBlockers.docs[0].data()).toMatchObject({ status: 'resolved' });
    expect(finalState.data()).toMatchObject({ lastVersion: 3 });
    expect(finalPeriod.data()).toMatchObject({ blockingExceptionCount: 0, latestReconciliationPostingGapCount: 0 });
    expect(finalAudits.size).toBe(8);
  }, 30000);
});

describe('Tax Blocking Exception aggregate serialization', () => {
  it('keeps the exact authoritative blocker count during concurrent create and resolve operations', async () => {
    const period = openPeriod(`TAXPERIOD-CONCURRENT-EXCEPTIONS-${randomUUID()}`);
    await db.collection('tax_periods').doc(period.id).set(period);

    const creates = await Promise.all([
      invoke(createException, preparer, {
        periodId: period.id,
        category: 'MISSING_EVIDENCE',
        title: 'Missing evidence A',
        description: 'Synthetic concurrency evidence A.'
      }),
      invoke(createException, preparer, {
        periodId: period.id,
        category: 'RECONCILIATION_DIFFERENCE',
        title: 'Difference B',
        description: 'Synthetic concurrency evidence B.'
      })
    ]);
    expect(creates.map(result => result.status)).toEqual([201, 201]);

    const createdExceptions = await db.collection('tax_period_exceptions').where('periodId', '==', period.id).get();
    expect(createdExceptions.size).toBe(2);
    expect((await db.collection('tax_periods').doc(period.id).get()).data()?.blockingExceptionCount).toBe(2);

    const [exceptionA, exceptionB] = createdExceptions.docs.map(doc => doc.id);
    const resolves = await Promise.all([
      invoke(resolveException, reviewerA, {
        exceptionId: exceptionA,
        resolutionNote: 'Independent resolution A.',
        resolutionReference: 'SYNTHETIC-REF-A'
      }),
      invoke(resolveException, reviewerB, {
        exceptionId: exceptionB,
        resolutionNote: 'Independent resolution B.',
        resolutionReference: 'SYNTHETIC-REF-B'
      })
    ]);
    expect(resolves.map(result => result.status)).toEqual([200, 200]);

    const finalExceptions = await db.collection('tax_period_exceptions').where('periodId', '==', period.id).get();
    expect(finalExceptions.docs.every(doc => doc.data().status === 'resolved')).toBe(true);
    expect((await db.collection('tax_periods').doc(period.id).get()).data()?.blockingExceptionCount).toBe(0);
  }, 30000);

  it('creates one deterministic blocker and one audit sequence for concurrent identical requests', async () => {
    const period = openPeriod(`TAXPERIOD-IDEMPOTENT-EXCEPTION-${randomUUID()}`);
    await db.collection('tax_periods').doc(period.id).set(period);
    const body = {
      periodId: period.id,
      category: 'MISSING_EVIDENCE',
      title: 'Same missing evidence',
      description: 'The exact same request is sent twice concurrently.'
    };

    const results = await Promise.all([
      invoke(createException, preparer, body),
      invoke(createException, preparer, body)
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 201]);
    expect((await db.collection('tax_period_exceptions').where('periodId', '==', period.id).get()).size).toBe(1);
    expect((await db.collection('tax_periods').doc(period.id).get()).data()?.blockingExceptionCount).toBe(1);
    expect((await db.collection('tax_audit_events').get()).size).toBe(2);
  }, 30000);
});
