import React, { useState } from 'react';
import { 
  History, Globe, Shield, Tag, Calendar, User, Clock, 
  ArrowRightLeft, AlertCircle, CheckCircle2, ExternalLink, 
  DollarSign, Eye, EyeOff, Sparkles, Plus, AlertTriangle,
  Navigation, Radio, Gauge, BatteryCharging, Lock, Unlock, MapPin, Zap,
  Edit3, FileText, Check
} from 'lucide-react';
import { Vehicle, PlateAssignmentHistory, VehicleTimelineEvent, WebsiteVisibility, VehicleLifecycleStatus } from '../../types';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate, formatDateTime } from '../../lib/dateFormat';
import { EditVehicleModal } from '../modals/EditVehicleModal';

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

  const [activeTab, setActiveTab] = useState<'overview' | 'plates' | 'website' | 'timeline' | 'schedule' | 'telematics'>('overview');
  const [remoteEngineLock, setRemoteEngineLock] = useState(false);
  const [valetModeActive, setValetModeActive] = useState(false);

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

  // Edit Vehicle modal
  const [editModalOpen, setEditModalOpen] = useState(false);

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
                onClick={() => setEditModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#D4AF37] bg-[#D4AF37]/10 text-[#f5d97f] font-bold hover:bg-[#D4AF37] hover:text-zinc-950 transition-all shadow-sm"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isAr ? 'تعديل كافة بيانات المركبة' : 'Edit Full Vehicle Data'}</span>
              </button>

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
            <button
              onClick={() => setActiveTab('telematics')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'telematics' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 text-[#f5d97f]" />
              <span>{isAr ? 'التتبع الحي والجيوفينس' : 'Live Telematics & Geofence'}</span>
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">{isAr ? 'السعر اليومي' : 'Daily Rate'}</span>
                  <p className="text-sm font-bold text-zinc-100 mt-0.5">{(vehicle.dailyRate || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">{isAr ? 'مبلغ التأمين' : 'Deposit'}</span>
                  <p className="text-sm font-bold text-zinc-100 mt-0.5">{(vehicle.minDeposit || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">{isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}</span>
                  <p className="text-sm font-bold text-emerald-400 mt-0.5">{(vehicle.totalRevenue || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase">{isAr ? 'عداد المسافات' : 'Odometer'}</span>
                  <p className="text-sm font-bold text-sky-400 mt-0.5">{(vehicle.mileage || 0).toLocaleString()} {isAr ? 'كم' : 'km'}</p>
                </div>
              </div>

              {/* Traffic & Official Registration Card */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-[#f5d97f] text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{isAr ? 'بيانات المرور والترخيص والملف' : 'Traffic, Registration & TC Details'}</span>
                  </h4>
                  <button
                    onClick={() => setEditModalOpen(true)}
                    className="text-[11px] text-[#D4AF37] hover:underline font-semibold flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{isAr ? 'تعديل البيانات' : 'Edit'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'الملف المروري (TC No.)' : 'Traffic File (TC No.)'}</span>
                    <p className="font-mono text-zinc-100 font-bold mt-0.5">{vehicle.trafficFileNumber || '51317978'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'صنف اللوحة' : 'Plate Category'}</span>
                    <p className="text-zinc-200 font-medium mt-0.5">{vehicle.plateCategory || `${vehicle.plateCity} - فئة فاخرة`}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'تاريخ الترخيص' : 'Registration Date'}</span>
                    <p className="text-zinc-200 font-medium mt-0.5">{vehicle.registrationDate || formatDate(vehicle.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'إنتهاء الترخيص' : 'Registration Expiry'}</span>
                    <p className="text-amber-400 font-medium mt-0.5">{vehicle.registrationExpiry || vehicle.insuranceExpiry || '2026-12-31'}</p>
                  </div>
                </div>
              </div>

              {/* Insurance & Mortgage Card */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <h4 className="font-bold text-[#f5d97f] text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{isAr ? 'بيانات التأمين والرهن المالي' : 'Insurance Policy & Mortgage Entity'}</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'مؤمنة لدى' : 'Insurance Company'}</span>
                    <p className="text-zinc-100 font-bold mt-0.5">{vehicle.insuranceCompany || 'شركة دبي للتأمين (Dubai Insurance)'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'نوع التأمين' : 'Insurance Type'}</span>
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold text-[11px] border border-emerald-500/30">
                      {vehicle.insuranceType || 'شامل (Comprehensive)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'رقم الوثيقة' : 'Policy Number'}</span>
                    <p className="font-mono text-zinc-200 font-medium mt-0.5">{vehicle.insurancePolicyNumber || `POL-DXB-${vehicle.id.slice(0, 6)}`}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'إنتهاء التأمين' : 'Insurance Expiry'}</span>
                    <p className="text-emerald-400 font-bold mt-0.5">{vehicle.insuranceExpiry || '2026-12-31'}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-zinc-900 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'جهة الرهن' : 'Mortgagee / Financier'}</span>
                    <p className="text-zinc-200 font-medium mt-0.5">{vehicle.mortgagee || 'لا يوجد (ملك خالص للشركة)'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'مصدر الملكية' : 'Ownership Source'}</span>
                    <p className="text-zinc-200 font-bold mt-0.5">{vehicle.ownershipSource || 'OWNED'}</p>
                  </div>
                </div>
              </div>

              {/* Mechanical, Chassis & GPS Card */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <h4 className="font-bold text-[#f5d97f] text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{isAr ? 'المواصفات الفنية والشاسيه والتتبع (GPS)' : 'Mechanical Specs, VIN & GPS Telematics'}</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'رقم القاعدة (الهيكل / VIN)' : 'Chassis / VIN'}</span>
                    <p className="font-mono text-zinc-100 font-bold mt-0.5">{vehicle.chassisNumber || vehicle.vin}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'رقم المحرك' : 'Engine Serial Number'}</span>
                    <p className="font-mono text-zinc-200 font-medium mt-0.5">{vehicle.engineNumber || `ENG-${vehicle.id.slice(0, 6)}`}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'بلد الصنع' : 'Manufacturing Country'}</span>
                    <p className="text-zinc-200 font-medium mt-0.5">{vehicle.manufacturingCountry || 'ألمانيا (Germany)'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'عدد الركاب' : 'Seating Capacity'}</span>
                    <p className="text-zinc-200 font-bold mt-0.5">{vehicle.seatingCapacity || 4} {isAr ? 'ركاب' : 'Seats'}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-900 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'الشركة المسئولة عن جهاز التتبع' : 'GPS Provider'}</span>
                    <p className="text-sky-300 font-medium mt-0.5">{vehicle.gpsTrackingCompany || 'فالكون آي للأنظمة الذكية (Falcon Eye Telematics)'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'تاريخ انتهاء شهادة التتبع' : 'GPS Certificate Expiry'}</span>
                    <p className="text-zinc-200 font-medium mt-0.5">{vehicle.gpsCertificateExpiry || '2026-12-31'}</p>
                  </div>
                </div>
              </div>

              {/* Rental Allowances & Extra KM Policy */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <h4 className="font-bold text-[#f5d97f] text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{isAr ? 'سياسة المسافات والأسعار' : 'Mileage Allowances & Excess KM Rates'}</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'المسافة اليومية القياسية' : 'Daily Allowance'}</span>
                    <p className="text-zinc-100 font-bold mt-0.5">{vehicle.dailyMileageAllowance ?? 250} {isAr ? 'كم / يوم' : 'km/day'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'المسافة الشهرية القياسية' : 'Monthly Allowance'}</span>
                    <p className="text-zinc-100 font-bold mt-0.5">{vehicle.monthlyMileageAllowance ?? 4500} {isAr ? 'كم / شهر' : 'km/month'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'رسوم التجاوز للكيلومتر' : 'Excess KM Rate'}</span>
                    <p className="text-amber-400 font-bold mt-0.5">{vehicle.extraKmRate ?? 2} {isAr ? 'د.إ / كم' : 'AED/km'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">{isAr ? 'الموقع الحالي' : 'Current Showroom'}</span>
                    <p className="text-zinc-200 font-medium mt-0.5">{vehicle.currentLocation || (isAr ? 'المعرض الرئيسي - دبي' : 'Main Showroom')}</p>
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

          {/* TAB 6: TELEMATICS & GEOFENCING */}
          {activeTab === 'telematics' && (
            <div className="space-y-4">
              {/* Telematics Status Header */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-100">{isAr ? 'حالة التتبع النشط (OBD-II Telematics Live)' : 'Live Telematics & GPS Transponder'}</span>
                      <Badge variant="emerald" size="sm">ONLINE (4G IoT)</Badge>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {isAr ? 'آخر إشارة: منذ 12 ثانية • الجهاز: Splendor-IoT-Pro-v4' : 'Last Ping: 12 seconds ago • Device: Splendor-IoT-Pro-v4'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRemoteEngineLock(!remoteEngineLock)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow ${
                      remoteEngineLock
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                    }`}
                  >
                    {remoteEngineLock ? <Lock className="w-3.5 h-3.5 text-rose-400" /> : <Unlock className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>{remoteEngineLock ? (isAr ? 'المحرك مقفل عن بُعد' : 'Engine Immobilized') : (isAr ? 'قفل المحرك عن بُعد' : 'Remote Immobilizer')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setValetModeActive(!valetModeActive)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow ${
                      valetModeActive
                        ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{valetModeActive ? (isAr ? 'وضع الفاليه مفعل (80 كم/س)' : 'Valet Mode Active') : (isAr ? 'تفعيل وضع الفاليه' : 'Activate Valet')}</span>
                  </button>
                </div>
              </div>

              {/* Gauges & Real-time Telemetry */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-[11px]">{isAr ? 'السرعة الحالية' : 'Current Speed'}</span>
                    <Gauge className="w-3.5 h-3.5 text-[#f5d97f]" />
                  </div>
                  <p className="text-lg font-mono font-bold text-zinc-100">0 <span className="text-xs font-normal text-zinc-500">km/h</span></p>
                  <span className="text-[10px] text-zinc-500">{isAr ? 'حالة الحركة: متوقفة (Parked)' : 'Motion: Parked / Engine Off'}</span>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-[11px]">{isAr ? 'مستوى الوقود / الطاقة' : 'Fuel / Energy'}</span>
                    <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <p className="text-lg font-mono font-bold text-emerald-400">{(vehicle as any).fuelLevel || '100%'}</p>
                  <span className="text-[10px] text-zinc-500">{isAr ? 'المدى التقديري: 580 كم' : 'Est. Range: 580 km'}</span>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-[11px]">{isAr ? 'العداد الحي OBD' : 'Live Odometer'}</span>
                    <Radio className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <p className="text-lg font-mono font-bold text-zinc-100">{(vehicle.mileage || 0).toLocaleString()} <span className="text-xs font-normal text-zinc-500">km</span></p>
                  <span className="text-[10px] text-zinc-500">{isAr ? 'محدث آلياً من ECU' : 'Synced with ECU'}</span>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-[11px]">{isAr ? 'المنطقة الجغرافية' : 'Geofence Perimeter'}</span>
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <p className="text-xs font-bold text-emerald-400 mt-1">{isAr ? 'داخل النطاق المسموح (UAE)' : 'Inside Safe Zone (UAE)'}</p>
                  <span className="text-[10px] text-zinc-500">{isAr ? 'تنبيه الحدود: غير مقترب' : 'Border Proximity: Safe'}</span>
                </div>
              </div>

              {/* Simulated GPS Radar Map Visual */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#f5d97f]" />
                    <span className="font-bold text-zinc-200">{isAr ? 'الموقع الجغرافي الحي والخريطة' : 'Live Real-Time Fleet Radar'}</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">
                    25.1972° N, 55.2744° E (Downtown Dubai)
                  </span>
                </div>

                {/* Radar Mock Visualization */}
                <div className="h-44 rounded-xl bg-zinc-900 border border-zinc-800 relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(#D4AF37_1px,transparent_1px)] [background-size:16px_16px] opacity-15" />
                  
                  {/* Radar Circles */}
                  <div className="absolute w-64 h-64 rounded-full border border-[#D4AF37]/20 animate-ping opacity-20" />
                  <div className="absolute w-40 h-40 rounded-full border border-[#D4AF37]/30" />
                  <div className="absolute w-20 h-20 rounded-full border border-[#D4AF37]/40" />
                  
                  {/* Vehicle Blip */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-[#D4AF37] text-zinc-950 flex items-center justify-center shadow-lg shadow-[#D4AF37]/30 animate-bounce">
                      <Navigation className="w-4 h-4 rotate-45" />
                    </div>
                    <div className="mt-2 px-2.5 py-1 rounded-md bg-zinc-950/90 border border-[#D4AF37]/40 text-[10px] font-bold text-[#f5d97f]">
                      {vehicle.make} {vehicle.model} • {vehicle.plateNumber}
                    </div>
                  </div>

                  <div className="absolute bottom-2 start-3 text-[10px] text-zinc-500 bg-zinc-950/80 px-2 py-0.5 rounded border border-zinc-800">
                    {isAr ? 'الموقع الحالي: بوليفارد الشيخ محمد بن راشد، وسط دبي' : 'Current Location: Sheikh Mohammed bin Rashid Blvd, Downtown Dubai'}
                  </div>
                </div>
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

      {/* EDIT FULL VEHICLE MODAL */}
      <EditVehicleModal
        vehicle={vehicle}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
      />
    </>
  );
};
