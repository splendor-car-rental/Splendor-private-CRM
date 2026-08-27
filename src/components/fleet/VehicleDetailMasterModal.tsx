import React, { useState } from 'react';
import { 
  History, Globe, Shield, Tag, Calendar, User, Clock, 
  ArrowRightLeft, AlertCircle, CheckCircle2, ExternalLink, 
  DollarSign, Eye, EyeOff, Sparkles, Plus, AlertTriangle
} from 'lucide-react';
import { Vehicle, PlateAssignmentHistory, VehicleTimelineEvent, WebsiteVisibility, VehicleLifecycleStatus } from '../../types';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate, formatDateTime } from '../../lib/dateFormat';

interface VehicleDetailMasterModalProps {
  vehicleId: string | null;
  onClose: () => void;
}

export const VehicleDetailMasterModal: React.FC<VehicleDetailMasterModalProps> = ({
  vehicleId,
  onClose
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { vehicles, assignPlate, publishToWebsite, updateLifecycleStatus, contracts, reservations } = useCRM();
  const { currentUser } = useAuth();

  const vehicle = vehicles.find(v => v.id === vehicleId);

  const [activeTab, setActiveTab] = useState<'overview' | 'plates' | 'website' | 'timeline' | 'schedule'>('overview');

  // Plate transfer modal state
  const [plateModalOpen, setPlateModalOpen] = useState(false);
  const [newPlateNumber, setNewPlateNumber] = useState('');
  const [newPlateCity, setNewPlateCity] = useState('Dubai');
  const [plateReason, setPlateReason] = useState('');
  const [isSubmittingPlate, setIsSubmittingPlate] = useState(false);

  // Website publish state
  const [webEnabled, setWebEnabled] = useState(vehicle?.website?.enabled ?? true);
  const [webVisibility, setWebVisibility] = useState<WebsiteVisibility>(vehicle?.website?.visibility ?? 'FEATURED');
  const [webPublicName, setWebPublicName] = useState(vehicle?.website?.publicName || (vehicle ? `${vehicle.make} ${vehicle.model}` : ''));
  const [webPublicNameAr, setWebPublicNameAr] = useState(vehicle?.website?.publicNameAr || '');
  const [webDailyRate, setWebDailyRate] = useState(vehicle?.website?.dailyRate || vehicle?.dailyRate || 5000);
  const [webDeposit, setWebDeposit] = useState(vehicle?.website?.deposit || vehicle?.minDeposit || 10000);
  const [webDescription, setWebDescription] = useState(vehicle?.website?.publicDescription || '');
  const [webDescriptionAr, setWebDescriptionAr] = useState(vehicle?.website?.publicDescriptionAr || '');
  const [isSavingWeb, setIsSavingWeb] = useState(false);

  // Lifecycle status modal
  const [lifecycleModalOpen, setLifecycleModalOpen] = useState(false);
  const [newLifecycleStatus, setNewLifecycleStatus] = useState<VehicleLifecycleStatus>(vehicle?.lifecycleStatus || 'ACTIVE');
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [salePrice, setSalePrice] = useState(0);
  const [buyerName, setBuyerName] = useState('');

  if (!vehicle) return null;

  const vehicleContracts = contracts.filter(c => c.vehicleId === vehicle.id);
  const vehicleReservations = reservations.filter(r => r.vehicleId === vehicle.id);

  const handleAssignPlateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlateNumber.trim()) return;
    try {
      setIsSubmittingPlate(true);
      await assignPlate(vehicle.id, newPlateNumber.trim(), newPlateCity, plateReason);
      setPlateModalOpen(false);
      setNewPlateNumber('');
      setPlateReason('');
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSubmittingPlate(false);
    }
  };

  const handleSaveWebsitePublish = async () => {
    try {
      setIsSavingWeb(true);
      await publishToWebsite(vehicle.id, {
        enabled: webEnabled,
        visibility: webVisibility,
        publicName: webPublicName,
        publicNameAr: webPublicNameAr,
        dailyRate: Number(webDailyRate),
        deposit: Number(webDeposit),
        publicDescription: webDescription,
        publicDescriptionAr: webDescriptionAr,
        featured: webVisibility === 'FEATURED',
        slug: vehicle.publicVehicleId || vehicle.id.toLowerCase()
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSavingWeb(false);
    }
  };

  const handleUpdateLifecycle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateLifecycleStatus(
        vehicle.id,
        newLifecycleStatus,
        lifecycleReason,
        newLifecycleStatus === 'SOLD' ? {
          soldTo: buyerName,
          salePrice: Number(salePrice),
          saleDate: new Date().toISOString()
        } : undefined
      );
      setLifecycleModalOpen(false);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <>
      <Modal
        isOpen={!!vehicleId}
        onClose={onClose}
        title={`${vehicle.make} ${vehicle.model} (${vehicle.year})`}
        subtitle={`${isAr ? 'معرف المركبة الداخلي' : 'Vehicle ID'}: ${vehicle.id} • VIN: ${vehicle.vin}`}
        maxWidth="4xl"
      >
        <div className="space-y-5 text-xs text-zinc-300">
          {/* Top Banner Card */}
          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src={vehicle.thumbnail}
                alt={vehicle.model}
                className="w-20 h-16 object-cover rounded-xl border border-zinc-800"
              />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 font-mono font-bold text-zinc-100 text-xs">
                    {vehicle.plateCity} {vehicle.plateNumber}
                  </span>
                  <Badge variant={vehicle.status === 'available' ? 'emerald' : vehicle.status === 'rented' ? 'purple' : 'amber'} size="sm">
                    {vehicle.status.toUpperCase()}
                  </Badge>
                  <Badge variant={vehicle.lifecycleStatus === 'ACTIVE' ? 'gold' : 'zinc'} size="sm">
                    {vehicle.lifecycleStatus || 'ACTIVE'}
                  </Badge>
                  {vehicle.website?.enabled && (
                    <Badge variant="sky" size="sm">
                      WEB: {vehicle.website.visibility}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1.5">
                  {vehicle.category.replace('_', ' ').toUpperCase()} • {vehicle.horsepower} HP • {vehicle.engine}
                </p>
              </div>
            </div>

            {/* Top Quick Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setPlateModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-700 hover:border-[#D4AF37] hover:text-[#f5d97f] transition-all bg-zinc-900"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{isAr ? 'نقل / تبديل اللوحة' : 'Plate Transfer'}</span>
              </button>

              <button
                onClick={() => setLifecycleModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-700 hover:border-purple-500 hover:text-purple-300 transition-all bg-zinc-900"
              >
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <span>{isAr ? 'دورة الحياة' : 'Lifecycle Status'}</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                activeTab === 'overview' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              {isAr ? 'نظرة عامة ومواصفات' : 'Specs & Financials'}
            </button>
            <button
              onClick={() => setActiveTab('plates')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'plates' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{isAr ? 'سجل اللوحات التاريخي' : 'Plate Assignment History'} ({vehicle.plateHistory?.length || 1})</span>
            </button>
            <button
              onClick={() => setActiveTab('website')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'website' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isAr ? 'الظهور في الموقع العام' : 'Public Website Controls'}</span>
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'timeline' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{isAr ? 'سجل الأحداث والتدقيق' : 'Audit Timeline'} ({vehicle.timeline?.length || 0})</span>
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'schedule' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{isAr ? 'العقود والحجوزات' : 'Rentals & Schedule'} ({vehicleContracts.length + vehicleReservations.length})</span>
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">Daily Rate</span>
                  <p className="text-sm font-bold text-zinc-100 mt-0.5">{(vehicle.dailyRate || 0).toLocaleString()} AED</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">Deposit</span>
                  <p className="text-sm font-bold text-zinc-100 mt-0.5">{(vehicle.minDeposit || 0).toLocaleString()} AED</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">Total Revenue</span>
                  <p className="text-sm font-bold text-emerald-400 mt-0.5">{(vehicle.totalRevenue || 0).toLocaleString()} AED</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">Odometer</span>
                  <p className="text-sm font-bold text-sky-400 mt-0.5">{(vehicle.mileage || 0).toLocaleString()} km</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <h4 className="font-bold text-zinc-200 text-xs uppercase tracking-wider">Asset Identity & Registration</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-zinc-500 text-[10px]">VIN (Vehicle Identification Number)</span>
                    <p className="font-mono text-zinc-200 font-bold mt-0.5">{vehicle.vin}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">Ownership Source</span>
                    <p className="text-zinc-200 font-bold mt-0.5">{vehicle.ownershipSource || 'OWNED'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">Current Location</span>
                    <p className="text-zinc-200 font-medium mt-0.5">{vehicle.currentLocation || 'Flagship Showroom'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PLATE HISTORY */}
          {activeTab === 'plates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-zinc-200 text-xs uppercase tracking-wide">
                    {isAr ? 'السجل التاريخي للوحات المركبة' : 'Plate Assignment History & Audit Trail'}
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {isAr
                      ? 'يتم ربط المخالفات والسالك تاريخياً بناءً على الفترة الزمنية للوحة دون التأثير على هوية المركبة (VIN)'
                      : 'Salik, Darb & Fines are historically attributed to this vehicle via exact timestamp intervals'}
                  </p>
                </div>
                <button
                  onClick={() => setPlateModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold text-xs hover:brightness-110"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تسجيل لوحة جديدة' : 'Assign New Plate'}</span>
                </button>
              </div>

              <div className="rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden divide-y divide-zinc-800/80">
                {(vehicle.plateHistory && vehicle.plateHistory.length > 0) ? (
                  vehicle.plateHistory.map(plate => (
                    <div key={plate.id} className="p-3.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 font-mono font-bold text-zinc-100 text-xs">
                          {plate.plateCity} {plate.plateNumber}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {plate.isCurrent ? (
                              <Badge variant="emerald" size="sm">{isAr ? 'اللوحة الحالية' : 'CURRENT ACTIVE'}</Badge>
                            ) : (
                              <Badge variant="zinc" size="sm">{isAr ? 'أرشيف سابق' : 'ARCHIVED'}</Badge>
                            )}
                            <span className="text-zinc-400 text-[10px]">
                              {formatDate(plate.startDate)} — {plate.endDate ? formatDate(plate.endDate) : (isAr ? 'حتى الآن' : 'Present')}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-300 mt-1">
                            {plate.reason || (isAr ? 'تسجيل رسمي' : 'Official registration')}
                          </p>
                        </div>
                      </div>

                      <div className="text-end text-[10px] text-zinc-500">
                        <p>{isAr ? 'بواسطة' : 'Assigned By'}: {plate.assignedByName || plate.assignedBy}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 font-mono font-bold text-zinc-100 text-xs">
                        {vehicle.plateCity} {vehicle.plateNumber}
                      </div>
                      <Badge variant="emerald" size="sm">CURRENT ACTIVE</Badge>
                    </div>
                    <span className="text-zinc-500 text-[10px]">Initial assignment</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: WEBSITE CONTROLS */}
          {activeTab === 'website' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-zinc-100 text-xs uppercase tracking-wide">
                      {isAr ? 'إعدادات نشر المعرض العام للموقع' : 'Public Website Showroom Configuration'}
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      {isAr
                        ? 'التحكم المباشر في ظهور وسعر المركبة في موقع سبلندر العام'
                        : 'Control visibility, public naming and showcase pricing for the public VIP website'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-zinc-300 font-medium">{isAr ? 'تفعيل في الموقع' : 'Enable on Website'}</span>
                      <input
                        type="checkbox"
                        checked={webEnabled}
                        onChange={(e) => setWebEnabled(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#D4AF37]"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">
                      {isAr ? 'مستوى الظهور' : 'Showroom Visibility'}
                    </label>
                    <select
                      value={webVisibility}
                      onChange={(e) => setWebVisibility(e.target.value as WebsiteVisibility)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                    >
                      <option value="FEATURED">FEATURED (الصفحة الأولى والمميزة)</option>
                      <option value="SHOWROOM">SHOWROOM (المعرض الكامل)</option>
                      <option value="PRIVATE_ACCESS">PRIVATE_ACCESS (رابط حصري فقط)</option>
                      <option value="COMING_SOON">COMING_SOON (قريباً في الأسطول)</option>
                      <option value="HIDDEN">HIDDEN (مخفي من الموقع)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">
                      {isAr ? 'سعر اليوم العام (AED)' : 'Public Daily Rate (AED)'}
                    </label>
                    <input
                      type="number"
                      value={webDailyRate}
                      onChange={(e) => setWebDailyRate(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">
                      {isAr ? 'التأمين المسترد العام (AED)' : 'Public Security Deposit (AED)'}
                    </label>
                    <input
                      type="number"
                      value={webDeposit}
                      onChange={(e) => setWebDeposit(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">
                      {isAr ? 'اسم العرض الإنجليزي' : 'Public Display Name (EN)'}
                    </label>
                    <input
                      type="text"
                      value={webPublicName}
                      onChange={(e) => setWebPublicName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">
                      {isAr ? 'اسم العرض العربي' : 'Public Display Name (AR)'}
                    </label>
                    <input
                      type="text"
                      value={webPublicNameAr}
                      onChange={(e) => setWebPublicNameAr(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                      placeholder="رولز رويس سبكتر إصدار ماندرين..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-400 text-[11px] font-medium mb-1">
                    {isAr ? 'وصف الموقع التسويقي' : 'Public Marketing Description (EN)'}
                  </label>
                  <textarea
                    rows={2}
                    value={webDescription}
                    onChange={(e) => setWebDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleSaveWebsitePublish}
                    disabled={isSavingWeb}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold hover:brightness-110"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{isSavingWeb ? (isAr ? 'جاري الحفظ...' : 'Publishing...') : (isAr ? 'حفظ ونشر التغييرات' : 'Save & Publish to Web')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-3">
              <h4 className="font-bold text-zinc-200 text-xs uppercase tracking-wide">
                {isAr ? 'سجل العمليات والتدقيق غير القابل للتعديل' : 'Immutable Operational Audit Trail'}
              </h4>

              <div className="space-y-2">
                {(vehicle.timeline && vehicle.timeline.length > 0) ? (
                  vehicle.timeline.map((evt, idx) => (
                    <div key={evt.id || idx} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="purple" size="sm">{evt.action}</Badge>
                          <span className="text-[10px] text-zinc-400 font-mono">{formatDateTime(evt.date)}</span>
                        </div>
                        <p className="text-zinc-200 font-medium text-xs mt-1">{evt.reason}</p>
                      </div>
                      <span className="text-[10px] text-zinc-500 whitespace-nowrap">{evt.userName || evt.userId}</span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 text-center">
                    {isAr ? 'لا توجد أحداث مسجلة بعد' : 'No recorded timeline events for this vehicle'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: SCHEDULE & CONTRACTS */}
          {activeTab === 'schedule' && (
            <div className="space-y-3">
              <h4 className="font-bold text-zinc-200 text-xs uppercase tracking-wide">
                {isAr ? 'العقود والحجوزات المرتبطة بهذه المركبة' : 'Associated Rentals & Online Bookings'}
              </h4>

              <div className="space-y-2">
                {vehicleContracts.map(c => (
                  <div key={c.id} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-zinc-100">{c.id}</span>
                        <Badge variant="emerald" size="sm">CONTRACT ({c.status})</Badge>
                      </div>
                      <p className="text-zinc-400 text-[11px] mt-0.5">{c.customerName} • {c.startDateTime.split('T')[0]} to {c.endDateTime.split('T')[0]}</p>
                    </div>
                    <span className="font-bold text-emerald-400">{(c.grandTotal || 0).toLocaleString()} AED</span>
                  </div>
                ))}

                {vehicleReservations.map(r => (
                  <div key={r.id} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-zinc-100">{r.id}</span>
                        <Badge variant="sky" size="sm">RESERVATION ({r.status})</Badge>
                      </div>
                      <p className="text-zinc-400 text-[11px] mt-0.5">{r.customerName} • {r.pickupDateTime.split('T')[0]} to {r.returnDateTime.split('T')[0]}</p>
                    </div>
                    <span className="font-bold text-sky-400">{(r.totalAmount || 0).toLocaleString()} AED</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* PLATE TRANSFER MODAL */}
      <Modal
        isOpen={plateModalOpen}
        onClose={() => setPlateModalOpen(false)}
        title={isAr ? 'نقل أو تعيين لوحة جديدة للمركبة' : 'Plate Assignment / Transfer'}
        subtitle={`Vehicle: ${vehicle.make} ${vehicle.model} (VIN: ${vehicle.vin})`}
        maxWidth="md"
      >
        <form onSubmit={handleAssignPlateSubmit} className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-[11px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {isAr
                ? 'سيتم الاحتفاظ باللوحة الحالية في السجل التاريخي للمركبة لضمان دقة ربط بوابات سالك ودرب والمخالفات السابقة.'
                : 'The current plate will be archived in the audit history to guarantee 100% accurate Salik / Darb toll attribution.'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'المدينة / الكود' : 'Emirate / City'}</label>
              <input
                type="text"
                required
                value={newPlateCity}
                onChange={(e) => setNewPlateCity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                placeholder="Dubai VIP (Code X)"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'رقم اللوحة الجديد' : 'New Plate Number'}</label>
              <input
                type="text"
                required
                value={newPlateNumber}
                onChange={(e) => setNewPlateNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                placeholder="1007"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'سبب التبديل / النقل' : 'Reason for Plate Change'}</label>
            <input
              type="text"
              required
              value={plateReason}
              onChange={(e) => setPlateReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              placeholder="e.g. VIP Plate allocation, RTA renewal, Plate transfer from showroom..."
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPlateModalOpen(false)}
              className="px-3 py-2 rounded-xl text-zinc-400 hover:bg-zinc-900"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmittingPlate}
              className="px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold hover:brightness-110"
            >
              {isSubmittingPlate ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'تأكيد وحفظ التعيين' : 'Confirm Plate Assignment')}
            </button>
          </div>
        </form>
      </Modal>

      {/* LIFECYCLE MODAL */}
      <Modal
        isOpen={lifecycleModalOpen}
        onClose={() => setLifecycleModalOpen(false)}
        title={isAr ? 'تحديث مرحلة دورة حياة المركبة' : 'Update Vehicle Lifecycle Status'}
        subtitle={`Vehicle: ${vehicle.make} ${vehicle.model}`}
        maxWidth="md"
      >
        <form onSubmit={handleUpdateLifecycle} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'الحالة الجديدة' : 'Target Lifecycle Status'}</label>
            <select
              value={newLifecycleStatus}
              onChange={(e) => setNewLifecycleStatus(e.target.value as VehicleLifecycleStatus)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
            >
              <option value="ACTIVE">ACTIVE (نشط ومتاح للإيجار)</option>
              <option value="MAINTENANCE">MAINTENANCE (صيانة فنية)</option>
              <option value="DECOMMISSIONED">DECOMMISSIONED (خارج الخدمة)</option>
              <option value="SOLD">SOLD (تم بيع المركبة)</option>
            </select>
          </div>

          {newLifecycleStatus === 'SOLD' && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div>
                <label className="block text-zinc-400 text-[11px] mb-1">{isAr ? 'سعر البيع (AED)' : 'Sale Price (AED)'}</label>
                <input
                  type="number"
                  value={salePrice}
                  onChange={(e) => setSalePrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-[11px] mb-1">{isAr ? 'المشتري / المعرض' : 'Buyer Name'}</label>
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'السبب وملاحظات التدقيق' : 'Audit Reason'}</label>
            <textarea
              rows={2}
              required
              value={lifecycleReason}
              onChange={(e) => setLifecycleReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              placeholder="e.g. Scheduled quarterly service / Fleet renewal sale..."
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setLifecycleModalOpen(false)}
              className="px-3 py-2 rounded-xl text-zinc-400 hover:bg-zinc-900"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-purple-500 text-zinc-950 font-bold hover:brightness-110"
            >
              {isAr ? 'تحديث الحالة' : 'Apply Status'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};
