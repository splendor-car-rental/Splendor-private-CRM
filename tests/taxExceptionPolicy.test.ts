import { describe, expect, it } from 'vitest';
import { validateCreateBlockingException, validateResolveBlockingException } from '../src/server/taxExceptionPolicy';
import type { TaxBlockingException } from '../src/tax/exceptionTypes';
import type { TaxPeriod } from '../src/tax/types';

const period: TaxPeriod = {
  id: 'TAXPERIOD-VAT-2026Q3',
  domain: 'VAT',
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  filingDeadline: '2026-10-28',
  deadlineBasis: 'OFFICIAL_SOURCE',
  deadlineSourceId: 'SRC-1',
  deadlineSourceVersionUpdatedAt: '2026-09-01T00:00:00.000Z',
  taxProfileVersionUpdatedAt: '2026-09-01T00:00:00.000Z',
  status: 'open',
  ruleVersionIds: [],
  blockingExceptionCount: 1,
  governanceReadiness: 'IN_PREPARATION',
  createdBy: 'finance-1',
  createdByName: 'Finance',
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z'
};

const exception: TaxBlockingException = {
  id: 'EX-1',
  periodId: period.id,
  domain: 'VAT',
  category: 'MISSING_EVIDENCE',
  title: 'Evidence gap',
  description: 'Required evidence has not yet been attached.',
  status: 'open',
  openedBy: 'finance-1',
  openedByName: 'Finance',
  openedAt: '2026-09-02T01:00:00.000Z',
  updatedAt: '2026-09-02T01:00:00.000Z'
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

  it('requires independent resolver and durable resolution evidence', () => {
    const reviewer = { uid: 'admin-1', name: 'Admin', role: 'admin' as const };
    expect(validateResolveBlockingException(period, exception, reviewer, 'Verified correction.', 'LEDGER-REF-1')).toBeNull();
    expect(validateResolveBlockingException(period, exception, { uid: 'finance-1', name: 'Finance', role: 'admin' }, 'Verified correction.', 'LEDGER-REF-1')).toContain('Four-Eyes');
    expect(validateResolveBlockingException(period, exception, reviewer, 'Verified correction.')).toContain('Durable resolution evidence');
  });

  it('rejects repeated resolution', () => {
    const reviewer = { uid: 'admin-1', name: 'Admin', role: 'admin' as const };
    expect(validateResolveBlockingException(period, { ...exception, status: 'resolved' }, reviewer, 'Verified correction.', 'LEDGER-REF-1')).toContain('Only an open');
  });
});
