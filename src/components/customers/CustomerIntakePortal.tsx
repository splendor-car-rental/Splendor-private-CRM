import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, ShieldCheck, UserRound, X } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { getCountryOptions } from '../../config/countryOptions';
import {
  getVisitorLicenceGuidance,
  visitorLicenceGuidanceLabel,
  RTA_VISITOR_LICENCE_GUIDANCE_VERIFIED_AT
} from '../../config/visitorDrivingLicence';

const fieldClass = 'w-full rounded-xl border border-sky-500/25 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10';
const labelClass = 'mb-1.5 block text-xs font-bold text-sky-100/80';

type IntakeMode = 'individual' | 'corporate';

type IntakeState = {
  mode: IntakeMode;
  fullName: string;
  fullNameAr: string;
  email: string;
  phoneCountry: string;
  phoneLocal: string;
  nationality: string;
  address: string;
  city: string;
  residenceCountry: string;
  idType: 'emirates_id' | 'passport' | 'gcc_id';
  idNumber: string;
  idIssueDate: string;
  idExpiryDate: string;
  idIssuedBy: string;
  licenseType: 'uae' | 'international' | 'gcc';
  licenseNumber: string;
  licenseIssueDate: string;
  licenseExpiryDate: string;
  licenseCountry: string;
  homeLicenseNumber: string;
  homeLicenseIssueDate: string;
  homeLicenseExpiryDate: string;
  homeLicenseCountry: string;
  companyName: string;
  companyNameAr: string;
  tradeLicenseNumber: string;
  tradeLicenseIssueDate: string;
  tradeLicenseExpiryDate: string;
  tradeLicenseIssuedBy: string;
  companyOwnerName: string;
  responsibleManagerName: string;
  companyPhoneCountry: string;
  companyPhoneLocal: string;
  companyAddress: string;
  companyTrn: string;
  companyEmail: string;
};

const initialState: IntakeState = {
  mode: 'individual', fullName: '', fullNameAr: '', email: '', phoneCountry: 'AE', phoneLocal: '', nationality: 'AE', address: '', city: 'Dubai', residenceCountry: 'AE',
  idType: 'emirates_id', idNumber: '', idIssueDate: '', idExpiryDate: '', idIssuedBy: 'AE',
  licenseType: 'uae', licenseNumber: '', licenseIssueDate: '', licenseExpiryDate: '', licenseCountry: 'AE',
  homeLicenseNumber: '', homeLicenseIssueDate: '', homeLicenseExpiryDate: '', homeLicenseCountry: 'AE',
  companyName: '', companyNameAr: '', tradeLicenseNumber: '', tradeLicenseIssueDate: '', tradeLicenseExpiryDate: '', tradeLicenseIssuedBy: 'AE',
  companyOwnerName: '', responsibleManagerName: '', companyPhoneCountry: 'AE', companyPhoneLocal: '', companyAddress: '', companyTrn: '', companyEmail: ''
};

export const CustomerIntakePortal: React.FC = () => {
  const { language, t } = useLanguage();
  const { activeView, addCustomer, checkDuplicateCustomer, showToast } = useCRM();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<IntakeState>(initialState);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; fullName: string; phone: string }>>([]);
  const countries = useMemo(() => getCountryOptions(language === 'ar' ? 'ar' : 'en'), [language]);
  const countryByCode = useMemo(() => new Map(countries.map(c => [c.code, c])), [countries]);

  useEffect(() => {
    if (activeView !== 'customers') return;
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button');
      if (!button || button.closest('[data-customer-intake-root]')) return;
      const text = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const matches = text.includes('تسجيل عميل جديد') || text.includes('تسجيل عميل مميز جديد') || text.includes('new customer') || text.includes('register vip customer') || text === String(t('newCustomer')).toLowerCase();
      if (!matches) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpen(true);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [activeView, t]);

  const set = <K extends keyof IntakeState>(key: K, value: IntakeState[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const phone = `${countryByCode.get(form.phoneCountry)?.dialCode || '+971'}${form.phoneLocal.replace(/\D/g, '')}`;
  const companyPhone = `${countryByCode.get(form.companyPhoneCountry)?.dialCode || '+971'}${form.companyPhoneLocal.replace(/\D/g, '')}`;
  const countryName = (code: string) => countryByCode.get(code)?.label || code;

  const duplicateCheck = async () => {
    const email = form.mode === 'corporate' ? form.companyEmail : form.email;
    const phoneValue = form.mode === 'corporate' ? companyPhone : phone;
    if (email.length < 5 && phoneValue.length < 7) return;
    try {
      const licence = form.licenseNumber || form.homeLicenseNumber;
      const result = await checkDuplicateCustomer(email, phoneValue, licence, form.idNumber);
      setDuplicates((result.matches || []).map(({ id, fullName, phone }) => ({ id, fullName, phone })));
    } catch {
      // A duplicate-check outage must never manufacture an empty authoritative
      // result. It only removes the advisory UI; the server still owns the
      // duplicate/security gates when the record is submitted.
      setDuplicates([]);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (form.mode === 'individual') {
        await addCustomer({
          type: 'individual',
          fullName: form.fullName.trim(),
          fullNameAr: form.fullNameAr.trim(),
          email: form.email.trim(),
          phone,
          whatsapp: phone,
          address: form.address.trim(),
          city: form.city.trim() || 'Dubai',
          country: countryName(form.residenceCountry),
          nationality: countryName(form.nationality),
          idType: form.idType,
          idNumber: form.idNumber.trim(),
          idExpiryDate: form.idExpiryDate,
          licenseNumber: form.licenseNumber.trim(),
          licenseCountry: countryName(form.licenseCountry),
          licenseExpiryDate: form.licenseExpiryDate,
          source: 'manual',
          isVIP: false,
          tags: [],
          notes: '',
          customFields: {
            identityIssueDate: form.idIssueDate,
            identityIssuedBy: countryName(form.idIssuedBy),
            drivingLicenseType: form.licenseType,
            drivingLicenseIssueDate: form.licenseIssueDate,
            phoneCountryCode: countryByCode.get(form.phoneCountry)?.dialCode || '+971',
            homeCountryDrivingLicenseNumber: form.homeLicenseNumber.trim(),
            homeCountryDrivingLicenseCountry: form.homeLicenseNumber ? countryName(form.homeLicenseCountry) : '',
            homeCountryDrivingLicenseCountryCode: form.homeLicenseNumber ? form.homeLicenseCountry : '',
            homeCountryDrivingLicenseIssueDate: form.homeLicenseIssueDate,
            homeCountryDrivingLicenseExpiryDate: form.homeLicenseExpiryDate,
            visitorLicenceGuidance: form.homeLicenseNumber ? getVisitorLicenceGuidance(form.homeLicenseCountry) : undefined,
            visitorLicenceGuidanceVerifiedAt: form.homeLicenseNumber ? RTA_VISITOR_LICENCE_GUIDANCE_VERIFIED_AT : undefined
          }
        });
      } else {
        await addCustomer({
          type: 'corporate',
          fullName: form.responsibleManagerName.trim() || form.companyOwnerName.trim() || form.companyName.trim(),
          companyName: form.companyName.trim(),
          email: form.companyEmail.trim(),
          phone: companyPhone,
          whatsapp: companyPhone,
          address: form.companyAddress.trim(),
          city: 'Dubai',
          country: countryName(form.tradeLicenseIssuedBy),
          nationality: countryName(form.tradeLicenseIssuedBy),
          idType: 'passport',
          idNumber: form.tradeLicenseNumber.trim(),
          idExpiryDate: form.tradeLicenseExpiryDate,
          licenseNumber: form.tradeLicenseNumber.trim(),
          licenseCountry: countryName(form.tradeLicenseIssuedBy),
          licenseExpiryDate: form.tradeLicenseExpiryDate,
          source: 'corporate',
          isVIP: false,
          tags: ['Corporate'],
          notes: '',
          customFields: {
            entityType: 'company',
            legalCompanyNameAr: form.companyNameAr.trim(),
            tradeLicenseNumber: form.tradeLicenseNumber,
            tradeLicenseIssueDate: form.tradeLicenseIssueDate,
            tradeLicenseExpiryDate: form.tradeLicenseExpiryDate,
            tradeLicenseIssuedBy: countryName(form.tradeLicenseIssuedBy),
            companyOwnerName: form.companyOwnerName,
            responsibleManagerName: form.responsibleManagerName,
            taxRegistrationNumber: form.companyTrn,
            phoneCountryCode: countryByCode.get(form.companyPhoneCountry)?.dialCode || '+971'
          }
        });
      }
      showToast(language === 'ar' ? 'تم تسجيل العميل' : 'Customer Registered', language === 'ar' ? 'تم حفظ البيانات بنجاح ويمكن البدء في الحجز أو العقد.' : 'Customer data was saved and is ready for booking or contracting.', 'success');
      setForm(initialState);
      setDuplicates([]);
      setOpen(false);
    } catch (error: any) {
      showToast(language === 'ar' ? 'تعذر تسجيل العميل' : 'Customer Registration Failed', error?.message || 'Registration failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const CountrySelect = ({ value, onChange, licenceGuidance = false }: { value: string; onChange: (value: string) => void; licenceGuidance?: boolean }) => (
    <select value={value} onChange={e => onChange(e.target.value)} className={fieldClass}>
      {countries.map(c => {
        const guidance = licenceGuidance ? getVisitorLicenceGuidance(c.code) : null;
        const suffix = guidance === 'gcc' ? ' · GCC' : guidance === 'rta_exception' ? ' · RTA' : '';
        return <option key={c.code} value={c.code}>{c.label}{suffix}</option>;
      })}
    </select>
  );

  const PhoneField = ({ country, local, onCountry, onLocal }: { country: string; local: string; onCountry: (v: string) => void; onLocal: (v: string) => void }) => (
    <div className="flex overflow-hidden rounded-xl border border-sky-500/30 bg-zinc-950 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-500/10" dir="ltr">
      <select value={country} onChange={e => onCountry(e.target.value)} className="w-[132px] shrink-0 border-0 border-r border-sky-500/20 bg-sky-950/40 px-2 py-2.5 text-left text-sm font-bold text-sky-100 outline-none">
        {countries.map(c => <option key={c.code} value={c.code}>{c.dialCode} · {c.code}</option>)}
      </select>
      <input value={local} onChange={e => onLocal(e.target.value.replace(/[^0-9\s-]/g, ''))} className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-left text-sm text-zinc-100 outline-none" inputMode="tel" placeholder="50 123 4567" />
    </div>
  );

  if (!open) return null;

  const individual = form.mode === 'individual';
  return (
    <div data-customer-intake-root className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex max-h-[94vh] w-[min(1120px,97vw)] flex-col overflow-hidden rounded-3xl border border-sky-500/25 bg-zinc-950 shadow-[0_30px_100px_-35px_rgba(14,165,233,.65)]">
        <div className="flex items-center justify-between gap-4 border-b border-sky-500/15 bg-gradient-to-r from-sky-950/70 via-zinc-950 to-zinc-950 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-sky-400"><ShieldCheck className="h-4 w-4" /> SPLENDOR CUSTOMER ONBOARDING</div>
            <h2 className="text-xl font-black text-white">{language === 'ar' ? 'تسجيل عميل جديد' : 'Register New Customer'}</h2>
            <p className="mt-1 text-xs text-zinc-400">{language === 'ar' ? 'بيانات منظمة للتحقق والهوية والرخصة والحسابات الفردية والشركات.' : 'Structured identity, licensing and corporate onboarding data.'}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-zinc-300 hover:border-sky-500/40 hover:text-sky-300" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-sky-500/15 bg-zinc-900/60 p-1.5">
            <button type="button" onClick={() => set('mode', 'individual')} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${individual ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-950/40' : 'text-zinc-400 hover:text-zinc-100'}`}><UserRound className="h-4 w-4" />{language === 'ar' ? 'فرد' : 'Individual'}</button>
            <button type="button" onClick={() => set('mode', 'corporate')} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${!individual ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-950/40' : 'text-zinc-400 hover:text-zinc-100'}`}><Building2 className="h-4 w-4" />{language === 'ar' ? 'شركة' : 'Company'}</button>
          </div>

          {duplicates.length > 0 && <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200">{language === 'ar' ? `تنبيه: يوجد ${duplicates.length} سجل محتمل مطابق. راجع السجلات قبل إنشاء عميل مكرر.` : `Warning: ${duplicates.length} possible duplicate record(s) found.`}</div>}

          {individual ? (
            <div className="space-y-6">
              <section className="rounded-2xl border border-sky-500/15 bg-zinc-900/45 p-4">
                <h3 className="mb-4 text-sm font-black text-sky-300">{language === 'ar' ? 'البيانات الأساسية' : 'Basic Information'}</h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div><label className={labelClass}>{language === 'ar' ? 'الاسم الكامل بالإنجليزية *' : 'Full legal name (English) *'}</label><input required dir="ltr" value={form.fullName} onChange={e => set('fullName', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'الاسم الكامل بالعربية *' : 'Full legal name (Arabic) *'}</label><input required dir="rtl" value={form.fullNameAr} onChange={e => set('fullNameAr', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'البريد الإلكتروني *' : 'Email *'}</label><input required type="email" value={form.email} onBlur={duplicateCheck} onChange={e => set('email', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'رقم الهاتف *' : 'Phone *'}</label><PhoneField country={form.phoneCountry} local={form.phoneLocal} onCountry={v => set('phoneCountry', v)} onLocal={v => set('phoneLocal', v)} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'الجنسية *' : 'Nationality *'}</label><CountrySelect value={form.nationality} onChange={v => set('nationality', v)} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'الدولة محل الإقامة' : 'Residence country'}</label><CountrySelect value={form.residenceCountry} onChange={v => set('residenceCountry', v)} /></div>
                  <div className="md:col-span-2"><label className={labelClass}>{language === 'ar' ? 'العنوان' : 'Address'}</label><input value={form.address} onChange={e => set('address', e.target.value)} className={fieldClass} /></div>
                </div>
              </section>

              <section className="rounded-2xl border border-sky-500/15 bg-zinc-900/45 p-4">
                <h3 className="mb-4 text-sm font-black text-sky-300">{language === 'ar' ? 'الهوية أو جواز السفر' : 'Identity / Passport'}</h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div><label className={labelClass}>{language === 'ar' ? 'نوع الإثبات' : 'ID type'}</label><select value={form.idType} onChange={e => set('idType', e.target.value as IntakeState['idType'])} className={fieldClass}><option value="emirates_id">{language === 'ar' ? 'هوية إماراتية' : 'Emirates ID'}</option><option value="passport">{language === 'ar' ? 'جواز سفر' : 'Passport'}</option><option value="gcc_id">{language === 'ar' ? 'هوية مجلس التعاون الخليجي' : 'GCC ID'}</option></select></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'رقم الهوية / الجواز *' : 'ID / passport number *'}</label><input required value={form.idNumber} onBlur={duplicateCheck} onChange={e => set('idNumber', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'صادرة من' : 'Issued by'}</label><CountrySelect value={form.idIssuedBy} onChange={v => set('idIssuedBy', v)} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'تاريخ الإصدار — يوم/شهر/سنة *' : 'Issue date — DD/MM/YYYY *'}</label><input required type="date" value={form.idIssueDate} onChange={e => set('idIssueDate', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'تاريخ الانتهاء — يوم/شهر/سنة *' : 'Expiry date — DD/MM/YYYY *'}</label><input required type="date" value={form.idExpiryDate} onChange={e => set('idExpiryDate', e.target.value)} className={fieldClass} /></div>
                </div>
              </section>

              <section className="rounded-2xl border border-sky-500/15 bg-zinc-900/45 p-4">
                <h3 className="mb-4 text-sm font-black text-sky-300">{language === 'ar' ? 'الرخصة المقدمة للتأجير' : 'Primary licence presented for rental'}</h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div><label className={labelClass}>{language === 'ar' ? 'نوع الرخصة' : 'Licence type'}</label><select value={form.licenseType} onChange={e => set('licenseType', e.target.value as IntakeState['licenseType'])} className={fieldClass}><option value="uae">{language === 'ar' ? 'رخصة إماراتية' : 'UAE licence'}</option><option value="international">{language === 'ar' ? 'رخصة قيادة دولية' : 'International Driving Permit'}</option><option value="gcc">{language === 'ar' ? 'رخصة مجلس التعاون الخليجي' : 'GCC licence'}</option></select></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'رقم الرخصة *' : 'Licence number *'}</label><input required value={form.licenseNumber} onBlur={duplicateCheck} onChange={e => set('licenseNumber', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'صادرة من' : 'Issued by'}</label><CountrySelect value={form.licenseCountry} onChange={v => set('licenseCountry', v)} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'تاريخ الإصدار — يوم/شهر/سنة *' : 'Issue date — DD/MM/YYYY *'}</label><input required type="date" value={form.licenseIssueDate} onChange={e => set('licenseIssueDate', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'تاريخ الانتهاء — يوم/شهر/سنة *' : 'Expiry date — DD/MM/YYYY *'}</label><input required type="date" value={form.licenseExpiryDate} onChange={e => set('licenseExpiryDate', e.target.value)} className={fieldClass} /></div>
                </div>
              </section>

              <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-black text-emerald-300">{language === 'ar' ? 'رخصة بلد العميل الأم / الرخصة الوطنية' : 'Home-country / national driving licence'}</h3>
                  <p className="mt-1 text-[11px] text-zinc-400">{language === 'ar' ? 'اختياري عند عدم توفرها. بعض الزوار يمكنهم القيادة برخصة بلدهم وفق حالة الزيارة وقواعد RTA الحالية. القائمة إرشادية ولا تمنع اختيار أي دولة.' : 'Optional when unavailable. Some visitors can drive on their home-country licence depending on visitor status and current RTA rules. Guidance never blocks selection of another country.'}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div><label className={labelClass}>{language === 'ar' ? 'رقم رخصة البلد الأم' : 'Home-country licence number'}</label><input value={form.homeLicenseNumber} onBlur={duplicateCheck} onChange={e => set('homeLicenseNumber', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'الدولة المصدرة' : 'Issuing country'}</label><CountrySelect licenceGuidance value={form.homeLicenseCountry} onChange={v => set('homeLicenseCountry', v)} /></div>
                  <div className="rounded-xl border border-emerald-500/20 bg-zinc-950/70 p-3 text-[11px] leading-5 text-zinc-300">{visitorLicenceGuidanceLabel(form.homeLicenseCountry, language)}<div className="mt-1 text-[10px] text-zinc-500">RTA guidance verified {RTA_VISITOR_LICENCE_GUIDANCE_VERIFIED_AT}</div></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'تاريخ الإصدار — يوم/شهر/سنة' : 'Issue date — DD/MM/YYYY'}</label><input type="date" value={form.homeLicenseIssueDate} onChange={e => set('homeLicenseIssueDate', e.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass}>{language === 'ar' ? 'تاريخ الانتهاء — يوم/شهر/سنة' : 'Expiry date — DD/MM/YYYY'}</label><input type="date" value={form.homeLicenseExpiryDate} onChange={e => set('homeLicenseExpiryDate', e.target.value)} className={fieldClass} /></div>
                </div>
              </section>
            </div>
          ) : (
            <section className="rounded-2xl border border-sky-500/15 bg-zinc-900/45 p-4">
              <h3 className="mb-4 text-sm font-black text-sky-300">{language === 'ar' ? 'بيانات الشركة' : 'Company Information'}</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div><label className={labelClass}>{language === 'ar' ? 'اسم الشركة بالإنجليزية *' : 'Company name (English) *'}</label><input required dir="ltr" value={form.companyName} onChange={e => set('companyName', e.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'اسم الشركة بالعربية' : 'Company name (Arabic)'}</label><input dir="rtl" value={form.companyNameAr} onChange={e => set('companyNameAr', e.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'رقم الرخصة التجارية *' : 'Trade licence number *'}</label><input required value={form.tradeLicenseNumber} onChange={e => set('tradeLicenseNumber', e.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'صادرة من *' : 'Issued by *'}</label><CountrySelect value={form.tradeLicenseIssuedBy} onChange={v => set('tradeLicenseIssuedBy', v)} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'تاريخ الإصدار — يوم/شهر/سنة *' : 'Issue date — DD/MM/YYYY *'}</label><input required type="date" value={form.tradeLicenseIssueDate} onChange={e => set('tradeLicenseIssueDate', e.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'تاريخ الانتهاء — يوم/شهر/سنة *' : 'Expiry date — DD/MM/YYYY *'}</label><input required type="date" value={form.tradeLicenseExpiryDate} onChange={e => set('tradeLicenseExpiryDate', e.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'اسم المالك *' : 'Owner name *'}</label><input required value={form.companyOwnerName} onChange={e => set('companyOwnerName', e.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'اسم المدير المسؤول *' : 'Responsible manager *'}</label><input required value={form.responsibleManagerName} onChange={e => set('responsibleManagerName', e.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'رقم الهاتف *' : 'Phone *'}</label><PhoneField country={form.companyPhoneCountry} local={form.companyPhoneLocal} onCountry={v => set('companyPhoneCountry', v)} onLocal={v => set('companyPhoneLocal', v)} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'العنوان *' : 'Address *'}</label><input required value={form.companyAddress} onChange={e => set('companyAddress', e.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'رقم التسجيل الضريبي' : 'Tax registration number'}</label><input value={form.companyTrn} onChange={e => set('companyTrn', e.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>{language === 'ar' ? 'البريد الإلكتروني *' : 'Email *'}</label><input required type="email" value={form.companyEmail} onBlur={duplicateCheck} onChange={e => set('companyEmail', e.target.value)} className={fieldClass} /></div>
              </div>
            </section>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-sky-500/15 pt-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500"><CheckCircle2 className="h-4 w-4 text-sky-400" />{language === 'ar' ? 'سيتم حفظ البيانات ضمن ملف العميل وربطها بالعقود والمستندات لاحقاً.' : 'Data will be stored in the customer profile for contracts and documents.'}</div>
            <div className="flex items-center gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-bold text-zinc-300 hover:bg-zinc-900">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={busy} className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg shadow-sky-950/40 hover:bg-sky-400 disabled:opacity-50">{busy ? (language === 'ar' ? 'جارِ الحفظ…' : 'Saving…') : (language === 'ar' ? 'تسجيل العميل' : 'Register Customer')}</button></div>
          </div>
        </form>
      </div>
    </div>
  );
};
