import React, { useState } from 'react';
import { 
  Car, Plus, Search, Filter, Calendar, ShieldCheck, 
  AlertTriangle, Gauge, Zap, Fuel, DollarSign, 
  CheckCircle2, Wrench, ChevronRight, X
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Vehicle, VehicleCategory, VehicleStatus } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';

export const FleetCRMView: React.FC = () => {
  const { language, t } = useLanguage();
  const { vehicles, contracts, addVehicle, updateVehicle, checkVehicleAvailability, selectedVehicleId, setSelectedVehicleId } = useCRM();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);

  // Availability tester state
  const [testVehicleId, setTestVehicleId] = useState('');
  const [testStartDate, setTestStartDate] = useState(new Date().toISOString().split('T')[0] + 'T10:00:00Z');
  const [testEndDate, setTestEndDate] = useState(new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0] + 'T10:00:00Z');
  const [availResult, setAvailResult] = useState<any>(null);

  // Add form
  const [form, setForm] = useState({
    make: 'Ferrari',
    model: 'Purosangue V12',
    year: 2025,
    category: 'luxury_suv' as VehicleCategory,
    color: 'Rosso Corsa',
    plateNumber: 'DXB P 888',
    plateCity: 'Dubai',
    vin: 'ZFF888PUR9990001',
    dailyRate: 9500,
    weeklyRate: 58000,
    monthlyRate: 190000,
    securityDeposit: 20000,
    mileage: 1200,
    fuelType: 'petrol' as const,
    transmission: 'automatic' as const,
    horsepower: 715,
    acceleration: 3.3,
    status: 'available' as VehicleStatus,
    thumbnail: 'https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800&auto=format&fit=crop&q=80']
  });

  const activeVehicle = vehicles.find(v => v.id === selectedVehicleId) || null;

  const handleTestAvailability = async () => {
    if (!testVehicleId) return;
    const res = await checkVehicleAvailability(testVehicleId, testStartDate, testEndDate);
    setAvailResult(res);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addVehicle(form);
    setAddModalOpen(false);
  };

  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = 
      `${v.make} ${v.model}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.plateNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.vin.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCat = categoryFilter === 'all' || v.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;

    return matchesSearch && matchesCat && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'أسطول سبليندور الفاخر ومحرك التوفر' : 'Fleet CRM & Availability Engine'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'إدارة السوبركارز، الفحوصات الفنية، والتحقق الفوري من التوفر ومنع الحجز المزدوج' : 'Supercar asset management, live availability schedules & double-booking prevention'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setTestVehicleId(vehicles[0]?.id || '');
              setAvailabilityModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#D4AF37]/40 text-[#f5d97f] font-semibold text-xs hover:bg-[#D4AF37]/10 transition-all"
          >
            <Calendar className="w-4 h-4" />
            <span>{language === 'ar' ? 'فاحص التوفر والتعارض' : 'Conflict Checker'}</span>
          </button>

          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'ar' ? 'إضافة مركبة جديدة' : 'Add Vehicle'}</span>
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search make, model, plate, VIN..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {['all', 'supercar', 'ultra_luxury', 'luxury_suv', 'convertible'].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-xl capitalize font-medium transition-all ${
                categoryFilter === cat ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 border border-zinc-800 hover:bg-zinc-800'
              }`}
            >
              {cat.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Vehicle Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVehicles.map(vehicle => {
          const statusBadge = {
            available: <Badge variant="emerald" size="sm">Available</Badge>,
            rented: <Badge variant="gold" size="sm">Active Rental</Badge>,
            reserved: <Badge variant="sky" size="sm">Reserved</Badge>,
            maintenance: <Badge variant="amber" size="sm">Maintenance</Badge>,
            inactive: <Badge variant="zinc" size="sm">Inactive</Badge>
          }[vehicle.status];

          return (
            <div
              key={vehicle.id}
              onClick={() => setSelectedVehicleId(vehicle.id)}
              className="rounded-3xl bg-zinc-900/80 border border-zinc-800 hover:border-[#D4AF37]/40 transition-all duration-200 overflow-hidden shadow-xl flex flex-col group cursor-pointer"
            >
              {/* Image Banner */}
              <div className="relative h-48 w-full overflow-hidden bg-zinc-950">
                <img
                  src={vehicle.thumbnail}
                  alt={`${vehicle.make} ${vehicle.model}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-black/40" />
                
                {/* Plate Badge */}
                <div className="absolute top-3 left-3 bg-zinc-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-zinc-800 text-[11px] font-mono font-bold text-zinc-200">
                  {vehicle.plateCity} {vehicle.plateNumber}
                </div>

                {/* Status Pill */}
                <div className="absolute top-3 right-3">
                  {statusBadge}
                </div>

                {/* Bottom title inside image */}
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                  <div>
                    <h3 className="text-lg font-display font-bold text-zinc-100 group-hover:text-[#f5d97f] transition-colors">
                      {vehicle.make} {vehicle.model}
                    </h3>
                    <p className="text-xs text-zinc-400 capitalize">{vehicle.year} • {vehicle.color} • {vehicle.category.replace('_', ' ')}</p>
                  </div>
                </div>
              </div>

              {/* Specs & Pricing */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                {/* Tech Specs */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs py-2 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                  <div>
                    <span className="text-[10px] uppercase text-zinc-500 font-medium flex items-center justify-center gap-1">
                      <Zap className="w-3 h-3 text-[#D4AF37]" /> Power
                    </span>
                    <p className="font-bold text-zinc-200 mt-0.5">{vehicle.horsepower} HP</p>
                  </div>
                  <div className="border-x border-zinc-800">
                    <span className="text-[10px] uppercase text-zinc-500 font-medium flex items-center justify-center gap-1">
                      <Gauge className="w-3 h-3 text-sky-400" /> 0-100
                    </span>
                    <p className="font-bold text-zinc-200 mt-0.5">{vehicle.acceleration}s</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-zinc-500 font-medium flex items-center justify-center gap-1">
                      <Fuel className="w-3 h-3 text-emerald-400" /> Odo
                    </span>
                    <p className="font-bold text-zinc-200 mt-0.5">{vehicle.mileage.toLocaleString()} km</p>
                  </div>
                </div>

                {/* Pricing & Quick Action */}
                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Daily Rate</span>
                    <p className="text-base font-bold text-zinc-100">
                      {vehicle.dailyRate.toLocaleString()} <span className="text-xs text-[#D4AF37] font-medium">AED/day</span>
                    </p>
                  </div>
                  <div className="text-end">
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Deposit</span>
                    <p className="text-xs font-semibold text-zinc-300">
                      {vehicle.securityDeposit.toLocaleString()} AED
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Vehicle Detail Drawer/Modal */}
      {activeVehicle && (
        <Modal
          isOpen={!!selectedVehicleId}
          onClose={() => setSelectedVehicleId(null)}
          title={`${activeVehicle.make} ${activeVehicle.model} (${activeVehicle.year})`}
          subtitle={`${activeVehicle.plateCity} ${activeVehicle.plateNumber} • VIN: ${activeVehicle.vin}`}
          maxWidth="4xl"
        >
          <div className="space-y-6 text-xs">
            {/* Top photos strip */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <img
                src={activeVehicle.thumbnail}
                alt={activeVehicle.model}
                className="w-full h-56 object-cover rounded-2xl border border-zinc-800"
              />
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3 flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">Fleet Financial Performance</h4>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                      <p className="text-zinc-400 text-[10px]">Total Historical Revenue</p>
                      <p className="text-base font-bold text-emerald-400 mt-1">{activeVehicle.totalRevenue.toLocaleString()} AED</p>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                      <p className="text-zinc-400 text-[10px]">Operational Profitability</p>
                      <p className="text-base font-bold text-[#f5d97f] mt-1">{activeVehicle.profitabilityScore}/100 Score</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <p className="text-zinc-400"><strong>Insurance:</strong> {activeVehicle.insurancePolicyNumber} ({activeVehicle.insuranceExpiryDate})</p>
                  <p className="text-zinc-400"><strong>RTA Registration:</strong> Valid until {activeVehicle.registrationExpiryDate}</p>
                </div>
              </div>
            </div>

            {/* Maintenance History */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">Scheduled Maintenance & Service Logs</h4>
              {activeVehicle.maintenanceLogs.length === 0 ? (
                <div className="p-4 rounded-xl bg-zinc-950 text-center text-zinc-500">All services up to date.</div>
              ) : (
                <div className="space-y-2">
                  {activeVehicle.maintenanceLogs.map(log => (
                    <div key={log.id} className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-zinc-200 uppercase">{log.serviceType}</span>
                        <p className="text-zinc-400 mt-0.5">{log.description} ({log.serviceCenter})</p>
                      </div>
                      <div className="text-end">
                        <span className="text-zinc-300 font-semibold">{log.cost.toLocaleString()} AED</span>
                        <p className="text-zinc-500 text-[10px]">{new Date(log.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Conflict & Availability Tester Modal */}
      <Modal
        isOpen={availabilityModalOpen}
        onClose={() => setAvailabilityModalOpen(false)}
        title={language === 'ar' ? 'فاحص تعارض الحجوزات والتوفر' : 'Real-Time Schedule Conflict Tester'}
        subtitle="Verify vehicle availability against confirmed contracts and reservations"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">Select Vehicle</label>
            <select
              value={testVehicleId}
              onChange={(e) => setTestVehicleId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} ({v.plateNumber}) - Status: {v.status.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Start Date & Time</label>
              <input
                type="datetime-local"
                value={testStartDate.slice(0, 16)}
                onChange={(e) => setTestStartDate(new Date(e.target.value).toISOString())}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">End Date & Time</label>
              <input
                type="datetime-local"
                value={testEndDate.slice(0, 16)}
                onChange={(e) => setTestEndDate(new Date(e.target.value).toISOString())}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestAvailability}
            className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold"
          >
            Check Schedule Availability
          </button>

          {availResult && (
            <div className={`p-4 rounded-2xl border ${availResult.available ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/20 border-rose-500/40 text-rose-300'}`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {availResult.available ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                <span>{availResult.available ? 'Vehicle is 100% Available for these dates' : 'Schedule Conflict Detected! Double-Booking Blocked.'}</span>
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

      {/* Add Vehicle Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Supercar to Fleet"
        subtitle="Register vehicle specs, plate, and rate structure"
        maxWidth="2xl"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Make *</label>
              <input
                type="text"
                required
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Model *</label>
              <input
                type="text"
                required
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Year</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Plate Number *</label>
              <input
                type="text"
                required
                value={form.plateNumber}
                onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Daily Rate (AED) *</label>
              <input
                type="number"
                required
                value={form.dailyRate}
                onChange={(e) => setForm({ ...form, dailyRate: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Security Deposit (AED) *</label>
              <input
                type="number"
                required
                value={form.securityDeposit}
                onChange={(e) => setForm({ ...form, securityDeposit: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold"
            >
              Save Supercar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
