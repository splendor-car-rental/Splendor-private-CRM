import React, { useState, useRef } from 'react';
import {
  Landmark, Sparkles, UploadCloud, CheckCircle2,
  AlertCircle, ArrowRight, RefreshCw, FileSpreadsheet,
  HelpCircle, DollarSign, ShieldCheck, Plus, Building2,
  Copy, Check, Edit2, Trash2, ArrowUpRight, ArrowDownLeft,
  FileText, Calendar, Wallet, Layers, Eye
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { AiConfidenceBadge } from '../common/AiConfidenceBadge';
import { Modal } from '../common/Modal';
import { CompanyBankAccountModal } from './CompanyBankAccountsModal';
import { CompanyBankAccount } from '../../types';
import { parseBankStatementFile, BankStatementParseResult } from '../../lib/bankStatementParser';

export const BankReconciliationView: React.FC = () => {
  const { language, t, getStatusLabel } = useLanguage();
  const isAr = language === 'ar';
  const {
    bankTransactions, bankBatches, companyBankAccounts,
    runAutoReconciliation, reconcileBankTransaction,
    uploadBankBatch, deleteCompanyBankAccount, showToast
  } = useCRM();

  // Active Main Tab
  const [activeTab, setActiveTab] = useState<'reconciliation' | 'accounts' | 'batches'>('reconciliation');
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'reconciled' | 'credits' | 'debits'>('all');
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<CompanyBankAccount | null>(null);

  // Import State
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [customBankName, setCustomBankName] = useState<string>('');
  const [customAccountNumber, setCustomAccountNumber] = useState<string>('');
  const [statementPeriod, setStatementPeriod] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<BankStatementParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Processing AI Reconciliation
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [copiedIbanId, setCopiedIbanId] = useState<string | null>(null);

  const handleCopyIban = (iban: string, id: string) => {
    navigator.clipboard.writeText(iban);
    setCopiedIbanId(id);
    showToast(isAr ? 'تم نسخ رقم الآيبان' : 'IBAN Copied', iban, 'info');
    setTimeout(() => setCopiedIbanId(null), 2500);
  };

  const handleFileChange = async (file: File) => {
    if (!file) return;
    setSelectedFile(file);
    setIsParsing(true);
    setParseError(null);
    setParsedData(null);

    try {
      const result = await parseBankStatementFile(file);
      setParsedData(result);

      // Auto-populate bank selection if matched
      if (result.detectedBankName && !selectedAccountId) {
        const matched = companyBankAccounts.find(a => 
          a.bankName.toLowerCase().includes(result.detectedBankName!.toLowerCase())
        );
        if (matched) setSelectedAccountId(matched.id);
        else setCustomBankName(result.detectedBankName);
      }
      if (result.detectedAccountNumber && !customAccountNumber) {
        setCustomAccountNumber(result.detectedAccountNumber);
      }

      if (result.startDate && result.endDate) {
        setStatementPeriod(`${result.startDate} → ${result.endDate}`);
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setParseError(err?.message || (isAr ? 'فشل تحليل ملف كشف الحساب' : 'Failed to parse statement file'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedData || parsedData.transactions.length === 0) {
      setParseError(isAr ? 'لا توجد معاملات صالحة للاستيراد' : 'No valid transactions to import');
      return;
    }

    let finalBankName = customBankName;
    let finalAccountNumber = customAccountNumber;

    if (selectedAccountId) {
      const acc = companyBankAccounts.find(a => a.id === selectedAccountId);
      if (acc) {
        finalBankName = isAr && acc.bankNameAr ? acc.bankNameAr : acc.bankName;
        finalAccountNumber = acc.iban || acc.accountNumber;
      }
    }

    if (!finalBankName) {
      finalBankName = 'Emirates NBD';
    }

    setIsUploading(true);
    setParseError(null);

    try {
      await uploadBankBatch({
        fileName: parsedData.fileName,
        bankName: finalBankName,
        accountNumber: finalAccountNumber,
        statementPeriod: statementPeriod || `${parsedData.startDate || ''} - ${parsedData.endDate || ''}`,
        transactions: parsedData.transactions
      });

      setImportModalOpen(false);
      setSelectedFile(null);
      setParsedData(null);
      setSelectedAccountId('');
      setCustomBankName('');
      setCustomAccountNumber('');
    } catch (err: any) {
      setParseError(err?.message || (isAr ? 'فشل استيراد المعاملات إلى النظام' : 'Failed to import transactions'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunReconciliation = async () => {
    setIsProcessingAI(true);
    try {
      await runAutoReconciliation();
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleConfirmMatch = async (txnId: string, invoiceId?: string) => {
    await reconcileBankTransaction(txnId, 'invoice', invoiceId || '');
  };

  const handleDeleteAccount = async (account: CompanyBankAccount) => {
    if (window.confirm(isAr ? `هل أنت متأكد من حذف الحساب البنكي "${account.bankName} - ${account.accountNumber}"؟` : `Are you sure you want to delete bank account "${account.bankName} - ${account.accountNumber}"?`)) {
      await deleteCompanyBankAccount(account.id);
    }
  };

  // Filter transactions
  const filteredTxns = bankTransactions.filter(t => {
    // Tab filter
    if (filter === 'reconciled' && t.status !== 'reconciled') return false;
    if (filter === 'unmatched' && t.status === 'reconciled') return false;
    if (filter === 'credits' && t.credit <= 0) return false;
    if (filter === 'debits' && t.debit <= 0) return false;

    // Bank filter
    if (selectedBankFilter !== 'all') {
      const batch = bankBatches.find(b => b.id === t.batchId);
      if (batch && !batch.bankName.toLowerCase().includes(selectedBankFilter.toLowerCase())) {
        return false;
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = t.description?.toLowerCase().includes(q);
      const matchRef = t.reference?.toLowerCase().includes(q);
      const matchCust = t.suggestedMatch?.customerName?.toLowerCase().includes(q);
      const matchInv = t.suggestedMatch?.invoiceId?.toLowerCase().includes(q);
      if (!matchDesc && !matchRef && !matchCust && !matchInv) return false;
    }

    return true;
  });

  const reconciledCount = bankTransactions.filter(t => t.status === 'reconciled').length;
  const matchRate = bankTransactions.length > 0
    ? Math.round((reconciledCount / bankTransactions.length) * 100)
    : 100;
  const totalCreditSum = bankTransactions.reduce((acc, t) => acc + (t.credit || 0), 0);
  const totalDebitSum = bankTransactions.reduce((acc, t) => acc + (t.debit || 0), 0);

  const getBankName = (batchId: string) =>
    bankBatches.find(b => b.id === batchId)?.bankName || (isAr ? 'حساب غير محدد' : 'Unspecified account');

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30">
              <Landmark className="w-5 h-5" />
            </span>
            <h2 className="text-2xl font-display font-bold text-zinc-100">
              {isAr ? 'الحسابات البنكية والتسوية المالية والمطابقة' : 'Bank Accounts & AI Financial Reconciliation'}
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {isAr
              ? 'إدارة حسابات الشركة البنكية واستيراد كشوف الحساب الفعلية (CSV / Excel) مع مطابقة المدفوعات آلياً بالذكاء الاصطناعي'
              : 'Manage corporate bank accounts, import real statements (CSV / Excel), and auto-reconcile customer wire transfers via AI'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => {
              setAccountToEdit(null);
              setAccountModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#f5d97f] text-xs font-semibold hover:bg-[#D4AF37]/20 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إضافة حساب بنكي للشركة' : 'Add Bank Account'}</span>
          </button>

          <button
            onClick={() => {
              setParsedData(null);
              setSelectedFile(null);
              setParseError(null);
              setImportModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 text-xs font-semibold transition-all shadow-sm"
          >
            <UploadCloud className="w-4 h-4 text-sky-400" />
            <span>{isAr ? 'استيراد كشف حساب حقيقي' : 'Import Statement (File)'}</span>
          </button>

          <button
            onClick={handleRunReconciliation}
            disabled={isProcessingAI || bankTransactions.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isProcessingAI ? 'animate-spin' : ''}`} />
            <span>
              {isProcessingAI
                ? (isAr ? 'جاري المطابقة الذكية...' : 'Running AI Matching...')
                : (isAr ? 'تشغيل المطابقة الآلية' : 'Run Auto-Reconcile')}
            </span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'reconciliation'
              ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{isAr ? 'المطابقة والتسوية البنكية' : 'Bank Reconciliation'}</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-900 text-zinc-300">
            {bankTransactions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('accounts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'accounts'
              ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>{isAr ? 'حسابات الشركة البنكية' : 'Company Bank Accounts'}</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#D4AF37]/20 text-[#f5d97f] font-mono">
            {companyBankAccounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('batches')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'batches'
              ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>{isAr ? 'سجل الكشوفات المستوردة' : 'Import Batches'}</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-900 text-zinc-300">
            {bankBatches.length}
          </span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: BANK RECONCILIATION */}
      {/* ======================================================== */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          {/* KPI Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-zinc-400">{isAr ? 'إجمالي المعاملات البنكية' : 'Total Transactions'}</p>
                <FileText className="w-4 h-4 text-zinc-500" />
              </div>
              <h3 className="text-xl font-bold text-zinc-100 font-display mt-2">{bankTransactions.length} {isAr ? 'معاملة' : 'Txns'}</h3>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-zinc-400">{isAr ? 'تمت المطابقة والترحيل' : 'Reconciled & Posted'}</p>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-emerald-400 font-display mt-2">{reconciledCount} {isAr ? 'معاملة' : 'Posted'}</h3>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-zinc-400">{isAr ? 'بانتظار المراجعة' : 'Pending Review'}</p>
                <AlertCircle className="w-4 h-4 text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-amber-400 font-display mt-2">{bankTransactions.length - reconciledCount} {isAr ? 'معاملة' : 'Pending'}</h3>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-zinc-400">{isAr ? 'إجمالي المقبوضات' : 'Total Inflow (Credits)'}</p>
                <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-emerald-400 font-mono mt-2">+{(totalCreditSum || 0).toLocaleString()} <span className="text-xs font-normal text-zinc-400">{isAr ? 'د.إ' : 'AED'}</span></h3>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-zinc-400">{isAr ? 'نسبة المطابقة الآلية' : 'Automated Match Rate'}</p>
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <h3 className="text-xl font-bold text-[#f5d97f] font-display mt-2">{matchRate}%</h3>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-zinc-900/50 p-3 rounded-2xl border border-zinc-800">
            {/* Filter Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filter === 'all' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isAr ? 'الكل' : 'All'} ({bankTransactions.length})
              </button>
              <button
                onClick={() => setFilter('unmatched')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filter === 'unmatched' ? 'bg-zinc-800 text-amber-300 border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isAr ? 'تحتاج مراجعة' : 'Requires Review'} ({bankTransactions.length - reconciledCount})
              </button>
              <button
                onClick={() => setFilter('reconciled')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filter === 'reconciled' ? 'bg-zinc-800 text-emerald-300 border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isAr ? 'تمت المطابقة' : 'Reconciled'} ({reconciledCount})
              </button>
              <button
                onClick={() => setFilter('credits')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filter === 'credits' ? 'bg-zinc-800 text-emerald-300 border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isAr ? 'مقبوضات (+)' : 'Credits (+)'}
              </button>
              <button
                onClick={() => setFilter('debits')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filter === 'debits' ? 'bg-zinc-800 text-rose-300 border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isAr ? 'مدفوعات (-)' : 'Debits (-)'}
              </button>
            </div>

            {/* Bank selector & Search input */}
            <div className="flex items-center gap-2">
              <select
                value={selectedBankFilter}
                onChange={e => setSelectedBankFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs focus:outline-none focus:border-[#D4AF37]"
              >
                <option value="all">{isAr ? 'جميع الحسابات البنكية' : 'All Bank Accounts'}</option>
                {companyBankAccounts.map(a => (
                  <option key={a.id} value={a.bankName}>
                    {isAr && a.bankNameAr ? a.bankNameAr : a.bankName} ({a.currency})
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث بالمرجع أو الوصف أو اسم العميل...' : 'Search ref, description, customer...'}
                className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs w-56 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          {/* Transactions Table */}
          <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400">
                    <th className="p-4 text-start font-medium">{isAr ? 'تاريخ المعاملة' : 'Txn Date'}</th>
                    <th className="p-4 text-start font-medium">{isAr ? 'وصف الكشف البنكي' : 'Statement Description'}</th>
                    <th className="p-4 text-start font-medium">{isAr ? 'مرجع البنك' : 'Bank Reference'}</th>
                    <th className="p-4 text-end font-medium">{isAr ? 'المبلغ' : 'Amount'}</th>
                    <th className="p-4 text-start font-medium">{isAr ? 'مطابقة الذكاء الاصطناعي والعميل' : 'AI Match & Customer'}</th>
                    <th className="p-4 text-center font-medium">{isAr ? 'نسبة الثقة' : 'Confidence'}</th>
                    <th className="p-4 text-center font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="p-4 text-end font-medium">{isAr ? 'إجراء التسوية' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {filteredTxns.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-zinc-500">
                        <div className="max-w-md mx-auto space-y-3">
                          <FileSpreadsheet className="w-10 h-10 text-zinc-600 mx-auto" />
                          <p className="text-zinc-300 font-semibold">
                            {isAr ? 'لا توجد معاملات مطابقة للشروط' : 'No transactions matching filters'}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {isAr
                              ? 'قم برفع كشف حساب حقيقي من جهازك (CSV أو Excel) لبدء التسوية والمطابقة الآلية.'
                              : 'Upload a real bank statement file from your computer to begin automated ledger reconciliation.'}
                          </p>
                          <button
                            onClick={() => {
                              setParsedData(null);
                              setSelectedFile(null);
                              setImportModalOpen(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/40 text-xs font-semibold hover:bg-[#D4AF37]/25 transition-all"
                          >
                            <UploadCloud className="w-4 h-4" />
                            <span>{isAr ? 'استيراد كشف حساب حقيقي الآن' : 'Import Statement Now'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredTxns.map(txn => {
                      const amount = txn.credit > 0 ? txn.credit : txn.debit;
                      const isCredit = txn.credit > 0;
                      return (
                        <tr key={txn.id} className="hover:bg-zinc-900/40 transition-colors">
                          <td className="p-4 whitespace-nowrap text-zinc-400 font-mono">{txn.date}</td>
                          <td className="p-4 max-w-sm">
                            <p className="font-mono text-zinc-200 truncate">{txn.description}</p>
                            <p className="text-[10px] text-zinc-500 font-sans mt-0.5">{getBankName(txn.batchId)}</p>
                          </td>
                          <td className="p-4 font-mono text-[11px] text-zinc-400">{txn.reference}</td>
                          <td className={`p-4 text-end font-mono font-bold whitespace-nowrap ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isCredit ? '+' : '-'}{(amount || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}
                          </td>
                          <td className="p-4 max-w-xs">
                            {txn.suggestedMatch?.customerName ? (
                              <div className="space-y-0.5">
                                <p className="font-semibold text-zinc-100">{txn.suggestedMatch.customerName}</p>
                                {txn.suggestedMatch.invoiceId && (
                                  <p className="text-[10px] text-[#f5d97f] font-mono">
                                    {isAr ? 'فاتورة مستحقة:' : 'Invoice:'} {txn.suggestedMatch.invoiceId}
                                  </p>
                                )}
                                {txn.suggestedMatch.contractId && (
                                  <p className="text-[10px] text-sky-400 font-mono">
                                    {isAr ? 'عقد تأجير:' : 'Contract:'} {txn.suggestedMatch.contractId}
                                  </p>
                                )}
                                <p className="text-[10px] text-zinc-500 line-clamp-1">
                                  {isAr && txn.suggestedMatch.rationaleAr ? txn.suggestedMatch.rationaleAr : txn.suggestedMatch.rationale}
                                </p>
                              </div>
                            ) : (
                              <span className="text-zinc-500 italic text-[11px]">{isAr ? 'لا توجد مطابقة بعد' : 'Unmatched'}</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            {txn.suggestedMatch?.confidence ? (
                              <AiConfidenceBadge score={txn.suggestedMatch.confidence} />
                            ) : (
                              <span className="text-zinc-500 text-[10px]">—</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <Badge variant={txn.status === 'reconciled' ? 'emerald' : txn.status === 'suggested_match' ? 'amber' : 'zinc'} size="sm">
                              {getStatusLabel(txn.status || 'pending')}
                            </Badge>
                          </td>
                          <td className="p-4 text-end whitespace-nowrap">
                            {txn.status !== 'reconciled' ? (
                              <button
                                onClick={() => handleConfirmMatch(txn.id, txn.suggestedMatch?.invoiceId)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-semibold transition-all shadow-sm"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{isAr ? 'تأكيد وترحيل' : 'Confirm & Post'}</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-emerald-400 inline-flex items-center gap-1 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{isAr ? 'مسوّى ومرحّل' : 'Settled'}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: COMPANY BANK ACCOUNTS */}
      {/* ======================================================== */}
      {activeTab === 'accounts' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-zinc-100">
                {isAr ? 'الحسابات البنكية الرسمية المسجلة للشركة' : 'Official Corporate Bank Accounts'}
              </h3>
              <p className="text-xs text-zinc-400">
                {isAr
                  ? 'الحسابات المعتمدة لاستقبال تحويلات العملاء والربط مع كشوفات الحساب البنكية'
                  : 'Approved accounts for receiving client wire transfers and reconciling statements'}
              </p>
            </div>

            <button
              onClick={() => {
                setAccountToEdit(null);
                setAccountModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة حساب بنكي جديد' : 'Add Bank Account'}</span>
            </button>
          </div>

          {/* Bank Account Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {companyBankAccounts.length === 0 ? (
              <div className="col-span-full p-10 text-center bg-zinc-900/50 rounded-3xl border border-zinc-800 text-zinc-400 space-y-3">
                <Building2 className="w-12 h-12 text-zinc-600 mx-auto" />
                <p className="text-zinc-200 font-semibold">{isAr ? 'لم يتم إضافة حسابات بنكية بعد' : 'No bank accounts registered yet'}</p>
                <p className="text-xs text-zinc-500">{isAr ? 'أضف بيانات الحساب البنكي الأول لشركتك (رقم الحساب، الآيبان، اسم البنك)' : 'Add your company’s first bank account details (account number, IBAN, bank name)'}</p>
                <button
                  onClick={() => {
                    setAccountToEdit(null);
                    setAccountModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold text-xs hover:brightness-110"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAr ? 'إضافة الحساب الآن' : 'Add Account Now'}</span>
                </button>
              </div>
            ) : (
              companyBankAccounts.map(account => (
                <div
                  key={account.id}
                  className={`p-5 rounded-3xl bg-zinc-900/90 border transition-all relative overflow-hidden flex flex-col justify-between ${
                    account.isPrimary ? 'border-[#D4AF37]/60 shadow-lg shadow-[#D4AF37]/5 ring-1 ring-[#D4AF37]/30' : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* Decorative background glow */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/5 rounded-full blur-2xl pointer-events-none" />

                  <div>
                    {/* Top Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-[#D4AF37] shadow-inner">
                          <Landmark className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-zinc-100 text-sm">
                            {isAr && account.bankNameAr ? account.bankNameAr : account.bankName}
                          </h4>
                          <p className="text-[11px] text-zinc-400">
                            {isAr && account.accountNameAr ? account.accountNameAr : account.accountName}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {account.isPrimary && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40">
                            {isAr ? 'رئيسي' : 'Primary'}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300">
                          {account.currency || 'AED'}
                        </span>
                      </div>
                    </div>

                    {/* Account Number & IBAN */}
                    <div className="space-y-2.5 my-4 bg-zinc-950/70 p-3.5 rounded-2xl border border-zinc-800/80">
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase font-semibold block mb-0.5">
                          {isAr ? 'رقم الحساب' : 'Account Number'}
                        </span>
                        <p className="font-mono text-zinc-200 text-xs font-semibold tracking-wider">
                          {account.accountNumber}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-zinc-500 uppercase font-semibold block mb-0.5">
                            {isAr ? 'رقم الآيبان (IBAN)' : 'IBAN'}
                          </span>
                          <button
                            onClick={() => handleCopyIban(account.iban, account.id)}
                            className="text-[10px] text-[#f5d97f] hover:underline flex items-center gap-1"
                          >
                            {copiedIbanId === account.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedIbanId === account.id ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ' : 'Copy')}</span>
                          </button>
                        </div>
                        <p className="font-mono text-[#f5d97f] text-xs font-bold tracking-wide break-all select-all">
                          {account.iban}
                        </p>
                      </div>

                      {account.swiftBic && (
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
                          <span className="text-[10px] text-zinc-500 uppercase font-semibold">
                            {isAr ? 'رمز السويفت (SWIFT)' : 'SWIFT / BIC'}
                          </span>
                          <span className="font-mono text-xs text-zinc-300 font-bold">{account.swiftBic}</span>
                        </div>
                      )}
                    </div>

                    {/* Branch & Notes */}
                    {(account.branch || account.notes) && (
                      <div className="text-[11px] text-zinc-400 space-y-1 mb-4">
                        {account.branch && (
                          <p>
                            <span className="text-zinc-500">{isAr ? 'الفرع:' : 'Branch:'}</span> {account.branch}
                          </p>
                        )}
                        {account.notes && (
                          <p className="text-zinc-500 italic line-clamp-2">{account.notes}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">{isAr ? 'الرصيد الدفتري' : 'Ledger Balance'}</span>
                      <span className="text-xs font-mono font-bold text-zinc-200">
                        {(account.currentBalance || account.openingBalance || 0).toLocaleString()} {account.currency || 'AED'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setAccountToEdit(account);
                          setAccountModalOpen(true);
                        }}
                        className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
                        title={isAr ? 'تعديل الحساب' : 'Edit Account'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteAccount(account)}
                        className="p-2 rounded-xl bg-zinc-800 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
                        title={isAr ? 'حذف الحساب' : 'Delete Account'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: IMPORT BATCHES HISTORY */}
      {/* ======================================================== */}
      {activeTab === 'batches' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-zinc-100">
                {isAr ? 'سجل ملفات كشوفات الحساب المستوردة' : 'Imported Statement Batches History'}
              </h3>
              <p className="text-xs text-zinc-400">
                {isAr ? 'سجل تفصيلي بكافة ملفات الكشوف البنكية المرفوعة وحالة مطابقتها' : 'Comprehensive history of uploaded statements and match breakdown'}
              </p>
            </div>

            <button
              onClick={() => {
                setParsedData(null);
                setSelectedFile(null);
                setImportModalOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-semibold hover:bg-zinc-700 transition-all"
            >
              <UploadCloud className="w-4 h-4 text-sky-400" />
              <span>{isAr ? 'استيراد كشف جديد' : 'Import New Batch'}</span>
            </button>
          </div>

          <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400">
                    <th className="p-4 text-start font-medium">{isAr ? 'رقم الدفعة' : 'Batch ID'}</th>
                    <th className="p-4 text-start font-medium">{isAr ? 'اسم الملف والبنك' : 'File & Bank Name'}</th>
                    <th className="p-4 text-start font-medium">{isAr ? 'رقم الحساب' : 'Account Number'}</th>
                    <th className="p-4 text-start font-medium">{isAr ? 'الفترة' : 'Period'}</th>
                    <th className="p-4 text-center font-medium">{isAr ? 'إجمالي المعاملات' : 'Total Items'}</th>
                    <th className="p-4 text-center font-medium">{isAr ? 'تمت المطابقة' : 'Matched'}</th>
                    <th className="p-4 text-center font-medium">{isAr ? 'غير مطابق' : 'Unmatched'}</th>
                    <th className="p-4 text-end font-medium">{isAr ? 'تاريخ الاستيراد' : 'Import Date'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {bankBatches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-zinc-500">
                        {isAr ? 'لا توجد دفعات كشوف حساب مستوردة بعد.' : 'No imported statement batches yet.'}
                      </td>
                    </tr>
                  ) : (
                    bankBatches.map(batch => (
                      <tr key={batch.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="p-4 font-mono text-zinc-300 font-semibold">{batch.id}</td>
                        <td className="p-4">
                          <p className="font-semibold text-zinc-100">{batch.fileName}</p>
                          <p className="text-[10px] text-[#f5d97f]">{batch.bankName}</p>
                        </td>
                        <td className="p-4 font-mono text-zinc-400">{batch.accountNumber || '—'}</td>
                        <td className="p-4 text-zinc-400">{batch.statementPeriod || '—'}</td>
                        <td className="p-4 text-center font-mono font-bold text-zinc-200">{batch.totalTransactions}</td>
                        <td className="p-4 text-center font-mono font-bold text-emerald-400">{batch.matchedCount}</td>
                        <td className="p-4 text-center font-mono font-bold text-amber-400">{batch.unmatchedCount}</td>
                        <td className="p-4 text-end text-zinc-400 font-mono">
                          {batch.uploadedAt ? new Date(batch.uploadedAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* REAL BANK STATEMENT IMPORT MODAL (CSV / EXCEL) */}
      {/* ======================================================== */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => {
          if (!isUploading) {
            setImportModalOpen(false);
            setSelectedFile(null);
            setParsedData(null);
            setParseError(null);
          }
        }}
        title={isAr ? 'استيراد كشف حساب بنكي حقيقي (CSV / Excel)' : 'Import Real Bank Statement (CSV / Excel)'}
        subtitle={
          isAr
            ? 'ارفع ملف كشف الحساب الفعلي الصادر من البنك لتحليله ومطابقة التحويلات آلياً'
            : 'Upload the actual statement file issued by your bank to extract and auto-reconcile transactions'
        }
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs">
          {parseError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <p className="font-semibold">{isAr ? 'خطأ في معالجة الملف' : 'Statement Parsing Error'}</p>
                <p className="text-[11px] text-rose-300/80 mt-0.5">{parseError}</p>
              </div>
            </div>
          )}

          {/* Step 1: Select Corporate Bank Account */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                {isAr ? 'اختر حساب الشركة البنكي المستهدف' : 'Target Corporate Account'}
              </label>
              <select
                value={selectedAccountId}
                onChange={e => {
                  setSelectedAccountId(e.target.value);
                  const acc = companyBankAccounts.find(a => a.id === e.target.value);
                  if (acc) {
                    setCustomBankName(acc.bankName);
                    setCustomAccountNumber(acc.iban || acc.accountNumber);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-semibold focus:outline-none focus:border-[#D4AF37]"
              >
                <option value="">{isAr ? '-- اختر من حسابات الشركة المعتمدة --' : '-- Pick from registered company accounts --'}</option>
                {companyBankAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {isAr && a.bankNameAr ? a.bankNameAr : a.bankName} - {a.accountNumber} ({a.currency})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                {isAr ? 'الفترة الزمنية لكشف الحساب' : 'Statement Period'}
              </label>
              <input
                type="text"
                value={statementPeriod}
                onChange={e => setStatementPeriod(e.target.value)}
                placeholder={isAr ? 'مثال: أغسطس 2026 أو 2026-08-01 إلى 2026-08-31' : 'e.g. August 2026 or 2026-08-01 to 2026-08-31'}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          {/* Fallback Custom Bank Inputs if no registered account selected */}
          {!selectedAccountId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-400 mb-1">
                  {isAr ? 'اسم البنك (يدوي)' : 'Bank Name (Manual)'}
                </label>
                <input
                  type="text"
                  value={customBankName}
                  onChange={e => setCustomBankName(e.target.value)}
                  placeholder="Emirates NBD / FAB / ADCB"
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-400 mb-1">
                  {isAr ? 'رقم الحساب / الآيبان (يدوي)' : 'Account No / IBAN (Manual)'}
                </label>
                <input
                  type="text"
                  value={customAccountNumber}
                  onChange={e => setCustomAccountNumber(e.target.value)}
                  placeholder="AE09 0260 0012 3456 7890 01"
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={e => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileChange(e.target.files[0]);
              }
            }}
            accept=".csv,.xlsx,.xls,.tsv,.txt"
            className="hidden"
          />

          {/* Drag & Drop File Zone */}
          {!parsedData ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 hover:border-[#D4AF37] rounded-3xl p-8 text-center space-y-3 bg-zinc-950/60 hover:bg-zinc-900/50 cursor-pointer transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mx-auto text-[#D4AF37] group-hover:scale-110 transition-transform">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <p className="font-bold text-zinc-100 text-sm">
                  {isAr ? 'انقر لاختيار ملف كشف الحساب أو اسحبه هنا' : 'Click to browse or drag & drop bank statement file'}
                </p>
                <p className="text-zinc-400 text-xs mt-1">
                  {isAr
                    ? 'يدعم ملفات إكسل وCSV المصدرة من كافة البنوك الإماراتية والعالمية (.xlsx, .xls, .csv)'
                    : 'Supports Excel and CSV exports from all UAE and international banks (.xlsx, .xls, .csv)'}
                </p>
              </div>

              {isParsing && (
                <div className="flex items-center justify-center gap-2 text-[#f5d97f] font-semibold text-xs pt-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isAr ? 'جاري قراءة وتحليل بيانات الملف...' : 'Parsing statement file...'}</span>
                </div>
              )}
            </div>
          ) : (
            /* Parsed Summary Box */
            <div className="p-4 rounded-3xl bg-zinc-950 border border-emerald-500/40 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-100 text-xs font-mono">{parsedData.fileName}</p>
                    <p className="text-[11px] text-emerald-400 font-semibold">
                      {isAr
                        ? `تم استخراج ${parsedData.totalTransactions} معاملة بنكية بنجاح`
                        : `Successfully extracted ${parsedData.totalTransactions} transactions`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setParsedData(null);
                    setSelectedFile(null);
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                >
                  {isAr ? 'تغيير الملف' : 'Change File'}
                </button>
              </div>

              {/* Stats pill */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-zinc-900/80 p-3 rounded-2xl border border-zinc-800 text-center">
                <div>
                  <span className="text-[10px] text-zinc-500 block">{isAr ? 'عدد المعاملات' : 'Transactions'}</span>
                  <span className="font-bold font-mono text-zinc-100">{parsedData.totalTransactions}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">{isAr ? 'إجمالي المقبوضات (+)' : 'Total Credits (+)'}</span>
                  <span className="font-bold font-mono text-emerald-400">+{parsedData.totalCredit.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">{isAr ? 'إجمالي المصروفات (-)' : 'Total Debits (-)'}</span>
                  <span className="font-bold font-mono text-rose-400">-{parsedData.totalDebit.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">{isAr ? 'الفترة المستخرجة' : 'Date Range'}</span>
                  <span className="font-semibold font-mono text-[11px] text-zinc-300">
                    {parsedData.startDate || '—'}
                  </span>
                </div>
              </div>

              {/* First 3 Rows Preview */}
              <div>
                <p className="text-[11px] font-semibold text-zinc-400 mb-1.5 flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{isAr ? 'معاينة أولى المعاملات المستخرجة من الكشف:' : 'Preview of first parsed rows:'}</span>
                </p>
                <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-zinc-950 text-zinc-500 border-b border-zinc-800">
                        <th className="p-2 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="p-2 text-start">{isAr ? 'البيان' : 'Description'}</th>
                        <th className="p-2 text-start">{isAr ? 'المرجع' : 'Ref'}</th>
                        <th className="p-2 text-end">{isAr ? 'المبلغ' : 'Amount'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                      {parsedData.transactions.slice(0, 4).map((t, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-mono text-zinc-400">{t.date}</td>
                          <td className="p-2 font-mono truncate max-w-xs">{t.description}</td>
                          <td className="p-2 font-mono text-zinc-400">{t.reference}</td>
                          <td className={`p-2 text-end font-mono font-bold ${t.credit > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.credit > 0 ? `+${t.credit}` : `-${t.debit}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => {
                setImportModalOpen(false);
                setSelectedFile(null);
                setParsedData(null);
              }}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-300 hover:bg-zinc-800 font-semibold transition-all"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>

            <button
              type="button"
              disabled={!parsedData || isUploading}
              onClick={handleConfirmImport}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
            >
              {isUploading ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isAr ? 'جاري الاستيراد والتسوية...' : 'Importing & Reconciling...'}</span>
                </div>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {isAr
                      ? `تأكيد واستيراد ${parsedData ? parsedData.totalTransactions : 0} معاملة حقيقية`
                      : `Confirm & Import ${parsedData ? parsedData.totalTransactions : 0} Transactions`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Company Bank Account Create / Edit Modal */}
      <CompanyBankAccountModal
        isOpen={accountModalOpen}
        onClose={() => {
          setAccountModalOpen(false);
          setAccountToEdit(null);
        }}
        accountToEdit={accountToEdit}
      />
    </div>
  );
};
