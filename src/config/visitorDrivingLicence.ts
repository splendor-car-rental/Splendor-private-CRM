/**
 * Dubai RTA visitor-driving guidance reference.
 *
 * This is UI guidance, not an automatic legal entitlement. Eligibility can
 * depend on visa/residency, nationality, licence validity/class and current
 * RTA rules. Staff may always select any issuing country and escalate for
 * manual review. The reference below was verified against the RTA service
 * guidance updated 25-Aug-2026.
 */
export const RTA_VISITOR_LICENCE_GUIDANCE_VERIFIED_AT = '2026-08-25';

export const GCC_LICENCE_COUNTRY_CODES = ['AE', 'SA', 'KW', 'BH', 'QA', 'OM'] as const;

// RTA service guidance currently identifies these exception-country licences
// for the visitor/exchange framework. Do not use this list as a hard denial
// for any other country; an IDP or additional review may still make a visitor
// eligible under the applicable rules.
export const RTA_EXCEPTION_LICENCE_COUNTRY_CODES = [
  'AT', 'BE', 'GB', 'DK', 'FI', 'FR', 'DE', 'HK', 'IT', 'JP',
  'NL', 'NO', 'PL', 'RO', 'ZA', 'ES', 'SE', 'CH', 'TR', 'US'
] as const;

const GCC = new Set<string>(GCC_LICENCE_COUNTRY_CODES);
const EXCEPTION = new Set<string>(RTA_EXCEPTION_LICENCE_COUNTRY_CODES);

export type VisitorLicenceGuidance = 'gcc' | 'rta_exception' | 'review_required';

export function getVisitorLicenceGuidance(countryCode: string): VisitorLicenceGuidance {
  const code = String(countryCode || '').trim().toUpperCase();
  if (GCC.has(code)) return 'gcc';
  if (EXCEPTION.has(code)) return 'rta_exception';
  return 'review_required';
}

export function visitorLicenceGuidanceLabel(countryCode: string, language: 'ar' | 'en'): string {
  const guidance = getVisitorLicenceGuidance(countryCode);
  if (guidance === 'gcc') {
    return language === 'ar'
      ? 'رخصة دولة خليجية — تحقق من حالة الزيارة وصلاحية الرخصة قبل التسليم.'
      : 'GCC licence — verify visitor status and licence validity before handover.';
  }
  if (guidance === 'rta_exception') {
    return language === 'ar'
      ? 'دولة ضمن قائمة RTA الاستثنائية الحالية — يظل التحقق من حالة العميل وصلاحية الرخصة إلزامياً.'
      : 'Country is on the current RTA exception list — customer status and licence validity must still be verified.';
  }
  return language === 'ar'
    ? 'ليست ضمن قائمة الإرشاد الحالية — لا ترفض تلقائياً؛ راجع متطلبات الرخصة الدولية/أهلية الزائر وفق RTA.'
    : 'Not on the current guidance list — do not auto-reject; review IDP/visitor eligibility under current RTA rules.';
}
