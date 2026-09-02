import { canTax } from '../config/taxCompliance';
import type { TaxActor } from './taxCompliancePolicy';
import {
  validateOfficialSourceAuthority,
  validateProfessionalValidation
} from './taxCompliancePolicy';
import type {
  TaxMasterProfile,
  TaxOfficialSource,
  TaxPeriod,
  TaxProfessionalValidation
} from '../tax/types';

function validDate(value: string | undefined): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && !Number.isNaN(new Date(value).getTime()));
}

function dayValue(value: string): number {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
}

function reconciliationGateError(period: TaxPeriod): string | null {
  if (!period.latestReconciliationSnapshotId || !period.latestReconciliationCapturedAt || !period.latestReconciliationLedgerEvidenceHash) {
    return 'A server-captured Tax Reconciliation evidence snapshot is required before this Tax Period can advance.';
  }
  if (period.latestReconciliationPostingGapCount !== 0) {
    return 'Tax Reconciliation posting gaps must be zero before this Tax Period can advance.';
  }
  return null;
}

export function validateTaxPeriodDraft(
  period: TaxPeriod,
  profile: TaxMasterProfile | null,
  deadlineSource: TaxOfficialSource | null
): string | null {
  if (period.status !== 'draft') return 'A newly created tax period must start in Draft status.';
  if (!profile) return 'Tax Master Profile must be configured before a tax period is created.';
  if (profile.verificationStatus === 'unverified') return 'Tax Master Profile must be internally verified before tax periods can be created.';
  if (!validDate(period.periodStart) || !validDate(period.periodEnd) || !validDate(period.filingDeadline)) {
    return 'Tax period start, end, and filing deadline must be valid dates.';
  }
  if (dayValue(period.periodEnd) < dayValue(period.periodStart)) return 'Tax period end cannot be before its start.';
  if (dayValue(period.filingDeadline) < dayValue(period.periodEnd)) return 'Filing deadline cannot be before the tax period ends.';
  if (!period.taxProfileVersionUpdatedAt || period.taxProfileVersionUpdatedAt !== profile.updatedAt) {
    return 'Tax period must be bound to the exact verified Tax Master Profile version used to create it.';
  }
  if (!deadlineSource) return 'The filing deadline must reference an official source in the Tax Source Registry.';
  if (deadlineSource.status !== 'validated' && deadlineSource.status !== 'accepted') {
    return 'The filing deadline source must be validated before a tax period can be created.';
  }
  if (deadlineSource.domain !== period.domain && deadlineSource.domain !== 'TAX_PROCEDURES' && deadlineSource.domain !== 'CROSS_DOMAIN') {
    return 'The filing deadline source domain is not applicable to this tax period.';
  }
  if (!period.deadlineSourceVersionUpdatedAt || period.deadlineSourceVersionUpdatedAt !== deadlineSource.updatedAt) {
    return 'Tax period must be bound to the exact validated official-source version used for its deadline.';
  }
  const authorityError = validateOfficialSourceAuthority(deadlineSource.authority, deadlineSource.officialUrl);
  if (authorityError) return authorityError;
  if (period.deadlineBasis === 'EMARATAX_CONFIRMED' && !period.deadlineEvidenceReference && !period.deadlineEvidenceDocumentId) {
    return 'An EmaraTax-confirmed deadline requires a durable portal reference or evidence document.';
  }
  if (period.deadlineBasis === 'SPECIAL_OFFICIAL_NOTICE' && !period.deadlineEvidenceReference && !period.deadlineEvidenceDocumentId) {
    return 'A special official deadline requires the specific notice reference or evidence document.';
  }
  return null;
}

export function periodsOverlap(a: Pick<TaxPeriod, 'domain' | 'periodStart' | 'periodEnd'>, b: Pick<TaxPeriod, 'domain' | 'periodStart' | 'periodEnd'>): boolean {
  if (a.domain !== b.domain) return false;
  return dayValue(a.periodStart) <= dayValue(b.periodEnd) && dayValue(a.periodEnd) >= dayValue(b.periodStart);
}

export function validateOpenTaxPeriod(period: TaxPeriod, actor: TaxActor): string | null {
  if (!canTax(actor.role, 'tax.prepare', actor.explicitTaxPermissions)) return 'Actor is not permitted to prepare tax periods.';
  if (period.status !== 'draft') return 'Only a Draft tax period can be opened.';
  return null;
}

export function validateSubmitForReview(period: TaxPeriod, actor: TaxActor): string | null {
  if (!canTax(actor.role, 'tax.prepare', actor.explicitTaxPermissions)) return 'Actor is not permitted to prepare tax periods.';
  if (period.status !== 'open') return 'Only an Open tax period can be submitted for review.';
  if (!period.preparationStartedBy || period.preparationStartedBy !== actor.uid) {
    return 'Only the preparer who opened this tax period may submit it for independent review.';
  }
  const reconciliationError = reconciliationGateError(period);
  if (reconciliationError) return reconciliationError;
  if (period.blockingExceptionCount > 0) return 'Blocking exceptions must be resolved before a tax period can be submitted for review.';
  return null;
}

export function validateIndependentReview(period: TaxPeriod, actor: TaxActor): string | null {
  if (!canTax(actor.role, 'tax.review', actor.explicitTaxPermissions)) return 'Actor is not permitted to review tax periods.';
  if (period.status !== 'under_review') return 'Tax period is not awaiting internal review.';
  if (!period.preparedBy) return 'Tax period has no recorded preparer.';
  if (period.preparedBy === actor.uid) return 'Four-Eyes control prevents the preparer from reviewing the same tax period.';
  const reconciliationError = reconciliationGateError(period);
  if (reconciliationError) return reconciliationError;
  if (period.blockingExceptionCount > 0) return 'Blocking exceptions must be resolved before professional review can be requested.';
  return null;
}

export function validateRecordPeriodProfessionalValidation(
  period: TaxPeriod,
  actor: TaxActor,
  validation: TaxProfessionalValidation
): string | null {
  if (!canTax(actor.role, 'tax.approve', actor.explicitTaxPermissions)) return 'Actor is not permitted to record professional validation for tax periods.';
  if (period.status !== 'ready_for_professional_review') return 'Tax period is not ready for professional review.';
  if (period.preparedBy === actor.uid) return 'Four-Eyes control prevents the preparer from recording professional validation for the same tax period.';
  const reconciliationError = reconciliationGateError(period);
  if (reconciliationError) return reconciliationError;
  if (period.blockingExceptionCount > 0) return 'Blocking exceptions must be resolved before professional validation can be recorded.';
  return validateProfessionalValidation(validation);
}

export function validateCloseTaxPeriod(period: TaxPeriod, actor: TaxActor): string | null {
  if (!canTax(actor.role, 'tax.approve', actor.explicitTaxPermissions)) return 'Actor is not permitted to close tax periods.';
  if (period.status !== 'professionally_validated') return 'Only a professionally validated tax period can be closed.';
  if (!period.professionalValidation) return 'Professional validation evidence is required before a tax period can be closed.';
  const reconciliationError = reconciliationGateError(period);
  if (reconciliationError) return reconciliationError;
  if (period.blockingExceptionCount > 0) return 'Blocking exceptions must be resolved before a tax period can be closed.';
  return null;
}

export function filingActionsRemainBlocked(_period: TaxPeriod): string {
  return 'Tax filing is blocked in the current governance foundation. No filing or submission API exists, and a closed period does not represent a filed return.';
}
