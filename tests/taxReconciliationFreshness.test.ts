/**
 * Tax Reconciliation freshness / concurrency regression tests.
 *
 * Runs only against the local Firestore emulator started by the repository's
 * normal test command. No production project or production data is touched.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomUUID } from 'crypto';
import type { JournalEntry } from '../src/accounting/types';
import type { TaxOfficialSource, TaxPeriod, TaxRuleVersion } from '../src/tax/types';
import { journalEvidenceHash } from '../src/server/taxReconciliationEvidence';
import { validateAuthoritativeReconciliationFreshness, validateCurrentPeriodGovernanceEvidence } from '../src/server/taxPeriodApi';

let admin: typeof import('firebase-admin');
let app: any;
let db: FirebaseFirestore.Firestore;

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-splendor-crm-rules-test';
const COLLECTIONS = [
  'tax_periods',
  'tax_reconciliation_snapshots',
  'tax_reconciliation_states',
  'tax_period_exceptions',
  'tax_official_sources',
  'tax_rule_versions',
  'tax_professional_validators',
  'accounting_journals',
  'invoices',
  'payments',
  'deposits',
  'supplier_invoices',
  'bank_transactions',
  'charges',
  'documents',
  'issued_documents'
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

  it('remains fail-closed when a ledger write races with period advancement under Firestore serialization', async () => {
    const period = await seedCleanPeriod();
    const periodRef = db.collection('tax_periods').doc(period.id);

    const transition = db.runTransaction(async tx => {
      const periodSnap = await tx.get(periodRef);
      const current = { id: periodSnap.id, ...periodSnap.data() } as TaxPeriod;
      const error = await validateAuthoritativeReconciliationFreshness(tx, db, current);
      if (error) throw new Error(error);
      tx.update(periodRef, { status: 'under_review' });
    });
    const ledgerWrite = db.collection('accounting_journals').doc('JRN-CONCURRENT').set(postedJournal('JRN-CONCURRENT'));

    const [transitionResult, ledgerResult] = await Promise.allSettled([transition, ledgerWrite]);
    expect(ledgerResult.status).toBe('fulfilled');

    const persistedSnap = await periodRef.get();
    const persisted = { id: persistedSnap.id, ...persistedSnap.data() } as TaxPeriod;
    const postRaceError = await db.runTransaction(tx => validateAuthoritativeReconciliationFreshness(tx, db, persisted));
    expect(postRaceError).toContain('authoritative posted accounting journals changed after the latest snapshot was captured');

    if (transitionResult.status === 'rejected') {
      expect(String(transitionResult.reason)).toContain('authoritative posted accounting journals changed after the latest snapshot was captured');
      expect(persisted.status).toBe('open');
    } else {
      expect(persisted.status).toBe('under_review');
    }
  }, 30000);
});

const GOVERNANCE_SOURCE_ID = 'SRC-VAT-GOVERNANCE';
const DEADLINE_SOURCE_ID = 'SRC-VAT-DEADLINE';
const GOVERNANCE_RULE_ID = 'TAXRULE-VAT-GOVERNANCE-V1';
const GOVERNANCE_REGISTRY_ID = 'PROFESSIONAL-REGISTRY-1';
const GOVERNANCE_EVIDENCE_ID = 'DOC-PROFESSIONAL-EVIDENCE-1';
const SOURCE_UPDATED_AT = '2098-12-01T00:00:00.000Z';
const RULE_UPDATED_AT = '2098-12-02T00:00:00.000Z';

async function seedGovernedPeriod(): Promise<TaxPeriod> {
  const source: TaxOfficialSource = {
    id: GOVERNANCE_SOURCE_ID,
    domain: 'VAT',
    authority: 'FTA',
    officialTitle: 'Synthetic official-source record for emulator testing only',
    officialUrl: 'https://tax.gov.ae/en/test-only',
    effectiveFrom: '2098-01-01',
    topics: ['synthetic-test'],
    interpretationRequired: true,
    status: 'validated',
    retrievedAt: SOURCE_UPDATED_AT,
    createdBy: 'SOURCE-PREPARER',
    createdByName: 'Source Preparer',
    createdAt: SOURCE_UPDATED_AT,
    validatedBy: 'SOURCE-REVIEWER',
    validatedByName: 'Source Reviewer',
    validatedAt: SOURCE_UPDATED_AT,
    updatedAt: SOURCE_UPDATED_AT
  };
  const deadlineSource: TaxOfficialSource = {
    ...source,
    id: DEADLINE_SOURCE_ID,
    officialTitle: 'Synthetic deadline source for emulator testing only'
  };
  const rule: TaxRuleVersion = {
    id: GOVERNANCE_RULE_ID,
    domain: 'VAT',
    code: 'VAT-GOVERNANCE',
    version: '1',
    title: 'Synthetic accepted rule for emulator governance testing only',
    description: 'Contains no legal or tax interpretation.',
    status: 'accepted',
    effectiveFrom: '2098-01-01',
    effectiveTo: '2099-12-31',
    sourceIds: [GOVERNANCE_SOURCE_ID],
    interpretationRequired: true,
    proposedBy: 'RULE-PREPARER',
    proposedByName: 'Rule Preparer',
    proposedAt: RULE_UPDATED_AT,
    professionalValidation: {
      validatorRegistryId: GOVERNANCE_REGISTRY_ID,
      validatorName: 'Synthetic External Reviewer',
      validatorCapacity: 'UAE_TAX_PROFESSIONAL',
      validationEvidenceDocumentId: GOVERNANCE_EVIDENCE_ID,
      scope: 'Synthetic emulator-only governance test; no tax interpretation.',
      validatedAt: RULE_UPDATED_AT
    },
    professionalValidationRecordedBy: 'RULE-REVIEWER',
    professionalValidationRecordedByName: 'Rule Reviewer',
    professionalValidationRecordedAt: RULE_UPDATED_AT,
    acceptedBy: 'RULE-APPROVER',
    acceptedByName: 'Rule Approver',
    acceptedAt: RULE_UPDATED_AT,
    updatedAt: RULE_UPDATED_AT
  };
  const period: TaxPeriod = {
    ...basePeriod(`TAXPERIOD-GOVERNANCE-${randomUUID()}`, journalEvidenceHash([])),
    deadlineSourceId: DEADLINE_SOURCE_ID,
    deadlineSourceVersionUpdatedAt: SOURCE_UPDATED_AT,
    ruleVersionIds: [GOVERNANCE_RULE_ID],
    ruleVersionUpdatedAtById: { [GOVERNANCE_RULE_ID]: RULE_UPDATED_AT },
    ruleSourceVersionUpdatedAtById: { [GOVERNANCE_SOURCE_ID]: SOURCE_UPDATED_AT }
  };

  await Promise.all([
    db.collection('tax_official_sources').doc(GOVERNANCE_SOURCE_ID).set(source),
    db.collection('tax_official_sources').doc(DEADLINE_SOURCE_ID).set(deadlineSource),
    db.collection('tax_rule_versions').doc(GOVERNANCE_RULE_ID).set(rule),
    db.collection('tax_professional_validators').doc(GOVERNANCE_REGISTRY_ID).set({
      status: 'active',
      validatorCapacity: 'UAE_TAX_PROFESSIONAL',
      validatorName: 'Synthetic External Reviewer',
      domains: ['VAT']
    }),
    db.collection('documents').doc(GOVERNANCE_EVIDENCE_ID).set({
      name: 'Synthetic professional evidence marker',
      createdAt: RULE_UPDATED_AT
    })
  ]);
  return period;
}

describe('Tax Period official-source and accepted-rule version freshness', () => {
  it('accepts unchanged, exactly pinned governance evidence', async () => {
    const period = await seedGovernedPeriod();
    const error = await db.runTransaction(tx => validateCurrentPeriodGovernanceEvidence(tx, db, period));
    expect(error).toBeNull();
  });

  it('rejects an accepted rule document changed after the period pin was captured', async () => {
    const period = await seedGovernedPeriod();
    await db.collection('tax_rule_versions').doc(GOVERNANCE_RULE_ID).update({ updatedAt: '2099-02-02T00:00:00.000Z' });
    const error = await db.runTransaction(tx => validateCurrentPeriodGovernanceEvidence(tx, db, period));
    expect(error).toContain(`Accepted tax rule ${GOVERNANCE_RULE_ID} changed`);
  });

  it('rejects a supporting official source changed after the period pin was captured', async () => {
    const period = await seedGovernedPeriod();
    await db.collection('tax_official_sources').doc(GOVERNANCE_SOURCE_ID).update({ updatedAt: '2099-02-03T00:00:00.000Z' });
    const error = await db.runTransaction(tx => validateCurrentPeriodGovernanceEvidence(tx, db, period));
    expect(error).toContain(`Official source ${GOVERNANCE_SOURCE_ID} supporting an accepted tax rule changed`);
  });

  it('rejects accepted-rule evidence after the professional registry is deactivated', async () => {
    const period = await seedGovernedPeriod();
    await db.collection('tax_professional_validators').doc(GOVERNANCE_REGISTRY_ID).update({ status: 'inactive' });
    const error = await db.runTransaction(tx => validateCurrentPeriodGovernanceEvidence(tx, db, period));
    expect(error).toContain('registry record is not active and eligible');
  });

  it('fails closed when version pins are absent', async () => {
    const period = await seedGovernedPeriod();
    delete period.ruleVersionUpdatedAtById;
    const error = await db.runTransaction(tx => validateCurrentPeriodGovernanceEvidence(tx, db, period));
    expect(error).toContain('missing exact accepted-rule/source version pins');
  });
});
