import React, { useState } from 'react';
import {
  History, Globe, Shield, Tag, Calendar, User, Clock,
  ArrowRightLeft, AlertCircle, CheckCircle2, ExternalLink,
  DollarSign, Eye, EyeOff, Sparkles, Plus, AlertTriangle, Wrench, Save, UploadCloud, Loader2
} from 'lucide-react';
import {
  Vehicle, PlateAssignmentHistory, VehicleTimelineEvent, WebsiteVisibility, VehicleLifecycleStatus,
  VehicleBodyStyle, VehicleClassTier, VehicleSuvClass, VehiclePerformanceClass, VehicleRentalSegment,
  VehicleUsageType, VehicleDrivetrain, VehicleRoofType
} from '../../types';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate, formatDateTime } from '../../lib/dateFormat';
import { uploadFile } from '../../lib/upload';
import {
  VEHICLE_BODY_STYLES, VEHICLE_CLASS_TIERS, VEHICLE_SUV_CLASSES, VEHICLE_PERFORMANCE_CLASSES,
  VEHICLE_RENTAL_SEGMENTS, VEHICLE_USAGE_TYPES, VEHICLE_DRIVETRAINS, VEHICLE_FUEL_TYPES, VEHICLE_ROOF_TYPES,
  isSuvBodyStyle
} from '../../config/vehicleClassification';
import { evaluateVehiclePublishReadiness } from '../../server/vehiclePublishGate';

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
  const { vehicles, assignPlate, publishToWebsite, updateVehicle, updateLifecycleStatus, startVehicleMaintenance, logVehicleMaintenance, contracts, reservations, showToast } = useCRM();
  const { currentUser } = useAuth();

  const vehicle = vehicles.find(v => v.id === vehicleId);

  const [activeTab, setActiveTab] = useState<'overview' | 'classification' | 'technical' | 'plates' | 'website' | 'timeline' | 'schedule' | 'lto'>('overview');
  const vehicleLtoContract = vehicle ? contracts.find(c => c.vehicleId === vehicle.id && c.contractType === 'lease_to_own' && c.lto && c.lto.ltoStatus !== 'completed' && c.lto.ltoStatus !== 'terminated') : undefined;

  // Basic Info edit state (Vehicle Master Profile mission) -- editable,
  // saved through the same generic updateVehicle() every other vehicle
  // edit already goes through; nothing here is a parallel storage path.
  const [editMake, setEditMake] = useState(vehicle?.make || '');
  const [editModel, setEditModel] = useState(vehicle?.model || '');
  const [editYear, setEditYear] = useState(vehicle?.year || 0);
  const [editTrim, setEditTrim] = useState(vehicle?.trim || '');
  const [editExteriorColor, setEditExteriorColor] = useState(vehicle?.exteriorColor || '');
  const [editInteriorColor, setEditInteriorColor] = useState(vehicle?.interiorColor || '');
  const [editCountryOfOrigin, setEditCountryOfOrigin] = useState(vehicle?.countryOfOrigin || '');
  const [isSavingBasicInfo, setIsSavingBasicInfo] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Classification edit state
  const [editBodyStyle, setEditBodyStyle] = useState<VehicleBodyStyle | undefined>(vehicle?.bodyStyle);
  const [editVehicleClassTier, setEditVehicleClassTier] = useState<VehicleClassTier | undefined>(vehicle?.vehicleClassTier);
  const [editSuvClass, setEditSuvClass] = useState<VehicleSuvClass | undefined>(vehicle?.suvClass);
  const [editPerformanceClass, setEditPerformanceClass] = useState<VehiclePerformanceClass | undefined>(vehicle?.performanceClass);
  const [editRentalSegment, setEditRentalSegment] = useState<VehicleRentalSegment | undefined>(vehicle?.rentalSegment);
  const [editUsageTypes, setEditUsageTypes] = useState<VehicleUsageType[]>(vehicle?.usageTypes || []);
  const [isSavingClassification, setIsSavingClassification] = useState(false);

  // Technical specs edit state
  const [editEngine, setEditEngine] = useState(vehicle?.engine || '');
  const [editHorsepower, setEditHorsepower] = useState(vehicle?.horsepower || 0);
  const [editTransmission, setEditTransmission] = useState(vehicle?.transmission || '');
  const [editFuelType, setEditFuelType] = useState<Vehicle['fuelType']>(vehicle?.fuelType || 'petrol');
  const [editDrivetrain, setEditDrivetrain] = useState<VehicleDrivetrain | undefined>(vehicle?.drivetrain);
  const [editDoors, setEditDoors] = useState<number | undefined>(vehicle?.doors);
  const [editSeats, setEditSeats] = useState<number | undefined>(vehicle?.seats);
  const [editRoofType, setEditRoofType] = useState<VehicleRoofType | undefined>(vehicle?.roofType);
  const [isSavingTechnical, setIsSavingTechnical] = useState(false);

  // Verified Publish Gate -- real-time client-side preview using the exact
  // same evaluateVehiclePublishReadiness() the server enforces, so staff see
  // precisely what is blocking publish before they even press Save.
  const publishGatePreview = vehicle ? evaluateVehiclePublishReadiness(vehicle) : null;
  const [publishGateError, setPublishGateError] = useState<{ missingReasons: string[]; missingReasonsEn: string[] } | null>(null);

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

  // RULE-M03: Start/log maintenance modals
  const [startMaintenanceModalOpen, setStartMaintenanceModalOpen] = useState(false);
  const [maintenanceReason, setMaintenanceReason] = useState('');
  const [isStartingMaintenance, setIsStartingMaintenance] = useState(false);
  const [logMaintenanceModalOpen, setLogMaintenanceModalOpen] = useState(false);
  const [serviceMileage, setServiceMileage] = useState(vehicle?.mileage || 0);
  const [serviceNotes, setServiceNotes] = useState('');
  const [isLoggingMaintenance, setIsLoggingMaintenance] = useState(false);

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

  const handleStartMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintenanceReason.trim()) return;
    try {
      setIsStartingMaintenance(true);
      await startVehicleMaintenance(vehicle.id, maintenanceReason.trim());
      setStartMaintenanceModalOpen(false);
      setMaintenanceReason('');
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsStartingMaintenance(false);
    }
  };

  const handleLogMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoggingMaintenance(true);
      await logVehicleMaintenance(vehicle.id, Number(serviceMileage), serviceNotes.trim());
      setLogMaintenanceModalOpen(false);
      setServiceNotes('');
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoggingMaintenance(false);
    }
  };

  const handleSaveWebsitePublish = async () => {
    try {
      setIsSavingWeb(true);
      setPublishGateError(null);
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
      // The Verified Publish Gate rejects an incomplete/unconfirmed publish
      // with a `missingReasons` array attached to the thrown Error (see
      // parseApiResponse in CRMContext.tsx) -- surface it exactly, never a
      // generic failure message, so staff know precisely what to fix.
      if (Array.isArray(err?.missingReasons)) {
        setPublishGateError({ missingReasons: err.missingReasons, missingReasonsEn: err.missingReasonsEn || [] });
      }
    } finally {
      setIsSavingWeb(false);
    }
  };

  const handleSaveBasicInfo = async () => {
    if (!vehicle) return;
    try {
      setIsSavingBasicInfo(true);
      await updateVehicle(vehicle.id, {
        make: editMake, model: editModel, year: Number(editYear), trim: editTrim,
        exteriorColor: editExteriorColor, interiorColor: editInteriorColor, countryOfOrigin: editCountryOfOrigin
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSavingBasicInfo(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !vehicle) return;
    setIsUploadingPhoto(true);
    try {
      const result = await uploadFile(file, 'vehicles');
      if (result?.url) {
        await updateVehicle(vehicle.id, {
          thumbnail: result.url,
          images: [result.url, ...(vehicle.images || []).filter(img => img !== result.url)]
        });
      }
    } catch (err: any) {
      console.error('Vehicle image upload failed:', err);
      showToast?.(
        isAr ? 'فشل رفع الصورة' : 'Image Upload Failed',
        err?.message || (isAr ? 'حدث خطأ أثناء رفع صورة المركبة.' : 'Something went wrong uploading the vehicle image.'),
        'error'
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveClassification = async () => {
    if (!vehicle) return;
    try {
      setIsSavingClassification(true);
      await updateVehicle(vehicle.id, {
        bodyStyle: editBodyStyle, vehicleClassTier: editVehicleClassTier,
        suvClass: isSuvBodyStyle(editBodyStyle) ? editSuvClass : undefined,
        performanceClass: editPerformanceClass, rentalSegment: editRentalSegment, usageTypes: editUsageTypes
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSavingClassification(false);
    }
  };

  const handleSaveTechnical = async () => {
    if (!vehicle) return;
    try {
      setIsSavingTechnical(true);
      await updateVehicle(vehicle.id, {
        engine: editEngine, horsepower: Number(editHorsepower), transmission: editTransmission,
        fuelType: editFuelType, drivetrain: editDrivetrain, doors: editDoors, seats: editSeats, roofType: editRoofType
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSavingTechnical(false);
    }
  };

  const toggleEditUsageType = (usage: VehicleUsageType) => {
    setEditUsageTypes(prev => prev.includes(usage) ? prev.filter(u => u !== usage) : [...prev, usage]);
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
              <div className="shrink-0 space-y-1">
                <label className="relative group cursor-pointer block">
                  <img
                    src={vehicle.thumbnail}
                    alt={vehicle.model}
                    className="w-20 h-16 object-cover rounded-xl border border-zinc-800"
                  />
                  <span className="absolute inset-0 rounded-xl bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {isUploadingPhoto ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <UploadCloud className="w-4 h-4 text-white" />
                    )}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
                </label>
                <label className="flex items-center justify-center gap-1 text-[10px] text-[#f5d97f] hover:underline cursor-pointer">
                  <UploadCloud className="w-2.5 h-2.5" />
                  <span>{isUploadingPhoto ? (isAr ? 'جارٍ الرفع...' : 'Uploading...') : (isAr ? 'تغيير الصورة' : 'Change Photo')}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
                </label>
              </div>
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
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl font-medium transition-all ${
                activeTab === 'overview' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              {isAr ? 'نظرة عامة ومواصفات' : 'Specs & Financials'}
            </button>
            <button
              onClick={() => setActiveTab('classification')}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl font-medium transition-all ${
                activeTab === 'classification' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              {isAr ? 'التصنيف' : 'Classification'}
            </button>
            <button
              onClick={() => setActiveTab('technical')}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'technical' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>{isAr ? 'المواصفات الفنية' : 'Technical Specs'}</span>
            </button>
            <button
              onClick={() => setActiveTab('plates')}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'plates' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{isAr ? 'سجل اللوحات التاريخي' : 'Plate Assignment History'} ({vehicle.plateHistory?.length || 1})</span>
            </button>
            <button
              onClick={() => setActiveTab('website')}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'website' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isAr ? 'الظهور في الموقع العام' : 'Public Website Controls'}</span>
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'timeline' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{isAr ? 'سجل الأحداث والتدقيق' : 'Audit Timeline'} ({vehicle.timeline?.length || 0})</span>
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'schedule' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{isAr ? 'العقود والحجوزات' : 'Rentals & Schedule'} ({vehicleContracts.length + vehicleReservations.length})</span>
            </button>
            {vehicleLtoContract && (
              <button
                onClick={() => setActiveTab('lto')}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === 'lto' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>{isAr ? 'الإيجار المنتهي بالتملك' : 'Lease-to-Own'}</span>
              </button>
            )}
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

              {/* Editable Basic Info -- Vehicle Master Profile mission: every
                  existing field stays, edited through the same updateVehicle()
                  every other vehicle mutation already uses. */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <h4 className="font-bold text-zinc-200 text-xs uppercase tracking-wider">
                  {isAr ? 'تعديل المعلومات الأساسية' : 'Edit Basic Info'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-zinc-500 text-[10px] mb-1">{isAr ? 'الشركة المصنعة' : 'Manufacturer'}</label>
                    <input type="text" value={editMake} onChange={e => setEditMake(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 text-[10px] mb-1">{isAr ? 'الموديل' : 'Model'}</label>
                    <input type="text" value={editModel} onChange={e => setEditModel(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 text-[10px] mb-1">{isAr ? 'سنة الصنع' : 'Model Year'}</label>
                    <input type="number" value={editYear} onChange={e => setEditYear(Number(e.target.value))} className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 text-[10px] mb-1">{isAr ? 'الفئة/التجهيز' : 'Trim'}</label>
                    <input type="text" value={editTrim} onChange={e => setEditTrim(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 text-[10px] mb-1">{isAr ? 'اللون الخارجي' : 'Exterior Color'}</label>
                    <input type="text" value={editExteriorColor} onChange={e => setEditExteriorColor(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 text-[10px] mb-1">{isAr ? 'اللون الداخلي' : 'Interior Color'}</label>
                    <input type="text" value={editInteriorColor} onChange={e => setEditInteriorColor(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 text-[10px] mb-1">{isAr ? 'بلد الصنع' : 'Country of Origin'}</label>
                    <input type="text" value={editCountryOfOrigin} onChange={e => setEditCountryOfOrigin(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveBasicInfo}
                    disabled={isSavingBasicInfo}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#D4AF37] text-zinc-950 font-bold text-[11px] hover:brightness-110 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingBasicInfo ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'حفظ المعلومات الأساسية' : 'Save Basic Info')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CLASSIFICATION */}
          {activeTab === 'classification' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'نوع الهيكل' : 'Body Style'}</label>
                    <select value={editBodyStyle || ''} onChange={e => setEditBodyStyle((e.target.value || undefined) as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
                      <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                      {VEHICLE_BODY_STYLES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'مستوى الفئة' : 'Vehicle Class Tier'}</label>
                    <select value={editVehicleClassTier || ''} onChange={e => setEditVehicleClassTier((e.target.value || undefined) as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
                      <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                      {VEHICLE_CLASS_TIERS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                    </select>
                  </div>
                  {isSuvBodyStyle(editBodyStyle) && (
                    <div>
                      <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'تصنيف الدفع الرباعي' : 'SUV Classification'}</label>
                      <select value={editSuvClass || ''} onChange={e => setEditSuvClass((e.target.value || undefined) as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
                        <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                        {VEHICLE_SUV_CLASSES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'تصنيف الأداء' : 'Performance Classification'}</label>
                    <select value={editPerformanceClass || ''} onChange={e => setEditPerformanceClass((e.target.value || undefined) as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
                      <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                      {VEHICLE_PERFORMANCE_CLASSES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'فئة التأجير' : 'Rental Segment'}</label>
                    <select value={editRentalSegment || ''} onChange={e => setEditRentalSegment((e.target.value || undefined) as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
                      <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                      {VEHICLE_RENTAL_SEGMENTS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'أنواع الاستخدام' : 'Usage Types'}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {VEHICLE_USAGE_TYPES.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => toggleEditUsageType(o.value)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] border transition-all ${
                          editUsageTypes.includes(o.value) ? 'bg-[#D4AF37]/20 text-[#f5d97f] border-[#D4AF37]/40' : 'text-zinc-400 border-zinc-800 hover:bg-zinc-900'
                        }`}
                      >
                        {isAr ? o.labelAr : o.labelEn}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveClassification}
                    disabled={isSavingClassification}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#D4AF37] text-zinc-950 font-bold text-[11px] hover:brightness-110 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingClassification ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'حفظ التصنيف' : 'Save Classification')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: TECHNICAL SPECS */}
          {activeTab === 'technical' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'المحرك' : 'Engine'}</label>
                    <input type="text" value={editEngine} onChange={e => setEditEngine(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'القدرة الحصانية (HP)' : 'Horsepower (HP)'}</label>
                    <input type="number" value={editHorsepower} onChange={e => setEditHorsepower(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'ناقل الحركة' : 'Transmission'}</label>
                    <input type="text" value={editTransmission} onChange={e => setEditTransmission(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'نظام الدفع' : 'Drivetrain'}</label>
                    <select value={editDrivetrain || ''} onChange={e => setEditDrivetrain((e.target.value || undefined) as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
                      <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                      {VEHICLE_DRIVETRAINS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'نوع الوقود/الدفع' : 'Fuel / Powertrain'}</label>
                    <select value={editFuelType} onChange={e => setEditFuelType(e.target.value as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
                      {VEHICLE_FUEL_TYPES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'نوع السقف' : 'Roof Type'}</label>
                    <select value={editRoofType || ''} onChange={e => setEditRoofType((e.target.value || undefined) as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
                      <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                      {VEHICLE_ROOF_TYPES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'عدد الأبواب' : 'Doors'}</label>
                    <input type="number" value={editDoors ?? ''} onChange={e => setEditDoors(e.target.value ? Number(e.target.value) : undefined)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1">{isAr ? 'عدد المقاعد' : 'Seats'}</label>
                    <input type="number" value={editSeats ?? ''} onChange={e => setEditSeats(e.target.value ? Number(e.target.value) : undefined)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveTechnical}
                    disabled={isSavingTechnical}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#D4AF37] text-zinc-950 font-bold text-[11px] hover:brightness-110 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingTechnical ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'حفظ المواصفات الفنية' : 'Save Technical Specs')}</span>
                  </button>
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

                {/* Verified Publish Gate -- real-time preview using the vehicle's
                    CURRENT saved data (evaluateVehiclePublishReadiness), plus
                    the server's own rejection detail if the last publish
                    attempt was blocked. Never lets the toggle above imply
                    publish is possible when required data is missing. */}
                {publishGatePreview && !publishGatePreview.ready && (
                  <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-[11px] space-y-1.5">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{isAr ? 'غير جاهز للنشر — بيانات ناقصة / تحتاج تحقق' : 'Not ready to publish — missing or unverified data'}</span>
                    </div>
                    <ul className="list-disc ps-5 space-y-0.5">
                      {(isAr ? publishGatePreview.missingReasons : publishGatePreview.missingReasonsEn).map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {publishGateError && (
                  <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-[11px] space-y-1.5">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{isAr ? 'تم رفض النشر من قبل النظام:' : 'Publish rejected by the server:'}</span>
                    </div>
                    <ul className="list-disc ps-5 space-y-0.5">
                      {(isAr ? publishGateError.missingReasons : (publishGateError.missingReasonsEn.length ? publishGateError.missingReasonsEn : publishGateError.missingReasons)).map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

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
              {/* RULE-M01-M03: Preventive Maintenance Schedule */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-bold text-zinc-200 text-xs uppercase tracking-wide">
                    {isAr ? 'جدول الصيانة الوقائية' : 'Preventive Maintenance Schedule'}
                  </h4>
                  <Badge
                    variant={vehicle.maintenanceStatus === 'in_service' ? 'amber' : vehicle.maintenanceStatus === 'due_soon' ? 'rose' : 'emerald'}
                    size="sm"
                  >
                    {vehicle.maintenanceStatus === 'in_service'
                      ? (isAr ? 'في الصيانة الآن' : 'In Service Now')
                      : vehicle.maintenanceStatus === 'due_soon'
                      ? (isAr ? 'الصيانة مستحقة قريباً' : 'Due Soon')
                      : (isAr ? 'ضمن المعدل الطبيعي' : 'Optimal')}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <p className="text-zinc-500">{isAr ? 'العداد الحالي' : 'Current mileage'}</p>
                    <p className="font-mono text-zinc-200 font-semibold">{(vehicle.mileage || 0).toLocaleString()} km</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">{isAr ? 'آخر صيانة' : 'Last service'}</p>
                    <p className="font-mono text-zinc-200 font-semibold">{(vehicle.lastMaintenanceMileage ?? 0).toLocaleString()} km</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">{isAr ? 'الصيانة القادمة' : 'Next due at'}</p>
                    <p className="font-mono text-zinc-200 font-semibold">{(vehicle.nextMaintenanceMileage || 0).toLocaleString()} km</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {vehicle.maintenanceStatus === 'in_service' ? (
                    <button
                      onClick={() => { setServiceMileage(vehicle.mileage || 0); setLogMaintenanceModalOpen(true); }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 font-medium transition-colors"
                    >
                      {isAr ? 'تسجيل انتهاء الصيانة' : 'Log Completed Service'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setStartMaintenanceModalOpen(true)}
                      disabled={vehicle.status === 'rented' || vehicle.status === 'reserved'}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={vehicle.status === 'rented' || vehicle.status === 'reserved' ? (isAr ? 'المركبة قيد الإيجار حالياً' : 'Vehicle is currently rented/reserved') : undefined}
                    >
                      {isAr ? 'بدء الصيانة' : 'Start Maintenance'}
                    </button>
                  )}
                </div>
              </div>

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

          {/* TAB: LEASE-TO-OWN */}
          {activeTab === 'lto' && vehicleLtoContract && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {isAr
                    ? 'هذه المركبة ضمن اتفاقية إيجار منتهٍ بالتملك نشطة -- لا تظهر كمتاحة للإيجار العادي طوال مدة الاتفاقية.'
                    : 'This vehicle is under an active Lease-to-Own agreement -- it will not appear as available for ordinary rental for the duration of the agreement.'}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-zinc-100">{vehicleLtoContract.id}</span>
                  <Badge variant={vehicleLtoContract.lto!.ltoStatus === 'active' ? 'emerald' : vehicleLtoContract.lto!.ltoStatus === 'default' ? 'rose' : 'gold'} size="sm">
                    {vehicleLtoContract.lto!.ltoStatus.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                </div>
                <p className="text-zinc-400 text-[11px]">{vehicleLtoContract.customerName}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                  <div>
                    <p className="text-zinc-500">{isAr ? 'تاريخ البدء' : 'Start'}</p>
                    <p className="font-mono text-zinc-200 font-semibold">{vehicleLtoContract.startDateTime.split('T')[0]}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">{isAr ? 'تاريخ النهاية المتوقع' : 'Expected End'}</p>
                    <p className="font-mono text-zinc-200 font-semibold">{vehicleLtoContract.endDateTime.split('T')[0]}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">{isAr ? 'حالة الدفع' : 'Payment Status'}</p>
                    <p className="font-mono text-zinc-200 font-semibold">{vehicleLtoContract.lto!.paidAmount.toLocaleString()} / {vehicleLtoContract.lto!.totalContractValue.toLocaleString()} AED</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">{isAr ? 'حالة الملكية' : 'Ownership Status'}</p>
                    <p className="font-mono text-zinc-200 font-semibold">{vehicleLtoContract.lto!.ltoStatus === 'ownership_transferred' || vehicleLtoContract.lto!.ltoStatus === 'completed' ? (isAr ? 'منقولة' : 'Transferred') : (isAr ? 'لم تُنقل بعد' : 'Not yet transferred')}</p>
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

      {/* START MAINTENANCE MODAL (RULE-M03) */}
      <Modal
        isOpen={startMaintenanceModalOpen}
        onClose={() => setStartMaintenanceModalOpen(false)}
        title={isAr ? 'بدء الصيانة' : 'Start Maintenance'}
        subtitle={`Vehicle: ${vehicle.make} ${vehicle.model}`}
        maxWidth="sm"
      >
        <form onSubmit={handleStartMaintenanceSubmit} className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-[11px]">
            {isAr
              ? 'ستصبح المركبة غير متاحة للحجز فوراً حتى يتم تسجيل انتهاء الصيانة.'
              : 'The vehicle becomes unavailable for new bookings immediately, until the completed service is logged.'}
          </div>
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'السبب *' : 'Reason *'}</label>
            <textarea
              required
              rows={2}
              value={maintenanceReason}
              onChange={(e) => setMaintenanceReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              placeholder="e.g. Scheduled 7,000 km oil & filter service"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setStartMaintenanceModalOpen(false)} className="px-3 py-2 rounded-xl text-zinc-400 hover:bg-zinc-900">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" disabled={isStartingMaintenance} className="px-4 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold hover:brightness-110 disabled:opacity-50">
              {isAr ? 'بدء الصيانة' : 'Start Maintenance'}
            </button>
          </div>
        </form>
      </Modal>

      {/* LOG COMPLETED MAINTENANCE MODAL (RULE-M03) */}
      <Modal
        isOpen={logMaintenanceModalOpen}
        onClose={() => setLogMaintenanceModalOpen(false)}
        title={isAr ? 'تسجيل انتهاء الصيانة' : 'Log Completed Service'}
        subtitle={`Vehicle: ${vehicle.make} ${vehicle.model}`}
        maxWidth="sm"
      >
        <form onSubmit={handleLogMaintenanceSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'قراءة العداد عند الصيانة (كم) *' : 'Odometer at service (km) *'}</label>
            <input
              type="number"
              required
              min={vehicle.lastMaintenanceMileage ?? 0}
              value={serviceMileage}
              onChange={(e) => setServiceMileage(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'ملاحظات' : 'Notes'}</label>
            <textarea
              rows={2}
              value={serviceNotes}
              onChange={(e) => setServiceNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              placeholder="e.g. Oil, filter, and brake pads replaced"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setLogMaintenanceModalOpen(false)} className="px-3 py-2 rounded-xl text-zinc-400 hover:bg-zinc-900">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" disabled={isLoggingMaintenance} className="px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-bold hover:brightness-110 disabled:opacity-50">
              {isAr ? 'تسجيل الانتهاء' : 'Log Completed'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};
