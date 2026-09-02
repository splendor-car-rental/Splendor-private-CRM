import { canTax } from '../config/taxCompliance';
import type { TaxBlockingException } from '../tax/exceptionTypes';
import type { TaxPeriod } from '../tax/types';
import type { TaxActor } from './taxCompliancePolicy';

export function validateCaptureTaxReconciliation(period: TaxPeriod, actor: TaxActor): string | null {
  if (!canTax(actor.role, 'tax.prepare', actor.explicitTaxPermissions)) return 'Actor is not permitted to capture Tax Reconciliation evidence.';
  if (period.status !== 'open' && period.status !== 'under_review') {
    return 'Tax Reconciliation evidence can only be captured while the Tax Period is Open or Under Review.';
  }
  return null;
}

export function validateResolveReconciliationPostingGap(
  period: TaxPeriod,
  exception: TaxBlockingException,
  actor: TaxActor,
  currentPostingGapCount: number
): string | null {
  if (!canTax(actor.role, 'tax.review', actor.explicitTaxPermissions)) return 'Actor is not permitted to review Tax Reconciliation evidence.';
  if (period.status !== 'open' && period.status !== 'under_review') {
    return 'Tax Reconciliation posting-gap blockers can only be resolved while the Tax Period is Open or Under Review.';
  }
  if (exception.status !== 'open') return 'Only an open Tax Reconciliation posting-gap blocker can be resolved.';
  if (exception.managedBy !== 'TAX_RECONCILIATION' || exception.managedKey !== 'POSTING_GAPS') {
    return 'The blocking exception is not managed by the Tax Reconciliation posting-gap workflow.';
  }
  if (exception.openedBy === actor.uid) return 'Four-Eyes control prevents the reconciliation blocker creator from resolving the same blocker.';
  if (currentPostingGapCount !== 0) return 'Authoritative accounting posting gaps remain. The reconciliation blocker cannot be resolved.';
  return null;
}
