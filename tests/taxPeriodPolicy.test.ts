import { describe, expect, it } from 'vitest';
import {
  filingActionsRemainBlocked,
  periodsOverlap,
  validateCloseTaxPeriod,
  validateIndependentReview,
  validateOpenTaxPeriod,
  validateRecordPeriodProfessionalValidation,
  validateSubmitForReview,
  validateTaxPeriodDraft
} from '../src/server/taxPeriodPolicy';
import type {
  TaxMasterProfile,
  TaxOfficialSource,
  TaxPeriod,
  TaxProfessionalValidation
} from '../src/tax/types';

const profile: TaxMasterProfile = {
  id: 'splendor',
  legalEntityName: 'SPLENDOR CAR RENTAL LLC',
  vatRegistrationStatus: 'registered',
  corporateTaxRegistrationStatus: 'registered',
  vatTaxGroupStatus: 'unknown',
  corporateTaxGroupStatus: 'unknown',
  effectiveFrom: '2099-01-01',
  verificationStatus: 'internally_verified',
  verifiedBy: 'admin-test',
  verifiedAt: '2099-01-02T10:00:00.000Z',
  updatedBy: 'admin-test',
  updatedByName: 'Admin Test',
  updatedAt: '2099-01-02T10:00:00.000Z'
};

const source: TaxOfficialSource = {
  id: 'SRC-DEADLINE-SYNTHETIC',
  domain: 'VAT',
  authority: 'FTA',
  officialTitle: 'Synthetic official-source fixture',
  officialUrl: 'https://tax.gov.ae/synthetic-test-fixture',
  topics: ['synthetic filing deadline fixture'],
  interpretationRequired: false,
  status: 'validated',
  retrievedAt: '2099-01-02T10:00:00.000Z',
  createdBy: 'admin-test',
  createdByName: 'Admin Test',
  createdAt: '2099-01-02T10:00:00.000Z',
  validatedBy: 'ceo-test',
  validatedByName: 'CEO Test',
  validatedAt: '2099-01-02T11:00:00.000Z',
  updatedAt: '2099-01-02T11:00:00.000Z'
};

const period: TaxPeriod = {
  id: 'TAXPERIOD-VAT-SYNTHETIC-LIFECYCLE',
  domain: 'VAT',
  periodStart: '2099-04-01',
  periodEnd: '2099-04-30',
  filingDeadline: '2099-05-15',
  deadlineBasis: 'EMARATAX_CONFIRMED',
  deadlineSourceId: source.id,
  deadlineSourceVersionUpdatedAt: source.updatedAt,
  deadlineEvidenceReference: 'EMARATAX-SYNTHETIC-TEST-EVIDENCE',
  taxProfileVersionUpdatedAt: profile.updatedAt,
  status: 'draft',
  ruleVersionIds: [],
  blockingExceptionCount: 0,
  governanceReadiness: 'DRAFT',
  createdBy: 'finance-test',
  createdByName: 'Finance Test',
  createdAt: '2099-03-01T12:00:00.000Z',
  updatedAt: '2099-03-01T12:00:00.000Z'
};

const reconciliationEvidence = {
  latestReconciliationSnapshotId: 'TAXREC-SYNTHETIC-CLEAN',
  latestReconciliationCapturedAt: '2099-05-01T07:00:00.000Z',
  latestReconciliationPostingGapCount: 0,
  latestReconciliationLedgerEvidenceHash: 'synthetic-ledger-hash'
} as const;

const professionalValidation: TaxProfessionalValidation = {
  validatorRegistryId: 'TP-REGISTRY-SYNTHETIC-001',
  validatorName: 'External UAE Tax Professional',
  validatorCapacity: 'UAE_TAX_PROFESSIONAL',
  validationReference: 'VALIDATION-SYNTHETIC-REF',
  validationEvidenceDocumentId: 'TAX-EVIDENCE-PERIOD-SYNTHETIC-001',
  scope: 'Synthetic tax period review fixture',
  validatedAt: '2099-05-10T10:00:00.000Z'
};

describe('Tax period lifecycle policy', () => {
  it('requires verified profile evidence and the exact validated deadline-source version', () => {
    expect(validateTaxPeriodDraft(period, profile, source)).toBeNull();
    expect(validateTaxPeriodDraft(period, { ...profile, verificationStatus: 'unverified' }, source)).toContain('internally verified');
    expect(validateTaxPeriodDraft({ ...period, taxProfileVersionUpdatedAt: 'older-version' }, profile, source)).toContain('exact verified Tax Master Profile version');
    expect(validateTaxPeriodDraft(period, profile, { ...source, status: 'proposed' })).toContain('must be validated');
    expect(validateTaxPeriodDraft({ ...period, deadlineSourceVersionUpdatedAt: 'older-source-version' }, profile, source)).toContain('exact validated official-source version');
  });

  it('requires durable evidence for portal-confirmed or special-notice deadlines', () => {
    expect(validateTaxPeriodDraft({ ...period, deadlineEvidenceReference: undefined, deadlineEvidenceDocumentId: undefined }, profile, source)).toContain('durable portal reference');
    expect(validateTaxPeriodDraft({ ...period, deadlineBasis: 'SPECIAL_OFFICIAL_NOTICE', deadlineEvidenceReference: undefined, deadlineEvidenceDocumentId: undefined }, profile, source)).toContain('specific notice reference');
  });

  it('rejects impossible date order and overlapping periods in the same tax domain', () => {
    expect(validateTaxPeriodDraft({ ...period, periodEnd: '2099-03-31' }, profile, source)).toContain('cannot be before');
    expect(validateTaxPeriodDraft({ ...period, filingDeadline: '2099-04-15' }, profile, source)).toContain('cannot be before');
    expect(periodsOverlap(period, { ...period, id: 'OTHER', periodStart: '2099-04-15', periodEnd: '2099-05-31' })).toBe(true);
    expect(periodsOverlap(period, { ...period, id: 'CT', domain: 'CORPORATE_TAX' })).toBe(false);
  });

  it('enforces reconciliation evidence before Draft -> Open -> Under Review can advance to review', () => {
    const finance = { uid: 'finance-test', name: 'Finance Test', role: 'finance' as const };
    const admin = { uid: 'admin-test', name: 'Admin Test', role: 'admin' as const };
    expect(validateOpenTaxPeriod(period, finance)).toBeNull();

    const openWithoutReconciliation: TaxPeriod = {
      ...period,
      status: 'open',
      governanceReadiness: 'IN_PREPARATION',
      preparationStartedBy: finance.uid,
      preparationStartedByName: finance.name,
      preparationStartedAt: '2099-05-01T08:00:00.000Z'
    };
    expect(validateSubmitForReview(openWithoutReconciliation, finance)).toContain('Tax Reconciliation evidence snapshot');

    const open: TaxPeriod = { ...openWithoutReconciliation, ...reconciliationEvidence };
    expect(validateSubmitForReview(open, finance)).toBeNull();
    expect(validateSubmitForReview(open, { ...finance, uid: 'finance-other' })).toContain('Only the preparer');
    expect(validateSubmitForReview({ ...open, latestReconciliationPostingGapCount: 1 }, finance)).toContain('posting gaps must be zero');

    const underReview: TaxPeriod = {
      ...open,
      status: 'under_review',
      governanceReadiness: 'INTERNAL_REVIEW',
      preparedBy: finance.uid,
      preparedByName: finance.name,
      preparedAt: '2099-05-02T08:00:00.000Z',
      reviewStatus: 'pending'
    };
    expect(validateIndependentReview(underReview, admin)).toBeNull();
    expect(validateIndependentReview(underReview, { uid: finance.uid, name: finance.name, role: 'admin' })).toContain('Four-Eyes');
    expect(validateIndependentReview({ ...underReview, blockingExceptionCount: 1 }, admin)).toContain('Blocking exceptions');
  });

  it('requires external professional-validation evidence, clean reconciliation, and no blockers before closure', () => {
    const admin = { uid: 'admin-test', name: 'Admin Test', role: 'admin' as const };
    const ready: TaxPeriod = {
      ...period,
      ...reconciliationEvidence,
      status: 'ready_for_professional_review',
      governanceReadiness: 'AWAITING_PROFESSIONAL_VALIDATION',
      preparedBy: 'finance-test',
      reviewedBy: 'admin-other',
      reviewStatus: 'passed'
    };
    expect(validateRecordPeriodProfessionalValidation(ready, admin, professionalValidation)).toBeNull();
    expect(validateRecordPeriodProfessionalValidation({ ...ready, blockingExceptionCount: 1 }, admin, professionalValidation)).toContain('Blocking exceptions');

    const validated: TaxPeriod = {
      ...ready,
      status: 'professionally_validated',
      governanceReadiness: 'PROFESSIONALLY_VALIDATED',
      professionalValidation
    };
    expect(validateCloseTaxPeriod(validated, admin)).toBeNull();
    expect(validateCloseTaxPeriod({ ...validated, professionalValidation: undefined }, admin)).toContain('evidence is required');
    expect(validateCloseTaxPeriod({ ...validated, blockingExceptionCount: 1 }, admin)).toContain('Blocking exceptions');
  });

  it('never treats a professionally validated or closed period as filed', () => {
    expect(filingActionsRemainBlocked(period)).toContain('No filing or submission API exists');
    expect(filingActionsRemainBlocked({ ...period, status: 'closed', governanceReadiness: 'CLOSED' })).toContain('does not represent a filed return');
  });
});