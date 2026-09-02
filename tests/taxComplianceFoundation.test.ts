import { describe, expect, it } from 'vitest';
import { canTax, canRepresentProfessionalTaxValidation } from '../src/config/taxCompliance';
import {
  canPrepareAndReviewSameTaxPeriod,
  isOfficialUaeTaxSourceUrl,
  validateOfficialSourceAuthority,
  validateRuleAcceptance
} from '../src/server/taxCompliancePolicy';
import type { TaxOfficialSource, TaxRuleVersion } from '../src/tax/types';

const source: TaxOfficialSource = {
  id: 'SRC-FTA-001',
  domain: 'VAT',
  authority: 'FTA',
  officialTitle: 'Official FTA VAT source',
  officialUrl: 'https://tax.gov.ae/example',
  topics: ['VAT'],
  interpretationRequired: true,
  status: 'validated',
  retrievedAt: '2026-09-02T00:00:00.000Z',
  createdBy: 'admin-1',
  createdByName: 'Admin One',
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z'
};

const proposedRule: TaxRuleVersion = {
  id: 'RULE-VAT-TEST-v1',
  domain: 'VAT',
  code: 'VAT-TEST',
  version: '1.0.0',
  title: 'Test rule',
  description: 'Test-only proposed rule.',
  status: 'proposed',
  effectiveFrom: '2026-01-01',
  sourceIds: [source.id],
  interpretationRequired: true,
  proposedBy: 'finance-1',
  proposedByName: 'Finance One',
  proposedAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z'
};

describe('Tax Compliance foundation', () => {
  it('keeps tax permissions independent from broad finance access', () => {
    expect(canTax('finance', 'tax.view')).toBe(true);
    expect(canTax('finance', 'tax.prepare')).toBe(true);
    expect(canTax('finance', 'tax.approve')).toBe(false);
    expect(canTax('finance', 'tax.rules.accept')).toBe(false);
    expect(canTax('operations', 'tax.view')).toBe(false);
    expect(canTax('sales', 'tax.view')).toBe(false);
    expect(canTax('fleet', 'tax.view')).toBe(false);
    expect(canTax('ceo', 'tax.rules.accept')).toBe(true);
    expect(canTax('admin', 'tax.period.lock')).toBe(true);
  });

  it('never treats an internal application role as professional tax validation', () => {
    expect(canRepresentProfessionalTaxValidation('ceo')).toBe(false);
    expect(canRepresentProfessionalTaxValidation('admin')).toBe(false);
    expect(canRepresentProfessionalTaxValidation('finance')).toBe(false);
  });

  it('allows only HTTPS official UAE government source hosts with matching authority', () => {
    expect(isOfficialUaeTaxSourceUrl('https://tax.gov.ae/foo')).toBe(true);
    expect(isOfficialUaeTaxSourceUrl('https://mof.gov.ae/foo')).toBe(true);
    expect(isOfficialUaeTaxSourceUrl('https://uaelegislation.gov.ae/foo')).toBe(true);
    expect(isOfficialUaeTaxSourceUrl('https://example.com/tax-blog')).toBe(false);
    expect(isOfficialUaeTaxSourceUrl('http://tax.gov.ae/foo')).toBe(false);
    expect(validateOfficialSourceAuthority('FTA', 'https://mof.gov.ae/foo')).toContain('does not match');
  });

  it('blocks acceptance until independent professional validation exists', () => {
    const actor = { uid: 'ceo-1', name: 'CEO', role: 'ceo' as const };
    expect(validateRuleAcceptance(proposedRule, [source], actor)).toContain('Professional UAE tax validation');

    const validatedRule: TaxRuleVersion = {
      ...proposedRule,
      professionalValidation: {
        validatorName: 'External UAE Tax Professional',
        validatorCapacity: 'UAE_TAX_PROFESSIONAL',
        scope: 'Validated the exact rule version and stated effective period.',
        validatedAt: '2026-09-02T10:00:00.000Z'
      }
    };
    expect(validateRuleAcceptance(validatedRule, [source], actor)).toBeNull();
  });

  it('enforces Four-Eyes on rule acceptance and period review', () => {
    const sameActor = { uid: 'finance-1', name: 'Finance One', role: 'ceo' as const };
    const validatedRule: TaxRuleVersion = {
      ...proposedRule,
      professionalValidation: {
        validatorName: 'External UAE Tax Professional',
        validatorCapacity: 'UAE_TAX_PROFESSIONAL',
        scope: 'Validated exact rule.',
        validatedAt: '2026-09-02T10:00:00.000Z'
      }
    };
    expect(validateRuleAcceptance(validatedRule, [source], sameActor)).toContain('Four-Eyes');
    expect(canPrepareAndReviewSameTaxPeriod('user-1', 'user-1')).toBe(false);
    expect(canPrepareAndReviewSameTaxPeriod('user-1', 'user-2')).toBe(true);
  });

  it('rejects retired or non-official sources even with professional validation', () => {
    const actor = { uid: 'ceo-1', name: 'CEO', role: 'ceo' as const };
    const validatedRule: TaxRuleVersion = {
      ...proposedRule,
      professionalValidation: {
        validatorName: 'External UAE Tax Professional',
        validatorCapacity: 'UAE_TAX_PROFESSIONAL',
        scope: 'Validated exact rule.',
        validatedAt: '2026-09-02T10:00:00.000Z'
      }
    };
    expect(validateRuleAcceptance(validatedRule, [{ ...source, status: 'superseded' }], actor)).toContain('retired');
    expect(validateRuleAcceptance(validatedRule, [{ ...source, officialUrl: 'https://example.com/source' }], actor)).toContain('approved UAE government host');
  });
});
