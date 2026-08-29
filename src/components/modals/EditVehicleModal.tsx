import React, { useState, useEffect, useRef } from 'react';
import {
  Car, Sparkles, Shield, AlertTriangle, CheckCircle2, DollarSign,
  Image as ImageIcon, Zap, Gauge, Lock, Unlock, Upload, FileText,
  Calendar, Check, AlertCircle, RefreshCw, Layers, MapPin, Radio
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Vehicle, VehicleCategory, VehicleStatus } from '../../types';
import { Modal } from '../common/Modal';
import { uploadFile } from '../../lib/upload';

interface EditVehicleModalProps {
  vehicle: Vehicle | null;
  isOpen: boolean;
  onClose: () => void;
}

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

export const EditVehicleModal: React.FC<EditVehicleModalProps> = ({ vehicle, isOpen, onClose }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { updateVehicle } = useCRM();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeSection, setActiveSection] = useState<'specs' | 'registration' | 'insurance' | 'mechanical' | 'pricing' | 'media'>('specs');
  const [trafficFileUnlocked, setTrafficFileUnlocked] = useState(false);

  const [form, setForm] = useState<Partial<Vehicle>>({});

  useEffect(() => {
    if (vehicle) {
      setForm({
        make: vehicle.make || '',
        model: vehicle.model || '',
        year: vehicle.year || new Date().getFullYear(),
        exteriorColor: vehicle.exteriorColor || '',
        interiorColor: vehicle.interiorColor || '',
        seatingCapacity: vehicle.seatingCapacity || 4,
        manufacturingCountry: vehicle.manufacturingCountry || 'ألمانيا (Germany)',
        category: vehicle.category || 'supercar',
        trim: vehicle.trim || '',

        plateNumber: vehicle.plateNumber || '',
        plateCategory: vehicle.plateCategory || 'دبي - الفئة W',
        plateCity: vehicle.plateCity || 'Dubai',
        registrationDate: vehicle.registrationDate || new Date().toISOString().split('T')[0],
        registrationExpiry: vehicle.registrationExpiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        trafficFileNumber: vehicle.trafficFileNumber || DEFAULT_TRAFFIC_FILE,

        insuranceCompany: vehicle.insuranceCompany || 'شركة دبي للتأمين (Dubai Insurance)',
        insuranceType: vehicle.insuranceType || 'شامل',
        insurancePolicyNumber: vehicle.insurancePolicyNumber || `POL-DXB-${Math.floor(100000 + Math.random() * 900000)}`,
        insuranceExpiry: vehicle.insuranceExpiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        mortgagee: vehicle.mortgagee || 'لا يوجد (ملك خالص للشركة)',

        engineNumber: vehicle.engineNumber || `ENG-${Math.floor(100000 + Math.random() * 900000)}`,
        chassisNumber: vehicle.chassisNumber || vehicle.vin || '',
        vin: vehicle.vin || vehicle.chassisNumber || '',
        mileage: vehicle.mileage || 0,
        horsepower: vehicle.horsepower || 600,
        engine: vehicle.engine || 'Twin-Turbo V8',
        transmission: vehicle.transmission || 'automatic',
        fuelType: vehicle.fuelType || 'petrol',
        gpsTrackingCompany: vehicle.gpsTrackingCompany || 'فالكون آي للأنظمة الذكية (Falcon Eye Telematics)',
        gpsCertificateExpiry: vehicle.gpsCertificateExpiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],

        dailyRate: vehicle.dailyRate || 5000,
        weeklyRate: vehicle.weeklyRate || 30000,
        monthlyRate: vehicle.monthlyRate || 95000,
        minDeposit: vehicle.minDeposit || 10000,
        dailyMileageAllowance: vehicle.dailyMileageAllowance ?? 250,
        monthlyMileageAllowance: vehicle.monthlyMileageAllowance ?? 4500,
        extraKmRate: vehicle.extraKmRate ?? 2,

        thumbnail: vehicle.thumbnail || '',
        images: vehicle.images?.length ? vehicle.images : [vehicle.thumbnail || '']
      });
    }
  }, [vehicle]);

  if (!vehicle) return null;

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
          images: [result.url, ...(prev.images || []).filter(img => img !== result.url)]
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
    setSubmitting(true);
    try {
      await updateVehicle(vehicle.id, {
        ...form,
        vin: form.chassisNumber || form.vin || vehicle.vin,
        chassisNumber: form.chassisNumber || form.vin || vehicle.vin
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? `تعديل بيانات المركبة: ${vehicle.make} ${vehicle.model}` : `Edit Vehicle: ${vehicle.make} ${vehicle.model}`}
      subtitle={`${isAr ? 'معرف المركبة' : 'Vehicle ID'}: ${vehicle.id} • ${isAr ? 'لوحة' : 'Plate'}: ${vehicle.plateCity} ${vehicle.plateNumber}`}
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

        {/* 1. SPECS */}
        {activeSection === 'specs' && (
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
              <Car className="w-4 h-4 text-[#D4AF37]" />
              <span>{isAr ? 'بيانات الماركة والطراز' : 'Make & Model Specifications'}</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'الماركة (Make) *' : 'Make *'}</label>
                <input
                  type="text"
                  required
                  value={form.make || ''}
                  onChange={e => setForm({ ...form, make: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none font-medium"
                />
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'الطراز (Model) *' : 'Model *'}</label>
                <input
                  type="text"
                  required
                  value={form.model || ''}
                  onChange={e => setForm({ ...form, model: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none font-medium"
                />
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'سنة الصنع (Year) *' : 'Year *'}</label>
                <input
                  type="number"
                  required
                  value={form.year || new Date().getFullYear()}
                  onChange={e => setForm({ ...form, year: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'اللون الخارجي *' : 'Color *'}</label>
                <input
                  type="text"
                  required
                  value={form.exteriorColor || ''}
                  onChange={e => setForm({ ...form, exteriorColor: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'عدد الركاب *' : 'Seating Capacity *'}</label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  required
                  value={form.seatingCapacity || 4}
                  onChange={e => setForm({ ...form, seatingCapacity: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'بلد الصنع *' : 'Manufacturing Country *'}</label>
                <select
                  value={form.manufacturingCountry || 'ألمانيا (Germany)'}
                  onChange={e => setForm({ ...form, manufacturingCountry: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                >
                  {MANUFACTURING_COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'فئة الأسطول' : 'Category'}</label>
                <select
                  value={form.category || 'supercar'}
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
        )}

        {/* 2. REGISTRATION */}
        {activeSection === 'registration' && (
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
              <FileText className="w-4 h-4 text-[#D4AF37]" />
              <span>{isAr ? 'بيانات اللوحة والترخيص والمرور' : 'Plate & Registration Details'}</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'رقم اللوحة *' : 'Plate Number *'}</label>
                <input
                  type="text"
                  required
                  value={form.plateNumber || ''}
                  onChange={e => setForm({ ...form, plateNumber: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono font-bold focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'صنف اللوحة *' : 'Plate Category *'}</label>
                <input
                  type="text"
                  list="edit-plate-cat-list"
                  value={form.plateCategory || ''}
                  onChange={e => setForm({ ...form, plateCategory: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                />
                <datalist id="edit-plate-cat-list">
                  {UAE_PLATE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'الإمارة' : 'Emirate'}</label>
                <select
                  value={form.plateCity || 'Dubai'}
                  onChange={e => setForm({ ...form, plateCity: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                >
                  <option value="Dubai">دبي (Dubai)</option>
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
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'تاريخ الترخيص' : 'Registration Date'}</label>
                <input
                  type="date"
                  value={form.registrationDate || ''}
                  onChange={e => setForm({ ...form, registrationDate: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'إنتهاء الترخيص' : 'Registration Expiry'}</label>
                <input
                  type="date"
                  value={form.registrationExpiry || ''}
                  onChange={e => setForm({ ...form, registrationExpiry: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
            </div>

            {/* Traffic File */}
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200">{isAr ? 'الملف المروري (Traffic TC Number):' : 'Traffic File Number:'}</span>
                <button
                  type="button"
                  onClick={() => setTrafficFileUnlocked(!trafficFileUnlocked)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-[11px] flex items-center gap-1.5"
                >
                  {trafficFileUnlocked ? <Unlock className="w-3 h-3 text-amber-400" /> : <Lock className="w-3 h-3 text-zinc-400" />}
                  <span>{trafficFileUnlocked ? (isAr ? 'إلغاء القفل' : 'Unlocked') : (isAr ? 'تعديل الملف' : 'Unlock')}</span>
                </button>
              </div>
              <input
                type="text"
                readOnly={!trafficFileUnlocked}
                value={form.trafficFileNumber || DEFAULT_TRAFFIC_FILE}
                onChange={e => setForm({ ...form, trafficFileNumber: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono font-bold focus:border-[#D4AF37] focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* 3. INSURANCE */}
        {activeSection === 'insurance' && (
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
              <Shield className="w-4 h-4 text-[#D4AF37]" />
              <span>{isAr ? 'بيانات التأمين والرهن' : 'Insurance & Mortgage Details'}</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'مؤمنة لدى (Insurance Company) *' : 'Insured With *'}</label>
                <input
                  type="text"
                  required
                  list="edit-insurance-companies-list"
                  value={form.insuranceCompany || ''}
                  onChange={e => setForm({ ...form, insuranceCompany: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                />
                <datalist id="edit-insurance-companies-list">
                  {UAE_INSURANCE_COMPANIES.map(comp => (
                    <option key={comp} value={comp} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'نوع التأمين *' : 'Insurance Type *'}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, insuranceType: 'شامل' })}
                    className={`px-3 py-2 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all ${
                      form.insuranceType === 'شامل' || form.insuranceType === 'comprehensive'
                        ? 'bg-[#D4AF37] text-zinc-950 border-[#D4AF37]'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAr ? 'شامل (Comprehensive)' : 'Comprehensive'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, insuranceType: 'ضد الغير' })}
                    className={`px-3 py-2 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all ${
                      form.insuranceType === 'ضد الغير' || form.insuranceType === 'third_party'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    <span>{isAr ? 'ضد الغير (Third-Party)' : 'Third-Party'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'رقم الوثيقة *' : 'Policy Number *'}</label>
                <input
                  type="text"
                  required
                  value={form.insurancePolicyNumber || ''}
                  onChange={e => setForm({ ...form, insurancePolicyNumber: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'إنتهاء التأمين *' : 'Insurance Expiry *'}</label>
                <input
                  type="date"
                  required
                  value={form.insuranceExpiry || ''}
                  onChange={e => setForm({ ...form, insuranceExpiry: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'جهة الرهن *' : 'Mortgagee / Financier *'}</label>
              <input
                type="text"
                required
                list="edit-mortgage-entities-list"
                value={form.mortgagee || ''}
                onChange={e => setForm({ ...form, mortgagee: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
              />
              <datalist id="edit-mortgage-entities-list">
                {UAE_MORTGAGE_ENTITIES.map(ent => (
                  <option key={ent} value={ent} />
                ))}
              </datalist>
            </div>
          </div>
        )}

        {/* 4. MECHANICAL & GPS */}
        {activeSection === 'mechanical' && (
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
              <Radio className="w-4 h-4 text-[#D4AF37]" />
              <span>{isAr ? 'المحرك والشاسيه والعداد والتتبع' : 'Chassis, Engine, Odometer & GPS Tracking'}</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'رقم القاعدة / الهيكل (VIN) *' : 'Chassis / VIN *'}</label>
                <input
                  type="text"
                  required
                  value={form.chassisNumber || form.vin || ''}
                  onChange={e => setForm({ ...form, chassisNumber: e.target.value, vin: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono font-bold focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'رقم المحرك *' : 'Engine Serial *'}</label>
                <input
                  type="text"
                  required
                  value={form.engineNumber || ''}
                  onChange={e => setForm({ ...form, engineNumber: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'العداد الحالي (كم) *' : 'Odometer (KM) *'}</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.mileage || 0}
                  onChange={e => setForm({ ...form, mileage: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sky-300 font-mono font-bold focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'الشركة المسئولة عن جهاز التتبع *' : 'GPS Tracking Provider *'}</label>
                <input
                  type="text"
                  list="edit-gps-companies-list"
                  value={form.gpsTrackingCompany || ''}
                  onChange={e => setForm({ ...form, gpsTrackingCompany: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37] focus:outline-none"
                />
                <datalist id="edit-gps-companies-list">
                  {GPS_TRACKING_COMPANIES.map(g => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-zinc-300 text-xs font-semibold mb-1">{isAr ? 'تاريخ انتهاء شهادة التتبع *' : 'Tracking Expiry *'}</label>
                <input
                  type="date"
                  value={form.gpsCertificateExpiry || ''}
                  onChange={e => setForm({ ...form, gpsCertificateExpiry: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* 5. PRICING */}
        {activeSection === 'pricing' && (
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
              <DollarSign className="w-4 h-4 text-[#D4AF37]" />
              <span>{isAr ? 'أسعار التأجير والمسافات القياسية' : 'Rental Rates & Mileage Allowances'}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'السعر اليومي (AED) *' : 'Daily Rate (AED) *'}</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.dailyRate || 0}
                  onChange={e => setForm({ ...form, dailyRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-[#f5d97f] font-mono font-bold focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'السعر الأسبوعي (AED)' : 'Weekly Rate (AED)'}</label>
                <input
                  type="number"
                  min="0"
                  value={form.weeklyRate || 0}
                  onChange={e => setForm({ ...form, weeklyRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'السعر الشهري (AED)' : 'Monthly Rate (AED)'}</label>
                <input
                  type="number"
                  min="0"
                  value={form.monthlyRate || 0}
                  onChange={e => setForm({ ...form, monthlyRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'مبلغ التأمين (AED)' : 'Deposit (AED)'}</label>
                <input
                  type="number"
                  min="0"
                  value={form.minDeposit || 0}
                  onChange={e => setForm({ ...form, minDeposit: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-amber-500/30 text-amber-300 font-mono font-bold focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'المسافة اليومية القياسية (كم/يوم) *' : 'Daily Allowance (km) *'}</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.dailyMileageAllowance ?? 250}
                  onChange={e => setForm({ ...form, dailyMileageAllowance: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-semibold">{isAr ? 'المسافة الشهرية القياسية (كم/شهر) *' : 'Monthly Allowance (km) *'}</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.monthlyMileageAllowance ?? 4500}
                  onChange={e => setForm({ ...form, monthlyMileageAllowance: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sky-300 font-mono font-bold focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-amber-300 text-xs mb-1 font-bold">{isAr ? 'رسوم تجاوز المسافة (د.إ/كم) *' : 'Excess KM Rate (AED/km) *'}</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  required
                  value={form.extraKmRate ?? 2}
                  onChange={e => setForm({ ...form, extraKmRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-amber-500/50 text-amber-300 font-mono font-bold focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* 6. MEDIA */}
        {activeSection === 'media' && (
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <h4 className="text-xs font-bold text-[#f5d97f] flex items-center gap-2 uppercase tracking-wide">
              <ImageIcon className="w-4 h-4 text-[#D4AF37]" />
              <span>{isAr ? 'تعديل أو رفع صورة المركبة' : 'Vehicle Image & Gallery'}</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-zinc-950 border border-dashed border-zinc-700 flex flex-col items-center justify-center text-center space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:brightness-110 text-zinc-950 font-bold text-xs"
                >
                  {uploadingImage ? (isAr ? 'جاري الرفع...' : 'Uploading...') : (isAr ? 'رفع صورة جديدة من الجهاز' : 'Upload New Photo')}
                </button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <label className="block text-zinc-300 text-xs font-semibold">{isAr ? 'أو رابط الصورة المباشر:' : 'Direct Image URL:'}</label>
                <input
                  type="url"
                  value={form.thumbnail || ''}
                  onChange={e => setForm({ ...form, thumbnail: e.target.value, images: [e.target.value] })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
            </div>

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
                    {isAr ? 'الصورة الحالية' : 'Active Photo Preview'}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <span className="text-xs font-semibold text-zinc-400">{isAr ? 'معرض صور جاهزة للاختيار السريع:' : 'Quick Luxury Presets:'}</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CURATED_GALLERY_IMAGES.map(item => (
                  <button
                    key={item.url}
                    type="button"
                    onClick={() => setForm({ ...form, thumbnail: item.url, images: [item.url] })}
                    className={`p-1.5 rounded-xl border text-start transition-all ${
                      form.thumbnail === item.url ? 'border-[#D4AF37] bg-[#D4AF37]/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                    }`}
                  >
                    <img src={item.url} alt={item.label} className="w-full h-14 object-cover rounded-lg mb-1" />
                    <span className="text-[10px] text-zinc-300 line-clamp-1">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>

          <button
            type="submit"
            disabled={submitting || uploadingImage}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow-lg shadow-[#D4AF37]/25 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{submitting ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ كافة التعديلات فوراً' : 'Save Changes')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
