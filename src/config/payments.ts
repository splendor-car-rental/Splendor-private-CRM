import type { PaymentMethod } from '../types';

// ============================================================================
// CUSTOMER-FACING PAYMENT METHODS -- manageable catalog (Collections & Bank
// Reconciliation mission)
// ============================================================================
// Distinct from ProcurementPaymentMethodDef (src/config/procurement.ts),
// which is how Splendor PAYS suppliers -- this is how Splendor RECEIVES
// money from customers. Same shape/spirit (a seeded starter set an admin
// can extend/relabel/deactivate at runtime, never a hardcoded frontend
// dropdown), a different domain, so this is additive, not a duplicate of
// the Procurement list.
//
// `key` is validated against the PaymentMethod union for the seeded
// defaults; an admin-added custom method (the mission's "وغيرها" / "and
// others") uses key:'other' with its own label, exactly the same fallback
// pattern PROCUREMENT_PAYMENT_METHOD_DEFS already uses for the same reason.

export interface CustomerPaymentMethodDef {
  key: PaymentMethod;
  labelEn: string;
  labelAr: string;
  active: boolean;
  /** A reference number (transfer ref, cheque number, POS terminal ref) is expected for this method -- surfaced as a UI hint, never a hard block, since a real-world receipt sometimes has none. */
  requiresReference: boolean;
  /** Proof of payment (receipt photo, transfer confirmation, cheque scan) is expected -- see Payment.proofDocumentId. */
  requiresProof: boolean;
}

export const DEFAULT_CUSTOMER_PAYMENT_METHODS: CustomerPaymentMethodDef[] = [
  { key: 'cash', labelEn: 'Cash', labelAr: 'نقدي', active: true, requiresReference: false, requiresProof: false },
  { key: 'pos_card', labelEn: 'POS Card (in-person)', labelAr: 'بطاقة POS', active: true, requiresReference: true, requiresProof: true },
  { key: 'bank_transfer', labelEn: 'Bank Transfer', labelAr: 'تحويل بنكي', active: true, requiresReference: true, requiresProof: true },
  { key: 'cheque', labelEn: 'Cheque', labelAr: 'شيك', active: true, requiresReference: true, requiresProof: true },
  { key: 'online_link', labelEn: 'Online Payment Link', labelAr: 'رابط دفع إلكتروني', active: true, requiresReference: true, requiresProof: false },
  { key: 'corporate_credit', labelEn: 'Corporate Credit Account', labelAr: 'حساب ائتماني للشركات', active: true, requiresReference: false, requiresProof: false },
  { key: 'card', labelEn: 'Card (legacy/general)', labelAr: 'بطاقة (عام)', active: false, requiresReference: true, requiresProof: true },
  { key: 'other', labelEn: 'Other', labelAr: 'أخرى', active: true, requiresReference: false, requiresProof: false }
];
