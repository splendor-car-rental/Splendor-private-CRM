import React, { useState } from 'react';
import { Car, Sparkles, Shield, AlertTriangle, CheckCircle2, DollarSign, Image as ImageIcon, Zap, Gauge } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { VehicleCategory, VehicleStatus } from '../../types';
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
    category: 'luxury_suv' as VehicleCategory,
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

export const AddVehicleModal: React.FC<AddVehicleModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const { addVehicle, firebaseSyncState } = useCRM();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    make: 'Ferrari',
    model: 'Purosangue V12',
    year: 2025,
    category: 'supercar' as VehicleCategory,
    color: 'Rosso Corsa',
    plateNumber: `DXB ${String.fromCharCode(65 + Math.floor(Math.random() * 26))} ${Math.floor(100 + Math.random() * 900)}`,
    plateCity: 'Dubai',
    vin: `ZFF${Math.floor(10000000000000 + Math.random() * 90000000000000)}`,
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

  const applyPreset = (preset: typeof PRESET_SUPER_CARS[0]) => {
    setForm(prev => ({
      ...prev,
      make: preset.make,
      model: preset.model,
      year: preset.year,
      category: preset.category,
      color: preset.color,
      dailyRate: preset.dailyRate,
      weeklyRate: preset.weeklyRate,
      monthlyRate: preset.monthlyRate,
      securityDeposit: preset.securityDeposit,
      mileage: preset.mileage,
      horsepower: preset.horsepower,
      acceleration: preset.acceleration,
      thumbnail: preset.thumbnail,
      images: [preset.thumbnail]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addVehicle(form);
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
      title={language === 'ar' ? 'إضافة مركبة فاخرة للأسطول' : 'Register Vehicle to Luxury Fleet'}
      subtitle={language === 'ar' ? 'ربط فوري ومباشر مع قاعدة بيانات Firestore وتحديث المؤشرات الحية' : 'Direct synchronization to Firebase Firestore & live dashboard telemetry'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Quick VIP Presets */}
        <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#f5d97f] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              {language === 'ar' ? 'نماذج جاهزة للسوبركارز الفارهة:' : 'Quick Supercar Presets:'}
            </span>
            <span className="text-[10px] text-zinc-400">
              {language === 'ar' ? 'انقر للتحميل التلقائي' : 'Click to prefill specs'}
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

        {/* Live Firebase notice */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-xs text-[#f5d97f]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold">
              {language === 'ar' ? 'اتصال Firestore نشط:' : 'Live Firestore Telemetry:'}
            </span>
            <span className="text-zinc-300 font-mono text-[11px]">
              {firebaseSyncState.projectId}
            </span>
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">
            {language === 'ar' ? 'تحديث لحظي بدون إعادة تحميل' : 'Instant Zero-Reload Broadcast'}
          </span>
        </div>

        {/* General Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'الشركة المصنعة (Make)' : 'Manufacturer / Make'} *
            </label>
            <input
              type="text"
              required
              value={form.make}
              onChange={e => setForm({ ...form, make: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              placeholder="e.g. Ferrari, Rolls-Royce"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'الموديل والتجهيز (Model)' : 'Model & Specification'} *
            </label>
            <input
              type="text"
              required
              value={form.model}
              onChange={e => setForm({ ...form, model: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              placeholder="e.g. Purosangue V12"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'سنة الصنع (Year)' : 'Model Year'}
            </label>
            <input
              type="number"
              value={form.year}
              onChange={e => setForm({ ...form, year: Number(e.target.value) })}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>
        </div>

        {/* Category & Plate */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'فئة المركبة' : 'Fleet Category'} *
            </label>
            <select
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value as any })}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
            >
              <option value="supercar">Supercar (سوبركار)</option>
              <option value="ultra_luxury_sedan">Ultra-Luxury Sedan (سيدان فاخرة)</option>
              <option value="luxury_suv">Luxury Executive SUV (دفع رباعي VIP)</option>
              <option value="convertible">Exotic Convertible (كشف رياضية)</option>
              <option value="grand_tourer">Grand Tourer (جراند تورير)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'رقم اللوحة والإمارة' : 'Plate Number & City'} *
            </label>
            <input
              type="text"
              required
              value={form.plateNumber}
              onChange={e => setForm({ ...form, plateNumber: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
              placeholder="DXB P 888"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'اللون الخارجي' : 'Exterior Color & Finish'}
            </label>
            <input
              type="text"
              value={form.color}
              onChange={e => setForm({ ...form, color: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              placeholder="e.g. Rosso Corsa, Obsidian Black"
            />
          </div>
        </div>

        {/* Pricing & Deposit */}
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
          <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
            {language === 'ar' ? 'أسعار الإيجار اليومي ومبالغ التأمين (AED):' : 'Rental Rates & Security Deposits (AED):'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {language === 'ar' ? 'السعر اليومي (AED)' : 'Daily Rate (AED)'}
              </label>
              <input
                type="number"
                value={form.dailyRate}
                onChange={e => setForm({ ...form, dailyRate: Number(e.target.value) })}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[#f5d97f] font-bold text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {language === 'ar' ? 'السعر الأسبوعي (AED)' : 'Weekly Rate (AED)'}
              </label>
              <input
                type="number"
                value={form.weeklyRate}
                onChange={e => setForm({ ...form, weeklyRate: Number(e.target.value) })}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {language === 'ar' ? 'السعر الشهري (AED)' : 'Monthly Rate (AED)'}
              </label>
              <input
                type="number"
                value={form.monthlyRate}
                onChange={e => setForm({ ...form, monthlyRate: Number(e.target.value) })}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {language === 'ar' ? 'مبلغ التأمين المحتجز' : 'Security Deposit'}
              </label>
              <input
                type="number"
                value={form.securityDeposit}
                onChange={e => setForm({ ...form, securityDeposit: Number(e.target.value) })}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-amber-500/30 text-amber-300 font-bold text-xs focus:border-amber-400 focus:outline-none font-mono"
              />
            </div>
          </div>
        </div>

        {/* Technical Specs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'القدرة الحصانية (HP)' : 'Horsepower (HP)'}
            </label>
            <input
              type="number"
              value={form.horsepower}
              onChange={e => setForm({ ...form, horsepower: Number(e.target.value) })}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'التسارع (0-100 كم/س ثواني)' : '0-100 km/h (Sec)'}
            </label>
            <input
              type="number"
              step="0.1"
              value={form.acceleration}
              onChange={e => setForm({ ...form, acceleration: Number(e.target.value) })}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'العداد الحالي (كم)' : 'Current Odometer (KM)'}
            </label>
            <input
              type="number"
              value={form.mileage}
              onChange={e => setForm({ ...form, mileage: Number(e.target.value) })}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>
        </div>

        {/* Thumbnail URL */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1.5">
            {language === 'ar' ? 'رابط صورة المركبة الفاخرة' : 'Vehicle Image URL'}
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="url"
              value={form.thumbnail}
              onChange={e => {
                setForm({ ...form, thumbnail: e.target.value, images: [e.target.value] });
              }}
              className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              placeholder="https://..."
            />
            {form.thumbnail && (
              <img
                src={form.thumbnail}
                alt="Preview"
                className="w-12 h-9 rounded-lg object-cover border border-zinc-700"
              />
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold transition-all"
          >
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs lg:text-sm shadow-lg shadow-[#D4AF37]/25 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
          >
            <Car className="w-4 h-4" />
            <span>{submitting ? (language === 'ar' ? 'جاري الحفظ في Firestore...' : 'Saving to Firestore...') : (language === 'ar' ? 'حفظ وإضافة للأسطول فوراً' : 'Save to Fleet Instantly')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
