import React, { useMemo, useState } from 'react';
import {
  TicketCheck, Plus, UploadCloud, Link2, CheckCircle2, AlertTriangle,
  FileSpreadsheet, FileText, Settings2, Trash2, Car, Percent, ShieldCheck
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { DayMonthYearDateInput } from '../common/DayMonthYearDateInput';
import { canEditTollPricing } from '../../config/permissions';
import { analyzeTollsFinancials, DEFAULT_TOLL_PRICING } from '../../lib/tollCalculations';
import { TollTransaction, TollType, TollImportBatch } from '../../types';

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const TYPE_LABELS: Record<TollType, { en: string; ar: string }> = {
  salik: { en: 'Salik (Dubai)', ar: 'سالك (دبي)' },
  darb: { en: 'Darb (Abu Dhabi)', ar: 'درب (أبوظبي)' },
  parking: { en: 'Parking', ar: 'مواقف' }
};

export const TollsParkingView: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const {
    tollTransactions, tollImportBatches, tollPricingConfig, contracts,
    addManualToll, updateTollTransaction, deleteTollTransaction,
    previewTollImport, confirmTollImport, updateTollPricingConfig, showToast
  } = useCRM();

  const canEditPricing = canEditTollPricing(currentUser.role);
  const pricing = tollPricingConfig || DEFAULT_TOLL_PRICING;

  const [tab, setTab] = useState<'all' | TollType>('all');
  const [matchFilter, setMatchFilter] = useState<'all' | 'unmatched'>('all');
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [assignRow, setAssignRow] = useState<TollTransaction | null>(null);

  const isAr = language === 'ar';

  const filtered = useMemo(() => {
    return tollTransactions.filter(t => {
      if (tab !== 'all' && t.type !== tab) return false;
      if (matchFilter === 'unmatched' && (t.contractId || t.customerId)) return false;
      return true;
    });
  }, [tollTransactions, tab, matchFilter]);

  const summary = useMemo(() => analyzeTollsFinancials(tollTransactions), [tollTransactions]);
  const unmatchedCount = tollTransactions.filter(t => !t.contractId && !t.customerId).length;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100 flex items-center gap-2">
            <TicketCheck className="w-6 h-6 text-[#D4AF37]" />
            {isAr ? 'سالك، درب، والمواقف' : 'Salik, Darb & Parking'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {isAr
              ? 'تسجيل يدوي أو استيراد كشوفات سالك/درب، مع حساب هامش الربح تلقائياً لكل معاملة.'
              : 'Manual entry or Salik/Darb statement import, with automatic per-transaction profit margin.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEditPricing && (
            <button
              onClick={() => setPricingOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 text-xs font-semibold hover:bg-zinc-800 transition-all"
            >
              <Settings2 className="w-4 h-4 text-sky-400" />
              <span>{isAr ? 'إعدادات التسعير' : 'Pricing Settings'}</span>
            </button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 text-xs font-semibold hover:bg-zinc-800 transition-all"
          >
            <UploadCloud className="w-4 h-4 text-sky-400" />
            <span>{isAr ? 'استيراد كشف' : 'Import Statement'}</span>
          </button>
          <button
            onClick={() => setManualOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إدخال يدوي' : 'Manual Entry'}</span>
          </button>
        </div>
      </div>

      {/* KPI Banner -- Profit Margin & Financial Ledger Analysis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(['salik', 'darb', 'parking'] as TollType[]).map(type => {
          const s = summary[type];
          return (
            <div key={type} className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
              <p className="text-[10px] uppercase font-bold text-zinc-400">{isAr ? TYPE_LABELS[type].ar : TYPE_LABELS[type].en}</p>
              <h3 className="text-xl font-bold text-zinc-100 font-display mt-1">{s.count} {isAr ? 'معاملة' : 'Txns'}</h3>
              <div className="mt-2 space-y-0.5 text-[11px] font-mono">
                <p className="text-zinc-500">{isAr ? 'التكلفة الفعلية' : 'Actual Cost'}: <span className="text-rose-400">{(s.totalCost || 0).toLocaleString()} AED</span></p>
                <p className="text-zinc-500">{isAr ? 'المحصل من العميل' : 'Collected'}: <span className="text-sky-300">{(s.totalCollected || 0).toLocaleString()} AED</span></p>
                <p className="text-zinc-500">{isAr ? 'صافي الربح' : 'Net Profit'}: <span className="text-emerald-400 font-bold">{(s.totalNetProfit || 0).toLocaleString()} AED</span></p>
              </div>
            </div>
          );
        })}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#D4AF37]/10 to-transparent border border-[#D4AF37]/30">
          <p className="text-[10px] uppercase font-bold text-[#f5d97f]">{isAr ? 'إجمالي هامش الربح' : 'Overall Net Profit'}</p>
          <h3 className="text-2xl font-bold text-[#f5d97f] font-display mt-1">{(summary.overall.totalNetProfit || 0).toLocaleString()} AED</h3>
          <p className="text-[11px] text-zinc-400 mt-1 font-mono">
            {(summary.overall.totalCollected || 0).toLocaleString()} {isAr ? 'محصل' : 'collected'} — {(summary.overall.totalCost || 0).toLocaleString()} {isAr ? 'تكلفة' : 'cost'}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-2 flex-wrap">
        <div className="flex items-center gap-2">
          {(['all', 'salik', 'darb', 'parking'] as const).map(key => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                tab === key ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {key === 'all' ? (isAr ? 'الكل' : 'All') : (isAr ? TYPE_LABELS[key].ar : TYPE_LABELS[key].en)}
              {' '}({key === 'all' ? tollTransactions.length : tollTransactions.filter(t => t.type === key).length})
            </button>
          ))}
        </div>
        <button
          onClick={() => setMatchFilter(matchFilter === 'unmatched' ? 'all' : 'unmatched')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
            matchFilter === 'unmatched' ? 'bg-rose-500/15 text-rose-300 border-rose-500/40' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {isAr ? `غير مطابقة (${unmatchedCount})` : `Unmatched (${unmatchedCount})`}
        </button>
      </div>

      {/* Transactions Table */}
      <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                <th className="p-3 text-start font-medium">{isAr ? 'التاريخ' : 'Date'}</th>
                <th className="p-3 text-start font-medium">{isAr ? 'النوع' : 'Type'}</th>
                <th className="p-3 text-start font-medium">{isAr ? 'الموقع / اللوحة' : 'Location / Plate'}</th>
                <th className="p-3 text-start font-medium">{isAr ? 'العميل / العقد' : 'Customer / Contract'}</th>
                <th className="p-3 text-end font-medium">{isAr ? 'التكلفة الفعلية' : 'Actual Cost'}</th>
                <th className="p-3 text-end font-medium">{isAr ? 'المحصل من العميل' : 'Charged to Customer'}</th>
                <th className="p-3 text-end font-medium">{isAr ? 'صافي الربح' : 'Net Profit'}</th>
                <th className="p-3 text-center font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="p-3 text-end font-medium">{isAr ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-zinc-500">
                    {isAr ? 'لا توجد معاملات بعد -- استخدم الإدخال اليدوي أو استيراد كشف.' : 'No transactions yet -- use Manual Entry or Import Statement.'}
                  </td>
                </tr>
              ) : filtered.map(t => (
                <tr key={t.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="p-3 whitespace-nowrap text-zinc-400">{t.date}{t.time ? ` ${t.time}` : ''}</td>
                  <td className="p-3">
                    <Badge variant={t.type === 'salik' ? 'sky' : t.type === 'darb' ? 'purple' : 'amber'} size="sm">
                      {isAr ? TYPE_LABELS[t.type].ar : TYPE_LABELS[t.type].en}
                    </Badge>
                    {t.rateOverridden && (
                      <span className="block text-[9px] text-amber-400 mt-1">{isAr ? 'سعر معدَّل يدوياً' : 'Rate manually edited'}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <p className="text-zinc-200">{t.locationName}</p>
                    {t.plateNumber && <p className="text-[10px] text-zinc-500 font-mono">{t.plateNumber}</p>}
                  </td>
                  <td className="p-3">
                    {t.customerName ? (
                      <div>
                        <p className="text-zinc-200 font-semibold">{t.customerName}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">{t.contractId || '—'}</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAssignRow(t)}
                        className="inline-flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200 font-semibold"
                      >
                        <Link2 className="w-3 h-3" /> {isAr ? 'ربط بعقد' : 'Assign to Contract'}
                      </button>
                    )}
                  </td>
                  <td className="p-3 text-end font-mono text-rose-400">{(t.actualCompanyCost || 0).toLocaleString()} AED</td>
                  <td className="p-3 text-end font-mono text-sky-300">
                    {(t.totalChargedToCustomer || 0).toLocaleString()} AED
                    {(t.discountAmount || t.discountPercent) ? (
                      <p className="text-[10px] text-amber-400">
                        {isAr ? 'خصم' : 'Discount'}: {t.discountPercent ? `${t.discountPercent}%` : ''}{t.discountPercent && t.discountAmount ? ' + ' : ''}{t.discountAmount ? `${t.discountAmount} AED` : ''}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3 text-end font-mono font-bold text-emerald-400">{(t.netProfit || 0).toLocaleString()} AED</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => updateTollTransaction(t.id, { isPaid: !t.isPaid, actorId: currentUser.id, actorName: currentUser.name })}
                      className="inline-block"
                    >
                      <Badge variant={t.isPaid ? 'emerald' : 'zinc'} size="sm">
                        {t.isPaid ? (isAr ? 'محصّل' : 'Collected') : (isAr ? 'غير محصّل' : 'Unpaid')}
                      </Badge>
                    </button>
                  </td>
                  <td className="p-3 text-end">
                    <button
                      onClick={() => deleteTollTransaction(t.id)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      title={isAr ? 'حذف' : 'Delete'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {tollImportBatches.length > 0 && (
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3">{isAr ? 'سجل الاستيراد' : 'Import History'}</h4>
          <div className="space-y-2">
            {tollImportBatches.slice(0, 6).map(b => (
              <div key={b.id} className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-zinc-800/60 pb-2 last:border-0">
                <span className="font-mono text-zinc-300">{b.fileName}</span>
                <span>{b.totalTransactions} {isAr ? 'معاملة' : 'txns'} · {b.matchedCount} {isAr ? 'مطابقة' : 'matched'}</span>
                <span>{(b.totalCustomerBilling || 0).toLocaleString()} AED</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {manualOpen && (
        <ManualEntryModal
          onClose={() => setManualOpen(false)}
          canEditPricing={canEditPricing}
          pricing={pricing}
          onSubmit={async (data) => {
            await addManualToll({
              ...data,
              createdBy: currentUser.id,
              createdByName: currentUser.name,
              actorRole: currentUser.role
            });
            setManualOpen(false);
          }}
        />
      )}

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          previewTollImport={previewTollImport}
          confirmTollImport={confirmTollImport}
          currentUserId={currentUser.id}
        />
      )}

      {pricingOpen && canEditPricing && (
        <PricingModal
          pricing={pricing}
          onClose={() => setPricingOpen(false)}
          onSave={async (data) => {
            await updateTollPricingConfig({ ...data, actorId: currentUser.id, actorName: currentUser.name } as any);
            setPricingOpen(false);
          }}
        />
      )}

      {assignRow && (
        <AssignContractModal
          row={assignRow}
          contracts={contracts}
          onClose={() => setAssignRow(null)}
          onAssign={async (contractId) => {
            const c = contracts.find(x => x.id === contractId);
            await updateTollTransaction(assignRow.id, {
              contractId,
              customerId: c?.customerId,
              customerName: c?.customerName,
              actorId: currentUser.id,
              actorName: currentUser.name
            });
            setAssignRow(null);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const ManualEntryModal: React.FC<{
  onClose: () => void;
  canEditPricing: boolean;
  pricing: { salikCustomerRate: number; darbCompanyCost: number; darbCustomerRate: number; parkingMarkupPercent: number };
  onSubmit: (data: any) => Promise<void>;
}> = ({ onClose, canEditPricing, pricing, onSubmit }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [type, setType] = useState<TollType>('salik');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [locationName, setLocationName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [actualCompanyCost, setActualCompanyCost] = useState<string>('');
  const [customerBillingRateOverride, setCustomerBillingRateOverride] = useState<string>('');
  const [parkingBaseAmount, setParkingBaseAmount] = useState<string>('');
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [discountPercent, setDiscountPercent] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const defaultRate = type === 'salik' ? pricing.salikCustomerRate : type === 'darb' ? pricing.darbCustomerRate : undefined;
  const defaultCost = type === 'darb' ? pricing.darbCompanyCost : undefined;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({
        type,
        date,
        locationName: locationName || undefined,
        plateNumber: plateNumber || undefined,
        actualCompanyCost: actualCompanyCost !== '' ? parseFloat(actualCompanyCost) : undefined,
        customerBillingRateOverride: canEditPricing && customerBillingRateOverride !== '' ? parseFloat(customerBillingRateOverride) : undefined,
        parkingBaseAmount: type === 'parking' && parkingBaseAmount !== '' ? parseFloat(parkingBaseAmount) : undefined,
        discountAmount: canEditPricing && discountAmount !== '' ? parseFloat(discountAmount) : undefined,
        discountPercent: canEditPricing && discountPercent !== '' ? parseFloat(discountPercent) : undefined
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isAr ? 'إدخال معاملة يدوياً' : 'Manual Transaction Entry'} maxWidth="md">
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{isAr ? 'النوع' : 'Type'}</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as TollType)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/60"
            >
              <option value="salik">{isAr ? TYPE_LABELS.salik.ar : TYPE_LABELS.salik.en}</option>
              <option value="darb">{isAr ? TYPE_LABELS.darb.ar : TYPE_LABELS.darb.en}</option>
              <option value="parking">{isAr ? TYPE_LABELS.parking.ar : TYPE_LABELS.parking.en}</option>
            </select>
          </div>
          <div>
            <DayMonthYearDateInput
              label={isAr ? 'التاريخ' : 'Date'}
              value={date}
              onChange={setDate}
              isAr={isAr}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{isAr ? 'الموقع / البوابة' : 'Location / Gate'}</label>
            <input
              type="text"
              value={locationName}
              onChange={e => setLocationName(e.target.value)}
              placeholder={type === 'parking' ? (isAr ? 'اسم موقف السيارات' : 'Parking location') : (isAr ? 'اسم البوابة' : 'Gate name')}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/60"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{isAr ? 'رقم اللوحة' : 'Plate Number'}</label>
            <input
              type="text"
              value={plateNumber}
              onChange={e => setPlateNumber(e.target.value)}
              placeholder="A 12345"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60"
            />
          </div>
        </div>

        {type === 'parking' ? (
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              {isAr ? `المبلغ الأساسي (سيتم إضافة ${pricing.parkingMarkupPercent}% تلقائياً)` : `Base Amount (${pricing.parkingMarkupPercent}% markup applied automatically)`}
            </label>
            <input
              type="number"
              step="0.01"
              value={parkingBaseAmount}
              onChange={e => setParkingBaseAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                {isAr ? 'التكلفة الفعلية للشركة' : 'Actual Company Cost'}
              </label>
              <input
                type="number"
                step="0.01"
                value={actualCompanyCost}
                onChange={e => setActualCompanyCost(e.target.value)}
                placeholder={type === 'darb' ? String(defaultCost) : '0.00'}
                disabled={type === 'darb' && !canEditPricing}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60 disabled:opacity-50"
              />
              {type === 'darb' && !canEditPricing && (
                <p className="text-[10px] text-zinc-500 mt-1">{isAr ? `التكلفة الثابتة: ${defaultCost} درهم` : `Fixed default: ${defaultCost} AED`}</p>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                {isAr ? 'سعر البيع للعميل' : 'Customer Billing Rate'}
              </label>
              <input
                type="number"
                step="0.01"
                value={customerBillingRateOverride}
                onChange={e => setCustomerBillingRateOverride(e.target.value)}
                placeholder={String(defaultRate)}
                disabled={!canEditPricing}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60 disabled:opacity-50"
              />
              {!canEditPricing && (
                <p className="text-[10px] text-zinc-500 mt-1">{isAr ? `السعر الثابت: ${defaultRate} درهم` : `Fixed default: ${defaultRate} AED`}</p>
              )}
            </div>
          </div>
        )}

        {canEditPricing && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
            <div>
              <label className="block text-[11px] font-semibold text-amber-300 uppercase tracking-wider mb-1.5">{isAr ? 'خصم (%)' : 'Discount (%)'}</label>
              <input
                type="number"
                step="0.01"
                value={discountPercent}
                onChange={e => setDiscountPercent(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-amber-300 uppercase tracking-wider mb-1.5">{isAr ? 'خصم (درهم)' : 'Discount (AED)'}</label>
              <input
                type="number"
                step="0.01"
                value={discountAmount}
                onChange={e => setDiscountAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60"
              />
            </div>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
        >
          {submitting ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ المعاملة' : 'Save Transaction')}
        </button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------

const ImportModal: React.FC<{
  onClose: () => void;
  previewTollImport: (file: { fileName: string; fileBase64: string; type: 'salik' | 'darb' }) => Promise<{ batch: TollImportBatch; transactions: TollTransaction[]; warnings: string[] }>;
  confirmTollImport: (file: { fileName: string; fileBase64: string; type: 'salik' | 'darb' }) => Promise<any>;
  currentUserId: string;
}> = ({ onClose, previewTollImport, confirmTollImport, currentUserId }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [type, setType] = useState<'salik' | 'darb'>('salik');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ batch: TollImportBatch; transactions: TollTransaction[]; warnings: string[] } | null>(null);

  const handleFilePick = async (f: File | null) => {
    setFile(f);
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fileBase64 = await readFileAsBase64(file);
      const result = await previewTollImport({ fileName: file.name, fileBase64, type });
      setPreview(result);
    } catch (e: any) {
      // previewTollImport already surfaces errors via the thrown message; a
      // simple inline warning list keeps this modal self-contained.
      setPreview({ batch: {} as TollImportBatch, transactions: [], warnings: [e?.message || 'Failed to parse file.'] });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fileBase64 = await readFileAsBase64(file);
      await confirmTollImport({ fileName: file.name, fileBase64, type });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isAr ? 'استيراد كشف سالك / درب' : 'Import Salik / Darb Statement'} maxWidth="lg">
      <div className="space-y-4 text-xs">
        <div>
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{isAr ? 'مزود الخدمة' : 'Provider'}</label>
          <select
            value={type}
            onChange={e => { setType(e.target.value as 'salik' | 'darb'); setPreview(null); }}
            className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/60"
          >
            <option value="salik">{isAr ? TYPE_LABELS.salik.ar : TYPE_LABELS.salik.en}</option>
            <option value="darb">{isAr ? TYPE_LABELS.darb.ar : TYPE_LABELS.darb.en}</option>
          </select>
          {type === 'darb' && (
            <p className="text-[10px] text-amber-400 mt-1.5">
              {isAr
                ? 'لم يتم توفير نموذج فعلي لدرب بعد -- سيتم استخدام محلل عام قد يحتاج مراجعة يدوية أكبر. الإدخال اليدوي متاح دائماً كبديل.'
                : 'No real Darb sample provided yet -- a generic parser is used and may need more manual review. Manual entry is always available as a fallback.'}
            </p>
          )}
        </div>

        <div className="border-2 border-dashed border-zinc-800 rounded-2xl p-6 text-center space-y-2 bg-zinc-950/50">
          {type === 'salik' ? <FileSpreadsheet className="w-8 h-8 text-[#D4AF37] mx-auto" /> : <FileText className="w-8 h-8 text-[#D4AF37] mx-auto" />}
          <input
            type="file"
            accept=".xls,.xlsx,.csv,.pdf"
            onChange={e => handleFilePick(e.target.files?.[0] || null)}
            className="w-full text-[11px] text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-zinc-200 file:text-[11px] file:font-semibold"
          />
          <p className="text-zinc-500 text-[10px]">{isAr ? 'Excel (.xls/.xlsx) أو PDF لكشوفات سالك، Excel/CSV لدرب' : 'Excel (.xls/.xlsx) or PDF for Salik statements, Excel/CSV for Darb'}</p>
        </div>

        {!preview && (
          <button
            onClick={handlePreview}
            disabled={!file || loading}
            className="w-full py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 font-semibold hover:bg-zinc-800 transition-all disabled:opacity-50"
          >
            {loading ? (isAr ? 'جاري التحليل...' : 'Parsing...') : (isAr ? 'معاينة قبل الاستيراد' : 'Preview Before Import')}
          </button>
        )}

        {preview && (
          <div className="space-y-3">
            {preview.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-[11px] text-amber-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                  </p>
                ))}
              </div>
            )}
            {preview.transactions.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                    <p className="text-[10px] text-zinc-500">{isAr ? 'المعاملات' : 'Transactions'}</p>
                    <p className="font-bold text-zinc-100">{preview.transactions.length}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                    <p className="text-[10px] text-zinc-500">{isAr ? 'مطابقة تلقائياً' : 'Auto-Matched'}</p>
                    <p className="font-bold text-emerald-400">{preview.batch.matchedCount}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                    <p className="text-[10px] text-zinc-500">{isAr ? 'إجمالي المحصل' : 'Total Billing'}</p>
                    <p className="font-bold text-sky-300">{(preview.batch.totalCustomerBilling || 0).toLocaleString()} AED</p>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto rounded-xl border border-zinc-800">
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-zinc-950">
                      <tr className="text-zinc-500">
                        <th className="p-2 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="p-2 text-start">{isAr ? 'الموقع' : 'Location'}</th>
                        <th className="p-2 text-start">{isAr ? 'اللوحة' : 'Plate'}</th>
                        <th className="p-2 text-end">{isAr ? 'التكلفة' : 'Cost'}</th>
                        <th className="p-2 text-end">{isAr ? 'المحصل' : 'Billed'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                      {preview.transactions.slice(0, 50).map((t, i) => (
                        <tr key={i}>
                          <td className="p-2">{t.date}</td>
                          <td className="p-2 truncate max-w-[120px]">{t.locationName}</td>
                          <td className="p-2 font-mono">{t.plateNumber || '—'}</td>
                          <td className="p-2 text-end font-mono text-rose-400">{t.actualCompanyCost}</td>
                          <td className="p-2 text-end font-mono text-sky-300">{t.totalChargedToCustomer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4 inline me-1.5" />
                  {loading ? (isAr ? 'جاري الاستيراد...' : 'Importing...') : (isAr ? `تأكيد استيراد ${preview.transactions.length} معاملة` : `Confirm Import of ${preview.transactions.length} Transactions`)}
                </button>
              </>
            ) : (
              <p className="text-center text-zinc-500 py-4">{isAr ? 'لم يتم العثور على معاملات في هذا الملف.' : 'No transactions were found in this file.'}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------

const PricingModal: React.FC<{
  pricing: { salikCustomerRate: number; darbCompanyCost: number; darbCustomerRate: number; parkingMarkupPercent: number };
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}> = ({ pricing, onClose, onSave }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [salikCustomerRate, setSalikCustomerRate] = useState(String(pricing.salikCustomerRate));
  const [darbCompanyCost, setDarbCompanyCost] = useState(String(pricing.darbCompanyCost));
  const [darbCustomerRate, setDarbCustomerRate] = useState(String(pricing.darbCustomerRate));
  const [parkingMarkupPercent, setParkingMarkupPercent] = useState(String(pricing.parkingMarkupPercent));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        salikCustomerRate: parseFloat(salikCustomerRate),
        darbCompanyCost: parseFloat(darbCompanyCost),
        darbCustomerRate: parseFloat(darbCustomerRate),
        parkingMarkupPercent: parseFloat(parkingMarkupPercent)
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isAr ? 'إعدادات تسعير سالك، درب، والمواقف' : 'Salik, Darb & Parking Pricing'} maxWidth="md">
      <div className="space-y-4 text-xs">
        <div className="p-3 rounded-xl bg-sky-500/5 border border-sky-500/20 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400">
            {isAr
              ? 'هذه الأسعار الافتراضية المطبّقة على أي معاملة جديدة. يمكن تعديل سعر أي معاملة بشكل فردي أيضاً عند الإدخال.'
              : 'These are the default rates applied to every new transaction. Individual transactions can still be overridden at entry time.'}
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{isAr ? 'سعر بيع سالك للعميل (درهم)' : 'Salik Customer Rate (AED)'}</label>
          <input type="number" step="0.01" value={salikCustomerRate} onChange={e => setSalikCustomerRate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{isAr ? 'تكلفة درب على الشركة (درهم)' : 'Darb Company Cost (AED)'}</label>
            <input type="number" step="0.01" value={darbCompanyCost} onChange={e => setDarbCompanyCost(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{isAr ? 'سعر بيع درب للعميل (درهم)' : 'Darb Customer Rate (AED)'}</label>
            <input type="number" step="0.01" value={darbCustomerRate} onChange={e => setDarbCustomerRate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60" />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Percent className="w-3 h-3" /> {isAr ? 'نسبة هامش المواقف (%)' : 'Parking Markup (%)'}
          </label>
          <input type="number" step="0.1" value={parkingMarkupPercent} onChange={e => setParkingMarkupPercent(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]/60" />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
        >
          {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الأسعار' : 'Save Pricing')}
        </button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------

const AssignContractModal: React.FC<{
  row: TollTransaction;
  contracts: { id: string; customerId: string; customerName: string; vehicleId: string }[];
  onClose: () => void;
  onAssign: (contractId: string) => Promise<void>;
}> = ({ row, contracts, onClose, onAssign }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [contractId, setContractId] = useState('');
  const [saving, setSaving] = useState(false);

  const relevant = row.vehicleId ? contracts.filter(c => c.vehicleId === row.vehicleId) : contracts;

  const handleAssign = async () => {
    if (!contractId) return;
    setSaving(true);
    try {
      await onAssign(contractId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isAr ? 'ربط المعاملة بعقد' : 'Assign Transaction to a Contract'} maxWidth="sm">
      <div className="space-y-4 text-xs">
        <p className="text-zinc-400">
          {isAr ? `اللوحة: ${row.plateNumber || '—'} بتاريخ ${row.date}` : `Plate: ${row.plateNumber || '—'} on ${row.date}`}
        </p>
        <select
          value={contractId}
          onChange={e => setContractId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/60"
        >
          <option value="">{isAr ? '-- اختر عقداً --' : '-- Select a Contract --'}</option>
          {relevant.map(c => (
            <option key={c.id} value={c.id}>{c.id} — {c.customerName}</option>
          ))}
        </select>
        <button
          onClick={handleAssign}
          disabled={!contractId || saving}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
        >
          <Car className="w-4 h-4 inline me-1.5" />
          {saving ? (isAr ? 'جاري الربط...' : 'Linking...') : (isAr ? 'ربط' : 'Assign')}
        </button>
      </div>
    </Modal>
  );
};
