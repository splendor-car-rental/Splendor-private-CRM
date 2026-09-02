import { canTax } from '../config/taxCompliance';
import type { TaxActor } from './taxCompliancePolicy';
import { validateOfficialSourceAuthority } from './taxCompliancePolicy';
import type { TaxMasterProfile, TaxOfficialSource, TaxPeriod } from '../tax/types';

function validDate(value: string | undefined): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && !Number.isNaN(new Date(value).getTime()));
}

function dayValue(value: string): number {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
}

export function validateTaxPeriodDraft(
  period: TaxPeriod,
  profile: TaxMasterProfile | null,
  deadlineSource: TaxOfficialSource | null
): string | null {
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
  if (deadlineSource.status === 'superseded' || deadlineSource.status === 'deprecated') {
    return 'A retired official source cannot support a new tax-period deadline.';
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

export function validateStartPreparation(period: TaxPeriod, actor: TaxActor): string | null {
  if (!canTax(actor.role, 'tax.prepare', actor.explicitTaxPermissions)) return 'Actor is not permitted to prepare tax periods.';
  if (period.status !== 'open') return 'Only an open tax period can enter preparation.';
  return null;
}

export function validateSubmitForReview(period: TaxPeriod, actor: TaxActor): string | null {
  if (!canTax(actor.role, 'tax.prepare', actor.explicitTaxPermissions)) return 'Actor is not permitted to prepare tax periods.';
  if (period.status !== 'preparing') return 'Only a preparing tax period can be submitted for review.';
  if (!period.preparationStartedBy || period.preparationStartedBy !== actor.uid) {
    return 'Only the preparer who started this tax period may submit it for independent review.';
  }
  return null;
}

export function validateIndependentReview(period: TaxPeriod, actor: TaxActor): string | null {
  if (!canTax(actor.role, 'tax.review', actor.explicitTaxPermissions)) return 'Actor is not permitted to review tax periods.';
  if (period.status !== 'review') return 'Tax period is not awaiting review.';
  if (!period.preparedBy) return 'Tax period has no recorded preparer.';
  if (period.preparedBy === actor.uid) return 'Four-Eyes control prevents the preparer from reviewing the same tax period.';
  return null;
}

export function filingActionsRemainBlocked(period: TaxPeriod): string | null {
  if (period.filingReadiness !== 'READY_FOR_FILING') {
    return 'Tax filing is blocked until reconciliation, evidence, accepted-rule, professional-validation and release gates are implemented and passed.';
  }
  return null;
}
