import React, { useEffect, useState } from 'react';
import { Car, Sparkles, DollarSign, Wand2, PlusCircle } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { apiFetch } from '../../lib/apiFetch';
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
import { Modal } from '../common/Modal';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_SUPER_CARS = [
  {
    make: 'Ferrari',
    model: 'Purosangue V12',
    year: 2025,
    category: 'supercar' as VehicleCategory,
    color: 'Rosso Corsa',
    plateCity: 'Dubai',
    dailyRate: 9500,
    weeklyRate: 58000,
    monthlyRate: 190000,
    securityDeposit: 20000,
    mileage: 1200,
    horsepower: 715,
    acceleration: 3.3,
    thumbnail: 'https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800&auto=format&fit=crop&q=80'
  },
  {
    make: 'Rolls-Royce',
    model: 'Spectre Ultra-Electric',
    year: 2025,
    category: 'ultra_luxury_sedan' as VehicleCategory,
    color: 'Two-Tone Obsidian Black & Arctic Silver',
    plateCity: 'Dubai',
    dailyRate: 8500,
    weeklyRate: 52000,
    monthlyRate: 180000,
    securityDeposit: 25000,
    mileage: 850,
    horsepower: 577,
    acceleration: 4.5,
    thumbnail: 'https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=800&auto=format&fit=crop&q=80'
  },
  {
    make: 'Lamborghini',
    model: 'Revuelto V12 Hybrid',
    year: 2025,
    category: 'supercar' as VehicleCategory,
    color: 'Arancio Apodis (Orange Pearl)',
    plateCity: 'Dubai',
    dailyRate: 11000,
    weeklyRate: 68000,
    monthlyRate: 230000,
    securityDeposit: 25000,
    mileage: 950,
    horsepower: 1001,
    acceleration: 2.5,
    thumbnail: 'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=800&auto=format&fit=crop&q=80'
  },
  {
    make: 'Mercedes-Maybach',
    model: 'GLS 600 Night Series',
    year: 2025,
    category: 'executive_suv' as VehicleCategory,
    color: 'Kalahari Gold / Onyx Black',
    plateCity: 'Dubai',
    dailyRate: 6000,
    weeklyRate: 36000,
    monthlyRate: 120000,
    securityDeposit: 15000,
    mileage: 2100,
    horsepower: 550,
    acceleration: 4.8,
    thumbnail: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=80'
  },
  {
    make: 'Porsche',
    model: '911 GT3 RS (992)',
    year: 2025,
    category: 'supercar' as VehicleCategory,
    color: 'Shark Blue',
    plateCity: 'Dubai',
    dailyRate: 7500,
    weeklyRate: 46000,
    monthlyRate: 150000,
    securityDeposit: 18000,
    mileage: 1800,
    horsepower: 518,
    acceleration: 3.2,
    thumbnail: 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&auto=format&fit=crop&q=80'
  }
];

type Tab = 'basic' | 'classification' | 'technical' | 'pricing';

const emptyForm = () => ({
  make: 'Ferrari',
  model: 'Purosangue V12',
  year: 2025,
  trim: '',
  category: 'supercar' as VehicleCategory,
  exteriorColor: 'Rosso Corsa',
  interiorColor: '',
  countryOfOrigin: '',
  plateNumber: `DXB ${String.fromCharCode(65 + Math.floor(Math.random() * 26))} ${Math.floor(100 + Math.random() * 900)}`,
  plateCity: 'Dubai',
  vin: `ZFF${Math.floor(10000000000000 + Math.random() * 90000000000000)}`,
  dailyRate: 9500,
  weeklyRate: 58000,
  monthlyRate: 190000,
  minDeposit: 20000,
  mileage: 1200,
  fuelType: 'petrol' as VehicleCatalogModel['fuelType'],
  transmission: 'automatic',
  engine: '',
  horsepower: 715,
  doors: undefined as number | undefined,
  seats: undefined as number | undefined,
  roofType: undefined as VehicleRoofType | undefined,
  drivetrain: undefined as VehicleDrivetrain | undefined,
  bodyStyle: undefined as VehicleBodyStyle | undefined,
  vehicleClassTier: undefined as VehicleClassTier | undefined,
  suvClass: undefined as VehicleSuvClass | undefined,
  performanceClass: undefined as VehiclePerformanceClass | undefined,
  rentalSegment: undefined as VehicleRentalSegment | undefined,
  usageTypes: [] as VehicleUsageType[],
  catalogModelId: undefined as string | undefined,
  status: 'available' as VehicleStatus,
  thumbnail: 'https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800&auto=format&fit=crop&q=80',
  images: ['https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800&auto=format&fit=crop&q=80']
});

export const AddVehicleModal: React.FC<AddVehicleModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { addVehicle, firebaseSyncState } = useCRM();
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<Tab>('basic');

  const [form, setForm] = useState(emptyForm());

  // Master Manufacturer Catalog -- cascading Manufacturer -> Model, strictly
  // scoped to the selected manufacturer so a model list can never leak
  // across manufacturers (Vehicle Master Profile mission, section 6).
  const [manufacturers, setManufacturers] = useState<VehicleManufacturer[]>([]);
  const [selectedManufacturerId, setSelectedManufacturerId] = useState<string>('');
  const [catalogModels, setCatalogModels] = useState<VehicleCatalogModel[]>([]);

  const [requestModelOpen, setRequestModelOpen] = useState(false);
  const [requestModelName, setRequestModelName] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    apiFetch('/api/vehicle-catalog/manufacturers')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setManufacturers(Array.isArray(data) ? data : []))
      .catch(() => setManufacturers([]));
  }, [isOpen]);

  useEffect(() => {
    if (!selectedManufacturerId) { setCatalogModels([]); return; }
    apiFetch(`/api/vehicle-catalog/models?manufacturerId=${encodeURIComponent(selectedManufacturerId)}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setCatalogModels(Array.isArray(data) ? data : []))
      .catch(() => setCatalogModels([]));
  }, [selectedManufacturerId]);

  const applyPreset = (preset: typeof PRESET_SUPER_CARS[0]) => {
    setForm(prev => ({
      ...prev,
      make: preset.make,
      model: preset.model,
      year: preset.year,
      category: preset.category,
      exteriorColor: preset.color,
      dailyRate: preset.dailyRate,
      weeklyRate: preset.weeklyRate,
      monthlyRate: preset.monthlyRate,
      minDeposit: preset.securityDeposit,
      mileage: preset.mileage,
      horsepower: preset.horsepower,
      thumbnail: preset.thumbnail,
      images: [preset.thumbnail]
    }));
    setSelectedManufacturerId('');
  };

  const handleManufacturerSelect = (id: string) => {
    setSelectedManufacturerId(id);
    const manufacturer = manufacturers.find((m) => m.id === id);
    if (manufacturer) {
      setForm(prev => ({ ...prev, make: manufacturer.name, countryOfOrigin: manufacturer.countryOfOrigin || prev.countryOfOrigin, catalogModelId: undefined }));
    }
  };

  // Reference specs from the Master Catalog are only ever offered as a
  // suggestion the staff member must explicitly apply and can freely
  // overwrite -- never silently auto-filled and never treated as confirmed
  // for publish purposes (mission section 8/18).
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
      onClose();
      setForm(emptyForm());
      setSelectedManufacturerId('');
      setTab('basic');
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { id: Tab; labelEn: string; labelAr: string }[] = [
    { id: 'basic', labelEn: 'Basic Info', labelAr: 'المعلومات الأساسية' },
    { id: 'classification', labelEn: 'Classification', labelAr: 'التصنيف' },
    { id: 'technical', labelEn: 'Technical Specs', labelAr: 'المواصفات الفنية' },
    { id: 'pricing', labelEn: 'Rental & Pricing', labelAr: 'الإيجار والتسعير' }
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? 'إضافة مركبة فاخرة للأسطول' : 'Register Vehicle to Luxury Fleet'}
      subtitle={isAr ? 'ملف المركبة الرئيسي — يعتمد على الكتالوج المركزي للشركات المصنعة والموديلات' : 'Vehicle Master Profile — powered by the centralized Manufacturer/Model catalog'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Quick VIP Presets */}
        <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#f5d97f] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              {isAr ? 'نماذج جاهزة للسوبركارز الفارهة:' : 'Quick Supercar Presets:'}
            </span>
            <span className="text-[10px] text-zinc-400">
              {isAr ? 'انقر للتحميل التلقائي' : 'Click to prefill specs'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_SUPER_CARS.map(p => (
              <button
                key={p.model}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-[#D4AF37]/15 border border-zinc-800 hover:border-[#D4AF37]/50 text-[11px] text-zinc-300 hover:text-[#f5d97f] transition-all flex items-center gap-1.5"
              >
                <Car className="w-3 h-3 text-[#D4AF37]" />
                <span>{p.make} {p.model}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-xs text-[#f5d97f]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold">{isAr ? 'اتصال سبلندر نشط:' : 'Live Splendor Cloud:'}</span>
            <span className="text-zinc-300 font-mono text-[11px]">{firebaseSyncState.projectId}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-2 overflow-x-auto">
          {tabs.map(tb => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                tab === tb.id ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900 border border-transparent'
              }`}
            >
              {isAr ? tb.labelAr : tb.labelEn}
            </button>
          ))}
        </div>

        {tab === 'basic' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  {isAr ? 'الشركة المصنعة (كتالوج مركزي)' : 'Manufacturer (Master Catalog)'} *
                </label>
                <select
                  value={selectedManufacturerId}
                  onChange={(e) => handleManufacturerSelect(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
                >
                  <option value="">{isAr ? '— اختر أو اكتب يدوياً أدناه —' : '— Select, or type manually below —'}</option>
                  {manufacturers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}{m.nameAr ? ` / ${m.nameAr}` : ''}</option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={form.make}
                  onChange={e => setForm({ ...form, make: e.target.value })}
                  className="mt-1.5 w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
                  placeholder={isAr ? 'اسم الشركة المصنعة' : 'Manufacturer name'}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  {isAr ? 'الموديل (يعتمد على الشركة المختارة)' : 'Model (filtered to selected manufacturer)'} *
                </label>
                <select
                  disabled={!selectedManufacturerId}
                  value={form.catalogModelId || ''}
                  onChange={(e) => {
                    const model = catalogModels.find(m => m.id === e.target.value);
                    if (model) applyCatalogModel(model);
                  }}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer disabled:opacity-40"
                >
                  <option value="">{isAr ? '— اختر أو اكتب يدوياً أدناه —' : '— Select, or type manually below —'}</option>
                  {catalogModels.map(m => (
                    <option key={m.id} value={m.id}>{m.model}{m.trim ? ` (${m.trim})` : ''}</option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={form.model}
                  onChange={e => setForm({ ...form, model: e.target.value, catalogModelId: undefined })}
                  className="mt-1.5 w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
                  placeholder={isAr ? 'اسم الموديل' : 'Model name'}
                />
                {selectedManufacturerId && (
                  <button
                    type="button"
                    onClick={() => setRequestModelOpen(v => !v)}
                    className="mt-1.5 text-[11px] text-[#f5d97f] hover:underline flex items-center gap-1"
                  >
                    <PlusCircle className="w-3 h-3" />
                    {isAr ? 'الموديل غير موجود؟ طلب إضافة موديل جديد' : 'Model not found? Request to add new model'}
                  </button>
                )}
                {requestModelOpen && (
                  <div className="mt-2 p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                    {requestSubmitted ? (
                      <p className="text-[11px] text-emerald-400">
                        {isAr ? 'تم إرسال الطلب للمراجعة والاعتماد.' : 'Request submitted for review and approval.'}
                      </p>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={requestModelName}
                          onChange={(e) => setRequestModelName(e.target.value)}
                          placeholder={isAr ? 'اسم الموديل الجديد المقترح' : 'Proposed new model name'}
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-[11px]"
                        />
                        <button
                          type="button"
                          disabled={requestSubmitting || !requestModelName.trim()}
                          onClick={submitModelRequest}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px] font-semibold disabled:opacity-40"
                        >
                          {requestSubmitting ? (isAr ? 'جارٍ الإرسال...' : 'Submitting...') : (isAr ? 'إرسال للمراجعة' : 'Submit for Review')}
                        </button>
                        <p className="text-[10px] text-zinc-500">
                          {isAr ? 'لن يُضاف الموديل للكتالوج إلا بعد اعتماد شخص مخوّل.' : 'Never added to the catalog until an authorized person approves it.'}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'سنة الصنع' : 'Model Year'}</label>
                <input type="number" value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'الفئة/التجهيز (Trim)' : 'Category/Trim'}</label>
                <input type="text" value={form.trim} onChange={e => setForm({ ...form, trim: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'بلد الصنع' : 'Country of Origin'}</label>
                <input type="text" value={form.countryOfOrigin} onChange={e => setForm({ ...form, countryOfOrigin: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'فئة المركبة' : 'Fleet Category'} *</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer">
                  <option value="supercar">Supercar (سوبركار)</option>
                  <option value="ultra_luxury_sedan">Ultra-Luxury Sedan (سيدان فاخرة)</option>
                  <option value="executive_suv">Luxury Executive SUV (دفع رباعي VIP)</option>
                  <option value="exotic_convertible">Exotic Convertible (كشف رياضية)</option>
                  <option value="grand_tourer">Grand Tourer (جراند تورير)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'رقم اللوحة والإمارة' : 'Plate Number & City'} *</label>
                <input type="text" required value={form.plateNumber} onChange={e => setForm({ ...form, plateNumber: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'رقم الهيكل (VIN)' : 'VIN'}</label>
                <input type="text" value={form.vin} onChange={e => setForm({ ...form, vin: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'اللون الخارجي' : 'Exterior Color & Finish'}</label>
                <input type="text" value={form.exteriorColor} onChange={e => setForm({ ...form, exteriorColor: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'اللون الداخلي' : 'Interior Color'}</label>
                <input type="text" value={form.interiorColor} onChange={e => setForm({ ...form, interiorColor: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none" />
              </div>
            </div>

            {/* Thumbnail URL */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'رابط صورة المركبة الفاخرة' : 'Vehicle Image URL'}</label>
              <div className="flex gap-3 items-center">
                <input
                  type="url"
                  value={form.thumbnail}
                  onChange={e => setForm({ ...form, thumbnail: e.target.value, images: [e.target.value] })}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
                  placeholder="https://..."
                />
                {form.thumbnail && <img src={form.thumbnail} alt="Preview" className="w-12 h-9 rounded-lg object-cover border border-zinc-700" />}
              </div>
            </div>
          </div>
        )}

        {tab === 'classification' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نوع الهيكل' : 'Body Style'}</label>
              <select value={form.bodyStyle || ''} onChange={e => setForm({ ...form, bodyStyle: (e.target.value || undefined) as any })}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs cursor-pointer">
                <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                {VEHICLE_BODY_STYLES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'مستوى الفئة' : 'Vehicle Class Tier'}</label>
              <select value={form.vehicleClassTier || ''} onChange={e => setForm({ ...form, vehicleClassTier: (e.target.value || undefined) as any })}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs cursor-pointer">
                <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                {VEHICLE_CLASS_TIERS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
              </select>
            </div>
            {isSuvBodyStyle(form.bodyStyle) && (
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'تصنيف الدفع الرباعي' : 'SUV Classification'}</label>
                <select value={form.suvClass || ''} onChange={e => setForm({ ...form, suvClass: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs cursor-pointer">
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_SUV_CLASSES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'تصنيف الأداء' : 'Performance Classification'}</label>
              <select value={form.performanceClass || ''} onChange={e => setForm({ ...form, performanceClass: (e.target.value || undefined) as any })}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs cursor-pointer">
                <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                {VEHICLE_PERFORMANCE_CLASSES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'فئة التأجير' : 'Rental Segment'}</label>
              <select value={form.rentalSegment || ''} onChange={e => setForm({ ...form, rentalSegment: (e.target.value || undefined) as any })}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs cursor-pointer">
                <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                {VEHICLE_RENTAL_SEGMENTS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'أنواع الاستخدام (يمكن اختيار أكثر من واحد)' : 'Usage Types (multi-select)'}</label>
              <div className="flex flex-wrap gap-1.5">
                {VEHICLE_USAGE_TYPES.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleUsageType(o.value)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] border transition-all ${
                      form.usageTypes.includes(o.value) ? 'bg-[#D4AF37]/20 text-[#f5d97f] border-[#D4AF37]/40' : 'text-zinc-400 border-zinc-800 hover:bg-zinc-900'
                    }`}
                  >
                    {isAr ? o.labelAr : o.labelEn}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'technical' && (
          <div className="space-y-4">
            {form.catalogModelId && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-[11px] text-sky-300">
                <Wand2 className="w-3.5 h-3.5" />
                {isAr
                  ? 'تم اقتراح هذه المواصفات من الكتالوج المرجعي — يرجى مراجعتها وتأكيدها؛ لا تُعتبر مؤكدة تلقائياً.'
                  : 'These specs were suggested from the reference catalog — please review and confirm; not treated as confirmed automatically.'}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'المحرك' : 'Engine'}</label>
                <input type="text" value={form.engine} onChange={e => setForm({ ...form, engine: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'القدرة الحصانية (HP)' : 'Horsepower (HP)'}</label>
                <input type="number" value={form.horsepower} onChange={e => setForm({ ...form, horsepower: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'ناقل الحركة' : 'Transmission'}</label>
                <input type="text" value={form.transmission} onChange={e => setForm({ ...form, transmission: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نظام الدفع' : 'Drivetrain'}</label>
                <select value={form.drivetrain || ''} onChange={e => setForm({ ...form, drivetrain: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs cursor-pointer">
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_DRIVETRAINS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نوع الوقود/الدفع' : 'Fuel / Powertrain'}</label>
                <select value={form.fuelType} onChange={e => setForm({ ...form, fuelType: e.target.value as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs cursor-pointer">
                  {VEHICLE_FUEL_TYPES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نوع السقف' : 'Roof Type'}</label>
                <select value={form.roofType || ''} onChange={e => setForm({ ...form, roofType: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs cursor-pointer">
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_ROOF_TYPES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'عدد الأبواب' : 'Doors'}</label>
                <input type="number" value={form.doors ?? ''} onChange={e => setForm({ ...form, doors: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'عدد المقاعد' : 'Seats'}</label>
                <input type="number" value={form.seats ?? ''} onChange={e => setForm({ ...form, seats: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'العداد الحالي (كم)' : 'Current Odometer (KM)'}</label>
                <input type="number" value={form.mileage} onChange={e => setForm({ ...form, mileage: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs" />
              </div>
            </div>
          </div>
        )}

        {tab === 'pricing' && (
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
            <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
              {isAr ? 'أسعار الإيجار اليومي ومبالغ التأمين (AED):' : 'Rental Rates & Security Deposits (AED):'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'السعر اليومي (AED)' : 'Daily Rate (AED)'}</label>
                <input type="number" value={form.dailyRate} onChange={e => setForm({ ...form, dailyRate: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[#f5d97f] font-bold text-xs font-mono" />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'السعر الأسبوعي (AED)' : 'Weekly Rate (AED)'}</label>
                <input type="number" value={form.weeklyRate} onChange={e => setForm({ ...form, weeklyRate: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-mono" />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'السعر الشهري (AED)' : 'Monthly Rate (AED)'}</label>
                <input type="number" value={form.monthlyRate} onChange={e => setForm({ ...form, monthlyRate: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-mono" />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'مبلغ التأمين المحتجز' : 'Security Deposit'}</label>
                <input type="number" value={form.minDeposit} onChange={e => setForm({ ...form, minDeposit: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-amber-500/30 text-amber-300 font-bold text-xs font-mono" />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold transition-all">
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs lg:text-sm shadow-lg shadow-[#D4AF37]/25 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
          >
            <Car className="w-4 h-4" />
            <span>{submitting ? (isAr ? 'جاري الحفظ في Firestore...' : 'Saving to Firestore...') : (isAr ? 'حفظ وإضافة للأسطول فوراً' : 'Save to Fleet Instantly')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
