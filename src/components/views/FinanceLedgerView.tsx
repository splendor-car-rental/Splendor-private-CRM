import React, { useState } from 'react';
import { 
  Receipt, Plus, Search, DollarSign, Landmark, 
  CheckCircle2, ArrowDownLeft, ArrowUpRight, ShieldCheck, 
  FileText, Clock, RefreshCw, AlertCircle
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate } from '../../lib/dateFormat';

export const FinanceLedgerView: React.FC = () => {
  const { language, t } = useLanguage();
  const { 
    invoices, deposits, payments, customers, 
    recordPayment, applyDeposit, refundDeposit 
  } = useCRM();

  const [activeTab, setActiveTab] = useState<'invoices' | 'deposits' | 'payments'>('invoices');
  const [searchTerm, setSearchTerm] = useState('');

  // Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [depositActionModalOpen, setDepositActionModalOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<any>(null);
  const [depositActionType, setDepositActionType] = useState<'apply' | 'refund'>('refund');
  const [depositAmountInput, setDepositAmountInput] = useState<number>(0);
  const [depositReasonInput, setDepositReasonInput] = useState('');

  const [paymentForm, setPaymentForm] = useState({
    customerId: '',
    customerName: '',
    invoiceId: '',
    amount: 10000,
    method: 'bank_transfer' as const,
    referenceNumber: 'TXN-NBD-' + Math.floor(Math.random() * 900000 + 100000),
    notes: 'Direct wire transfer received via Emirates NBD.'
  });

  const handleCustomerSelect = (custId: string) => {
    const cust = customers.find(c => c.id === custId);
    if (cust) {
      const openInv = invoices.find(i => i.customerId === cust.id && i.balanceDue > 0);
      setPaymentForm(prev => ({
        ...prev,
        customerId: cust.id,
        customerName: cust.fullName,
        invoiceId: openInv ? openInv.id : '',
        amount: openInv ? openInv.balanceDue : 5000
      }));
    }
  };

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
      await applyDeposit(selectedDeposit.id, depositAmountInput, depositReasonInput);
    }
    setDepositActionModalOpen(false);
  };

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
            <p className="text-[10px] uppercase font-bold text-zinc-400">Total Invoiced (Gross)</p>
            <h3 className="text-xl font-bold text-zinc-100 font-display mt-1">{totalInvoiced.toLocaleString()} AED</h3>
          </div>
          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[#f5d97f]">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-zinc-400">Total Payments Allocated</p>
            <h3 className="text-xl font-bold text-emerald-400 font-display mt-1">{totalPaid.toLocaleString()} AED</h3>
          </div>
          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-zinc-400">Active Security Deposits Held</p>
            <h3 className="text-xl font-bold text-[#f5d97f] font-display mt-1">{totalDepositsHeld.toLocaleString()} AED</h3>
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
          Official Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab('deposits')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'deposits' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Security Deposits Custody ({deposits.length})
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'payments' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Payment Receipts & Vouchers ({payments.length})
        </button>
      </div>

      {/* Tab 1: Invoices */}
      {activeTab === 'invoices' && (
        <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                  <th className="p-4 text-start font-medium">Invoice Number</th>
                  <th className="p-4 text-start font-medium">VIP Client</th>
                  <th className="p-4 text-start font-medium">Issued Date</th>
                  <th className="p-4 text-end font-medium">Subtotal</th>
                  <th className="p-4 text-end font-medium">VAT (5%)</th>
                  <th className="p-4 text-end font-medium">Total Amount</th>
                  <th className="p-4 text-end font-medium">Balance Due</th>
                  <th className="p-4 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {(invoices || []).map(inv => (
                  <tr key={inv.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-4 font-mono font-bold text-[#f5d97f]">{inv.id}</td>
                    <td className="p-4 font-semibold text-zinc-200">{inv.customerName || 'N/A'}</td>
                    <td className="p-4">{inv.issueDate ? formatDate(inv.issueDate) : 'N/A'}</td>
                    <td className="p-4 text-end font-mono">{(inv.subtotal || 0).toLocaleString()} AED</td>
                    <td className="p-4 text-end font-mono text-zinc-400">{(inv.vatAmount || 0).toLocaleString()} AED</td>
                    <td className="p-4 text-end font-mono font-bold text-zinc-100">{(inv.totalAmount || 0).toLocaleString()} AED</td>
                    <td className="p-4 text-end font-mono font-bold text-rose-400">{(inv.balanceDue || 0).toLocaleString()} AED</td>
                    <td className="p-4 text-center">
                      <Badge variant={inv.status === 'paid' ? 'emerald' : inv.status === 'partially_paid' ? 'amber' : 'rose'} size="sm">
                        {(inv.status || 'DUE').toUpperCase()}
                      </Badge>
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
            <table className="w-full text-xs text-start">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                  <th className="p-4 text-start font-medium">Deposit ID</th>
                  <th className="p-4 text-start font-medium">VIP Client</th>
                  <th className="p-4 text-start font-medium">Contract Ref</th>
                  <th className="p-4 text-end font-medium">Held Initial</th>
                  <th className="p-4 text-end font-medium">Applied to Fines</th>
                  <th className="p-4 text-end font-medium">Refunded</th>
                  <th className="p-4 text-end font-medium">Current Balance</th>
                  <th className="p-4 text-center font-medium">Status</th>
                  <th className="p-4 text-end font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {(deposits || []).map(dep => (
                  <tr key={dep.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-4 font-mono font-bold text-[#f5d97f]">{dep.id}</td>
                    <td className="p-4 font-semibold text-zinc-200">{dep.customerName || 'N/A'}</td>
                    <td className="p-4 font-mono text-zinc-400">{dep.contractId || 'N/A'}</td>
                    <td className="p-4 text-end font-mono">{(dep.amount || 0).toLocaleString()} AED</td>
                    <td className="p-4 text-end font-mono text-rose-400">{(dep.appliedAmount || 0).toLocaleString()} AED</td>
                    <td className="p-4 text-end font-mono text-sky-400">{(dep.refundedAmount || 0).toLocaleString()} AED</td>
                    <td className="p-4 text-end font-mono font-bold text-emerald-400">{(dep.balance || 0).toLocaleString()} AED</td>
                    <td className="p-4 text-center">
                      <Badge variant={dep.status === 'held' ? 'gold' : dep.status === 'refunded' ? 'emerald' : 'zinc'} size="sm">
                        {(dep.status || 'HELD').toUpperCase()}
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
                            Refund
                          </button>
                          <button
                            onClick={() => {
                              setSelectedDeposit(dep);
                              setDepositActionType('apply');
                              setDepositAmountInput(dep.balance || 0);
                              setDepositActionModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
                          >
                            Apply Fine
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
            <table className="w-full text-xs text-start">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                  <th className="p-4 text-start font-medium">Receipt No.</th>
                  <th className="p-4 text-start font-medium">VIP Client</th>
                  <th className="p-4 text-start font-medium">Method</th>
                  <th className="p-4 text-start font-medium">Reference</th>
                  <th className="p-4 text-start font-medium">Received Date</th>
                  <th className="p-4 text-end font-medium">Amount Received</th>
                  <th className="p-4 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {(payments || []).map(pay => (
                  <tr key={pay.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-4 font-mono font-bold text-[#f5d97f]">{pay.receiptNumber || pay.id}</td>
                    <td className="p-4 font-semibold text-zinc-200">{pay.customerName || 'N/A'}</td>
                    <td className="p-4 uppercase font-medium">{(pay.method || 'payment').replace(/_/g, ' ')}</td>
                    <td className="p-4 font-mono text-zinc-400">{pay.referenceNumber || 'N/A'}</td>
                    <td className="p-4">{pay.receivedAt ? formatDate(pay.receivedAt) : 'N/A'}</td>
                    <td className="p-4 text-end font-mono font-bold text-emerald-400">{(pay.amount || 0).toLocaleString()} AED</td>
                    <td className="p-4 text-center">
                      <Badge variant="emerald" size="sm">ALLOCATED</Badge>
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
        onClose={() => setPaymentModalOpen(false)}
        title="Record Client Payment"
        subtitle="Allocate received funds to customer account and invoice"
        maxWidth="lg"
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Customer *</label>
              <select
                required
                value={paymentForm.customerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                {(customers || []).map(c => (
                  <option key={c.id} value={c.id}>{c.fullName || c.id} (Balance: {((c.outstandingBalance || 0)).toLocaleString()} AED)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Payment Method *</label>
              <select
                value={paymentForm.method}
                onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                <option value="bank_transfer">Bank Wire Transfer</option>
                <option value="card">Credit Card (Terminal)</option>
                <option value="cash">Cash (Safe Deposit)</option>
                <option value="online_link">Online Payment Link</option>
                <option value="corporate_credit">Corporate Credit Account</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Amount (AED) *</label>
              <input
                type="number"
                required
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Bank Reference / TXN ID</label>
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
              onClick={() => setPaymentModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold"
            >
              Record & Allocate
            </button>
          </div>
        </form>
      </Modal>

      {/* Deposit Action Modal (Apply / Refund) */}
      <Modal
        isOpen={depositActionModalOpen}
        onClose={() => setDepositActionModalOpen(false)}
        title={depositActionType === 'refund' ? 'Process Deposit Refund' : 'Apply Deposit Against Charges'}
        subtitle={`Deposit Account ${selectedDeposit?.id} (${selectedDeposit?.customerName})`}
        maxWidth="md"
      >
        <form onSubmit={handleDepositActionSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">Amount to {depositActionType === 'refund' ? 'Refund' : 'Apply'} (AED)</label>
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
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Deduction Reason (Traffic fine / Salik / Damage) *</label>
              <input
                type="text"
                required
                value={depositReasonInput}
                onChange={(e) => setDepositReasonInput(e.target.value)}
                placeholder="e.g. Dubai Police Fine #892182 (Speeding on SZR)"
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
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
    </div>
  );
};
