import React, { useMemo, useState } from 'react';
import { 
  Car, Plus, Search, Calendar, AlertTriangle, Gauge, Zap, Fuel, 
  CheckCircle2, BarChart3, Filter, Sparkles, SlidersHorizontal 
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { VehicleDetailMasterModal } from '../fleet/VehicleDetailMasterModal';
import { AddVehicleModal } from '../modals/AddVehicleModal';
import { calculateFleetCommandMetrics } from '../../server/fleetCommandMetrics';

export const FleetCRMView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { vehicles, contracts, reservations, checkVehicleAvailability, selectedVehicleId, setSelectedVehicleId } = useCRM();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [testVehicleId, setTestVehicleId] = useState('');
  const [testStartDate, setTestStartDate] = useState(new Date().toISOString().slice(0, 10) + 'T10:00:00Z');
  const [testEndDate, setTestEndDate] = useState(new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10) + 'T10:00:00Z');
  const [availResult, setAvailResult] = useState<any>(null);

  const metrics = useMemo(() => calculateFleetCommandMetrics(vehicles, contracts, reservations), [vehicles, contracts, reservations]);

  const handleTestAvailability = async () => {
    if (!testVehicleId) return;
    setAvailResult(await checkVehicleAvailability(testVehicleId, testStartDate, testEndDate));
  };

  const filteredVehicles = vehicles.filter(v => {
    const s = searchTerm.toLowerCase();
    const matchesSearch = `${v.make || ''} ${v.model || ''}`.toLowerCase().includes(s) || 
      (v.plateNumber || '').toLowerCase().includes(s) || 
      (v.vin || '').toLowerCase().includes(s) ||
      (v.exteriorColor || '').toLowerCase().includes(s);
    return matchesSearch && (categoryFilter === 'all' || v.category === categoryFilter) && (statusFilter === 'all' || v.status === statusFilter);
  });

  const categoryFilters = [
    { id: 'all', labelAr: 'الكل', labelEn: 'All Fleet' },
    { id: 'economy_sedan', labelAr: 'سيدان اقتصادي (هيونداي/كيا/صني)', labelEn: 'Economy Sedans' },
    { id: 'compact_suv', labelAr: 'كروس أوفر مدمج (كريتا/داشينج)', labelEn: 'Compact Crossovers' },
    { id: 'midsize_suv', labelAr: 'SUV عائلي (جيتور T2/توسان)', labelEn: 'Midsize SUVs (Jetour/Tucson)' },
    { id: 'business_sedan', labelAr: 'سيدان أعمال (سوناتا/كامري/K5)', labelEn: 'Business Sedans' },
    { id: 'family_van', labelAr: 'فان وعائلية (ستاريا)', labelEn: 'Vans & MPV' },
    { id: 'executive_suv', labelAr: 'دفع رباعي فاخر VIP', labelEn: 'Executive Luxury SUV' },
    { id: 'supercar', labelAr: 'سوبركار وفارهة', labelEn: 'Supercars' },
    { id: 'ultra_luxury_sedan', labelAr: 'سيدان فاخرة جداً', labelEn: 'Ultra-Luxury Sedans' },
    { id: 'grand_tourer', labelAr: 'جراند تورير', labelEn: 'Grand Tourer' }
  ];

  const kpis = [
    { label: isAr ? 'إجمالي الأسطول' : 'Total Fleet', value: metrics.totalVehicles, icon: Car },
    { label: isAr ? 'متاح فوري' : 'Available', value: metrics.available, icon: CheckCircle2 },
    { label: isAr ? 'تأجير نشط' : 'Active Rentals', value: metrics.rented, icon: Zap },
    { label: isAr ? 'محجوز' : 'Reserved', value: metrics.reserved, icon: Calendar },
    { label: isAr ? 'نسبة التشغيل' : 'Utilization', value: `${metrics.utilizationPercent}%`, icon: BarChart3 },
    { label: isAr ? 'عقود نشطة' : 'Active Contracts', value: metrics.activeContracts, icon: Gauge },
    { label: isAr ? 'حجوزات قادمة' : 'Upcoming', value: metrics.upcomingReservations, icon: Calendar },
    { label: isAr ? 'تحت الصيانة' : 'Maintenance', value: metrics.maintenance, icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Header - Royal Sapphire Luxury Theme */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-[#071328] via-zinc-950 to-[#0B1E3B] border border-blue-900/40 shadow-2xl shadow-blue-950/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-mono uppercase tracking-widest flex items-center gap-1.5">
              <Car className="w-3 h-3 text-blue-400" />
              {isAr ? 'مركز قيادة وتوزيع الأسطول الشامل' : 'FLEET COMMAND & VEHICLE REPOSITORY'}
            </span>
            <span className="text-[10px] text-blue-400/80 font-mono">Splendor OS 2.0</span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-display font-bold text-zinc-100 flex items-center gap-3">
            <span>{isAr ? 'إدارة الأسطول والمركبات (اقتصادي، عائلي، وفاخر)' : 'Fleet Repository & Availability Engine'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
            {isAr
              ? 'متابعة شاملة لأسطول هيونداي، كيا، جيتور، تويوتا، نيسان، إم جي، والسوبركارز الفارهة مع محرك التوفر اللحظي.'
              : 'End-to-end fleet operations for economy sedans, family SUVs, business rentals, and supercars.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => { setTestVehicleId(vehicles[0]?.id || ''); setAvailabilityModalOpen(true); }} 
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-blue-800/60 bg-blue-950/40 text-blue-200 font-semibold text-xs hover:bg-blue-900/40 hover:border-blue-500/50 transition-all cursor-pointer shadow-sm"
          >
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>{isAr ? 'فاحص التعارض' : 'Conflict Checker'}</span>
          </button>
          
          <button 
            onClick={() => setAddModalOpen(true)} 
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs lg:text-sm shadow-xl shadow-blue-600/30 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إضافة مركبة للأسطول' : 'Add Vehicle'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards - Royal Blue Accents */}
      <section aria-label="Fleet Command KPIs" className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl bg-gradient-to-br from-[#071328]/90 to-zinc-950 border border-blue-900/40 p-3.5 shadow-lg">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] uppercase tracking-wider text-blue-300/80 font-semibold truncate">{label}</span>
              <Icon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            </div>
            <p className="mt-2 text-xl font-display font-bold text-white">{value}</p>
          </div>
        ))}
      </section>

      {/* Filter and Search Bar - Royal Blue */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-[#071328]/80 via-zinc-950 to-[#0B1E3B]/60 border border-blue-900/40 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-blue-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder={isAr ? 'بحث بالماركة، الموديل، رقم اللوحة، الشاسيه، اللون...' : 'Search make, model, plate, VIN, color...'} 
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-blue-900/40 text-white placeholder-blue-300/40 focus:outline-none focus:border-blue-400" 
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-blue-300 font-semibold flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              {isAr ? 'حالة المركبة:' : 'Status:'}
            </span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-blue-900/50 text-white text-xs focus:border-blue-400 focus:outline-none cursor-pointer"
            >
              <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="available">{isAr ? 'متاحة للتأجير' : 'Available'}</option>
              <option value="rented">{isAr ? 'مؤجرة حالياً' : 'Active Rental'}</option>
              <option value="reserved">{isAr ? 'محجوزة' : 'Reserved'}</option>
              <option value="maintenance">{isAr ? 'في الصيانة' : 'Maintenance'}</option>
              <option value="unavailable">{isAr ? 'غير متاحة' : 'Unavailable'}</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categoryFilters.map(cat => (
            <button 
              key={cat.id} 
              onClick={() => setCategoryFilter(cat.id)} 
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                categoryFilter === cat.id 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 border border-blue-400' 
                  : 'bg-zinc-900/80 text-blue-200/70 border border-blue-900/30 hover:bg-blue-950/60 hover:text-white'
              }`}
            >
              {isAr ? cat.labelAr : cat.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Vehicles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVehicles.map(vehicle => {
          const statusBadge = { 
            available: <Badge variant="emerald" size="sm">{isAr ? 'متاح فوراً' : 'Available'}</Badge>, 
            rented: <Badge variant="gold" size="sm">{isAr ? 'مؤجرة نشطة' : 'Active Rental'}</Badge>, 
            reserved: <Badge variant="sky" size="sm">{isAr ? 'محجوزة' : 'Reserved'}</Badge>, 
            maintenance: <Badge variant="amber" size="sm">{isAr ? 'صيانة' : 'Maintenance'}</Badge>, 
            unavailable: <Badge variant="zinc" size="sm">{isAr ? 'غير متاح' : 'Unavailable'}</Badge> 
          }[vehicle.status] || <Badge variant="zinc" size="sm">{vehicle.status}</Badge>;

          return (
            <div 
              key={vehicle.id} 
              onClick={() => setSelectedVehicleId(vehicle.id)} 
              className="rounded-3xl bg-gradient-to-br from-[#071328]/95 via-zinc-950 to-[#0B1E3B]/80 border border-blue-900/40 hover:border-blue-500/70 hover:shadow-2xl hover:shadow-blue-950/40 transition-all duration-300 overflow-hidden shadow-xl flex flex-col group cursor-pointer"
            >
              <div className="relative h-48 w-full overflow-hidden bg-zinc-950">
                <img 
                  src={vehicle.thumbnail} 
                  alt={`${vehicle.make} ${vehicle.model}`} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#071328] via-transparent to-black/50" />
                
                <div className="absolute top-3 left-3 bg-[#071328]/90 backdrop-blur-md px-2.5 py-1 rounded-xl border border-blue-800/60 text-[11px] font-mono font-bold text-white shadow">
                  {vehicle.plateCity} {vehicle.plateNumber}
                </div>
                
                <div className="absolute top-3 right-3">
                  {statusBadge}
                </div>
                
                <div className="absolute bottom-3 left-4 right-4">
                  <h3 className="text-lg font-display font-bold text-white group-hover:text-blue-300 transition-colors">
                    {vehicle.make} {vehicle.model}
                  </h3>
                  <p className="text-xs text-blue-200/80 capitalize">
                    {vehicle.year} • {vehicle.exteriorColor} • {vehicle.category.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center text-xs py-2 bg-zinc-950/80 rounded-xl border border-blue-900/40">
                  <div>
                    <span className="text-[10px] uppercase text-blue-300 font-medium flex items-center justify-center gap-1">
                      <Zap className="w-3 h-3 text-blue-400" /> Power
                    </span>
                    <p className="font-bold text-white mt-0.5">{vehicle.horsepower || '—'} HP</p>
                  </div>
                  <div className="border-x border-blue-900/40">
                    <span className="text-[10px] uppercase text-blue-300 font-medium flex items-center justify-center gap-1">
                      <Gauge className="w-3 h-3 text-sky-400" /> Engine
                    </span>
                    <p className="font-bold text-white mt-0.5 truncate px-1">{vehicle.engine || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-blue-300 font-medium flex items-center justify-center gap-1">
                      <Fuel className="w-3 h-3 text-emerald-400" /> Odo
                    </span>
                    <p className="font-bold text-white mt-0.5">{(vehicle.mileage || 0).toLocaleString()} km</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-blue-900/40 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-blue-300/80 uppercase font-medium">{isAr ? 'سعر التأجير اليومي' : 'Daily Rate'}</span>
                    <p className="text-base font-bold text-white">
                      {(vehicle.dailyRate || 0).toLocaleString()} <span className="text-xs text-blue-400 font-semibold">AED/day</span>
                    </p>
                  </div>
                  <div className="text-end">
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">{isAr ? 'مبلغ التأمين' : 'Deposit'}</span>
                    <p className="text-xs font-semibold text-amber-300 font-mono">{(vehicle.minDeposit || 0).toLocaleString()} AED</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredVehicles.length === 0 && (
        <div className="p-12 text-center rounded-3xl bg-zinc-950/80 border border-blue-900/40 space-y-3">
          <Car className="w-10 h-10 text-blue-400 mx-auto opacity-60" />
          <h3 className="text-base font-bold text-white">{isAr ? 'لم يتم العثور على مركبات تطابق البحث' : 'No vehicles match search criteria'}</h3>
          <p className="text-xs text-zinc-400">{isAr ? 'جرب تغيير فئة الفلتر أو إضافة مركبة جديدة للأسطول' : 'Try adjusting your filters or register a new vehicle'}</p>
        </div>
      )}

      {selectedVehicleId && <VehicleDetailMasterModal vehicleId={selectedVehicleId} onClose={() => setSelectedVehicleId(null)} />}
      
      {/* Availability conflict checker modal */}
      <Modal 
        isOpen={availabilityModalOpen} 
        onClose={() => setAvailabilityModalOpen(false)} 
        title={isAr ? 'فاحص تعارض الحجوزات والتوفر' : 'Real-Time Schedule Conflict Tester'} 
        subtitle="Verify vehicle availability against confirmed contracts and reservations" 
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-blue-200 font-semibold mb-1">{isAr ? 'اختر المركبة' : 'Select Vehicle'}</label>
            <select 
              value={testVehicleId} 
              onChange={e => setTestVehicleId(e.target.value)} 
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-blue-900/50 text-white"
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} ({v.plateNumber}) - Status: {(v.status || '').toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">{isAr ? 'تاريخ ووقت البداية' : 'Start Date & Time'}</label>
              <input 
                type="datetime-local" 
                value={testStartDate.slice(0, 16)} 
                onChange={e => setTestStartDate(new Date(e.target.value).toISOString())} 
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white" 
              />
            </div>
            <div>
              <label className="block text-zinc-300 font-medium mb-1">{isAr ? 'تاريخ ووقت النهاية' : 'End Date & Time'}</label>
              <input 
                type="datetime-local" 
                value={testEndDate.slice(0, 16)} 
                onChange={e => setTestEndDate(new Date(e.target.value).toISOString())} 
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white" 
              />
            </div>
          </div>

          <button 
            type="button" 
            onClick={handleTestAvailability} 
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold cursor-pointer"
          >
            {isAr ? 'فحص التوفر في الجدول الزمني' : 'Check Schedule Availability'}
          </button>

          {availResult && (
            <div className={`p-4 rounded-2xl border ${availResult.available ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/20 border-rose-500/40 text-rose-300'}`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {availResult.available ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                <span>{availResult.available ? (isAr ? '✓ المركبة متاحة 100% في هذه الفترة' : 'Vehicle is 100% Available for these dates') : (isAr ? '⚠️ تم اكتشاف تعارض في الحجز!' : 'Schedule Conflict Detected!')}</span>
              </div>
              {!availResult.available && (
                <div className="mt-2 text-xs text-zinc-300">
                  <p>Conflicting bookings found: {availResult.conflictingRecords.length}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <AddVehicleModal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} />
    </div>
  );
};
