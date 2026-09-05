import React, { useState, useMemo } from 'react';
import { 
  Activity, Car, Calendar, Clock, AlertTriangle, 
  CheckCircle2, ArrowUpRight, ArrowDownRight, ShieldAlert,
  Search, Filter, RefreshCw, Send, MessageCircle, FileText,
  UserCheck, Shield, ChevronRight, Sparkles, Navigation, Layers
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { formatAED } from '../../lib/currency';
import { formatDate } from '../../lib/dateFormat';

export const OperationsControlRoomView: React.FC = () => {
  const { language } = useLanguage();
  const { 
    vehicles, contracts, customers, reservations, 
    tasks, setActiveView, setSelectedContractId, setSelectedVehicleId, setSelectedCustomerId 
  } = useCRM();

  const [activeTab, setActiveTab] = useState<'deliveries' | 'returns' | 'late' | 'maintenance' | 'incidents'>('deliveries');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const now = useMemo(() => new Date(), []);
  const todayStr = now.toISOString().split('T')[0];

  // 1. Today's Deliveries / Outgoing Handovers
  const todayDeliveries = useMemo(() => {
    return contracts.filter(c => {
      const isTodayStart = c.startDateTime?.startsWith(todayStr);
      return (c.status === 'draft' || c.status === 'approved' || c.status === 'signed' || c.status === 'active') && isTodayStart;
    });
  }, [contracts, todayStr]);

  // 2. Today's Expected Returns
  const todayReturns = useMemo(() => {
    return contracts.filter(c => {
      const isTodayEnd = c.endDateTime?.startsWith(todayStr);
      return c.status === 'active' && isTodayEnd;
    });
  }, [contracts, todayStr]);

  // 3. Late / Overdue Returns
  const lateReturns = useMemo(() => {
    const nowTime = now.getTime();
    return contracts.filter(c => {
      const endTime = new Date(c.endDateTime).getTime();
      return c.status === 'active' && endTime < nowTime && !c.endDateTime.startsWith(todayStr);
    });
  }, [contracts, now, todayStr]);

  // 4. Vehicles Down / Maintenance
  const vehiclesDown = useMemo(() => {
    return vehicles.filter(v => v.status === 'maintenance' || (v as any).status === 'accident' || (v as any).status === 'held');
  }, [vehicles]);

  // 5. Open Incidents / Tasks
  const openIncidentTasks = useMemo(() => {
    return tasks.filter(t => t.status !== 'completed' && (t.priority === 'urgent' || t.priority === 'high' || (t as any).category === 'maintenance'));
  }, [tasks]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Header & Sovereign Blueprint Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-[#071328] via-zinc-950 to-[#0B1E3B] p-6 rounded-3xl border border-blue-900/40 shadow-2xl shadow-blue-950/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-mono uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
              {language === 'ar' ? 'غرفة العمليات المركزية المباشرة' : 'ENTERPRISE OPERATIONS CONTROL ROOM'}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">SPLENDOR OS 2.0</span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-display font-bold text-zinc-100 flex items-center gap-3">
            <Activity className="w-7 h-7 text-blue-400" />
            <span>{language === 'ar' ? 'مركز القيادة والعمليات الميدانية' : 'Real-Time Operations Control Room'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
            {language === 'ar' 
              ? 'مراقبة فورية للتسليمات، الإرجاعات، العقود المتأخرة، الأعطال، وفحص المركبات قبل تحولها لملاحظات عملاء'
              : 'Live operational pulse: dispatch management, digital handovers, overdue return intercept, and incident mitigation'}
          </p>
        </div>
      </div>

      {/* Hero Operational Triage Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        
        {/* 1. Today Deliveries */}
        <div 
          onClick={() => setActiveTab('deliveries')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'deliveries' 
              ? 'bg-gradient-to-b from-blue-950/80 to-zinc-950 border-blue-500 ring-2 ring-blue-500/20 shadow-xl' 
              : 'bg-zinc-950/90 hover:bg-zinc-900 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>{language === 'ar' ? 'تسليمات اليوم' : "Today's Deliveries"}</span>
            <ArrowUpRight className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-blue-300 mt-2">{todayDeliveries.length}</div>
          <div className="text-[10px] text-zinc-500 mt-1">{language === 'ar' ? 'مجدولة للخروج' : 'Pending dispatch'}</div>
        </div>

        {/* 2. Today Returns */}
        <div 
          onClick={() => setActiveTab('returns')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'returns' 
              ? 'bg-gradient-to-b from-emerald-950/80 to-zinc-950 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xl' 
              : 'bg-zinc-950/90 hover:bg-zinc-900 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>{language === 'ar' ? 'إرجاعات اليوم' : "Today's Returns"}</span>
            <ArrowDownRight className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-2">{todayReturns.length}</div>
          <div className="text-[10px] text-zinc-500 mt-1">{language === 'ar' ? 'فحص واستلام' : 'Due for inspection'}</div>
        </div>

        {/* 3. Late Returns */}
        <div 
          onClick={() => setActiveTab('late')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'late' 
              ? 'bg-gradient-to-b from-rose-950/80 to-zinc-950 border-rose-500 ring-2 ring-rose-500/20 shadow-xl' 
              : 'bg-zinc-950/90 hover:bg-zinc-900 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>{language === 'ar' ? 'عقود متأخرة' : 'Late / Overdue'}</span>
            <Clock className="w-4 h-4 text-rose-400" />
          </div>
          <div className={`text-2xl font-bold font-mono mt-2 ${lateReturns.length > 0 ? 'text-rose-400' : 'text-zinc-300'}`}>
            {lateReturns.length}
          </div>
          <div className="text-[10px] text-rose-500/80 mt-1 font-medium">{language === 'ar' ? 'تتطلب تدخلاً فورياً' : 'Immediate escalation'}</div>
        </div>

        {/* 4. Vehicles Down */}
        <div 
          onClick={() => setActiveTab('maintenance')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'maintenance' 
              ? 'bg-gradient-to-b from-amber-950/80 to-zinc-950 border-amber-500 ring-2 ring-amber-500/20 shadow-xl' 
              : 'bg-zinc-950/90 hover:bg-zinc-900 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>{language === 'ar' ? 'سيارات بالورشة' : 'Vehicles Down'}</span>
            <Car className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-2">{vehiclesDown.length}</div>
          <div className="text-[10px] text-zinc-500 mt-1">{language === 'ar' ? 'صيانة أو حجز' : 'In workshop / held'}</div>
        </div>

        {/* 5. Open Incidents */}
        <div 
          onClick={() => setActiveTab('incidents')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
            activeTab === 'incidents' 
              ? 'bg-gradient-to-b from-indigo-950/80 to-zinc-950 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xl' 
              : 'bg-zinc-950/90 hover:bg-zinc-900 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>{language === 'ar' ? 'بلاغات ومهام عاجلة' : 'Open Incidents'}</span>
            <ShieldAlert className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-300 mt-2">{openIncidentTasks.length}</div>
          <div className="text-[10px] text-zinc-500 mt-1">{language === 'ar' ? 'مهام ميدانية حرجة' : 'High priority tasks'}</div>
        </div>

      </div>

      {/* Active Stream Table / Dispatcher */}
      <div className="rounded-3xl border border-blue-900/30 bg-zinc-950 shadow-2xl overflow-hidden">
        
        {/* Table Top Controls */}
        <div className="p-4 bg-gradient-to-r from-zinc-900 via-[#071328] to-zinc-900 border-b border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-300">
              {activeTab === 'deliveries' && (language === 'ar' ? 'جدول تسليمات اليوم للعملاء' : "Today's Delivery Dispatch Schedule")}
              {activeTab === 'returns' && (language === 'ar' ? 'جدول الإرجاع واستلام السيارات' : "Today's Vehicle Return Stream")}
              {activeTab === 'late' && (language === 'ar' ? 'العقود المتأخرة والتحصيل الميداني' : "Overdue Rental Intercept Queue")}
              {activeTab === 'maintenance' && (language === 'ar' ? 'حالة الصيانة وإصلاح الأسطول' : "Fleet Maintenance & Down Time Tracker")}
              {activeTab === 'incidents' && (language === 'ar' ? 'البلاغات والمهام التشغيلية العاجلة' : "Critical Operational Incident Queue")}
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute start-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={language === 'ar' ? 'بحث بالعميل، اللوحة، أو العقد...' : 'Search customer, plate, contract...'}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl ps-9 pe-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Content Stream */}
        <div className="overflow-x-auto">
          {activeTab === 'deliveries' && (
            <table className="w-full text-start text-xs min-w-[820px]">
              <thead className="bg-zinc-900/60 text-zinc-400 font-semibold border-b border-zinc-800">
                <tr>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'العميل' : 'Customer'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'السيارة المخصصة' : 'Allocated Supercar'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'موعد التسليم' : 'Delivery Slot'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'قيمة العقد' : 'Contract Total'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'حالة التجهيز' : 'Handover Status'}</th>
                  <th className="p-3.5 text-end">{language === 'ar' ? 'إجراءات الميدان' : 'Field Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {todayDeliveries.length > 0 ? (
                  todayDeliveries.map(c => {
                    const vehicle = vehicles.find(v => v.id === c.vehicleId);
                    return (
                      <tr key={c.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="p-3.5">
                          <div className="font-semibold text-zinc-100">{c.customerName}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{c.contractNumber || c.id}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-medium text-blue-300">{vehicle?.make} {vehicle?.model}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{vehicle?.plateNumber}</div>
                        </td>
                        <td className="p-3.5 font-mono text-zinc-300">
                          {formatDate(c.startDateTime)}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-emerald-400">
                          {formatAED(c.grandTotal || 0)}
                        </td>
                        <td className="p-3.5">
                          <Badge variant={c.status === 'active' ? 'emerald' : 'amber'}>
                            {c.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-end space-x-2 rtl:space-x-reverse">
                          <button
                            onClick={() => {
                              setSelectedContractId(c.id);
                              setActiveView('inspections');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-semibold transition-all"
                          >
                            {language === 'ar' ? 'فحص وتسليم رقمي' : 'Digital Handover'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500">
                      {language === 'ar' ? 'لا توجد تسليمات مجدولة متبقية لليوم.' : 'No more pending deliveries for today.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'returns' && (
            <table className="w-full text-start text-xs min-w-[820px]">
              <thead className="bg-zinc-900/60 text-zinc-400 font-semibold border-b border-zinc-800">
                <tr>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'العميل' : 'Customer'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'السيارة العائدة' : 'Returning Vehicle'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'موعد الإرجاع' : 'Return Time'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'الوديعة المحتجزة' : 'Held Deposit'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'حالة العقد' : 'Status'}</th>
                  <th className="p-3.5 text-end">{language === 'ar' ? 'إجراء الاستلام' : 'Return Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {todayReturns.length > 0 ? (
                  todayReturns.map(c => {
                    const vehicle = vehicles.find(v => v.id === c.vehicleId);
                    return (
                      <tr key={c.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="p-3.5">
                          <div className="font-semibold text-zinc-100">{c.customerName}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{c.contractNumber || c.id}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-medium text-emerald-300">{vehicle?.make} {vehicle?.model}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{vehicle?.plateNumber}</div>
                        </td>
                        <td className="p-3.5 font-mono text-zinc-300">
                          {formatDate(c.endDateTime)}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-amber-400">
                          {formatAED(c.depositAmount || 5000)}
                        </td>
                        <td className="p-3.5">
                          <Badge variant="sky">ACTIVE RETURNING</Badge>
                        </td>
                        <td className="p-3.5 text-end space-x-2 rtl:space-x-reverse">
                          <button
                            onClick={() => {
                              setSelectedContractId(c.id);
                              setActiveView('inspections');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all"
                          >
                            {language === 'ar' ? 'فحص الاستلام ومقارنة الذكاء' : 'AI Return Inspection'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500">
                      {language === 'ar' ? 'لا توجد إرجاعات مجدولة متبقية لليوم.' : 'No vehicle returns expected today.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'late' && (
            <table className="w-full text-start text-xs min-w-[820px]">
              <thead className="bg-zinc-900/60 text-zinc-400 font-semibold border-b border-zinc-800">
                <tr>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'العميل' : 'Customer'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'السيارة المتأخرة' : 'Overdue Vehicle'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'تاريخ انتهاء العقد' : 'Contract Expired'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'التأخير' : 'Overdue By'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'الرصيد / الغرامات' : 'Exposure'}</th>
                  <th className="p-3.5 text-end">{language === 'ar' ? 'إجراء التصعيد' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {lateReturns.length > 0 ? (
                  lateReturns.map(c => {
                    const vehicle = vehicles.find(v => v.id === c.vehicleId);
                    const daysLate = Math.max(1, Math.round((now.getTime() - new Date(c.endDateTime).getTime()) / (1000 * 60 * 60 * 24)));
                    return (
                      <tr key={c.id} className="hover:bg-zinc-900/40 transition-colors bg-rose-950/10">
                        <td className="p-3.5">
                          <div className="font-semibold text-rose-300">{c.customerName}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{c.contractNumber || c.id}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-medium text-zinc-100">{vehicle?.make} {vehicle?.model}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{vehicle?.plateNumber}</div>
                        </td>
                        <td className="p-3.5 font-mono text-zinc-400">
                          {formatDate(c.endDateTime)}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-rose-400">
                          {daysLate} {language === 'ar' ? 'أيام تأخير' : 'days overdue'}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-amber-400">
                          {formatAED(c.grandTotal || 0)}
                        </td>
                        <td className="p-3.5 text-end space-x-2 rtl:space-x-reverse">
                          <button
                            onClick={() => {
                              setSelectedCustomerId(c.customerId);
                              setActiveView('whatsapp-inbox');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold inline-flex items-center gap-1 transition-all"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedContractId(c.id);
                              setActiveView('contracts');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all"
                          >
                            {language === 'ar' ? 'العقد' : 'Contract'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500">
                      {language === 'ar' ? 'ممتاز! لا توجد عقود متأخرة حالياً.' : 'All contracts are within authorized schedule.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'maintenance' && (
            <table className="w-full text-start text-xs min-w-[820px]">
              <thead className="bg-zinc-900/60 text-zinc-400 font-semibold border-b border-zinc-800">
                <tr>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'السيارة' : 'Vehicle'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'اللوحة' : 'Plate'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'العداد الحالي' : 'Mileage'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'السبب / الورشة' : 'Reason / Workshop'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="p-3.5 text-end">{language === 'ar' ? 'إجراء الفحص' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {vehiclesDown.length > 0 ? (
                  vehiclesDown.map(v => (
                    <tr key={v.id} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="p-3.5">
                        <div className="font-semibold text-zinc-100">{v.make} {v.model} {v.year}</div>
                        <div className="text-[10px] text-zinc-400">{v.category}</div>
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        {v.plateNumber}
                      </td>
                      <td className="p-3.5 font-mono text-amber-400">
                        {v.mileage?.toLocaleString() || 0} km
                      </td>
                      <td className="p-3.5 text-zinc-400">
                        {language === 'ar' ? 'صيانة دورية معتمدة' : 'Scheduled Luxury Service'}
                      </td>
                      <td className="p-3.5">
                        <Badge variant="rose">MAINTENANCE</Badge>
                      </td>
                      <td className="p-3.5 text-end">
                        <button
                          onClick={() => {
                            setSelectedVehicleId(v.id);
                            setActiveView('fleet');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all"
                        >
                          {language === 'ar' ? 'سجل الصيانة' : 'Service Log'}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500">
                      {language === 'ar' ? 'جميع سيارات الأسطول جاهزة ومتاحة للتشغيل.' : 'All fleet vehicles ready for operation.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'incidents' && (
            <table className="w-full text-start text-xs min-w-[680px]">
              <thead className="bg-zinc-900/60 text-zinc-400 font-semibold border-b border-zinc-800">
                <tr>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'المهمة / البلاغ' : 'Incident / Task'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'المسؤول الميداني' : 'Assigned To'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'الأولوية' : 'Priority'}</th>
                  <th className="p-3.5 text-start">{language === 'ar' ? 'الموعد النهائي' : 'Due Date'}</th>
                  <th className="p-3.5 text-end">{language === 'ar' ? 'الإجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {openIncidentTasks.length > 0 ? (
                  openIncidentTasks.map(t => (
                    <tr key={t.id} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="p-3.5">
                        <div className="font-semibold text-zinc-100">{t.title}</div>
                        <div className="text-[10px] text-zinc-400">{t.description}</div>
                      </td>
                      <td className="p-3.5 text-zinc-300">
                        {(t as any).assignedToName || (t as any).assignedTo || 'Operations Team'}
                      </td>
                      <td className="p-3.5">
                        <Badge variant={t.priority === 'urgent' ? 'rose' : 'amber'}>
                          {t.priority.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="p-3.5 font-mono text-zinc-400">
                        {formatDate(t.dueDate)}
                      </td>
                      <td className="p-3.5 text-end">
                        <button
                          onClick={() => setActiveView('tasks')}
                          className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-semibold transition-all"
                        >
                          {language === 'ar' ? 'متابعة المهمة' : 'Manage Task'}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-zinc-500">
                      {language === 'ar' ? 'لا توجد بلاغات عاجلة حالياً.' : 'No open critical incidents.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

      </div>

    </div>
  );
};
