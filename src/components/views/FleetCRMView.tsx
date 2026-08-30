import React, { useMemo, useState } from 'react';
import { Car, Plus, Search, Calendar, AlertTriangle, Gauge, Zap, Fuel, CheckCircle2, BarChart3 } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { VehicleDetailMasterModal } from '../fleet/VehicleDetailMasterModal';
import { AddVehicleModal } from '../modals/AddVehicleModal';
import { calculateFleetCommandMetrics } from '../../server/fleetCommandMetrics';

export const FleetCRMView: React.FC = () => {
  const { language } = useLanguage();
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
    const matchesSearch = `${v.make || ''} ${v.model || ''}`.toLowerCase().includes(s) || (v.plateNumber || '').toLowerCase().includes(s) || (v.vin || '').toLowerCase().includes(s);
    return matchesSearch && (categoryFilter === 'all' || v.category === categoryFilter) && (statusFilter === 'all' || v.status === statusFilter);
  });

  const kpis = [
    { label: language === 'ar' ? 'إجمالي الأسطول' : 'Total Fleet', value: metrics.totalVehicles, icon: Car },
    { label: language === 'ar' ? 'متاح' : 'Available', value: metrics.available, icon: CheckCircle2 },
    { label: language === 'ar' ? 'تأجير نشط' : 'Active Rentals', value: metrics.rented, icon: Zap },
    { label: language === 'ar' ? 'محجوز' : 'Reserved', value: metrics.reserved, icon: Calendar },
    { label: language === 'ar' ? 'التشغيل' : 'Utilization', value: `${metrics.utilizationPercent}%`, icon: BarChart3 },
    { label: language === 'ar' ? 'عقود نشطة' : 'Active Contracts', value: metrics.activeContracts, icon: Gauge },
    { label: language === 'ar' ? 'حجوزات قادمة' : 'Upcoming Reservations', value: metrics.upcomingReservations, icon: Calendar },
    { label: language === 'ar' ? 'صيانة' : 'Maintenance', value: metrics.maintenance, icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">{language === 'ar' ? 'قيادة الأسطول ومحرك التوفر' : 'Fleet Command & Availability'}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{language === 'ar' ? 'لوحة تشغيلية لحظية لحالة الأسطول والاستغلال والحجوزات' : 'Live operational view of fleet status, utilization and reservations'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setTestVehicleId(vehicles[0]?.id || ''); setAvailabilityModalOpen(true); }} className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#D4AF37]/40 text-[#f5d97f] font-semibold text-xs hover:bg-[#D4AF37]/10 transition-all"><Calendar className="w-4 h-4" /><span>{language === 'ar' ? 'فاحص التعارض' : 'Conflict Checker'}</span></button>
          <button onClick={() => setAddModalOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"><Plus className="w-4 h-4" /><span>{language === 'ar' ? 'إضافة مركبة' : 'Add Vehicle'}</span></button>
        </div>
      </div>

      <section aria-label="Fleet Command KPIs" className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 shadow-lg">
            <div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">{label}</span><Icon className="w-4 h-4 text-[#D4AF37]" /></div>
            <p className="mt-2 text-xl font-display font-bold text-zinc-100">{value}</p>
          </div>
        ))}
      </section>

      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="relative flex-1 min-w-[240px]"><Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" /><input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search make, model, plate, VIN..." className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50" /></div>
        <div className="flex items-center gap-1.5 overflow-x-auto">{['all', 'supercar', 'ultra_luxury_sedan', 'executive_suv', 'grand_tourer', 'exotic_convertible'].map(cat => <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-3 py-1.5 rounded-xl capitalize font-medium transition-all ${categoryFilter === cat ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 border border-zinc-800 hover:bg-zinc-800'}`}>{cat.replace('_', ' ')}</button>)}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVehicles.map(vehicle => {
          const statusBadge = { available: <Badge variant="emerald" size="sm">Available</Badge>, rented: <Badge variant="gold" size="sm">Active Rental</Badge>, reserved: <Badge variant="sky" size="sm">Reserved</Badge>, maintenance: <Badge variant="amber" size="sm">Maintenance</Badge>, unavailable: <Badge variant="zinc" size="sm">Unavailable</Badge> }[vehicle.status];
          return <div key={vehicle.id} onClick={() => setSelectedVehicleId(vehicle.id)} className="rounded-3xl bg-zinc-900/80 border border-zinc-800 hover:border-[#D4AF37]/40 transition-all duration-200 overflow-hidden shadow-xl flex flex-col group cursor-pointer">
            <div className="relative h-48 w-full overflow-hidden bg-zinc-950"><img src={vehicle.thumbnail} alt={`${vehicle.make} ${vehicle.model}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /><div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-black/40" /><div className="absolute top-3 left-3 bg-zinc-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-zinc-800 text-[11px] font-mono font-bold text-zinc-200">{vehicle.plateCity} {vehicle.plateNumber}</div><div className="absolute top-3 right-3">{statusBadge}</div><div className="absolute bottom-3 left-4 right-4"><h3 className="text-lg font-display font-bold text-zinc-100 group-hover:text-[#f5d97f] transition-colors">{vehicle.make} {vehicle.model}</h3><p className="text-xs text-zinc-400 capitalize">{vehicle.year} • {vehicle.exteriorColor} • {vehicle.category.replace('_', ' ')}</p></div></div>
            <div className="p-5 flex-1 flex flex-col justify-between space-y-4"><div className="grid grid-cols-3 gap-2 text-center text-xs py-2 bg-zinc-950/60 rounded-xl border border-zinc-800/80"><div><span className="text-[10px] uppercase text-zinc-500 font-medium flex items-center justify-center gap-1"><Zap className="w-3 h-3 text-[#D4AF37]" /> Power</span><p className="font-bold text-zinc-200 mt-0.5">{vehicle.horsepower} HP</p></div><div className="border-x border-zinc-800"><span className="text-[10px] uppercase text-zinc-500 font-medium flex items-center justify-center gap-1"><Gauge className="w-3 h-3 text-sky-400" /> Engine</span><p className="font-bold text-zinc-200 mt-0.5">{vehicle.engine}</p></div><div><span className="text-[10px] uppercase text-zinc-500 font-medium flex items-center justify-center gap-1"><Fuel className="w-3 h-3 text-emerald-400" /> Odo</span><p className="font-bold text-zinc-200 mt-0.5">{(vehicle.mileage || 0).toLocaleString()} km</p></div></div><div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between"><div><span className="text-[10px] text-zinc-400 uppercase font-medium">Daily Rate</span><p className="text-base font-bold text-zinc-100">{(vehicle.dailyRate || 0).toLocaleString()} <span className="text-xs text-[#D4AF37] font-medium">AED/day</span></p></div><div className="text-end"><span className="text-[10px] text-zinc-400 uppercase font-medium">Deposit</span><p className="text-xs font-semibold text-zinc-300">{(vehicle.minDeposit || 0).toLocaleString()} AED</p></div></div></div>
          </div>;
        })}
      </div>

      {selectedVehicleId && <VehicleDetailMasterModal vehicleId={selectedVehicleId} onClose={() => setSelectedVehicleId(null)} />}
      <Modal isOpen={availabilityModalOpen} onClose={() => setAvailabilityModalOpen(false)} title={language === 'ar' ? 'فاحص تعارض الحجوزات والتوفر' : 'Real-Time Schedule Conflict Tester'} subtitle="Verify vehicle availability against confirmed contracts and reservations" maxWidth="lg">
        <div className="space-y-4 text-xs"><div><label className="block text-zinc-400 font-medium mb-1">Select Vehicle</label><select value={testVehicleId} onChange={e => setTestVehicleId(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">{vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} ({v.plateNumber}) - Status: {(v.status || '').toUpperCase()}</option>)}</select></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-zinc-400 font-medium mb-1">Start Date & Time</label><input type="datetime-local" value={testStartDate.slice(0, 16)} onChange={e => setTestStartDate(new Date(e.target.value).toISOString())} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" /></div><div><label className="block text-zinc-400 font-medium mb-1">End Date & Time</label><input type="datetime-local" value={testEndDate.slice(0, 16)} onChange={e => setTestEndDate(new Date(e.target.value).toISOString())} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" /></div></div><button type="button" onClick={handleTestAvailability} className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold">Check Schedule Availability</button>{availResult && <div className={`p-4 rounded-2xl border ${availResult.available ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/20 border-rose-500/40 text-rose-300'}`}><div className="flex items-center gap-2 font-bold text-sm">{availResult.available ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}<span>{availResult.available ? 'Vehicle is 100% Available for these dates' : 'Schedule Conflict Detected! Double-Booking Blocked.'}</span></div>{!availResult.available && <div className="mt-2 text-xs text-zinc-300"><p>Conflicting bookings found: {availResult.conflictingRecords.length}</p></div>}</div>}</div>
      </Modal>
      <AddVehicleModal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} />
    </div>
  );
};
