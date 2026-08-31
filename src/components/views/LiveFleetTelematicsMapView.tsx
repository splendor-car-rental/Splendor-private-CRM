import React, { useState, useMemo } from 'react';
import { 
  Navigation, MapPin, Car, ShieldAlert, Gauge, Fuel, 
  Layers, Filter, Eye, CheckCircle2, AlertTriangle, Radio,
  Sparkles, ChevronRight, Activity, Zap
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { formatAED } from '../../lib/currency';
import { Vehicle } from '../../types';

// Preset real coordinates around key Dubai luxury hubs
const DUBAI_LUXURY_LOCATIONS: Record<string, { lat: number; lng: number; areaEn: string; areaAr: string }> = {
  'DXB-DOWNTOWN': { lat: 25.1972, lng: 55.2744, areaEn: 'Downtown Dubai (Burj Khalifa / Fashion Ave)', areaAr: 'وسط مدينة دبي (برج خليفة / فاشن أفينيو)' },
  'DXB-MARINA': { lat: 25.0805, lng: 55.1403, areaEn: 'Dubai Marina & JBR Walk', areaAr: 'دبي مارينا وممشى جي بي آر' },
  'DXB-PALM': { lat: 25.1124, lng: 55.1390, areaEn: 'Palm Jumeirah (Atlantis The Royal)', areaAr: 'نخلة جميرا (أتلانتس ذا رويال)' },
  'DXB-DIFC': { lat: 25.2104, lng: 55.2798, areaEn: 'DIFC Financial District', areaAr: 'مركز دبي المالي العالمي (DIFC)' },
  'DXB-AIRPORT': { lat: 25.2532, lng: 55.3657, areaEn: 'Dubai International Airport (VIP Terminal)', areaAr: 'مطار دبي الدولي (صالة كبار الشخصيات)' },
  'DXB-HQ': { lat: 25.2048, lng: 55.2708, areaEn: 'Splendor Luxury Flagship HQ (Business Bay)', areaAr: 'المقر الرئيسي لسبلندر (الخليج التجاري)' }
};

export const LiveFleetTelematicsMapView: React.FC = () => {
  const { language } = useLanguage();
  const { vehicles, contracts, setSelectedVehicleId, setActiveView } = useCRM();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);

  // Status mapping as defined in Splendor OS Specification
  const statusColorMap: Record<string, { bg: string; text: string; dot: string; labelEn: string; labelAr: string }> = {
    available: { bg: 'bg-emerald-950/60', text: 'text-emerald-400', dot: 'bg-emerald-400', labelEn: 'AVAILABLE', labelAr: 'متاح للإيجار' },
    rented: { bg: 'bg-blue-950/60', text: 'text-sky-400', dot: 'bg-sky-400', labelEn: 'RENTED (ON TRIP)', labelAr: 'مؤجر حالياً' },
    reserved: { bg: 'bg-amber-950/60', text: 'text-amber-400', dot: 'bg-amber-400', labelEn: 'RESERVED', labelAr: 'محجوز' },
    returning: { bg: 'bg-orange-950/60', text: 'text-orange-400', dot: 'bg-orange-400', labelEn: 'RETURNING TODAY', labelAr: 'قيد الإرجاع اليوم' },
    maintenance: { bg: 'bg-rose-950/60', text: 'text-rose-400', dot: 'bg-rose-400', labelEn: 'MAINTENANCE', labelAr: 'في الصيانة' },
    held: { bg: 'bg-zinc-900', text: 'text-zinc-400', dot: 'bg-zinc-500', labelEn: 'HELD / VIP LOCK', labelAr: 'موقوف / حجز خاص' }
  };

  // Mock enrich vehicles with high-fidelity telemetry positions
  const enrichedFleet = useMemo(() => {
    const keys = Object.keys(DUBAI_LUXURY_LOCATIONS);
    return vehicles.map((v, i) => {
      const locKey = keys[i % keys.length];
      const loc = DUBAI_LUXURY_LOCATIONS[locKey];
      const currentContract = contracts.find(c => c.vehicleId === v.id && c.status === 'active');
      const isRented = v.status === 'rented';

      return {
        ...v,
        currentLocation: loc,
        telemetry: {
          currentSpeed: isRented ? Math.floor(65 + (i * 12) % 60) : 0,
          fuelLevel: Math.floor(70 + (i * 7) % 30),
          batteryVoltage: 13.8,
          gpsSignal: 'STRONG 5G',
          engineStatus: isRented ? 'RUNNING' : 'STANDBY_LOCKED',
          lastPing: '2 mins ago'
        },
        activeContract: currentContract
      };
    });
  }, [vehicles, contracts]);

  const filteredFleet = useMemo(() => {
    if (statusFilter === 'ALL') return enrichedFleet;
    return enrichedFleet.filter(v => v.status === statusFilter);
  }, [enrichedFleet, statusFilter]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100 flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-[#f5d97f] animate-pulse" />
            <span>{language === 'ar' ? 'رادار الأسطول وخريطة التتبع المباشرة (Live Fleet Radar)' : 'Live Fleet Telematics & GPS Command Radar'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {language === 'ar' 
              ? 'مراقبة لحظية لمواقع السوبركار عبر دبي والإمارات: السرعة، استهلاك الوقود، حالة المحرك، وتنبيهات السرعة' 
              : 'Real-time telemetry streaming across Dubai & UAE sovereign envelope: speed, fuel, geofencing, and engine health'}
          </p>
        </div>

        {/* Legend status toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          {['ALL', 'available', 'rented', 'reserved', 'maintenance'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                statusFilter === st 
                  ? 'bg-zinc-800 text-[#f5d97f] border-[#D4AF37]' 
                  : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 border-zinc-800'
              }`}
            >
              {st === 'ALL' ? (language === 'ar' ? 'الكل' : 'ALL') : (statusColorMap[st]?.labelEn || st)}
            </button>
          ))}
        </div>
      </div>

      {/* Main Radar Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Map / Radar Canvas View (8 cols) */}
        <div className="lg:col-span-8 rounded-3xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-2xl relative min-h-[520px] flex flex-col">
          
          {/* Radar Top Bar */}
          <div className="p-4 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                {language === 'ar' ? 'بث الإحداثيات اللحظي • دبي' : 'DUBAI SOVEREIGN GPS RADAR'}
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              {filteredFleet.length} {language === 'ar' ? 'مركبة نشطة على الرادار' : 'vehicles tracked'}
            </span>
          </div>

          {/* Interactive Visual Map Simulation */}
          <div className="flex-1 relative bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 flex flex-col justify-between overflow-hidden">
            
            {/* Background Grid Lines to evoke high-tech Radar */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

            {/* Dubai Key Landmarks overlay */}
            <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(DUBAI_LUXURY_LOCATIONS).map(([key, loc]) => {
                const carsAtLoc = filteredFleet.filter(f => f.currentLocation?.areaEn === loc.areaEn);
                return (
                  <div key={key} className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-sm space-y-1">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span className="text-[11px] font-semibold text-zinc-200 truncate">
                        {language === 'ar' ? loc.areaAr : loc.areaEn}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono flex items-center justify-between">
                      <span>{carsAtLoc.length} {language === 'ar' ? 'سيارات هنا' : 'vehicles'}</span>
                      <span className="text-emerald-400 font-bold">{carsAtLoc.filter(c => c.status === 'available').length} Avail</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Vehicles on Radar Nodes */}
            <div className="relative z-10 my-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {filteredFleet.map(car => {
                const st = statusColorMap[car.status] || statusColorMap.available;
                const isSelected = selectedVehicle?.id === car.id;

                return (
                  <div
                    key={car.id}
                    onClick={() => setSelectedVehicle(car)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected 
                        ? 'bg-zinc-800 border-[#D4AF37] ring-1 ring-[#D4AF37]/50 shadow-lg' 
                        : 'bg-zinc-900/90 hover:bg-zinc-800/80 border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full ${st.dot} shrink-0`} />
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-zinc-100 truncate">
                          {car.make} {car.model}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono truncate">
                          {car.plateNumber} • {car.currentLocation?.areaEn.split('(')[0]}
                        </div>
                      </div>
                    </div>

                    <div className="text-end shrink-0 ms-2">
                      <span className="text-xs font-mono font-bold text-[#f5d97f]">{car.telemetry.currentSpeed} km/h</span>
                      <div className="text-[10px] text-zinc-400 font-mono">{car.telemetry.fuelLevel}% Fuel</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Status Bar */}
            <div className="relative z-10 pt-3 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {language === 'ar' ? 'الحدود الجغرافية: آمنة ومحمية' : 'Geofence Envelope: Sovereign UAE'}
                </span>
              </div>
              <span className="font-mono text-zinc-500">Live 100ms Telemetry Pipeline</span>
            </div>

          </div>
        </div>

        {/* Selected Vehicle Telemetry Telemetry Inspector (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {selectedVehicle ? (
            <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#f5d97f] bg-zinc-900 px-2.5 py-1 rounded-full border border-zinc-800">
                  {selectedVehicle.category.replace('_', ' ')}
                </span>
                <Badge variant={selectedVehicle.status === 'rented' ? 'sky' : 'emerald'}>
                  {selectedVehicle.status.toUpperCase()}
                </Badge>
              </div>

              <div>
                <h3 className="text-lg font-display font-bold text-zinc-100">
                  {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year}
                </h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Plate: {selectedVehicle.plateNumber} • VIN: {selectedVehicle.vin?.slice(-8) || 'N/A'}
                </p>
              </div>

              {/* Telemetry Gauge Box */}
              <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-[#D4AF37]" />
                    {language === 'ar' ? 'السرعة الآن' : 'Live Speed'}
                  </span>
                  <span className="font-mono font-bold text-base text-[#f5d97f]">
                    {(selectedVehicle as any).telemetry?.currentSpeed || 0} km/h
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <Fuel className="w-4 h-4 text-emerald-400" />
                    {language === 'ar' ? 'مستوى الوقود' : 'Fuel / Battery'}
                  </span>
                  <span className="font-mono font-bold text-zinc-200">
                    {(selectedVehicle as any).telemetry?.fuelLevel || 85}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-400" />
                    {language === 'ar' ? 'الموقع اللحظي' : 'Current Area'}
                  </span>
                  <span className="text-[11px] text-zinc-300 font-medium truncate max-w-[140px]">
                    {(selectedVehicle as any).currentLocation?.areaEn.split('(')[0] || 'Dubai'}
                  </span>
                </div>
              </div>

              {/* Active Contract Info if Rented */}
              {(selectedVehicle as any).activeContract && (
                <div className="p-4 rounded-2xl bg-sky-950/30 border border-sky-500/30 space-y-2">
                  <div className="text-[10px] font-bold uppercase text-sky-400">
                    {language === 'ar' ? 'العقد النشط المرتبط' : 'Active Contract Connected'}
                  </div>
                  <div className="text-xs font-semibold text-zinc-200">
                    {(selectedVehicle as any).activeContract.customerName}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400">
                    {(selectedVehicle as any).activeContract.contractNumber} • {formatAED((selectedVehicle as any).activeContract.grandTotal)}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => {
                    setSelectedVehicleId(selectedVehicle.id);
                    setActiveView('fleet');
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200 hover:text-white transition-all text-center"
                >
                  {language === 'ar' ? 'ملف المركبة الكامل' : 'Open Vehicle File'}
                </button>
              </div>

            </div>
          ) : (
            <div className="p-8 rounded-3xl bg-zinc-950 border border-zinc-800 text-center text-zinc-500 text-xs">
              {language === 'ar' ? 'اختر مركبة من الرادار لمعاينة بياناتها' : 'Select a vehicle from the radar to inspect telemetry'}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
