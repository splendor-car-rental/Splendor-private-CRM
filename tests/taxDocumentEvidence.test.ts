import { describe, expect, it } from 'vitest';
import { validateInvoiceTaxEvidence } from '../src/server/taxDocumentEvidence';
import type { TaxOfficialSource, TaxRuleVersion } from '../src/tax/types';

const professionalValidation = {
  validatorRegistryId: 'TP-REGISTRY-1',
  validatorName: 'External UAE Tax Professional',
  validatorCapacity: 'UAE_TAX_PROFESSIONAL' as const,
  validationEvidenceDocumentId: 'DOC-TAX-VALIDATION-1',
  scope: 'Exact VAT rule version and period.',
  validatedAt: '2026-01-02T00:00:00.000Z'
};

const source: TaxOfficialSource = {
  id: 'SRC-VAT-1',
  domain: 'VAT',
  authority: 'FTA',
  officialTitle: 'Official VAT source',
  officialUrl: 'https://tax.gov.ae/example',
  effectiveFrom: '2026-01-01',
  topics: ['VAT'],
  interpretationRequired: true,
  status: 'validated',
  retrievedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'admin-1',
  createdByName: 'Admin One',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z'
};

const rule: TaxRuleVersion = {
  id: 'TAXRULE-VAT-RENTAL-1',
  domain: 'VAT',
  code: 'VAT-RENTAL',
  version: '1',
  title: 'Evidence-bound VAT rule',
  description: 'Test rule only; no tax interpretation is asserted by this test.',
  status: 'accepted',
  effectiveFrom: '2026-01-01',
  sourceIds: [source.id],
  interpretationRequired: true,
  proposedBy: 'finance-1',
  proposedByName: 'Finance One',
  proposedAt: '2026-01-01T00:00:00.000Z',
  professionalValidation,
  acceptedBy: 'ceo-1',
  acceptedByName: 'CEO',
  acceptedAt: '2026-01-03T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z'
};

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    issueDate: '2026-02-01',
    supplyDate: '2026-02-01',
    subtotal: 100,
    vatAmount: 5,
    totalAmount: 105,
    items: [{
      description: 'Evidence-bound line',
      subtotal: 100,
      total: 105,
      taxClassification: 'TEST_CLASSIFICATION',
      taxRuleVersionId: rule.id,
      vatRate: 5,
      vatAmount: 5
    }],
    ...overrides
  };
}

describe('Tax document evidence boundary', () => {
  it('accepts exact stored line metadata backed by an accepted effective VAT rule and current official source', () => {
    const result = validateInvoiceTaxEvidence(invoice(), [rule], [source]);
    expect(result.error).toBeNull();
    expect(result.lineEvidence).toEqual([{
      lineIndex: 0,
      taxClassification: 'TEST_CLASSIFICATION',
      taxRuleVersionId: rule.id,
      vatRate: 5,
      vatAmount: 5
    }]);
  });

  it('fails closed instead of defaulting a missing VAT rate or classification', () => {
    const noRate = invoice({ items: [{ ...invoice().items[0], vatRate: undefined }] });
    const noClassification = invoice({ items: [{ ...invoice().items[0], taxClassification: '' }] });
    expect(validateInvoiceTaxEvidence(noRate, [rule], [source]).error).toContain('VAT rate');
    expect(validateInvoiceTaxEvidence(noClassification, [rule], [source]).error).toContain('tax classification');
  });

  it('fails closed when the rule is unaccepted, retired, missing, or outside its effective period', () => {
    expect(validateInvoiceTaxEvidence(invoice(), [{ ...rule, status: 'validated' }], [source]).error).toContain('not currently accepted');
    expect(validateInvoiceTaxEvidence(invoice(), [], [source]).error).toContain('does not exist');
    expect(validateInvoiceTaxEvidence(invoice({ supplyDate: '2025-12-31' }), [rule], [source]).error).toContain('outside its recorded effective period');
  });

  it('fails closed when official-source evidence is missing or retired', () => {
    expect(validateInvoiceTaxEvidence(invoice(), [rule], []).error).toContain('missing official source');
    expect(validateInvoiceTaxEvidence(invoice(), [rule], [{ ...source, status: 'superseded' }]).error).toContain('retired or unvalidated');
  });

  it('does not infer invoice totals when authoritative amounts are absent', () => {
    expect(validateInvoiceTaxEvidence(invoice({ vatAmount: undefined }), [rule], [source]).error).toContain('authoritative subtotal, VAT amount, and total amount');
  });
});
