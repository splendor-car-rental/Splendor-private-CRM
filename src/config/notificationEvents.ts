import { NotificationCategory } from '../types/index.js';

/**
 * Every action/event/milestone across the CRM that can be toggled on/off in
 * the Notification & WhatsApp Control Center, grouped exactly per the
 * business owner's spec: Customer Management, Contract Lifecycle,
 * Fleet/Mulkiya/Insurance expiry, Financial Ledgers & Security Deposits,
 * Tolls/Parking imports, System Activities.
 *
 * This is static metadata (key/category/labels) shared by client and
 * server -- the per-event on/off + recipients config that goes with each
 * key lives in globalStore.notificationEventConfigs (server.ts/dataStore.ts)
 * and is edited via the Control Center UI. Adding a new event to the CRM
 * later is a one-line addition here plus a dispatchNotificationEvent() call
 * at the point in server.ts where that event actually happens.
 */
export interface NotificationEventDef {
  key: string;
  category: NotificationCategory;
  labelEn: string;
  labelAr: string;
  /** True for events raised by the automated background monitoring sweep (src/server/notificationEngine.ts) rather than fired inline from a user action. */
  automated?: boolean;
}

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  // Customer Management
  { key: 'customer_created', category: 'customer', labelEn: 'New customer registered', labelAr: 'تسجيل عميل جديد' },
  { key: 'customer_blocklisted', category: 'customer', labelEn: 'Customer blocklisted', labelAr: 'إضافة عميل للقائمة السوداء' },
  { key: 'customer_document_expiring', category: 'customer', labelEn: 'Customer ID/License expiring soon', labelAr: 'اقتراب انتهاء هوية أو رخصة عميل', automated: true },

  // Contract Lifecycle
  { key: 'contract_created', category: 'contract', labelEn: 'New contract created', labelAr: 'إنشاء عقد جديد' },
  { key: 'contract_handover', category: 'contract', labelEn: 'Vehicle handed over to customer', labelAr: 'تسليم المركبة للعميل' },
  { key: 'contract_return', category: 'contract', labelEn: 'Vehicle returned / contract closed', labelAr: 'استلام المركبة وإغلاق العقد' },
  { key: 'contract_overdue', category: 'contract', labelEn: 'Contract overdue for return', labelAr: 'عقد متأخر عن موعد التسليم', automated: true },

  // Fleet / Mulkiya / Insurance
  { key: 'vehicle_registration_expiring', category: 'fleet', labelEn: 'Vehicle registration (Mulkiya) expiring soon', labelAr: 'اقتراب انتهاء الملكية (الرخصة) لمركبة', automated: true },
  { key: 'vehicle_insurance_expiring', category: 'fleet', labelEn: 'Vehicle insurance expiring soon', labelAr: 'اقتراب انتهاء تأمين مركبة', automated: true },
  { key: 'vehicle_maintenance_due', category: 'fleet', labelEn: 'Vehicle due for maintenance', labelAr: 'موعد صيانة مركبة مستحق' },

  // Financial Ledgers & Security Deposits
  { key: 'payment_received', category: 'financial', labelEn: 'Payment recorded', labelAr: 'تسجيل دفعة جديدة' },
  { key: 'invoice_overdue', category: 'financial', labelEn: 'Invoice overdue', labelAr: 'فاتورة متأخرة السداد', automated: true },
  { key: 'deposit_refund_due', category: 'financial', labelEn: 'Security deposit due for refund', labelAr: 'اقتراب استحقاق استرجاع مبلغ التأمين', automated: true },

  // Tolls / Parking imports
  { key: 'toll_import_completed', category: 'tolls', labelEn: 'Salik/Darb statement imported', labelAr: 'استيراد كشف سالك/درب' },
  { key: 'toll_unmatched_transaction', category: 'tolls', labelEn: 'Unmatched toll/parking transactions need review', labelAr: 'معاملات رسوم/مواقف بلا مطابقة تحتاج مراجعة', automated: true },

  // System Activities
  { key: 'staff_account_created', category: 'system', labelEn: 'New staff account created', labelAr: 'إنشاء حساب موظف جديد' },
  { key: 'staff_role_changed', category: 'system', labelEn: 'Staff role/permissions changed', labelAr: 'تغيير دور أو صلاحيات موظف' },
  { key: 'bank_statement_imported', category: 'system', labelEn: 'Bank statement imported', labelAr: 'استيراد كشف حساب بنكي' },
  { key: 'bank_discrepancy_found', category: 'system', labelEn: 'Bank reconciliation discrepancy needs review', labelAr: 'وجود اختلاف في المطابقة البنكية يحتاج مراجعة', automated: true },
  { key: 'system_health_alert', category: 'system', labelEn: 'Operational health check failed (Firestore / WhatsApp / background jobs / dead-letter queue)', labelAr: 'فشل فحص الصحة التشغيلية (قاعدة البيانات / واتساب / المهام الخلفية / قائمة العمليات الفاشلة)', automated: true },
  { key: 'whatsapp_conversation_needs_human', category: 'system', labelEn: 'WhatsApp customer requested human assistance', labelAr: 'طلب عميل واتساب التحدث مع موظف' }
];

export function getNotificationEventDef(key: string): NotificationEventDef | undefined {
  return NOTIFICATION_EVENTS.find(e => e.key === key);
}

export interface CustomerNotificationEventDef {
  key: string;
  labelEn: string;
  labelAr: string;
  /** True when this fires from the automated sweep (payment due/overdue, contract expiring) rather than inline from a direct action. */
  automated?: boolean;
}

/**
 * Customer-facing WhatsApp messages -- separate from the staff/group
 * NOTIFICATION_EVENTS above because the recipient is always "the customer
 * on this specific record" rather than a configurable staff/group list, so
 * the Control Center shows these as simple on/off toggles with no
 * recipient picker.
 */
export const CUSTOMER_NOTIFICATION_EVENTS: CustomerNotificationEventDef[] = [
  { key: 'customer_toll_charge', labelEn: 'Salik/Darb/traffic fine charged to their account', labelAr: 'تحصيل رسوم سالك/درب/مخالفة على حساب العميل' },
  { key: 'customer_payment_receipt', labelEn: 'Payment receipt (cash/card/transfer)', labelAr: 'إيصال استلام دفعة (نقدي/بطاقة/تحويل)' },
  { key: 'customer_payment_due', labelEn: 'Upcoming payment due date reminder', labelAr: 'تذكير باقتراب موعد استحقاق دفعة', automated: true },
  { key: 'customer_payment_overdue', labelEn: 'Overdue payment / arrears reminder', labelAr: 'تذكير بمتأخرات السداد', automated: true },
  { key: 'customer_contract_expiring', labelEn: 'Contract nearing expiry reminder', labelAr: 'تذكير باقتراب انتهاء العقد', automated: true },
  { key: 'customer_contract_extended', labelEn: 'Contract extension addendum notice', labelAr: 'إشعار ملحق تمديد العقد' },

  // Lease-to-Own (Splendor Private Mobility Operating System)
  { key: 'lto_application_received', labelEn: 'Lease-to-Own application received', labelAr: 'استلام طلب الإيجار المنتهي بالتملك' },
  { key: 'lto_application_approved', labelEn: 'Lease-to-Own application approved', labelAr: 'الموافقة على طلب الإيجار المنتهي بالتملك' },
  { key: 'lto_application_rejected', labelEn: 'Lease-to-Own application rejected', labelAr: 'رفض طلب الإيجار المنتهي بالتملك' },
  { key: 'lto_payment_reminder', labelEn: 'Lease-to-Own upcoming installment reminder', labelAr: 'تذكير باستحقاق قسط الإيجار المنتهي بالتملك' },
  { key: 'lto_payment_due', labelEn: 'Lease-to-Own installment due today', labelAr: 'استحقاق قسط الإيجار المنتهي بالتملك اليوم' },
  { key: 'lto_payment_late', labelEn: 'Lease-to-Own installment overdue', labelAr: 'تأخر سداد قسط الإيجار المنتهي بالتملك' },
  { key: 'lto_statement', labelEn: 'Lease-to-Own account statement', labelAr: 'كشف حساب الإيجار المنتهي بالتملك' },
  { key: 'lto_settlement', labelEn: 'Lease-to-Own settlement confirmation', labelAr: 'تأكيد تسوية الإيجار المنتهي بالتملك' },
  { key: 'lto_ownership_transfer', labelEn: 'Lease-to-Own ownership transfer', labelAr: 'نقل ملكية الإيجار المنتهي بالتملك' }
];

export function getCustomerNotificationEventDef(key: string): CustomerNotificationEventDef | undefined {
  return CUSTOMER_NOTIFICATION_EVENTS.find(e => e.key === key);
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, { en: string; ar: string }> = {
  customer: { en: 'Customer Management', ar: 'إدارة العملاء' },
  contract: { en: 'Contract Lifecycle', ar: 'دورة حياة العقد' },
  fleet: { en: 'Fleet, Mulkiya & Insurance', ar: 'الأسطول والملكية والتأمين' },
  financial: { en: 'Financial Ledgers & Deposits', ar: 'السجلات المالية والتأمينات' },
  tolls: { en: 'Tolls & Parking', ar: 'الرسوم والمواقف' },
  system: { en: 'System Activities', ar: 'أنشطة النظام' }
};
