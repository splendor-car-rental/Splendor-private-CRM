import React, { useState, useRef } from 'react';
import { 
  Building2, User, Crown, Shield, Phone, Mail, MapPin, 
  UploadCloud, FileText, CheckCircle2, AlertTriangle, Trash2, 
  Eye, FileCheck, IdCard, Globe, Sparkles, X, Plus, ExternalLink,
  CreditCard, Stamp, Home, Paperclip, Award, Car, UserCheck
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Customer, CustomerUploadedDoc } from '../../types';
import { Modal } from '../common/Modal';
import { InternationalPhoneInput } from '../common/InternationalPhoneInput';
import { 
  ALL_COUNTRIES, UAE_EMIRATES, TRADE_LICENSE_ISSUING_AUTHORITIES, 
  ID_ISSUING_AUTHORITIES, DRIVING_LICENSE_ISSUING_AUTHORITIES,
  COMPANY_DOC_TYPES, INDIVIDUAL_DOC_TYPES
} from '../../lib/customerData';
import { uploadFile, formatFileSize } from '../../lib/upload';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ isOpen, onClose }) => {
  const { language, t } = useLanguage();
  const isAr = language === 'ar';
  const { addCustomer, checkDuplicateCustomer, showToast } = useCRM();

  // Registration Type: 'company' (Corporate) or 'individual' (Individual Private)
  const [customerType, setCustomerType] = useState<'company' | 'individual'>('company');
  const [isVIP, setIsVIP] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Customer[] | null>(null);

  // Common & Company Form Fields
  const [companyForm, setCompanyForm] = useState({
    companyName: '',
    tradeLicenseNumber: '',
    issuingAuthority: 'ded_dubai',
    customIssuingAuthority: '',
    address: 'Business Bay, Dubai, UAE',
    city: 'Dubai',
    country: 'United Arab Emirates',
    emirate: 'Dubai',
    taxRegistrationNumber: '', // TRN / VAT (رقم التسجيل الضريبي)
    authorizedPerson: '', // الشخص المفوض
    authorizedPersonDesignation: 'General Manager / المدير العام',
    phone: '+971 ',
    email: '',
    receiverName: '', // المستلم المفوض
    receiverPhone: '+971 ',
    notes: ''
  });

  // Individual Form Fields
  const [individualForm, setIndividualForm] = useState({
    fullName: '',
    nationality: 'United Arab Emirates',
    country: 'United Arab Emirates',
    emirate: 'Dubai',
    city: 'Dubai',
    address: 'Downtown Dubai, UAE',
    phone: '+971 ',
    email: '',

    // ID / Passport
    idType: 'emirates_id' as 'emirates_id' | 'passport' | 'gcc_id',
    idNumber: '',
    idIssuingAuthority: 'icp_uae',
    customIdAuthority: '',
    idIssueDate: new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0],
    idExpiryDate: new Date(Date.now() + 365 * 86400000 * 3).toISOString().split('T')[0],

    // Driving License
    licenseCategory: 'uae' as 'uae' | 'exempted_country' | 'international' | 'other',
    exemptedCountry: 'Saudi Arabia',
    licenseNumber: '',
    licenseCountry: 'United Arab Emirates',
    licenseIssuingAuthority: 'rta_dubai',
    customLicenseAuthority: '',
    licenseIssueDate: new Date(Date.now() - 365 * 86400000 * 2).toISOString().split('T')[0],
    licenseExpiryDate: new Date(Date.now() + 365 * 86400000 * 3).toISOString().split('T')[0],

    notes: ''
  });

  // Document Upload State
  const [selectedDocCategory, setSelectedDocCategory] = useState<string>('trade_license');
  const [docNotes, setDocNotes] = useState<string>('');
  const [uploadedDocsList, setUploadedDocsList] = useState<CustomerUploadedDoc[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick duplicate checker
  const handleCheckDuplicates = async (email: string, phone: string, lic?: string, idNum?: string) => {
    if (email.length > 4 || phone.length > 6) {
      try {
        const res = await checkDuplicateCustomer(email, phone, lic, idNum);
        if (res?.hasDuplicate) {
          setDuplicateWarning(res.matches);
        } else {
          setDuplicateWarning(null);
        }
      } catch (err) {
        console.warn('Duplicate check error:', err);
      }
    }
  };

  // Upload Document Handler (Accepts ANY file extension)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDoc(true);
    try {
      const res = await uploadFile(file, 'customer-documents');
      const docTypeObj = (customerType === 'company' ? COMPANY_DOC_TYPES : INDIVIDUAL_DOC_TYPES)
        .find(d => d.id === selectedDocCategory);

      const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';

      const newDoc: CustomerUploadedDoc = {
        id: 'DOC-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        type: selectedDocCategory,
        typeNameAr: docTypeObj?.nameAr || selectedDocCategory,
        typeNameEn: docTypeObj?.nameEn || selectedDocCategory,
        fileName: file.name,
        fileUrl: res.url,
        fileSize: formatFileSize(file.size),
        fileExtension: ext,
        uploadedAt: new Date().toISOString(),
        notes: docNotes
      };

      setUploadedDocsList(prev => [...prev, newDoc]);
      setDocNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast(isAr ? 'تم رفع المستند بنجاح' : 'Document Uploaded', `${file.name} (${ext})`);
    } catch (err: any) {
      console.error('File upload failed:', err);
      showToast(isAr ? 'خطأ في الرفع' : 'Upload Failed', err?.message || 'Error uploading file', 'error');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleRemoveDoc = (docId: string) => {
    setUploadedDocsList(prev => prev.filter(d => d.id !== docId));
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let customerPayload: Partial<Customer>;

      if (customerType === 'company') {
        const issuingAuthorityFinal = companyForm.issuingAuthority === 'other'
          ? companyForm.customIssuingAuthority || 'Custom Authority'
          : TRADE_LICENSE_ISSUING_AUTHORITIES.find(a => a.id === companyForm.issuingAuthority)?.nameAr || companyForm.issuingAuthority;

        customerPayload = {
          type: 'corporate',
          fullName: companyForm.companyName,
          companyName: companyForm.companyName,
          email: companyForm.email,
          phone: companyForm.phone,
          address: companyForm.address,
          city: companyForm.city,
          country: companyForm.country,
          emirate: companyForm.country === 'United Arab Emirates' ? companyForm.emirate : undefined,
          nationality: 'United Arab Emirates',
          isVIP: isVIP,
          
          // Corporate details
          tradeLicenseNumber: companyForm.tradeLicenseNumber,
          tradeLicenseIssuingAuthority: issuingAuthorityFinal,
          taxRegistrationNumber: companyForm.taxRegistrationNumber,
          trnNumber: companyForm.taxRegistrationNumber,
          authorizedPerson: companyForm.authorizedPerson,
          authorizedPersonDesignation: companyForm.authorizedPersonDesignation,
          receiverName: companyForm.receiverName,
          receiverPhone: companyForm.receiverPhone,

          // Identifiers placeholder for database consistency
          idType: 'emirates_id',
          idNumber: companyForm.tradeLicenseNumber,
          idExpiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
          licenseNumber: companyForm.tradeLicenseNumber,
          licenseCountry: companyForm.country,
          licenseExpiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],

          uploadedDocs: uploadedDocsList,
          tags: isVIP ? ['Corporate VIP', 'Direct License'] : ['Corporate Client'],
          notes: companyForm.notes || (isAr ? 'عميل شركة تم تسجيله بالرخصة التجارية' : 'Corporate customer onboarded with trade license')
        };
      } else {
        // Individual
        const idAuthorityFinal = individualForm.idIssuingAuthority === 'other_authority'
          ? individualForm.customIdAuthority || 'Foreign Passport Authority'
          : ID_ISSUING_AUTHORITIES.find(a => a.id === individualForm.idIssuingAuthority)?.nameAr || individualForm.idIssuingAuthority;

        const licenseAuthorityFinal = individualForm.licenseIssuingAuthority === 'other_traffic_dept'
          ? individualForm.customLicenseAuthority || 'Foreign Traffic Authority'
          : DRIVING_LICENSE_ISSUING_AUTHORITIES.find(a => a.id === individualForm.licenseIssuingAuthority)?.nameAr || individualForm.licenseIssuingAuthority;

        customerPayload = {
          type: isVIP ? 'vip' : 'individual',
          fullName: individualForm.fullName,
          email: individualForm.email,
          phone: individualForm.phone,
          nationality: individualForm.nationality,
          country: individualForm.country,
          emirate: individualForm.country === 'United Arab Emirates' ? individualForm.emirate : undefined,
          city: individualForm.country === 'United Arab Emirates' ? individualForm.emirate : individualForm.city,
          address: individualForm.address,
          isVIP: isVIP,

          // IDs
          idType: individualForm.idType,
          idNumber: individualForm.idNumber,
          idIssuingAuthority: idAuthorityFinal,
          idIssueDate: individualForm.idIssueDate,
          idExpiryDate: individualForm.idExpiryDate,

          // Driving License
          licenseCategory: individualForm.licenseCategory,
          exemptedCountry: individualForm.licenseCategory === 'exempted_country' ? individualForm.exemptedCountry : undefined,
          licenseNumber: individualForm.licenseNumber,
          licenseCountry: individualForm.licenseCategory === 'uae' ? 'United Arab Emirates' : (individualForm.licenseCategory === 'exempted_country' ? individualForm.exemptedCountry : individualForm.licenseCountry),
          licenseIssuingAuthority: licenseAuthorityFinal,
          licenseIssueDate: individualForm.licenseIssueDate,
          licenseExpiryDate: individualForm.licenseExpiryDate,

          uploadedDocs: uploadedDocsList,
          tags: isVIP ? ['VIP Individual', 'Priority Service'] : ['Individual Client'],
          notes: individualForm.notes || (isAr ? 'عميل فرد تم تسجيله بالهوية والرخصة' : 'Individual customer onboarded with ID and Driving License')
        };
      }

      await addCustomer(customerPayload);
      showToast(
        isAr ? 'تم تسجيل العميل بنجاح' : 'Customer Registered Successfully',
        `${customerPayload.fullName} (${customerType === 'company' ? (isAr ? 'شركة' : 'Company') : (isAr ? 'فرد' : 'Individual')})`
      );
      onClose();
    } catch (err: any) {
      console.error('Customer registration failed:', err);
      showToast(isAr ? 'خطأ في التسجيل' : 'Registration Error', err?.message || 'Failed to save customer', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? 'تسجيل عميل جديد (شركة / فرد)' : 'Register New Customer (Corporate / Individual)'}
      subtitle={isAr ? 'إدخال البيانات الرسمية، الرخص والمستندات مع دعم كامل لكافة الامتدادات واللوائح المرورية' : 'Register official corporate or private customer credentials, license validations and multi-format documents'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6 text-xs text-zinc-300">
        
        {/* TOP SELECTOR: Company vs Individual + VIP Toggle */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setCustomerType('company');
                setSelectedDocCategory('trade_license');
              }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all text-xs ${
                customerType === 'company'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 shadow-md shadow-[#D4AF37]/20 scale-102'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>{isAr ? '1. عميل شركة (Corporate / Company)' : '1. Corporate / Company'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCustomerType('individual');
                setSelectedDocCategory('emirates_id');
              }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all text-xs ${
                customerType === 'individual'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 shadow-md shadow-[#D4AF37]/20 scale-102'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <User className="w-4 h-4" />
              <span>{isAr ? '2. عميل فرد (Individual Private)' : '2. Individual / Private'}</span>
            </button>
          </div>

          <label className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800/80 cursor-pointer hover:border-[#D4AF37]/40 transition-all select-none">
            <input
              type="checkbox"
              checked={isVIP}
              onChange={(e) => setIsVIP(e.target.checked)}
              className="w-4 h-4 accent-[#D4AF37] rounded"
            />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#f5d97f]">
              <Crown className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{isAr ? 'تصنيف كبار الشخصيات VIP' : 'VIP Priority Account'}</span>
            </div>
          </label>
        </div>

        {/* Duplicate warning alert */}
        {duplicateWarning && duplicateWarning.length > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {isAr ? 'تنبيه: تم العثور على سجل مطابق مسبقاً في قاعدة البيانات!' : 'Duplicate Alert: Existing record matched!'}
              </p>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                {duplicateWarning.map(m => `${m.fullName} (${m.phone} • ${m.email})`).join(' | ')}
              </p>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 1: CORPORATE / COMPANY FORM FIELDS               */}
        {/* ========================================================= */}
        {customerType === 'company' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[#f5d97f] border-b border-zinc-800 pb-2">
                <Building2 className="w-4 h-4 text-[#D4AF37]" />
                <span>{isAr ? 'البيانات الرسمية للشركة والرخصة التجارية' : 'Company Official Credentials & Trade License'}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Company Name */}
                <div className="md:col-span-2">
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'اسم الشركة *' : 'Company Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={companyForm.companyName}
                    onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder={isAr ? 'مثال: شركة النجم للتجارة العامة ذ.م.م' : 'e.g. Apex Luxury Real Estate LLC'}
                  />
                </div>

                {/* Trade License Number */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'رقم الرخصة التجارية *' : 'Trade License Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={companyForm.tradeLicenseNumber}
                    onChange={(e) => {
                      setCompanyForm({ ...companyForm, tradeLicenseNumber: e.target.value });
                      handleCheckDuplicates(companyForm.email, companyForm.phone, e.target.value);
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder="e.g. 1029384 / CN-998811"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Issuing Authority */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'الجهة المصدرة للرخصة *' : 'License Issuing Authority *'}
                  </label>
                  <select
                    value={companyForm.issuingAuthority}
                    onChange={(e) => setCompanyForm({ ...companyForm, issuingAuthority: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
                  >
                    {TRADE_LICENSE_ISSUING_AUTHORITIES.map((auth) => (
                      <option key={auth.id} value={auth.id}>
                        {isAr ? auth.nameAr : auth.nameEn}
                      </option>
                    ))}
                  </select>

                  {companyForm.issuingAuthority === 'other' && (
                    <input
                      type="text"
                      required
                      value={companyForm.customIssuingAuthority}
                      onChange={(e) => setCompanyForm({ ...companyForm, customIssuingAuthority: e.target.value })}
                      className="w-full mt-2 px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-[#D4AF37]/50 text-zinc-100 text-xs focus:outline-none"
                      placeholder={isAr ? 'أدخل اسم الجهة المصدرة يدوياً...' : 'Enter custom authority name...'}
                    />
                  )}
                </div>

                {/* Tax Registration Number (TRN / VAT) */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'رقم التسجيل الضريبي (TRN / VAT)' : 'Tax Registration Number (TRN / VAT)'}
                  </label>
                  <input
                    type="text"
                    value={companyForm.taxRegistrationNumber}
                    onChange={(e) => setCompanyForm({ ...companyForm, taxRegistrationNumber: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder="100XXXXXXXXX003 (15 digits)"
                  />
                </div>
              </div>

              {/* Authorized Person & Contact Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-zinc-800/80">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'الشخص المفوض بالتوقيع *' : 'Authorized Signatory Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={companyForm.authorizedPerson}
                    onChange={(e) => setCompanyForm({ ...companyForm, authorizedPerson: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder={isAr ? 'الاسم الكامل للمدير المفوض' : 'e.g. Johnathan Vance'}
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'صفة / منصب المفوض' : 'Signatory Designation'}
                  </label>
                  <input
                    type="text"
                    value={companyForm.authorizedPersonDesignation}
                    onChange={(e) => setCompanyForm({ ...companyForm, authorizedPersonDesignation: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'البريد الإلكتروني للشركة *' : 'Company Email *'}
                  </label>
                  <input
                    type="email"
                    required
                    value={companyForm.email}
                    onChange={(e) => {
                      setCompanyForm({ ...companyForm, email: e.target.value });
                      handleCheckDuplicates(e.target.value, companyForm.phone, companyForm.tradeLicenseNumber);
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder="corp@domain.com"
                  />
                </div>
              </div>

              {/* Phone & Receiver Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <InternationalPhoneInput
                    value={companyForm.phone}
                    onChange={(val) => {
                      setCompanyForm({ ...companyForm, phone: val });
                      handleCheckDuplicates(companyForm.email, val, companyForm.tradeLicenseNumber);
                    }}
                    label={isAr ? 'رقم الهاتف الرسمي للشركة *' : 'Official Phone Number *'}
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'اسم المستلم / السائق المفوض (اختياري)' : 'Designated Receiver / Driver'}
                  </label>
                  <input
                    type="text"
                    value={companyForm.receiverName}
                    onChange={(e) => setCompanyForm({ ...companyForm, receiverName: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder={isAr ? 'اسم السائق أو مندوب الاستلام' : 'Driver / Delivery Receiver'}
                  />
                </div>

                <div>
                  <InternationalPhoneInput
                    value={companyForm.receiverPhone}
                    onChange={(val) => setCompanyForm({ ...companyForm, receiverPhone: val })}
                    label={isAr ? 'هاتف المستلم / السائق' : 'Receiver Phone'}
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  {isAr ? 'العنوان والمقر الرئيسي للشركة *' : 'Company Address & Office Location *'}
                </label>
                <input
                  type="text"
                  required
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                  placeholder="e.g. Office 1402, Al Saada Tower, Business Bay, Dubai, UAE"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 2: INDIVIDUAL PRIVATE CUSTOMER FORM               */}
        {/* ========================================================= */}
        {customerType === 'individual' && (
          <div className="space-y-4">
            
            {/* Personal Details */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#f5d97f] border-b border-zinc-800 pb-2">
                <User className="w-4 h-4 text-[#D4AF37]" />
                <span>{isAr ? 'البيانات الشخصية والإقامة' : 'Personal Profile & Address'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Full Name */}
                <div className="sm:col-span-2">
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'الاسم الكامل *' : 'Full Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={individualForm.fullName}
                    onChange={(e) => setIndividualForm({ ...individualForm, fullName: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder={isAr ? 'الاسم كما هو مدون في الهوية أو جواز السفر' : 'Name as per official passport/ID'}
                  />
                </div>

                {/* Nationality */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'الجنسية *' : 'Nationality *'}
                  </label>
                  <select
                    value={individualForm.nationality}
                    onChange={(e) => setIndividualForm({ ...individualForm, nationality: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
                  >
                    {ALL_COUNTRIES.map((c) => (
                      <option key={c.iso} value={c.name}>
                        {c.flag} {isAr ? `${c.nationalityAr} (${c.nameAr})` : `${c.nationalityEn} (${c.name})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Country & Emirate Dynamic Rule */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Country */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'الدولة *' : 'Country of Residence *'}
                  </label>
                  <select
                    value={individualForm.country}
                    onChange={(e) => {
                      const newCountry = e.target.value;
                      setIndividualForm({
                        ...individualForm,
                        country: newCountry,
                        emirate: newCountry === 'United Arab Emirates' ? 'Dubai' : ''
                      });
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
                  >
                    {ALL_COUNTRIES.map((c) => (
                      <option key={'country_' + c.iso} value={c.name}>
                        {c.flag} {isAr ? c.nameAr : c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Emirate Dropdown (Shows ONLY if UAE is selected) */}
                {individualForm.country === 'United Arab Emirates' ? (
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      {isAr ? 'الإمارة *' : 'Emirate *'}
                    </label>
                    <select
                      value={individualForm.emirate}
                      onChange={(e) => setIndividualForm({ ...individualForm, emirate: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-[#D4AF37]/60 text-zinc-100 focus:outline-none cursor-pointer"
                    >
                      {UAE_EMIRATES.map((em) => (
                        <option key={em.id} value={em.id}>
                          {isAr ? em.nameAr : em.nameEn}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      {isAr ? 'المدينة / المنطقة' : 'City / State'}
                    </label>
                    <input
                      type="text"
                      value={individualForm.city}
                      onChange={(e) => setIndividualForm({ ...individualForm, city: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                      placeholder="e.g. London / Riyadh / New York"
                    />
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'البريد الإلكتروني *' : 'Email Address *'}
                  </label>
                  <input
                    type="email"
                    required
                    value={individualForm.email}
                    onChange={(e) => {
                      setIndividualForm({ ...individualForm, email: e.target.value });
                      handleCheckDuplicates(e.target.value, individualForm.phone, individualForm.licenseNumber, individualForm.idNumber);
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder="client@vip.com"
                  />
                </div>
              </div>

              {/* Phone & Address */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <InternationalPhoneInput
                    value={individualForm.phone}
                    onChange={(val) => {
                      setIndividualForm({ ...individualForm, phone: val });
                      handleCheckDuplicates(individualForm.email, val, individualForm.licenseNumber, individualForm.idNumber);
                    }}
                    label={isAr ? 'رقم الهاتف (مع الرمز الدولي) *' : 'Phone Number *'}
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'العنوان / مكان الإقامة *' : 'Address / Residence / Hotel *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={individualForm.address}
                    onChange={(e) => setIndividualForm({ ...individualForm, address: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder={isAr ? 'مثال: برج العرب - جناح 201 / فيلا 18 نخلة جميرا' : 'e.g. Palm Jumeirah Villa 42, Dubai'}
                  />
                </div>
              </div>
            </div>

            {/* Identification & Passport Details */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#f5d97f] border-b border-zinc-800 pb-2">
                <IdCard className="w-4 h-4 text-[#D4AF37]" />
                <span>{isAr ? 'بيانات الهوية أو جواز السفر' : 'ID or Passport Official Credentials'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                {/* ID Type */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'نوع الوثيقة *' : 'Document Type *'}
                  </label>
                  <select
                    value={individualForm.idType}
                    onChange={(e) => setIndividualForm({ ...individualForm, idType: e.target.value as any })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
                  >
                    <option value="emirates_id">{isAr ? 'الهوية الإماراتية (Emirates ID)' : 'Emirates ID'}</option>
                    <option value="passport">{isAr ? 'جواز سفر دولي (Passport)' : 'International Passport'}</option>
                    <option value="gcc_id">{isAr ? 'هوية وطنية خليجية (GCC National ID)' : 'GCC National ID'}</option>
                  </select>
                </div>

                {/* Document Number */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'رقم الهوية أو جواز السفر *' : 'ID or Passport Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={individualForm.idNumber}
                    onChange={(e) => {
                      setIndividualForm({ ...individualForm, idNumber: e.target.value });
                      handleCheckDuplicates(individualForm.email, individualForm.phone, individualForm.licenseNumber, e.target.value);
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder={individualForm.idType === 'emirates_id' ? '784-1990-XXXXXXX-1' : 'P12345678'}
                  />
                </div>

                {/* Issue Date */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'تاريخ الإصدار' : 'Issue Date'}
                  </label>
                  <input
                    type="date"
                    value={individualForm.idIssueDate}
                    onChange={(e) => setIndividualForm({ ...individualForm, idIssueDate: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                  />
                </div>

                {/* Expiry Date */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'تاريخ الانتهاء *' : 'Expiry Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={individualForm.idExpiryDate}
                    onChange={(e) => setIndividualForm({ ...individualForm, idExpiryDate: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                  />
                </div>
              </div>

              {/* Issuing Authority */}
              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  {isAr ? 'جهة إصدار الهوية أو جواز السفر' : 'ID / Passport Issuing Authority'}
                </label>
                <select
                  value={individualForm.idIssuingAuthority}
                  onChange={(e) => setIndividualForm({ ...individualForm, idIssuingAuthority: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
                >
                  {ID_ISSUING_AUTHORITIES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {isAr ? a.nameAr : a.nameEn}
                    </option>
                  ))}
                </select>

                {individualForm.idIssuingAuthority === 'other_authority' && (
                  <input
                    type="text"
                    value={individualForm.customIdAuthority}
                    onChange={(e) => setIndividualForm({ ...individualForm, customIdAuthority: e.target.value })}
                    className="w-full mt-2 px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-[#D4AF37]/50 text-zinc-100 text-xs focus:outline-none"
                    placeholder={isAr ? 'أدخل اسم جهة إصدار الهوية / الجواز...' : 'Enter custom ID authority...'}
                  />
                )}
              </div>
            </div>

            {/* Driving License & Dubai RTA Compliance */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#f5d97f] border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-[#D4AF37]" />
                  <span>{isAr ? 'بيانات رخصة القيادة واعتماد هيئة الطرق والمواصلات (RTA)' : 'Driving License & Dubai RTA Compliance'}</span>
                </div>
                <span className="text-[11px] text-zinc-400 font-normal">
                  {isAr ? 'مطابق لقوانين تأجير السيارات في دبي' : 'Compliant with Dubai Rental Regulations'}
                </span>
              </div>

              {/* License Category Selection */}
              <div>
                <label className="block text-zinc-300 font-medium mb-1.5">
                  {isAr ? 'فئة وتصنيف رخصة القيادة *' : 'Driving License Classification *'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setIndividualForm({ ...individualForm, licenseCategory: 'uae', licenseCountry: 'United Arab Emirates' })}
                    className={`p-2.5 rounded-xl text-start border transition-all ${
                      individualForm.licenseCategory === 'uae'
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#f5d97f]'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <p className="font-bold text-xs flex items-center gap-1.5">
                      <span>🇦🇪</span>
                      <span>{isAr ? 'رخصة إماراتية' : 'UAE License'}</span>
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{isAr ? 'صادرة من RTA أو إمارات الدولة' : 'Issued by UAE Authorities'}</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIndividualForm({ ...individualForm, licenseCategory: 'exempted_country' })}
                    className={`p-2.5 rounded-xl text-start border transition-all ${
                      individualForm.licenseCategory === 'exempted_country'
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#f5d97f]'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <p className="font-bold text-xs flex items-center gap-1.5">
                      <span>⭐</span>
                      <span>{isAr ? 'الدول المستثناة في دبي' : 'RTA Exempted'}</span>
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{isAr ? 'الخليج، أمريكا، بريطانيا، أوروبا...' : 'GCC, US, UK, EU, JP...'}</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIndividualForm({ ...individualForm, licenseCategory: 'international' })}
                    className={`p-2.5 rounded-xl text-start border transition-all ${
                      individualForm.licenseCategory === 'international'
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#f5d97f]'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <p className="font-bold text-xs flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-sky-400" />
                      <span>{isAr ? 'رخصة دولية (IDP)' : 'International IDP'}</span>
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{isAr ? 'رخصة دولية مع الأصلية' : 'IDP with National License'}</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIndividualForm({ ...individualForm, licenseCategory: 'other' })}
                    className={`p-2.5 rounded-xl text-start border transition-all ${
                      individualForm.licenseCategory === 'other'
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#f5d97f]'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <p className="font-bold text-xs flex items-center gap-1.5">
                      <span>🚗</span>
                      <span>{isAr ? 'رخصة دولة أخرى' : 'Other National'}</span>
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{isAr ? 'تتطلب رخصة دولية مصاحبة' : 'Requires accompanying IDP'}</p>
                  </button>
                </div>
              </div>

              {/* If Exempted Country is chosen, show the Dubai RTA Approved Country Selector */}
              {individualForm.licenseCategory === 'exempted_country' && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1.5">
                  <label className="block text-emerald-200 font-semibold text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isAr ? 'اختر الدولة المعتمدة للقيادة المباشرة في دبي دون رخصة دولية:' : 'Select RTA Approved Country Permitted to Drive Directly:'}</span>
                  </label>
                  <select
                    value={individualForm.exemptedCountry}
                    onChange={(e) => setIndividualForm({ ...individualForm, exemptedCountry: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-emerald-500/50 text-zinc-100 font-medium focus:outline-none"
                  >
                    {ALL_COUNTRIES.filter(c => c.isRtaExempted).map((c) => (
                      <option key={'exempt_' + c.iso} value={c.name}>
                        {c.flag} {isAr ? c.nameAr : c.name} {c.isGCC ? `(دول مجلس التعاون)` : `(معتمدة RTA)`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* License Number */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'رقم رخصة القيادة *' : 'Driving License Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={individualForm.licenseNumber}
                    onChange={(e) => {
                      setIndividualForm({ ...individualForm, licenseNumber: e.target.value });
                      handleCheckDuplicates(individualForm.email, individualForm.phone, e.target.value, individualForm.idNumber);
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:border-[#D4AF37]/60 focus:outline-none"
                    placeholder="DXB-889900 / 12345678"
                  />
                </div>

                {/* Issue Date */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'تاريخ إصدار الرخصة' : 'License Issue Date'}
                  </label>
                  <input
                    type="date"
                    value={individualForm.licenseIssueDate}
                    onChange={(e) => setIndividualForm({ ...individualForm, licenseIssueDate: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                  />
                </div>

                {/* Expiry Date */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    {isAr ? 'تاريخ انتهاء الرخصة *' : 'License Expiry Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={individualForm.licenseExpiryDate}
                    onChange={(e) => setIndividualForm({ ...individualForm, licenseExpiryDate: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                  />
                </div>
              </div>

              {/* License Issuing Authority */}
              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  {isAr ? 'جهة إصدار رخصة القيادة' : 'License Issuing Authority'}
                </label>
                <select
                  value={individualForm.licenseIssuingAuthority}
                  onChange={(e) => setIndividualForm({ ...individualForm, licenseIssuingAuthority: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
                >
                  {DRIVING_LICENSE_ISSUING_AUTHORITIES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {isAr ? a.nameAr : a.nameEn}
                    </option>
                  ))}
                </select>

                {individualForm.licenseIssuingAuthority === 'other_traffic_dept' && (
                  <input
                    type="text"
                    value={individualForm.customLicenseAuthority}
                    onChange={(e) => setIndividualForm({ ...individualForm, customLicenseAuthority: e.target.value })}
                    className="w-full mt-2 px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-[#D4AF37]/50 text-zinc-100 text-xs focus:outline-none"
                    placeholder={isAr ? 'أدخل اسم إدارة المرور يدوياً...' : 'Enter custom traffic authority...'}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 3: MULTI-FORMAT DOCUMENT UPLOAD WITH DROPDOWN     */}
        {/* ========================================================= */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#f5d97f] border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-[#D4AF37]" />
              <span>
                {customerType === 'company' 
                  ? (isAr ? 'رفع مستندات الشركة (الرخصة التجارية، شهادة الضريبة، هوية المالك والمفوض والمستلم)' : 'Corporate Documents Upload (Trade License, VAT, IDs)')
                  : (isAr ? 'رفع مستندات العميل الفرد (الهوية، الجواز، رخصة القيادة، الرخصة الدولية)' : 'Individual Documents Upload (ID, Passport, Driving License)')
                }
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 font-normal">
              {isAr ? 'يدعم كافة أنواع الملفات (PDF, JPG, PNG, WEBP, DOCX, إلخ)' : 'Supports all file formats (PDF, JPG, PNG, WEBP, DOCX)'}
            </span>
          </div>

          {/* Upload Row: Dropdown selector + Notes + Upload Trigger Button */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-4">
              <label className="block text-zinc-300 font-medium mb-1">
                {isAr ? 'نوع المستند المرفوع *' : 'Document Type *'}
              </label>
              <select
                value={selectedDocCategory}
                onChange={(e) => setSelectedDocCategory(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
              >
                {(customerType === 'company' ? COMPANY_DOC_TYPES : INDIVIDUAL_DOC_TYPES).map((d) => (
                  <option key={d.id} value={d.id}>
                    {isAr ? d.nameAr : d.nameEn} {d.required ? `*` : `(اختياري)`}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-5">
              <label className="block text-zinc-300 font-medium mb-1">
                {isAr ? 'ملاحظات المستند (اختياري)' : 'Document Notes (Optional)'}
              </label>
              <input
                type="text"
                value={docNotes}
                onChange={(e) => setDocNotes(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-[#D4AF37]/60 focus:outline-none"
                placeholder={isAr ? 'مثال: النسخة المصدقة لعام 2026' : 'e.g. Attested copy 2026'}
              />
            </div>

            <div className="sm:col-span-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept="*/*"
              />
              <button
                type="button"
                disabled={uploadingDoc}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3.5 rounded-xl bg-zinc-800 hover:bg-[#D4AF37] text-zinc-200 hover:text-zinc-950 font-bold transition-all flex items-center justify-center gap-2 border border-zinc-700 hover:border-[#D4AF37] shadow-sm disabled:opacity-50"
              >
                <UploadCloud className="w-4 h-4" />
                <span>{uploadingDoc ? (isAr ? 'جاري الرفع...' : 'Uploading...') : (isAr ? 'اختر الملف وارفعه' : 'Choose & Upload')}</span>
              </button>
            </div>
          </div>

          {/* Uploaded Documents Table/List */}
          {uploadedDocsList.length > 0 ? (
            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <p className="text-[11px] font-semibold text-zinc-400">
                {isAr ? `المستندات المرفوعة المعتمدة (${uploadedDocsList.length}):` : `Uploaded Documents (${uploadedDocsList.length}):`}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {uploadedDocsList.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/90 flex items-center justify-between gap-2.5 hover:border-[#D4AF37]/40 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 text-[#f5d97f] font-mono text-[10px] font-bold">
                        {doc.fileExtension || 'FILE'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200 truncate">
                          {isAr ? doc.typeNameAr : doc.typeNameEn}
                        </p>
                        <p className="text-[10px] text-zinc-400 truncate">
                          {doc.fileName} {doc.fileSize ? `• ${doc.fileSize}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {doc.fileUrl && (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-[#f5d97f] transition-all"
                          title={isAr ? 'معاينة المستند' : 'Preview'}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveDoc(doc.id)}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-all"
                        title={isAr ? 'حذف المستند' : 'Delete'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-zinc-950/40 border border-dashed border-zinc-800 text-center text-zinc-500 text-xs">
              {isAr ? 'لم يتم رفع مستندات بعد. اختر نوع المستند من القائمة واضغط على زر الرفع.' : 'No documents uploaded yet. Select the type from the dropdown above and click upload.'}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold transition-all"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs lg:text-sm shadow-lg shadow-[#D4AF37]/25 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {submitting
                ? (isAr ? 'جاري الحفظ والتسجيل...' : 'Saving Customer...')
                : (customerType === 'company' 
                    ? (isAr ? 'حفظ وتسجيل عميل الشركة' : 'Register Corporate Customer') 
                    : (isAr ? 'حفظ وتسجيل العميل الفرد' : 'Register Individual Customer')
                  )
              }
            </span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
