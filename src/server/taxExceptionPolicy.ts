import type { TaxBlockingException, TaxBlockingExceptionCategory } from '../tax/exceptionTypes';
import type { TaxPeriod } from '../tax/types';
import type { TaxActor } from './taxCompliancePolicy';

const CATEGORIES = new Set<TaxBlockingExceptionCategory>([
  'POSTING_GAP',
  'UNCLASSIFIED_TAX_ITEM',
  'RECONCILIATION_DIFFERENCE',
  'MISSING_EVIDENCE',
  'INVALID_TAX_DOCUMENT_CLASSIFICATION',
  'TAX_ADJUSTMENT_PENDING',
  'OTHER'
]);

export function validateCreateBlockingException(
  period: TaxPeriod,
  exception: Pick<TaxBlockingException, 'periodId' | 'domain' | 'category' | 'title' | 'description'>
): string | null {
  if (period.id !== exception.periodId || period.domain !== exception.domain) return 'Tax exception must be bound to its authoritative Tax Period and domain.';
  if (!CATEGORIES.has(exception.category)) return 'Tax exception category is invalid.';
  if (!exception.title || !exception.description) return 'Tax exception title and description are required.';
  if (period.status === 'professionally_validated' || period.status === 'closed') {
    return 'A professionally validated or closed Tax Period cannot be mutated by adding a new blocking exception. A controlled future reopen/amendment workflow is required.';
  }
  return null;
}

export function applyBlockingExceptionToPeriod(period: TaxPeriod, blockingExceptionCount: number, updatedAt: string): TaxPeriod {
  const next: TaxPeriod = {
    ...period,
    blockingExceptionCount,
    updatedAt
  };

  if (period.status === 'ready_for_professional_review') {
    next.status = 'under_review';
    next.governanceReadiness = 'INTERNAL_REVIEW';
    next.reviewStatus = 'pending';
    delete next.reviewNotes;
    delete next.reviewedBy;
    delete next.reviewedByName;
    delete next.reviewedAt;
  }

  return next;
}

export function validateResolveBlockingException(
  period: TaxPeriod,
  exception: TaxBlockingException,
  actor: TaxActor,
  resolutionNote: string,
  resolutionReference?: string,
  resolutionEvidenceDocumentId?: string
): string | null {
  if (exception.status !== 'open') return 'Only an open Tax Blocking Exception can be resolved.';
  if (period.status === 'professionally_validated' || period.status === 'closed') {
    return 'A professionally validated or closed Tax Period cannot be mutated by resolving an exception. A controlled future reopen/amendment workflow is required.';
  }
  if (exception.managedBy === 'TAX_RECONCILIATION') {
    return 'Tax Reconciliation-managed exceptions can only be resolved through the authoritative Tax Reconciliation workflow.';
  }
  if (exception.openedBy === actor.uid) return 'Four-Eyes control prevents the exception creator from resolving the same blocking exception.';
  if (!resolutionNote) return 'A resolution note is required.';
  if (!resolutionReference && !resolutionEvidenceDocumentId) return 'Durable resolution evidence or a resolution reference is required.';
  return null;
}
