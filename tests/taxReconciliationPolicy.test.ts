import { describe, expect, it } from 'vitest';
import { validateCaptureTaxReconciliation, validateResolveReconciliationPostingGap } from '../src/server/taxReconciliationPolicy';
import type { TaxBlockingException } from '../src/tax/exceptionTypes';
import type { TaxPeriod } from '../src/tax/types';

const period: TaxPeriod = {
  id: 'TAXPERIOD-VAT-RECON-SYNTHETIC',
  domain: 'VAT',
  periodStart: '2099-04-01',
  periodEnd: '2099-04-30',
  filingDeadline: '2099-05-15',
  deadlineBasis: 'OFFICIAL_SOURCE',
  deadlineSourceId: 'SRC-RECON-SYNTHETIC',
  deadlineSourceVersionUpdatedAt: '2099-03-01T00:00:00.000Z',
  taxProfileVersionUpdatedAt: '2099-03-01T00:00:00.000Z',
  status: 'open',
  ruleVersionIds: [],
  blockingExceptionCount: 1,
  governanceReadiness: 'IN_PREPARATION',
  preparationStartedBy: 'finance-recon',
  preparationStartedByName: 'Finance Reconciliation',
  preparationStartedAt: '2099-05-01T00:00:00.000Z',
  createdBy: 'finance-recon',
  createdByName: 'Finance Reconciliation',
  createdAt: '2099-03-01T00:00:00.000Z',
  updatedAt: '2099-05-01T00:00:00.000Z'
};

const blocker: TaxBlockingException = {
  id: 'EX-RECON-SYNTHETIC',
  periodId: period.id,
  domain: period.domain,
  category: 'POSTING_GAP',
  title: 'Synthetic reconciliation posting gaps',
  description: 'Synthetic posted-ledger coverage has gaps.',
  status: 'open',
  managedBy: 'TAX_RECONCILIATION',
  managedKey: 'POSTING_GAPS',
  openedBy: 'finance-recon',
  openedByName: 'Finance Reconciliation',
  openedAt: '2099-05-01T01:00:00.000Z',
  updatedAt: '2099-05-01T01:00:00.000Z'
};

describe('Tax Reconciliation governance policy', () => {
  it('allows evidence capture only for tax preparers while the period remains mutable', () => {
    const finance = { uid: 'finance-recon', name: 'Finance Reconciliation', role: 'finance' as const };
    expect(validateCaptureTaxReconciliation(period, finance)).toBeNull();
    expect(validateCaptureTaxReconciliation({ ...period, status: 'professionally_validated' }, finance)).toContain('Open or Under Review');
    expect(validateCaptureTaxReconciliation(period, { uid: 'sales-test', name: 'Sales Test', role: 'sales' as const })).toContain('not permitted');
  });

  it('requires an independent tax reviewer and a current zero-gap accounting scan to resolve managed blockers', () => {
    const admin = { uid: 'admin-recon', name: 'Admin Reconciliation', role: 'admin' as const };
    expect(validateResolveReconciliationPostingGap(period, blocker, admin, 0)).toBeNull();
    expect(validateResolveReconciliationPostingGap(period, blocker, admin, 1)).toContain('posting gaps remain');
    expect(validateResolveReconciliationPostingGap(period, blocker, { ...admin, uid: blocker.openedBy }, 0)).toContain('Four-Eyes');
    expect(validateResolveReconciliationPostingGap(period, { ...blocker, managedBy: undefined }, admin, 0)).toContain('not managed');
  });
});
