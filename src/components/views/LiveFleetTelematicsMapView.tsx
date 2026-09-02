import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Car, Gauge, Link2, Loader2, MapPin, Radio, RefreshCw, Satellite, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { apiFetch } from '../../lib/apiFetch';
import { formatDateTime } from '../../lib/dateFormat';

interface LivePosition {
  provider: 'etqan';
  providerDeviceId: string;
  vehicleId?: string;
  plateNumber?: string;
  vehicleName?: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  speedKmh?: number;
  headingDeg?: number;
  ignitionOn?: boolean;
  odometerKm?: number;
  fuelLevelPercent?: number;
  engineStatus?: string;
  stale: boolean;
}

interface LiveFeedResponse {
  configured: boolean;
  provider: 'etqan';
  fetchedAt?: string;
  linkedCount?: number;
  unlinkedCount?: number;
  positions?: LivePosition[];
  error?: string;
  missingConfiguration?: string[];
}

const REQUIRED_PROVIDER_DELIVERABLES = [
  ['API access', 'Server-to-server API credentials for the Splendor Etqan account (read-only live tracking scope).'],
  ['API documentation', 'Base URL, authentication method, live-position endpoint, field definitions, paging and rate limits.'],
  ['Vehicle/device list', 'Device ID / IMEI for every installed tracker, with the exact Splendor plate or VIN it belongs to.'],
  ['Live fields', 'Latitude, longitude, provider/device timestamp, speed and ignition; odometer/fuel/heading if the device exposes them.'],
  ['History & events', 'Trip-history endpoint plus geofence/overspeed/ignition/tamper event API or signed webhooks, if supported.'],
  ['Security', 'Webhook-signature method, IP allow-list requirements, token rotation process, sandbox/test device and support contact.']
] as const;

export const LiveFleetTelematicsMapView: React.FC = () => {
  const { language } = useLanguage();
  const { vehicles, setSelectedVehicleId, setActiveView } = useCRM();
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<LiveFeedResponse | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/telematics/live', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      setFeed({
        configured: Boolean(body.configured),
        provider: 'etqan',
        fetchedAt: body.fetchedAt,
        linkedCount: Number(body.linkedCount || 0),
        unlinkedCount: Number(body.unlinkedCount || 0),
        positions: Array.isArray(body.positions) ? body.positions : [],
        error: response.ok ? undefined : (body.error || `HTTP ${response.status}`),
        missingConfiguration: Array.isArray(body.missingConfiguration) ? body.missingConfiguration : []
      });
    } catch (error: any) {
      setFeed({ configured: false, provider: 'etqan', positions: [], error: error?.message || 'Tracking feed could not be loaded.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const positions = feed?.positions || [];
  const selected = useMemo(() => positions.find(position => position.providerDeviceId === selectedDevice) || positions[0], [positions, selectedDevice]);
  const linkedVehicleIds = useMemo(() => new Set(positions.map(position => position.vehicleId).filter(Boolean)), [positions]);
  const vehiclesWithoutMapping = useMemo(() => vehicles.filter(vehicle => !linkedVehicleIds.has(vehicle.id)), [vehicles, linkedVehicleIds]);

  return (
    <div className="space-y-5 pb-12 min-w-0 animate-fade-in">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-xl sm:text-2xl font-display font-bold text-zinc-100">
              <Satellite className="h-5 w-5 text-[#f5d97f]" />
              {language === 'ar' ? 'التتبع المباشر للأسطول — اتقان' : 'Live Fleet Tracking — Etqan'}
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-zinc-400">
              {language === 'ar'
                ? 'هذه الشاشة لا تولّد أو تعرض مواقع وهمية. تظهر المركبة فقط عندما تصل إحداثيات حقيقية من حساب اتقان عبر تكامل خادم إلى خادم ويتم ربط رقم جهاز التتبع بالمركبة المسجلة.'
                : 'This screen never fabricates vehicle locations. A vehicle appears only when a real coordinate arrives from the Etqan account through the server-side integration and its tracking device is mapped to a registered vehicle.'}
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-xs text-zinc-200 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {language === 'ar' ? 'تحديث' : 'Refresh'}
          </button>
        </div>
      </section>

      {feed?.error && (
        <div role="alert" className="rounded-2xl border border-amber-800/50 bg-amber-950/20 p-4 text-xs text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-bold">{language === 'ar' ? 'تكامل اتقان غير جاهز للبث الحي' : 'Etqan live integration is not ready'}</div>
              <div className="mt-1 text-amber-300/80">{feed.error}</div>
              {!!feed.missingConfiguration?.length && <div className="mt-2 font-mono text-[10px] text-zinc-400">{feed.missingConfiguration.join(' · ')}</div>}
            </div>
          </div>
        </div>
      )}

      {!feed?.configured && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
          <h3 className="flex items-center gap-2 font-bold text-zinc-100"><Link2 className="h-4 w-4 text-sky-400" />{language === 'ar' ? 'المطلوب من شركة اتقان لتشغيل الربط' : 'What Etqan must provide for activation'}</h3>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {REQUIRED_PROVIDER_DELIVERABLES.map(([title, description]) => (
              <div key={title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="text-xs font-bold text-zinc-200">{title}</div>
                <div className="mt-1 text-[11px] leading-5 text-zinc-500">{description}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-5 text-zinc-500">
            {language === 'ar'
              ? 'مفاتيح اتقان تحفظ في أسرار الخادم فقط ولا تُرسل للمتصفح أو Firestore. بعد استلام مستندات الـAPI يتم ضبط أسماء الحقول كما يعرّفها اتقان بالضبط وربط كل Device ID بالسيارة من ملف المركبة.'
              : 'Etqan credentials stay in server secrets only and are never exposed to the browser or Firestore. Once the provider API contract is received, its exact field mapping is configured and each Device ID is linked from the vehicle master.'}
          </p>
        </section>
      )}

      {feed?.configured && !feed.error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric icon={<Radio className="h-4 w-4" />} label={language === 'ar' ? 'إشارات مستلمة' : 'Live pings'} value={String(positions.length)} />
            <Metric icon={<ShieldCheck className="h-4 w-4" />} label={language === 'ar' ? 'مرتبطة بسيارات' : 'Linked vehicles'} value={String(feed.linkedCount || 0)} />
            <Metric icon={<Link2 className="h-4 w-4" />} label={language === 'ar' ? 'أجهزة غير مرتبطة' : 'Unlinked devices'} value={String(feed.unlinkedCount || 0)} warning={(feed.unlinkedCount || 0) > 0} />
            <Metric icon={<Car className="h-4 w-4" />} label={language === 'ar' ? 'سيارات بلا إشارة مرتبطة' : 'Vehicles without linked ping'} value={String(vehiclesWithoutMapping.length)} warning={vehiclesWithoutMapping.length > 0} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <section className="xl:col-span-7 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="border-b border-zinc-800 p-4 text-xs text-zinc-500">{language === 'ar' ? 'الإحداثيات الحقيقية المستلمة من المزود' : 'Real coordinates received from provider'}</div>
              <div className="max-h-[560px] overflow-y-auto divide-y divide-zinc-800">
                {positions.map(position => (
                  <button key={position.providerDeviceId} onClick={() => setSelectedDevice(position.providerDeviceId)} className="w-full min-w-0 p-4 text-start hover:bg-zinc-900/60">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-100 break-words">{position.vehicleName || (language === 'ar' ? 'جهاز غير مربوط بسيارة' : 'Unlinked tracking device')}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-zinc-500 break-all">{position.plateNumber || '—'} · {position.providerDeviceId}</div>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${position.stale ? 'border-amber-800 text-amber-400' : 'border-emerald-800 text-emerald-400'}`}>{position.stale ? (language === 'ar' ? 'إشارة قديمة' : 'STALE') : (language === 'ar' ? 'مباشر' : 'LIVE')}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                      <span><MapPin className="me-1 inline h-3 w-3" />{position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}</span>
                      {position.speedKmh !== undefined && <span><Gauge className="me-1 inline h-3 w-3" />{position.speedKmh} km/h</span>}
                      <span>{formatDateTime(position.timestamp)}</span>
                    </div>
                  </button>
                ))}
                {positions.length === 0 && <div className="p-10 text-center text-sm text-zinc-500">{language === 'ar' ? 'المزود متصل لكن لم يرسل أي إحداثيات صالحة حالياً.' : 'Provider is configured but no valid live coordinates were returned.'}</div>}
              </div>
            </section>

            <section className="xl:col-span-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 min-w-0">
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-lg font-bold text-zinc-100 break-words">{selected.vehicleName || selected.providerDeviceId}</div>
                    <div className="text-[10px] font-mono text-zinc-500 break-all">{selected.providerDeviceId}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <Data label={language === 'ar' ? 'خط العرض' : 'Latitude'} value={selected.latitude.toFixed(6)} />
                    <Data label={language === 'ar' ? 'خط الطول' : 'Longitude'} value={selected.longitude.toFixed(6)} />
                    <Data label={language === 'ar' ? 'السرعة' : 'Speed'} value={selected.speedKmh === undefined ? '—' : `${selected.speedKmh} km/h`} />
                    <Data label={language === 'ar' ? 'الإشعال' : 'Ignition'} value={selected.ignitionOn === undefined ? '—' : selected.ignitionOn ? 'ON' : 'OFF'} />
                    <Data label={language === 'ar' ? 'العداد' : 'Odometer'} value={selected.odometerKm === undefined ? '—' : `${selected.odometerKm} km`} />
                    <Data label={language === 'ar' ? 'الوقود' : 'Fuel'} value={selected.fuelLevelPercent === undefined ? '—' : `${selected.fuelLevelPercent}%`} />
                  </div>
                  {selected.vehicleId && <button onClick={() => { setSelectedVehicleId(selected.vehicleId!); setActiveView('fleet'); }} className="w-full rounded-xl bg-[#D4AF37] px-4 py-2.5 text-xs font-black text-zinc-950">{language === 'ar' ? 'فتح ملف السيارة' : 'Open vehicle profile'}</button>}
                </div>
              ) : <div className="py-12 text-center text-sm text-zinc-500">{language === 'ar' ? 'اختر إشارة من القائمة.' : 'Select a live ping.'}</div>}
            </section>
          </div>
        </>
      )}
    </div>
  );
};

function Metric({ icon, label, value, warning = false }: { icon: React.ReactNode; label: string; value: string; warning?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${warning ? 'border-amber-900/50 bg-amber-950/15' : 'border-zinc-800 bg-zinc-950'}`}><div className="flex items-center gap-2 text-[11px] text-zinc-500">{icon}{label}</div><div className="mt-2 text-2xl font-black text-zinc-100">{value}</div></div>;
}

function Data({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3"><div className="text-[10px] text-zinc-500">{label}</div><div className="mt-1 break-all font-mono text-zinc-200">{value}</div></div>;
}
