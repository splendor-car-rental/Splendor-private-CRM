import React, { useState } from 'react';
import { 
  FileSpreadsheet, Plus, Search, Printer, CheckCircle2, 
  Calendar, Car, User, DollarSign, ArrowRight, ShieldCheck, Clock, Download
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Quotation } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate } from '../../lib/dateFormat';
import { OfficialQuotationPrintModal } from '../operations/OfficialQuotationPrintModal';
import { downloadElementAsPdf } from '../../lib/pdfDownloader';

export const QuotationsView: React.FC = () => {
  const { language, t } = useLanguage();
  const { 
    quotations, customers, vehicles, createQuotation, 
    convertQuotationToReservation, selectedQuotationId, 
    setSelectedQuotationId, setActiveView 
  } = useCRM();

  const [searchTerm, setSearchTerm] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [quotationToPrint, setQuotationToPrint] = useState<Quotation | null>(null);

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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createQuotation(form);
    setAddModalOpen(false);
    setForm(prev => ({ ...prev, discountAmount: 0 }));
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
            {language === 'ar' ? 'عروض الأسعار والاتفاقيات المبدئية' : 'Quotations & VIP Proposals'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'احتساب تلقائي لضريبة القيمة المضافة 5%، خدمات التسليم الخاص، والتحويل الفوري للحجز' : 'Automated 5% UAE VAT pricing, bespoke concierge addons, and 1-click booking lock'}
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
          <span>{language === 'ar' ? 'إنشاء عرض سعر جديد' : 'New Quotation'}</span>
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
              placeholder="Search quotation ID, client, car..."
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
                      {(quote.status || '').toUpperCase()}
                    </Badge>
                  </div>

                  <div className="mt-2 pt-2 border-t border-zinc-800/50 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-mono text-zinc-500">{quote.id}</span>
                    <span className="font-bold text-zinc-200">{(quote.grandTotal || 0).toLocaleString()} AED</span>
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
                <p className="text-xs text-zinc-400 mt-1">Downtown Flagship Showroom, Dubai, UAE</p>
              </div>

              <div className="text-start sm:text-end space-y-1">
                <span className="text-xs uppercase font-bold text-[#f5d97f] bg-[#D4AF37]/15 px-3 py-1 rounded-full border border-[#D4AF37]/30">
                  OFFICIAL PROPOSAL
                </span>
                <p className="text-xs font-mono text-zinc-300 font-bold mt-2">No: {activeQuote.id}</p>
                <p className="text-[11px] text-zinc-400">Date: {formatDate(activeQuote.createdAt)}</p>
              </div>
            </div>

            {/* Client & Vehicle Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Client Details</span>
                <p className="font-bold text-zinc-100">{activeQuote.customerName}</p>
                <p className="text-zinc-400 font-mono" dir="ltr">{activeQuote.customerPhone}</p>
                <p className="text-zinc-400">{activeQuote.customerEmail}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Rental Schedule</span>
                <p className="font-bold text-zinc-100">{activeQuote.vehicleName}</p>
                <p className="text-zinc-400">
                  {formatDate(activeQuote.startDate)} to {formatDate(activeQuote.endDate)} ({activeQuote.durationDays} Days)
                </p>
                <p className="text-zinc-400 font-mono">Valid Until: {formatDate(activeQuote.validUntil)}</p>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="pb-3 text-start font-medium">Description</th>
                    <th className="pb-3 text-center font-medium">Duration</th>
                    <th className="pb-3 text-end font-medium">Rate (AED)</th>
                    <th className="pb-3 text-end font-medium">Amount (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                  <tr>
                    <td className="py-3">
                      <p className="font-semibold text-zinc-200">Luxury Vehicle Lease: {activeQuote.vehicleName}</p>
                      <p className="text-[11px] text-zinc-400">Includes 250 km/day allowance & full comprehensive VIP insurance</p>
                    </td>
                    <td className="py-3 text-center">{activeQuote.durationDays} Days</td>
                    <td className="py-3 text-end font-mono">{(activeQuote.dailyRate || 0).toLocaleString()}</td>
                    <td className="py-3 text-end font-mono">{(activeQuote.baseTotal || 0).toLocaleString()}</td>
                  </tr>
                  {activeQuote.extraServices?.map((svc, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 text-zinc-300">{svc.name}</td>
                      <td className="py-2.5 text-center">1 Unit</td>
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
                {(activeQuote.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount ({(activeQuote.discountPercentage || 0).toFixed(1)}%):</span>
                    <span className="font-mono">-{(activeQuote.discountAmount || 0).toLocaleString()} AED</span>
                  </div>
                )}
                {activeQuote.discountOverridePending && (
                  <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-300 text-[11px]">
                    A further discount of {(activeQuote.requestedDiscountAmount || 0).toLocaleString()} AED
                    ({(activeQuote.requestedDiscountPercentage || 0).toFixed(1)}%) is awaiting sales-manager
                    approval (RULE-P01) -- the total below reflects only the pre-approved, capped discount.
                  </div>
                )}
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal (Net):</span>
                  <span className="font-mono text-zinc-200">{((activeQuote.baseTotal || 0) + (activeQuote.extraServicesTotal || 0) - (activeQuote.discountAmount || 0)).toLocaleString()} AED</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>UAE VAT (5%):</span>
                  <span className="font-mono text-zinc-200">{(activeQuote.vatAmount || 0).toLocaleString()} AED</span>
                </div>
                <div className="flex justify-between text-base font-bold text-zinc-100 pt-2 border-t border-zinc-800">
                  <span>Grand Total:</span>
                  <span className="font-mono text-[#f5d97f]">{(activeQuote.grandTotal || 0).toLocaleString()} AED</span>
                </div>
                <div className="flex justify-between text-xs text-zinc-400 pt-1">
                  <span>Security Deposit (Refundable):</span>
                  <span className="font-mono text-zinc-300">{(activeQuote.securityDeposit || 0).toLocaleString()} AED</span>
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
                  onClick={() => setQuotationToPrint(activeQuote)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-[#D4AF37] hover:text-zinc-950 text-zinc-100 border border-zinc-700 text-xs font-bold transition-all shadow-md"
                >
                  <Printer className="w-4 h-4 text-[#D4AF37]" />
                  <span>{language === 'ar' ? 'معاينة وطباعة الهيد ليتر الرسمي / PDF' : 'Official Letterhead & PDF'}</span>
                </button>

                {activeQuote.status !== 'accepted' && (
                  <button
                    onClick={() => handleConvert(activeQuote)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Convert to Reservation</span>
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
        title="Prepare VIP Quotation"
        subtitle="Select customer, vehicle, and dates to calculate UAE VAT & pricing"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Customer *</label>
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
              <label className="block text-zinc-400 font-medium mb-1">Vehicle *</label>
              <select
                required
                value={form.vehicleId}
                onChange={(e) => handleVehicleSelect(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} - {v.dailyRate} AED/day
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate.split('T')[0]}
                onChange={(e) => setForm({ ...form, startDate: e.target.value + 'T10:00:00Z' })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate.split('T')[0]}
                onChange={(e) => setForm({ ...form, endDate: e.target.value + 'T10:00:00Z' })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Duration (Days)</label>
              <input
                type="number"
                min="1"
                value={form.durationDays}
                onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1">Discount (AED, before VAT)</label>
            <input
              type="number"
              min="0"
              value={form.discountAmount}
              onChange={(e) => setForm({ ...form, discountAmount: Math.max(0, Number(e.target.value)) })}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              A discount above your role's ceiling is automatically capped and routed to a sales-manager approval -- the quotation is still created immediately at the capped, safe total (RULE-P01).
            </p>
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
              className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold"
            >
              Generate Quotation
            </button>
          </div>
        </form>
      </Modal>

      {/* Official Letterhead Quotation Modal */}
      {quotationToPrint && (
        <OfficialQuotationPrintModal
          isOpen={!!quotationToPrint}
          onClose={() => setQuotationToPrint(null)}
          quotation={quotationToPrint}
        />
      )}
    </div>
  );
};
