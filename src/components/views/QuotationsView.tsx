import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, Plus, Search, Printer, CheckCircle2, 
  Calendar, Car, User, DollarSign, ArrowRight, ShieldCheck, Clock,
  Sparkles, TrendingUp, Percent, Zap, Check, Gauge, Globe
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Quotation } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate } from '../../lib/dateFormat';
import { YieldPricingEngine } from '../../server/yieldPricingEngine';
import { CurrencySelector } from '../common/CurrencySelector';
import { SUPPORTED_CURRENCIES, convertAEDToCurrency, formatPriceWithCurrency } from '../../lib/currency';

export const QuotationsView: React.FC = () => {
  const { language, t, getStatusLabel } = useLanguage();
  const isAr = language === 'ar';
  const { 
    quotations, customers, vehicles, createQuotation, 
    convertQuotationToReservation, selectedQuotationId, 
    setSelectedQuotationId, setActiveView 
  } = useCRM();

  const [searchTerm, setSearchTerm] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);

  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    vehicleId: '',
    vehicleName: '',
    category: 'supercar' as any,
    startDate: new Date().toISOString().split('T')[0] + 'T10:00:00Z',
    endDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0] + 'T10:00:00Z',
    durationDays: 2,
    dailyRate: 6500,
    securityDeposit: 15000,
    currency: 'AED',
    mileageAllowancePerDay: 250,
    monthlyMileageAllowance: 4500,
    extraKmRate: 2,
    discountAmount: 0,
    validUntil: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    notes: 'Includes VIP Delivery to client location with bespoke Splendor welcome kit.',
    termsAndConditions: 'UAE RTA standard master lease agreement.'
  });

  const activeQuote = quotations.find(q => q.id === selectedQuotationId) || quotations[0];

  const handleCustomerSelect = (custId: string) => {
    const cust = customers.find(c => c.id === custId);
    if (cust) {
      setForm(prev => ({
        ...prev,
        customerId: cust.id,
        customerName: cust.fullName,
        customerPhone: cust.phone,
        customerEmail: cust.email
      }));
    }
  };

  const handleVehicleSelect = (vehId: string) => {
    const veh = vehicles.find(v => v.id === vehId);
    if (veh) {
      setForm(prev => ({
        ...prev,
        vehicleId: veh.id,
        vehicleName: `${veh.make} ${veh.model} (${veh.year})`,
        category: veh.category,
        dailyRate: veh.dailyRate,
        securityDeposit: veh.minDeposit
      }));
    }
  };

  // Live yield recommendation calculation
  const yieldRecommendation = useMemo(() => {
    const veh = vehicles.find(v => v.id === form.vehicleId) || vehicles[0];
    if (!veh) return null;

    return YieldPricingEngine.computeYieldQuote(
      veh,
      form.startDate,
      form.endDate,
      vehicles
    );
  }, [form.vehicleId, form.startDate, form.endDate, vehicles]);

  const applyYieldPricing = () => {
    if (!yieldRecommendation) return;
    setForm(prev => ({
      ...prev,
      dailyRate: yieldRecommendation.finalDailyRate,
      durationDays: yieldRecommendation.totalDays,
      discountAmount: Math.round(yieldRecommendation.baseDailyRate * (yieldRecommendation.durationDiscountPercent / 100) * yieldRecommendation.totalDays)
    }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createQuotation(form);
    setAddModalOpen(false);
  };

  const handleConvert = async (quote: Quotation) => {
    await convertQuotationToReservation(quote.id);
    setActiveView('reservations');
  };

  const filteredQuotes = quotations.filter(q => {
    const s = (searchTerm || '').toLowerCase();
    return (
      (q.id || '').toLowerCase().includes(s) ||
      (q.customerName || '').toLowerCase().includes(s) ||
      (q.vehicleName || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {isAr ? 'عروض الأسعار والاتفاقيات المبدئية' : 'Quotations & VIP Proposals'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {isAr ? 'احتساب تلقائي لضريبة القيمة المضافة 5%، خدمات التسليم الخاص، والتحويل الفوري للحجز' : 'Automated 5% UAE VAT pricing, bespoke concierge addons, and 1-click booking lock'}
          </p>
        </div>

        <button
          onClick={() => {
            if (customers.length > 0) handleCustomerSelect(customers[0].id);
            if (vehicles.length > 0) handleVehicleSelect(vehicles[0].id);
            setAddModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'إنشاء عرض سعر جديد' : 'New Quotation'}</span>
        </button>
      </div>

      {/* Grid: Quotes List & Printable Document Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Quotes List (4 cols) */}
        <div className="lg:col-span-4 p-4 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث برقم العرض، العميل، السيارة...' : 'Search quotation ID, client, car...'}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50"
            />
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
            {filteredQuotes.map(quote => {
              const isSelected = activeQuote?.id === quote.id;
              return (
                <div
                  key={quote.id}
                  onClick={() => setSelectedQuotationId(quote.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40 shadow-sm'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200">{quote.customerName}</h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{quote.vehicleName}</p>
                    </div>
                    <Badge variant={quote.status === 'accepted' ? 'emerald' : quote.status === 'sent' ? 'sky' : 'zinc'} size="sm">
                      {getStatusLabel(quote.status)}
                    </Badge>
                  </div>

                  <div className="mt-2 pt-2 border-t border-zinc-800/50 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-mono text-zinc-500">{quote.id}</span>
                    <span className="font-bold text-zinc-200">{(quote.grandTotal || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Luxury Formal Quotation Document Preview (8 cols) */}
        {activeQuote ? (
          <div className="lg:col-span-8 p-8 rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl space-y-6 print-container">
            {/* Formal Document Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
              <div>
                <h1 className="font-serif text-xl tracking-widest text-[#f5d97f] uppercase font-bold">
                  SPLENDOR CAR RENTAL LLC
                </h1>
                <p className="text-[10px] tracking-wider text-zinc-400 uppercase font-medium mt-1">
                  شركة سبلندر لتأجير السيارات ذ.م.م • TRN: 100482910300003
                </p>
                <p className="text-xs text-zinc-400 mt-1">{isAr ? 'المعرض الرئيسي، وسط دبي، الإمارات العربية المتحدة' : 'Downtown Flagship Showroom, Dubai, UAE'}</p>
              </div>

              <div className="text-start sm:text-end space-y-1">
                <span className="text-xs uppercase font-bold text-[#f5d97f] bg-[#D4AF37]/15 px-3 py-1 rounded-full border border-[#D4AF37]/30">
                  {isAr ? 'عرض سعر رسمي معتمد' : 'OFFICIAL PROPOSAL'}
                </span>
                <p className="text-xs font-mono text-zinc-300 font-bold mt-2">{isAr ? 'رقم العرض:' : 'No:'} {activeQuote.id}</p>
                <p className="text-[11px] text-zinc-400">{isAr ? 'التاريخ:' : 'Date:'} {formatDate(activeQuote.createdAt)}</p>
              </div>
            </div>

            {/* Client & Vehicle Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">{isAr ? 'بيانات العميل VIP' : 'Client Details'}</span>
                <p className="font-bold text-zinc-100">{activeQuote.customerName}</p>
                <p className="text-zinc-400">{activeQuote.customerPhone}</p>
                <p className="text-zinc-400">{activeQuote.customerEmail}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">{isAr ? 'جدول ومدة الإيجار' : 'Rental Schedule'}</span>
                <p className="font-bold text-zinc-100">{activeQuote.vehicleName}</p>
                <p className="text-zinc-400">
                  {formatDate(activeQuote.startDate)} {isAr ? 'إلى' : 'to'} {formatDate(activeQuote.endDate)} ({activeQuote.durationDays} {isAr ? 'أيام' : 'Days'})
                </p>
                <p className="text-zinc-400">{isAr ? 'صالح لغاية:' : 'Valid Until:'} {activeQuote.validUntil}</p>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="pb-3 text-start font-medium">{isAr ? 'الوصف' : 'Description'}</th>
                    <th className="pb-3 text-center font-medium">{isAr ? 'المدة' : 'Duration'}</th>
                    <th className="pb-3 text-end font-medium">{isAr ? 'السعر (د.إ)' : 'Rate (AED)'}</th>
                    <th className="pb-3 text-end font-medium">{isAr ? 'الإجمالي (د.إ)' : 'Amount (AED)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                  <tr>
                    <td className="py-3">
                      <p className="font-semibold text-zinc-200">{isAr ? 'إيجار المركبة الفارهة:' : 'Luxury Vehicle Lease:'} {activeQuote.vehicleName}</p>
                      <p className="text-[11px] text-zinc-400">{isAr ? 'يشمل مسافة 250 كم/يوم وتأمين شامل VIP' : 'Includes 250 km/day allowance & full comprehensive VIP insurance'}</p>
                    </td>
                    <td className="py-3 text-center">{activeQuote.durationDays} {isAr ? 'أيام' : 'Days'}</td>
                    <td className="py-3 text-end font-mono">{(activeQuote.dailyRate || 0).toLocaleString()}</td>
                    <td className="py-3 text-end font-mono">{(activeQuote.baseTotal || 0).toLocaleString()}</td>
                  </tr>
                  {activeQuote.extraServices?.map((svc, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 text-zinc-300">{svc.name}</td>
                      <td className="py-2.5 text-center">1 {isAr ? 'خدمة' : 'Unit'}</td>
                      <td className="py-2.5 text-end font-mono">{svc.price}</td>
                      <td className="py-2.5 text-end font-mono">{svc.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Grand Total Breakdown */}
            <div className="pt-4 border-t border-zinc-800 flex justify-end">
              <div className="w-72 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>{isAr ? 'المجموع قبل الضريبة:' : 'Subtotal (Net):'}</span>
                  <span className="font-mono text-zinc-200">{((activeQuote.baseTotal || 0) + (activeQuote.extraServicesTotal || 0) - (activeQuote.discountAmount || 0)).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>{isAr ? 'ضريبة القيمة المضافة (5%):' : 'UAE VAT (5%):'}</span>
                  <span className="font-mono text-zinc-200">{(activeQuote.vatAmount || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-zinc-100 pt-2 border-t border-zinc-800">
                  <span>{isAr ? 'الإجمالي النهائي:' : 'Grand Total:'}</span>
                  <span className="font-mono text-[#f5d97f]">{(activeQuote.grandTotal || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</span>
                </div>
                <div className="flex justify-between text-xs text-zinc-400 pt-1">
                  <span>{isAr ? 'مبلغ التأمين (مسترد):' : 'Security Deposit (Refundable):'}</span>
                  <span className="font-mono text-zinc-300">{(activeQuote.securityDeposit || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</span>
                </div>
              </div>
            </div>

            {/* Notes & Actions bar */}
            <div className="pt-6 border-t border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <p className="text-[11px] text-zinc-500 max-w-md italic">
                "{activeQuote.notes}"
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-900 transition-all"
                >
                  <Printer className="w-4 h-4 text-[#D4AF37]" />
                  <span>{isAr ? 'طباعة العرض PDF' : 'Print PDF'}</span>
                </button>

                {activeQuote.status !== 'accepted' && (
                  <button
                    onClick={() => handleConvert(activeQuote)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAr ? 'تحويل إلى حجز مؤكد' : 'Convert to Reservation'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Add Quotation Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={isAr ? 'إعداد عرض سعر VIP' : 'Prepare VIP Quotation'}
        subtitle={isAr ? 'اختيار العميل، المركبة، والتواريخ لاحتساب الضريبة والتكلفة' : 'Select customer, vehicle, and dates to calculate UAE VAT & pricing'}
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'العميل *' : 'Customer *'}</label>
              <select
                required
                value={form.customerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'السيارة *' : 'Vehicle *'}</label>
              <select
                required
                value={form.vehicleId}
                onChange={(e) => handleVehicleSelect(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} - {v.dailyRate} {isAr ? 'د.إ/يوم' : 'AED/day'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'تاريخ البدء' : 'Start Date'}</label>
              <input
                type="date"
                value={form.startDate.split('T')[0]}
                onChange={(e) => setForm({ ...form, startDate: e.target.value + 'T10:00:00Z' })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'تاريخ الانتهاء' : 'End Date'}</label>
              <input
                type="date"
                value={form.endDate.split('T')[0]}
                onChange={(e) => setForm({ ...form, endDate: e.target.value + 'T10:00:00Z' })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'المدة (أيام)' : 'Duration (Days)'}</label>
              <input
                type="number"
                min="1"
                value={form.durationDays}
                onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          {/* Smart Yield Pricing Recommendation Banner */}
          {yieldRecommendation && (
            <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#f5d97f]" />
                  <span className="font-bold text-zinc-200">
                    {isAr ? 'محرك التسعير الديناميكي الذكي (Yield Pricing Engine)' : 'Smart Dynamic Yield Pricing Intelligence'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={applyYieldPricing}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#D4AF37] text-zinc-950 font-bold text-[11px] hover:brightness-110 active:scale-95 transition-all shadow"
                >
                  <Zap className="w-3 h-3" />
                  <span>{isAr ? 'تطبيق السعر المقترح' : 'Apply Smart Rate'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-1 border-t border-zinc-800/80">
                <div>
                  <span className="text-zinc-500">{isAr ? 'السعر المقترح:' : 'Suggested Rate:'}</span>
                  <p className="font-bold text-[#f5d97f]">{yieldRecommendation.finalDailyRate.toLocaleString()} {isAr ? 'د.إ/يوم' : 'AED/day'}</p>
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'الموسمية والطلب:' : 'Demand Surge:'}</span>
                  <p className="font-semibold text-emerald-400">
                    {yieldRecommendation.seasonalityMultiplier > 1 ? `+${Math.round((yieldRecommendation.seasonalityMultiplier - 1) * 100)}% (Peak Surge)` : 'Standard Base'}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'خصم المدة الطويلة:' : 'Duration Discount:'}</span>
                  <p className="font-semibold text-sky-400">
                    {yieldRecommendation.durationDiscountPercent > 0 ? `-${yieldRecommendation.durationDiscountPercent}% (${Math.round(yieldRecommendation.baseDailyRate * (yieldRecommendation.durationDiscountPercent / 100) * yieldRecommendation.totalDays)} AED)` : 'None'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Currency and Mileage Settings */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200 flex items-center gap-1.5 text-xs">
                <Gauge className="w-3.5 h-3.5 text-[#D4AF37]" />
                {isAr ? 'إعدادات الكيلومترات والعملة للمستند:' : 'Mileage Allowances & Billing Currency:'}
              </span>
              <span className="text-[11px] text-amber-400 font-semibold">
                {isAr ? 'الرسوم القياسية: 2 د.إ / كم' : 'Standard Rate: 2 AED/km'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-zinc-400 text-[11px] mb-1">{isAr ? 'المسافة اليومية (كم/يوم) *' : 'Daily KM *'}</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.mileageAllowancePerDay}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForm({ ...form, mileageAllowancePerDay: v, monthlyMileageAllowance: v * 18 });
                  }}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-zinc-400 text-[11px] mb-1">{isAr ? 'المسافة الشهرية (كم/شهر) *' : 'Monthly KM *'}</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.monthlyMileageAllowance}
                  onChange={(e) => setForm({ ...form, monthlyMileageAllowance: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sky-300 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-amber-300 text-[11px] mb-1">{isAr ? 'رسوم التجاوز (د.إ/كم) *' : 'Excess (AED/km) *'}</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={form.extraKmRate}
                  onChange={(e) => setForm({ ...form, extraKmRate: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-zinc-400 text-[11px] mb-1">{isAr ? 'عملة العرض' : 'Quotation Currency'}</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-[#D4AF37]/50 text-[#f5d97f] font-bold text-xs"
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c.code} value={c.code} className="bg-zinc-900 text-zinc-100">
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'السعر اليومي (د.إ) *' : 'Daily Rate (AED) *'}</label>
              <input
                type="number"
                required
                value={form.dailyRate}
                onChange={(e) => setForm({ ...form, dailyRate: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'مبلغ الخصم الترويجي (د.إ)' : 'Discount Amount (AED)'}</label>
              <input
                type="number"
                value={form.discountAmount}
                onChange={(e) => setForm({ ...form, discountAmount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'ملاحظات العرض والخدمات الإضافية' : 'VIP Addons & Notes'}</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs"
            />
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md hover:brightness-110"
            >
              {isAr ? 'إصدار عرض السعر الرسمي' : 'Generate Official Quotation'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
