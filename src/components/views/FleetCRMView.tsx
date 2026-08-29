import React, { useState } from 'react';
import { 
  Car, Plus, Search, Filter, Calendar, ShieldCheck, 
  AlertTriangle, Gauge, Zap, Fuel, DollarSign, 
  CheckCircle2, Wrench, ChevronRight, X, Edit3
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Vehicle, VehicleCategory, VehicleStatus } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { VehicleDetailMasterModal } from '../fleet/VehicleDetailMasterModal';
import { AddVehicleModal } from '../modals/AddVehicleModal';
import { EditVehicleModal } from '../modals/EditVehicleModal';

export const FleetCRMView: React.FC = () => {
  const { language, t, getStatusLabel, getCategoryLabel } = useLanguage();
  const { vehicles, contracts, addVehicle, updateVehicle, checkVehicleAvailability, selectedVehicleId, setSelectedVehicleId } = useCRM();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);

  // Availability tester state
  const [testVehicleId, setTestVehicleId] = useState('');
  const [testStartDate, setTestStartDate] = useState(new Date().toISOString().split('T')[0] + 'T10:00:00Z');
  const [testEndDate, setTestEndDate] = useState(new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0] + 'T10:00:00Z');
  const [availResult, setAvailResult] = useState<any>(null);

  const activeVehicle = vehicles.find(v => v.id === selectedVehicleId) || null;

  const handleTestAvailability = async () => {
    if (!testVehicleId) return;
    const res = await checkVehicleAvailability(testVehicleId, testStartDate, testEndDate);
    setAvailResult(res);
  };

  const filteredVehicles = vehicles.filter(v => {
    const s = (searchTerm || '').toLowerCase();
    const matchesSearch = 
      `${v.make || ''} ${v.model || ''}`.toLowerCase().includes(s) ||
      (v.plateNumber || '').toLowerCase().includes(s) ||
      (v.vin || '').toLowerCase().includes(s);
    
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
            {language === 'ar' ? 'أسطول سبلندر الفاخر ومحرك التوفر' : 'Fleet CRM & Availability Engine'}
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
            placeholder={language === 'ar' ? 'بحث بالماركة، الطراز، رقم اللوحة، أو الهيكل...' : 'Search make, model, plate, VIN...'}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {['all', 'supercar', 'ultra_luxury_sedan', 'executive_suv', 'grand_tourer', 'exotic_convertible'].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-xl capitalize font-medium transition-all ${
                categoryFilter === cat ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 border border-zinc-800 hover:bg-zinc-800'
              }`}
            >
              {cat === 'all' ? (language === 'ar' ? 'الكل' : 'All') : getCategoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Vehicle Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVehicles.map(vehicle => {
          const statusBadge = {
            available: <Badge variant="emerald" size="sm">{getStatusLabel('available')}</Badge>,
            rented: <Badge variant="gold" size="sm">{getStatusLabel('rented')}</Badge>,
            reserved: <Badge variant="sky" size="sm">{getStatusLabel('reserved')}</Badge>,
            maintenance: <Badge variant="amber" size="sm">{getStatusLabel('maintenance')}</Badge>,
            unavailable: <Badge variant="zinc" size="sm">{getStatusLabel('unavailable')}</Badge>
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
                    <p className="text-xs text-zinc-400 capitalize">{vehicle.year} • {vehicle.exteriorColor} • {getCategoryLabel(vehicle.category)}</p>
                  </div>
                </div>
              </div>

              {/* Specs & Pricing */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                {/* Tech Specs */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs py-2 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                  <div>
                    <span className="text-[10px] uppercase text-zinc-500 font-medium flex items-center justify-center gap-1">
                      <Zap className="w-3 h-3 text-[#D4AF37]" /> {language === 'ar' ? 'القوة' : 'Power'}
                    </span>
                    <p className="font-bold text-zinc-200 mt-0.5">{vehicle.horsepower} {language === 'ar' ? 'حصان' : 'HP'}</p>
                  </div>
                  <div className="border-x border-zinc-800">
                    <span className="text-[10px] uppercase text-zinc-500 font-medium flex items-center justify-center gap-1">
                      <Gauge className="w-3 h-3 text-sky-400" /> {language === 'ar' ? 'المحرك' : 'Engine'}
                    </span>
                    <p className="font-bold text-zinc-200 mt-0.5">{vehicle.engine}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-zinc-500 font-medium flex items-center justify-center gap-1">
                      <Fuel className="w-3 h-3 text-emerald-400" /> {language === 'ar' ? 'العداد' : 'Odo'}
                    </span>
                    <p className="font-bold text-zinc-200 mt-0.5">{(vehicle.mileage || 0).toLocaleString()} {language === 'ar' ? 'كم' : 'km'}</p>
                  </div>
                </div>

                {/* Pricing & Quick Action */}
                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">
                      {language === 'ar' ? 'السعر اليومي' : 'Daily Rate'}
                    </span>
                    <p className="text-base font-bold text-zinc-100">
                      {(vehicle.dailyRate || 0).toLocaleString()} <span className="text-xs text-[#D4AF37] font-medium">{language === 'ar' ? 'د.إ / يوم' : 'AED/day'}</span>
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingVehicle(vehicle);
                      }}
                      className="p-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-[#D4AF37] text-zinc-300 hover:text-[#f5d97f] transition-all"
                      title={language === 'ar' ? 'تعديل بيانات المركبة' : 'Edit Vehicle'}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <div className="text-end">
                      <span className="text-[10px] text-zinc-400 uppercase font-medium">
                        {language === 'ar' ? 'مبلغ التأمين' : 'Deposit'}
                      </span>
                      <p className="text-xs font-semibold text-zinc-300">
                        {(vehicle.minDeposit || 0).toLocaleString()} {language === 'ar' ? 'د.إ' : 'AED'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Vehicle Detail Drawer/Modal */}
      {selectedVehicleId && (
        <VehicleDetailMasterModal
          vehicleId={selectedVehicleId}
          onClose={() => setSelectedVehicleId(null)}
        />
      )}

      {/* Conflict & Availability Tester Modal */}
      <Modal
        isOpen={availabilityModalOpen}
        onClose={() => setAvailabilityModalOpen(false)}
        title={language === 'ar' ? 'فاحص تعارض الحجوزات والتوفر' : 'Real-Time Schedule Conflict Tester'}
        subtitle={language === 'ar' ? 'التحقق الفوري من توفر السيارة مقابل العقود والحجوزات المؤكدة' : 'Verify vehicle availability against confirmed contracts and reservations'}
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">
              {language === 'ar' ? 'اختر المركبة' : 'Select Vehicle'}
            </label>
            <select
              value={testVehicleId}
              onChange={(e) => setTestVehicleId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} ({v.plateNumber}) - {language === 'ar' ? 'الحالة:' : 'Status:'} {getStatusLabel(v.status)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">
                {language === 'ar' ? 'تاريخ ووقت البدء' : 'Start Date & Time'}
              </label>
              <input
                type="datetime-local"
                value={testStartDate.slice(0, 16)}
                onChange={(e) => setTestStartDate(new Date(e.target.value).toISOString())}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">
                {language === 'ar' ? 'تاريخ ووقت الانتهاء' : 'End Date & Time'}
              </label>
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
            className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold shadow-md"
          >
            {language === 'ar' ? 'فحص التوفر في الجدول الزمني' : 'Check Schedule Availability'}
          </button>

          {availResult && (
            <div className={`p-4 rounded-2xl border ${availResult.available ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/20 border-rose-500/40 text-rose-300'}`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {availResult.available ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                <span>
                  {availResult.available
                    ? (language === 'ar' ? 'السيارة متاحة 100% خلال هذه الفترة' : 'Vehicle is 100% Available for these dates')
                    : (language === 'ar' ? 'تم اكتشاف تعارض في الحجوزات! تم حظر الحجز المزدوج.' : 'Schedule Conflict Detected! Double-Booking Blocked.')}
                </span>
              </div>
              {!availResult.available && (
                <div className="mt-2 text-xs text-zinc-300">
                  <p>
                    {language === 'ar'
                      ? `تم العثور على ${availResult.conflictingRecords.length} حجز متعارض`
                      : `Conflicting bookings found: ${availResult.conflictingRecords.length}`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Comprehensive Add Vehicle Modal */}
      <AddVehicleModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />

      {/* Comprehensive Edit Vehicle Modal */}
      <EditVehicleModal
        vehicle={editingVehicle}
        isOpen={!!editingVehicle}
        onClose={() => setEditingVehicle(null)}
      />
    </div>
  );
};
