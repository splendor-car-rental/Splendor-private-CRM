export type AccountingAccountClass = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type AccountingNormalSide = 'debit' | 'credit';
export type CashFlowClass = 'operating' | 'investing' | 'financing';
export type AccountingPostingStatus = 'unposted' | 'posted' | 'reversed' | 'blocked_closed_period';
export type AccountingApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'posted' | 'reversed' | 'cancelled';

export interface AccountingAccount {
  code: string;
  name: string;
  nameAr: string;
  accountClass: AccountingAccountClass;
  normalSide: AccountingNormalSide;
  parentCode?: string;
  description?: string;
  descriptionAr?: string;
  active: boolean;
  system: boolean;
  allowDirectPosting: boolean;
  cashEquivalent?: boolean;
  /** Classification used only for cash-flow reporting when this account is the non-cash counterpart. Configurable; never changes debit/credit semantics. */
  cashFlowClass?: CashFlowClass;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
}

export interface AccountingDimensionSet {
  customerId?: string;
  supplierId?: string;
  vehicleId?: string;
  contractId?: string;
  reservationId?: string;
  invoiceId?: string;
  supplierInvoiceId?: string;
  branchId?: string;
  bankTransactionId?: string;
}

export interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  memo?: string;
  dimensions?: AccountingDimensionSet;
}

export interface JournalEntry {
  id: string;
  date: string;
  periodKey: string;
  currency: 'AED';
  sourceType: string;
  sourceId: string;
  sourceAction: string;
  reference?: string;
  memo: string;
  status: 'posted' | 'reversed';
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  createdAt: string;
  postedAt: string;
  reversedAt?: string;
  reversalJournalId?: string;
  reversalOfJournalId?: string;
  reversalReason?: string;
}

export interface AccountingPeriod {
  id: string; // YYYY-MM
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  closeReason?: string;
  createdAt?: string;
  updatedAt: string;
}

export interface FinanceExpense {
  id: string;
  date: string;
  vendor?: string;
  category: string;
  expenseAccountCode: string;
  amountBeforeVat: number;
  vatAmount: number;
  totalAmount: number;
  paymentMethod: string;
  settlementAccountCode?: string;
  paymentStatus: 'paid' | 'unpaid';
  reference?: string;
  vehicleId?: string;
  contractId?: string;
  supplierId?: string;
  branchId?: string;
  notes?: string;
  attachmentDocumentIds: string[];
  approvalStatus: 'pending_approval' | 'approved' | 'rejected';
  postingStatus: AccountingPostingStatus;
  journalId?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  updatedAt: string;
}

export interface AccountsPayableEntry {
  id: string;
  supplierInvoiceId: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  expenseAccountCode: string;
  amountBeforeVat: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'cancelled';
  journalId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountsPayablePayment {
  id: string;
  payableId: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  settlementAccountCode: string;
  reference?: string;
  journalId: string;
  paidBy: string;
  paidByName: string;
  paidAt: string;
}

export interface FinancialNote {
  id: string;
  type: 'credit_note' | 'debit_note';
  invoiceId: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  reason: string;
  amountBeforeVat: number;
  vatAmount: number;
  totalAmount: number;
  revenueAccountCode: string;
  status: 'posted' | 'reversed';
  journalId: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  reversalJournalId?: string;
  reversedAt?: string;
}

export interface CustomerPaymentAllocation {
  invoiceId: string;
  amount: number;
}

export interface SafeCustomerPaymentInput {
  customerId: string;
  customerName?: string;
  amount: number;
  method: string;
  referenceNumber?: string;
  notes?: string;
  contractId?: string;
  reservationId?: string;
  allocations?: CustomerPaymentAllocation[];
  invoiceId?: string;
  settlementAccountCode?: string;
  proofDocumentId?: string;
}

export interface SafeCustomerPaymentResult {
  paymentId: string;
  receiptNumber: string;
  amount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  allocations: CustomerPaymentAllocation[];
  accountingPostingStatus: AccountingPostingStatus;
  accountingJournalId?: string;
}

export type AgingBucketKey = 'current' | '1_30' | '31_60' | '61_90' | '90_plus';

export interface AgingBucketTotals {
  current: number;
  '1_30': number;
  '31_60': number;
  '61_90': number;
  '90_plus': number;
}

export interface ARAgingRow extends AgingBucketTotals {
  customerId: string;
  customerName: string;
  totalOutstanding: number;
  oldestInvoiceDate?: string;
  dueInvoiceCount: number;
  collectionPriority: 'normal' | 'attention' | 'high' | 'critical';
}

export interface APAgingRow extends AgingBucketTotals {
  supplierId: string;
  supplierName: string;
  totalOutstanding: number;
  oldestInvoiceDate?: string;
  dueInvoiceCount: number;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountNameAr: string;
  accountClass: AccountingAccountClass;
  debit: number;
  credit: number;
  balance: number;
}

export interface ProfitLossReport {
  periodStart: string;
  periodEnd: string;
  revenue: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
  revenueAccounts: TrialBalanceRow[];
  expenseAccounts: TrialBalanceRow[];
}

export interface BalanceSheetReport {
  asOf: string;
  assets: number;
  liabilities: number;
  equity: number;
  currentEarnings: number;
  balanced: boolean;
}

export interface VatSummary {
  periodStart: string;
  periodEnd: string;
  outputVat: number;
  inputVat: number;
  vatPayable: number;
}

export interface CashBookRow {
  journalId: string;
  date: string;
  accountCode: string;
  reference?: string;
  memo: string;
  inflow: number;
  outflow: number;
  runningBalance: number;
}

export interface CashFlowSection {
  inflows: number;
  outflows: number;
  net: number;
}

export interface CashFlowReport {
  periodStart: string;
  periodEnd: string;
  openingCash: number;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  unclassified: CashFlowSection;
  netCashMovement: number;
  closingCash: number;
}

export interface VehicleProfitabilityRow {
  vehicleId: string;
  vehicleName?: string;
  revenue: number;
  maintenanceCost: number;
  insuranceCost: number;
  registrationCost: number;
  financeCost: number;
  cleaningCost: number;
  otherCosts: number;
  totalCost: number;
  grossProfit: number;
  netProfit: number;
  roiPercent: number | null;
  revenuePerDay: number | null;
  costPerDay: number | null;
}

export interface FinanceDashboardSummary {
  generatedAt: string;
  revenueToday: number;
  revenueMonth: number;
  revenueYear: number;
  expensesMonth: number;
  grossProfitMonth: number;
  netProfitMonth: number;
  cashPosition: number;
  arOutstanding: number;
  apOutstanding: number;
  vatPayable: number;
  securityDepositsHeld: number;
  unpostedSourceCount: number;
  closedPeriodCount: number;
}

export interface PostingGap {
  sourceType: string;
  sourceId: string;
  date?: string;
  description: string;
  amount?: number;
  reason: string;
}
