import type { UserRole } from '../types';
import type {
  TaxOfficialSource,
  TaxProfessionalValidation,
  TaxRuleVersion,
  TaxSourceAuthority
} from '../tax/types';
import { canTax } from '../config/taxCompliance';

const OFFICIAL_HOSTS = new Set([
  'tax.gov.ae',
  'www.tax.gov.ae',
  'mof.gov.ae',
  'www.mof.gov.ae',
  'uaelegislation.gov.ae',
  'www.uaelegislation.gov.ae',
  'u.ae',
  'www.u.ae'
]);

const AUTHORITY_HOSTS: Record<TaxSourceAuthority, Set<string>> = {
  FTA: new Set(['tax.gov.ae', 'www.tax.gov.ae']),
  MOF: new Set(['mof.gov.ae', 'www.mof.gov.ae']),
  UAE_LEGISLATION: new Set(['uaelegislation.gov.ae', 'www.uaelegislation.gov.ae']),
  OTHER_OFFICIAL_UAE: new Set(['u.ae', 'www.u.ae'])
};

export interface TaxActor {
  uid: string;
  name: string;
  role: UserRole;
  explicitTaxPermissions?: import('../tax/types').TaxPermission[];
}

export function officialSourceHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isOfficialUaeTaxSourceUrl(url: string): boolean {
  const host = officialSourceHost(url);
  return host !== null && OFFICIAL_HOSTS.has(host);
}

export function validateOfficialSourceAuthority(authority: TaxSourceAuthority, url: string): string | null {
  const host = officialSourceHost(url);
  if (!host || !OFFICIAL_HOSTS.has(host)) return 'Only approved official UAE government tax sources are allowed.';
  if (!AUTHORITY_HOSTS[authority].has(host)) return 'The source authority does not match the official URL host.';
  return null;
}

export function validateProfessionalValidation(value: TaxProfessionalValidation | undefined): string | null {
  if (!value) return 'Professional UAE tax validation is required before a tax rule can be accepted.';
  if (value.validatorCapacity !== 'UAE_TAX_PROFESSIONAL') return 'Professional validator capacity is invalid.';
  if (!String(value.validatorRegistryId || '').trim()) return 'Professional validation must reference a verified Tax Professional Registry record.';
  if (!String(value.validatorName || '').trim()) return 'Professional validator name is required.';
  if (!String(value.scope || '').trim()) return 'Professional validation scope is required.';
  if (!String(value.validationEvidenceDocumentId || '').trim()) {
    return 'Professional validation requires an immutable/durable evidence document id; free-text references alone are not sufficient.';
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(String(value.validatedAt || '')) || Number.isNaN(new Date(value.validatedAt).getTime())) {
    return 'Professional validation date is required.';
  }
  if (value.validThrough && Number.isNaN(new Date(value.validThrough).getTime())) return 'Professional validation valid-through date is invalid.';
  return null;
}

export function validateRuleAcceptance(
  rule: TaxRuleVersion,
  sources: TaxOfficialSource[],
  actor: TaxActor
): string | null {
  if (!canTax(actor.role, 'tax.rules.accept', actor.explicitTaxPermissions)) {
    return 'Actor is not permitted to accept tax rules.';
  }
  if (rule.status === 'accepted') return 'Tax rule is already accepted.';
  if (rule.status === 'superseded' || rule.status === 'deprecated') return 'A retired tax rule cannot be accepted.';
  if (rule.proposedBy === actor.uid) return 'Four-Eyes control prevents the proposer from accepting the same tax rule.';
  if (!rule.effectiveFrom || !/^\d{4}-\d{2}-\d{2}/.test(rule.effectiveFrom)) return 'A valid effective-from date is required.';
  if (!Array.isArray(rule.sourceIds) || rule.sourceIds.length === 0) return 'At least one official source is required.';

  const sourceById = new Map(sources.map(source => [source.id, source]));
  for (const sourceId of rule.sourceIds) {
    const source = sourceById.get(sourceId);
    if (!source) return `Official source ${sourceId} is missing.`;
    if (!isOfficialUaeTaxSourceUrl(source.officialUrl)) return `Official source ${sourceId} is not on an approved UAE government host.`;
    const authorityError = validateOfficialSourceAuthority(source.authority, source.officialUrl);
    if (authorityError) return `Official source ${sourceId}: ${authorityError}`;
    if (source.status === 'proposed') {
      return `Official source ${sourceId} must be validated before it can support an accepted tax rule.`;
    }
    if (source.status === 'superseded' || source.status === 'deprecated') {
      return `Official source ${sourceId} is retired and cannot support a newly accepted rule.`;
    }
    if (source.effectiveFrom && source.effectiveFrom.slice(0, 10) > rule.effectiveFrom.slice(0, 10)) {
      return `Official source ${sourceId} is not effective at the start of this rule version.`;
    }
    if (source.effectiveTo && rule.effectiveTo && source.effectiveTo.slice(0, 10) < rule.effectiveTo.slice(0, 10)) {
      return `Official source ${sourceId} expires before this rule version ends.`;
    }
  }

  const validationError = validateProfessionalValidation(rule.professionalValidation);
  if (validationError) return validationError;
  return null;
}

export function canPrepareAndReviewSameTaxPeriod(preparerUserId: string, reviewerUserId: string): boolean {
  return Boolean(preparerUserId && reviewerUserId && preparerUserId !== reviewerUserId);
}

export function canReviewAndApproveSameTaxPeriod(reviewerUserId: string, approverUserId: string): boolean {
  return Boolean(reviewerUserId && approverUserId && reviewerUserId !== approverUserId);
}
