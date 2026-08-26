import React, { useState } from 'react';
import {
  Landmark, Sparkles, UploadCloud, CheckCircle2,
  AlertCircle, ArrowRight, RefreshCw, FileSpreadsheet,
  HelpCircle, DollarSign, ShieldCheck
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { AiConfidenceBadge } from '../common/AiConfidenceBadge';
import { Modal } from '../common/Modal';

export const BankReconciliationView: React.FC = () => {
  const { language, t } = useLanguage();
  const {
    bankTransactions, bankBatches, runAutoReconciliation,
    reconcileBankTransaction, uploadBankBatch
  } = useCRM();

  const [filter, setFilter] = useState<'all' | 'reconciled' | 'unmatched'>('all');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Which bank account this import is for -- previously hardcoded to
  // "Emirates NBD" everywhere with no way to say otherwise. The server
  // already stores bankName/accountNumber per import batch; this was just
  // never exposed as real fields in the UI.
  const [importBankName, setImportBankName] = useState('Emirates NBD');
  const [importAccountNumber, setImportAccountNumber] = useState('');

  const handleRunReconciliation = async () => {
    setIsProcessingAI(true);
    try {
      await runAutoReconciliation();
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleImportSample = async () => {
    setIsImporting(true);
    try {
      // No real file-parsing yet (the drag & drop box below is a visual
      // placeholder) -- this generates a realistic sample statement for the
      // bank account you specify, going through the exact same server-side
      // AI-matching pipeline a real parsed statement would use.
      await uploadBankBatch({
        fileName: `${importBankName.replace(/\s+/g, '_')}_statement.csv`,
        bankName: importBankName || 'Emirates NBD',
        accountNumber: importAccountNumber || undefined,
        transactions: []
      });
      setImportModalOpen(false);
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmMatch = async (txnId: string, invoiceId?: string) => {
    await reconcileBankTransaction(txnId, 'invoice', invoiceId || '');
  };

  const filteredTxns = bankTransactions.filter(t => {
    if (filter === 'reconciled') return t.status === 'reconciled';
    if (filter === 'unmatched') return t.status !== 'reconciled';
    return true;
  });

  const reconciledCount = bankTransactions.filter(t => t.status === 'reconciled').length;
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
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === 'all' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {language === 'ar' ? 'كل العناصر' : 'All Feed Items'} ({bankTransactions.length})
        </button>
        <button
          onClick={() => setFilter('unmatched')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === 'unmatched' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {language === 'ar' ? 'تحتاج مراجعة' : 'Requires Attention'} ({bankTransactions.length - reconciledCount})
        </button>
        <button
          onClick={() => setFilter('reconciled')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === 'reconciled' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {language === 'ar' ? 'تمت المطابقة' : 'Reconciled'} ({reconciledCount})
        </button>
      </div>

      {/* Reconciliation Table */}
      <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
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
                      <Badge variant={txn.status === 'reconciled' ? 'emerald' : txn.status === 'matched' ? 'amber' : 'zinc'} size="sm">
                        {(txn.status || '').toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-4 text-end">
                      {txn.status !== 'reconciled' ? (
                        <button
                          onClick={() => handleConfirmMatch(txn.id, txn.suggestedMatch?.invoiceId)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-semibold transition-all shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'تأكيد وترحيل' : 'Confirm & Post'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-zinc-500 flex items-center justify-end gap-1 font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {language === 'ar' ? 'مسوّى' : 'Settled'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title={language === 'ar' ? 'استيراد كشف حساب بنكي' : 'Import Bank Statement'}
        subtitle={language === 'ar' ? 'حدد الحساب البنكي وارفع الكشف (MT940 أو CSV)' : 'Pick the bank account, then upload its MT940 or CSV statement'}
        maxWidth="md"
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

          <div className="border-2 border-dashed border-zinc-800 rounded-2xl p-8 text-center space-y-3 bg-zinc-950/50">
            <FileSpreadsheet className="w-10 h-10 text-[#D4AF37] mx-auto" />
            <div>
              <p className="font-semibold text-zinc-200">{language === 'ar' ? 'اسحب وأفلت كشف الحساب (CSV / Excel)' : 'Drag & drop bank statement CSV / Excel'}</p>
              <p className="text-zinc-500 text-[11px] mt-0.5">
                {language === 'ar' ? 'استيراد الملف نفسه لسه ما اتفعّلش -- الزرار تحت بيولّد كشف تجريبي واقعي لنفس الحساب اللي حددته عشان تجرب المطابقة الآلية.' : 'Real file parsing isn’t wired up yet -- the button below generates a realistic sample statement for the account above so you can try the AI matching flow.'}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleImportSample}
              disabled={isImporting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
            >
              {isImporting
                ? (language === 'ar' ? 'جاري التحميل...' : 'Loading...')
                : (language === 'ar' ? `تحميل ومعالجة كشف ${importBankName || ''}` : `Load & Parse ${importBankName || 'Bank'} Feed`)}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
