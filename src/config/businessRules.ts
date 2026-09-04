import { UserRole } from '../types/index.js';
import type { BusinessRule, BusinessRuleTier } from '../types/index.js';

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

  // ---- business_rule: customer late-fee thresholds (migrated from
  // src/server/lateFees.ts / src/config/procurement.ts, Procurement Phase
  // 1's own config, which predated this engine and was never migrated
  // into it). computeLateFee() is a pure, synchronous function called
  // fresh on every /api/late-fees/compute request and on every waiver
  // request -- it stores nothing itself, so changing either value here
  // only affects fees computed AFTER the change; a LateFeeWaiver already
  // on record keeps its own frozen originalLateFeeAmount forever,
  // regardless of any later rule change (historical calculations are
  // never retroactively recomputed). The two time thresholds below were
  // given as real numbers by the business spec; the values are unchanged
  // by this migration -- only their storage moved from a hardcoded
  // literal to this auditable, versioned engine. ----
  {
    id: 'lateFeeGracePeriodHours',
    label: 'Late-fee grace period',
    labelAr: 'فترة السماح قبل احتساب رسوم التأخير',
    description: 'Hours after the scheduled return time before any late fee starts accruing.',
    tier: 'business_rule', valueType: 'number', value: 1, min: 0, max: 24, editable: true,
    sourceNote: 'Was LATE_FEE_GRACE_PERIOD_HOURS, a hardcoded literal at src/config/procurement.ts:136.'
  },
  {
    id: 'lateFeeExtraDayConversionHours',
    label: 'Late-fee full-day conversion threshold',
    labelAr: 'حد التحويل إلى يوم إيجار كامل لرسوم التأخير',
    description: 'Hours of delay past the grace period after which the late fee converts from hourly billing to one full extra rental day.',
    tier: 'business_rule', valueType: 'number', value: 6, min: 1, max: 24, editable: true,
    sourceNote: 'Was LATE_FEE_EXTRA_DAY_CONVERSION_HOURS, a hardcoded literal at src/config/procurement.ts:137.'
  },

  // ---- Master Blueprint Rule Set (this session) -- see docs/SPLENDOR_MASTER_RULES.md ----
  {
    id: 'bookingOperationalBufferHours',
    label: 'Mandatory post-booking operational buffer',
    labelAr: 'فترة الأمان التشغيلي الإلزامية بعد كل حجز',
    description: 'Hours reserved after every booking ends, before the next booking on the same vehicle may start -- covers receipt, inspection, detailing, and repositioning (RULE-R03).',
    tier: 'business_rule', valueType: 'number', value: 3, min: 0, max: 24, editable: true,
    sourceNote: 'Blueprint item 10 (REQ-BP10-2): "فترة أمان تشغيلي تلقائية قدرها 3 ساعات".'
  },
  {
    id: 'bookingSoftHoldMinutes',
    label: 'Temporary checkout hold duration',
    labelAr: 'مدة الحجز المؤقت أثناء الدفع',
    description: 'Minutes a vehicle/window is soft-held for a customer mid-checkout before automatically releasing back to availability (RULE-R04).',
    tier: 'business_rule', valueType: 'number', value: 10, min: 1, max: 60, editable: true,
    sourceNote: 'Blueprint item 10 (REQ-BP10-4): "قفلاً مؤقتاً لمدة 10 دقائق فقط".'
  },
  {
    id: 'staffDiscountCeilingPercent',
    label: 'Staff discount ceiling before manager approval',
    labelAr: 'الحد الأقصى للخصم قبل موافقة المدير',
    description: 'Maximum discount percentage a non-manager can apply without a separate, logged sales-manager approval (RULE-P01).',
    tier: 'business_rule', valueType: 'number', value: 5, min: 0, max: 100, editable: true,
    sourceNote: 'Blueprint item 11 (REQ-BP11-5): "الموظف العادي لا يملك صلاحية الخصم بأكثر من 5%".'
  },
  {
    id: 'maintenanceOilFilterIntervalKm',
    label: 'Oil/filter maintenance interval (km)',
    labelAr: 'دورة صيانة الزيوت والفلاتر (كم)',
    description: 'Kilometers between scheduled oil/filter maintenance (RULE-M01).',
    tier: 'business_rule', valueType: 'number', value: 7000, min: 3000, max: 15000, editable: true,
    sourceNote: 'Blueprint item 9: "كل 5,000 إلى 8,000 كم" -- midpoint used as the editable default.'
  },
  {
    id: 'maintenanceAlertLeadKm',
    label: 'Pre-maintenance workshop alert lead distance (km)',
    labelAr: 'مسافة التنبيه المسبق قبل موعد الصيانة (كم)',
    description: 'Kilometers before a maintenance threshold at which the workshop manager is alerted (RULE-M03).',
    tier: 'business_rule', valueType: 'number', value: 500, min: 100, max: 2000, editable: true,
    sourceNote: 'Blueprint item 9: "قبل موعد الصيانة بـ 500 كم".'
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
  },

  // ---- Lease-to-Own (Splendor Private Mobility Operating System) ----
  // Financial-formula rules (monthly markup, processing fee, early-
  // settlement fee) have NEVER existed anywhere in this codebase before --
  // seeded at value:null per this catalog's own established precedent
  // (see the retention* rules above), never an invented percentage. A
  // CEO/Admin must set a real number through this same Business Rules
  // Engine (Settings) before src/server/leaseToOwnPolicy.ts will compute a
  // real financial offer -- see computeLtoFinancialOffer()'s
  // LtoPolicyNotConfiguredError. Operational/timing rules below (grace
  // days, late threshold, minimum age, application hold) are seeded with a
  // real, reasonable default, same class as notificationExpiryLookaheadDays
  // above -- not a financial formula, an operational window.
  {
    id: 'ltoMonthlyMarkupRatePercent',
    label: 'Lease-to-Own: total markup rate over the financed amount (%)',
    labelAr: 'الإيجار المنتهي بالتملك: نسبة الهامش الإجمالية على المبلغ الممول (%)',
    description: 'Not yet defined -- requires a business/finance decision before the first real LTO offer can be issued. Applied once, over the whole term, to (vehicle price - down payment - final payment), then spread evenly across the monthly installments -- see computeLtoFinancialOffer().',
    tier: 'sensitive_rule', valueType: 'number', value: null, min: 0, max: 100, editable: true,
    sourceNote: 'New this session -- no prior LTO financing existed in this codebase; no value invented.'
  },
  {
    id: 'ltoProcessingFeeAed',
    label: 'Lease-to-Own: one-time processing/documentation fee (AED)',
    labelAr: 'الإيجار المنتهي بالتملك: رسوم معالجة/توثيق لمرة واحدة (درهم)',
    description: 'Not yet defined -- requires a business decision. Added once to the total contract value, VAT-inclusive via the same UAE_VAT_RATE every other fee in this app already uses.',
    tier: 'sensitive_rule', valueType: 'number', value: null, min: 0, max: 100000, editable: true,
    sourceNote: 'New this session -- no prior LTO financing existed in this codebase; no value invented.'
  },
  {
    id: 'ltoOwnershipTransferFeeAed',
    label: 'Lease-to-Own: ownership transfer processing fee (AED, borne by the customer)',
    labelAr: 'الإيجار المنتهي بالتملك: رسوم إجراءات نقل الملكية (درهم، على نفقة العميل)',
    description: 'Not yet defined -- requires a business decision (represents real RTA/administrative transfer costs). Per Splendor\'s own approved LTO contract template (Clause 6): full early settlement requires the lessor to immediately transfer ownership "at the expense of" the customer requesting it -- the contract sets NO early-settlement penalty or discount on the outstanding balance itself, only that the transfer\'s processing costs are the customer\'s. This fee models exactly that cost, added to the outstanding balance to form the final settlement amount -- see computeSettlementAmount().',
    tier: 'sensitive_rule', valueType: 'number', value: null, min: 0, max: 100000, editable: true,
    sourceNote: 'New this session -- sourced from Splendor\'s real LTO contract template Clause 6; no percentage/penalty invented since the contract specifies none.'
  },
  {
    id: 'ltoConsecutiveMissedInstallmentsForDefault',
    label: 'Lease-to-Own: consecutive missed monthly installments that make an agreement eligible for default/termination',
    labelAr: 'الإيجار المنتهي بالتملك: عدد الأقساط الشهرية المتتالية غير المسددة المؤهلة للتعثر/الفسخ',
    description: 'Per Splendor\'s own approved LTO contract template (Clause 3): "the lessor has the right to terminate the contract and recover the vehicle in case of a delay in installment payments for two consecutive months." This is a REAL, sourced contractual threshold, not an invented one -- markLtoDefault()/the collections workflow uses this to flag an agreement as default-eligible, but never terminates or recovers the vehicle automatically (that remains a human decision with RBAC/SoD -- see RULE-LTO09).',
    tier: 'business_rule', valueType: 'number', value: 2, min: 1, max: 12, editable: true,
    sourceNote: 'Sourced directly from Splendor\'s real, approved LTO contract template, Clause 3 ("شهرين متتاليين") -- not invented.'
  },
  {
    id: 'ltoMinCustomerAgeYears',
    label: 'Lease-to-Own: minimum customer age (years)',
    labelAr: 'الإيجار المنتهي بالتملك: الحد الأدنى لعمر العميل (سنة)',
    description: 'Minimum age for LTO eligibility, checked against the customer\'s ID/passport expiry-implied or recorded date of birth if on file.',
    tier: 'business_rule', valueType: 'number', value: 21, min: 18, max: 99, editable: true,
    sourceNote: 'New this session -- a reasonable operational default (UAE legal adult age), not a financial formula.'
  },
  {
    id: 'ltoGraceDays',
    label: 'Lease-to-Own: grace period after an installment\'s due date (days)',
    labelAr: 'الإيجار المنتهي بالتملك: فترة سماح بعد تاريخ استحقاق القسط (أيام)',
    description: 'An unpaid installment still shows as DUE (not LATE) for this many days after its due date.',
    tier: 'business_rule', valueType: 'number', value: 5, min: 0, max: 60, editable: true,
    sourceNote: 'New this session -- an operational collections-timing window, not a financial formula.'
  },
  {
    id: 'ltoLateThresholdDays',
    label: 'Lease-to-Own: days late before an installment is OVERDUE',
    labelAr: 'الإيجار المنتهي بالتملك: عدد أيام التأخير قبل اعتبار القسط متأخر السداد',
    description: 'Days past the due date (beyond the grace period) before an installment escalates from LATE to OVERDUE for collections purposes.',
    tier: 'business_rule', valueType: 'number', value: 15, min: 1, max: 180, editable: true,
    sourceNote: 'New this session -- an operational collections-timing window, not a financial formula.'
  },
  {
    id: 'ltoApplicationHoldDays',
    label: 'Lease-to-Own: vehicle hold duration while an application is under review (days)',
    labelAr: 'الإيجار المنتهي بالتملك: مدة حجز المركبة أثناء مراجعة الطلب (أيام)',
    description: 'How long the selected vehicle is held (via the existing temporary-hold mechanism) once an LTO application is submitted, before the hold lapses if the application has not been decided.',
    tier: 'business_rule', valueType: 'number', value: 3, min: 1, max: 30, editable: true,
    sourceNote: 'New this session -- an operational timing window, matching the existing temporary-hold mechanism\'s own precedent.'
  }
];
