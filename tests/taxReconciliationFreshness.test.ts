/**
 * Tax Reconciliation freshness / concurrency regression tests.
 *
 * Runs only against the local Firestore emulator started by the repository's
 * normal test command. No production project or production data is touched.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomUUID } from 'crypto';
import type { JournalEntry } from '../src/accounting/types';
import type { TaxPeriod } from '../src/tax/types';
import { journalEvidenceHash } from '../src/server/taxReconciliationEvidence';
import { validateAuthoritativeReconciliationFreshness } from '../src/server/taxPeriodApi';

let admin: typeof import('firebase-admin');
let app: any;
let db: FirebaseFirestore.Firestore;

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-splendor-crm-rules-test';
const COLLECTIONS = [
  'tax_periods',
  'tax_reconciliation_snapshots',
  'tax_period_exceptions',
  'accounting_journals',
  'invoices',
  'payments',
  'deposits',
  'supplier_invoices',
  'bank_transactions'
];

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set -- run through the repository test command.');
  }

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const fakeServiceAccount = {
    type: 'service_account',
    project_id: PROJECT_ID,
    private_key_id: 'test-key',
    private_key: privateKey,
    client_email: `tax-reconciliation-test@${PROJECT_ID}.iam.gserviceaccount.com`,
    client_id: '000000000000000000000',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token'
  };

  const adminModule = await import('firebase-admin');
  admin = adminModule.default ?? (adminModule as any);
  app = admin.initializeApp(
    { credential: admin.credential.cert(fakeServiceAccount as any), projectId: PROJECT_ID },
    `tax-reconciliation-freshness-${randomUUID()}`
  );
  db = admin.firestore(app);
});

afterAll(async () => {
  if (app) await app.delete();
});

async function clearCollection(name: string) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map(doc => doc.ref.delete()));
}

afterEach(async () => {
  await Promise.all(COLLECTIONS.map(clearCollection));
});

function basePeriod(id: string, hash: string): TaxPeriod {
  return {
    id,
    domain: 'VAT',
    periodStart: '2099-01-01',
    periodEnd: '2099-01-31',
    filingDeadline: '2099-02-28',
    deadlineBasis: 'OFFICIAL_SOURCE',
    deadlineSourceId: 'SYNTHETIC-SOURCE',
    deadlineSourceVersionUpdatedAt: '2099-01-01T00:00:00.000Z',
    taxProfileVersionUpdatedAt: '2099-01-01T00:00:00.000Z',
    status: 'open',
    ruleVersionIds: [],
    blockingExceptionCount: 0,
    governanceReadiness: 'IN_PREPARATION',
    createdBy: 'PREPARER-A',
    createdByName: 'Synthetic Preparer',
    createdAt: '2099-01-01T00:00:00.000Z',
    updatedAt: '2099-02-01T00:00:00.000Z',
    preparationStartedBy: 'PREPARER-A',
    preparationStartedByName: 'Synthetic Preparer',
    preparationStartedAt: '2099-01-01T00:00:00.000Z',
    latestReconciliationSnapshotId: `${id}-REC-1`,
    latestReconciliationCapturedAt: '2099-02-01T00:00:00.000Z',
    latestReconciliationPostingGapCount: 0,
    latestReconciliationLedgerEvidenceHash: hash
  };
}

async function seedCleanPeriod(id = `TAXPERIOD-SYNTH-${randomUUID()}`): Promise<TaxPeriod> {
  const hash = journalEvidenceHash([]);
  const period = basePeriod(id, hash);
  await db.collection('tax_periods').doc(id).set(period);
  await db.collection('tax_reconciliation_snapshots').doc(period.latestReconciliationSnapshotId!).set({
    id: period.latestReconciliationSnapshotId,
    periodId: id,
    domain: 'VAT',
    version: 1,
    status: 'captured',
    ledgerEvidenceHash: hash,
    postingGapCount: 0
  });
  return period;
}

function postedJournal(id: string): JournalEntry {
  return {
    id,
    date: '2099-01-15',
    periodKey: '2099-01',
    currency: 'AED',
    sourceType: 'Manual',
    sourceId: `SRC-${id}`,
    sourceAction: 'post',
    status: 'posted',
    description: 'Synthetic reconciliation concurrency journal',
    totalDebit: 100,
    totalCredit: 100,
    lines: [
      { accountCode: '1000', debit: 100, credit: 0 },
      { accountCode: '2000', debit: 0, credit: 100 }
    ],
    createdAt: '2099-01-15T00:00:00.000Z',
    createdBy: 'SYSTEM-TEST'
  } as JournalEntry;
}

describe('Tax Reconciliation authoritative freshness gate', () => {
  it('accepts an unchanged zero-gap snapshot', async () => {
    const period = await seedCleanPeriod();
    const error = await db.runTransaction(tx => validateAuthoritativeReconciliationFreshness(tx, db, period));
    expect(error).toBeNull();
  });

  it('rejects a previously clean snapshot after a posted journal changes the authoritative ledger', async () => {
    const period = await seedCleanPeriod();
    await db.collection('accounting_journals').doc('JRN-NEW').set(postedJournal('JRN-NEW'));

    const error = await db.runTransaction(tx => validateAuthoritativeReconciliationFreshness(tx, db, period));
    expect(error).toContain('authoritative posted accounting journals changed after the latest snapshot was captured');
  });

  it('rejects a previously clean snapshot when a new authoritative source record creates a posting gap', async () => {
    const period = await seedCleanPeriod();
    await db.collection('invoices').doc('INV-GAP').set({
      issueDate: '2099-01-20',
      status: 'issued',
      totalAmount: 500
    });

    const error = await db.runTransaction(tx => validateAuthoritativeReconciliationFreshness(tx, db, period));
    expect(error).toContain('authoritative posting gaps changed after the latest snapshot was captured');
  });

  it('fails closed if stored blocker count diverges from authoritative open exceptions', async () => {
    const period = await seedCleanPeriod();
    await db.collection('tax_period_exceptions').doc('EX-OPEN').set({
      periodId: period.id,
      status: 'open',
      category: 'MISSING_EVIDENCE'
    });

    const error = await db.runTransaction(tx => validateAuthoritativeReconciliationFreshness(tx, db, period));
    expect(error).toContain('blocking exception count is inconsistent with authoritative open exceptions');
  });

  it('serializes an advancing period against a concurrent ledger write and refuses stale evidence on retry', async () => {
    const period = await seedCleanPeriod();
    const periodRef = db.collection('tax_periods').doc(period.id);

    let releaseFirstAttempt!: () => void;
    let firstAttemptReady!: () => void;
    const release = new Promise<void>(resolve => { releaseFirstAttempt = resolve; });
    const ready = new Promise<void>(resolve => { firstAttemptReady = resolve; });
    let attempts = 0;

    const transition = db.runTransaction(async tx => {
      attempts += 1;
      const periodSnap = await tx.get(periodRef);
      const current = { id: periodSnap.id, ...periodSnap.data() } as TaxPeriod;
      const error = await validateAuthoritativeReconciliationFreshness(tx, db, current);
      if (error) throw new Error(error);

      if (attempts === 1) {
        firstAttemptReady();
        await release;
      }

      tx.update(periodRef, { status: 'under_review' });
    });

    await ready;
    await db.collection('accounting_journals').doc('JRN-CONCURRENT').set(postedJournal('JRN-CONCURRENT'));
    releaseFirstAttempt();

    await expect(transition).rejects.toThrow('authoritative posted accounting journals changed after the latest snapshot was captured');
    expect(attempts).toBeGreaterThanOrEqual(2);
    const persisted = await periodRef.get();
    expect(persisted.data()?.status).toBe('open');
  }, 30000);
});
