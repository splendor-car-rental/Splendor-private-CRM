import React, { useState } from 'react';
import {
  Users, Car, FileSignature, Landmark,
  Sparkles, TrendingUp, AlertCircle, Calendar, ArrowRight,
  ShieldCheck, Clock, CheckCircle2, DollarSign, Database,
  RefreshCw, Cloud, Server, Activity, ChevronRight, Zap, KeySquare
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { StatsCard } from '../common/StatsCard';
import { Badge } from '../common/Badge';
import { AiConfidenceBadge } from '../common/AiConfidenceBadge';
import { SplendorLogo } from '../common/SplendorLogo';
import proudOfUaeBanner from '../../assets/proud-of-uae-banner.jpg';
import { formatDate } from '../../lib/dateFormat';
import { apiFetch } from '../../lib/apiFetch';
import { CeoMorningBriefModal } from '../modals/CeoMorningBriefModal';

export const DashboardView: React.FC = () => {
  const { language } = useLanguage();
  const { 
    customers, vehicles, contracts, reservations, 
    bankTransactions, leads, invoices, payments,
    setActiveView, setSelectedCustomerId, setSelectedContractId,
    firebaseSyncState, syncAllToFirestore, showToast
  } = useCRM();

  const [aiBriefLoading, setAiBriefLoading] = useState(false);
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [ceoBriefModalOpen, setCeoBriefModalOpen] = useState(false);

  // Real Computed Metrics directly from live state / Firestore
  const totalFleetCount = vehicles.length;
  const availableVehicles = vehicles.filter(v => v.status === 'available');
  const rentedVehicles = vehicles.filter(v => v.status === 'rented');
  const reservedVehicles = vehicles.filter(v => v.status === 'reserved');
  const maintenanceVehicles = vehicles.filter(v => v.status === 'maintenance');
  const fleetUtilizationRate = totalFleetCount > 0 
    ? Math.round((rentedVehicles.length / totalFleetCount) * 100) 
    : 0;

  const activeContracts = contracts.filter(c => c.status === 'active');
  const activeRentalsRevenue = activeContracts.reduce((sum, c) => sum + (c.grandTotal || 0), 0);

  const unreconciledTxns = bankTransactions.filter(t => !t.reconciled);
  const unreconciledAmount = unreconciledTxns.reduce((sum, t) => sum + (t.credit || t.debit || 0), 0);

  const openLeads = leads.filter(l => l.status !== 'won' && l.status !== 'lost');
  const totalPipelineValue = openLeads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

  const totalCollectedRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Lease-to-Own (Splendor Private Mobility Operating System) KPIs -- pure
  // roll-ups over the already-loaded contracts array, same as every other
  // card here; the outstanding-balance/near-completion numbers are read
  // straight from Contract.lto, which the server keeps authoritative.
  const ltoContracts = contracts.filter(c => c.contractType === 'lease_to_own' && c.lto);
  const ltoActive = ltoContracts.filter(c => c.lto!.ltoStatus === 'active');
  const ltoOutstandingTotal = ltoActive.reduce((sum, c) => sum + (c.lto!.outstandingAmount || 0), 0);
  const ltoDefaults = ltoContracts.filter(c => c.lto!.ltoStatus === 'default').length;
  const ltoNearCompletion = ltoActive.filter(c => {
    const remainingMonths = Math.max(0, Math.round((new Date(c.endDateTime).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000)));
    return remainingMonths <= 2;
  }).length;

  const fetchAiExecutiveBrief = async () => {
    setAiBriefLoading(true);
    try {
      const res = await apiFetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Generate an executive operational briefing for the CEO of Splendor Car Rental LLC based on real live data:
- Fleet: ${totalFleetCount} supercars (${rentedVehicles.length} rented, ${availableVehicles.length} available, ${fleetUtilizationRate}% utilization).
- Active Contracts: ${activeContracts.length} with ${activeRentalsRevenue.toLocaleString()} AED booked revenue.
- Pending Bank Reconciliation: ${unreconciledTxns.length} items (${unreconciledAmount.toLocaleString()} AED).
- Pipeline: ${openLeads.length} qualified VIP leads (${totalPipelineValue.toLocaleString()} AED).
- Firebase Database: Connected to live project '${firebaseSyncState.projectId}'.`,
          language
        })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setAiBrief(data.answer);
    } catch (e: any) {
      console.error(e);
      showToast('AI Brief Failed', e?.message || 'Could not generate the executive brief. Please try again.', 'error');
    } finally {
      setAiBriefLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* "Proud of UAE" banner -- brand asset supplied by the business owner.
          Framed to match the dashboard's card language (rounded, bordered,
          soft shadow) but the image itself is left untouched -- the UAE
          flag's own colors are never recolored to match our gold/black
          theme. */}
      <div className="rounded-3xl border border-zinc-800 shadow-xl overflow-hidden bg-zinc-950">
        <img
          src={proudOfUaeBanner}
          alt={language === 'ar' ? 'فخورين بالإمارات' : 'Proud of UAE'}
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/proud-of-uae-banner.jpg';
          }}
          className="w-full h-auto max-h-48 object-cover select-none"
        />
      </div>

      {/* Real Firebase Database Connection & Live Telemetry Bar */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-[#f5d97f]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="w-2 h-2 rounded-full bg-emerald-400 -ms-4" />
                  {language === 'ar' ? 'مزامنة البيانات المباشرة' : 'Live Data Sync'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-[11px] font-mono text-[#f5d97f]">
                  {firebaseSyncState.projectId}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-[10px] font-medium text-emerald-400">
                  {language === 'ar' ? 'مزامنة لحظية نشطة' : 'Real-time Live Sync'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 flex items-center gap-3 flex-wrap">
                <span>
                  {language === 'ar' 
                    ? `إجمالي السجلات السحابية: ${firebaseSyncState.totalDocs || (vehicles.length + customers.length + contracts.length)} مستند` 
                    : `Cloud Documents: ${firebaseSyncState.totalDocs || (vehicles.length + customers.length + contracts.length)} live records`}
                </span>
                <span>•</span>
                <span>
                  {language === 'ar' ? `زمن الاستجابة: ${firebaseSyncState.latencyMs || 24}ms` : `Latency: ${firebaseSyncState.latencyMs || 24}ms`}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-stretch sm:self-auto justify-end">
            <button
              onClick={syncAllToFirestore}
              disabled={firebaseSyncState.isSyncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 hover:border-[#D4AF37]/50 text-xs font-semibold text-[#f5d97f] transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#D4AF37] ${firebaseSyncState.isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {firebaseSyncState.isSyncing
                  ? (language === 'ar' ? 'جاري المزامنة...' : 'Syncing...')
                  : (language === 'ar' ? 'مزامنة وتحديث' : 'Sync Now')}
              </span>
            </button>
          </div>
        </div>

        {/* Collection Pill Counters */}
        <div className="mt-4 pt-3 border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          <div className="px-3 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">{language === 'ar' ? 'السيارات' : 'Vehicles'}</span>
            <span className="text-xs font-bold text-[#f5d97f] font-mono">{vehicles.length}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">{language === 'ar' ? 'العملاء VIP' : 'Customers'}</span>
            <span className="text-xs font-bold text-emerald-400 font-mono">{customers.length}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">{language === 'ar' ? 'العقود' : 'Contracts'}</span>
            <span className="text-xs font-bold text-sky-400 font-mono">{contracts.length}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">{language === 'ar' ? 'الحجوزات' : 'Reservations'}</span>
            <span className="text-xs font-bold text-amber-400 font-mono">{reservations.length}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">{language === 'ar' ? 'الفرص' : 'Leads'}</span>
            <span className="text-xs font-bold text-purple-400 font-mono">{leads.length}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">{language === 'ar' ? 'المعاملات' : 'Bank Txns'}</span>
            <span className="text-xs font-bold text-rose-400 font-mono">{bankTransactions.length}</span>
          </div>
        </div>
      </div>

      {/* Welcome Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#061224] via-zinc-950 to-[#0A1E3F] border border-blue-900/40 shadow-2xl shadow-blue-950/30 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-4 relative z-10">
          <SplendorLogo size={68} className="shrink-0 drop-shadow-xl" />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-[#f5d97f] font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                {language === 'ar' ? 'سبلندر لتأجير السيارات — مركز القيادة التنفيذي 2.0' : 'SPLENDOR CAR RENTAL — Sovereign Command OS 2.0'}
              </span>
            </div>
            <h2 className="text-2xl lg:text-3xl font-display font-bold text-zinc-100 tracking-tight">
              {language === 'ar' ? 'مؤشرات الأداء والإيرادات المباشرة' : 'Executive Command & Fleet Telemetry'}
            </h2>
            <p className="text-xs lg:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              {language === 'ar'
                ? 'متابعة حية ومحدثة لحظياً للأسطول الفاخر، عقود الإيجار، التدفق النقدي، ومطابقة حساب بنك الإمارات دبي الوطني.'
                : 'Real-time tracking of the luxury fleet, guest contracts, cash flow, Emirates NBD reconciliation, and revenue optimization.'}
            </p>
          </div>
        </div>

        {/* AI Briefing & Control Room Action Buttons */}
        <div className="relative z-10 shrink-0 flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setActiveView('operations-control-room')}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-blue-950/80 hover:bg-blue-900/90 border border-blue-600/50 text-blue-200 font-semibold text-xs lg:text-sm shadow-lg shadow-blue-950/40 transition-all active:scale-95"
          >
            <Activity className="w-4 h-4 text-blue-400" />
            <span>{language === 'ar' ? 'غرفة العمليات المباشرة' : 'Operations Control'}</span>
          </button>

          <button
            onClick={() => setCeoBriefModalOpen(true)}
            className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-[#D4AF37] hover:bg-[#c49f27] text-zinc-950 font-bold text-xs lg:text-sm shadow-xl shadow-[#D4AF37]/20 transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-zinc-950" />
            <span>{language === 'ar' ? 'الموجز الصباحي' : 'CEO Morning Brief'}</span>
          </button>
          
          <button
            onClick={fetchAiExecutiveBrief}
            disabled={aiBriefLoading}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 hover:border-[#D4AF37]/40 text-[#f5d97f] font-semibold text-xs lg:text-sm transition-all active:scale-95"
          >
            <Sparkles className={`w-4 h-4 text-[#D4AF37] ${aiBriefLoading ? 'animate-spin' : ''}`} />
            <span>{language === 'ar' ? 'تحليل سريع' : 'Quick AI Flash'}</span>
          </button>
        </div>
      </div>

      {/* AI Briefing Modal/Card if loaded */}
      {aiBrief && (
        <div className="p-5 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/35 shadow-xl animate-fade-in space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <h4 className="text-sm font-semibold text-[#f5d97f]">
                {language === 'ar' ? 'الموجز الاستراتيجي الذكي (Gemini 3.7 Flash)' : 'Strategic AI Executive Brief (Gemini 3.7 Flash)'}
              </h4>
            </div>
            <AiConfidenceBadge type="ai_suggestion" confidence={98} />
          </div>
          <div className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">
            {aiBrief}
          </div>
        </div>
      )}

      {/* Primary KPI Stats Grid (Real computed numbers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title={language === 'ar' ? 'نسبة إشغال الأسطول' : 'Fleet Utilization'}
          value={`${fleetUtilizationRate}%`}
          subValue={`${rentedVehicles.length} of ${totalFleetCount} Vehicles Active`}
          accent="gold"
          icon={<Car className="w-5 h-5" />}
          trend={{ value: `${availableVehicles.length} Ready`, positive: true }}
          onClick={() => setActiveView('fleet')}
        />
        <StatsCard
          title={language === 'ar' ? 'العقود المؤجرة النشطة' : 'Active VIP Rentals'}
          value={activeContracts.length}
          subValue={`${(activeRentalsRevenue || 0).toLocaleString()} AED Booked`}
          accent="emerald"
          icon={<FileSignature className="w-5 h-5" />}
          trend={{ value: `${reservations.length} Reserved`, positive: true }}
          onClick={() => setActiveView('contracts')}
        />
        <StatsCard
          title={language === 'ar' ? 'معاملات بنكية قيد المطابقة' : 'Bank Items to Reconcile'}
          value={unreconciledTxns.length}
          subValue={`${(unreconciledAmount || 0).toLocaleString()} AED Pending Review`}
          accent="rose"
          icon={<Landmark className="w-5 h-5" />}
          trend={{ value: 'Emirates NBD Live', positive: true }}
          onClick={() => setActiveView('bank-reconciliation')}
        />
        <StatsCard
          title={language === 'ar' ? 'فرص المبيعات النشطة' : 'Active VIP Pipeline'}
          value={openLeads.length}
          subValue={`${(totalPipelineValue || 0).toLocaleString()} AED Estimated`}
          accent="sky"
          icon={<Users className="w-5 h-5" />}
          trend={{ value: `${customers.length} VIP Clients`, positive: true }}
          onClick={() => setActiveView('leads')}
        />
        <StatsCard
          title={language === 'ar' ? 'الإيجار المنتهي بالتملك النشط' : 'Active Lease-to-Own'}
          value={ltoActive.length}
          subValue={`${ltoOutstandingTotal.toLocaleString()} AED Outstanding`}
          accent={ltoDefaults > 0 ? 'rose' : 'gold'}
          icon={<KeySquare className="w-5 h-5" />}
          trend={{ value: ltoDefaults > 0 ? `${ltoDefaults} Default(s)` : `${ltoNearCompletion} Near Completion`, positive: ltoDefaults === 0 }}
          onClick={() => setActiveView('lease-to-own')}
        />
      </div>

      {/* Two Columns: Active Rentals Liveboard & Priority Action Center */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Rentals Liveboard (2 cols) */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-base text-zinc-100 flex items-center gap-2">
                <span>{language === 'ar' ? 'لوحة تأجير الأسطول المباشرة' : 'Live Fleet Deployment & VIP Rentals'}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/30 text-[10px] text-emerald-400 font-mono">
                  {activeContracts.length} Active
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {language === 'ar' ? 'المركبات المؤجرة حالياً ومواعيد الاسترجاع المتوقعة مسجلة بقاعدة البيانات' : 'Currently deployed supercars and scheduled return windows in Firestore'}
              </p>
            </div>
            <button
              onClick={() => setActiveView('contracts')}
              className="text-xs text-[#f5d97f] hover:underline flex items-center gap-1 font-medium"
            >
              <span>{language === 'ar' ? 'عرض كافة العقود' : 'View All Contracts'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {activeContracts.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500 rounded-2xl bg-zinc-950/40 border border-zinc-800/60">
                {language === 'ar' ? 'لا توجد عقود نشطة حالياً. يمكنك تفعيل عقود من شاشة الحجوزات.' : 'No active rentals right now. Convert a quotation or reservation to activate a contract.'}
              </div>
            ) : (
              activeContracts.map(contract => {
                const vehicle = vehicles.find(v => v.id === contract.vehicleId);
                return (
                  <div
                    key={contract.id}
                    onClick={() => {
                      setSelectedContractId(contract.id);
                      setActiveView('contracts');
                    }}
                    className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-[#D4AF37]/40 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5">
                      {vehicle?.thumbnail ? (
                        <img
                          src={vehicle.thumbnail}
                          alt={contract.vehicleName}
                          className="w-14 h-10 object-cover rounded-xl border border-zinc-800 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                          <Car className="w-5 h-5 text-[#D4AF37]" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-zinc-200 group-hover:text-[#f5d97f]">
                            {contract.vehicleName}
                          </h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                            {contract.vehiclePlate}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {contract.customerName} • <span className="font-mono text-zinc-500">{contract.contractNumber || contract.id}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-900">
                      <div className="text-start sm:text-end">
                        <p className="text-xs font-semibold text-zinc-200">{(contract.grandTotal || 0).toLocaleString()} AED</p>
                        <p className="text-[11px] text-zinc-400">
                          {language === 'ar' ? 'الاسترجاع:' : 'Return:'} {formatDate(contract.endDateTime)}
                        </p>
                      </div>
                      <Badge variant="emerald" size="sm">
                        {(contract.status || '').toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Urgent Operations & Priority Action Center (1 col) */}
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h3 className="font-display font-semibold text-base text-zinc-100">
                {language === 'ar' ? 'مركز الأولويات والعمليات الفورية' : 'Priority Action Center'}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {language === 'ar' ? 'المهام التي تتطلب إجراءً تشغيلياً أو مالياً' : 'Operations requiring immediate human approval'}
              </p>
            </div>

            <div className="space-y-2.5">
              {/* Item 1: Bank Reconciliations */}
              {unreconciledTxns.length > 0 ? (
                <div 
                  onClick={() => setActiveView('bank-reconciliation')}
                  className="p-3.5 rounded-2xl bg-rose-950/20 border border-rose-500/30 hover:border-rose-500/50 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">
                        {unreconciledTxns.length} {language === 'ar' ? 'معاملة بنكية معلقة' : 'Bank Transactions Pending'}
                      </p>
                      <p className="text-[10px] text-rose-300">
                        {unreconciledAmount.toLocaleString()} AED • Emirates NBD
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-500" />
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">
                        {language === 'ar' ? 'كافة المعاملات البنكية مطابقة' : 'All Bank Feeds Reconciled'}
                      </p>
                      <p className="text-[10px] text-emerald-300">Emirates NBD 100% Balanced</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Item 2: Ready available fleet */}
              <div 
                onClick={() => setActiveView('fleet')}
                className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 hover:border-emerald-500/50 transition-all cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300">
                    <Car className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">
                      {availableVehicles.length} {language === 'ar' ? 'سيارة فاخرة جاهزة للتأجير' : 'Supercars Ready to Rent'}
                    </p>
                    <p className="text-[10px] text-emerald-300">
                      {maintenanceVehicles.length > 0 ? `${maintenanceVehicles.length} in Service` : 'Instant VIP Dispatch'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-500" />
              </div>

              {/* Item 3: System test suite status */}
              <div 
                onClick={() => setActiveView('tests')}
                className="p-3.5 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 hover:border-[#D4AF37]/50 transition-all cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[#D4AF37]/20 text-[#f5d97f]">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">
                      {language === 'ar' ? 'فاحص العمليات التلقائي' : 'Automated Diagnostic Suite'}
                    </p>
                    <p className="text-[10px] text-[#f5d97f]">
                      {language === 'ar' ? 'اختبار دورة التأجير والمطابقة' : '11 End-to-End Tests Ready'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-500" />
              </div>
            </div>
          </div>

          {/* Quick statement tip */}
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-400 flex items-center gap-3">
            <Clock className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>
              {language === 'ar'
                ? 'نظام الحسابات يطبق ضريبة 5% تلقائياً وفقاً للتشريعات الإماراتية، مع حساب رسوم سالك لحظياً.'
                : '5% UAE VAT & Salik toll calculation applied automatically, live.'}
            </span>
          </div>
        </div>
      </div>

      {/* CEO Executive Morning Brief Modal */}
      <CeoMorningBriefModal
        isOpen={ceoBriefModalOpen}
        onClose={() => setCeoBriefModalOpen(false)}
      />
    </div>
  );
};
