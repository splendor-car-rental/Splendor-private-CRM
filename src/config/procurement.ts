import { UserRole } from '../types';
import type {
  SupplierOperationTypeDef, SupplierOperationTypeKey, SupplierFieldKey, SupplierFieldTier
} from '../types';

// ============================================================================
// PROCUREMENT & SUPPLIER MANAGEMENT -- fixed/configurable lists (Phase 1)
// ============================================================================
// Lists the spec gave verbatim are implemented exactly as given, marked
// FROM SPEC below. Lists the spec required to be "fixed" without
// enumerating every value are a clearly-labeled starter set, marked
// STARTER SET -- NEEDS BUSINESS REVIEW, editable the same way
// NOTIFICATION_EVENTS/DEFAULT_BUSINESS_RULES already are elsewhere in this
// app, never hardcoded into a route with no way to extend it.

// ---- Supplier operation types (rule 2) -- FROM SPEC ----
export const DEFAULT_SUPPLIER_OPERATION_TYPES: SupplierOperationTypeDef[] = [
  { key: 'vehicle_supply_rental', labelEn: 'Vehicle supply / rental', labelAr: 'توريد/استئجار سيارة', active: true },
  { key: 'spare_parts', labelEn: 'Spare parts', labelAr: 'قطع غيار', active: true },
  { key: 'maintenance_repair', labelEn: 'Maintenance & repair', labelAr: 'صيانة وإصلاح', active: true },
  { key: 'tires', labelEn: 'Tires', labelAr: 'إطارات', active: true },
  { key: 'operating_materials', labelEn: 'Operating materials', labelAr: 'مواد تشغيل', active: true },
  { key: 'equipment', labelEn: 'Equipment & devices', labelAr: 'أجهزة ومعدات', active: true },
  { key: 'services', labelEn: 'Services', labelAr: 'خدمات', active: true },
  { key: 'other_purchases', labelEn: 'Other purchases', labelAr: 'مشتريات أخرى', active: true },
  { key: 'other', labelEn: 'Other', labelAr: 'أخرى', active: true }
];

// ---- Retroactive PO reasons (rule 57) -- "emergency_purchase" is FROM SPEC;
// the rest is a STARTER SET -- NEEDS BUSINESS REVIEW ----
export interface RetroactivePOReasonDef { key: string; labelEn: string; labelAr: string; active: boolean }
export const DEFAULT_RETROACTIVE_PO_REASONS: RetroactivePOReasonDef[] = [
  { key: 'emergency_purchase', labelEn: 'Emergency purchase', labelAr: 'شراء طارئ', active: true }, // FROM SPEC (rule 62)
  { key: 'invoice_received_before_po', labelEn: 'Invoice received before a PO existed', labelAr: 'وصول فاتورة قبل وجود أمر توريد', active: true },
  { key: 'price_confirmed_after_delivery', labelEn: 'Price only confirmed after delivery', labelAr: 'تأكيد السعر بعد التسليم فقط', active: true },
  { key: 'verbal_agreement_formalized_late', labelEn: 'Verbal agreement formalized after the fact', labelAr: 'اتفاق شفهي تم توثيقه لاحقًا', active: true },
  { key: 'other', labelEn: 'Other', labelAr: 'أخرى', active: true }
];

// ---- Debt/charge types (rule 34) -- FROM SPEC (the spec's own "such as" list, taken as the fixed set plus its own "other approved types" and "other") ----
export interface DebtTypeDef { key: string; labelEn: string; labelAr: string; active: boolean }
export const DEBT_TYPE_DEFS: DebtTypeDef[] = [
  { key: 'late_fee', labelEn: 'Late fee', labelAr: 'رسوم تأخير', active: true },
  { key: 'traffic_fine', labelEn: 'Traffic fine', labelAr: 'مخالفة مرورية', active: true },
  { key: 'salik', labelEn: 'Salik / toll', labelAr: 'سالك', active: true },
  { key: 'damage', labelEn: 'Damage', labelAr: 'أضرار', active: true },
  { key: 'fuel_shortage', labelEn: 'Fuel shortage', labelAr: 'نقص وقود', active: true },
  { key: 'cleaning', labelEn: 'Cleaning', labelAr: 'تنظيف', active: true },
  { key: 'delivery_collection', labelEn: 'Delivery / collection', labelAr: 'توصيل/استلام', active: true },
  { key: 'other_approved', labelEn: 'Other approved type', labelAr: 'أنواع أخرى معتمدة', active: true },
  { key: 'other', labelEn: 'Other', labelAr: 'أخرى', active: true }
];

// ---- Procurement payment methods (rule 67) -- FROM SPEC ----
export interface ProcurementPaymentMethodDef { key: string; labelEn: string; labelAr: string }
export const PROCUREMENT_PAYMENT_METHOD_DEFS: ProcurementPaymentMethodDef[] = [
  { key: 'cash', labelEn: 'Cash', labelAr: 'نقدي' },
  { key: 'bank_card', labelEn: 'Bank card', labelAr: 'بطاقة بنكية' },
  { key: 'bank_transfer', labelEn: 'Bank transfer', labelAr: 'تحويل بنكي' },
  { key: 'cheque', labelEn: 'Cheque', labelAr: 'شيك' },
  { key: 'electronic_payment', labelEn: 'Electronic payment', labelAr: 'دفع إلكتروني' },
  { key: 'employee_custody', labelEn: 'From employee custody/float', labelAr: 'من عهدة موظف' },
  { key: 'other', labelEn: 'Other', labelAr: 'أخرى' }
];

// ---- Expense categories (employee expenses, rule 43-51, and standalone operational expenses, rule 64) --
// STARTER SET -- NEEDS BUSINESS REVIEW: the spec requires a fixed category choice but
// never enumerates the categories themselves. ----
export interface ExpenseCategoryDef { key: string; labelEn: string; labelAr: string; active: boolean }
export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryDef[] = [
  { key: 'fuel', labelEn: 'Fuel', labelAr: 'وقود', active: true },
  { key: 'maintenance', labelEn: 'Maintenance', labelAr: 'صيانة', active: true },
  { key: 'supplies', labelEn: 'Supplies', labelAr: 'مستلزمات', active: true },
  { key: 'meals', labelEn: 'Meals', labelAr: 'وجبات', active: true },
  { key: 'transport', labelEn: 'Transport', labelAr: 'مواصلات', active: true },
  { key: 'tolls_parking', labelEn: 'Tolls / parking', labelAr: 'رسوم مرور/مواقف', active: true },
  { key: 'other', labelEn: 'Other', labelAr: 'أخرى', active: true }
];

// ---- Supplier field completeness tiers (rules 5-7) ----
export const SUPPLIER_FIELD_TIERS: Record<SupplierFieldKey, SupplierFieldTier> = {
  legalName: 'core_mandatory',
  tradeLicenseNumber: 'core_mandatory',
  phone: 'core_mandatory',
  taxRegistrationNumber: 'required_to_complete',
  bankDetails: 'required_to_complete',
  email: 'required_to_complete',
  address: 'required_to_complete',
  tradeName: 'optional',
  documentIds: 'optional',
  agreementDocumentIds: 'optional',
  policiesNotes: 'optional'
};

// Which fields are BLOCKING (must exist or a documented override/approval is needed)
// for each operation type -- always includes every core_mandatory field, plus
// bankDetails for the one operation type that always ends in a supplier payment
// (vehicle supply/rental). STARTER SET -- NEEDS BUSINESS REVIEW for anything
// beyond the always-blocking core_mandatory fields; kept deliberately narrow
// so this never blocks a real operation the business didn't intend to gate.
export const SUPPLIER_OPERATION_BLOCKING_FIELDS: Record<SupplierOperationTypeKey, SupplierFieldKey[]> = {
  vehicle_supply_rental: ['legalName', 'tradeLicenseNumber', 'phone', 'bankDetails'],
  spare_parts: ['legalName', 'tradeLicenseNumber', 'phone'],
  maintenance_repair: ['legalName', 'tradeLicenseNumber', 'phone'],
  tires: ['legalName', 'tradeLicenseNumber', 'phone'],
  operating_materials: ['legalName', 'tradeLicenseNumber', 'phone'],
  equipment: ['legalName', 'tradeLicenseNumber', 'phone'],
  services: ['legalName', 'tradeLicenseNumber', 'phone'],
  other_purchases: ['legalName', 'tradeLicenseNumber', 'phone'],
  other: ['legalName', 'tradeLicenseNumber', 'phone']
};

// ---- PO approval -- INTERIM SINGLE TIER, see "decisions needing approval" ----
// Rules 10-11 require the system to re-evaluate the REQUIRED APPROVAL LEVEL
// automatically as a PO's value changes, and forbid an old approval from
// covering an increase that needs a higher level. That behavior requires
// real value thresholds (e.g. "under X needs role A, over Y needs role B")
// which do not exist anywhere in the 89-rule spec or in this codebase. This
// is a genuine new business decision, not a technical detail -- per the
// spec's own stop-rule, it is NOT invented here. What IS implemented, as the
// technically-necessary minimum to protect data in the meantime, is a single
// interim approval tier: every PO, at any value, requires one authorized
// approver who is NOT the requester (Four-Eyes, reusing the same
// segregation-of-duties primitive as the rest of this codebase's governance
// engine). The moment real tier thresholds are supplied, this becomes a
// lookup table keyed by value range instead of one constant tier.
export const PO_APPROVAL_TIER_INTERIM = 'standard_maker_checker';
export const PO_APPROVER_ROLES: UserRole[] = ['ceo', 'admin'];

/** Computes the required approval tier for a PO's current total value. Single interim tier until real thresholds are supplied -- see the constant's own comment above. */
export function computeRequiredApprovalTier(_totalValue: number): string {
  return PO_APPROVAL_TIER_INTERIM;
}

// ---- Customer delay / late fee (rule 81) -- FROM SPEC, real numbers given by the business ----
export const LATE_FEE_GRACE_PERIOD_HOURS = 1;
export const LATE_FEE_EXTRA_DAY_CONVERSION_HOURS = 6; // hours of delay AFTER the grace period before it converts to a full extra rental day

// ---- TARS (rule 74) -- FROM SPEC, real number given by the business ----
export const TARS_DEADLINE_HOURS = 3;
