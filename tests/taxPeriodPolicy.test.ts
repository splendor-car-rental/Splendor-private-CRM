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
  effectiveFrom: '2026-01-01',
  verificationStatus: 'internally_verified',
  verifiedBy: 'admin-1',
  verifiedAt: '2026-09-02T10:00:00.000Z',
  updatedBy: 'admin-1',
  updatedByName: 'Admin',
  updatedAt: '2026-09-02T10:00:00.000Z'
};

const source: TaxOfficialSource = {
  id: 'SRC-DEADLINE-1',
  domain: 'VAT',
  authority: 'FTA',
  officialTitle: 'Official filing deadline source',
  officialUrl: 'https://tax.gov.ae/official-deadline',
  topics: ['filing deadline'],
  interpretationRequired: false,
  status: 'validated',
  retrievedAt: '2026-09-02T10:00:00.000Z',
  createdBy: 'admin-1',
  createdByName: 'Admin',
  createdAt: '2026-09-02T10:00:00.000Z',
  validatedBy: 'ceo-1',
  validatedByName: 'CEO',
  validatedAt: '2026-09-02T11:00:00.000Z',
  updatedAt: '2026-09-02T11:00:00.000Z'
};

const period: TaxPeriod = {
  id: 'TAXPERIOD-VAT-2026Q3',
  domain: 'VAT',
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  filingDeadline: '2026-10-28',
  deadlineBasis: 'EMARATAX_CONFIRMED',
  deadlineSourceId: source.id,
  deadlineSourceVersionUpdatedAt: source.updatedAt,
  deadlineEvidenceReference: 'EMARATAX-PERIOD-SCREEN-2026Q3',
  taxProfileVersionUpdatedAt: profile.updatedAt,
  status: 'draft',
  ruleVersionIds: [],
  blockingExceptionCount: 0,
  governanceReadiness: 'DRAFT',
  createdBy: 'finance-1',
  createdByName: 'Finance',
  createdAt: '2026-09-02T12:00:00.000Z',
  updatedAt: '2026-09-02T12:00:00.000Z'
};

const professionalValidation: TaxProfessionalValidation = {
  validatorName: 'External UAE Tax Professional',
  validatorCapacity: 'UAE_TAX_PROFESSIONAL',
  validationReference: 'VALIDATION-REF-1',
  scope: 'Tax period review',
  validatedAt: '2026-10-20T10:00:00.000Z'
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
    expect(validateTaxPeriodDraft({ ...period, periodEnd: '2026-06-30' }, profile, source)).toContain('cannot be before');
    expect(validateTaxPeriodDraft({ ...period, filingDeadline: '2026-09-01' }, profile, source)).toContain('cannot be before');
    expect(periodsOverlap(period, { ...period, id: 'OTHER', periodStart: '2026-09-15', periodEnd: '2026-12-31' })).toBe(true);
    expect(periodsOverlap(period, { ...period, id: 'CT', domain: 'CORPORATE_TAX' })).toBe(false);
  });

  it('enforces Draft -> Open -> Under Review with preparer ownership and Four-Eyes review', () => {
    const finance = { uid: 'finance-1', name: 'Finance', role: 'finance' as const };
    const admin = { uid: 'admin-1', name: 'Admin', role: 'admin' as const };
    expect(validateOpenTaxPeriod(period, finance)).toBeNull();

    const open: TaxPeriod = {
      ...period,
      status: 'open',
      governanceReadiness: 'IN_PREPARATION',
      preparationStartedBy: finance.uid,
      preparationStartedByName: finance.name,
      preparationStartedAt: '2026-10-01T08:00:00.000Z'
    };
    expect(validateSubmitForReview(open, finance)).toBeNull();
    expect(validateSubmitForReview(open, { ...finance, uid: 'finance-2' })).toContain('Only the preparer');

    const underReview: TaxPeriod = {
      ...open,
      status: 'under_review',
      governanceReadiness: 'INTERNAL_REVIEW',
      preparedBy: finance.uid,
      preparedByName: finance.name,
      preparedAt: '2026-10-10T08:00:00.000Z',
      reviewStatus: 'pending'
    };
    expect(validateIndependentReview(underReview, admin)).toBeNull();
    expect(validateIndependentReview(underReview, { uid: finance.uid, name: finance.name, role: 'admin' })).toContain('Four-Eyes');
    expect(validateIndependentReview({ ...underReview, blockingExceptionCount: 1 }, admin)).toContain('Blocking exceptions');
  });

  it('requires external professional-validation evidence and no blockers before closure', () => {
    const admin = { uid: 'admin-1', name: 'Admin', role: 'admin' as const };
    const ready: TaxPeriod = {
      ...period,
      status: 'ready_for_professional_review',
      governanceReadiness: 'AWAITING_PROFESSIONAL_VALIDATION',
      preparedBy: 'finance-1',
      reviewedBy: 'admin-2',
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
