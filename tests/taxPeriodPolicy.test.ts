import { describe, expect, it } from 'vitest';
import {
  filingActionsRemainBlocked,
  periodsOverlap,
  validateIndependentReview,
  validateStartPreparation,
  validateSubmitForReview,
  validateTaxPeriodDraft
} from '../src/server/taxPeriodPolicy';
import type { TaxMasterProfile, TaxOfficialSource, TaxPeriod } from '../src/tax/types';

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
  deadlineEvidenceReference: 'EMARATAX-PERIOD-SCREEN-2026Q3',
  taxProfileVersionUpdatedAt: profile.updatedAt,
  status: 'open',
  ruleVersionIds: [],
  blockingExceptionCount: 0,
  filingReadiness: 'NOT_READY_FOR_FILING',
  createdBy: 'finance-1',
  createdByName: 'Finance',
  createdAt: '2026-09-02T12:00:00.000Z',
  updatedAt: '2026-09-02T12:00:00.000Z'
};

describe('Tax period lifecycle policy', () => {
  it('requires a verified Tax Master Profile, exact profile version, and validated official deadline source', () => {
    expect(validateTaxPeriodDraft(period, profile, source)).toBeNull();
    expect(validateTaxPeriodDraft(period, { ...profile, verificationStatus: 'unverified' }, source)).toContain('internally verified');
    expect(validateTaxPeriodDraft({ ...period, taxProfileVersionUpdatedAt: 'older-version' }, profile, source)).toContain('exact verified Tax Master Profile version');
    expect(validateTaxPeriodDraft(period, profile, { ...source, status: 'proposed' })).toContain('must be validated');
  });

  it('requires durable evidence for an EmaraTax-confirmed or special-notice deadline', () => {
    expect(validateTaxPeriodDraft({ ...period, deadlineEvidenceReference: undefined, deadlineEvidenceDocumentId: undefined }, profile, source)).toContain('durable portal reference');
    expect(validateTaxPeriodDraft({ ...period, deadlineBasis: 'SPECIAL_OFFICIAL_NOTICE', deadlineEvidenceReference: undefined, deadlineEvidenceDocumentId: undefined }, profile, source)).toContain('specific notice reference');
  });

  it('rejects impossible date order and overlapping periods in the same tax domain', () => {
    expect(validateTaxPeriodDraft({ ...period, periodEnd: '2026-06-30' }, profile, source)).toContain('cannot be before');
    expect(validateTaxPeriodDraft({ ...period, filingDeadline: '2026-09-01' }, profile, source)).toContain('cannot be before');
    expect(periodsOverlap(period, { ...period, id: 'OTHER', periodStart: '2026-09-15', periodEnd: '2026-12-31' })).toBe(true);
    expect(periodsOverlap(period, { ...period, id: 'CT', domain: 'CORPORATE_TAX' })).toBe(false);
  });

  it('enforces preparer ownership and independent review', () => {
    const finance = { uid: 'finance-1', name: 'Finance', role: 'finance' as const };
    const admin = { uid: 'admin-1', name: 'Admin', role: 'admin' as const };
    expect(validateStartPreparation(period, finance)).toBeNull();

    const preparing: TaxPeriod = { ...period, status: 'preparing', preparationStartedBy: finance.uid, preparationStartedByName: finance.name, preparationStartedAt: '2026-10-01T08:00:00.000Z' };
    expect(validateSubmitForReview(preparing, finance)).toBeNull();
    expect(validateSubmitForReview(preparing, { ...finance, uid: 'finance-2' })).toContain('Only the preparer');

    const underReview: TaxPeriod = { ...preparing, status: 'review', preparedBy: finance.uid, preparedByName: finance.name, preparedAt: '2026-10-10T08:00:00.000Z', reviewStatus: 'pending' };
    expect(validateIndependentReview(underReview, admin)).toBeNull();
    expect(validateIndependentReview(underReview, { uid: finance.uid, name: finance.name, role: 'admin' })).toContain('Four-Eyes');
  });

  it('keeps filing actions hard-blocked until later release gates explicitly make a period ready', () => {
    expect(filingActionsRemainBlocked(period)).toContain('Tax filing is blocked');
    expect(filingActionsRemainBlocked({ ...period, filingReadiness: 'READY_FOR_FILING' })).toBeNull();
  });
});
