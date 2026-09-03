import React, { useState } from 'react';
import {
  UserPlus, Building2, Shield, AlertTriangle, CheckCircle2,
  UploadCloud, Crown, ArrowRight, FileCheck
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Customer } from '../../types';
import { Modal } from '../common/Modal';
import { DayMonthYearDateInput } from '../common/DayMonthYearDateInput';
import { uploadFile, formatFileSize } from '../../lib/upload';
import { AddCorporateAccountModal } from './AddCorporateAccountModal';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CustomerTrack = 'individual' | 'corporate';

const INDIVIDUAL_PRESETS = [
  {
    label: 'H.H. Sheikh Hamdan Protocol (Royal VIP)',
    fullName: 'H.H. Sheikh Hamdan Al Maktoum Office',
    email: 'executive.protocol@crownprince.ae',
    phone: '+971 50 888 7766',
    nationality: 'Emirati',
    idType: 'emirates_id' as const,
    idNumber: '784-1990-9988776-1',
    idIssueDate: '2023-01-15',
    idExpiryDate: '2028-01-14',
    licenseNumber: 'DXB-998811',
    licenseIssuedBy: 'RTA Dubai',
    licenseIssueDate: '2021-05-10',
    licenseExpiryDate: '2031-05-09',
    hasInternationalLicense: false,
    address: 'Zabeel Palace, Dubai',
    isVIP: true,
    tags: ['Royal Protocol', 'VVIP Priority', 'White-Glove Delivery'],
    notes: 'Assign flagship Ferrari and Rolls-Royce allocations directly.'
  },
  {
    label: 'Lord Henry Sterling (International VIP)',
    fullName: 'Lord Henry Sterling',
    email: 'h.sterling@sterling-mayfair.co.uk',
    phone: '+44 7911 123456',
    nationality: 'British',
    idType: 'passport' as const,
    idNumber: 'GB98234109',
    idIssueDate: '2022-04-12',
    idExpiryDate: '2032-04-11',
    licenseNumber: 'UK-ST77491',
    licenseIssuedBy: 'DVLA United Kingdom',
    licenseIssueDate: '2019-08-20',
    licenseExpiryDate: '2029-08-19',
    hasInternationalLicense: true,
    internationalLicenseNumber: 'INT-GB-99238',
    internationalLicenseCountry: 'United Kingdom',
    internationalLicenseIssueDate: '2024-01-05',
    internationalLicenseExpiryDate: '2027-01-04',
    address: 'Bulgari Resort Villa 12, Jumeirah Bay Island',
    isVIP: true,
    tags: ['Mayfair VIP', 'Supercar Collector'],
    notes: 'Requires delivery with private chauffeur handover.'
  }
];

const EMPTY_INDIVIDUAL_FORM = {
  fullName: '',
  nationality: 'Emirati',
  idType: 'emirates_id' as 'emirates_id' | 'passport' | 'gcc_id',
  idNumber: '',
  idIssueDate: '',
  idExpiryDate: '',
  dateOfBirth: '',
  licenseNumber: '',
  licenseIssuedBy: 'RTA Dubai',
  licenseIssueDate: '',
  licenseExpiryDate: '',
  hasInternationalLicense: false,
  internationalLicenseNumber: '',
  internationalLicenseCountry: '',
  internationalLicenseIssueDate: '',
  internationalLicenseExpiryDate: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  city: 'Dubai',
  country: 'United Arab Emirates',
  isVIP: false,
  tags: ['Individual Client'] as string[],
  notes: '',
  source: 'direct_walkin'
};

/**
 * Individual (B2C) customer registration -- a corporate customer is a
 * CorporateAccount instead (see AddCorporateAccountModal), never a
 * Customer record, so this modal only ever creates the individual track.
 *
 * KYC evidence is never a self-reported checkbox: after the customer
 * record is created, staff can attach the real ID/license document files
 * (Step 2 below), which is the same customer-documents upload pipeline
 * Customer360View already uses. A field with no uploaded document behind
 * it stays honestly unverified -- nothing here fabricates a "Verified"
 * status without real evidence on file.
 */
export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { currentUser } = useAuth();
  const { addCustomer, checkDuplicateCustomer, addDocument, showToast } = useCRM();

  const [track, setTrack] = useState<CustomerTrack | null>(null);
  const [corporateModalOpen, setCorporateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<Customer[] | null>(null);
  const [createdCustomer, setCreatedCustomer] = useState<Customer | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_INDIVIDUAL_FORM);

  const resetAndClose = () => {
    setTrack(null);
    setForm(EMPTY_INDIVIDUAL_FORM);
    setError(null);
    setDuplicateWarning(null);
    setCreatedCustomer(null);
    onClose();
  };

  const applyPreset = (p: typeof INDIVIDUAL_PRESETS[0]) => {
    setForm({
      ...EMPTY_INDIVIDUAL_FORM,
      fullName: p.fullName,
      nationality: p.nationality,
      idType: p.idType,
      idNumber: p.idNumber,
      idIssueDate: p.idIssueDate,
      idExpiryDate: p.idExpiryDate,
      licenseNumber: p.licenseNumber,
      licenseIssuedBy: p.licenseIssuedBy,
      licenseIssueDate: p.licenseIssueDate,
      licenseExpiryDate: p.licenseExpiryDate,
      hasInternationalLicense: p.hasInternationalLicense,
      internationalLicenseNumber: p.internationalLicenseNumber || '',
      internationalLicenseCountry: p.internationalLicenseCountry || '',
      internationalLicenseIssueDate: p.internationalLicenseIssueDate || '',
      internationalLicenseExpiryDate: p.internationalLicenseExpiryDate || '',
      phone: p.phone,
      whatsapp: p.phone,
      email: p.email,
      address: p.address,
      isVIP: p.isVIP,
      tags: p.tags,
      notes: p.notes
    });
    setDuplicateWarning(null);
  };

  const handleFieldChange = async (field: string, val: any) => {
    const updated = { ...form, [field]: val };
    setForm(updated);
    if (field === 'email' || field === 'phone' || field === 'idNumber' || field === 'licenseNumber') {
      if (updated.email.length > 4 || updated.phone.length > 6) {
        const dup = await checkDuplicateCustomer(updated.email, updated.phone, updated.licenseNumber, updated.idNumber);
        setDuplicateWarning(dup.hasDuplicate ? dup.matches : null);
      }
    }
  };

  const isExpired = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d < new Date();
  };
  const isExpiringSoon = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return !isNaN(d.getTime()) && d >= now && d <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.fullName.trim()) { setError(isAr ? 'الاسم الكامل مطلوب' : 'Full name is required.'); return; }
    if (!form.phone.trim()) { setError(isAr ? 'رقم الهاتف مطلوب' : 'Phone number is required.'); return; }
    if (!form.idNumber.trim()) { setError(isAr ? 'رقم الهوية أو جواز السفر مطلوب' : 'ID or passport number is required.'); return; }
    if (!form.licenseNumber.trim()) { setError(isAr ? 'رقم رخصة القيادة مطلوب' : 'Driving license number is required.'); return; }

    setSubmitting(true);
    try {
      const payload: Partial<Customer> = {
        type: form.isVIP ? 'vip' : 'individual',
        fullName: form.fullName.trim(),
        nationality: form.nationality,
        idType: form.idType,
        idNumber: form.idNumber.trim(),
        idIssueDate: form.idIssueDate || undefined,
        idExpiryDate: form.idExpiryDate,
        licenseNumber: form.licenseNumber.trim(),
        licenseCountry: form.country,
        licenseIssuedBy: form.licenseIssuedBy || undefined,
        licenseIssueDate: form.licenseIssueDate || undefined,
        licenseExpiryDate: form.licenseExpiryDate,
        hasInternationalLicense: form.hasInternationalLicense,
        internationalLicenseNumber: form.hasInternationalLicense ? form.internationalLicenseNumber : undefined,
        internationalLicenseCountry: form.hasInternationalLicense ? form.internationalLicenseCountry : undefined,
        internationalLicenseIssueDate: form.hasInternationalLicense ? form.internationalLicenseIssueDate : undefined,
        internationalLicenseExpiryDate: form.hasInternationalLicense ? form.internationalLicenseExpiryDate : undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim() || form.phone.trim(),
        email: form.email.trim(),
        address: form.address,
        city: form.city,
        country: form.country,
        isVIP: form.isVIP,
        tags: form.tags,
        notes: form.notes,
        source: form.source,
        status: 'active'
      };
      const created = await addCustomer(payload);
      setCreatedCustomer(created);
    } catch (err: any) {
      setError(err?.message || (isAr ? 'تعذر تسجيل العميل.' : 'Failed to register the customer.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEvidenceUpload = async (category: 'customer_id' | 'driving_license', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !createdCustomer) return;
    setUploadingCategory(category);
    try {
      const { url } = await uploadFile(file, 'customer-documents', { customerId: createdCustomer.id });
      await addDocument({
        title: file.name,
        category,
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        fileType: file.type,
        fileUrl: url,
        relatedEntityType: 'customer',
        relatedEntityId: createdCustomer.id,
        relatedEntityName: createdCustomer.fullName,
        version: 1,
        uploadedBy: currentUser?.name || 'Front Desk'
      });
      showToast(
        isAr ? 'تم رفع المستند' : 'Document Uploaded',
        isAr ? 'تم إرفاق المستند بملف العميل بنجاح.' : 'The document was attached to the customer profile.',
        'success'
      );
    } catch (err: any) {
      showToast(
        isAr ? 'فشل رفع المستند' : 'Upload Failed',
        err?.message || (isAr ? 'حدث خطأ أثناء رفع المستند.' : 'Something went wrong uploading the document.'),
        'error'
      );
    } finally {
      setUploadingCategory(null);
    }
  };

  // Step 3: registration succeeded -- offer to attach real evidence documents.
  if (createdCustomer) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={resetAndClose}
        title={isAr ? 'تم تسجيل العميل بنجاح' : 'Customer Registered Successfully'}
        subtitle={isAr ? `${createdCustomer.fullName} (${createdCustomer.id})` : `${createdCustomer.fullName} (${createdCustomer.id})`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{isAr ? 'تم إنشاء ملف العميل في قاعدة البيانات. يمكنك الآن إرفاق مستندات الإثبات الحقيقية (اختياري لكن موصى به لإتمام التحقق).' : 'The customer record was created in the database. You can now attach real evidence documents (optional, recommended to complete verification).'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-[#D4AF37]/50 cursor-pointer flex flex-col items-center gap-2 text-center transition-all">
              <UploadCloud className="w-5 h-5 text-[#D4AF37]" />
              <span className="text-xs text-zinc-200 font-medium">{isAr ? 'رفع وثيقة الهوية / الجواز' : 'Upload ID / Passport Document'}</span>
              <span className="text-[10px] text-zinc-500">{uploadingCategory === 'customer_id' ? (isAr ? 'جاري الرفع...' : 'Uploading...') : (isAr ? 'JPG, PNG أو PDF' : 'JPG, PNG or PDF')}</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleEvidenceUpload('customer_id', e)} disabled={uploadingCategory !== null} />
            </label>
            <label className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-[#D4AF37]/50 cursor-pointer flex flex-col items-center gap-2 text-center transition-all">
              <FileCheck className="w-5 h-5 text-[#D4AF37]" />
              <span className="text-xs text-zinc-200 font-medium">{isAr ? 'رفع رخصة القيادة' : 'Upload Driving License'}</span>
              <span className="text-[10px] text-zinc-500">{uploadingCategory === 'driving_license' ? (isAr ? 'جاري الرفع...' : 'Uploading...') : (isAr ? 'JPG, PNG أو PDF' : 'JPG, PNG or PDF')}</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleEvidenceUpload('driving_license', e)} disabled={uploadingCategory !== null} />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow-lg shadow-[#D4AF37]/25 hover:brightness-110 active:scale-95 transition-all"
            >
              {isAr ? 'إنهاء' : 'Done'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Step 1: pick the track.
  if (!track) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={resetAndClose}
        title={isAr ? 'تسجيل عميل جديد' : 'Register New Customer'}
        subtitle={isAr ? 'اختر نوع العميل أولاً' : 'Choose the customer type first'}
        maxWidth="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setTrack('individual')}
            className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-[#D4AF37]/60 hover:bg-zinc-900 transition-all flex flex-col items-center gap-3 text-center"
          >
            <UserPlus className="w-8 h-8 text-[#D4AF37]" />
            <div className="text-sm font-semibold text-zinc-100">{isAr ? 'عميل فرد' : 'Individual Client'}</div>
            <p className="text-[11px] text-zinc-500">{isAr ? 'شخص طبيعي، بما في ذلك عملاء VIP' : 'A natural person, including VIP clients'}</p>
            <ArrowRight className="w-4 h-4 text-zinc-500" />
          </button>
          <button
            type="button"
            onClick={() => { setCorporateModalOpen(true); }}
            className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-blue-500/60 hover:bg-zinc-900 transition-all flex flex-col items-center gap-3 text-center"
          >
            <Building2 className="w-8 h-8 text-blue-400" />
            <div className="text-sm font-semibold text-zinc-100">{isAr ? 'شركة / جهة اعتبارية' : 'Corporate Account'}</div>
            <p className="text-[11px] text-zinc-500">{isAr ? 'حساب شركة بحدود ائتمانية مستقلة (KYB)' : 'A corporate AR account with its own credit governance (KYB)'}</p>
            <ArrowRight className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <AddCorporateAccountModal
          isOpen={corporateModalOpen}
          onClose={() => { setCorporateModalOpen(false); }}
          onCreated={() => { setCorporateModalOpen(false); resetAndClose(); }}
        />
      </Modal>
    );
  }

  // Step 2: individual registration form.
  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title={isAr ? 'تسجيل عميل فرد جديد' : 'Register New Individual Client'}
      subtitle={isAr ? 'حفظ فوري في قاعدة البيانات مع تحديث لحظي في لوحة القيادة' : 'Instant database save with real-time dashboard updates'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#f5d97f] flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-[#D4AF37]" />
              {isAr ? 'نماذج كبار الشخصيات السريعة:' : 'VIP Quick Fill Presets:'}
            </span>
            <button type="button" onClick={() => setTrack(null)} className="text-[10px] text-zinc-400 hover:text-zinc-200">
              {isAr ? '‹ رجوع لاختيار النوع' : '‹ Back to type selection'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {INDIVIDUAL_PRESETS.map(p => (
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

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {duplicateWarning && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{isAr ? 'تنبيه: تم العثور على سجل مطابق مسبقاً!' : 'Duplicate Warning Detected!'}</p>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                {duplicateWarning.map(m => `${m.fullName} (${m.phone} / ${m.email})`).join('; ')}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'الاسم الكامل' : 'Full Name'} *</label>
            <input
              type="text" required value={form.fullName}
              onChange={e => handleFieldChange('fullName', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              placeholder="e.g. H.E. Sheikh Mansoor Al Qasimi"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={form.isVIP} onChange={e => handleFieldChange('isVIP', e.target.checked)} className="rounded border-zinc-700" />
              <Crown className="w-3.5 h-3.5 text-[#D4AF37]" />
              {isAr ? 'عميل VIP' : 'VIP Client'}
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'رقم الهاتف' : 'Phone Number'} *</label>
            <input
              type="tel" required value={form.phone}
              onChange={e => handleFieldChange('phone', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
              placeholder="+971 50 123 4567"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'البريد الإلكتروني' : 'Email Address'}</label>
            <input
              type="email" value={form.email}
              onChange={e => handleFieldChange('email', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              placeholder="client@domain.ae"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'الجنسية' : 'Nationality'}</label>
            <input
              type="text" value={form.nationality}
              onChange={e => handleFieldChange('nationality', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
          <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
            {isAr ? 'بيانات الهوية:' : 'Identification:'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'نوع الوثيقة' : 'ID Document Type'}</label>
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
              <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'رقم الوثيقة' : 'Document Number'} *</label>
              <input
                type="text" required value={form.idNumber}
                onChange={e => handleFieldChange('idNumber', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
                placeholder="784-XXXX-XXXXXXX-X"
              />
            </div>
            <DayMonthYearDateInput
              label={isAr ? 'تاريخ الميلاد' : 'Date of Birth'}
              value={form.dateOfBirth}
              onChange={iso => handleFieldChange('dateOfBirth', iso)}
              isAr={isAr}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DayMonthYearDateInput
              label={isAr ? 'تاريخ إصدار الوثيقة' : 'ID Issue Date'}
              value={form.idIssueDate}
              onChange={iso => handleFieldChange('idIssueDate', iso)}
              isAr={isAr}
            />
            <DayMonthYearDateInput
              label={isAr ? 'تاريخ انتهاء الوثيقة' : 'ID Expiry Date'}
              value={form.idExpiryDate}
              onChange={iso => handleFieldChange('idExpiryDate', iso)}
              isExpired={isExpired(form.idExpiryDate)}
              isExpiringSoon={isExpiringSoon(form.idExpiryDate)}
              isAr={isAr}
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
          <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
            {isAr ? 'رخصة القيادة:' : 'Driving License:'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'رقم الرخصة' : 'License Number'} *</label>
              <input
                type="text" required value={form.licenseNumber}
                onChange={e => handleFieldChange('licenseNumber', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
                placeholder="DXB-XXXXXXX"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'جهة الإصدار' : 'Issued By'}</label>
              <input
                type="text" value={form.licenseIssuedBy}
                onChange={e => handleFieldChange('licenseIssuedBy', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
                placeholder="RTA Dubai"
              />
            </div>
            <DayMonthYearDateInput
              label={isAr ? 'تاريخ الإصدار' : 'Issue Date'}
              value={form.licenseIssueDate}
              onChange={iso => handleFieldChange('licenseIssueDate', iso)}
              isAr={isAr}
            />
          </div>
          <DayMonthYearDateInput
            label={isAr ? 'تاريخ الانتهاء' : 'Expiry Date'}
            value={form.licenseExpiryDate}
            onChange={iso => handleFieldChange('licenseExpiryDate', iso)}
            isExpired={isExpired(form.licenseExpiryDate)}
            isExpiringSoon={isExpiringSoon(form.licenseExpiryDate)}
            isAr={isAr}
            className="sm:w-1/3"
          />

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1">
            <input type="checkbox" checked={form.hasInternationalLicense} onChange={e => handleFieldChange('hasInternationalLicense', e.target.checked)} className="rounded border-zinc-700" />
            {isAr ? 'يملك رخصة قيادة دولية (International Driving Permit)' : 'Holds an International Driving Permit'}
          </label>

          {form.hasInternationalLicense && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'رقم الرخصة الدولية' : 'International License No.'}</label>
                <input
                  type="text" value={form.internationalLicenseNumber}
                  onChange={e => handleFieldChange('internationalLicenseNumber', e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'بلد الإصدار' : 'Issuing Country'}</label>
                <input
                  type="text" value={form.internationalLicenseCountry}
                  onChange={e => handleFieldChange('internationalLicenseCountry', e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
                />
              </div>
              <DayMonthYearDateInput
                label={isAr ? 'تاريخ الإصدار' : 'Issue Date'}
                value={form.internationalLicenseIssueDate}
                onChange={iso => handleFieldChange('internationalLicenseIssueDate', iso)}
                isAr={isAr}
              />
              <DayMonthYearDateInput
                label={isAr ? 'تاريخ الانتهاء' : 'Expiry Date'}
                value={form.internationalLicenseExpiryDate}
                onChange={iso => handleFieldChange('internationalLicenseExpiryDate', iso)}
                isExpired={isExpired(form.internationalLicenseExpiryDate)}
                isExpiringSoon={isExpiringSoon(form.internationalLicenseExpiryDate)}
                isAr={isAr}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'عنوان التسليم / الإقامة' : 'Delivery & Residential Address'}</label>
            <input
              type="text" value={form.address}
              onChange={e => handleFieldChange('address', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'ملاحظات وتفضيلات' : 'Notes & Preferences'}</label>
            <input
              type="text" value={form.notes}
              onChange={e => handleFieldChange('notes', e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            type="button" onClick={resetAndClose}
            className="px-4 py-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold transition-all"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit" disabled={submitting}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs lg:text-sm shadow-lg shadow-[#D4AF37]/25 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-60"
          >
            <UserPlus className="w-4 h-4" />
            <span>{submitting ? (isAr ? 'جاري التسجيل...' : 'Registering...') : (isAr ? 'تسجيل العميل' : 'Register Customer')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
