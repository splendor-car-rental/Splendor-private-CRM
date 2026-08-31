import React, { useState, useMemo } from 'react';
import { 
  Calculator, TrendingUp, DollarSign, Calendar, 
  Car, ShieldAlert, Sparkles, HelpCircle, CheckCircle2,
  PieChart, BarChart3, ArrowRight, RefreshCw
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { formatAED } from '../../lib/currency';

export const FleetAcquisitionRoiView: React.FC = () => {
  const { language } = useLanguage();
  const { vehicles } = useCRM();

  // Input States
  const [vehicleName, setVehicleName] = useState('Rolls-Royce Spectre Coupe 2026');
  const [purchasePriceAed, setPurchasePriceAed] = useState<number>(2400000);
  const [expectedDailyRateAed, setExpectedDailyRateAed] = useState<number>(7500);
  const [expectedUtilizationPercent, setExpectedUtilizationPercent] = useState<number>(65);
  const [holdingPeriodYears, setHoldingPeriodYears] = useState<number>(3);
  const [expectedResidualValuePercent, setExpectedResidualValuePercent] = useState<number>(55); // Resale value %
  const [annualInsuranceCostAed, setAnnualInsuranceCostAed] = useState<number>(45000);
  const [annualMaintenanceCostAed, setAnnualMaintenanceCostAed] = useState<number>(35000);
  const [annualRegistrationSalikAed, setAnnualRegistrationSalikAed] = useState<number>(5000);

  // --- Linus-Grade Mathematical Financial Engine ---
  const calculations = useMemo(() => {
    // 1. Revenue
    const daysPerYear = 365;
    const rentedDaysPerYear = Math.round((daysPerYear * expectedUtilizationPercent) / 100);
    const annualRentalRevenue = rentedDaysPerYear * expectedDailyRateAed;
    const totalRentalRevenueOverHorizon = annualRentalRevenue * holdingPeriodYears;

    // 2. Operational Costs
    const totalAnnualOperatingCost = annualInsuranceCostAed + annualMaintenanceCostAed + annualRegistrationSalikAed;
    const totalOperatingCostsOverHorizon = totalAnnualOperatingCost * holdingPeriodYears;

    // 3. Depreciation & Capital
    const estimatedResaleValue = (purchasePriceAed * expectedResidualValuePercent) / 100;
    const totalDepreciation = purchasePriceAed - estimatedResaleValue;

    // 4. Net Profit & Margins
    const netOperatingProfit = totalRentalRevenueOverHorizon - totalOperatingCostsOverHorizon;
    const netOverallProfit = netOperatingProfit - totalDepreciation;
    
    // 5. Payback Period (Months to recover initial investment net of operations)
    const monthlyNetOperatingIncome = (annualRentalRevenue - totalAnnualOperatingCost) / 12;
    const paybackPeriodMonths = monthlyNetOperatingIncome > 0 
      ? Math.round((purchasePriceAed / monthlyNetOperatingIncome) * 10) / 10
      : 0;

    // 6. Annualized ROI (%)
    const totalRoiPercent = purchasePriceAed > 0 
      ? Math.round((netOverallProfit / purchasePriceAed) * 100 * 10) / 10 
      : 0;
    const annualizedRoiPercent = Math.round((totalRoiPercent / holdingPeriodYears) * 10) / 10;

    return {
      rentedDaysPerYear,
      annualRentalRevenue,
      totalRentalRevenueOverHorizon,
      totalAnnualOperatingCost,
      totalOperatingCostsOverHorizon,
      estimatedResaleValue,
      totalDepreciation,
      netOperatingProfit,
      netOverallProfit,
      monthlyNetOperatingIncome,
      paybackPeriodMonths,
      totalRoiPercent,
      annualizedRoiPercent
    };
  }, [
    purchasePriceAed,
    expectedDailyRateAed,
    expectedUtilizationPercent,
    holdingPeriodYears,
    expectedResidualValuePercent,
    annualInsuranceCostAed,
    annualMaintenanceCostAed,
    annualRegistrationSalikAed
  ]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100 flex items-center gap-2.5">
            <Calculator className="w-6 h-6 text-[#f5d97f]" />
            <span>{language === 'ar' ? 'محاكي الاستثمار وشراء الأسطول (Fleet Acquisition ROI Simulator)' : 'Vehicle Acquisition Intelligence & ROI Simulator'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {language === 'ar' 
              ? 'نمذجة مالية مسبقة لشراء السوبركار: احتساب فترة الاسترداد، العائد على رأس المال، الإهلاك والقيمة التخريدية' 
              : 'Pre-purchase feasibility engine: CapEx payback period, residual value curves, and net fleet contribution'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Inputs Panel (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#f5d97f] flex items-center gap-2">
            <Car className="w-4 h-4" />
            <span>{language === 'ar' ? 'معايير الاستثمار والسيارة المستهدفة' : 'Asset & Financial Parameters'}</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">
                {language === 'ar' ? 'اسم السيارة / الموديل المستهدف' : 'Vehicle Model / Target Asset'}
              </label>
              <input
                type="text"
                value={vehicleName}
                onChange={e => setVehicleName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700/90 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  {language === 'ar' ? 'سعر الشراء (درهم)' : 'Purchase Price (AED)'}
                </label>
                <input
                  type="number"
                  value={purchasePriceAed}
                  onChange={e => setPurchasePriceAed(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700/90 rounded-xl px-3.5 py-2 text-zinc-100 font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  {language === 'ar' ? 'سعر الإيجار اليومي المتوقع' : 'Expected Daily Rate (AED)'}
                </label>
                <input
                  type="number"
                  value={expectedDailyRateAed}
                  onChange={e => setExpectedDailyRateAed(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700/90 rounded-xl px-3.5 py-2 text-zinc-100 font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  {language === 'ar' ? 'نسبة الإشغال المتوقعة (%)' : 'Expected Utilization (%)'}
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={expectedUtilizationPercent}
                  onChange={e => setExpectedUtilizationPercent(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700/90 rounded-xl px-3.5 py-2 text-zinc-100 font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  {language === 'ar' ? 'فترة الاحتفاظ (سنوات)' : 'Holding Period (Years)'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={holdingPeriodYears}
                  onChange={e => setHoldingPeriodYears(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700/90 rounded-xl px-3.5 py-2 text-zinc-100 font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  {language === 'ar' ? 'القيمة التخريدية بعد المدة (%)' : 'Residual Resale Value (%)'}
                </label>
                <input
                  type="number"
                  value={expectedResidualValuePercent}
                  onChange={e => setExpectedResidualValuePercent(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700/90 rounded-xl px-3.5 py-2 text-zinc-100 font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  {language === 'ar' ? 'التأمين الشامل السنوي' : 'Annual Insurance (AED)'}
                </label>
                <input
                  type="number"
                  value={annualInsuranceCostAed}
                  onChange={e => setAnnualInsuranceCostAed(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700/90 rounded-xl px-3.5 py-2 text-zinc-100 font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  {language === 'ar' ? 'الصيانة والقطع السنوية' : 'Annual Maintenance (AED)'}
                </label>
                <input
                  type="number"
                  value={annualMaintenanceCostAed}
                  onChange={e => setAnnualMaintenanceCostAed(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700/90 rounded-xl px-3.5 py-2 text-zinc-100 font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  {language === 'ar' ? 'ترخيص وتجهيزات سنوية' : 'Registration & Misc (AED)'}
                </label>
                <input
                  type="number"
                  value={annualRegistrationSalikAed}
                  onChange={e => setAnnualRegistrationSalikAed(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700/90 rounded-xl px-3.5 py-2 text-zinc-100 font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Output Dashboard (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Main Hero KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800">
              <span className="text-[11px] text-zinc-400 font-medium">{language === 'ar' ? 'فترة استرداد رأس المال' : 'CapEx Payback Period'}</span>
              <div className="text-2xl font-bold font-mono text-[#f5d97f] mt-1">
                {calculations.paybackPeriodMonths} {language === 'ar' ? 'شهر' : 'months'}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                {language === 'ar' ? 'استرداد كامل سعر الشراء' : 'Full CapEx recovery'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800">
              <span className="text-[11px] text-zinc-400 font-medium">{language === 'ar' ? 'العائد السنوي على الاستثمار' : 'Annualized ROI'}</span>
              <div className={`text-2xl font-bold font-mono mt-1 ${calculations.annualizedRoiPercent > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {calculations.annualizedRoiPercent}%
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                {calculations.totalRoiPercent}% {language === 'ar' ? 'إجمالي المدة' : 'total horizon ROI'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800">
              <span className="text-[11px] text-zinc-400 font-medium">{language === 'ar' ? 'صافي المساهمة الربحية' : 'Net Total Contribution'}</span>
              <div className="text-2xl font-bold font-mono text-cyan-300 mt-1">
                {formatAED(calculations.netOverallProfit)}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                {language === 'ar' ? `خلال ${holdingPeriodYears} سنوات كاملة` : `Over ${holdingPeriodYears} full years`}
              </p>
            </div>

          </div>

          {/* Breakdown Table */}
          <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl space-y-3 text-xs">
            <h4 className="font-bold text-zinc-200 uppercase tracking-wider flex items-center justify-between">
              <span>{language === 'ar' ? 'تفصيل التدفقات المالية المتوقعة' : 'Projected Cashflow Breakdown'}</span>
              <span className="text-[10px] font-mono text-[#f5d97f] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                {vehicleName}
              </span>
            </h4>

            <div className="divide-y divide-zinc-800/80">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-zinc-400">{language === 'ar' ? 'إجمالي إيراد التأجير المتوقع' : 'Projected Gross Rental Revenue'}</span>
                <span className="font-mono font-bold text-emerald-400">{formatAED(calculations.totalRentalRevenueOverHorizon)}</span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-zinc-400">{language === 'ar' ? 'إجمالي تكاليف التشغيل (تأمين + صيانة + ترخيص)' : 'Total Operating Costs (Opex)'}</span>
                <span className="font-mono font-bold text-rose-400">-{formatAED(calculations.totalOperatingCostsOverHorizon)}</span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-zinc-400">{language === 'ar' ? 'إهلاك رأس المال التقديري' : 'Estimated Asset Depreciation'}</span>
                <span className="font-mono font-bold text-amber-400">-{formatAED(calculations.totalDepreciation)}</span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-zinc-400">{language === 'ar' ? 'القيمة التخريدية المتوقعة عند البيع' : 'Estimated Resale Inflow'}</span>
                <span className="font-mono font-bold text-zinc-200">{formatAED(calculations.estimatedResaleValue)}</span>
              </div>

              <div className="py-3 flex items-center justify-between bg-zinc-900/60 px-3 rounded-xl">
                <span className="font-bold text-zinc-100">{language === 'ar' ? 'صافي الربح الفعلي بعد كل المصاريف' : 'Final Net Profit (NPV Equivalent)'}</span>
                <span className="font-mono font-bold text-base text-[#f5d97f]">{formatAED(calculations.netOverallProfit)}</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
