import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote, Car, CircleDollarSign, Gauge, Loader2, RefreshCw,
  TrendingDown, TrendingUp, WalletCards
} from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useCRM } from '../../context/CRMContext';
import { calculateFleetCommandMetrics } from '../../server/fleetCommandMetrics';
import type { CashFlowForecast, FinanceDashboardSummary, VehicleProfitabilityRow } from '../../accounting/types';

type ExecutiveDashboardResponse = {
  dashboard: FinanceDashboardSummary;
  cashFlowForecast: CashFlowForecast;
  topVehicles: VehicleProfitabilityRow[];
  bottomVehicles: VehicleProfitabilityRow[];
};

const money = (value: number | undefined) => `${(Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} د.إ`;

async function getJson<T>(url: string): Promise<T> {
  const response = await apiFetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `فشل الطلب (${response.status})`);
  return body as T;
}

export const ExecutiveDashboardView: React.FC = () => {
  const { vehicles, contracts, reservations, showToast } = useCRM();
  const [data, setData] = useState<ExecutiveDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [horizonDays, setHorizonDays] = useState(30);

  const fleetMetrics = useMemo(
    () => calculateFleetCommandMetrics(vehicles, contracts, reservations, new Date()),
    [vehicles, contracts, reservations]
  );

  const refresh = async (days: number) => {
    setLoading(true);
    try {
      const result = await getJson<ExecutiveDashboardResponse>(`/api/accounting/executive-dashboard?horizonDays=${days}`);
      setData(result);
    } catch (err: any) {
      showToast('تعذر تحميل اللوحة التنفيذية', err?.message || 'حدث خطأ أثناء تحميل البيانات المالية.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh(horizonDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizonDays]);

  const dashboard = data?.dashboard;
  const forecast = data?.cashFlowForecast;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-zinc-100 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-amber-400" /> لوحة التحليلات التنفيذية
          </h1>
          <p className="text-xs text-zinc-500 mt-1">نظرة تنفيذية موحّدة على الإيرادات، الأسطول، والتدفقات النقدية المتوقعة.</p>
        </div>
        <button
          onClick={() => refresh(horizonDays)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} تحديث
        </button>
      </div>

      {/* Revenue & profitability */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="إيرادات اليوم" value={money(dashboard?.revenueToday)} icon={<Banknote className="w-4 h-4" />} />
        <Kpi title="إيرادات الشهر" value={money(dashboard?.revenueMonth)} icon={<TrendingUp className="w-4 h-4" />} />
        <Kpi title="صافي الربح الشهري" value={money(dashboard?.netProfitMonth)} icon={<CircleDollarSign className="w-4 h-4" />} />
        <Kpi title="الرصيد النقدي الحالي" value={money(dashboard?.cashPosition)} icon={<WalletCards className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Mini label="ذمم العملاء المستحقة" value={money(dashboard?.arOutstanding)} />
        <Mini label="ذمم الموردين المستحقة" value={money(dashboard?.apOutstanding)} />
        <Mini label="ضريبة القيمة المضافة المستحقة" value={money(dashboard?.vatPayable)} />
        <Mini label="ودائع التأمين المحتجزة" value={money(dashboard?.securityDepositsHeld)} />
      </div>

      {/* Fleet utilization -- computed client-side from the same live vehicle/contract/reservation
          data every other screen uses, so it never disagrees with the rest of the app. */}
      <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2"><Car className="w-4 h-4 text-blue-400" /> إشغال الأسطول</h2>
          <span className="text-2xl font-bold text-blue-400">{fleetMetrics.utilizationPercent}%</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Mini label="إجمالي المركبات" value={String(fleetMetrics.totalVehicles)} />
          <Mini label="مؤجرة" value={String(fleetMetrics.rented)} />
          <Mini label="محجوزة" value={String(fleetMetrics.reserved)} />
          <Mini label="متاحة" value={String(fleetMetrics.available)} />
          <Mini label="في الصيانة" value={String(fleetMetrics.maintenance)} />
        </div>
      </div>

      {/* Cash flow forecast */}
      <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2"><WalletCards className="w-4 h-4 text-emerald-400" /> توقع التدفق النقدي</h2>
          <div className="flex items-center gap-1.5">
            {[30, 60, 90].map(days => (
              <button
                key={days}
                onClick={() => setHorizonDays(days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${horizonDays === days ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-zinc-950/60 text-zinc-400 border border-zinc-800'}`}
              >
                {days} يوم
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Mini label="الرصيد الحالي" value={money(forecast?.currentCash)} />
          <Mini label="متوقع التحصيل" value={money(forecast?.expectedInflows)} />
          <Mini label="متوقع الدفع" value={money(forecast?.expectedOutflows)} />
          <Mini label="الرصيد المتوقع" value={money(forecast?.projectedClosingCash)} />
        </div>
        {(forecast?.overdueInflows || forecast?.overdueOutflows) ? (
          <p className="text-[11px] text-amber-400 mt-3">
            متضمن ذمم متأخرة السداد: {money(forecast?.overdueInflows)} من العملاء و{money(forecast?.overdueOutflows)} مستحقة للموردين.
          </p>
        ) : null}
        <p className="text-[10px] text-zinc-600 mt-2">
          تقدير مبني على الفواتير وفواتير الموردين المستحقة حتى {forecast?.horizonEndDate || '—'}، ولا يشمل مصروفات تشغيلية لم تُرحّل بعد.
        </p>
      </div>

      {/* Vehicle profitability leaders/laggards */}
      <div className="grid md:grid-cols-2 gap-4">
        <VehicleRankTable title="الأعلى ربحية" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} rows={data?.topVehicles || []} />
        <VehicleRankTable title="الأقل ربحية" icon={<TrendingDown className="w-4 h-4 text-rose-400" />} rows={data?.bottomVehicles || []} />
      </div>
    </div>
  );
};

const Kpi: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] text-zinc-500 font-semibold">{title}</p>
      <span className="text-amber-400">{icon}</span>
    </div>
    <p className="text-lg font-bold text-zinc-100 mt-2 truncate">{value}</p>
  </div>
);

const Mini: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
    <p className="text-[10px] text-zinc-500">{label}</p>
    <p className="text-sm font-bold text-zinc-100 mt-1">{value}</p>
  </div>
);

const VehicleRankTable: React.FC<{ title: string; icon: React.ReactNode; rows: VehicleProfitabilityRow[] }> = ({ title, icon, rows }) => (
  <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800 overflow-hidden">
    <div className="px-4 py-3 border-b border-zinc-800 font-bold text-sm text-zinc-100 flex items-center gap-2">{icon} {title}</div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-zinc-950/60 text-zinc-500">
          <tr>
            <th className="p-3 text-start font-medium whitespace-nowrap">المركبة</th>
            <th className="p-3 text-start font-medium whitespace-nowrap">الإيراد</th>
            <th className="p-3 text-start font-medium whitespace-nowrap">صافي الربح</th>
            <th className="p-3 text-start font-medium whitespace-nowrap">العائد %</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={4} className="p-4 text-center text-zinc-600">لا توجد بيانات كافية بعد.</td></tr>
          ) : rows.map(row => (
            <tr key={row.vehicleId} className="border-t border-zinc-800/60">
              <td className="p-3 text-zinc-300 whitespace-nowrap">{row.vehicleName || row.vehicleId}</td>
              <td className="p-3 text-zinc-300 whitespace-nowrap font-mono">{money(row.revenue)}</td>
              <td className={`p-3 whitespace-nowrap font-mono ${row.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(row.netProfit)}</td>
              <td className="p-3 text-zinc-300 whitespace-nowrap font-mono">{row.roiPercent?.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
