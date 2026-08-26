import React, { useState } from 'react';
import { UserPlus, Crown, Shield, Phone, Mail, MapPin, Sparkles, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Customer } from '../../types';
import { Modal } from '../common/Modal';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_VIP_CLIENTS = [
  {
    fullName: 'H.H. Sheikh Hamdan Al Maktoum Office',
    companyName: 'Private Royal Affairs',
    email: 'executive.protocol@crownprince.ae',
    phone: '+971 50 888 7766',
    type: 'vip' as const,
    nationality: 'Emirati',
    idType: 'emirates_id' as const,
    idNumber: '784-1990-9988776-1',
    licenseNumber: 'DXB-998811',
    address: 'Zabeel Palace, Dubai',
    isVIP: true,
    tags: ['Royal Protocol', 'VVIP Priority', 'White-Glove Delivery'],
    notes: 'Assign flagship Ferrari and Rolls-Royce allocations directly.'
  },
  {
    fullName: 'Alexander De Vries',
    companyName: 'Apex Capital DIFC',
    email: 'a.devries@apexcapital.ae',
    phone: '+971 54 777 2211',
    type: 'corporate' as const,
    nationality: 'Dutch',
    idType: 'passport' as const,
    idNumber: 'NL90821948',
    licenseNumber: 'NL-884920',
    address: 'DIFC Gate Precinct 4, Dubai',
    isVIP: true,
    tags: ['DIFC Corporate', 'Supercar Enthusiast'],
    notes: 'Direct wire transfer billing on 14-day schedule.'
  },
  {
    fullName: 'Dr. Tariq Al-Ghamdi',
    companyName: 'Al-Ghamdi Medical Group',
    email: 'dr.tariq@ghamdigroup.com',
    phone: '+966 50 123 4567',
    type: 'vip' as const,
    nationality: 'Saudi Arabia',
    idType: 'gcc_id' as const,
    idNumber: '1092837465',
    licenseNumber: 'KSA-993821',
    address: 'Palm Jumeirah Villa 42, Dubai',
    isVIP: true,
    tags: ['GCC VIP', 'Extended Vacation Rentals'],
    notes: 'Prefers Maybach GLS and Cullinan with custom scent package.'
  }
];

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const { addCustomer, checkDuplicateCustomer, firebaseSyncState } = useCRM();
  const [submitting, setSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Customer[] | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    companyName: '',
    email: '',
    phone: '',
    whatsapp: '',
    type: 'vip' as 'individual' | 'corporate' | 'vip' | 'diplomat',
    address: 'Downtown Dubai, UAE',
    city: 'Dubai',
    country: 'United Arab Emirates',
    nationality: 'Emirati',
    idType: 'emirates_id' as 'emirates_id' | 'passport' | 'gcc_id',
    idNumber: '',
    idExpiryDate: '2028-12-31',
    licenseNumber: '',
    licenseCountry: 'United Arab Emirates',
    licenseExpiryDate: '2028-12-31',
    source: 'vip_referral' as any,
    isVIP: true,
    tags: ['VIP Client', 'Direct Onboarding'],
    notes: 'VIP customer registered via Executive Command Center.'
  });

  const applyPreset = (p: typeof PRESET_VIP_CLIENTS[0]) => {
    setForm(prev => ({
      ...prev,
      fullName: p.fullName,
      companyName: p.companyName,
      email: p.email,
      phone: p.phone,
      whatsapp: p.phone,
      type: p.type,
      nationality: p.nationality,
      idType: p.idType,
      idNumber: p.idNumber,
      licenseNumber: p.licenseNumber,
      address: p.address,
      isVIP: p.isVIP,
      tags: p.tags,
      notes: p.notes
    }));
    setDuplicateWarning(null);
  };

  const handleFieldChange = async (field: string, val: any) => {
    const updated = { ...form, [field]: val };
    setForm(updated);

    if (field === 'email' || field === 'phone' || field === 'idNumber') {
      if (updated.email.length > 4 || updated.phone.length > 6) {
        const dup = await checkDuplicateCustomer(updated.email, updated.phone, updated.licenseNumber, updated.idNumber);
        if (dup.hasDuplicate) {
          setDuplicateWarning(dup.matches);
        } else {
          setDuplicateWarning(null);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addCustomer(form);
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
      title={language === 'ar' ? 'تسجيل عميل VIP جديد' : 'Register New VIP Client'}
      subtitle={language === 'ar' ? 'حفظ فوري في قاعدة بيانات Firestore مع التزامن اللحظي في لوحة القيادة' : 'Instant Firestore database sync & real-time live telemetry'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Quick VIP Presets */}
        <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#f5d97f] flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-[#D4AF37]" />
              {language === 'ar' ? 'نماذج كبار الشخصيات السريعة:' : 'VIP Quick Fill Presets:'}
            </span>
            <span className="text-[10px] text-zinc-400">
              {language === 'ar' ? 'تعبئة بيانات VIP بنقرة واحدة' : 'Click to load verified profile'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_VIP_CLIENTS.map(p => (
              <button
                key={p.fullName}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-[#D4AF37]/15 border border-zinc-800 hover:border-[#D4AF37]/50 text-[11px] text-zinc-300 hover:text-[#f5d97f] transition-all flex items-center gap-1.5"
              >
                <Crown className="w-3 h-3 text-[#D4AF37]" />
                <span>{p.fullName}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Duplicate warning alert */}
        {duplicateWarning && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {language === 'ar' ? 'تنبيه: تم العثور على سجل مطابق مسبقاً!' : 'Duplicate Warning Detected!'}
              </p>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                {duplicateWarning.map(m => `${m.fullName} (${m.phone} / ${m.email})`).join('; ')}
              </p>
            </div>
          </div>
        )}

        {/* Basic Client Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'الاسم الكامل للعميل / الشخصية البارزة' : 'Client Full Name / Title'} *
            </label>
            <input
              type="text"
              required
              value={form.fullName}
              onChange={e => handleFieldChange('fullName', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              placeholder="e.g. H.E. Sheikh Mansoor Al Qasimi"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'تصنيف العميل' : 'Client Tier & Type'} *
            </label>
            <select
              value={form.type}
              onChange={e => handleFieldChange('type', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
            >
              <option value="vip">VIP Executive / Royal (شخصية بارزة)</option>
              <option value="corporate">Corporate Client (شركة / جهة اعتبارية)</option>
              <option value="individual">Individual Private Client (فرد)</option>
              <option value="diplomat">Diplomatic Mission (هيئة دبلوماسية)</option>
            </select>
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'رقم الهاتف المباشر' : 'Phone Number'} *
            </label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={e => handleFieldChange('phone', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
              placeholder="+971 50 123 4567"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'} *
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => handleFieldChange('email', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              placeholder="vip@domain.ae"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'اسم الشركة / الجهة التابعة' : 'Company / Entity Name'}
            </label>
            <input
              type="text"
              value={form.companyName}
              onChange={e => handleFieldChange('companyName', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              placeholder="e.g. Sovereign Horizon Capital"
            />
          </div>
        </div>

        {/* Identity & Legal Docs */}
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
          <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
            {language === 'ar' ? 'بيانات الهوية ورخصة القيادة المعتمدة:' : 'Verified Identification & Driving Credentials:'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {language === 'ar' ? 'نوع الوثيقة' : 'ID Document Type'}
              </label>
              <select
                value={form.idType}
                onChange={e => handleFieldChange('idType', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              >
                <option value="emirates_id">Emirates ID (الهوية الإماراتية)</option>
                <option value="passport">Passport (جواز سفر دولي)</option>
                <option value="gcc_id">GCC National ID (هوية خليجية)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {language === 'ar' ? 'رقم الوثيقة' : 'Document Number'} *
              </label>
              <input
                type="text"
                required
                value={form.idNumber}
                onChange={e => handleFieldChange('idNumber', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
                placeholder="784-XXXX-XXXXXXX-X"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {language === 'ar' ? 'رقم رخصة القيادة' : 'Driving License No.'} *
              </label>
              <input
                type="text"
                required
                value={form.licenseNumber}
                onChange={e => handleFieldChange('licenseNumber', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
                placeholder="DXB-XXXXXXX"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {language === 'ar' ? 'الجنسية' : 'Nationality'}
              </label>
              <input
                type="text"
                value={form.nationality}
                onChange={e => handleFieldChange('nationality', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Address & Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'عنوان التسليم / الإقامة' : 'Delivery & Residential Address'}
            </label>
            <input
              type="text"
              value={form.address}
              onChange={e => handleFieldChange('address', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'ملاحظات وتفضيلات الضيافة' : 'Concierge & Hospitality Notes'}
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={e => handleFieldChange('notes', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
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
            <UserPlus className="w-4 h-4" />
            <span>{submitting ? (language === 'ar' ? 'جاري التسجيل في Firestore...' : 'Syncing to Firestore...') : (language === 'ar' ? 'تسجيل عميل VIP فوراً' : 'Register VIP Client Instantly')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
