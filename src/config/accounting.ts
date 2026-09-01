import type { AccountingAccount } from '../accounting/types';

// Controlled default chart. These definitions are code defaults only: they
// are NOT seeded into Firestore and never overwrite an existing production
// chart. The accounting API overlays explicit Firestore account records on
// top of this catalog, so additions/labels/activation can be configured
// without a destructive migration.
export const DEFAULT_CHART_OF_ACCOUNTS: AccountingAccount[] = [
  { code: '1000', name: 'Cash', nameAr: 'الصندوق النقدي', accountClass: 'asset', normalSide: 'debit', active: true, system: true, allowDirectPosting: true, cashEquivalent: true },
  { code: '1100', name: 'Bank Accounts', nameAr: 'الحسابات البنكية', accountClass: 'asset', normalSide: 'debit', active: true, system: true, allowDirectPosting: true, cashEquivalent: true },
  { code: '1200', name: 'Card & Payment Gateway Clearing', nameAr: 'تسويات البطاقات وبوابات الدفع', accountClass: 'asset', normalSide: 'debit', active: true, system: true, allowDirectPosting: true, cashEquivalent: true },
  { code: '1300', name: 'Accounts Receivable', nameAr: 'حسابات العملاء المدينة', accountClass: 'asset', normalSide: 'debit', active: true, system: true, allowDirectPosting: false },
  { code: '1400', name: 'Security Deposits Receivable', nameAr: 'تأمينات مستحقة القبض', accountClass: 'asset', normalSide: 'debit', active: true, system: true, allowDirectPosting: false },
  { code: '1500', name: 'Fleet Vehicles / Fixed Assets', nameAr: 'مركبات الأسطول والأصول الثابتة', accountClass: 'asset', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '1600', name: 'Prepaid Expenses', nameAr: 'المصروفات المقدمة', accountClass: 'asset', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '1700', name: 'VAT Input', nameAr: 'ضريبة مدخلات قابلة للاسترداد', accountClass: 'asset', normalSide: 'debit', active: true, system: true, allowDirectPosting: false },

  { code: '2000', name: 'Accounts Payable', nameAr: 'حسابات الموردين الدائنة', accountClass: 'liability', normalSide: 'credit', active: true, system: true, allowDirectPosting: false },
  { code: '2100', name: 'Customer Security Deposits Held', nameAr: 'تأمينات العملاء المحتجزة', accountClass: 'liability', normalSide: 'credit', active: true, system: true, allowDirectPosting: false },
  { code: '2200', name: 'VAT Output / Payable', nameAr: 'ضريبة مخرجات مستحقة', accountClass: 'liability', normalSide: 'credit', active: true, system: true, allowDirectPosting: false },
  { code: '2300', name: 'Vehicle Finance / Loans', nameAr: 'تمويل المركبات والقروض', accountClass: 'liability', normalSide: 'credit', active: true, system: true, allowDirectPosting: true },
  { code: '2400', name: 'Accrued Expenses', nameAr: 'مصروفات مستحقة', accountClass: 'liability', normalSide: 'credit', active: true, system: true, allowDirectPosting: true },

  { code: '3000', name: 'Owner Equity', nameAr: 'حقوق الملكية', accountClass: 'equity', normalSide: 'credit', active: true, system: true, allowDirectPosting: true },
  { code: '3100', name: 'Retained Earnings', nameAr: 'الأرباح المحتجزة', accountClass: 'equity', normalSide: 'credit', active: true, system: true, allowDirectPosting: false },

  { code: '4000', name: 'Rental Revenue', nameAr: 'إيرادات تأجير السيارات', accountClass: 'revenue', normalSide: 'credit', active: true, system: true, allowDirectPosting: false },
  { code: '4100', name: 'Lease-to-Own Revenue', nameAr: 'إيرادات الإيجار المنتهي بالتملك', accountClass: 'revenue', normalSide: 'credit', active: true, system: true, allowDirectPosting: false },
  { code: '4200', name: 'Extra Charges Revenue', nameAr: 'إيرادات الرسوم الإضافية', accountClass: 'revenue', normalSide: 'credit', active: true, system: true, allowDirectPosting: false },
  { code: '4210', name: 'Salik Recharge Revenue', nameAr: 'إيرادات إعادة تحميل سالك', accountClass: 'revenue', normalSide: 'credit', active: true, system: true, allowDirectPosting: false },
  { code: '4220', name: 'Parking Recharge Revenue', nameAr: 'إيرادات إعادة تحميل المواقف', accountClass: 'revenue', normalSide: 'credit', active: true, system: true, allowDirectPosting: false },
  { code: '4300', name: 'Damage Recoveries', nameAr: 'تحصيلات أضرار المركبات', accountClass: 'revenue', normalSide: 'credit', active: true, system: true, allowDirectPosting: false },
  { code: '4900', name: 'Other Income', nameAr: 'إيرادات أخرى', accountClass: 'revenue', normalSide: 'credit', active: true, system: true, allowDirectPosting: true },

  { code: '5000', name: 'Vehicle Maintenance', nameAr: 'صيانة المركبات', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5010', name: 'Vehicle Insurance', nameAr: 'تأمين المركبات', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5020', name: 'Vehicle Registration', nameAr: 'ترخيص وتسجيل المركبات', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5030', name: 'Vehicle Finance Interest', nameAr: 'تكلفة تمويل المركبات', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5100', name: 'Salaries', nameAr: 'الرواتب', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5110', name: 'Office Rent', nameAr: 'إيجار المكتب', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5120', name: 'Fuel', nameAr: 'الوقود', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5130', name: 'Cleaning / Detailing', nameAr: 'الغسيل والتجهيز', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5140', name: 'Marketing', nameAr: 'التسويق', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5150', name: 'Commissions', nameAr: 'العمولات', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5160', name: 'Toll / Parking Company Expense', nameAr: 'مصروفات سالك والمواقف على الشركة', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5170', name: 'Supplier Costs', nameAr: 'تكاليف الموردين', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5180', name: 'Bank Charges', nameAr: 'رسوم بنكية', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5190', name: 'Depreciation', nameAr: 'الإهلاك', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true },
  { code: '5990', name: 'Miscellaneous Expenses', nameAr: 'مصروفات متنوعة', accountClass: 'expense', normalSide: 'debit', active: true, system: true, allowDirectPosting: true }
];

export const DEFAULT_EXPENSE_ACCOUNT_BY_CATEGORY: Record<string, string> = {
  maintenance: '5000',
  insurance: '5010',
  registration: '5020',
  vehicle_finance: '5030',
  salary: '5100',
  rent: '5110',
  fuel: '5120',
  cleaning: '5130',
  marketing: '5140',
  commission: '5150',
  toll_parking: '5160',
  supplier_expense: '5170',
  bank_charges: '5180',
  depreciation: '5190',
  miscellaneous: '5990'
};

export const ACCOUNTING_CONTROL_ACCOUNTS = {
  cash: '1000',
  bank: '1100',
  cardClearing: '1200',
  accountsReceivable: '1300',
  vatInput: '1700',
  accountsPayable: '2000',
  customerDepositsHeld: '2100',
  vatOutput: '2200',
  rentalRevenue: '4000'
} as const;

export function defaultAccountByCode(code: string): AccountingAccount | undefined {
  return DEFAULT_CHART_OF_ACCOUNTS.find(account => account.code === code);
}
