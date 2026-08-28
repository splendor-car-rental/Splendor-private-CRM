import { UserRole } from '../types';
import type { BusinessRule, BusinessRuleTier } from '../types';

// ----------------------------------------------------
// GOVERNANCE & APPROVAL ENGINE -- permission tables (Phase 23.1)
// ----------------------------------------------------
// Mirrors the existing precedent in permissions.ts (TOLL_PRICING_EDIT_ROLES)
// rather than inventing a new access model: the roles already trusted with
// pricing decisions elsewhere in the app (CEO/Admin/Finance/Sales) are the
// only ones who can touch a business_rule or propose a sensitive_rule
// change. Operations/Fleet have no pricing-adjacent access today and none
// is granted here either -- "do not invent" applies to access grants too,
// not just numeric thresholds.

/** Who can see a rule's current value + version history, by tier. */
export const RULE_TIER_READ_ROLES: Record<BusinessRuleTier, UserRole[]> = {
  // Security/integrity constants -- visible to the roles that administer staff and security posture.
  system_configuration: ['ceo', 'admin'],
  // Everyone needs to know what the actual operational thresholds are.
  business_rule: ['ceo', 'admin', 'operations', 'sales', 'fleet', 'finance'],
  sensitive_rule: ['ceo', 'admin', 'operations', 'sales', 'fleet', 'finance'],
  // Staff need to know if the operation they're about to perform has been suspended.
  emergency_rule: ['ceo', 'admin', 'operations', 'sales', 'fleet', 'finance']
};

/** Who can apply a change to a rule of this tier IMMEDIATELY, with no second approver. */
export const RULE_TIER_DIRECT_EDIT_ROLES: Record<BusinessRuleTier, UserRole[]> = {
  system_configuration: [], // never editable through this engine, by anyone -- see BusinessRule.editable
  business_rule: ['ceo', 'admin', 'finance', 'sales'],
  sensitive_rule: [], // a sensitive rule ALWAYS requires a second person's approval, even for CEO/Admin
  emergency_rule: ['ceo', 'admin'] // kill switches: restricted, but immediate -- a delayed incident response defeats the control
};

/** Who can PROPOSE a change to a sensitive_rule (creates a pending ApprovalRequest instead of applying immediately). */
export const RULE_TIER_PROPOSE_ROLES: Record<BusinessRuleTier, UserRole[]> = {
  system_configuration: [],
  business_rule: [], // direct-edit roles above already cover this tier; no separate propose path
  sensitive_rule: ['ceo', 'admin', 'finance', 'sales'],
  emergency_rule: []
};

/** Who can decide (approve/reject) a pending approval request. Four-Eyes is enforced on top of this: decidedBy must never equal requestedBy, even if both hold an eligible role. */
export const APPROVAL_DECIDER_ROLES: UserRole[] = ['ceo', 'admin'];

export function canReadRuleTier(role: UserRole, tier: BusinessRuleTier): boolean {
  return RULE_TIER_READ_ROLES[tier].includes(role);
}

export function canDirectEditRuleTier(role: UserRole, tier: BusinessRuleTier): boolean {
  return RULE_TIER_DIRECT_EDIT_ROLES[tier].includes(role);
}

export function canProposeRuleChange(role: UserRole, tier: BusinessRuleTier): boolean {
  return RULE_TIER_PROPOSE_ROLES[tier].includes(role);
}

export function canDecideApproval(role: UserRole): boolean {
  return APPROVAL_DECIDER_ROLES.includes(role);
}

// ----------------------------------------------------
// SEED CATALOG
// ----------------------------------------------------
// Every entry below traces to a real, already-existing value found by the
// Phase 23.0 repository inventory -- nothing here is an invented business
// threshold. Two kinds of entries:
//
//  1. `editable: true` rules the engine now OWNS -- the code path that used
//     to hardcode the value has been changed to read it from here instead
//     (see sourceNote for exactly which file/line used to hold the literal).
//
//  2. `editable: false` MIRROR/VISIBILITY entries -- the real value is still
//     owned by its existing route (toll pricing config) or by a
//     transactional code path too risky to rewire in this pass
//     (contractOps.ts, inside a financial Firestore transaction). Listed
//     here so the governance catalog has full visibility per "system-wide,
//     not just financials" -- migrating their storage into this engine is
//     flagged as an explicit fast-follow, not silently skipped.
//
// No sensitive_rule is seeded with a real numeric value in production: the
// audit found NO existing cap on discounts, no credit-limit concept, no
// cancellation/no-show fee, no min/max rental duration, and no
// buffer-between-bookings value anywhere in the codebase. Inventing any of
// those numbers here would violate "do not invent business thresholds that
// do not currently exist" -- they are reported separately as open business
// decisions, not seeded.

type SeedRule = Pick<BusinessRule, 'id' | 'label' | 'labelAr' | 'description' | 'tier' | 'valueType' | 'value' | 'editable' | 'sourceNote'> & { min?: number; max?: number };

export const DEFAULT_BUSINESS_RULES: SeedRule[] = [
  // ---- business_rule: notification timing windows (migrated from src/server/notificationEngine.ts) ----
  {
    id: 'notificationExpiryLookaheadDays',
    label: 'Document expiry look-ahead window',
    labelAr: 'نافذة التنبيه المبكر لانتهاء المستندات',
    description: 'Days before a registration/insurance/customer-ID/license expiry date that the "expiring soon" alert fires.',
    tier: 'business_rule', valueType: 'number', value: 30, min: 1, max: 180, editable: true,
    sourceNote: 'Was a hardcoded literal at src/server/notificationEngine.ts:187.'
  },
  {
    id: 'notificationContractEndingReminderDays',
    label: 'Contract-ending customer reminder window',
    labelAr: 'نافذة تذكير العميل بقرب انتهاء العقد',
    description: 'Days before a rental ends that the customer-facing "your rental ends soon" reminder fires.',
    tier: 'business_rule', valueType: 'number', value: 2, min: 1, max: 30, editable: true,
    sourceNote: 'Was a hardcoded literal at src/server/notificationEngine.ts:245-249.'
  },
  {
    id: 'notificationDepositDueSoonDays',
    label: 'Deposit-due-for-release staff alert window',
    labelAr: 'نافذة تنبيه الموظفين باقتراب استحقاق إفراج الوديعة',
    description: 'Days before a held deposit becomes due for release that the internal staff alert fires.',
    tier: 'business_rule', valueType: 'number', value: 3, min: 1, max: 30, editable: true,
    sourceNote: 'Was a hardcoded literal at src/server/notificationEngine.ts:263-267.'
  },
  {
    id: 'notificationPaymentDueSoonDays',
    label: 'Payment-due-soon customer reminder window',
    labelAr: 'نافذة تذكير العميل باقتراب استحقاق الدفع',
    description: 'Days before a payment is due that the customer-facing reminder fires.',
    tier: 'business_rule', valueType: 'number', value: 3, min: 1, max: 30, editable: true,
    sourceNote: 'Was a hardcoded literal at src/server/notificationEngine.ts:302.'
  },
  {
    id: 'notificationUnmatchedTollStalenessHours',
    label: 'Unmatched toll/parking staleness threshold',
    labelAr: 'حد تنبيه رسوم السالك/الانتظار غير المطابقة',
    description: 'Hours a Salik/Darb/parking row can sit unmatched to a contract before the staff alert fires.',
    tier: 'business_rule', valueType: 'number', value: 24, min: 1, max: 168, editable: true,
    sourceNote: 'Was a hardcoded literal at src/server/notificationEngine.ts:316-319.'
  },
  {
    id: 'notificationCooldownHours',
    label: 'Standard notification cooldown',
    labelAr: 'فترة التهدئة المعيارية بين التنبيهات',
    description: 'Minimum hours between re-firing the same still-true alert for most notification types.',
    tier: 'business_rule', valueType: 'number', value: 24, min: 1, max: 168, editable: true,
    sourceNote: 'Was a hardcoded literal at src/server/notificationEngine.ts:189-332 (most cases).'
  },
  {
    id: 'notificationOverdueCooldownHours',
    label: 'Contract-overdue notification cooldown',
    labelAr: 'فترة التهدئة لتنبيه تجاوز العقد',
    description: 'Minimum hours between re-firing the "contract overdue" alert.',
    tier: 'business_rule', valueType: 'number', value: 12, min: 1, max: 168, editable: true,
    sourceNote: 'Was a hardcoded literal at src/server/notificationEngine.ts (contract-overdue case).'
  },

  // ---- editable:false visibility mirrors: still owned by their existing route/transaction ----
  {
    id: 'contractDefaultMileageAllowanceKm',
    label: 'Contract default mileage allowance (mirror)',
    labelAr: 'حد الكيلومترات المجانية اليومية الافتراضي (مرآة)',
    description: 'Free daily mileage before extra-km billing on a new contract. Currently owned by src/server/contractOps.ts (inside its financial Firestore transaction) -- migrating its storage into this engine is a flagged fast-follow, not done in this pass to avoid touching a transactional, already-tested financial code path.',
    tier: 'business_rule', valueType: 'number', value: 200, editable: false,
    sourceNote: 'Real value lives in src/server/contractOps.ts:153. The reservation->contract conversion path (server.ts:1727) previously used a conflicting 250 and has been corrected to match this value.'
  },
  {
    id: 'contractExtraKmRateAed',
    label: 'Contract extra-km rate (mirror)',
    labelAr: 'سعر الكيلومتر الإضافي (مرآة)',
    description: 'AED charged per km over the mileage allowance. Currently owned by src/server/contractOps.ts.',
    tier: 'business_rule', valueType: 'number', value: 15, editable: false,
    sourceNote: 'Real value lives in src/server/contractOps.ts:154.'
  },
  {
    id: 'contractDepositReleaseDays',
    label: 'Contract deposit release period (mirror)',
    labelAr: 'مدة الإفراج عن الوديعة (مرآة)',
    description: 'Days after return before a deposit is due for release/refund. Currently owned by src/server/contractOps.ts.',
    tier: 'business_rule', valueType: 'number', value: 21, editable: false,
    sourceNote: 'Real value lives in src/server/contractOps.ts:155.'
  },
  {
    id: 'contractFallbackMinDepositAed',
    label: 'Contract fallback minimum deposit (mirror)',
    labelAr: 'الحد الأدنى الاحتياطي للوديعة (مرآة)',
    description: 'Deposit charged when a vehicle has no minDeposit set at all. Currently owned by src/server/contractOps.ts.',
    tier: 'business_rule', valueType: 'number', value: 5000, editable: false,
    sourceNote: 'Real value lives in src/server/contractOps.ts:100. NOTE: this differs from the public-website fallback (10,000) and the new-vehicle-form suggested default (20,000) -- the audit found these as three genuinely different contexts, not necessarily the same rule; not unified here without a business decision on whether they should be.'
  },
  {
    id: 'tollSalikCustomerRateAed',
    label: 'Salik default customer rate (mirror)',
    labelAr: 'سعر السالك الافتراضي للعميل (مرآة)',
    description: 'Default customer billing rate per Salik crossing. Currently owned and edited via PATCH /api/toll-pricing-config -- migrating its storage into this engine is a flagged fast-follow.',
    tier: 'business_rule', valueType: 'number', value: 7.5, editable: false,
    sourceNote: 'Real value lives in globalStore.tollPricingConfig / settings/toll_pricing_config, edited via PATCH /api/toll-pricing-config.'
  },
  {
    id: 'tollDarbCompanyCostAed',
    label: 'Darb default company cost (mirror)',
    labelAr: 'تكلفة درب الافتراضية على الشركة (مرآة)',
    description: 'Default company-side cost per Darb crossing. Currently owned via PATCH /api/toll-pricing-config.',
    tier: 'business_rule', valueType: 'number', value: 4.0, editable: false,
    sourceNote: 'Real value lives in globalStore.tollPricingConfig / settings/toll_pricing_config.'
  },
  {
    id: 'tollDarbCustomerRateAed',
    label: 'Darb default customer rate (mirror)',
    labelAr: 'سعر درب الافتراضي للعميل (مرآة)',
    description: 'Default customer billing rate per Darb crossing. Currently owned via PATCH /api/toll-pricing-config.',
    tier: 'business_rule', valueType: 'number', value: 6.0, editable: false,
    sourceNote: 'Real value lives in globalStore.tollPricingConfig / settings/toll_pricing_config.'
  },
  {
    id: 'tollParkingMarkupPercent',
    label: 'Parking markup percentage (mirror)',
    labelAr: 'نسبة هامش ربح مواقف السيارات (مرآة)',
    description: 'Markup applied to staff-entered parking base amount. Currently owned via PATCH /api/toll-pricing-config.',
    tier: 'business_rule', valueType: 'number', value: 10, editable: false,
    sourceNote: 'Real value lives in globalStore.tollPricingConfig / settings/toll_pricing_config.'
  },

  // ---- business_rule: Anomaly Detection sensitivity (Phase 23.6) ----
  // Unlike every other rule in this catalog, these are NOT migrated from an
  // existing value -- there is nothing to migrate from; no anomaly
  // detection existed before this phase. They are DETECTION SENSITIVITY
  // knobs, not business policy: a wrong value produces a false-positive
  // review flag, never a blocked transaction or an incorrect charge to a
  // customer. Conservative starting defaults, explicitly meant to be tuned
  // once the business has a feel for its own normal activity volume -- see
  // src/server/anomalyDetection.ts.
  {
    id: 'anomalyHighFrequencyActionCount',
    label: 'Anomaly: sensitive-action frequency threshold',
    labelAr: 'حساسية الشذوذ: عدد العمليات الحساسة',
    description: 'Flag for review when the same staff member performs at least this many sensitive actions (refund, merge, rule/kill-switch change, charge, deposit) within the frequency window below. Detection sensitivity, not a business policy -- tune freely.',
    tier: 'business_rule', valueType: 'number', value: 5, min: 2, max: 100, editable: true,
    sourceNote: 'New in Phase 23.6 -- no prior value exists to migrate.'
  },
  {
    id: 'anomalyHighFrequencyWindowHours',
    label: 'Anomaly: sensitive-action frequency window (hours)',
    labelAr: 'حساسية الشذوذ: مدة نافذة العمليات الحساسة (ساعات)',
    description: 'Rolling window size for the sensitive-action frequency check above.',
    tier: 'business_rule', valueType: 'number', value: 1, min: 1, max: 168, editable: true,
    sourceNote: 'New in Phase 23.6 -- no prior value exists to migrate.'
  },
  {
    id: 'anomalyRepeatedEntityOverrideCount',
    label: 'Anomaly: repeated-override threshold',
    labelAr: 'حساسية الشذوذ: عدد التعديلات المتكررة على نفس السجل',
    description: 'Flag for review when the same record (any entity) is changed at least this many times within the window below, regardless of who changed it -- a record edited back-and-forth repeatedly deserves a look.',
    tier: 'business_rule', valueType: 'number', value: 3, min: 2, max: 100, editable: true,
    sourceNote: 'New in Phase 23.6 -- no prior value exists to migrate.'
  },
  {
    id: 'anomalyRepeatedEntityOverrideWindowHours',
    label: 'Anomaly: repeated-override window (hours)',
    labelAr: 'حساسية الشذوذ: مدة نافذة التعديلات المتكررة (ساعات)',
    description: 'Rolling window size for the repeated-override check above.',
    tier: 'business_rule', valueType: 'number', value: 1, min: 1, max: 168, editable: true,
    sourceNote: 'New in Phase 23.6 -- no prior value exists to migrate.'
  },
  {
    id: 'anomalyCustomerMergeCount',
    label: 'Anomaly: customer-merge frequency threshold',
    labelAr: 'حساسية الشذوذ: عدد عمليات دمج العملاء',
    description: 'Flag for review when the same staff member merges at least this many customer records within the window below.',
    tier: 'business_rule', valueType: 'number', value: 3, min: 2, max: 100, editable: true,
    sourceNote: 'New in Phase 23.6 -- no prior value exists to migrate.'
  },
  {
    id: 'anomalyCustomerMergeWindowHours',
    label: 'Anomaly: customer-merge window (hours)',
    labelAr: 'حساسية الشذوذ: مدة نافذة دمج العملاء (ساعات)',
    description: 'Rolling window size for the customer-merge frequency check above.',
    tier: 'business_rule', valueType: 'number', value: 24, min: 1, max: 168, editable: true,
    sourceNote: 'New in Phase 23.6 -- no prior value exists to migrate.'
  },
  {
    id: 'anomalyOffHoursStartHour',
    label: 'Anomaly: off-hours window start (24h, Gulf Standard Time)',
    labelAr: 'حساسية الشذوذ: بداية ساعات خارج الدوام (توقيت الخليج)',
    description: 'Sensitive actions performed at or after this hour (Gulf Standard Time, UTC+4, no DST) are flagged for review. Paired with the end-hour value below; the window wraps past midnight.',
    tier: 'business_rule', valueType: 'number', value: 22, min: 0, max: 23, editable: true,
    sourceNote: 'New in Phase 23.6 -- no prior value exists to migrate.'
  },
  {
    id: 'anomalyOffHoursEndHour',
    label: 'Anomaly: off-hours window end (24h, Gulf Standard Time)',
    labelAr: 'حساسية الشذوذ: نهاية ساعات خارج الدوام (توقيت الخليج)',
    description: 'Sensitive actions performed before this hour (Gulf Standard Time, UTC+4, no DST) are flagged for review.',
    tier: 'business_rule', valueType: 'number', value: 6, min: 0, max: 23, editable: true,
    sourceNote: 'New in Phase 23.6 -- no prior value exists to migrate.'
  },

  // ---- emergency_rule: kill switches (new safety controls, approved 2026-08-28) ----
  // All default to `false` (not tripped) -- the default state is SAFE and
  // fully operational, per the explicit governance decision. Flipping one
  // to `true` stops ONLY the named category: it never bypasses RBAC or
  // approval requirements, never modifies or cancels an existing valid
  // record, and is itself always fully audited with a mandatory reason.
  {
    id: 'killSwitch.paymentsRefunds',
    label: 'Kill switch: Payments & refunds',
    labelAr: 'مفتاح إيقاف الطوارئ: المدفوعات والاستردادات',
    description: 'When ON, blocks POST /api/payments and POST /api/deposits/:id/refund. Existing payments/refunds already recorded are unaffected.',
    tier: 'emergency_rule', valueType: 'boolean', value: false, editable: true, sourceNote: 'New control (Phase 23.4).'
  },
  {
    id: 'killSwitch.contractLifecycle',
    label: 'Kill switch: Contract creation / modification / cancellation',
    labelAr: 'مفتاح إيقاف الطوارئ: إنشاء/تعديل/إلغاء العقود',
    description: 'When ON, blocks POST /api/contracts, /handover, /return, /extend, and reservation->contract conversion. Existing active contracts remain operational.',
    tier: 'emergency_rule', valueType: 'boolean', value: false, editable: true, sourceNote: 'New control (Phase 23.4).'
  },
  {
    id: 'killSwitch.reservationsBooking',
    label: 'Kill switch: Reservations / booking',
    labelAr: 'مفتاح إيقاف الطوارئ: الحجوزات',
    description: 'When ON, blocks POST /api/reservations (new bookings). Existing reservations are unaffected.',
    tier: 'emergency_rule', valueType: 'boolean', value: false, editable: true, sourceNote: 'New control (Phase 23.4).'
  },
  {
    id: 'killSwitch.pricingDiscounts',
    label: 'Kill switch: Pricing & discount changes',
    labelAr: 'مفتاح إيقاف الطوارئ: تعديلات التسعير والخصومات',
    description: 'When ON, blocks PATCH /api/toll-pricing-config (company-wide rate changes). Already-issued quotations and contracts are unaffected.',
    tier: 'emergency_rule', valueType: 'boolean', value: false, editable: true, sourceNote: 'New control (Phase 23.4).'
  },
  {
    id: 'killSwitch.customerMerge',
    label: 'Kill switch: Customer merge',
    labelAr: 'مفتاح إيقاف الطوارئ: دمج العملاء',
    description: 'When ON, blocks POST /api/customers/:id/merge.',
    tier: 'emergency_rule', valueType: 'boolean', value: false, editable: true, sourceNote: 'New control (Phase 23.4).'
  },
  {
    id: 'killSwitch.financialAdjustments',
    label: 'Kill switch: Financial adjustments (charges)',
    labelAr: 'مفتاح إيقاف الطوارئ: التسويات المالية (الرسوم الإضافية)',
    description: 'When ON, blocks POST /api/charges (additional/return-settlement charges).',
    tier: 'emergency_rule', valueType: 'boolean', value: false, editable: true, sourceNote: 'New control (Phase 23.4).'
  },
  {
    id: 'killSwitch.bankReconciliation',
    label: 'Kill switch: Bank reconciliation',
    labelAr: 'مفتاح إيقاف الطوارئ: التسوية البنكية',
    description: 'When ON, blocks POST /api/bank-batches and POST /api/bank-transactions/:id/reconcile.',
    tier: 'emergency_rule', valueType: 'boolean', value: false, editable: true, sourceNote: 'New control (Phase 23.4).'
  },
  {
    id: 'killSwitch.whatsappOutbound',
    label: 'Kill switch: WhatsApp outbound messaging',
    labelAr: 'مفتاح إيقاف الطوارئ: رسائل واتساب الصادرة',
    description: 'When ON, suspends all outbound WhatsApp sends (event notifications, custom reminders, customer notifications). The underlying business action (e.g. a contract handover) still completes -- only the WhatsApp send is skipped.',
    tier: 'emergency_rule', valueType: 'boolean', value: false, editable: true, sourceNote: 'New control (Phase 23.4).'
  },
  {
    id: 'killSwitch.backgroundJobs',
    label: 'Kill switch: Background/scheduled jobs',
    labelAr: 'مفتاح إيقاف الطوارئ: المهام الخلفية المجدولة',
    description: 'When ON, the notification sweep (runNotificationChecks, normally Vercel Cron every 6h) exits immediately without processing.',
    tier: 'emergency_rule', valueType: 'boolean', value: false, editable: true, sourceNote: 'New control (Phase 23.4).'
  },
  {
    id: 'killSwitch.vehicleSaleWriteoff',
    label: 'Kill switch: Vehicle sale / write-off (not yet wired)',
    labelAr: 'مفتاح إيقاف الطوارئ: بيع/شطب المركبات (غير مفعّل بعد)',
    description: 'Reserved for a future dedicated vehicle sale/write-off endpoint. No such endpoint exists yet in the codebase (fleet status changes go through the generic vehicle edit route, which this switch deliberately does NOT gate to avoid blocking ordinary fleet edits) -- flagged as a gap, wire this once that endpoint is added.',
    tier: 'emergency_rule', valueType: 'boolean', value: false, editable: true, sourceNote: 'New control (Phase 23.4) -- not yet enforced anywhere.'
  },

  // ---- system_configuration: read-only visibility of security/integrity constants ----
  // ALL entries below are editable:false unconditionally -- see BusinessRule.editable.
  // These must never become editable merely because a rule is configurable.
  {
    id: 'security.roleHierarchy',
    label: 'RBAC role hierarchy (ROLE_RANK)',
    labelAr: 'التسلسل الهرمي للأدوار',
    description: 'ceo=0, admin=1, operations/sales/fleet/finance=2. Governs staff-creation/promotion delegation limits. Code-only by design -- see src/config/permissions.ts.',
    tier: 'system_configuration', valueType: 'string', value: 'ceo=0, admin=1, operations=2, sales=2, fleet=2, finance=2', editable: false,
    sourceNote: 'src/config/permissions.ts:13-19. Must stay code-enforced: editable rank values would let a lower-privileged actor grant themselves more authority.'
  },
  {
    id: 'security.passwordMinLength',
    label: 'Staff password minimum length',
    labelAr: 'الحد الأدنى لطول كلمة مرور الموظف',
    description: 'Minimum characters required for a new staff account password.',
    tier: 'system_configuration', valueType: 'number', value: 8, editable: false,
    sourceNote: 'server.ts:274. A security floor, not a policy dial a manager should loosen.'
  },
  {
    id: 'security.allowedDocumentPathPrefixes',
    label: 'Authenticated document proxy allowlist',
    labelAr: 'قائمة المسارات المسموحة لبوابة المستندات الموثقة',
    description: 'Storage path prefixes GET /api/documents/file is ever allowed to serve.',
    tier: 'system_configuration', valueType: 'string', value: 'avatars/, customer-documents/', editable: false,
    sourceNote: 'server.ts:589. Editable by policy would create a path-traversal/data-exposure risk.'
  },
  {
    id: 'security.adminDataResetConfirmPhrase',
    label: 'Admin data-reset confirmation phrase',
    labelAr: 'عبارة تأكيد إعادة تعيين بيانات الإدارة',
    description: 'Exact phrase required to run the irreversible transactional-data wipe.',
    tier: 'system_configuration', valueType: 'string', value: 'DELETE ALL DATA', editable: false,
    sourceNote: 'server.ts:428. Deliberately friction-adding and irreversible -- must never be softened or made configurable.'
  },

  // ---- sensitive_rule: Data Retention Policy framework (Phase 23.9) ----
  // FRAMEWORK ONLY, per the explicit governance decision: every value below
  // is seeded `null` ("not yet defined") -- none of them may be filled in
  // with an invented number here. Deliberately reuses the sensitive_rule
  // tier rather than a bespoke system: setting a real retention period is
  // exactly the kind of "changes how the business handles everyone's data
  // going forward" decision Four-Eyes Approval exists for, so activating
  // one requires a second CEO/Admin's sign-off through the same Governance
  // & Approvals panel as every other sensitive rule -- see
  // docs/DATA_RETENTION.md for why that approval step is a technical gate
  // that maps to, but does not replace, an actual external legal/
  // regulatory review, which must happen first.
  //
  // No deletion, purge, anonymization, or archival code exists anywhere in
  // this codebase referencing these values, on purpose -- setting one here
  // does not and will not delete anything by itself. Building the actual
  // enforcement job that reads these values is explicit future work, kept
  // entirely separate so this phase cannot accidentally destroy real
  // business data.
  {
    id: 'retentionCustomerRecordsDays',
    label: 'Data retention: customer records (days, after relationship ends)',
    labelAr: 'الاحتفاظ بالبيانات: سجلات العملاء (أيام، بعد انتهاء التعامل)',
    description: 'Not yet defined -- requires legal/regulatory review before activation. Once set, does NOT itself delete anything: no retention-enforcement job exists yet (deliberately, see docs/DATA_RETENTION.md). Likely governed by UAE consumer-protection and general commercial record-keeping norms once reviewed.',
    tier: 'sensitive_rule', valueType: 'number', value: null, min: 1, max: 36500, editable: true,
    sourceNote: 'New in Phase 23.9 -- framework only, no prior value, no value invented here.'
  },
  {
    id: 'retentionKycDocumentsDays',
    label: 'Data retention: KYC documents (ID/passport/license scans, days)',
    labelAr: 'الاحتفاظ بالبيانات: مستندات إثبات الهوية (أيام)',
    description: 'Not yet defined -- requires legal/regulatory review before activation. Likely governed by UAE AML/CDD record-keeping requirements (typically measured in years from the end of the customer relationship) once reviewed -- do not activate without confirming the exact figure with legal/compliance.',
    tier: 'sensitive_rule', valueType: 'number', value: null, min: 1, max: 36500, editable: true,
    sourceNote: 'New in Phase 23.9 -- framework only, no prior value, no value invented here.'
  },
  {
    id: 'retentionFinancialRecordsDays',
    label: 'Data retention: financial records (invoices/payments/contracts, days)',
    labelAr: 'الاحتفاظ بالبيانات: السجلات المالية (فواتير/مدفوعات/عقود، أيام)',
    description: 'Not yet defined -- requires legal/regulatory review before activation. Likely governed by UAE Federal Tax Authority record-keeping requirements for VAT purposes (commonly a multi-year figure) once reviewed -- do not activate without confirming the exact figure with legal/compliance.',
    tier: 'sensitive_rule', valueType: 'number', value: null, min: 1, max: 36500, editable: true,
    sourceNote: 'New in Phase 23.9 -- framework only, no prior value, no value invented here.'
  },
  {
    id: 'retentionAuditLogsDays',
    label: 'Data retention: governance audit trail (days)',
    labelAr: 'الاحتفاظ بالبيانات: سجل التدقيق الرقابي (أيام)',
    description: 'Not yet defined -- requires legal/regulatory review before activation. The audit trail (Phase 23.3/23.5) is itself the evidence of governance compliance -- any period set here should be at least as long as the longest financial/KYC retention period, not shorter.',
    tier: 'sensitive_rule', valueType: 'number', value: null, min: 1, max: 36500, editable: true,
    sourceNote: 'New in Phase 23.9 -- framework only, no prior value, no value invented here.'
  },
  {
    id: 'retentionWhatsappLogsDays',
    label: 'Data retention: WhatsApp message log (days)',
    labelAr: 'الاحتفاظ بالبيانات: سجل رسائل واتساب (أيام)',
    description: 'Not yet defined -- requires legal/regulatory review before activation. Operational communications log, not a legal/financial record -- likely a shorter period than the categories above once reviewed.',
    tier: 'sensitive_rule', valueType: 'number', value: null, min: 1, max: 36500, editable: true,
    sourceNote: 'New in Phase 23.9 -- framework only, no prior value, no value invented here.'
  }
];
