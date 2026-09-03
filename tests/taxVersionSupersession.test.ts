import { describe, expect, it } from 'vitest';
import { planOfficialSourceSupersession, planTaxRuleSupersession } from '../src/server/taxVersionSupersession';
import type { TaxOfficialSource, TaxRuleVersion } from '../src/tax/types';

const sourceBase: TaxOfficialSource = {
  id: 'SRC-OLD',
  domain: 'VAT',
  authority: 'FTA',
  officialTitle: 'Old official source version',
  officialUrl: 'https://tax.gov.ae/old',
  publicationDate: '2026-01-01',
  effectiveFrom: '2026-01-01',
  effectiveTo: '2026-06-30',
  versionRevision: '1',
  topics: ['VAT'],
  interpretationRequired: true,
  status: 'validated',
  retrievedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'admin-1',
  createdByName: 'Admin One',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z'
};

const sourceSuccessor: TaxOfficialSource = {
  ...sourceBase,
  id: 'SRC-NEW',
  officialTitle: 'New official source version',
  officialUrl: 'https://tax.gov.ae/new',
  publicationDate: '2026-07-01',
  effectiveFrom: '2026-07-01',
  effectiveTo: undefined,
  versionRevision: '2',
  supersedesSourceIds: ['SRC-OLD'],
  status: 'validated',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z'
};

const ruleBase: TaxRuleVersion = {
  id: 'TAXRULE-VAT-TEST-1',
  domain: 'VAT',
  code: 'VAT-TEST',
  version: '1.0.0',
  title: 'Old rule',
  description: 'Old accepted rule.',
  status: 'accepted',
  effectiveFrom: '2026-01-01',
  effectiveTo: '2026-06-30',
  sourceIds: ['SRC-OLD'],
  interpretationRequired: true,
  proposedBy: 'finance-1',
  proposedByName: 'Finance One',
  proposedAt: '2026-01-02T00:00:00.000Z',
  acceptedBy: 'ceo-1',
  acceptedByName: 'CEO',
  acceptedAt: '2026-01-03T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z'
};

const ruleSuccessor: TaxRuleVersion = {
  ...ruleBase,
  id: 'TAXRULE-VAT-TEST-2',
  version: '2.0.0',
  title: 'New rule',
  description: 'New rule version.',
  status: 'validated',
  effectiveFrom: '2026-07-01',
  effectiveTo: undefined,
  sourceIds: ['SRC-NEW'],
  supersedesRuleId: ruleBase.id,
  acceptedBy: undefined,
  acceptedByName: undefined,
  acceptedAt: undefined,
  updatedAt: '2026-07-02T00:00:00.000Z'
};

describe('Tax evidence version supersession', () => {
  it('retires the predecessor source without rewriting its official dates or evidence fields', () => {
    const now = '2026-07-03T00:00:00.000Z';
    const result = planOfficialSourceSupersession(sourceSuccessor, [sourceBase], now);
    expect(result.error).toBeNull();
    expect(result.mutations).toHaveLength(1);
    const retired = result.mutations[0].next;
    expect(retired.status).toBe('superseded');
    expect(retired.supersededBySourceId).toBe(sourceSuccessor.id);
    expect(retired.publicationDate).toBe(sourceBase.publicationDate);
    expect(retired.effectiveFrom).toBe(sourceBase.effectiveFrom);
    expect(retired.effectiveTo).toBe(sourceBase.effectiveTo);
    expect(retired.versionRevision).toBe(sourceBase.versionRevision);
    expect(retired.officialUrl).toBe(sourceBase.officialUrl);
    expect(retired.updatedAt).toBe(now);
  });

  it('rejects source self-supersession and conflicting predecessor retirement', () => {
    expect(planOfficialSourceSupersession({ ...sourceSuccessor, supersedesSourceIds: ['SRC-NEW'] }, [sourceBase], '2026-07-03').error)
      .toContain('cannot supersede itself');
    expect(planOfficialSourceSupersession(sourceSuccessor, [{ ...sourceBase, status: 'superseded', supersededBySourceId: 'SRC-OTHER' }], '2026-07-03').error)
      .toContain('already superseded');
  });

  it('retires only an accepted predecessor rule with the same code and domain while preserving effective dates', () => {
    const now = '2026-07-03T00:00:00.000Z';
    const result = planTaxRuleSupersession(ruleSuccessor, ruleBase, now);
    expect(result.error).toBeNull();
    expect(result.mutation).toBeDefined();
    expect(result.mutation!.next.status).toBe('superseded');
    expect(result.mutation!.next.supersededByRuleId).toBe(ruleSuccessor.id);
    expect(result.mutation!.next.effectiveFrom).toBe(ruleBase.effectiveFrom);
    expect(result.mutation!.next.effectiveTo).toBe(ruleBase.effectiveTo);
    expect(result.mutation!.next.sourceIds).toEqual(ruleBase.sourceIds);
  });

  it('fails closed for a missing, unrelated, or non-accepted predecessor rule', () => {
    expect(planTaxRuleSupersession(ruleSuccessor, null, '2026-07-03').error).toContain('does not exist');
    expect(planTaxRuleSupersession(ruleSuccessor, { ...ruleBase, code: 'OTHER' }, '2026-07-03').error).toContain('same rule code');
    expect(planTaxRuleSupersession(ruleSuccessor, { ...ruleBase, status: 'validated' }, '2026-07-03').error).toContain('Only an accepted predecessor');
  });
});
