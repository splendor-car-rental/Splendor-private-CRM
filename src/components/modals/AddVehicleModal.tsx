import React, { useEffect, useRef, useState } from 'react';
import {
  Car, DollarSign, Wand2, PlusCircle, CheckCircle2, UploadCloud,
  Layers, Shield, Gauge, Fuel, Zap, Search, Filter, Check
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { apiFetch } from '../../lib/apiFetch';
import { uploadFile } from '../../lib/upload';
import {
  VehicleCategory, VehicleStatus, VehicleManufacturer, VehicleCatalogModel,
  VehicleBodyStyle, VehicleClassTier, VehicleSuvClass, VehiclePerformanceClass,
  VehicleRentalSegment, VehicleUsageType, VehicleDrivetrain, VehicleRoofType
} from '../../types';
import {
  VEHICLE_BODY_STYLES, VEHICLE_CLASS_TIERS, VEHICLE_SUV_CLASSES, VEHICLE_PERFORMANCE_CLASSES,
  VEHICLE_RENTAL_SEGMENTS, VEHICLE_USAGE_TYPES, VEHICLE_DRIVETRAINS, VEHICLE_FUEL_TYPES, VEHICLE_ROOF_TYPES,
  isSuvBodyStyle
} from '../../config/vehicleClassification';
import {
  EXTERIOR_COLOR_PRESETS, INTERIOR_COLOR_PRESETS, COUNTRY_OF_ORIGIN_PRESETS
} from '../../config/vehicleCustomizationPresets';
import { Modal } from '../common/Modal';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
}


type Tab = 'basic' | 'classification' | 'technical' | 'pricing';

const emptyForm = () => ({
  make: 'Hyundai',
  model: 'Elantra 2.0L',
  year: 2025,
  trim: 'Smart Plus',
  category: 'economy_sedan' as VehicleCategory,
  exteriorColor: 'Polar White',
  interiorColor: 'Beige Leather',
  countryOfOrigin: 'South Korea',
  plateNumber: `DXB ${String.fromCharCode(65 + Math.floor(Math.random() * 26))} ${Math.floor(100 + Math.random() * 900)}`,
  plateCity: 'Dubai',
  vin: `KMH${Math.floor(10000000000000 + Math.random() * 90000000000000)}`,
  dailyRate: 150,
  weeklyRate: 950,
  monthlyRate: 3200,
  minDeposit: 1500,
  mileage: 4500,
  fuelType: 'petrol' as VehicleCatalogModel['fuelType'],
  transmission: 'Smartstream IVT / Automatic',
  engine: '2.0L MPI 4-Cylinder',
  horsepower: 147,
  doors: 4 as number | undefined,
  seats: 5 as number | undefined,
  roofType: 'fixed' as VehicleRoofType | undefined,
  drivetrain: 'fwd' as VehicleDrivetrain | undefined,
  bodyStyle: 'sedan' as VehicleBodyStyle | undefined,
  vehicleClassTier: 'economy' as VehicleClassTier | undefined,
  suvClass: undefined as VehicleSuvClass | undefined,
  performanceClass: 'standard' as VehiclePerformanceClass | undefined,
  rentalSegment: 'economy' as VehicleRentalSegment | undefined,
  usageTypes: ['daily', 'family'] as VehicleUsageType[],
  catalogModelId: 'hyundai-elantra' as string | undefined,
  status: 'available' as VehicleStatus,
  thumbnail: '',
  images: [] as string[]
});

export const AddVehicleModal: React.FC<AddVehicleModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { addVehicle, showToast } = useCRM();
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<Tab>('basic');

  const [form, setForm] = useState(emptyForm());
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [manufacturers, setManufacturers] = useState<VehicleManufacturer[]>([]);
  const [selectedManufacturerId, setSelectedManufacturerId] = useState<string>('hyundai');
  const [catalogModels, setCatalogModels] = useState<VehicleCatalogModel[]>([]);

  const [requestModelOpen, setRequestModelOpen] = useState(false);
  const [requestModelName, setRequestModelName] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    apiFetch('/api/vehicle-catalog/manufacturers')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`Request failed (${res.status})`)))
      .then((data) => setManufacturers(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('Failed to load manufacturer catalog:', err);
        setManufacturers([]);
        if (showToast) {
          showToast(
            isAr ? 'تعذر تحميل قائمة الشركات المصنّعة' : 'Could Not Load Manufacturers',
            isAr ? 'حدث خطأ أثناء تحميل كتالوج الشركات المصنّعة. أعد فتح النافذة أو حاول مرة أخرى.' : 'Something went wrong loading the manufacturer catalog. Reopen this dialog or try again.',
            'error'
          );
        }
      });
  }, [isOpen]);

  useEffect(() => {
    if (!selectedManufacturerId) { setCatalogModels([]); return; }
    apiFetch(`/api/vehicle-catalog/models?manufacturerId=${encodeURIComponent(selectedManufacturerId)}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setCatalogModels(Array.isArray(data) ? data : []))
      .catch(() => setCatalogModels([]));
  }, [selectedManufacturerId]);


  const handleManufacturerSelect = (id: string) => {
    setSelectedManufacturerId(id);
    const manufacturer = manufacturers.find((m) => m.id === id);
    if (manufacturer) {
      setForm(prev => ({ 
        ...prev, 
        make: manufacturer.name, 
        countryOfOrigin: manufacturer.countryOfOrigin || prev.countryOfOrigin, 
        catalogModelId: undefined 
      }));
    }
  };

  const applyCatalogModel = (model: VehicleCatalogModel) => {
    setForm(prev => ({
      ...prev,
      model: model.model,
      trim: model.trim || prev.trim,
      catalogModelId: model.id,
      bodyStyle: model.bodyStyle || prev.bodyStyle,
      engine: model.engine || prev.engine,
      horsepower: model.horsepower || prev.horsepower,
      transmission: model.transmission || prev.transmission,
      drivetrain: model.drivetrain || prev.drivetrain,
      fuelType: model.fuelType || prev.fuelType,
      doors: model.doors ?? prev.doors,
      seats: model.seats ?? prev.seats,
      roofType: model.roofType || prev.roofType,
      countryOfOrigin: model.countryOfOrigin || prev.countryOfOrigin
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingImage(true);
    try {
      const result = await uploadFile(file, 'vehicles');
      if (result?.url) {
        setForm(prev => ({
          ...prev,
          thumbnail: result.url,
          images: [result.url, ...(prev.images || []).filter(img => img !== result.url)]
        }));
      }
    } catch (err: any) {
      console.error('Vehicle image upload failed:', err);
      if (showToast) {
        showToast(
          isAr ? 'فشل رفع الصورة' : 'Image Upload Failed',
          err?.message || (isAr ? 'حدث خطأ أثناء رفع صورة المركبة.' : 'Something went wrong uploading the vehicle image.'),
          'error'
        );
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleUsageType = (usage: VehicleUsageType) => {
    setForm(prev => ({
      ...prev,
      usageTypes: prev.usageTypes.includes(usage) ? prev.usageTypes.filter(u => u !== usage) : [...prev.usageTypes, usage]
    }));
  };

  const submitModelRequest = async () => {
    const manufacturerName = manufacturers.find(m => m.id === selectedManufacturerId)?.name || form.make;
    if (!manufacturerName || !requestModelName.trim()) return;
    setRequestSubmitting(true);
    try {
      const res = await apiFetch('/api/vehicle-catalog/model-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'new_model',
          manufacturerName,
          modelName: requestModelName.trim(),
          details: `Requested from Add Vehicle screen for ${manufacturerName} ${requestModelName.trim()}`
        })
      });
      if (res.ok) {
        setRequestSubmitted(true);
        setRequestModelName('');
      }
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addVehicle(form);
      if (showToast) {
        showToast(
          isAr ? 'تمت إضافة المركبة' : 'Vehicle Added',
          isAr ? `تمت إضافة ${form.make} ${form.model} بنجاح إلى الأسطول` : `${form.make} ${form.model} was successfully registered to the fleet.`,
          'success'
        );
      }
      onClose();
      setForm(emptyForm());
      setSelectedManufacturerId('');
      setTab('basic');
    } catch (err: any) {
      // addVehicle() already raises its own toast on a server/network
      // failure -- this one just guarantees the user sees SOMETHING even if
      // that call is ever changed to fail silently, instead of the modal
      // just sitting there with no visible feedback.
      console.error('Failed to add vehicle:', err);
      if (showToast) {
        showToast(
          isAr ? 'تعذرت إضافة المركبة' : 'Could Not Add Vehicle',
          err?.message || (isAr ? 'حدث خطأ أثناء حفظ بيانات المركبة. تحقق من البيانات المدخلة وحاول مرة أخرى.' : 'Something went wrong saving the vehicle. Check the entered data and try again.'),
          'error'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { id: Tab; labelEn: string; labelAr: string }[] = [
    { id: 'basic', labelEn: '1. Basic Information', labelAr: '١. البيانات الأساسية والماركة' },
    { id: 'classification', labelEn: '2. Classification & Segment', labelAr: '٢. فئة وتصنيف الأسطول' },
    { id: 'technical', labelEn: '3. Technical Specs', labelAr: '٣. المواصفات الفنية والمحرك' },
    { id: 'pricing', labelEn: '4. Rental Rates & Deposit', labelAr: '٤. أسعار الإيجار والتأمين' }
  ];


  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? 'إضافة مركبة جديدة للأسطول (اقتصادي، عائلي، فاخر، وسوبركار)' : 'Add Vehicle to Fleet (Economic, Family, Business & Luxury)'}
      subtitle={isAr ? 'كتالوج مركزي شامل يدعم هيونداي، كيا، جيتور، تويوتا، نيسان، إم جي، وكافة الفئات الفاخرة' : 'Centralized fleet catalog supporting Hyundai, Kia, Jetour, Toyota, Nissan, MG, Geely & Luxury Supercars'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-zinc-100">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-blue-900/40 pb-2 overflow-x-auto">
          {tabs.map(tb => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                tab === tb.id
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
                  : 'bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border border-zinc-800'
              }`}
            >
              {isAr ? tb.labelAr : tb.labelEn}
            </button>
          ))}
        </div>

        {/* TAB 1: BASIC INFO */}
        {tab === 'basic' && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-blue-200 mb-1.5">
                  {isAr ? 'الشركة المصنعة (الكتالوج الشامل المركزي)' : 'Manufacturer (Master Catalog)'} *
                </label>
                <select
                  value={selectedManufacturerId}
                  onChange={(e) => handleManufacturerSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/90 border border-blue-900/50 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  <option value="">{isAr ? '— اختر شركة من القائمة أو اكتب يدوياً —' : '— Select from master list or enter below —'}</option>
                  {manufacturers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}{m.nameAr ? ` / ${m.nameAr}` : ''}</option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={form.make}
                  onChange={e => setForm({ ...form, make: e.target.value })}
                  className="mt-2 w-full px-3.5 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none"
                  placeholder={isAr ? 'اسم الشركة المصنعة (مثال: Hyundai, Kia, Jetour)' : 'Manufacturer name'}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-blue-200 mb-1.5">
                  {isAr ? 'الموديل (مربوط تلقائياً بالشركة المختارة)' : 'Model (linked to selected manufacturer)'} *
                </label>
                <select
                  disabled={!selectedManufacturerId}
                  value={form.catalogModelId || ''}
                  onChange={(e) => {
                    const model = catalogModels.find(m => m.id === e.target.value);
                    if (model) applyCatalogModel(model);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/90 border border-blue-900/50 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer disabled:opacity-40"
                >
                  <option value="">{isAr ? '— اختر الموديل المقترح من الكتالوج —' : '— Select model from catalog —'}</option>
                  {catalogModels.map(m => (
                    <option key={m.id} value={m.id}>{m.model}{m.trim ? ` (${m.trim})` : ''}</option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={form.model}
                  onChange={e => setForm({ ...form, model: e.target.value, catalogModelId: undefined })}
                  className="mt-2 w-full px-3.5 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none"
                  placeholder={isAr ? 'اسم الموديل (مثال: Elantra, T2 Traveller, Pegas)' : 'Model name'}
                />
                {selectedManufacturerId && (
                  <button
                    type="button"
                    onClick={() => setRequestModelOpen(v => !v)}
                    className="mt-2 text-[11px] text-blue-300 hover:text-blue-200 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-blue-400" />
                    {isAr ? 'الموديل غير موجود؟ طلب إضافة موديل جديد للكتالوج المركزي' : 'Model missing? Request to add new model to master catalog'}
                  </button>
                )}
                {requestModelOpen && (
                  <div className="mt-2 p-3 rounded-xl bg-[#071328] border border-blue-900/60 space-y-2">
                    {requestSubmitted ? (
                      <p className="text-[11px] text-emerald-400 font-semibold">
                        {isAr ? '✓ تم إرسال طلب إضافة الموديل للاعتماد المركزي بنجاح.' : '✓ Request submitted for catalog approval.'}
                      </p>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={requestModelName}
                          onChange={(e) => setRequestModelName(e.target.value)}
                          placeholder={isAr ? 'اسم الموديل الجديد المقترح' : 'Proposed new model name'}
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-blue-900/40 text-white text-[11px]"
                        />
                        <button
                          type="button"
                          disabled={requestSubmitting || !requestModelName.trim()}
                          onClick={submitModelRequest}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold disabled:opacity-40"
                        >
                          {requestSubmitting ? (isAr ? 'جارٍ الإرسال...' : 'Submitting...') : (isAr ? 'إرسال للمراجعة والاعتماد' : 'Submit for Review')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{isAr ? 'سنة الصنع' : 'Model Year'}</label>
                <input 
                  type="number" 
                  value={form.year} 
                  onChange={e => setForm({ ...form, year: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{isAr ? 'الفئة والتجهيز (Trim)' : 'Trim / Specification'}</label>
                <input 
                  type="text" 
                  value={form.trim} 
                  onChange={e => setForm({ ...form, trim: e.target.value })}
                  placeholder={isAr ? 'مثال: سمارت بلس / جي تي لاين / فل كامل' : 'Smart Plus / GT-Line / Deluxe'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  {isAr ? 'بلد الصنع والمنشأ' : 'Country of Origin'}
                </label>
                <div className="space-y-1.5">
                  <select
                    value={COUNTRY_OF_ORIGIN_PRESETS.some(c => c.nameAr === form.countryOfOrigin || c.nameEn === form.countryOfOrigin || `${c.flag} ${isAr ? c.nameAr : c.nameEn}` === form.countryOfOrigin) ? form.countryOfOrigin : ''}
                    onChange={e => {
                      if (e.target.value) {
                        setForm({ ...form, countryOfOrigin: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">{isAr ? '— اختر بلد الصنع والمنشأ الجاهز —' : '— Select Predefined Country —'}</option>
                    {COUNTRY_OF_ORIGIN_PRESETS.map(c => (
                      <option key={c.id} value={`${c.flag} ${isAr ? c.nameAr : c.nameEn}`}>
                        {c.flag} {isAr ? c.nameAr : c.nameEn} ({c.majorMakes})
                      </option>
                    ))}
                  </select>
                  <input 
                    type="text" 
                    value={form.countryOfOrigin} 
                    onChange={e => setForm({ ...form, countryOfOrigin: e.target.value })}
                    placeholder={isAr ? 'كوريا الجنوبية / الصين / اليابان / ألمانيا' : 'South Korea / China / Japan / Germany'}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-blue-200 mb-1.5">
                  {isAr ? 'فئة الأسطول (شاملة الاقتصادي والفاره)' : 'Fleet Category (Full Scope)'} *
                </label>
                <select 
                  value={form.category} 
                  onChange={e => setForm({ ...form, category: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-blue-900/60 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  <optgroup label={isAr ? 'الفئات الاقتصادية واليومية' : 'Economic & Daily Fleet'}>
                    <option value="economy_sedan">{isAr ? 'سيدان اقتصادية (إلنترا، أكسنت، بيجاس، صني، ياريس)' : 'Economy Sedan (Elantra, Accent, Pegas, Sunny)'}</option>
                    <option value="economy_hatchback">{isAr ? 'هاتشباك مدمجة واقتصادية (بيكانتو، i10، سويفت)' : 'Economy Hatchback (Picanto, i10, Swift)'}</option>
                    <option value="compact_suv">{isAr ? 'كروس أوفر وSUV مدمجة (كريتا، سيلتوس، كول راي، كيكس)' : 'Compact SUV & Crossover (Creta, Seltos, Coolray)'}</option>
                    <option value="midsize_suv">{isAr ? 'SUV متوسطة وعائلية (جيتور T2، توسان، سبورتاج، X70)' : 'Midsize & Family SUV (Jetour T2, Tucson, Sportage)'}</option>
                    <option value="business_sedan">{isAr ? 'سيدان أعمال ومتوسطة (سوناتا، K5، كامري، ألتيما)' : 'Business & Midsize Sedan (Sonata, K5, Camry)'}</option>
                    <option value="family_van">{isAr ? 'فان وعائلية سياحية (ستاريا، كارنيفال)' : 'Family Van & MPV (Staria, Carnival)'}</option>
                  </optgroup>
                  <optgroup label={isAr ? 'فئات الفخامة والسوبركارز' : 'Luxury & Supercar Fleet'}>
                    <option value="supercar">{isAr ? 'سوبركار رياضية خارقة (فيراري، لامبورغيني، بورشه)' : 'Supercar (Ferrari, Lamborghini, Porsche)'}</option>
                    <option value="ultra_luxury_sedan">{isAr ? 'سيدان فاخرة جداً VIP (رولز رويس، مايباخ، بنتلي)' : 'Ultra-Luxury Sedan (Rolls-Royce, Maybach, Bentley)'}</option>
                    <option value="executive_suv">{isAr ? 'دفع رباعي تنفيذي فاخر (إسكاليد، رينج روفر، باترول نيسمو)' : 'Luxury Executive SUV (Range Rover, Escalade, Patrol Nismo)'}</option>
                    <option value="grand_tourer">{isAr ? 'جراند تورير (بنتلي GT، أستون مارتن)' : 'Grand Tourer (Bentley GT, Aston Martin)'}</option>
                    <option value="exotic_convertible">{isAr ? 'كشف رياضية فاخرة' : 'Exotic Convertible'}</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{isAr ? 'رقم اللوحة والإمارة' : 'Plate Number & City'} *</label>
                <input 
                  type="text" 
                  required 
                  value={form.plateNumber} 
                  onChange={e => setForm({ ...form, plateNumber: e.target.value })}
                  placeholder="Dubai A 1234"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{isAr ? 'رقم الهيكل (VIN)' : 'VIN (Chassis Number)'}</label>
                <input 
                  type="text" 
                  value={form.vin} 
                  onChange={e => setForm({ ...form, vin: e.target.value })}
                  placeholder="KMHD..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none font-mono" 
                />
              </div>
            </div>

            {/* Colors Section with Ready-Made Presets */}
            <div className="space-y-4 p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/90">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Exterior Color */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-200">
                      {isAr ? 'اللون الخارجي' : 'Exterior Color'}
                    </label>
                    <span className="text-[11px] text-blue-400">
                      {isAr ? 'اختيارات جاهزة للألوان الخارجية' : 'Exterior Presets'}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <select
                      value={EXTERIOR_COLOR_PRESETS.some(c => (isAr ? c.nameAr : c.nameEn) === form.exteriorColor) ? form.exteriorColor : ''}
                      onChange={e => {
                        if (e.target.value) {
                          setForm({ ...form, exteriorColor: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">{isAr ? '— اختر لوناً خارجياً جاهزاً —' : '— Select Exterior Color Preset —'}</option>
                      {EXTERIOR_COLOR_PRESETS.map(c => (
                        <option key={c.id} value={isAr ? c.nameAr : c.nameEn}>
                          {isAr ? c.nameAr : c.nameEn}
                        </option>
                      ))}
                    </select>

                    <input 
                      type="text" 
                      value={form.exteriorColor} 
                      onChange={e => setForm({ ...form, exteriorColor: e.target.value })}
                      placeholder={isAr ? 'أو اكتب اللون المخصص هنا...' : 'Or enter custom color...'}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                    />

                    {/* Quick Color Swatches */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {EXTERIOR_COLOR_PRESETS.slice(0, 10).map(c => {
                        const label = isAr ? c.nameAr : c.nameEn;
                        const isSelected = form.exteriorColor === label || form.exteriorColor === c.nameAr || form.exteriorColor === c.nameEn;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setForm({ ...form, exteriorColor: label })}
                            className={`px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1.5 transition-all ${
                              isSelected 
                                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400' 
                                : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                            }`}
                            title={label}
                          >
                            <span 
                              className="w-3 h-3 rounded-full border border-white/20 shadow-xs shrink-0" 
                              style={{ backgroundColor: c.hex }} 
                            />
                            <span className="truncate max-w-[110px]">{label.split('/')[0]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Interior Color */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-200">
                      {isAr ? 'اللون الداخلي وتفاصيل المقصورة' : 'Interior Color & Trim'}
                    </label>
                    <span className="text-[11px] text-amber-400">
                      {isAr ? 'خيارات الجلود والمقصورة' : 'Interior Leather Presets'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <select
                      value={INTERIOR_COLOR_PRESETS.some(c => (isAr ? c.nameAr : c.nameEn) === form.interiorColor) ? form.interiorColor : ''}
                      onChange={e => {
                        if (e.target.value) {
                          setForm({ ...form, interiorColor: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">{isAr ? '— اختر لوناً داخلياً جاهزاً —' : '— Select Interior Color Preset —'}</option>
                      {INTERIOR_COLOR_PRESETS.map(c => (
                        <option key={c.id} value={isAr ? c.nameAr : c.nameEn}>
                          {isAr ? c.nameAr : c.nameEn}
                        </option>
                      ))}
                    </select>

                    <input 
                      type="text" 
                      value={form.interiorColor} 
                      onChange={e => setForm({ ...form, interiorColor: e.target.value })}
                      placeholder={isAr ? 'أو اكتب اللون الداخلي المخصص هنا...' : 'Or enter custom interior trim...'}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                    />

                    {/* Quick Interior Swatches */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {INTERIOR_COLOR_PRESETS.slice(0, 8).map(c => {
                        const label = isAr ? c.nameAr : c.nameEn;
                        const isSelected = form.interiorColor === label || form.interiorColor === c.nameAr || form.interiorColor === c.nameEn;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setForm({ ...form, interiorColor: label })}
                            className={`px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1.5 transition-all ${
                              isSelected 
                                ? 'bg-amber-600/30 text-amber-200 border border-amber-500/60 shadow-sm' 
                                : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                            }`}
                            title={label}
                          >
                            <span 
                              className="w-3 h-3 rounded-full border border-white/20 shadow-xs shrink-0" 
                              style={{ backgroundColor: c.hex }} 
                            />
                            <span className="truncate max-w-[120px]">{label.split('/')[0]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle photo -- uploaded from the staff member's own device, never a pasted link */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{isAr ? 'صورة المركبة' : 'Vehicle Photo'}</label>
              <div className="flex gap-3 items-center">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                <button
                  type="button"
                  disabled={uploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-950 border border-dashed border-zinc-700 hover:border-blue-500/60 text-xs font-semibold text-zinc-200 disabled:opacity-50 transition-all"
                >
                  <UploadCloud className="w-4 h-4 text-blue-400" />
                  {uploadingImage ? (isAr ? 'جاري الرفع...' : 'Uploading...') : (isAr ? 'رفع صورة من الجهاز' : 'Upload from Device')}
                </button>
                {form.thumbnail && (
                  <img src={form.thumbnail} alt="Preview" className="w-14 h-10 rounded-xl object-cover border border-blue-800/60 shadow" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CLASSIFICATION */}
        {tab === 'classification' && (
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-blue-900/40 space-y-4 animate-fade-in">
            <h4 className="text-xs font-bold text-blue-300 flex items-center gap-2 uppercase tracking-wide">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>{isAr ? 'التصنيف المتقدم وتجزئة الأسطول' : 'Advanced Fleet Classification'}</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نوع الهيكل (Body Style)' : 'Body Style'}</label>
                <select 
                  value={form.bodyStyle || ''} 
                  onChange={e => setForm({ ...form, bodyStyle: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs cursor-pointer"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_BODY_STYLES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'مستوى الفئة (Class Tier)' : 'Class Tier'}</label>
                <select 
                  value={form.vehicleClassTier || ''} 
                  onChange={e => setForm({ ...form, vehicleClassTier: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs cursor-pointer"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_CLASS_TIERS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>

              {isSuvBodyStyle(form.bodyStyle) && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'تصنيف الدفع الرباعي (SUV Class)' : 'SUV Classification'}</label>
                  <select 
                    value={form.suvClass || ''} 
                    onChange={e => setForm({ ...form, suvClass: (e.target.value || undefined) as any })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs cursor-pointer"
                  >
                    <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                    {VEHICLE_SUV_CLASSES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'تصنيف الأداء (Performance)' : 'Performance Classification'}</label>
                <select 
                  value={form.performanceClass || ''} 
                  onChange={e => setForm({ ...form, performanceClass: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs cursor-pointer"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_PERFORMANCE_CLASSES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'شريحة التأجير (Rental Segment)' : 'Rental Segment'}</label>
                <select 
                  value={form.rentalSegment || ''} 
                  onChange={e => setForm({ ...form, rentalSegment: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs cursor-pointer"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_RENTAL_SEGMENTS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-blue-200 mb-2">{isAr ? 'أنواع وحالات الاستخدام المستهدفة (متعدد الاختيارات):' : 'Target Usage Types (Multi-Select):'}</label>
                <div className="flex flex-wrap gap-2">
                  {VEHICLE_USAGE_TYPES.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleUsageType(o.value)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        form.usageTypes.includes(o.value)
                          ? 'bg-blue-600 text-white border-blue-400 shadow-sm shadow-blue-600/30'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      {isAr ? o.labelAr : o.labelEn}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TECHNICAL SPECS */}
        {tab === 'technical' && (
          <div className="space-y-4 animate-fade-in">
            {form.catalogModelId && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-blue-950/60 border border-blue-800/60 text-xs text-blue-300">
                <Wand2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>
                  {isAr
                    ? 'تم سحب المواصفات المرجعية للموديل تلقائياً — يمكنك تعديل أي خانة بحرية لتوافق المركبة الفعلية.'
                    : 'Reference model specifications loaded — you can freely adjust any parameter to match the real vehicle.'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'المحرك والسعة' : 'Engine Spec'}</label>
                <input 
                  type="text" 
                  value={form.engine} 
                  onChange={e => setForm({ ...form, engine: e.target.value })}
                  placeholder="2.0L MPI / 1.6L Turbo / V6"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'القدرة الحصانية (HP)' : 'Horsepower (HP)'}</label>
                <input 
                  type="number" 
                  value={form.horsepower} 
                  onChange={e => setForm({ ...form, horsepower: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'ناقل الحركة (Transmission)' : 'Transmission'}</label>
                <input 
                  type="text" 
                  value={form.transmission} 
                  onChange={e => setForm({ ...form, transmission: e.target.value })}
                  placeholder="Automatic / CVT / 7-Speed DCT"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نظام الدفع (Drivetrain)' : 'Drivetrain'}</label>
                <select 
                  value={form.drivetrain || ''} 
                  onChange={e => setForm({ ...form, drivetrain: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs cursor-pointer focus:border-blue-500 focus:outline-none"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_DRIVETRAINS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نوع الوقود / الدفع' : 'Fuel / Powertrain'}</label>
                <select 
                  value={form.fuelType} 
                  onChange={e => setForm({ ...form, fuelType: e.target.value as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs cursor-pointer focus:border-blue-500 focus:outline-none"
                >
                  {VEHICLE_FUEL_TYPES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نوع السقف' : 'Roof Type'}</label>
                <select 
                  value={form.roofType || ''} 
                  onChange={e => setForm({ ...form, roofType: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs cursor-pointer focus:border-blue-500 focus:outline-none"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_ROOF_TYPES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'عدد الأبواب' : 'Doors'}</label>
                <input 
                  type="number" 
                  value={form.doors ?? ''} 
                  onChange={e => setForm({ ...form, doors: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'عدد المقاعد والركاب' : 'Seats / Capacity'}</label>
                <input 
                  type="number" 
                  value={form.seats ?? ''} 
                  onChange={e => setForm({ ...form, seats: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'قراءة العداد الحالية (كم)' : 'Current Odometer (KM)'}</label>
                <input 
                  type="number" 
                  value={form.mileage} 
                  onChange={e => setForm({ ...form, mileage: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs font-mono" 
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PRICING */}
        {tab === 'pricing' && (
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#071328] to-[#0B1E3B] border border-blue-900/60 space-y-4 animate-fade-in">
            <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-400" />
              {isAr ? 'تعرفة الإيجار اليومي، الأسبوعي، الشهري، ومبلغ التأمين (AED):' : 'Rental Rates & Security Deposits (AED):'}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-xl bg-zinc-950/80 border border-blue-900/40">
                <label className="block text-[11px] text-blue-200 font-semibold mb-1">{isAr ? 'السعر اليومي (AED/يوم)' : 'Daily Rate (AED/day)'}</label>
                <input 
                  type="number" 
                  value={form.dailyRate} 
                  onChange={e => setForm({ ...form, dailyRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-[#071328] border border-blue-700/60 text-white font-bold text-sm font-mono focus:border-blue-400 focus:outline-none" 
                />
              </div>
              <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <label className="block text-[11px] text-zinc-300 font-medium mb-1">{isAr ? 'السعر الأسبوعي (AED)' : 'Weekly Rate (AED)'}</label>
                <input 
                  type="number" 
                  value={form.weeklyRate} 
                  onChange={e => setForm({ ...form, weeklyRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-bold text-sm font-mono focus:border-blue-400 focus:outline-none" 
                />
              </div>
              <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <label className="block text-[11px] text-zinc-300 font-medium mb-1">{isAr ? 'السعر الشهري (AED)' : 'Monthly Rate (AED)'}</label>
                <input 
                  type="number" 
                  value={form.monthlyRate} 
                  onChange={e => setForm({ ...form, monthlyRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-bold text-sm font-mono focus:border-blue-400 focus:outline-none" 
                />
              </div>
              <div className="p-3 rounded-xl bg-zinc-950/80 border border-amber-500/30">
                <label className="block text-[11px] text-amber-300 font-semibold mb-1">{isAr ? 'مبلغ التأمين المحتجز (AED)' : 'Security Deposit (AED)'}</label>
                <input 
                  type="number" 
                  value={form.minDeposit} 
                  onChange={e => setForm({ ...form, minDeposit: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-[#071328] border border-amber-500/50 text-amber-300 font-bold text-sm font-mono focus:border-amber-400 focus:outline-none" 
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal Action Buttons - Royal Sapphire Luxury */}
        <div className="flex items-center justify-between pt-4 border-t border-blue-900/40">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-5 py-2.5 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold transition-all cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs lg:text-sm shadow-xl shadow-blue-600/30 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Car className="w-4 h-4" />
            <span>
              {submitting 
                ? (isAr ? 'جاري الحفظ في الأسطول...' : 'Registering to Fleet...') 
                : (isAr ? `إضافة المركبة (${form.make} ${form.model}) للأسطول` : `Register ${form.make} ${form.model}`)}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
