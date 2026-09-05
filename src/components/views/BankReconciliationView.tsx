import React, { useState } from 'react';
import {
  Landmark, Sparkles, UploadCloud, CheckCircle2,
  AlertCircle, ArrowRight, RefreshCw, FileSpreadsheet,
  HelpCircle, DollarSign, ShieldCheck, Tag, History, Copy
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { AiConfidenceBadge } from '../common/AiConfidenceBadge';
import { Modal } from '../common/Modal';
import { RECEIVED_AMOUNT_CLASSIFICATIONS, type ReceivedAmountClassification, type BankTransaction, type BankImportBatch, type BankMatchClassification } from '../../types';

// FIN-002 labels -- every classification must be a real, human choice, so
// the dropdown never has a pre-selected value; 'unclassified' is listed
// like any other option, not hidden as an implicit default.
const CLASSIFICATION_LABELS: Record<ReceivedAmountClassification, { en: string; ar: string }> = {
  settlement: { en: 'Settlement (pays down an existing invoice)', ar: 'تسوية (سداد فاتورة قائمة)' },
  advance_payment: { en: 'Advance payment (no invoice yet)', ar: 'دفعة مقدمة (لا توجد فاتورة بعد)' },
  security_deposit: { en: 'Security deposit', ar: 'وديعة تأمين' },
  credit_balance: { en: 'Credit balance for the customer', ar: 'رصيد دائن للعميل' },
  settlement_adjustment: { en: 'Settlement adjustment / correction', ar: 'تسوية تصحيحية' },
  other_approved: { en: 'Other (approved)', ar: 'أخرى (معتمدة)' },
  unclassified: { en: 'Unclassified -- genuinely unknown', ar: 'غير مصنّف -- غير معروف فعلياً' }
};

// Bank Reconciliation matching-outcome labels (distinct from the FIN-002
// classification above): the WHY behind comparing a bank statement line to
// what's already recorded in the CRM. Computed server-side by
// classifyBankRow() in src/server/bankReconciliation.ts -- never guessed
// here, and never itself a reconcile/approval action.
const MATCH_LABELS: Record<BankMatchClassification, { en: string; ar: string; badge: 'emerald' | 'amber' | 'sky' | 'rose' | 'zinc' }> = {
  matched: { en: 'Matched', ar: 'مطابق', badge: 'emerald' },
  needs_review: { en: 'Needs Review', ar: 'يحتاج مراجعة', badge: 'amber' },
  unrecorded_transfer: { en: 'Unrecorded Transfer', ar: 'تحويل غير مسجل', badge: 'sky' },
  amount_mismatch: { en: 'Amount Mismatch', ar: 'اختلاف مبلغ', badge: 'rose' },
  duplicate_transaction: { en: 'Duplicate Transaction', ar: 'عملية مكررة', badge: 'rose' }
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const BankReconciliationView: React.FC = () => {
  const { language, t } = useLanguage();
  const {
    bankTransactions, bankBatches, runAutoReconciliation,
    reconcileBankTransaction, reclassifyBankTransaction, previewBankImport, confirmBankImport
  } = useCRM();

  const [filter, setFilter] = useState<'all' | 'reconciled' | 'unmatched'>('all');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // FIN-002: reconciling now requires an explicit classification choice --
  // a confirmation modal, not a one-click action, so nothing gets silently
  // guessed.
  const [confirmTxn, setConfirmTxn] = useState<BankTransaction | null>(null);
  const [confirmClassification, setConfirmClassification] = useState<ReceivedAmountClassification | ''>('');
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const [reclassifyTxn, setReclassifyTxn] = useState<BankTransaction | null>(null);
  const [reclassifyClassification, setReclassifyClassification] = useState<ReceivedAmountClassification | ''>('');
  const [reclassifyReason, setReclassifyReason] = useState('');
  const [isReclassifying, setIsReclassifying] = useState(false);

  // Which bank account this import is for -- previously hardcoded to
  // "Emirates NBD" everywhere with no way to say otherwise. The server
  // already stores bankName/accountNumber per import batch; this was just
  // never exposed as real fields in the UI.
  const [importBankName, setImportBankName] = useState('Emirates NBD');
  const [importAccountNumber, setImportAccountNumber] = useState('');
  const [importFile, setImportFile] = useState<{ fileName: string; fileBase64: string } | null>(null);
  const [importPreview, setImportPreview] = useState<{ batch: BankImportBatch; transactions: BankTransaction[]; warnings: string[] } | null>(null);
  const [importError, setImportError] = useState('');

  const resetImportModal = () => {
    setImportModalOpen(false);
    setImportFile(null);
    setImportPreview(null);
    setImportError('');
  };

  const handleRunReconciliation = async () => {
    setIsProcessingAI(true);
    try {
      await runAutoReconciliation();
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleFileSelected = async (file: File) => {
    setImportError('');
    setImportPreview(null);
    setIsPreviewing(true);
    try {
      const fileBase64 = await readFileAsBase64(file);
      setImportFile({ fileName: file.name, fileBase64 });
      const preview = await previewBankImport({
        fileName: file.name,
        fileBase64,
        bankName: importBankName || undefined,
        accountNumber: importAccountNumber || undefined
      });
      setImportPreview(preview);
    } catch (err: any) {
      setImportError(err?.message || 'Failed to read/parse this file.');
      setImportFile(null);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    try {
      await confirmBankImport({
        fileName: importFile.fileName,
        fileBase64: importFile.fileBase64,
        bankName: importBankName || undefined,
        accountNumber: importAccountNumber || undefined
      });
      resetImportModal();
    } finally {
      setIsImporting(false);
    }
  };

  const handleSubmitConfirm = async () => {
    if (!confirmTxn || !confirmClassification) return;
    if (confirmTxn.matchClassification === 'duplicate_transaction' && !duplicateOverrideReason.trim()) return;
    setIsConfirming(true);
    try {
      await reconcileBankTransaction(
        confirmTxn.id, 'invoice', confirmTxn.suggestedMatch?.invoiceId || '', confirmClassification,
        confirmTxn.matchClassification === 'duplicate_transaction' ? duplicateOverrideReason.trim() : undefined
      );
      setConfirmTxn(null);
      setConfirmClassification('');
      setDuplicateOverrideReason('');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSubmitReclassify = async () => {
    if (!reclassifyTxn || !reclassifyClassification || !reclassifyReason.trim()) return;
    setIsReclassifying(true);
    try {
      await reclassifyBankTransaction(reclassifyTxn.id, reclassifyClassification, reclassifyReason.trim());
      setReclassifyTxn(null);
      setReclassifyClassification('');
      setReclassifyReason('');
    } finally {
      setIsReclassifying(false);
    }
  };

  // The backend's authoritative "is this done" signal is the `reconciled`
  // boolean -- it sets status to 'approved' on a successful reconcile, never
  // the literal string 'reconciled'. These checks previously compared
  // against that literal, so a transaction that WAS reconciled never
  // stopped showing "Confirm & Post" or counted toward "Reconciled" here.
  // Found via real-browser verification while wiring FIN-002 in.
  const filteredTxns = bankTransactions.filter(t => {
    if (filter === 'reconciled') return t.reconciled;
    if (filter === 'unmatched') return !t.reconciled;
    return true;
  });

  const reconciledCount = bankTransactions.filter(t => t.reconciled).length;
  const matchRate = bankTransactions.length > 0
    ? Math.round((reconciledCount / bankTransactions.length) * 100)
    : 100;

  const getBankName = (batchId: string) =>
    bankBatches.find(b => b.id === batchId)?.bankName || (language === 'ar' ? 'حساب غير محدد' : 'Unspecified account');

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'المطابقة البنكية الذكية والتسوية المالية' : 'AI Bank Statement Reconciliation'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'استيراد كشوفات أي حساب بنكي مع المطابقة الآلية الذكية بالذكاء الاصطناعي' : 'Import statements from any of your bank accounts, with AI fuzzy matching & automated ledger reconciliation'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 text-xs font-semibold hover:bg-zinc-800 transition-all"
          >
            <UploadCloud className="w-4 h-4 text-sky-400" />
            <span>{language === 'ar' ? 'استيراد كشف حساب' : 'Import Statement'}</span>
          </button>

          <button
            onClick={handleRunReconciliation}
            disabled={isProcessingAI}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isProcessingAI ? 'animate-spin' : ''}`} />
            <span>{isProcessingAI ? (language === 'ar' ? 'جاري التشغيل...' : 'Running AI Matching...') : (language === 'ar' ? 'تشغيل المطابقة الذكية' : 'Run AI Auto-Reconcile')}</span>
          </button>
        </div>
      </div>

      {/* KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <p className="text-[10px] uppercase font-bold text-zinc-400">{language === 'ar' ? 'إجمالي المعاملات البنكية' : 'Total Bank Transactions'}</p>
          <h3 className="text-xl font-bold text-zinc-100 font-display mt-1">{bankTransactions.length} {language === 'ar' ? 'عنصر' : 'Items'}</h3>
        </div>
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <p className="text-[10px] uppercase font-bold text-zinc-400">{language === 'ar' ? 'تمت المطابقة والترحيل' : 'Reconciled & Posted'}</p>
          <h3 className="text-xl font-bold text-emerald-400 font-display mt-1">{reconciledCount} {language === 'ar' ? 'معاملة' : 'Transactions'}</h3>
        </div>
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <p className="text-[10px] uppercase font-bold text-zinc-400">{language === 'ar' ? 'بانتظار المراجعة' : 'Pending Review'}</p>
          <h3 className="text-xl font-bold text-amber-400 font-display mt-1">{bankTransactions.length - reconciledCount} {language === 'ar' ? 'عنصر' : 'Items'}</h3>
        </div>
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <p className="text-[10px] uppercase font-bold text-zinc-400">{language === 'ar' ? 'نسبة المطابقة الآلية' : 'Automated Match Rate'}</p>
          <h3 className="text-xl font-bold text-[#f5d97f] font-display mt-1">{matchRate}% {language === 'ar' ? 'تمت المطابقة' : 'Matched'}</h3>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
            filter === 'all' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {language === 'ar' ? 'كل العناصر' : 'All Feed Items'} ({bankTransactions.length})
        </button>
        <button
          onClick={() => setFilter('unmatched')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
            filter === 'unmatched' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {language === 'ar' ? 'تحتاج مراجعة' : 'Requires Attention'} ({bankTransactions.length - reconciledCount})
        </button>
        <button
          onClick={() => setFilter('reconciled')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
            filter === 'reconciled' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {language === 'ar' ? 'تمت المطابقة' : 'Reconciled'} ({reconciledCount})
        </button>
      </div>

      {/* Reconciliation Table */}
      <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start min-w-[1040px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                <th className="p-4 text-start font-medium">{language === 'ar' ? 'تاريخ المعاملة' : 'Txn Date'}</th>
                <th className="p-4 text-start font-medium">{language === 'ar' ? 'وصف الكشف البنكي' : 'Bank Statement Description'}</th>
                <th className="p-4 text-start font-medium">{language === 'ar' ? 'مرجع البنك' : 'Bank Ref'}</th>
                <th className="p-4 text-end font-medium">{language === 'ar' ? 'المبلغ المستلم' : 'Amount Received'}</th>
                <th className="p-4 text-start font-medium">{language === 'ar' ? 'مطابقة الذكاء الاصطناعي والعميل' : 'AI Match & Customer'}</th>
                <th className="p-4 text-center font-medium">{language === 'ar' ? 'نسبة الثقة' : 'AI Confidence'}</th>
                <th className="p-4 text-center font-medium">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="p-4 text-end font-medium">{language === 'ar' ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {filteredTxns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
                    {language === 'ar' ? 'لا توجد معاملات بنكية بعد -- استورد كشف حساب للبدء.' : 'No bank transactions yet -- import a statement to get started.'}
                  </td>
                </tr>
              ) : filteredTxns.map(txn => {
                const amount = txn.credit > 0 ? txn.credit : txn.debit;
                const isCredit = txn.credit > 0;
                return (
                  <tr key={txn.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-4 whitespace-nowrap text-zinc-400">{txn.date}</td>
                    <td className="p-4 max-w-xs">
                      <p className="font-mono text-zinc-200 truncate">{txn.description}</p>
                      <p className="text-[10px] text-zinc-500">{getBankName(txn.batchId)}</p>
                    </td>
                    <td className="p-4 font-mono text-[11px] text-zinc-400">{txn.reference}</td>
                    <td className={`p-4 text-end font-mono font-bold ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isCredit ? '+' : '-'}{(amount || 0).toLocaleString()} AED
                    </td>
                    <td className="p-4">
                      {txn.suggestedMatch?.customerName ? (
                        <div>
                          <p className="font-semibold text-zinc-100">{txn.suggestedMatch.customerName}</p>
                          <p className="text-[10px] text-zinc-400 font-mono">
                            {language === 'ar' ? 'فاتورة:' : 'Invoice:'} {txn.suggestedMatch.invoiceId || (language === 'ar' ? 'تخصيص تلقائي' : 'Auto-allocated')}
                          </p>
                        </div>
                      ) : (
                        <span className="text-zinc-500 italic">{language === 'ar' ? 'لا توجد مطابقة' : 'No match identified'}</span>
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
                      <div className="flex flex-col items-center gap-1">
                        {!txn.reconciled && txn.matchClassification && (
                          <span title={txn.matchReasonAr && txn.matchReason ? (language === 'ar' ? txn.matchReasonAr : txn.matchReason) : undefined}>
                            <Badge variant={MATCH_LABELS[txn.matchClassification].badge} size="sm">
                              {MATCH_LABELS[txn.matchClassification][language === 'ar' ? 'ar' : 'en']}
                            </Badge>
                          </span>
                        )}
                        <Badge variant={txn.reconciled ? 'emerald' : txn.status === 'matched' ? 'amber' : 'zinc'} size="sm">
                          {(txn.status || '').toUpperCase()}
                        </Badge>
                        {txn.reconciled && txn.receivedAmountClassification && (
                          <span
                            title={CLASSIFICATION_LABELS[txn.receivedAmountClassification][language === 'ar' ? 'ar' : 'en']}
                            className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-zinc-400 font-mono"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {txn.receivedAmountClassification.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-end">
                      {!txn.reconciled ? (
                        <button
                          onClick={() => { setConfirmTxn(txn); setConfirmClassification(''); setDuplicateOverrideReason(''); }}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-semibold transition-all shadow-sm ${
                            txn.matchClassification === 'duplicate_transaction'
                              ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {txn.matchClassification === 'duplicate_transaction' ? <Copy className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          <span>{txn.matchClassification === 'duplicate_transaction'
                            ? (language === 'ar' ? 'مراجعة التكرار' : 'Review Duplicate')
                            : (language === 'ar' ? 'تأكيد وترحيل' : 'Confirm & Post')}</span>
                        </button>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[11px] text-zinc-500 flex items-center justify-end gap-1 font-mono">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {language === 'ar' ? 'مسوّى' : 'Settled'}
                          </span>
                          <button
                            onClick={() => { setReclassifyTxn(txn); setReclassifyClassification(txn.receivedAmountClassification || ''); setReclassifyReason(''); }}
                            className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-[#f5d97f] transition-colors"
                          >
                            <History className="w-3 h-3" />
                            <span>{language === 'ar' ? 'إعادة تصنيف' : 'Reclassify'}</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Modal -- real CSV/Excel parsing, preview-then-confirm. Every
          row is classified server-side (classifyBankRow) before anything is
          shown here; nothing is written to Firestore until "Confirm Import"
          is pressed, and even then no Payment/Invoice is ever touched --
          only BankTransaction/BankImportBatch records land, exactly like
          before this rework. */}
      <Modal
        isOpen={importModalOpen}
        onClose={resetImportModal}
        title={language === 'ar' ? 'استيراد كشف حساب بنكي' : 'Import Bank Statement'}
        subtitle={language === 'ar' ? 'حدد الحساب البنكي وارفع الكشف (CSV أو Excel)' : 'Pick the bank account, then upload its CSV or Excel statement'}
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                {language === 'ar' ? 'اسم البنك' : 'Bank Name'}
              </label>
              <input
                type="text"
                value={importBankName}
                onChange={e => setImportBankName(e.target.value)}
                placeholder={language === 'ar' ? 'مثال: بنك الإمارات دبي الوطني' : 'e.g. Emirates NBD'}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/60"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                {language === 'ar' ? 'رقم الحساب / IBAN' : 'Account Number / IBAN'}
              </label>
              <input
                type="text"
                value={importAccountNumber}
                onChange={e => setImportAccountNumber(e.target.value)}
                placeholder="AE09 0260 0012 3456 7890 01"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60"
              />
            </div>
          </div>

          {!importPreview && (
            <div className="border-2 border-dashed border-zinc-800 rounded-2xl p-8 text-center space-y-3 bg-zinc-950/50">
              <FileSpreadsheet className="w-10 h-10 text-[#D4AF37] mx-auto" />
              <div>
                <p className="font-semibold text-zinc-200">{language === 'ar' ? 'اختر كشف الحساب (CSV / Excel)' : 'Choose a bank statement file (CSV / Excel)'}</p>
                <p className="text-zinc-500 text-[11px] mt-0.5">
                  {language === 'ar' ? 'سيتم تحليل الملف ومطابقته آلياً، وستُعرض لك النتيجة للمراجعة قبل أي حفظ.' : 'The file is parsed and matched automatically -- you\'ll review the result below before anything is saved.'}
                </p>
              </div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                disabled={isPreviewing}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
                className="block mx-auto text-[11px] text-zinc-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-[#D4AF37] file:text-zinc-950 hover:file:brightness-110 cursor-pointer"
              />
              {isPreviewing && (
                <p className="text-zinc-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {language === 'ar' ? 'جاري التحليل والمطابقة...' : 'Parsing & matching...'}
                </p>
              )}
              {importError && (
                <p className="text-rose-400 flex items-center justify-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5" /> {importError}
                </p>
              )}
            </div>
          )}

          {importPreview && (
            <div className="space-y-3">
              {importPreview.warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-300 space-y-1">
                  {importPreview.warnings.map((w, i) => <p key={i}>&bull; {w}</p>)}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center">
                  <p className="text-zinc-500 text-[10px] uppercase">{language === 'ar' ? 'إجمالي المعاملات' : 'Total Rows'}</p>
                  <p className="font-bold text-zinc-100 text-lg">{importPreview.transactions.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center">
                  <p className="text-zinc-500 text-[10px] uppercase">{language === 'ar' ? 'مطابق' : 'Matched'}</p>
                  <p className="font-bold text-emerald-400 text-lg">{importPreview.batch.matchedCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center">
                  <p className="text-zinc-500 text-[10px] uppercase">{language === 'ar' ? 'مكرر' : 'Duplicate'}</p>
                  <p className="font-bold text-rose-400 text-lg">{importPreview.batch.duplicateCount}</p>
                </div>
              </div>

              {importPreview.batch.unmatchedCrmPayments && importPreview.batch.unmatchedCrmPayments.length > 0 && (
                <div className="p-3 rounded-xl bg-sky-950/20 border border-sky-500/30 space-y-1.5">
                  <p className="text-sky-300 font-semibold">
                    {language === 'ar' ? `${importPreview.batch.unmatchedCrmPayments.length} دفعة غير موجودة بالبنك` : `${importPreview.batch.unmatchedCrmPayments.length} payment(s) not found in the bank`}
                  </p>
                  {importPreview.batch.unmatchedCrmPayments.slice(0, 5).map(p => (
                    <p key={p.paymentId} className="text-zinc-400 text-[11px]">
                      {p.customerName} &middot; {p.amount.toLocaleString()} AED &middot; {language === 'ar' ? p.reasonAr : p.reasonEn}
                    </p>
                  ))}
                </div>
              )}

              <div className="max-h-64 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800/60">
                {importPreview.transactions.slice(0, 50).map((t, i) => (
                  <div key={i} className="p-2.5 flex items-center justify-between gap-2 text-[11px]">
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-200 truncate font-mono">{t.description || '-'}</p>
                      <p className="text-zinc-500">{t.date} &middot; {(t.credit || t.debit || 0).toLocaleString()} AED</p>
                    </div>
                    {t.matchClassification && (
                      <span title={language === 'ar' ? t.matchReasonAr : t.matchReason}>
                        <Badge variant={MATCH_LABELS[t.matchClassification].badge} size="sm">
                          {MATCH_LABELS[t.matchClassification][language === 'ar' ? 'ar' : 'en']}
                        </Badge>
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setImportFile(null); setImportPreview(null); }}
                  className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
                >
                  {language === 'ar' ? 'اختيار ملف آخر' : 'Choose a Different File'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
                >
                  {isImporting
                    ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                    : (language === 'ar' ? `تأكيد استيراد ${importPreview.transactions.length} معاملة` : `Confirm Import of ${importPreview.transactions.length} Transaction(s)`)}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* FIN-002: Confirm & Post now requires an explicit classification --
          no default is pre-selected, so a reconciler must actually choose. */}
      <Modal
        isOpen={!!confirmTxn}
        onClose={() => { setConfirmTxn(null); setConfirmClassification(''); setDuplicateOverrideReason(''); }}
        title={language === 'ar' ? 'تأكيد المعاملة وتصنيفها' : 'Confirm & Classify Transaction'}
        subtitle={language === 'ar' ? 'كل مبلغ مستلم يجب أن يُصنَّف قبل ترحيله.' : 'Every received amount must be classified before it is posted.'}
        maxWidth="sm"
      >
        {confirmTxn && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-1">
              <p className="font-mono text-zinc-200">{confirmTxn.reference} &middot; +{confirmTxn.credit.toLocaleString()} AED</p>
              <p className="text-zinc-500">{confirmTxn.description}</p>
              {confirmTxn.suggestedMatch?.customerName && (
                <p className="text-zinc-400">{language === 'ar' ? 'العميل المقترح:' : 'Suggested customer:'} {confirmTxn.suggestedMatch.customerName}</p>
              )}
            </div>

            {confirmTxn.matchClassification === 'duplicate_transaction' && (
              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 space-y-2">
                <p className="text-rose-300 font-semibold flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'تبدو هذه عملية مكررة' : 'This looks like a duplicate transaction'}
                </p>
                <p className="text-zinc-400">{language === 'ar' ? confirmTxn.matchReasonAr : confirmTxn.matchReason}</p>
                <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  {language === 'ar' ? 'سبب تجاوز التكرار (إلزامي) *' : 'Reason to override the duplicate flag (required) *'}
                </label>
                <textarea
                  required
                  value={duplicateOverrideReason}
                  onChange={e => setDuplicateOverrideReason(e.target.value)}
                  rows={2}
                  placeholder={language === 'ar' ? 'مثال: عمليتان منفصلتان فعلياً بنفس المبلغ والتاريخ.' : 'e.g. Two genuinely separate transactions with the same amount and date.'}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-rose-500/30 text-zinc-100 text-xs focus:outline-none focus:border-rose-400/60"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                {language === 'ar' ? 'ما طبيعة هذا المبلغ المستلم؟ *' : 'What is this received amount? *'}
              </label>
              <select
                required
                value={confirmClassification}
                onChange={e => setConfirmClassification(e.target.value as ReceivedAmountClassification)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/60"
              >
                <option value="" disabled>{language === 'ar' ? '-- اختر تصنيفاً --' : '-- Select a classification --'}</option>
                {RECEIVED_AMOUNT_CLASSIFICATIONS.map(c => (
                  <option key={c} value={c}>{CLASSIFICATION_LABELS[c][language === 'ar' ? 'ar' : 'en']}</option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-500 mt-1">
                {language === 'ar' ? 'إذا كنت لا تعرف طبيعة المبلغ فعلياً، اختر "غير مصنّف" بدلاً من التخمين.' : 'If you genuinely don’t know what this is, choose "Unclassified" rather than guessing.'}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => { setConfirmTxn(null); setConfirmClassification(''); setDuplicateOverrideReason(''); }}
                className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!confirmClassification || isConfirming || (confirmTxn.matchClassification === 'duplicate_transaction' && !duplicateOverrideReason.trim())}
                onClick={handleSubmitConfirm}
                className="px-5 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold disabled:opacity-50"
              >
                {isConfirming ? (language === 'ar' ? 'جارٍ الترحيل...' : 'Posting...') : (language === 'ar' ? 'تأكيد وترحيل' : 'Confirm & Post')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* FIN-002 reclassification: changes only the classification metadata,
          never the amount -- mandatory reason, visible history preserved
          server-side via classificationHistory. */}
      <Modal
        isOpen={!!reclassifyTxn}
        onClose={() => { setReclassifyTxn(null); setReclassifyClassification(''); setReclassifyReason(''); }}
        title={language === 'ar' ? 'إعادة تصنيف المبلغ المستلم' : 'Reclassify Received Amount'}
        subtitle={language === 'ar' ? 'لا يغيّر هذا المبلغ المسدد أو رصيد الفاتورة -- تصنيف فقط.' : 'This never changes the settled amount or invoice balance -- classification only.'}
        maxWidth="sm"
      >
        {reclassifyTxn && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-1">
              <p className="font-mono text-zinc-200">{reclassifyTxn.reference} &middot; +{reclassifyTxn.credit.toLocaleString()} AED</p>
              <p className="text-zinc-400">
                {language === 'ar' ? 'التصنيف الحالي:' : 'Current classification:'}{' '}
                <span className="font-mono">{(reclassifyTxn.receivedAmountClassification || 'unclassified').replace(/_/g, ' ')}</span>
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                {language === 'ar' ? 'التصنيف الجديد *' : 'New classification *'}
              </label>
              <select
                required
                value={reclassifyClassification}
                onChange={e => setReclassifyClassification(e.target.value as ReceivedAmountClassification)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/60"
              >
                {RECEIVED_AMOUNT_CLASSIFICATIONS.map(c => (
                  <option key={c} value={c}>{CLASSIFICATION_LABELS[c][language === 'ar' ? 'ar' : 'en']}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                {language === 'ar' ? 'سبب إعادة التصنيف *' : 'Reason for reclassification *'}
              </label>
              <textarea
                required
                value={reclassifyReason}
                onChange={e => setReclassifyReason(e.target.value)}
                rows={3}
                placeholder={language === 'ar' ? 'مثال: تبيّن أن المبلغ دفعة مقدمة وليس تسوية فاتورة.' : 'e.g. Turned out to be an advance payment, not an invoice settlement.'}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/60"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => { setReclassifyTxn(null); setReclassifyClassification(''); setReclassifyReason(''); }}
                className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!reclassifyClassification || !reclassifyReason.trim() || isReclassifying}
                onClick={handleSubmitReclassify}
                className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold disabled:opacity-50"
              >
                {isReclassifying ? (language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (language === 'ar' ? 'حفظ إعادة التصنيف' : 'Save Reclassification')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
