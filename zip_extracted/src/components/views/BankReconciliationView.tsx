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
    bankTransactions, runAutoReconciliation, 
    reconcileBankTransaction, importBankStatement 
  } = useCRM();

  const [filter, setFilter] = useState<'all' | 'reconciled' | 'unmatched'>('all');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<any>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  const handleRunReconciliation = async () => {
    setIsProcessingAI(true);
    await runAutoReconciliation();
    setIsProcessingAI(false);
  };

  const handleImportSample = async () => {
    await importBankStatement();
    setImportModalOpen(false);
  };

  const handleConfirmMatch = async (txnId: string, customerId?: string, invoiceId?: string) => {
    await reconcileBankTransaction(txnId, customerId, invoiceId);
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

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'المطابقة البنكية الذكية والتسوية المالية' : 'AI Bank Statement Reconciliation'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'استيراد كشوفات بنك الإمارات دبي الوطني مع المطابقة الآلية الذكية بالذكاء الاصطناعي' : 'Corporate Emirates NBD bank feed parsing, AI fuzzy matching & automated ledger reconciliation'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 text-xs font-semibold hover:bg-zinc-800 transition-all"
          >
            <UploadCloud className="w-4 h-4 text-sky-400" />
            <span>{t('importStatement')}</span>
          </button>

          <button
            onClick={handleRunReconciliation}
            disabled={isProcessingAI}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isProcessingAI ? 'animate-spin' : ''}`} />
            <span>{isProcessingAI ? 'Running AI Matching...' : t('runAutoReconciliation')}</span>
          </button>
        </div>
      </div>

      {/* KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <p className="text-[10px] uppercase font-bold text-zinc-400">Total Bank Transactions</p>
          <h3 className="text-xl font-bold text-zinc-100 font-display mt-1">{bankTransactions.length} Items</h3>
        </div>
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <p className="text-[10px] uppercase font-bold text-zinc-400">Reconciled & Posted</p>
          <h3 className="text-xl font-bold text-emerald-400 font-display mt-1">{reconciledCount} Transactions</h3>
        </div>
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <p className="text-[10px] uppercase font-bold text-zinc-400">Pending Review</p>
          <h3 className="text-xl font-bold text-amber-400 font-display mt-1">{bankTransactions.length - reconciledCount} Items</h3>
        </div>
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <p className="text-[10px] uppercase font-bold text-zinc-400">Automated Match Rate</p>
          <h3 className="text-xl font-bold text-[#f5d97f] font-display mt-1">{matchRate}% Matched</h3>
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
          All Feed Items ({bankTransactions.length})
        </button>
        <button
          onClick={() => setFilter('unmatched')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === 'unmatched' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Requires Attention ({bankTransactions.length - reconciledCount})
        </button>
        <button
          onClick={() => setFilter('reconciled')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === 'reconciled' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Reconciled ({reconciledCount})
        </button>
      </div>

      {/* Reconciliation Table */}
      <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                <th className="p-4 text-start font-medium">Txn Date</th>
                <th className="p-4 text-start font-medium">Bank Statement Description</th>
                <th className="p-4 text-start font-medium">Bank Ref</th>
                <th className="p-4 text-end font-medium">Amount Received</th>
                <th className="p-4 text-start font-medium">AI Match & Customer</th>
                <th className="p-4 text-center font-medium">AI Confidence</th>
                <th className="p-4 text-center font-medium">Status</th>
                <th className="p-4 text-end font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {filteredTxns.map(txn => (
                <tr key={txn.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="p-4 whitespace-nowrap text-zinc-400">{txn.date}</td>
                  <td className="p-4 max-w-xs">
                    <p className="font-mono text-zinc-200 truncate">{txn.description}</p>
                    <p className="text-[10px] text-zinc-500">{txn.bankAccountName}</p>
                  </td>
                  <td className="p-4 font-mono text-[11px] text-zinc-400">{txn.reference}</td>
                  <td className="p-4 text-end font-mono font-bold text-emerald-400">
                    +{txn.amount.toLocaleString()} AED
                  </td>
                  <td className="p-4">
                    {txn.suggestedCustomerName ? (
                      <div>
                        <p className="font-semibold text-zinc-100">{txn.suggestedCustomerName}</p>
                        <p className="text-[10px] text-zinc-400 font-mono">Invoice: {txn.suggestedInvoiceId || 'Auto-allocated'}</p>
                      </div>
                    ) : (
                      <span className="text-zinc-500 italic">No match identified</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {txn.confidence ? (
                      <AiConfidenceBadge score={txn.confidence} />
                    ) : (
                      <span className="text-zinc-500 text-[10px]">—</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <Badge variant={txn.status === 'reconciled' ? 'emerald' : txn.status === 'matched' ? 'amber' : 'zinc'} size="sm">
                      {txn.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="p-4 text-end">
                    {txn.status !== 'reconciled' ? (
                      <button
                        onClick={() => handleConfirmMatch(txn.id, txn.suggestedCustomerId, txn.suggestedInvoiceId)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-semibold transition-all shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirm & Post</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-zinc-500 flex items-center justify-end gap-1 font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Settled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Bank Statement"
        subtitle="Emirates NBD / UAE Central Bank MT940 or CSV Statement"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div className="border-2 border-dashed border-zinc-800 rounded-2xl p-8 text-center space-y-3 bg-zinc-950/50">
            <FileSpreadsheet className="w-10 h-10 text-[#D4AF37] mx-auto" />
            <div>
              <p className="font-semibold text-zinc-200">Drag & drop bank statement CSV / Excel</p>
              <p className="text-zinc-500 text-[11px] mt-0.5">Supports Emirates NBD, ADCB, FAB, and Dubai Islamic Bank formats</p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleImportSample}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
            >
              Load & Parse Emirates NBD Feed
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
