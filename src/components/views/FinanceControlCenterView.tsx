import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Banknote, BarChart3, BookOpen, Building2,
  CalendarClock, Car, CheckCircle2, CircleDollarSign, FileMinus2, FilePlus2,
  Loader2, Plus, Receipt, RefreshCw, Scale, ShieldCheck,
  TrendingDown, TrendingUp, WalletCards
} from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useCRM } from '../../context/CRMContext';
import { Modal } from '../common/Modal';
import { FinanceLedgerView } from './FinanceLedgerView';
import type {
  AccountingAccount, AccountingPeriod, AccountsPayableEntry, ARAgingRow, APAgingRow,
  CashFlowReport, FinanceDashboardSummary, FinanceExpense, FinancialNote, JournalEntry,
  PostingGap, VehicleProfitabilityRow
} from '../../accounting/types';

type TabKey = 'overview' | 'operations' | 'expenses' | 'ar' | 'ap' | 'vat' | 'cashflow' | 'ledger' | 'periods' | 'vehicles' | 'integrity';

type SupplierInvoiceLite = {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  status: string;
};

type ManualJournalRequestLite = {
  id: string;
  date: string;
  reference?: string;
  memo: string;
  lines: Array<{ accountCode: string; debit: number; credit: number; memo?: string }>;
  status: 'pending_approval' | 'approved' | 'rejected';
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedByName?: string;
  decisionReason?: string;
};

type FinanceReports = {
  trialBalance?: Array<{ debit: number; credit: number }>;
  profitLoss?: { revenue: number; expenses: number; netProfit: number };
  balanceSheet?: { assets: number; liabilities: number; equity: number; currentEarnings: number; balanced: boolean };
  vat?: { outputVat: number; inputVat: number; vatPayable: number };
  cashFlow?: CashFlowReport;
};

const money = (value: number | undefined) => `${(Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} د.إ`;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `فشل الطلب (${response.status})`);
  return body as T;
}

const EXPENSE_CATEGORIES = [
  ['maintenance', 'صيانة المركبات'], ['insurance', 'تأمين المركبات'], ['registration', 'ترخيص وتسجيل المركبات'],
  ['vehicle_finance', 'تكلفة تمويل المركبات'], ['salary', 'الرواتب'], ['rent', 'إيجار المكتب'],
  ['fuel', 'الوقود'], ['cleaning', 'الغسيل والتجهيز'], ['marketing', 'التسويق'], ['commission', 'العمولات'],
  ['toll_parking', 'سالك والمواقف على الشركة'], ['supplier_expense', 'تكاليف الموردين'], ['bank_charges', 'رسوم بنكية'],
  ['depreciation', 'الإهلاك'], ['miscellaneous', 'مصروفات متنوعة']
] as const;

const EXPENSE_ACCOUNT_BY_CATEGORY: Record<string, string> = {
  maintenance: '5000', insurance: '5010', registration: '5020', vehicle_finance: '5030', salary: '5100',
  rent: '5110', fuel: '5120', cleaning: '5130', marketing: '5140', commission: '5150', toll_parking: '5160',
  supplier_expense: '5170', bank_charges: '5180', depreciation: '5190', miscellaneous: '5990'
};

const TABS: Array<{ id: TabKey; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'الملخص التنفيذي', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'operations', label: 'الفواتير والتحصيلات', icon: <Receipt className="w-4 h-4" /> },
  { id: 'expenses', label: 'المصروفات', icon: <TrendingDown className="w-4 h-4" /> },
  { id: 'ar', label: 'ذمم العملاء', icon: <CircleDollarSign className="w-4 h-4" /> },
  { id: 'ap', label: 'ذمم الموردين', icon: <Building2 className="w-4 h-4" /> },
  { id: 'vat', label: 'الضريبة', icon: <Scale className="w-4 h-4" /> },
  { id: 'cashflow', label: 'التدفقات النقدية', icon: <WalletCards className="w-4 h-4" /> },
  { id: 'ledger', label: 'دفتر الأستاذ', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'periods', label: 'إقفال الفترات', icon: <CalendarClock className="w-4 h-4" /> },
  { id: 'vehicles', label: 'ربحية المركبات', icon: <Car className="w-4 h-4" /> },
  { id: 'integrity', label: 'سلامة الترحيل', icon: <ShieldCheck className="w-4 h-4" /> }
];

export const FinanceControlCenterView: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const { vehicles, contracts, showToast } = useCRM();
  const isAr = language === 'ar';
  const [tab, setTab] = useState<TabKey>('overview');
  // The "Record Revenue / Customer Payment" button in the header only
  // switches to the Operations tab (a list view) -- from a user's
  // perspective, clicking a button labeled "record a payment" and seeing a
  // table instead of a payment form reads as "nothing happened". This
  // counter increments each time that button is clicked so FinanceLedgerView
  // can open its own payment modal immediately, matching the button's label.
  const [autoOpenPaymentSignal, setAutoOpenPaymentSignal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<FinanceDashboardSummary | null>(null);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [arRows, setArRows] = useState<ARAgingRow[]>([]);
  const [apRows, setApRows] = useState<APAgingRow[]>([]);
  const [payables, setPayables] = useState<AccountsPayableEntry[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoiceLite[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [vehicleRows, setVehicleRows] = useState<VehicleProfitabilityRow[]>([]);
  const [postingGaps, setPostingGaps] = useState<PostingGap[]>([]);
  const [reports, setReports] = useState<FinanceReports | null>(null);
  const [notes, setNotes] = useState<FinancialNote[]>([]);
  const [manualJournalRequests, setManualJournalRequests] = useState<ManualJournalRequestLite[]>([]);
  const [otherIncomeModalOpen, setOtherIncomeModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [supplierPostModalOpen, setSupplierPostModalOpen] = useState(false);
  const [payablePaymentModalOpen, setPayablePaymentModalOpen] = useState(false);
  const [selectedSupplierInvoice, setSelectedSupplierInvoice] = useState<SupplierInvoiceLite | null>(null);
  const [selectedPayable, setSelectedPayable] = useState<AccountsPayableEntry | null>(null);
  const [gapPostModalOpen, setGapPostModalOpen] = useState(false);
  const [selectedGap, setSelectedGap] = useState<PostingGap | null>(null);
  const [gapPostAccountCode, setGapPostAccountCode] = useState('');
  const [noteType, setNoteType] = useState<'credit_note' | 'debit_note'>('credit_note');
  const [workingId, setWorkingId] = useState<string | null>(null);

  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().slice(0, 10), vendor: '', category: 'maintenance', expenseAccountCode: '5000',
    amountBeforeVat: 0, vatAmount: 0, totalAmount: 0, paymentMethod: 'bank_transfer', paymentStatus: 'paid',
    settlementAccountCode: '1100', reference: '', vehicleId: '', contractId: '', supplierId: '', branchId: '', notes: ''
  });
  const [closeForm, setCloseForm] = useState({ period: new Date().toISOString().slice(0, 7), reason: '' });
  const [noteForm, setNoteForm] = useState({ invoiceId: '', issueDate: new Date().toISOString().slice(0, 10), reason: '', amountBeforeVat: 0, vatAmount: 0, revenueAccountCode: '4000' });
  const [supplierPostForm, setSupplierPostForm] = useState({ amountBeforeVat: 0, vatAmount: 0, dueDate: '', expenseAccountCode: '5170' });
  const [payablePaymentForm, setPayablePaymentForm] = useState({ amount: 0, settlementAccountCode: '1100', reference: '', paymentDate: new Date().toISOString().slice(0, 10) });
  const [otherIncomeForm, setOtherIncomeForm] = useState({
    date: new Date().toISOString().slice(0, 10), sourceAccountCode: '3000', settlementAccountCode: '1100',
    amount: 0, reference: '', memo: ''
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    // Each section is fetched independently (Promise.allSettled, not
    // Promise.all): one broken endpoint used to blank out the ENTIRE
    // Finance Control Center with a single generic "failed to load" toast,
    // hiding every other section that loaded fine. Now a failing section
    // just falls back to empty/zero and is named in the toast, while every
    // section that DID load renders normally.
    const sections: Array<{ label: string; run: () => Promise<void> }> = [
      { label: 'لوحة المؤشرات المالية', run: async () => setDashboard(await getJson<FinanceDashboardSummary>('/api/accounting/dashboard')) },
      { label: 'دليل الحسابات', run: async () => setAccounts(await getJson<AccountingAccount[]>('/api/accounting/chart-of-accounts')) },
      { label: 'المصروفات', run: async () => setExpenses(await getJson<FinanceExpense[]>('/api/accounting/expenses')) },
      { label: 'أعمار ذمم العملاء', run: async () => setArRows(await getJson<ARAgingRow[]>('/api/accounting/ar-aging')) },
      { label: 'أعمار ذمم الموردين', run: async () => setApRows(await getJson<APAgingRow[]>('/api/accounting/ap-aging')) },
      { label: 'مستحقات الموردين', run: async () => setPayables(await getJson<AccountsPayableEntry[]>('/api/accounting/payables')) },
      { label: 'دفتر اليومية', run: async () => setJournals(await getJson<JournalEntry[]>('/api/accounting/journals?limit=500')) },
      { label: 'الفترات المحاسبية', run: async () => setPeriods(await getJson<AccountingPeriod[]>('/api/accounting/periods')) },
      { label: 'ربحية المركبات', run: async () => setVehicleRows(await getJson<VehicleProfitabilityRow[]>('/api/accounting/vehicle-profitability')) },
      { label: 'فجوات الترحيل', run: async () => setPostingGaps(await getJson<PostingGap[]>('/api/accounting/posting-gaps')) },
      { label: 'التقارير المالية', run: async () => setReports(await getJson<FinanceReports>('/api/accounting/reports')) },
      { label: 'الإشعارات الدائنة والمدينة', run: async () => setNotes(await getJson<FinancialNote[]>('/api/accounting/financial-notes')) },
      { label: 'فواتير الموردين', run: async () => setSupplierInvoices(await getJson<SupplierInvoiceLite[]>('/api/supplier-invoices')) },
      { label: 'طلبات القيود اليدوية', run: async () => setManualJournalRequests(await getJson<ManualJournalRequestLite[]>('/api/accounting/journals/manual')) }
    ];
    const results = await Promise.allSettled(sections.map(s => s.run()));
    const failed = results
      .map((result, idx) => ({ result, label: sections[idx].label }))
      .filter((entry): entry is { result: PromiseRejectedResult; label: string } => entry.result.status === 'rejected');
    if (failed.length > 0) {
      console.error('[Finance] Sections failed to load:', failed.map(f => `${f.label}: ${f.result.reason?.message || f.result.reason}`));
      showToast(
        'تعذر تحميل بعض أقسام المركز المالي',
        `الأقسام التالية لم تُحمّل: ${failed.map(f => f.label).join('، ')}. باقي الأقسام تم تحميلها بنجاح.`,
        'error'
      );
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const expenseAccounts = useMemo(() => accounts.filter(a => a.active && a.accountClass === 'expense'), [accounts]);
  const settlementAccounts = useMemo(() => accounts.filter(a => a.active && a.accountClass === 'asset' && a.cashEquivalent), [accounts]);
  const revenueAccounts = useMemo(() => accounts.filter(a => a.active && a.accountClass === 'revenue'), [accounts]);
  // Non-AR income sources: financing received, partner capital support, or
  // any other credit that isn't a customer collection -- equity/liability
  // accounts an admin is allowed to post to directly, plus the dedicated
  // "Other Income" revenue account (4900), which is also allowDirectPosting.
  const otherIncomeSourceAccounts = useMemo(
    () => accounts.filter(a => a.active && a.allowDirectPosting && (a.accountClass === 'equity' || a.accountClass === 'liability' || a.accountClass === 'revenue')),
    [accounts]
  );
  const pendingManualJournalRequests = useMemo(() => manualJournalRequests.filter(r => r.status === 'pending_approval'), [manualJournalRequests]);

  const createExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorkingId('new-expense');
    try {
      await getJson('/api/accounting/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...expenseForm, amountBeforeVat: Number(expenseForm.amountBeforeVat), vatAmount: Number(expenseForm.vatAmount), totalAmount: Number(expenseForm.totalAmount), settlementAccountCode: expenseForm.paymentStatus === 'paid' ? expenseForm.settlementAccountCode : undefined })
      });
      setExpenseModalOpen(false);
      showToast('تم تسجيل المصروف', 'تم إنشاء المصروف بحالة قيد الاعتماد ولم يتم ترحيله قبل الاعتماد.', 'success');
      await refresh();
    } catch (error: any) { showToast('تعذر تسجيل المصروف', error.message, 'error'); }
    finally { setWorkingId(null); }
  };

  const decideExpense = async (id: string, decision: 'approve' | 'reject') => {
    const reason = window.prompt(decision === 'approve' ? 'سبب الاعتماد' : 'سبب الرفض');
    if (!reason) return;
    setWorkingId(id);
    try {
      await getJson(`/api/accounting/expenses/${encodeURIComponent(id)}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, reason }) });
      showToast(decision === 'approve' ? 'تم اعتماد المصروف' : 'تم رفض المصروف', 'تم تسجيل القرار في سجل التدقيق.', 'success');
      await refresh();
    } catch (error: any) { showToast('تعذر تنفيذ القرار', error.message, 'error'); }
    finally { setWorkingId(null); }
  };

  const createOtherIncome = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorkingId('other-income');
    try {
      const amount = Number(otherIncomeForm.amount);
      if (!(amount > 0)) throw new Error('المبلغ يجب أن يكون أكبر من صفر.');
      await getJson('/api/accounting/journals/manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: otherIncomeForm.date,
          reference: otherIncomeForm.reference,
          memo: otherIncomeForm.memo,
          lines: [
            { accountCode: otherIncomeForm.settlementAccountCode, debit: amount, credit: 0 },
            { accountCode: otherIncomeForm.sourceAccountCode, debit: 0, credit: amount }
          ]
        })
      });
      setOtherIncomeModalOpen(false);
      setOtherIncomeForm({ date: new Date().toISOString().slice(0, 10), sourceAccountCode: '3000', settlementAccountCode: '1100', amount: 0, reference: '', memo: '' });
      showToast('تم إنشاء طلب القيد', 'القيد الآن قيد الاعتماد من شخص آخر مخوّل ولن يُرحّل قبل ذلك.', 'success');
      await refresh();
    } catch (error: any) { showToast('تعذر إنشاء طلب القيد', error.message, 'error'); }
    finally { setWorkingId(null); }
  };

  const decideManualJournalRequest = async (id: string, decision: 'approve' | 'reject') => {
    const reason = window.prompt(decision === 'approve' ? 'سبب الاعتماد' : 'سبب الرفض');
    if (!reason) return;
    setWorkingId(id);
    try {
      await getJson(`/api/accounting/journals/manual/${encodeURIComponent(id)}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, reason })
      });
      showToast(decision === 'approve' ? 'تم اعتماد القيد وترحيله' : 'تم رفض القيد', 'تم تسجيل القرار في سجل التدقيق.', 'success');
      await refresh();
    } catch (error: any) { showToast('تعذر تنفيذ القرار', error.message, 'error'); }
    finally { setWorkingId(null); }
  };

  const closePeriod = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorkingId('period-close');
    try {
      await getJson(`/api/accounting/periods/${encodeURIComponent(closeForm.period)}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: closeForm.reason }) });
      setPeriodModalOpen(false);
      showToast('تم إقفال الفترة', `تم إقفال الفترة ${closeForm.period}. أي تعديل لاحق يتطلب قيد عكسي أو تسوية في فترة مفتوحة.`, 'success');
      await refresh();
    } catch (error: any) { showToast('تعذر إقفال الفترة', error.message, 'error'); }
    finally { setWorkingId(null); }
  };

  const createNote = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorkingId('financial-note');
    try {
      const endpoint = noteType === 'credit_note' ? 'credit-notes' : 'debit-notes';
      await getJson(`/api/accounting/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(noteForm) });
      setNoteModalOpen(false);
      showToast(noteType === 'credit_note' ? 'تم إصدار الإشعار الدائن' : 'تم إصدار الإشعار المدين', 'الفاتورة الأصلية لم يتم تعديلها، وتم إنشاء قيد محاسبي مستقل.', 'success');
      await refresh();
    } catch (error: any) { showToast('تعذر إصدار الإشعار', error.message, 'error'); }
    finally { setWorkingId(null); }
  };

  const openSupplierPost = (invoice: SupplierInvoiceLite) => {
    setSelectedSupplierInvoice(invoice);
    setSupplierPostForm({ amountBeforeVat: Number(invoice.amount || 0), vatAmount: 0, dueDate: '', expenseAccountCode: '5170' });
    setSupplierPostModalOpen(true);
  };

  const postSupplierInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSupplierInvoice) return;
    setWorkingId(`post-${selectedSupplierInvoice.id}`);
    try {
      await getJson(`/api/accounting/supplier-invoices/${encodeURIComponent(selectedSupplierInvoice.id)}/post`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(supplierPostForm)
      });
      setSupplierPostModalOpen(false);
      showToast('تم ترحيل فاتورة المورد', 'تم إنشاء الذمة الدائنة والقيد المحاسبي في عملية ذرية واحدة.', 'success');
      await refresh();
    } catch (error: any) { showToast('تعذر ترحيل فاتورة المورد', error.message, 'error'); }
    finally { setWorkingId(null); }
  };

  const openPayablePayment = (payable: AccountsPayableEntry) => {
    setSelectedPayable(payable);
    setPayablePaymentForm({ amount: payable.balance, settlementAccountCode: '1100', reference: '', paymentDate: new Date().toISOString().slice(0, 10) });
    setPayablePaymentModalOpen(true);
  };

  const payPayable = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPayable) return;
    setWorkingId(`pay-${selectedPayable.id}`);
    try {
      await getJson(`/api/accounting/payables/${encodeURIComponent(selectedPayable.id)}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payablePaymentForm)
      });
      setPayablePaymentModalOpen(false);
      showToast('تم تسجيل سداد المورد', 'تم تحديث رصيد المورد وإنشاء قيد السداد في معاملة محاسبية ذرية.', 'success');
      await refresh();
    } catch (error: any) { showToast('تعذر تسجيل سداد المورد', error.message, 'error'); }
    finally { setWorkingId(null); }
  };

  const closeAllowed = currentUser.role === 'ceo' || currentUser.role === 'admin';

  // Posting a gap from the Integrity tab reuses the same accounting.ts
  // functions the AP/notes flows already call (postInvoiceToAccounting /
  // postPaymentToAccounting / the deposit lifecycle's 'post' action) -- this
  // is the missing link that lets staff actually turn "recorded operationally"
  // (a customer payment, invoice or deposit) into a posted ledger entry that
  // feeds the P&L, VAT and tax-filing reports, instead of that step being
  // invisible and undiscoverable.
  const openGapPost = (gap: PostingGap) => {
    setSelectedGap(gap);
    setGapPostAccountCode(gap.sourceType === 'Invoice' ? (revenueAccounts[0]?.code || '4000') : (settlementAccounts[0]?.code || '1100'));
    setGapPostModalOpen(true);
  };

  const postGap = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedGap) return;
    setWorkingId(`gap-${selectedGap.sourceType}-${selectedGap.sourceId}`);
    try {
      const endpoint = selectedGap.sourceType === 'Invoice' ? `/api/accounting/invoices/${encodeURIComponent(selectedGap.sourceId)}/post`
        : selectedGap.sourceType === 'Payment' ? `/api/accounting/payments/${encodeURIComponent(selectedGap.sourceId)}/post`
        : `/api/accounting/deposits/${encodeURIComponent(selectedGap.sourceId)}/post`;
      const body = selectedGap.sourceType === 'Invoice' ? { revenueAccountCode: gapPostAccountCode } : { settlementAccountCode: gapPostAccountCode };
      await getJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setGapPostModalOpen(false);
      showToast('تم الترحيل إلى دفتر الأستاذ', `${selectedGap.sourceType} ${selectedGap.sourceId} أصبح له الآن قيد محاسبي مرحّل.`, 'success');
      await refresh();
    } catch (error: any) { showToast('تعذر الترحيل', error.message, 'error'); }
    finally { setWorkingId(null); }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-12" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold mb-1"><Activity className="w-4 h-4" /><span>مركز الرقابة المالية والمحاسبية</span></div>
          <h2 className="text-2xl lg:text-3xl font-display font-bold text-zinc-100">المالية والمحاسبة التنفيذية</h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-3xl">دفتر أستاذ مزدوج القيد، المصروفات، ذمم العملاء والموردين، الضريبة، التدفقات النقدية، إقفال الفترات وربحية المركبات مع سجل تدقيق وترحيل محكوم.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setTab('operations'); setAutoOpenPaymentSignal(s => s + 1); }} className="px-4 py-2.5 rounded-xl bg-emerald-500 text-zinc-950 font-bold text-xs flex items-center gap-2 hover:bg-emerald-400 transition-colors"><CircleDollarSign className="w-4 h-4" />تسجيل دفعة عميل</button>
          <button onClick={() => setOtherIncomeModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-teal-500 text-zinc-950 font-bold text-xs flex items-center gap-2 hover:bg-teal-400 transition-colors"><Banknote className="w-4 h-4" />إيراد آخر (تمويل / دعم شريك)</button>
          <button onClick={() => setExpenseModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-blue-500 text-zinc-950 font-bold text-xs flex items-center gap-2 hover:bg-blue-400 transition-colors"><Plus className="w-4 h-4" />تسجيل مصروف</button>
          <button onClick={() => { setNoteType('credit_note'); setNoteModalOpen(true); }} className="px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs flex items-center gap-2"><FileMinus2 className="w-4 h-4" />إشعار دائن</button>
          <button onClick={() => { setNoteType('debit_note'); setNoteModalOpen(true); }} className="px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs flex items-center gap-2"><FilePlus2 className="w-4 h-4" />إشعار مدين</button>
          <button onClick={() => void refresh()} disabled={loading} className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300" title="تحديث البيانات"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {pendingManualJournalRequests.length > 0 && (
        <div className="rounded-2xl bg-teal-500/10 border border-teal-500/30 p-4">
          <h3 className="text-sm font-bold text-teal-300 mb-2">طلبات قيود يدوية بانتظار الاعتماد ({pendingManualJournalRequests.length})</h3>
          <div className="space-y-2">
            {pendingManualJournalRequests.map(r => (
              <div key={r.id} className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-center justify-between gap-3 flex-wrap text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-100">{r.id} — {r.memo}</p>
                  <p className="text-zinc-500 mt-0.5">{r.requestedByName} · {r.date} · {money(r.lines?.[0]?.debit || r.lines?.[0]?.credit)}</p>
                </div>
                {r.requestedBy !== currentUser.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button disabled={workingId === r.id} onClick={() => decideManualJournalRequest(r.id, 'approve')} className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300">اعتماد</button>
                    <button disabled={workingId === r.id} onClick={() => decideManualJournalRequest(r.id, 'reject')} className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300">رفض</button>
                  </div>
                ) : (
                  <span className="text-[10px] text-zinc-500 shrink-0">بانتظار شخص آخر مخوّل</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && !dashboard ? <div className="min-h-[320px] flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-400" /></div> : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <Kpi title="إيراد الشهر" value={money(dashboard?.revenueMonth)} icon={<TrendingUp className="w-4 h-4" />} />
          <Kpi title="مصروفات الشهر" value={money(dashboard?.expensesMonth)} icon={<TrendingDown className="w-4 h-4" />} />
          <Kpi title="صافي ربح الشهر" value={money(dashboard?.netProfitMonth)} icon={<BarChart3 className="w-4 h-4" />} />
          <Kpi title="السيولة الدفترية" value={money(dashboard?.cashPosition)} icon={<Banknote className="w-4 h-4" />} />
          <Kpi title="مستحقات العملاء" value={money(dashboard?.arOutstanding)} icon={<CircleDollarSign className="w-4 h-4" />} />
          <Kpi title="مستحقات الموردين" value={money(dashboard?.apOutstanding)} icon={<Building2 className="w-4 h-4" />} />
        </div>

        <div className="overflow-x-auto pb-1"><div className="flex gap-2 min-w-max border-b border-zinc-800 pb-2">{TABS.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${tab === item.id ? 'bg-blue-500/15 border border-blue-500/40 text-blue-300' : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>{item.icon}{item.label}</button>)}</div></div>

        {tab === 'overview' && <Overview dashboard={dashboard} reports={reports} postingGaps={postingGaps} notes={notes} />}
        {tab === 'operations' && <FinanceLedgerView autoOpenPaymentSignal={autoOpenPaymentSignal} />}
        {tab === 'expenses' && <ExpensesTable expenses={expenses} currentUserId={currentUser.id} workingId={workingId} onDecision={decideExpense} />}
        {tab === 'ar' && <ARAgingTable rows={arRows} />}
        {tab === 'ap' && <APView rows={apRows} payables={payables} supplierInvoices={supplierInvoices} workingId={workingId} onPost={openSupplierPost} onPay={openPayablePayment} />}
        {tab === 'vat' && <VatView reports={reports} />}
        {tab === 'cashflow' && <CashFlowView cashFlow={reports?.cashFlow} />}
        {tab === 'ledger' && <LedgerView journals={journals} accounts={accounts} reports={reports} />}
        {tab === 'periods' && <PeriodsView periods={periods} closeAllowed={closeAllowed} onClose={() => setPeriodModalOpen(true)} />}
        {tab === 'vehicles' && <VehicleProfitabilityTable rows={vehicleRows} />}
        {tab === 'integrity' && <PostingGapsTable gaps={postingGaps} workingId={workingId} onPost={openGapPost} />}
      </>}

      <Modal isOpen={expenseModalOpen} onClose={() => setExpenseModalOpen(false)} title="تسجيل مصروف جديد" subtitle="يُسجل أولًا كقيد معلق ولا يُرحّل قبل اعتماد شخص آخر" maxWidth="4xl">
        <form onSubmit={createExpense} className="space-y-4 text-xs"><div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="التاريخ"><input type="date" required value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} className="field" /></Field>
          <Field label="الجهة / المورد"><input value={expenseForm.vendor} onChange={e => setExpenseForm({ ...expenseForm, vendor: e.target.value })} className="field" /></Field>
          <Field label="الفئة"><select value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value, expenseAccountCode: EXPENSE_ACCOUNT_BY_CATEGORY[e.target.value] || '5990' })} className="field">{EXPENSE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="حساب المصروف"><select required value={expenseForm.expenseAccountCode} onChange={e => setExpenseForm({ ...expenseForm, expenseAccountCode: e.target.value })} className="field">{expenseAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nameAr}</option>)}</select></Field>
          <Field label="المبلغ قبل الضريبة"><input type="number" min="0" step="0.01" required value={expenseForm.amountBeforeVat} onChange={e => { const net = Number(e.target.value); setExpenseForm({ ...expenseForm, amountBeforeVat: net, totalAmount: Number((net + Number(expenseForm.vatAmount)).toFixed(2)) }); }} className="field" /></Field>
          <Field label="ضريبة المدخلات"><input type="number" min="0" step="0.01" required value={expenseForm.vatAmount} onChange={e => { const vat = Number(e.target.value); setExpenseForm({ ...expenseForm, vatAmount: vat, totalAmount: Number((Number(expenseForm.amountBeforeVat) + vat).toFixed(2)) }); }} className="field" /></Field>
          <Field label="الإجمالي"><input type="number" readOnly value={expenseForm.totalAmount} className="field opacity-70" /></Field>
          <Field label="حالة السداد"><select value={expenseForm.paymentStatus} onChange={e => setExpenseForm({ ...expenseForm, paymentStatus: e.target.value })} className="field"><option value="paid">مسدد</option><option value="unpaid">غير مسدد / مستحق</option></select></Field>
          {expenseForm.paymentStatus === 'paid' && <Field label="حساب السداد"><select value={expenseForm.settlementAccountCode} onChange={e => setExpenseForm({ ...expenseForm, settlementAccountCode: e.target.value })} className="field">{settlementAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nameAr}</option>)}</select></Field>}
          <Field label="المرجع"><input value={expenseForm.reference} onChange={e => setExpenseForm({ ...expenseForm, reference: e.target.value })} className="field" /></Field>
          <Field label="المركبة (اختياري)"><select value={expenseForm.vehicleId} onChange={e => setExpenseForm({ ...expenseForm, vehicleId: e.target.value })} className="field"><option value="">بدون ربط</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} — {v.plateNumber}</option>)}</select></Field>
          <Field label="العقد (اختياري)"><select value={expenseForm.contractId} onChange={e => setExpenseForm({ ...expenseForm, contractId: e.target.value })} className="field"><option value="">بدون ربط</option>{contracts.map(c => <option key={c.id} value={c.id}>{c.contractNumber} — {c.customerName}</option>)}</select></Field>
        </div><Field label="ملاحظات"><textarea rows={3} value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} className="field" /></Field><div className="flex justify-end gap-2 pt-3 border-t border-zinc-800"><button type="button" onClick={() => setExpenseModalOpen(false)} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">إلغاء</button><button disabled={workingId === 'new-expense'} className="px-5 py-2 rounded-xl bg-blue-500 text-zinc-950 font-bold flex items-center gap-2">{workingId === 'new-expense' && <Loader2 className="w-4 h-4 animate-spin" />}حفظ وإرسال للاعتماد</button></div></form>
      </Modal>

      <Modal isOpen={supplierPostModalOpen} onClose={() => setSupplierPostModalOpen(false)} title="ترحيل فاتورة مورد إلى الذمم الدائنة" subtitle="أدخل صافي الفاتورة والضريبة وتاريخ الاستحقاق صراحةً؛ النظام لا يفترض الضريبة أو الاستحقاق" maxWidth="lg">
        <form onSubmit={postSupplierInvoice} className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-zinc-300">{selectedSupplierInvoice?.supplierName} — {selectedSupplierInvoice?.invoiceNumber} — الإجمالي {money(selectedSupplierInvoice?.amount)}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="المبلغ قبل الضريبة"><input type="number" min="0" step="0.01" required value={supplierPostForm.amountBeforeVat} onChange={e => setSupplierPostForm({ ...supplierPostForm, amountBeforeVat: Number(e.target.value) })} className="field" /></Field>
            <Field label="ضريبة المدخلات"><input type="number" min="0" step="0.01" required value={supplierPostForm.vatAmount} onChange={e => setSupplierPostForm({ ...supplierPostForm, vatAmount: Number(e.target.value) })} className="field" /></Field>
            <Field label="تاريخ الاستحقاق"><input type="date" required value={supplierPostForm.dueDate} onChange={e => setSupplierPostForm({ ...supplierPostForm, dueDate: e.target.value })} className="field" /></Field>
            <Field label="حساب المصروف"><select required value={supplierPostForm.expenseAccountCode} onChange={e => setSupplierPostForm({ ...supplierPostForm, expenseAccountCode: e.target.value })} className="field">{expenseAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nameAr}</option>)}</select></Field>
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setSupplierPostModalOpen(false)} className="px-4 py-2 rounded-xl border border-zinc-800">إلغاء</button><button disabled={Boolean(selectedSupplierInvoice && workingId === `post-${selectedSupplierInvoice.id}`)} className="px-5 py-2 rounded-xl bg-blue-500 text-zinc-950 font-bold">ترحيل الفاتورة</button></div>
        </form>
      </Modal>

      <Modal isOpen={payablePaymentModalOpen} onClose={() => setPayablePaymentModalOpen(false)} title="سداد مستحق لمورد" subtitle="السداد يحدّث رصيد المورد ويُنشئ قيد مدين للمورد ودائن لحساب السداد في معاملة واحدة" maxWidth="lg">
        <form onSubmit={payPayable} className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-zinc-300">{selectedPayable?.supplierName} — {selectedPayable?.invoiceNumber} — المتبقي {money(selectedPayable?.balance)}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="مبلغ السداد"><input type="number" min="0.01" max={selectedPayable?.balance} step="0.01" required value={payablePaymentForm.amount} onChange={e => setPayablePaymentForm({ ...payablePaymentForm, amount: Number(e.target.value) })} className="field" /></Field>
            <Field label="حساب السداد"><select required value={payablePaymentForm.settlementAccountCode} onChange={e => setPayablePaymentForm({ ...payablePaymentForm, settlementAccountCode: e.target.value })} className="field">{settlementAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nameAr}</option>)}</select></Field>
            <Field label="تاريخ السداد"><input type="date" required value={payablePaymentForm.paymentDate} onChange={e => setPayablePaymentForm({ ...payablePaymentForm, paymentDate: e.target.value })} className="field" /></Field>
            <Field label="مرجع السداد"><input value={payablePaymentForm.reference} onChange={e => setPayablePaymentForm({ ...payablePaymentForm, reference: e.target.value })} className="field" /></Field>
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setPayablePaymentModalOpen(false)} className="px-4 py-2 rounded-xl border border-zinc-800">إلغاء</button><button disabled={Boolean(selectedPayable && workingId === `pay-${selectedPayable.id}`)} className="px-5 py-2 rounded-xl bg-blue-500 text-zinc-950 font-bold">تسجيل السداد</button></div>
        </form>
      </Modal>

      <Modal isOpen={periodModalOpen} onClose={() => setPeriodModalOpen(false)} title="إقفال فترة محاسبية" subtitle="الإقفال يمنع الترحيل داخل الفترة، ولا توجد إعادة فتح مباشرة" maxWidth="md">
        <form onSubmit={closePeriod} className="space-y-4 text-xs"><Field label="الفترة"><input type="month" required value={closeForm.period} onChange={e => setCloseForm({ ...closeForm, period: e.target.value })} className="field" /></Field><Field label="سبب الإقفال"><textarea required rows={3} value={closeForm.reason} onChange={e => setCloseForm({ ...closeForm, reason: e.target.value })} className="field" /></Field><div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">بعد الإقفال، التصحيح يتم بقيد عكسي أو قيد تسوية في فترة مفتوحة. لا يتم حذف أو تعديل القيود المرحلة.</div><div className="flex justify-end gap-2"><button type="button" onClick={() => setPeriodModalOpen(false)} className="px-4 py-2 rounded-xl border border-zinc-800">إلغاء</button><button className="px-5 py-2 rounded-xl bg-rose-500 text-white font-bold">تأكيد الإقفال</button></div></form>
      </Modal>

      <Modal isOpen={gapPostModalOpen} onClose={() => setGapPostModalOpen(false)} title="ترحيل عملية إلى دفتر الأستاذ" subtitle="اختر الحساب المناسب ثم أكّد -- سيُنشأ قيد محاسبي واحد ذرّي لهذه العملية فقط" maxWidth="md">
        <form onSubmit={postGap} className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-zinc-300">{selectedGap?.sourceType} — {selectedGap?.sourceId} — {selectedGap?.description} — {money(selectedGap?.amount ?? undefined)}</div>
          <Field label={selectedGap?.sourceType === 'Invoice' ? 'حساب الإيراد' : 'حساب الخزينة / البنك'}>
            <select required value={gapPostAccountCode} onChange={e => setGapPostAccountCode(e.target.value)} className="field">
              {(selectedGap?.sourceType === 'Invoice' ? revenueAccounts : settlementAccounts).map(a => <option key={a.code} value={a.code}>{a.code} — {a.nameAr}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <button type="button" onClick={() => setGapPostModalOpen(false)} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">إلغاء</button>
            <button disabled={Boolean(selectedGap && workingId === `gap-${selectedGap.sourceType}-${selectedGap.sourceId}`)} className="px-5 py-2 rounded-xl bg-blue-500 text-zinc-950 font-bold flex items-center gap-2">{selectedGap && workingId === `gap-${selectedGap.sourceType}-${selectedGap.sourceId}` && <Loader2 className="w-4 h-4 animate-spin" />}ترحيل الآن</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={noteModalOpen} onClose={() => setNoteModalOpen(false)} title={noteType === 'credit_note' ? 'إصدار إشعار دائن' : 'إصدار إشعار مدين'} subtitle="يتم إنشاء مستند وقيد مستقل دون تعديل الفاتورة الأصلية" maxWidth="lg">
        <form onSubmit={createNote} className="space-y-4 text-xs"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="رقم الفاتورة"><input required value={noteForm.invoiceId} onChange={e => setNoteForm({ ...noteForm, invoiceId: e.target.value })} className="field" /></Field><Field label="تاريخ الإصدار"><input type="date" required value={noteForm.issueDate} onChange={e => setNoteForm({ ...noteForm, issueDate: e.target.value })} className="field" /></Field><Field label="المبلغ قبل الضريبة"><input type="number" min="0.01" step="0.01" required value={noteForm.amountBeforeVat} onChange={e => setNoteForm({ ...noteForm, amountBeforeVat: Number(e.target.value) })} className="field" /></Field><Field label="الضريبة"><input type="number" min="0" step="0.01" required value={noteForm.vatAmount} onChange={e => setNoteForm({ ...noteForm, vatAmount: Number(e.target.value) })} className="field" /></Field><Field label="حساب الإيراد"><select value={noteForm.revenueAccountCode} onChange={e => setNoteForm({ ...noteForm, revenueAccountCode: e.target.value })} className="field">{revenueAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nameAr}</option>)}</select></Field></div><Field label="السبب"><textarea required rows={3} value={noteForm.reason} onChange={e => setNoteForm({ ...noteForm, reason: e.target.value })} className="field" /></Field><div className="flex justify-end gap-2"><button type="button" onClick={() => setNoteModalOpen(false)} className="px-4 py-2 rounded-xl border border-zinc-800">إلغاء</button><button disabled={workingId === 'financial-note'} className="px-5 py-2 rounded-xl bg-blue-500 text-zinc-950 font-bold flex items-center gap-2">{workingId === 'financial-note' && <Loader2 className="w-4 h-4 animate-spin" />}إصدار وترحيل</button></div></form>
      </Modal>

      <Modal isOpen={otherIncomeModalOpen} onClose={() => setOtherIncomeModalOpen(false)} title="تسجيل إيراد آخر (غير مرتبط بعميل)" subtitle="تمويل مستلم، دعم شريك، أو أي إيراد آخر -- يُنشأ كقيد معلّق ولا يُرحّل قبل اعتماد شخص آخر مخوّل" maxWidth="lg">
        <form onSubmit={createOtherIncome} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="التاريخ"><input type="date" required value={otherIncomeForm.date} onChange={e => setOtherIncomeForm({ ...otherIncomeForm, date: e.target.value })} className="field" /></Field>
            <Field label="المبلغ"><input type="number" min="0.01" step="0.01" required value={otherIncomeForm.amount} onChange={e => setOtherIncomeForm({ ...otherIncomeForm, amount: Number(e.target.value) })} className="field" /></Field>
            <Field label="مصدر الإيراد"><select required value={otherIncomeForm.sourceAccountCode} onChange={e => setOtherIncomeForm({ ...otherIncomeForm, sourceAccountCode: e.target.value })} className="field">{otherIncomeSourceAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nameAr}</option>)}</select></Field>
            <Field label="حساب الاستلام (نقدية / بنك)"><select required value={otherIncomeForm.settlementAccountCode} onChange={e => setOtherIncomeForm({ ...otherIncomeForm, settlementAccountCode: e.target.value })} className="field">{settlementAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nameAr}</option>)}</select></Field>
            <Field label="المرجع"><input value={otherIncomeForm.reference} onChange={e => setOtherIncomeForm({ ...otherIncomeForm, reference: e.target.value })} className="field" /></Field>
          </div>
          <Field label="الوصف / السبب"><textarea required rows={3} value={otherIncomeForm.memo} onChange={e => setOtherIncomeForm({ ...otherIncomeForm, memo: e.target.value })} placeholder="مثال: دفعة تمويل من شريك، قرض بنكي مستلم، إلخ." className="field" /></Field>
          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <button type="button" onClick={() => setOtherIncomeModalOpen(false)} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">إلغاء</button>
            <button disabled={workingId === 'other-income'} className="px-5 py-2 rounded-xl bg-teal-500 text-zinc-950 font-bold flex items-center gap-2">{workingId === 'other-income' && <Loader2 className="w-4 h-4 animate-spin" />}حفظ وإرسال للاعتماد</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const Kpi: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 min-w-0"><div className="flex items-center justify-between gap-2"><p className="text-[10px] text-zinc-500 font-semibold">{title}</p><span className="text-blue-400">{icon}</span></div><p className="text-lg font-bold text-zinc-100 mt-2 truncate">{value}</p></div>;
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block"><span className="block text-zinc-400 font-medium mb-1">{label}</span>{children}</label>;
const Overview: React.FC<{ dashboard: FinanceDashboardSummary | null; reports: FinanceReports | null; postingGaps: PostingGap[]; notes: FinancialNote[] }> = ({ dashboard, reports, postingGaps, notes }) => <div className="grid grid-cols-1 xl:grid-cols-3 gap-4"><div className="xl:col-span-2 p-5 rounded-3xl bg-zinc-900/70 border border-zinc-800"><h3 className="font-bold text-zinc-100 flex items-center gap-2"><Scale className="w-4 h-4 text-blue-400" />موقف الميزانية</h3><div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4"><Mini label="الأصول" value={money(reports?.balanceSheet?.assets)} /><Mini label="الالتزامات" value={money(reports?.balanceSheet?.liabilities)} /><Mini label="حقوق الملكية" value={money(reports?.balanceSheet?.equity)} /><Mini label="أرباح الفترة الحالية" value={money(reports?.balanceSheet?.currentEarnings)} /></div><div className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${reports?.balanceSheet?.balanced ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>{reports?.balanceSheet?.balanced ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{reports?.balanceSheet?.balanced ? 'المعادلة المحاسبية متوازنة وفق القيود المرحلة.' : 'يوجد فرق لأن بعض العمليات التاريخية غير مرحلة بعد. راجع سلامة الترحيل.'}</div></div><div className="p-5 rounded-3xl bg-zinc-900/70 border border-zinc-800"><h3 className="font-bold text-zinc-100">رقابة سريعة</h3><div className="space-y-3 mt-4"><Mini label="ضريبة مستحقة للشهر" value={money(dashboard?.vatPayable)} /><Mini label="تأمينات عملاء محتجزة" value={money(dashboard?.securityDepositsHeld)} /><Mini label="مصادر غير مرحلة" value={String(postingGaps.length)} /><Mini label="إشعارات دائنة/مدينة" value={String(notes.length)} /></div></div></div>;
const Mini: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800"><p className="text-[10px] text-zinc-500">{label}</p><p className="text-sm font-bold text-zinc-100 mt-1">{value}</p></div>;
const ExpensesTable: React.FC<{ expenses: FinanceExpense[]; currentUserId: string; workingId: string | null; onDecision: (id: string, decision: 'approve' | 'reject') => void }> = ({ expenses, currentUserId, workingId, onDecision }) => <TableShell title="سجل المصروفات"><table className="w-full text-xs min-w-[980px]"><thead><tr className="text-zinc-500 border-b border-zinc-800"><Th>الرقم</Th><Th>التاريخ</Th><Th>الجهة</Th><Th>الفئة</Th><Th>الإجمالي</Th><Th>الاعتماد</Th><Th>الترحيل</Th><Th>الإجراء</Th></tr></thead><tbody>{expenses.map(e => <tr key={e.id} className="border-b border-zinc-800/50 text-zinc-300"><Td mono>{e.id}</Td><Td>{e.date}</Td><Td>{e.vendor || '—'}</Td><Td>{e.category}</Td><Td>{money(e.totalAmount)}</Td><Td>{e.approvalStatus === 'approved' ? 'معتمد' : e.approvalStatus === 'rejected' ? 'مرفوض' : 'قيد الاعتماد'}</Td><Td>{e.postingStatus === 'posted' ? 'مرحّل' : 'غير مرحّل'}</Td><Td>{e.approvalStatus === 'pending_approval' && e.createdBy !== currentUserId ? <div className="flex gap-1"><button disabled={workingId === e.id} onClick={() => onDecision(e.id, 'approve')} className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300">اعتماد</button><button disabled={workingId === e.id} onClick={() => onDecision(e.id, 'reject')} className="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-300">رفض</button></div> : <span className="text-zinc-600">—</span>}</Td></tr>)}</tbody></table></TableShell>;
const ARAgingTable: React.FC<{ rows: ARAgingRow[] }> = ({ rows }) => <TableShell title="أعمار ديون العملاء"><table className="w-full text-xs min-w-[900px]"><thead><tr className="text-zinc-500 border-b border-zinc-800"><Th>العميل</Th><Th>الإجمالي</Th><Th>حالي</Th><Th>1–30</Th><Th>31–60</Th><Th>61–90</Th><Th>+90</Th><Th>أولوية التحصيل</Th></tr></thead><tbody>{rows.map(r => <tr key={r.customerId} className="border-b border-zinc-800/50"><Td>{r.customerName}</Td><Td>{money(r.totalOutstanding)}</Td><Td>{money(r.current)}</Td><Td>{money(r['1_30'])}</Td><Td>{money(r['31_60'])}</Td><Td>{money(r['61_90'])}</Td><Td>{money(r['90_plus'])}</Td><Td>{r.collectionPriority === 'critical' ? 'حرجة' : r.collectionPriority === 'high' ? 'عالية' : r.collectionPriority === 'attention' ? 'تحتاج متابعة' : 'طبيعية'}</Td></tr>)}</tbody></table></TableShell>;
const APView: React.FC<{ rows: APAgingRow[]; payables: AccountsPayableEntry[]; supplierInvoices: SupplierInvoiceLite[]; workingId: string | null; onPost: (invoice: SupplierInvoiceLite) => void; onPay: (payable: AccountsPayableEntry) => void }> = ({ rows, payables, supplierInvoices, workingId, onPost, onPay }) => {
  const postedSupplierInvoiceIds = new Set(payables.map(p => p.supplierInvoiceId));
  const readyToPost = supplierInvoices.filter(invoice => invoice.status === 'approved' && !postedSupplierInvoiceIds.has(invoice.id));
  return <div className="space-y-4">
    {readyToPost.length > 0 && <TableShell title="فواتير موردين معتمدة بانتظار الترحيل المحاسبي"><table className="w-full text-xs min-w-[760px]"><thead><tr className="text-zinc-500 border-b border-zinc-800"><Th>الفاتورة</Th><Th>المورد</Th><Th>التاريخ</Th><Th>الإجمالي</Th><Th>الإجراء</Th></tr></thead><tbody>{readyToPost.map(invoice => <tr key={invoice.id} className="border-b border-zinc-800/50"><Td mono>{invoice.invoiceNumber}</Td><Td>{invoice.supplierName}</Td><Td>{invoice.invoiceDate}</Td><Td>{money(invoice.amount)}</Td><Td><button disabled={workingId === `post-${invoice.id}`} onClick={() => onPost(invoice)} className="px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 font-bold">ترحيل للذمم</button></Td></tr>)}</tbody></table></TableShell>}
    <TableShell title="أعمار مستحقات الموردين"><table className="w-full text-xs min-w-[760px]"><thead><tr className="text-zinc-500 border-b border-zinc-800"><Th>المورد</Th><Th>الإجمالي</Th><Th>حالي</Th><Th>1–30</Th><Th>31–60</Th><Th>61–90</Th><Th>+90</Th></tr></thead><tbody>{rows.map(r => <tr key={r.supplierId} className="border-b border-zinc-800/50"><Td>{r.supplierName}</Td><Td>{money(r.totalOutstanding)}</Td><Td>{money(r.current)}</Td><Td>{money(r['1_30'])}</Td><Td>{money(r['31_60'])}</Td><Td>{money(r['61_90'])}</Td><Td>{money(r['90_plus'])}</Td></tr>)}</tbody></table></TableShell>
    <TableShell title="فواتير الموردين المرحلة"><table className="w-full text-xs min-w-[880px]"><thead><tr className="text-zinc-500 border-b border-zinc-800"><Th>الفاتورة</Th><Th>المورد</Th><Th>الاستحقاق</Th><Th>الإجمالي</Th><Th>المسدد</Th><Th>المتبقي</Th><Th>الحالة</Th><Th>الإجراء</Th></tr></thead><tbody>{payables.map(p => <tr key={p.id} className="border-b border-zinc-800/50"><Td mono>{p.invoiceNumber}</Td><Td>{p.supplierName}</Td><Td>{p.dueDate}</Td><Td>{money(p.totalAmount)}</Td><Td>{money(p.paidAmount)}</Td><Td>{money(p.balance)}</Td><Td>{p.status === 'paid' ? 'مسدد' : p.status === 'partially_paid' ? 'مسدد جزئيًا' : 'مستحق'}</Td><Td>{p.balance > 0 && p.status !== 'cancelled' ? <button disabled={workingId === `pay-${p.id}`} onClick={() => onPay(p)} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">تسجيل سداد</button> : '—'}</Td></tr>)}</tbody></table></TableShell>
  </div>;
};
const VatView: React.FC<{ reports: FinanceReports | null }> = ({ reports }) => <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><Kpi title="ضريبة المخرجات" value={money(reports?.vat?.outputVat)} icon={<TrendingUp className="w-4 h-4" />} /><Kpi title="ضريبة المدخلات" value={money(reports?.vat?.inputVat)} icon={<TrendingDown className="w-4 h-4" />} /><Kpi title="صافي الضريبة المستحقة" value={money(reports?.vat?.vatPayable)} icon={<Scale className="w-4 h-4" />} /><div className="md:col-span-3 p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 text-xs text-zinc-400">التقرير يعرض فقط الضريبة الناتجة عن القيود المحاسبية المرحلة. لا يتم افتراض ضريبة الموردين تلقائيًا؛ يتم إدخال صافي وضريبة فاتورة المورد قبل ترحيلها.</div></div>;
const CashFlowView: React.FC<{ cashFlow?: CashFlowReport }> = ({ cashFlow }) => !cashFlow ? <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 text-zinc-400 text-sm">لا توجد بيانات تدفقات نقدية متاحة للفترة الحالية.</div> : <div className="space-y-4"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Kpi title="رصيد النقد أول الفترة" value={money(cashFlow.openingCash)} icon={<WalletCards className="w-4 h-4" />} /><Kpi title="صافي النشاط التشغيلي" value={money(cashFlow.operating.net)} icon={<TrendingUp className="w-4 h-4" />} /><Kpi title="صافي النشاط الاستثماري" value={money(cashFlow.investing.net)} icon={<Car className="w-4 h-4" />} /><Kpi title="صافي النشاط التمويلي" value={money(cashFlow.financing.net)} icon={<Building2 className="w-4 h-4" />} /></div><TableShell title={`التدفقات النقدية من ${cashFlow.periodStart} إلى ${cashFlow.periodEnd}`}><table className="w-full text-xs min-w-[640px]"><thead><tr className="text-zinc-500 border-b border-zinc-800"><Th>التصنيف</Th><Th>المتحصلات</Th><Th>المدفوعات</Th><Th>الصافي</Th></tr></thead><tbody><CashFlowRow label="تشغيلي" section={cashFlow.operating} /><CashFlowRow label="استثماري" section={cashFlow.investing} /><CashFlowRow label="تمويلي" section={cashFlow.financing} /><CashFlowRow label="غير مصنف — يحتاج مراجعة" section={cashFlow.unclassified} /></tbody></table></TableShell><div className="grid grid-cols-2 gap-3"><Mini label="صافي حركة النقد" value={money(cashFlow.netCashMovement)} /><Mini label="رصيد النقد آخر الفترة" value={money(cashFlow.closingCash)} /></div>{Math.abs(cashFlow.unclassified.net) > 0.005 && <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>توجد حركة نقدية ذات أطراف محاسبية من أكثر من تصنيف. تم إبقاؤها «غير مصنفة» بدل تخمين تصنيف غير مؤكد.</span></div>}</div>;
const CashFlowRow: React.FC<{ label: string; section: { inflows: number; outflows: number; net: number } }> = ({ label, section }) => <tr className="border-b border-zinc-800/50"><Td>{label}</Td><Td>{money(section.inflows)}</Td><Td>{money(section.outflows)}</Td><Td>{money(section.net)}</Td></tr>;
const LedgerView: React.FC<{ journals: JournalEntry[]; accounts: AccountingAccount[]; reports: FinanceReports | null }> = ({ journals, accounts, reports }) => <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Mini label="إجمالي مدين ميزان المراجعة" value={money(reports?.trialBalance?.reduce((s, r) => s + r.debit, 0))} /><Mini label="إجمالي دائن ميزان المراجعة" value={money(reports?.trialBalance?.reduce((s, r) => s + r.credit, 0))} /><Mini label="عدد القيود" value={String(journals.length)} /><Mini label="الحسابات النشطة" value={String(accounts.filter(a => a.active).length)} /></div><TableShell title="القيود المرحلة"><table className="w-full text-xs min-w-[900px]"><thead><tr className="text-zinc-500 border-b border-zinc-800"><Th>القيد</Th><Th>التاريخ</Th><Th>المصدر</Th><Th>المرجع</Th><Th>البيان</Th><Th>مدين</Th><Th>دائن</Th></tr></thead><tbody>{journals.map(j => <tr key={j.id} className="border-b border-zinc-800/50"><Td mono>{j.id}</Td><Td>{j.date}</Td><Td>{j.sourceType}</Td><Td mono>{j.reference || j.sourceId}</Td><Td>{j.memo}</Td><Td>{money(j.totalDebit)}</Td><Td>{money(j.totalCredit)}</Td></tr>)}</tbody></table></TableShell></div>;
const PeriodsView: React.FC<{ periods: AccountingPeriod[]; closeAllowed: boolean; onClose: () => void }> = ({ periods, closeAllowed, onClose }) => <div className="space-y-4">{closeAllowed && <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2"><CalendarClock className="w-4 h-4" />إقفال فترة</button></div>}<TableShell title="الفترات المقفلة"><table className="w-full text-xs"><thead><tr className="text-zinc-500 border-b border-zinc-800"><Th>الفترة</Th><Th>من</Th><Th>إلى</Th><Th>الحالة</Th><Th>تاريخ الإقفال</Th><Th>بواسطة</Th></tr></thead><tbody>{periods.map(p => <tr key={p.id} className="border-b border-zinc-800/50"><Td mono>{p.id}</Td><Td>{p.startDate}</Td><Td>{p.endDate}</Td><Td>{p.status === 'closed' ? 'مقفلة' : 'مفتوحة'}</Td><Td>{p.closedAt?.slice(0, 10) || '—'}</Td><Td>{p.closedByName || '—'}</Td></tr>)}</tbody></table></TableShell><div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400">إعادة فتح فترة مقفلة غير متاحة من هذه الواجهة عمدًا. أي تغيير في هذا السلوك يحتاج قرار حوكمة مستقل؛ التصحيح الحالي يتم بقيد عكسي أو قيد تسوية في فترة مفتوحة.</div></div>;
const VehicleProfitabilityTable: React.FC<{ rows: VehicleProfitabilityRow[] }> = ({ rows }) => <TableShell title="ربحية المركبات من القيود المرتبطة بالمركبة"><table className="w-full text-xs min-w-[980px]"><thead><tr className="text-zinc-500 border-b border-zinc-800"><Th>المركبة</Th><Th>الإيراد</Th><Th>الصيانة</Th><Th>التأمين</Th><Th>الترخيص</Th><Th>التمويل</Th><Th>التجهيز</Th><Th>إجمالي التكلفة</Th><Th>صافي الربح</Th><Th>العائد</Th></tr></thead><tbody>{rows.map(r => <tr key={r.vehicleId} className="border-b border-zinc-800/50"><Td>{r.vehicleName || r.vehicleId}</Td><Td>{money(r.revenue)}</Td><Td>{money(r.maintenanceCost)}</Td><Td>{money(r.insuranceCost)}</Td><Td>{money(r.registrationCost)}</Td><Td>{money(r.financeCost)}</Td><Td>{money(r.cleaningCost)}</Td><Td>{money(r.totalCost)}</Td><Td>{money(r.netProfit)}</Td><Td>{r.roiPercent == null ? '—' : `${r.roiPercent}%`}</Td></tr>)}</tbody></table></TableShell>;
const PostingGapsTable: React.FC<{ gaps: PostingGap[]; workingId: string | null; onPost: (gap: PostingGap) => void }> = ({ gaps, workingId, onPost }) => <div className="space-y-4"><div className={`p-4 rounded-2xl border text-xs flex items-start gap-3 ${gaps.length === 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>{gaps.length === 0 ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}<div><p className="font-bold">{gaps.length === 0 ? 'لا توجد فجوات ترحيل مكتشفة' : `${gaps.length} عملية تشغيلية تحتاج ربطًا محاسبيًا`}</p><p className="opacity-80 mt-1">لا يقوم النظام بأي ترحيل رجعي تلقائي للبيانات التاريخية. اضغط «ترحيل الآن» لكل عملية إيراد أو دفعة أو تأمين لإدخالها في دفتر الأستاذ بنفسك -- لا يتم اختراع حساب أو ضريبة أو تاريخ استحقاق.</p></div></div><TableShell title="فجوات الترحيل التاريخية والحالية"><table className="w-full text-xs min-w-[960px]"><thead><tr className="text-zinc-500 border-b border-zinc-800"><Th>النوع</Th><Th>المرجع</Th><Th>التاريخ</Th><Th>البيان</Th><Th>المبلغ</Th><Th>سبب الفجوة</Th><Th>الإجراء</Th></tr></thead><tbody>{gaps.map((g, i) => <tr key={`${g.sourceType}-${g.sourceId}-${i}`} className="border-b border-zinc-800/50"><Td>{g.sourceType}</Td><Td mono>{g.sourceId}</Td><Td>{g.date || '—'}</Td><Td>{g.description}</Td><Td>{g.amount == null ? '—' : money(g.amount)}</Td><Td>{g.reason}</Td><Td>{(g.sourceType === 'Invoice' || g.sourceType === 'Payment' || g.sourceType === 'Deposit') ? <button disabled={workingId === `gap-${g.sourceType}-${g.sourceId}`} onClick={() => onPost(g)} className="px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 font-bold whitespace-nowrap">ترحيل الآن</button> : <span className="text-zinc-600">—</span>}</Td></tr>)}</tbody></table></TableShell></div>;
const TableShell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800 overflow-hidden"><div className="px-4 py-3 border-b border-zinc-800 font-bold text-sm text-zinc-100">{title}</div><div className="overflow-x-auto">{children}</div></div>;
const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => <th className="p-3 text-start font-medium whitespace-nowrap">{children}</th>;
const Td: React.FC<{ children: React.ReactNode; mono?: boolean }> = ({ children, mono }) => <td className={`p-3 text-zinc-300 whitespace-nowrap ${mono ? 'font-mono' : ''}`}>{children}</td>;
