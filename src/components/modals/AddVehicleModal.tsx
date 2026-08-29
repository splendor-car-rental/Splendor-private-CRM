import React, { useState, useRef } from 'react';
import {
  Car, Sparkles, Shield, AlertTriangle, CheckCircle2, DollarSign,
  Image as ImageIcon, Zap, Gauge, Lock, Unlock, Upload, FileText,
  Calendar, Check, AlertCircle, RefreshCw, Layers, MapPin, Radio
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { VehicleCategory, VehicleStatus } from '../../types';
import { Modal } from '../common/Modal';
import { uploadFile } from '../../lib/upload';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// UAE Traffic & Insurance Presets
const UAE_INSURANCE_COMPANIES = [
  'شركة دبي للتأمين (Dubai Insurance)',
  'شركة أورينت للتأمين (Orient Insurance)',
  'شركة أبوظبي الوطنية للتأمين (ADNIC)',
  'طوكيو مارين للتأمين (Tokio Marine)',
  'شركة سكون للتأمين (Sukoon / Oman Insurance)',
  'شركة الاتحاد للتأمين (Union Insurance)',
  'الشركة الوطنية للتأمين العام (NGI)',
  'الوثبة الوطنية للتأمين (Al Wathba National)',
  'أخرى (مخصص)'
];

const UAE_PLATE_CATEGORIES = [
  'دبي - الفئة A',
  'دبي - الفئة B',
  'دبي - الفئة C',
  'دبي - الفئة D',
  'دبي - الفئة H',
  'دبي - الفئة I',
  'دبي - الفئة K',
  'دبي - الفئة L',
  'دبي - الفئة M',
  'دبي - الفئة N',
  'دبي - الفئة O',
  'دبي - الفئة P',
  'دبي - الفئة Q',
  'دبي - الفئة R',
  'دبي - الفئة S',
  'دبي - الفئة T',
  'دبي - الفئة U',
  'دبي - الفئة V',
  'دبي - الفئة W',
  'دبي - الفئة X',
  'دبي - الفئة Y',
  'دبي - الفئة Z',
  'أبوظبي - الفئة 1',
  'أبوظبي - الفئة 4',
  'أبوظبي - الفئة 5',
  'أبوظبي - الفئة 6',
  'الشارقة - الفئة 1',
  'الشارقة - الفئة 2',
  'الشارقة - الفئة 3',
  'عجمان - الفئة H',
  'رأس الخيمة - الفئة C',
  'أم القيوين - الفئة X',
  'الفجيرة - الفئة M',
  'لوحة تجارية / تأجير',
  'لوحة خصوصي فاخرة'
];

const UAE_MORTGAGE_ENTITIES = [
  'لا يوجد (ملك خالص للشركة)',
  'بنك الإمارات دبي الوطني (Emirates NBD)',
  'بنك أبوظبي الأول (First Abu Dhabi Bank - FAB)',
  'بنك دبي الإسلامي (Dubai Islamic Bank - DIB)',
  'مصرف أبوظبي الإسلامي (ADIB)',
  'بنك المشرق (Mashreq Bank)',
  'بنك أبوظبي التجاري (ADCB)',
  'شركة دبي الأولى للتمويل',
  'شركة إجارة للتمويل والتأجير',
  'أخرى (مخصص)'
];

const MANUFACTURING_COUNTRIES = [
  'ألمانيا (Germany)',
  'المملكة المتحدة (United Kingdom)',
  'إيطاليا (Italy)',
  'الولايات المتحدة (USA)',
  'اليابان (Japan)',
  'فرنسا (France)',
  'السويد (Sweden)',
  'النمسا (Austria)',
  'كوريا الجنوبية (South Korea)',
  'أخرى'
];

const GPS_TRACKING_COMPANIES = [
  'فالكون آي للأنظمة الذكية (Falcon Eye Telematics)',
  'سيكيور تراك العالمية (SecureTrack GPS)',
  'كار تراك الإمارات (Cartrack UAE)',
  'جيو تراك للأسطول (Geotab Fleet Solutions)',
  'ترا ميجو لأنظمة التتبع (Tramigo GPS)',
  'تراك سوليد برو (Tracksolid Pro)',
  'أخرى (مخصص)'
];

const LUXURY_MAKES = [
  'Rolls-Royce',
  'Ferrari',
  'Lamborghini',
  'Mercedes-Maybach',
  'Porsche',
  'Bentley',
  'Aston Martin',
  'Range Rover / Land Rover',
  'McLaren',
  'BMW',
  'Audi',
  'Cadillac',
  'Maserati',
  'Bugatti'
];

const CURATED_GALLERY_IMAGES = [
  { label: 'Ferrari Purosangue (Rosso Corsa)', url: 'https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800&auto=format&fit=crop&q=80' },
  { label: 'Rolls-Royce Spectre (Obsidian Black)', url: 'https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=800&auto=format&fit=crop&q=80' },
  { label: 'Lamborghini Revuelto (Arancio Orange)', url: 'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=800&auto=format&fit=crop&q=80' },
  { label: 'Maybach GLS 600 (Two-Tone Gold/Black)', url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=80' },
  { label: 'Porsche 911 GT3 RS (Shark Blue)', url: 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&auto=format&fit=crop&q=80' },
  { label: 'Bentley Flying Spur (Beluga Black)', url: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800&auto=format&fit=crop&q=80' },
  { label: 'Mercedes-AMG G63 (Matte Magno Black)', url: 'https://images.unsplash.com/photo-1520050206274-a1ae44613e6d?w=800&auto=format&fit=crop&q=80' },
  { label: 'Range Rover SV Autobiography', url: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&auto=format&fit=crop&q=80' }
];

const DEFAULT_TRAFFIC_FILE = '51317978';

export const AddVehicleModal: React.FC<AddVehicleModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { addVehicle, firebaseSyncState } = useCRM();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeSection, setActiveSection] = useState<'specs' | 'registration' | 'insurance' | 'mechanical' | 'pricing' | 'media'>('specs');

  // Traffic File Number Safety Control
  const [trafficFileUnlocked, setTrafficFileUnlocked] = useState(false);

  // Form State with ALL fields fully editable and defaults
  const [form, setForm] = useState({
    // 1. Basic Identity
    make: 'Ferrari',
    model: 'Purosangue V12',
    year: new Date().getFullYear(),
    exteriorColor: 'Rosso Corsa (أحمر كورسا)',
    interiorColor: 'Nero Black / Crema Leather',
    seatingCapacity: 4,
    manufacturingCountry: 'إيطاليا (Italy)',
    category: 'supercar' as VehicleCategory,
    trim: 'V12 Luxury Edition',

    // 2. Plate & Registration
    plateNumber: '888',
    plateCategory: 'دبي - الفئة W',
    plateCity: 'Dubai',
    registrationDate: new Date().toISOString().split('T')[0],
    registrationExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    trafficFileNumber: DEFAULT_TRAFFIC_FILE,

    // 3. Insurance & Mortgage
    insuranceCompany: 'شركة دبي للتأمين (Dubai Insurance)',
    insuranceType: 'شامل', // Default: شامل (Comprehensive)
    insurancePolicyNumber: `POL-DXB-${Math.floor(100000 + Math.random() * 900000)}`,
    insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    mortgagee: 'لا يوجد (ملك خالص للشركة)',

    // 4. Mechanical & Telematics
    engineNumber: `ENG-V12-${Math.floor(100000 + Math.random() * 900000)}`,
    chassisNumber: `ZFF${Math.floor(10000000000000 + Math.random() * 90000000000000)}`,
    vin: `ZFF${Math.floor(10000000000000 + Math.random() * 90000000000000)}`,
    mileage: 0,
    horsepower: 715,
    engine: '6.5L Naturally Aspirated V12',
    transmission: 'automatic',
    fuelType: 'petrol' as const,
    gpsTrackingCompany: 'فالكون آي للأنظمة الذكية (Falcon Eye Telematics)',
    gpsCertificateExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],

    // 5. Rates & Mileage
    dailyRate: 9500,
    weeklyRate: 58000,
    monthlyRate: 190000,
    minDeposit: 20000,
    dailyMileageAllowance: 250,
    monthlyMileageAllowance: 4500,
    extraKmRate: 2, // Standard 2 AED / km

    // 6. Status & Location
    status: 'available' as VehicleStatus,
    currentLocation: 'المعرض الرئيسي - وسط مدينة دبي (Downtown Flagship)',

    // 7. Media
    thumbnail: 'https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800&auto=format&fit=crop&q=80']
  });

  // Keep chassisNumber and vin in sync when either is edited
  const handleChassisChange = (val: string) => {
    setForm(prev => ({ ...prev, chassisNumber: val, vin: val }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingImage(true);
      const result = await uploadFile(file, 'vehicles');
      if (result?.url) {
        setForm(prev => ({
          ...prev,
          thumbnail: result.url,
          images: [result.url, ...prev.images.filter(img => img !== result.url)]
        }));
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.make || !form.model || !form.plateNumber) {
      alert(isAr ? 'يرجى إدخال الحقول الإلزامية (الماركة، الطراز، رقم اللوحة).' : 'Please provide required fields (Make, Model, Plate).');
      return;
    }

    setSubmitting(true);
    try {
      await addVehicle({
        ...form,
        vin: form.chassisNumber || form.vin,
        chassisNumber: form.chassisNumber || form.vin
      });
      onClose();
    } catch (err: any) {
      console.error('Failed to add vehicle:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? 'إضافة مركبة فاخرة للأسطول (تسجيل شامل)' : 'Register Luxury Vehicle (Full RTA & Telematics)'}
      subtitle={isAr ? 'إدخال كافة بيانات الملكية، المرور، التأمين، والتتبع مع قابلية التعديل الكاملة' : 'Complete vehicle registration with editable RTA, insurance, chassis & GPS fields'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6 text-xs text-zinc-300">
        
        {/* Navigation Tabs between Sections */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-zinc-950 border border-zinc-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSection('specs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
              activeSection === 'specs'
                ? 'bg-[#D4AF37] text-zinc-950 shadow-md shadow-[#D4AF37]/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            <span>{isAr ? '1. المواصفات والماركة' : '1. Make & Specs'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('registration')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
              activeSection === 'registration'
                ? 'bg-[#D4AF37] text-zinc-950 shadow-md shadow-[#D4AF37]/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isAr ? '2. اللوحة والترخيص والمرور' : '2. Plate & RTA'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('insurance')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
              activeSection === 'insurance'
                ? 'bg-[#D4AF37] text-zinc-950 shadow-md shadow-[#D4AF37]/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{isAr ? '3. التأمين والرهن' : '3. Insurance & Mortgage'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('mechanical')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
              activeSection === 'mechanical'
                ? 'bg-[#D4AF37] text-zinc-950 shadow-md shadow-[#D4AF37]/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{isAr ? '4. المحرك والقاعدة والتتبع' : '4. Engine, VIN & GPS'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('pricing')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
              activeSection === 'pricing'
                ? 'bg-[#D4AF37] text-zinc-950 shadow-md shadow-[#D4AF37]/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>{isAr ? '5. الأسعار والمسافات' : '5. Rates & KM'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('media')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
              activeSection === 'media'
                ? 'bg-[#D4AF37] text-zinc-950 shadow-md shadow-[#D4AF37]/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>{isAr ? '6. صورة المركبة' : '6. Photo & Media'}</span>
          </button>
        </div>

        {/* SECTION 1: MAKE & BASIC SPECS */}
        {activeSection === 'specs' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
              <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
                <Car className="w-4 h-4 text-[#D4AF37]" />
                <span>{isAr ? 'بيانات الماركة والطراز والمواصفات الأساسية' : 'Brand Identity & Core Specifications'}</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Make */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'الماركة (Make) *' : 'Make / Brand *'}
                  </label>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      required
                      list="luxury-makes-list"
                      value={form.make}
                      onChange={e => setForm({ ...form, make: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-medium focus:border-[#D4AF37] focus:outline-none"
                      placeholder="e.g. Ferrari, Rolls-Royce, Porsche"
                    />
                    <datalist id="luxury-makes-list">
                      {LUXURY_MAKES.map(m => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Model */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'الطراز (Model) *' : 'Model / Variant *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.model}
                    onChange={e => setForm({ ...form, model: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-medium focus:border-[#D4AF37] focus:outline-none"
                    placeholder="e.g. Purosangue, Spectre, Revuelto"
                  />
                </div>

                {/* Year of Manufacture */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'سنة الصنع (Year) *' : 'Year of Manufacture *'}
                  </label>
                  <input
                    type="number"
                    min="2010"
                    max={new Date().getFullYear() + 2}
                    required
                    value={form.year}
                    onChange={e => setForm({ ...form, year: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Color */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'اللون الخارجي (Color) *' : 'Exterior Color *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.exteriorColor}
                    onChange={e => setForm({ ...form, exteriorColor: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                    placeholder="e.g. Rosso Corsa, Obsidian Black"
                  />
                </div>

                {/* Seating Capacity */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'عدد الركاب (Seating Capacity) *' : 'Passenger Capacity *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    required
                    value={form.seatingCapacity}
                    onChange={e => setForm({ ...form, seatingCapacity: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                    placeholder="e.g. 2, 4, 5, 7"
                  />
                </div>

                {/* Country of Origin */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'بلد الصنع (Country of Origin) *' : 'Manufacturing Country *'}
                  </label>
                  <select
                    value={form.manufacturingCountry}
                    onChange={e => setForm({ ...form, manufacturingCountry: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                  >
                    {MANUFACTURING_COUNTRIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Fleet Category */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'فئة الأسطول' : 'Fleet Category'}
                  </label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value as any })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="supercar">Supercar (سوبركار)</option>
                    <option value="ultra_luxury_sedan">Ultra-Luxury Sedan (سيدان فارهة)</option>
                    <option value="executive_suv">Executive SUV (دفع رباعي VIP)</option>
                    <option value="exotic_convertible">Exotic Convertible (كشف فاخر)</option>
                    <option value="grand_tourer">Grand Tourer (جراند تورير)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveSection('registration')}
                className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold hover:brightness-110"
              >
                {isAr ? 'التالي: اللوحة والترخيص والمرور ←' : 'Next: Plate & RTA →'}
              </button>
            </div>
          </div>
        )}

        {/* SECTION 2: PLATE & REGISTRATION */}
        {activeSection === 'registration' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
              <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
                <FileText className="w-4 h-4 text-[#D4AF37]" />
                <span>{isAr ? 'بيانات اللوحة والترخيص والملف المروري' : 'Plate, Mulkiya & RTA Registration'}</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Plate Number */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'رقم اللوحة (Plate Number) *' : 'Plate Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.plateNumber}
                    onChange={e => setForm({ ...form, plateNumber: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono font-bold text-sm focus:border-[#D4AF37] focus:outline-none"
                    placeholder="e.g. 888, 12345"
                  />
                </div>

                {/* Plate Category / Code */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'صنف اللوحة / الفئة (Plate Category) *' : 'Plate Category / Code *'}
                  </label>
                  <input
                    type="text"
                    required
                    list="plate-categories-list"
                    value={form.plateCategory}
                    onChange={e => setForm({ ...form, plateCategory: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none font-medium"
                    placeholder="e.g. دبي - الفئة W, أبوظبي 1"
                  />
                  <datalist id="plate-categories-list">
                    {UAE_PLATE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                {/* Emirate / City */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'الإمارة / جهة الترخيص' : 'Emirate / Licensing Authority'}
                  </label>
                  <select
                    value={form.plateCity}
                    onChange={e => setForm({ ...form, plateCity: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="Dubai">دبي (Dubai - RTA)</option>
                    <option value="Abu Dhabi">أبوظبي (Abu Dhabi)</option>
                    <option value="Sharjah">الشارقة (Sharjah)</option>
                    <option value="Ajman">عجمان (Ajman)</option>
                    <option value="Ras Al Khaimah">رأس الخيمة (RAK)</option>
                    <option value="Fujairah">الفجيرة (Fujairah)</option>
                    <option value="Umm Al Quwain">أم القيوين (UAQ)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Registration Date */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'تاريخ الترخيص (Registration Date) *' : 'Registration Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={form.registrationDate}
                    onChange={e => setForm({ ...form, registrationDate: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>

                {/* Registration Expiry */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'إنتهاء الترخيص (Registration Expiry) *' : 'Registration Expiry *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={form.registrationExpiry}
                    onChange={e => setForm({ ...form, registrationExpiry: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>

              {/* Traffic File Number with Safety Controls */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-200">
                      {isAr ? 'الملف المروري (Traffic TC Number):' : 'Traffic TC Number:'}
                    </span>
                    {form.trafficFileNumber === DEFAULT_TRAFFIC_FILE && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                        {isAr ? 'الملف الثابت المعتمد للشركة' : 'Default Corporate TC'}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTrafficFileUnlocked(!trafficFileUnlocked)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                      trafficFileUnlocked
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {trafficFileUnlocked ? (
                      <>
                        <Unlock className="w-3.5 h-3.5 text-amber-400" />
                        <span>{isAr ? 'إلغاء قفل التعديل' : 'Unlocked (Editable)'}</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{isAr ? 'تعديل أو إدخال ملف جديد' : 'Unlock / Custom TC'}</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    required
                    readOnly={!trafficFileUnlocked}
                    value={form.trafficFileNumber}
                    onChange={e => setForm({ ...form, trafficFileNumber: e.target.value })}
                    className={`w-full px-3.5 py-2 rounded-xl border font-mono font-bold text-sm transition-all ${
                      trafficFileUnlocked
                        ? 'bg-zinc-950 border-amber-500/50 text-amber-300 focus:border-amber-400 focus:outline-none'
                        : 'bg-zinc-900/60 border-zinc-800 text-[#f5d97f] cursor-not-allowed'
                    }`}
                  />
                  {!trafficFileUnlocked && (
                    <div className="text-[11px] text-zinc-500 mt-1">
                      {isAr
                        ? 'الملف المروري الافتراضي هو 51317978. يمكنك النقر على "تعديل أو إدخال ملف جديد" لتغييره.'
                        : 'Default TC is 51317978. Click "Unlock / Custom TC" to edit or provide an alternative number.'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveSection('specs')}
                className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                {isAr ? '← السابق' : '← Back'}
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('insurance')}
                className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold hover:brightness-110"
              >
                {isAr ? 'التالي: التأمين والرهن ←' : 'Next: Insurance & Mortgage →'}
              </button>
            </div>
          </div>
        )}

        {/* SECTION 3: INSURANCE & MORTGAGE */}
        {activeSection === 'insurance' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
              <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
                <Shield className="w-4 h-4 text-[#D4AF37]" />
                <span>{isAr ? 'بيانات وثيقة التأمين وجهة الرهن المالي' : 'Insurance Policy & Mortgage Entity'}</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Insured With */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'مؤمنة لدى (Insurance Company) *' : 'Insured With / Underwriter *'}
                  </label>
                  <input
                    type="text"
                    required
                    list="insurance-companies-list"
                    value={form.insuranceCompany}
                    onChange={e => setForm({ ...form, insuranceCompany: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                    placeholder="e.g. شركة دبي للتأمين, أورينت"
                  />
                  <datalist id="insurance-companies-list">
                    {UAE_INSURANCE_COMPANIES.map(comp => (
                      <option key={comp} value={comp} />
                    ))}
                  </datalist>
                </div>

                {/* Insurance Type - Default Comprehensive */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'نوع التأمين (Insurance Type) *' : 'Insurance Coverage Type *'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, insuranceType: 'شامل' })}
                      className={`px-3 py-2 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all ${
                        form.insuranceType === 'شامل' || form.insuranceType === 'comprehensive'
                          ? 'bg-[#D4AF37] text-zinc-950 border-[#D4AF37] shadow-sm'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isAr ? 'تأمين شامل (Comprehensive)' : 'Comprehensive'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm({ ...form, insuranceType: 'ضد الغير' })}
                      className={`px-3 py-2 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all ${
                        form.insuranceType === 'ضد الغير' || form.insuranceType === 'third_party'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <span>{isAr ? 'ضد الغير (Third-Party)' : 'Third-Party'}</span>
                    </button>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    {isAr ? '* الخيار الافتراضي لأسطول سبلندر هو التأمين الشامل.' : '* Default policy for luxury fleet is Comprehensive.'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Policy Number */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'رقم الوثيقة (Policy Number) *' : 'Policy Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.insurancePolicyNumber}
                    onChange={e => setForm({ ...form, insurancePolicyNumber: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                    placeholder="e.g. POL-2025-DXB-9988"
                  />
                </div>

                {/* Insurance Expiry Date */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'انتهاء التأمين (Insurance Expiry Date) *' : 'Insurance Expiry Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={form.insuranceExpiry}
                    onChange={e => setForm({ ...form, insuranceExpiry: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>

              {/* Mortgage Entity */}
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">
                  {isAr ? 'جهة الرهن (Mortgagee / Financier) *' : 'Mortgagee / Financing Entity *'}
                </label>
                <input
                  type="text"
                  required
                  list="mortgage-entities-list"
                  value={form.mortgagee}
                  onChange={e => setForm({ ...form, mortgagee: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                  placeholder="e.g. لا يوجد (ملك خالص), بنك الإمارات دبي الوطني"
                />
                <datalist id="mortgage-entities-list">
                  {UAE_MORTGAGE_ENTITIES.map(ent => (
                    <option key={ent} value={ent} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveSection('registration')}
                className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                {isAr ? '← السابق' : '← Back'}
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('mechanical')}
                className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold hover:brightness-110"
              >
                {isAr ? 'التالي: المحرك والقاعدة والتتبع ←' : 'Next: Engine, VIN & GPS →'}
              </button>
            </div>
          </div>
        )}

        {/* SECTION 4: MECHANICAL & GPS TELEMATICS */}
        {activeSection === 'mechanical' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
              <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
                <Radio className="w-4 h-4 text-[#D4AF37]" />
                <span>{isAr ? 'رقم المحرك والقاعدة والعداد وجهاز التتبع' : 'Engine, Chassis Number (VIN), Odometer & GPS'}</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Chassis Number / VIN - FULLY EDITABLE */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'رقم القاعدة / الهيكل (Chassis / VIN) *' : 'Chassis / VIN Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.chassisNumber}
                    onChange={e => handleChassisChange(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono font-bold focus:border-[#D4AF37] focus:outline-none"
                    placeholder="e.g. ZFF88..."
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    {isAr ? 'قابل للتعديل بالكامل لأي رقم شاسيه' : 'Fully editable chassis identifier'}
                  </span>
                </div>

                {/* Engine Number */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'رقم المحرك (Engine Number) *' : 'Engine Serial Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.engineNumber}
                    onChange={e => setForm({ ...form, engineNumber: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                    placeholder="e.g. ENG-V12-8877"
                  />
                </div>

                {/* Odometer / Current Mileage - FULLY EDITABLE */}
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold mb-1">
                    {isAr ? 'عداد الكيلومتر الحالي (KM) *' : 'Current Odometer (KM) *'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.mileage}
                    onChange={e => setForm({ ...form, mileage: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sky-300 font-mono font-bold focus:border-sky-400 focus:outline-none"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    {isAr ? 'قابل للتعديل (صفر للسيارات الجديدة أو أي قراءة)' : 'Fully editable odometer reading'}
                  </span>
                </div>
              </div>

              {/* GPS Telematics Section */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-3">
                <h5 className="text-xs font-bold text-zinc-200 flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{isAr ? 'منظومة التتبع والأمان الذكي (GPS & Telematics):' : 'GPS Telematics & Tracking Certification:'}</span>
                </h5>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tracking Company */}
                  <div>
                    <label className="block text-zinc-300 text-xs font-semibold mb-1">
                      {isAr ? 'الشركة المسئولة عن جهاز التتبع *' : 'GPS Tracking Provider *'}
                    </label>
                    <input
                      type="text"
                      required
                      list="gps-companies-list"
                      value={form.gpsTrackingCompany}
                      onChange={e => setForm({ ...form, gpsTrackingCompany: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                      placeholder="e.g. فالكون آي, سيكيور تراك"
                    />
                    <datalist id="gps-companies-list">
                      {GPS_TRACKING_COMPANIES.map(g => (
                        <option key={g} value={g} />
                      ))}
                    </datalist>
                  </div>

                  {/* Tracking Certificate Expiry */}
                  <div>
                    <label className="block text-zinc-300 text-xs font-semibold mb-1">
                      {isAr ? 'تاريخ انتهاء شهادة التتبع *' : 'Tracking Certificate Expiry *'}
                    </label>
                    <input
                      type="date"
                      required
                      value={form.gpsCertificateExpiry}
                      onChange={e => setForm({ ...form, gpsCertificateExpiry: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveSection('insurance')}
                className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                {isAr ? '← السابق' : '← Back'}
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('pricing')}
                className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold hover:brightness-110"
              >
                {isAr ? 'التالي: الأسعار والمسافات ←' : 'Next: Rates & KM →'}
              </button>
            </div>
          </div>
        )}

        {/* SECTION 5: PRICING & MILEAGE ALLOWANCES */}
        {activeSection === 'pricing' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
              <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
                <DollarSign className="w-4 h-4 text-[#D4AF37]" />
                <span>{isAr ? 'أسعار التأجير والمسافات القياسية ورسوم التجاوز' : 'Rental Rates, Mileage Allowances & Excess KM Fee'}</span>
              </h4>

              {/* Rates */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'السعر اليومي (AED) *' : 'Daily Rate (AED) *'}</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={form.dailyRate}
                    onChange={e => setForm({ ...form, dailyRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-[#f5d97f] font-mono font-bold text-sm focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'السعر الأسبوعي (AED)' : 'Weekly Rate (AED)'}</label>
                  <input
                    type="number"
                    min="0"
                    value={form.weeklyRate}
                    onChange={e => setForm({ ...form, weeklyRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono text-xs focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'السعر الشهري (AED)' : 'Monthly Rate (AED)'}</label>
                  <input
                    type="number"
                    min="0"
                    value={form.monthlyRate}
                    onChange={e => setForm({ ...form, monthlyRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono text-xs focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'مبلغ التأمين المحتجز (AED)' : 'Security Deposit (AED)'}</label>
                  <input
                    type="number"
                    min="0"
                    value={form.minDeposit}
                    onChange={e => setForm({ ...form, minDeposit: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-amber-500/30 text-amber-300 font-mono font-bold text-sm focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Mileage Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'المسافة اليومية القياسية (كم/يوم) *' : 'Daily Allowance (km/day) *'}</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.dailyMileageAllowance}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setForm({ ...form, dailyMileageAllowance: v, monthlyMileageAllowance: v * 18 });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono text-xs focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'المسافة الشهرية القياسية (كم/شهر) *' : 'Monthly Allowance (km/month) *'}</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.monthlyMileageAllowance}
                    onChange={e => setForm({ ...form, monthlyMileageAllowance: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sky-300 font-mono font-bold text-xs focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-amber-300 text-xs mb-1 font-bold">{isAr ? 'رسوم تجاوز المسافة (د.إ/كم) *' : 'Excess KM Rate (AED/km) *'}</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    required
                    value={form.extraKmRate}
                    onChange={e => setForm({ ...form, extraKmRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-amber-500/50 text-amber-300 font-mono font-bold text-xs focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveSection('mechanical')}
                className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                {isAr ? '← السابق' : '← Back'}
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('media')}
                className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold hover:brightness-110"
              >
                {isAr ? 'التالي: صورة المركبة ←' : 'Next: Photo & Media →'}
              </button>
            </div>
          </div>
        )}

        {/* SECTION 6: PHOTO & MEDIA */}
        {activeSection === 'media' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
              <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
                <ImageIcon className="w-4 h-4 text-[#D4AF37]" />
                <span>{isAr ? 'صورة المركبة الفاخرة (رفع من الجهاز أو إدخال رابط أو المعرض)' : 'Vehicle Photo (Upload, URL, or Curated Gallery)'}</span>
              </h4>

              {/* Upload or URL Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Upload Button */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-dashed border-zinc-700 hover:border-[#D4AF37] transition-all flex flex-col items-center justify-center text-center space-y-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <button
                      type="button"
                      disabled={uploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-1.5 rounded-xl bg-[#D4AF37] hover:brightness-110 text-zinc-950 font-bold text-xs transition-all"
                    >
                      {uploadingImage ? (isAr ? 'جاري رفع الصورة...' : 'Uploading...') : (isAr ? 'اختر صورة من جهازك' : 'Upload Image from Device')}
                    </button>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      {isAr ? 'يدعم صور PNG, JPG, WebP بدقة عالية' : 'Supports high-res PNG, JPG, WebP'}
                    </p>
                  </div>
                </div>

                {/* Direct Image URL */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <label className="block text-zinc-300 text-xs font-semibold">
                    {isAr ? 'أو أدخل رابط صورة مخصص (URL):' : 'Or Enter Direct Image URL:'}
                  </label>
                  <input
                    type="url"
                    value={form.thumbnail}
                    onChange={e => setForm({ ...form, thumbnail: e.target.value, images: [e.target.value] })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37] focus:outline-none"
                    placeholder="https://..."
                  />
                  <p className="text-[10px] text-zinc-500">
                    {isAr ? 'يمكنك استخدام أي رابط صورة خارجي مباشر.' : 'Paste any direct web image URL.'}
                  </p>
                </div>
              </div>

              {/* Current Preview */}
              {form.thumbnail && (
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center gap-4">
                  <img
                    src={form.thumbnail}
                    alt="Preview"
                    className="w-28 h-20 rounded-xl object-cover border border-zinc-700 shadow-md"
                  />
                  <div>
                    <span className="text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      {isAr ? 'معاينة الصورة الحالية المعتمدة للمركبة' : 'Active Vehicle Photo Preview'}
                    </span>
                    <p className="text-zinc-400 text-[11px] mt-1 font-mono break-all">
                      {form.thumbnail.length > 80 ? `${form.thumbnail.substring(0, 80)}...` : form.thumbnail}
                    </p>
                  </div>
                </div>
              )}

              {/* Quick Gallery Presets */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                  {isAr ? 'معرض صور جاهزة للسيارات الفارهة (انقر للاختيار الفوري):' : 'Curated Luxury Vehicle Gallery (Click to Select):'}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CURATED_GALLERY_IMAGES.map(item => (
                    <button
                      key={item.url}
                      type="button"
                      onClick={() => setForm({ ...form, thumbnail: item.url, images: [item.url] })}
                      className={`p-1.5 rounded-xl border text-start transition-all ${
                        form.thumbnail === item.url
                          ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                          : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                      }`}
                    >
                      <img
                        src={item.url}
                        alt={item.label}
                        className="w-full h-16 object-cover rounded-lg mb-1"
                      />
                      <span className="text-[10px] text-zinc-300 line-clamp-1">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveSection('pricing')}
                className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                {isAr ? '← السابق' : '← Back'}
              </button>
            </div>
          </div>
        )}

        {/* Live Firebase notice */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-xs text-[#f5d97f]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold">
              {isAr ? 'سحابة سبلندر نشطة:' : 'Live Splendor Cloud:'}
            </span>
            <span className="text-zinc-300 font-mono text-[11px]">
              {firebaseSyncState.projectId || 'splendor-private-crm'}
            </span>
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">
            {isAr ? 'حفظ فوري ومزامنة مع شاشات الأسطول والعمليات' : 'Instant Zero-Reload Broadcast'}
          </span>
        </div>

        {/* Final Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
          <div className="text-[11px] text-zinc-500">
            {isAr ? 'كل البيانات المدخلة تظل قابلة للتعديل والتحديث في أي وقت.' : 'All registered vehicle data remains editable at any time.'}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold transition-all"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>

            <button
              type="submit"
              disabled={submitting || uploadingImage}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs lg:text-sm shadow-lg shadow-[#D4AF37]/25 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
            >
              <Car className="w-4 h-4" />
              <span>
                {submitting
                  ? (isAr ? 'جاري الحفظ والتسجيل...' : 'Saving to Fleet...')
                  : (isAr ? 'حفظ وإضافة المركبة للأسطول فوراً' : 'Save & Register Vehicle')}
              </span>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
