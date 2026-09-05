import React, { useEffect, useState } from 'react';
import {
  Receipt, Plus, Search, DollarSign, Landmark,
  CheckCircle2, ArrowDownLeft, ArrowUpRight, ShieldCheck,
  FileText, Clock, RefreshCw, AlertCircle, Printer, Eye
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate } from '../../lib/dateFormat';
import { TaxInvoicePrintModal } from '../operations/TaxInvoicePrintModal';
import { Invoice } from '../../types';

interface FinanceLedgerViewProps {
  /** Incremented by the parent's header "Record Revenue / Customer Payment" button so this view can open its own payment modal immediately, instead of the button only switching tabs to a table with no visible reaction. */
  autoOpenPaymentSignal?: number;
}

export const FinanceLedgerView: React.FC<FinanceLedgerViewProps> = ({ autoOpenPaymentSignal }) => {
  const { language, t } = useLanguage();
  const isAr = language === 'ar';
  const {
    invoices, deposits, payments, customers, charges,
    recordPayment, applyDeposit, refundDeposit
  } = useCRM();

  const [activeTab, setActiveTab] = useState<'invoices' | 'deposits' | 'payments'>('invoices');
  const [searchTerm, setSearchTerm] = useState('');

  // Invoice Print Modal
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);

  // Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [depositActionModalOpen, setDepositActionModalOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<any>(null);
  const [depositActionType, setDepositActionType] = useState<'apply' | 'refund'>('refund');
  const [depositAmountInput, setDepositAmountInput] = useState<number>(0);
  const [depositReasonInput, setDepositReasonInput] = useState('');
  const [depositChargeIdInput, setDepositChargeIdInput] = useState('');

  const EMPTY_PAYMENT_FORM = {
    customerId: '',
    customerName: '',
    invoiceId: '',
    amount: 0,
    method: 'bank_transfer' as const,
    referenceNumber: '',
    notes: ''
  };
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);

  const handleCustomerSelect = (custId: string) => {
    const cust = customers.find(c => c.id === custId);
    if (cust) {
      const openInv = invoices.find(i => i.customerId === cust.id && i.balanceDue > 0);
      setPaymentForm(prev => ({
        ...prev,
        customerId: cust.id,
        customerName: cust.fullName,
        invoiceId: openInv ? openInv.id : '',
        amount: openInv ? openInv.balanceDue : 0
      }));
    }
  };

  // The header's "Record Revenue / Customer Payment" button (in the parent
  // FinanceControlCenterView) only switched tabs here before -- clicking it
  // showed a table with no visible reaction, which reads as "the button
  // doesn't work". Each increment of this signal now opens the modal
  // directly, matching what the button's label promises.
  useEffect(() => {
    if (autoOpenPaymentSignal) {
      if (customers.length > 0) handleCustomerSelect(customers[0].id);
      setPaymentModalOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenPaymentSignal]);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await recordPayment(paymentForm);
    setPaymentModalOpen(false);
  };

  const handleDepositActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeposit) return;
    if (depositActionType === 'refund') {
      await refundDeposit(selectedDeposit.id, depositAmountInput);
    } else {
      if (!depositChargeIdInput) return;
      await applyDeposit(selectedDeposit.id, depositAmountInput, depositReasonInput, depositChargeIdInput);
    }
    setDepositActionModalOpen(false);
  };

  // Rule: a deposit can only be deducted against an existing, approved
  // charge/claim that hasn't already been used for a prior deduction --
  // never a free-text reason alone.
  const eligibleChargesForSelectedDeposit = (charges || []).filter(c =>
    c.customerId === selectedDeposit?.customerId && c.approvalStatus === 'approved' && !c.deductedFromDepositId
  );

  const totalInvoiced = (invoices || []).reduce((s, i) => s + (i?.totalAmount || 0), 0);
  const totalPaid = (payments || []).reduce((s, p) => s + (p?.amount || 0), 0);
  const totalDepositsHeld = (deposits || []).filter(d => d?.status === 'held').reduce((s, d) => s + (d?.balance || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'الدفتر المالي، الفواتير، والودائع' : 'Financial Ledger & Deposit Custody'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'إدارة الفواتير، ضريبة القيمة المضافة 5%، تسوية الودائع التأمينية وسندات القبض' : 'Authoritative invoicing, 5% UAE VAT compliance, security deposit custody & payment allocations'}
          </p>
        </div>

        <button
          onClick={() => {
            if (customers.length > 0) handleCustomerSelect(customers[0].id);
            setPaymentModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{t('recordPayment')}</span>
        </button>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-zinc-400">{isAr ? 'إجمالي الفواتير (إجمالي)' : 'Total Invoiced (Gross)'}</p>
            <h3 className="text-xl font-bold text-zinc-100 font-display mt-1">{totalInvoiced.toLocaleString()} {isAr ? 'د.إ' : 'AED'}</h3>
          </div>
          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[#f5d97f]">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-zinc-400">{isAr ? 'إجمالي الدفعات المحصّلة' : 'Total Payments Allocated'}</p>
            <h3 className="text-xl font-bold text-emerald-400 font-display mt-1">{totalPaid.toLocaleString()} {isAr ? 'د.إ' : 'AED'}</h3>
          </div>
          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-zinc-400">{isAr ? 'تأمينات محتجزة حاليًا' : 'Active Security Deposits Held'}</p>
            <h3 className="text-xl font-bold text-[#f5d97f] font-display mt-1">{totalDepositsHeld.toLocaleString()} {isAr ? 'د.إ' : 'AED'}</h3>
          </div>
          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[#D4AF37]">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'invoices' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {isAr ? `الفواتير الرسمية (${invoices.length})` : `Official Invoices (${invoices.length})`}
        </button>
        <button
          onClick={() => setActiveTab('deposits')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'deposits' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {isAr ? `عهدة التأمينات (${deposits.length})` : `Security Deposits Custody (${deposits.length})`}
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'payments' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {isAr ? `سندات القبض والدفعات (${payments.length})` : `Payment Receipts & Vouchers (${payments.length})`}
        </button>
      </div>

      {/* Tab 1: Invoices */}
      {activeTab === 'invoices' && (
        <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start min-w-[1000px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                  <th className="p-4 text-start font-medium">{isAr ? 'رقم الفاتورة' : 'Invoice Number'}</th>
                  <th className="p-4 text-start font-medium">{isAr ? 'العميل' : 'Client'}</th>
                  <th className="p-4 text-start font-medium">{isAr ? 'تاريخ الإصدار' : 'Issued Date'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'قبل الضريبة' : 'Subtotal'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'ضريبة القيمة المضافة (5%)' : 'VAT (5%)'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'الإجمالي' : 'Total Amount'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'المتبقي' : 'Balance Due'}</th>
                  <th className="p-4 text-center font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {(invoices || []).map(inv => (
                  <tr key={inv.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-4 font-mono font-bold text-[#f5d97f]">{inv.id}</td>
                    <td className="p-4 font-semibold text-zinc-200">{inv.customerName || (isAr ? 'غير محدد' : 'N/A')}</td>
                    <td className="p-4">{inv.issueDate ? formatDate(inv.issueDate) : (isAr ? 'غير محدد' : 'N/A')}</td>
                    <td className="p-4 text-end font-mono">{(inv.subtotal || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</td>
                    <td className="p-4 text-end font-mono text-zinc-400">{(inv.vatAmount || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</td>
                    <td className="p-4 text-end font-mono font-bold text-zinc-100">{(inv.totalAmount || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</td>
                    <td className="p-4 text-end font-mono font-bold text-rose-400">{(inv.balanceDue || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</td>
                    <td className="p-4 text-center">
                      <Badge variant={inv.status === 'paid' ? 'emerald' : inv.status === 'partially_paid' ? 'amber' : 'rose'} size="sm">
                        {inv.status === 'paid' ? (isAr ? 'مسدد' : 'PAID') : inv.status === 'partially_paid' ? (isAr ? 'مسدد جزئيًا' : 'PARTIAL') : (isAr ? 'مستحق' : 'DUE')}
                      </Badge>
                    </td>
                    <td className="p-4 text-end">
                      <button
                        onClick={() => setInvoiceToPrint(inv)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-[#D4AF37] hover:text-zinc-950 text-zinc-300 text-xs font-semibold transition-all shadow-sm"
                        title={isAr ? 'طباعة وحفظ الفاتورة على الهيد ليتر الرسمي' : 'Print/PDF Invoice on Official Letterhead'}
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{isAr ? 'الهيد ليتر الرسمي' : 'Letterhead PDF'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Deposits */}
      {activeTab === 'deposits' && (
        <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start min-w-[1000px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                  <th className="p-4 text-start font-medium">{isAr ? 'رقم التأمين' : 'Deposit ID'}</th>
                  <th className="p-4 text-start font-medium">{isAr ? 'العميل' : 'Client'}</th>
                  <th className="p-4 text-start font-medium">{isAr ? 'مرجع العقد' : 'Contract Ref'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'المبلغ المحتجز' : 'Held Initial'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'المخصوم لمخالفات' : 'Applied to Fines'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'المسترد' : 'Refunded'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'الرصيد الحالي' : 'Current Balance'}</th>
                  <th className="p-4 text-center font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {(deposits || []).map(dep => (
                  <tr key={dep.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-4 font-mono font-bold text-[#f5d97f]">{dep.id}</td>
                    <td className="p-4 font-semibold text-zinc-200">{dep.customerName || (isAr ? 'غير محدد' : 'N/A')}</td>
                    <td className="p-4 font-mono text-zinc-400">{dep.contractId || (isAr ? 'غير محدد' : 'N/A')}</td>
                    <td className="p-4 text-end font-mono">{(dep.amount || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</td>
                    <td className="p-4 text-end font-mono text-rose-400">{(dep.appliedAmount || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</td>
                    <td className="p-4 text-end font-mono text-sky-400">{(dep.refundedAmount || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</td>
                    <td className="p-4 text-end font-mono font-bold text-emerald-400">{(dep.balance || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</td>
                    <td className="p-4 text-center">
                      <Badge variant={dep.status === 'held' ? 'gold' : dep.status === 'refunded' ? 'emerald' : 'zinc'} size="sm">
                        {dep.status === 'refunded' ? (isAr ? 'مسترد' : 'REFUNDED') : dep.status === 'held' ? (isAr ? 'محتجز' : 'HELD') : (dep.status || (isAr ? 'محتجز' : 'HELD')).toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-4 text-end space-x-2">
                      {(dep.balance || 0) > 0 && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedDeposit(dep);
                              setDepositActionType('refund');
                              setDepositAmountInput(dep.balance || 0);
                              setDepositActionModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
                          >
                            {isAr ? 'استرداد' : 'Refund'}
                          </button>
                          <button
                            onClick={() => {
                              setSelectedDeposit(dep);
                              setDepositActionType('apply');
                              setDepositAmountInput(dep.balance || 0);
                              setDepositChargeIdInput('');
                              setDepositActionModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
                          >
                            {isAr ? 'خصم مخالفة' : 'Apply Fine'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Payments */}
      {activeTab === 'payments' && (
        <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start min-w-[860px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                  <th className="p-4 text-start font-medium">{isAr ? 'رقم السند' : 'Receipt No.'}</th>
                  <th className="p-4 text-start font-medium">{isAr ? 'العميل' : 'Client'}</th>
                  <th className="p-4 text-start font-medium">{isAr ? 'طريقة الدفع' : 'Method'}</th>
                  <th className="p-4 text-start font-medium">{isAr ? 'المرجع' : 'Reference'}</th>
                  <th className="p-4 text-start font-medium">{isAr ? 'تاريخ الاستلام' : 'Received Date'}</th>
                  <th className="p-4 text-end font-medium">{isAr ? 'المبلغ المستلم' : 'Amount Received'}</th>
                  <th className="p-4 text-center font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {(payments || []).map(pay => (
                  <tr key={pay.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-4 font-mono font-bold text-[#f5d97f]">{pay.receiptNumber || pay.id}</td>
                    <td className="p-4 font-semibold text-zinc-200">{pay.customerName || (isAr ? 'غير محدد' : 'N/A')}</td>
                    <td className="p-4 uppercase font-medium">{(pay.method || 'payment').replace(/_/g, ' ')}</td>
                    <td className="p-4 font-mono text-zinc-400">{pay.referenceNumber || (isAr ? 'غير محدد' : 'N/A')}</td>
                    <td className="p-4">{pay.receivedAt ? formatDate(pay.receivedAt) : (isAr ? 'غير محدد' : 'N/A')}</td>
                    <td className="p-4 text-end font-mono font-bold text-emerald-400">{(pay.amount || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</td>
                    <td className="p-4 text-center">
                      <Badge variant="emerald" size="sm">{isAr ? 'مخصّص' : 'ALLOCATED'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => { setPaymentModalOpen(false); setPaymentForm(EMPTY_PAYMENT_FORM); }}
        title={isAr ? 'تسجيل دفعة من العميل' : 'Record Client Payment'}
        subtitle={isAr ? 'تخصيص المبلغ المستلم لحساب العميل والفاتورة' : 'Allocate received funds to customer account and invoice'}
        maxWidth="lg"
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'العميل *' : 'Customer *'}</label>
              {(customers || []).length === 0 ? (
                <div className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-amber-500/40 text-amber-300 text-[11px]">
                  {isAr ? 'لا يوجد عملاء مسجّلون بعد. سجّل عميلاً أولاً من شاشة العملاء.' : 'No customers are registered yet. Register a customer first from the Customers screen.'}
                </div>
              ) : (
                <select
                  required
                  value={paymentForm.customerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                >
                  <option value="" disabled>{isAr ? '-- اختر عميلاً --' : '-- Select a customer --'}</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.fullName || c.id} ({isAr ? 'الرصيد' : 'Balance'}: {((c.outstandingBalance || 0)).toLocaleString()} {isAr ? 'د.إ' : 'AED'})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'طريقة الدفع *' : 'Payment Method *'}</label>
              <select
                value={paymentForm.method}
                onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                <option value="bank_transfer">{isAr ? 'تحويل بنكي' : 'Bank Wire Transfer'}</option>
                <option value="card">{isAr ? 'بطاقة ائتمان (جهاز نقاط بيع)' : 'Credit Card (Terminal)'}</option>
                <option value="cash">{isAr ? 'نقدًا (خزينة)' : 'Cash (Safe Deposit)'}</option>
                <option value="online_link">{isAr ? 'رابط دفع إلكتروني' : 'Online Payment Link'}</option>
              </select>
              {/* Corporate credit is never a received payment -- no cash actually
                  moved, so it can't be "recorded" here. It stays as an outstanding
                  invoice on the corporate account instead (see Corporate Accounts). */}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'المبلغ (د.إ) *' : 'Amount (AED) *'}</label>
              <input
                type="number"
                required
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'المرجع البنكي / رقم العملية' : 'Bank Reference / TXN ID'}</label>
              <input
                type="text"
                value={paymentForm.referenceNumber}
                onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => { setPaymentModalOpen(false); setPaymentForm(EMPTY_PAYMENT_FORM); }}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={!paymentForm.customerId || !(paymentForm.amount > 0)}
              className="px-5 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold disabled:opacity-50"
            >
              {isAr ? 'تسجيل وتخصيص' : 'Record & Allocate'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Deposit Action Modal (Apply / Refund) */}
      <Modal
        isOpen={depositActionModalOpen}
        onClose={() => setDepositActionModalOpen(false)}
        title={depositActionType === 'refund' ? (isAr ? 'استرداد التأمين' : 'Process Deposit Refund') : (isAr ? 'خصم من التأمين مقابل مخالفة' : 'Apply Deposit Against Charges')}
        subtitle={isAr ? `حساب التأمين ${selectedDeposit?.id} (${selectedDeposit?.customerName})` : `Deposit Account ${selectedDeposit?.id} (${selectedDeposit?.customerName})`}
        maxWidth="md"
      >
        <form onSubmit={handleDepositActionSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{isAr ? `المبلغ المراد ${depositActionType === 'refund' ? 'استرداده' : 'خصمه'} (د.إ)` : `Amount to ${depositActionType === 'refund' ? 'Refund' : 'Apply'} (AED)`}</label>
            <input
              type="number"
              max={selectedDeposit?.balance || 0}
              required
              value={depositAmountInput}
              onChange={(e) => setDepositAmountInput(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-base"
            />
          </div>

          {depositActionType === 'apply' && (
            <>
              <div>
                <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'المخالفة / المطالبة *' : 'Charge / Claim *'}</label>
                <select
                  required
                  value={depositChargeIdInput}
                  onChange={(e) => setDepositChargeIdInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                >
                  <option value="">{isAr ? 'اختر مخالفة معتمدة لخصمها...' : 'Select an approved charge to deduct against...'}</option>
                  {eligibleChargesForSelectedDeposit.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.id} -- {c.type} -- {c.totalAmount.toLocaleString()} {isAr ? 'د.إ' : 'AED'} -- {c.description}
                    </option>
                  ))}
                </select>
                {eligibleChargesForSelectedDeposit.length === 0 && (
                  <p className="text-amber-400 text-[11px] mt-1">
                    {isAr ? 'لا توجد مخالفات معتمدة وغير مخصومة على حساب هذا العميل. لا يمكن خصم التأمين مباشرة -- يجب رفع مخالفة واعتمادها أولًا.' : "No approved, undeducted charges on this customer's account. A deposit can never be deducted directly -- raise and approve a charge first."}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'ملاحظات (اختياري)' : 'Notes (optional)'}</label>
                <input
                  type="text"
                  value={depositReasonInput}
                  onChange={(e) => setDepositReasonInput(e.target.value)}
                  placeholder={isAr ? 'سياق إضافي لهذا الخصم' : 'Additional context for this deduction'}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                />
              </div>
            </>
          )}

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setDepositActionModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-xl font-semibold text-zinc-950 ${depositActionType === 'refund' ? 'bg-emerald-500' : 'bg-rose-500'}`}
            >
              {language === 'ar'
                ? `تأكيد ${depositActionType === 'refund' ? 'الاسترداد' : 'الخصم'}`
                : `Confirm ${depositActionType === 'refund' ? 'Refund' : 'Deduction'}`}
            </button>
          </div>
        </form>
      </Modal>

      {/* Official Tax Invoice Print/PDF Modal on Letterhead */}
      {invoiceToPrint && (
        <TaxInvoicePrintModal
          isOpen={!!invoiceToPrint}
          onClose={() => setInvoiceToPrint(null)}
          invoice={invoiceToPrint}
        />
      )}
    </div>
  );
};
