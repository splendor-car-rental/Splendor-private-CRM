import {
  SUPPLIER_FIELD_TIERS, SUPPLIER_OPERATION_BLOCKING_FIELDS
} from '../config/procurement.js';
import type {
  Supplier, SupplierFieldKey, SupplierCompletenessSummary, SupplierEligibilityResult,
  SupplierOperationTypeKey
} from '../types/index.js';

// ----------------------------------------------------
// SUPPLIERS MODULE (Splendor Procurement, Phase 1, rules 4-7)
// ----------------------------------------------------
// A supplier's fields are tiered (core-mandatory / required-to-complete /
// optional, see src/config/procurement.ts) so a supplier can be activated
// the moment its core-mandatory fields exist, without being blocked by data
// the CURRENT operation doesn't actually need (rule 6: "لا تعرض تحذيرات لا
// تؤثر على العملية الحالية").

function isFieldPresent(supplier: Supplier, field: SupplierFieldKey): boolean {
  const value = (supplier as unknown as Record<string, unknown>)[field];
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some((v) => !!v);
  return true;
}

const ALL_SUPPLIER_FIELDS = Object.keys(SUPPLIER_FIELD_TIERS) as SupplierFieldKey[];

/** Can this supplier be activated at all? Only the core-mandatory fields gate activation -- rule 6. */
export function canActivateSupplier(supplier: Supplier): boolean {
  return ALL_SUPPLIER_FIELDS
    .filter((f) => SUPPLIER_FIELD_TIERS[f] === 'core_mandatory')
    .every((f) => isFieldPresent(supplier, f));
}

/** Overall completeness -- rule 7 (monitoring, percent complete, what's missing/present). */
export function computeSupplierCompleteness(supplier: Supplier): SupplierCompletenessSummary {
  const trackedFields = ALL_SUPPLIER_FIELDS.filter((f) => SUPPLIER_FIELD_TIERS[f] !== 'optional');
  const present = trackedFields.filter((f) => isFieldPresent(supplier, f));
  const missingRequiredToComplete = trackedFields.filter(
    (f) => SUPPLIER_FIELD_TIERS[f] === 'required_to_complete' && !isFieldPresent(supplier, f)
  );
  return {
    supplierId: supplier.id,
    supplierName: supplier.legalName,
    completionPercent: trackedFields.length === 0 ? 100 : Math.round((present.length / trackedFields.length) * 100),
    missingRequiredToComplete,
    presentFields: present
  };
}

/**
 * Rule 6: when a supplier is chosen for a specific operation type, checks
 * ONLY what that operation type actually needs.
 *  - met: every blocking field for this operation type is present.
 *  - non_blocking_gap: a required-to-complete field is missing, but nothing
 *    this specific operation type actually blocks on -- surfaced in the
 *    completeness list, never shown as a warning here.
 *  - blocking_gap: a field this operation type explicitly requires is
 *    missing -- approval cannot proceed until it's completed or an
 *    authorized override is recorded.
 */
export function checkSupplierEligibility(supplier: Supplier, operationType: SupplierOperationTypeKey): SupplierEligibilityResult {
  const blockingFields = SUPPLIER_OPERATION_BLOCKING_FIELDS[operationType] || [];
  const missingBlocking = blockingFields.filter((f) => !isFieldPresent(supplier, f));

  if (missingBlocking.length > 0) {
    return { supplierId: supplier.id, operationType, status: 'blocking_gap', missingFields: missingBlocking };
  }

  const missingRequiredToComplete = ALL_SUPPLIER_FIELDS.filter(
    (f) => SUPPLIER_FIELD_TIERS[f] === 'required_to_complete' && !isFieldPresent(supplier, f)
  );
  if (missingRequiredToComplete.length > 0) {
    return { supplierId: supplier.id, operationType, status: 'non_blocking_gap', missingFields: missingRequiredToComplete };
  }

  return { supplierId: supplier.id, operationType, status: 'met', missingFields: [] };
}
