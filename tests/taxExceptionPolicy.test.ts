import { describe, expect, it } from 'vitest';
import { applyBlockingExceptionToPeriod, validateCreateBlockingException, validateResolveBlockingException } from '../src/server/taxExceptionPolicy';
import type { TaxBlockingException } from '../src/tax/exceptionTypes';
import type { TaxPeriod } from '../src/tax/types';

const period: TaxPeriod = {
  id: 'TAXPERIOD-VAT-SYNTHETIC-TEST',
  domain: 'VAT',
  periodStart: '2099-01-01',
  periodEnd: '2099-01-31',
  filingDeadline: '2099-02-15',
  deadlineBasis: 'OFFICIAL_SOURCE',
  deadlineSourceId: 'SRC-SYNTHETIC-TEST',
  deadlineSourceVersionUpdatedAt: '2099-01-01T00:00:00.000Z',
  taxProfileVersionUpdatedAt: '2099-01-01T00:00:00.000Z',
  status: 'open',
  ruleVersionIds: [],
  blockingExceptionCount: 1,
  governanceReadiness: 'IN_PREPARATION',
  createdBy: 'finance-test',
  createdByName: 'Finance Test',
  createdAt: '2099-01-02T00:00:00.000Z',
  updatedAt: '2099-01-02T00:00:00.000Z'
};

const exception: TaxBlockingException = {
  id: 'EX-SYNTHETIC-1',
  periodId: period.id,
  domain: 'VAT',
  category: 'MISSING_EVIDENCE',
  title: 'Synthetic evidence gap',
  description: 'Synthetic test evidence has not yet been attached.',
  status: 'open',
  openedBy: 'finance-test',
  openedByName: 'Finance Test',
  openedAt: '2099-01-02T01:00:00.000Z',
  updatedAt: '2099-01-02T01:00:00.000Z'
};

describe('Tax Blocking Exception policy', () => {
  it('binds every exception to the authoritative period/domain and controlled category', () => {
    expect(validateCreateBlockingException(period, exception)).toBeNull();
    expect(validateCreateBlockingException(period, { ...exception, periodId: 'OTHER' })).toContain('authoritative Tax Period');
    expect(validateCreateBlockingException(period, { ...exception, category: 'OTHER', title: '' })).toContain('title and description');
  });

  it('does not mutate professionally validated or closed periods', () => {
    expect(validateCreateBlockingException({ ...period, status: 'professionally_validated' }, exception)).toContain('cannot be mutated');
    expect(validateCreateBlockingException({ ...period, status: 'closed' }, exception)).toContain('cannot be mutated');
  });

  it('invalidates prior internal-review readiness when a new blocker is opened after review', () => {
    const ready: TaxPeriod = {
      ...period,
      status: 'ready_for_professional_review',
      governanceReadiness: 'AWAITING_PROFESSIONAL_VALIDATION',
      reviewStatus: 'passed',
      reviewedBy: 'admin-test',
      reviewedByName: 'Admin Test',
      reviewedAt: '2099-01-03T00:00:00.000Z',
      reviewNotes: 'Synthetic review passed.'
    };
    const next = applyBlockingExceptionToPeriod(ready, 2, '2099-01-04T00:00:00.000Z');
    expect(next.status).toBe('under_review');
    expect(next.governanceReadiness).toBe('INTERNAL_REVIEW');
    expect(next.reviewStatus).toBe('pending');
    expect(next.reviewedBy).toBeUndefined();
    expect(next.reviewedAt).toBeUndefined();
    expect(next.blockingExceptionCount).toBe(2);
  });

  it('requires independent resolver and durable resolution evidence', () => {
    const reviewer = { uid: 'admin-test', name: 'Admin Test', role: 'admin' as const };
    expect(validateResolveBlockingException(period, exception, reviewer, 'Verified synthetic correction.', 'LEDGER-SYNTHETIC-REF-1')).toBeNull();
    expect(validateResolveBlockingException(period, exception, { uid: 'finance-test', name: 'Finance Test', role: 'admin' }, 'Verified synthetic correction.', 'LEDGER-SYNTHETIC-REF-1')).toContain('Four-Eyes');
    expect(validateResolveBlockingException(period, exception, reviewer, 'Verified synthetic correction.')).toContain('Durable resolution evidence');
  });

  it('prevents generic resolution from bypassing an authoritative reconciliation-managed blocker', () => {
    const reviewer = { uid: 'admin-test', name: 'Admin Test', role: 'admin' as const };
    const managed: TaxBlockingException = { ...exception, managedBy: 'TAX_RECONCILIATION', managedKey: 'POSTING_GAPS' };
    expect(validateResolveBlockingException(period, managed, reviewer, 'Synthetic correction.', 'SYNTHETIC-REF')).toContain('authoritative Tax Reconciliation workflow');
  });

  it('rejects repeated resolution', () => {
    const reviewer = { uid: 'admin-test', name: 'Admin Test', role: 'admin' as const };
    expect(validateResolveBlockingException(period, { ...exception, status: 'resolved' }, reviewer, 'Verified synthetic correction.', 'LEDGER-SYNTHETIC-REF-1')).toContain('Only an open');
  });
});
