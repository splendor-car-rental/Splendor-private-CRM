import React, { useState, useMemo } from 'react';
import { 
  Sparkles, TrendingUp, AlertTriangle, CheckCircle2, 
  Car, Users, Calendar, DollarSign, ArrowUpRight, ArrowDownRight,
  ShieldAlert, RefreshCw, Send, ChevronRight, Zap, Target,
  FileText, Clock, HelpCircle
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { formatAED } from '../../lib/currency';
import { formatDate } from '../../lib/dateFormat';

interface CeoMorningBriefModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CeoMorningBriefModal: React.FC<CeoMorningBriefModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const { 
    vehicles, contracts, customers, bankTransactions, 
    leads, payments, invoices, queryAI, setActiveView, setSelectedContractId, setSelectedCustomerId 
  } = useCRM();

  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  // --- Real Mathematical Analytics (Linus-Grade Precision) ---
  const today = useMemo(() => new Date(), []);
  
  // 1. Yesterday / Today Operational Pulse
  const activeContracts = useMemo(() => contracts.filter(c => c.status === 'active'), [contracts]);
  const totalFleet = vehicles.length;
  const rentedVehicles = useMemo(() => vehicles.filter(v => v.status === 'rented'), [vehicles]);
  const utilizationRate = totalFleet > 0 ? Math.round((rentedVehicles.length / totalFleet) * 100) : 0;
  
  const totalCollectedToday = useMemo(() => {
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [payments]);

  // 2. Critical Exceptions & Attention Items
  const overdueContracts = useMemo(() => {
    const now = Date.now();
    return contracts.filter(c => c.status === 'active' && new Date(c.endDateTime).getTime() < now);
  }, [contracts]);

  const vehiclesNeedingService = useMemo(() => {
    return vehicles.filter(v => {
      if (v.status === 'maintenance') return true;
      const km = v.mileage || 0;
      const nextSvc = (v as any).nextServiceMileage || 10000;
      return km >= nextSvc || (nextSvc - km) <= 500;
    });
  }, [vehicles]);

  const unreconciledTxns = useMemo(() => {
    return bankTransactions.filter(t => !t.reconciled);
  }, [bankTransactions]);

  const highValueDebtors = useMemo(() => {
    return customers.filter(c => (c.outstandingBalance || 0) > 20000);
  }, [customers]);

  // 3. 30-Day Predictive Revenue Run-Rate
  const projected30DayRevenue = useMemo(() => {
    const activeDailyRunRate = activeContracts.reduce((sum, c) => {
      const days = Math.max(1, Math.round((new Date(c.endDateTime).getTime() - new Date(c.startDateTime).getTime()) / (1000 * 60 * 60 * 24)));
      const daily = (c.grandTotal || 0) / days;
      return sum + daily;
    }, 0);
    return Math.round(activeDailyRunRate * 30);
  }, [activeContracts]);

  // 4. Vehicle Profitability Ranking
  const topProfitableCars = useMemo(() => {
    return [...vehicles].sort((a, b) => {
      const revA = contracts.filter(c => c.vehicleId === a.id).reduce((s, c) => s + (c.grandTotal || 0), 0);
      const revB = contracts.filter(c => c.vehicleId === b.id).reduce((s, c) => s + (c.grandTotal || 0), 0);
      return revB - revA;
    }).slice(0, 3);
  }, [vehicles, contracts]);

  if (!isOpen) return null;

  const handleAskSplendorBrain = async (promptText?: string) => {
    const query = promptText || aiQuestion;
    if (!query.trim() || aiLoading) return;
    setAiLoading(true);
    setAiAnswer(null);

    const contextData = `
CEO Real-Time Context:
- Fleet Size: ${totalFleet} luxury supercars (${rentedVehicles.length} currently rented, ${utilizationRate}% utilization).
- Active Contracts: ${activeContracts.length} with projected 30-day run rate of AED ${projected30DayRevenue.toLocaleString()}.
- Overdue active contracts needing return: ${overdueContracts.length}.
- Vehicles due for service/maintenance: ${vehiclesNeedingService.length}.
- Unreconciled bank ledger entries: ${unreconciledTxns.length}.
- Top profitable cars: ${topProfitableCars.map(c => `${c.make} ${c.model} (${c.plateNumber})`).join(', ')}.
- High value customers with outstanding balance > 20k AED: ${highValueDebtors.length}.
`;

    try {
      const res = await queryAI(`${contextData}\nExecutive Question from CEO: "${query}"\nProvide a concise, direct, authoritative executive answer distinguishing real data, forecast, and actionable recommendation.`, language);
      setAiAnswer(res.text || 'No response generated.');
    } catch (e: any) {
      setAiAnswer(e?.message || 'Error processing executive query.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="bg-zinc-950 border border-[#D4AF37]/40 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-zinc-900 via-zinc-950 to-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-[#f5d97f]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-widest uppercase font-bold text-[#D4AF37]">
                  {language === 'ar' ? 'الموجز الصباحي للمدير التنفيذي' : 'EXECUTIVE MORNING BRIEF'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono">
                  {formatDate(today.toISOString())}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-display font-bold text-zinc-100 mt-0.5">
                {language === 'ar' ? 'صباح الخير، سعادة الرئيس التنفيذي' : 'Good Morning, CEO'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold border border-zinc-700 transition-all"
          >
            {language === 'ar' ? 'إغلاق' : 'Close Brief'}
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-zinc-200">
          
          {/* Top 3 Core Executive Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Card 1: Operational Pulse */}
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>{language === 'ar' ? 'نبض الأسطول الحالي' : 'Live Fleet Utilization'}</span>
                <Car className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-[#f5d97f]">{utilizationRate}%</span>
                <span className="text-xs text-zinc-400">({rentedVehicles.length} / {totalFleet} {language === 'ar' ? 'مؤجرة' : 'rented'})</span>
              </div>
              <div className="mt-2 w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-gradient-to-r from-[#D4AF37] to-amber-300 h-full rounded-full" style={{ width: `${utilizationRate}%` }} />
              </div>
            </div>

            {/* Card 2: Active Run Rate */}
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>{language === 'ar' ? 'توقع إيرادات 30 يوماً' : '30-Day Revenue Forecast'}</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400">
                  {formatAED(projected30DayRevenue)}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                {language === 'ar' ? `مستند على معدل ${activeContracts.length} عقود نشطة` : `Based on ${activeContracts.length} active rental contracts`}
              </p>
            </div>

            {/* Card 3: Critical Exceptions */}
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>{language === 'ar' ? 'استثناءات تتطلب تدخلك' : 'Action Required Today'}</span>
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-2xl sm:text-3xl font-bold font-mono ${overdueContracts.length + vehiclesNeedingService.length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {overdueContracts.length + vehiclesNeedingService.length + (unreconciledTxns.length > 0 ? 1 : 0)}
                </span>
                <span className="text-xs text-zinc-400">{language === 'ar' ? 'تنبيهات فورية' : 'urgent alerts'}</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                {overdueContracts.length} {language === 'ar' ? 'عقود متأخرة' : 'overdue returns'}, {vehiclesNeedingService.length} {language === 'ar' ? 'صيانة لازمة' : 'maintenance due'}
              </p>
            </div>

          </div>

          {/* Attention Required Items Detailed List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>{language === 'ar' ? 'الأولويات التنفيذية العاجلة لهذا اليوم' : 'Critical Items Requiring Attention'}</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              
              {/* Overdue Returns */}
              <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800/90 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">
                    {language === 'ar' ? 'عقود متأخرة عن موعد الإرجاع' : 'Overdue Vehicle Returns'}
                  </span>
                  <Badge variant={overdueContracts.length > 0 ? 'rose' : 'emerald'}>
                    {overdueContracts.length}
                  </Badge>
                </div>
                {overdueContracts.length > 0 ? (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {overdueContracts.map(c => (
                      <div key={c.id} className="flex items-center justify-between text-xs p-2 rounded-xl bg-zinc-950 border border-zinc-800/80">
                        <div>
                          <span className="font-mono text-[#f5d97f]">{c.contractNumber || c.id}</span>
                          <span className="text-zinc-400 ml-2">{c.customerName}</span>
                        </div>
                        <button 
                          onClick={() => {
                            setSelectedContractId(c.id);
                            setActiveView('contracts');
                            onClose();
                          }}
                          className="text-[11px] text-zinc-400 hover:text-[#f5d97f] flex items-center gap-0.5"
                        >
                          <span>{language === 'ar' ? 'عرض' : 'View'}</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 py-1">{language === 'ar' ? 'جميع السيارات ملتزمة بمواعيد العقود.' : 'All vehicles on track.'}</p>
                )}
              </div>

              {/* Maintenance & Servicing */}
              <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800/90 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">
                    {language === 'ar' ? 'سيارات اقتربت من موعد السيرفس' : 'Fleet Service & Maintenance Due'}
                  </span>
                  <Badge variant={vehiclesNeedingService.length > 0 ? 'amber' : 'emerald'}>
                    {vehiclesNeedingService.length}
                  </Badge>
                </div>
                {vehiclesNeedingService.length > 0 ? (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {vehiclesNeedingService.map(v => (
                      <div key={v.id} className="flex items-center justify-between text-xs p-2 rounded-xl bg-zinc-950 border border-zinc-800/80">
                        <div>
                          <span className="font-semibold text-zinc-200">{v.make} {v.model}</span>
                          <span className="font-mono text-zinc-400 ml-2">({v.plateNumber})</span>
                        </div>
                        <span className="text-[10px] text-amber-400 font-mono">{v.mileage} km</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 py-1">{language === 'ar' ? 'الأسطول بحالة ممتازة ومجدول.' : 'Fleet service health is optimal.'}</p>
                )}
              </div>

            </div>
          </div>

          {/* Splendor Brain - Executive AI Direct Query */}
          <div className="p-5 rounded-2xl bg-gradient-to-b from-[#D4AF37]/10 to-zinc-900/60 border border-[#D4AF37]/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-[#f5d97f]" />
                <h4 className="text-sm font-display font-bold text-[#f5d97f]">
                  {language === 'ar' ? 'اسأل عقل سبلندر الذكي (Splendor Brain)' : 'Splendor Brain — Executive AI Telemetry'}
                </h4>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                Gemini 3.7 Pro
              </span>
            </div>

            {/* Quick Executive Prompts */}
            <div className="flex flex-wrap gap-2">
              {[
                language === 'ar' ? 'ما أكثر سيارة حققت ربحية هذا الشهر؟' : 'Which vehicle is most profitable this month?',
                language === 'ar' ? 'ما السيارات التي ينبغي بيعها أو استبدالها؟' : 'Which vehicles should we consider liquidating?',
                language === 'ar' ? 'ما توقعات التدفق النقدي للأسبوع القادم؟' : 'What is our expected cashflow for next week?'
              ].map((quick, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setAiQuestion(quick);
                    handleAskSplendorBrain(quick);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-[11px] text-zinc-300 hover:text-[#f5d97f] transition-all text-left"
                >
                  {quick}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={aiQuestion}
                onChange={e => setAiQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAskSplendorBrain()}
                placeholder={language === 'ar' ? 'اطرح أي سؤال تنفيذي حول الأسطول، العقود، أو الأرباح...' : 'Ask any executive question regarding fleet, revenue, or customer risk...'}
                className="flex-1 bg-zinc-950 border border-zinc-700/90 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]"
              />
              <button
                onClick={() => handleAskSplendorBrain()}
                disabled={aiLoading || !aiQuestion.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#c49f27] text-zinc-950 font-semibold text-xs flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>{language === 'ar' ? 'تحليل' : 'Analyze'}</span>
              </button>
            </div>

            {/* AI Response Output */}
            {aiAnswer && (
              <div className="p-4 rounded-xl bg-zinc-950/90 border border-zinc-800 text-xs leading-relaxed text-zinc-300 whitespace-pre-line animate-fade-in">
                {aiAnswer}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <span>{language === 'ar' ? 'سبلندر لتأجير السيارات الفارهة ذ.م.م • دبي' : 'Splendor Car Rental LLC • Dubai Sovereign Platform'}</span>
          <button
            onClick={() => {
              setActiveView('dashboard');
              onClose();
            }}
            className="text-[#f5d97f] hover:underline font-semibold"
          >
            {language === 'ar' ? 'الانتقال إلى لوحة القيادة الكاملة ←' : 'Open Full Operational Dashboard →'}
          </button>
        </div>

      </div>
    </div>
  );
};
