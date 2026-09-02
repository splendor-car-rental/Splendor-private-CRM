import React, { useMemo, useState } from 'react';
import { Building2, Plus, Search, Trash2, X } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Modal } from '../common/Modal';
import { formatDate } from '../../lib/dateFormat';
import type { CorporateAccount } from '../../types';

interface FormState {
  legalName: string;
  legalNameAr: string;
  tradeLicenseNumber: string;
  trnVatNumber: string;
  licenseExpiry: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactDesignation: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  legalName: '', legalNameAr: '', tradeLicenseNumber: '', trnVatNumber: '', licenseExpiry: '',
  contactName: '', contactEmail: '', contactPhone: '', contactDesignation: '', notes: ''
});

const NO_CREDIT_COMPATIBILITY_FIELDS = {
  branchId: 'COMPANY_WIDE',
  creditLimitAed: 0,
  usedExposureAed: 0,
  paymentTermsDays: 0,
  status: 'active' as const
};

export const CorporateAccountsDirectoryView: React.FC = () => {
  const { language } = useLanguage();
  const { corporateAccounts, addCorporateAccount, updateCorporateAccount, deleteCorporateAccount, showToast } = useCRM();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CorporateAccount | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return corporateAccounts;
    return corporateAccounts.filter(account => [
      account.legalName, account.legalNameAr, account.tradeLicenseNumber, account.trnVatNumber,
      account.primaryContact?.name, account.primaryContact?.phone, account.primaryContact?.email
    ].filter(Boolean).some(value => String(value).toLowerCase().includes(q)));
  }, [corporateAccounts, search]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (account: CorporateAccount) => {
    setEditing(account);
    setForm({
      legalName: account.legalName || '',
      legalNameAr: account.legalNameAr || '',
      tradeLicenseNumber: account.tradeLicenseNumber || '',
      trnVatNumber: account.trnVatNumber || '',
      licenseExpiry: account.licenseExpiry || '',
      contactName: account.primaryContact?.name || '',
      contactEmail: account.primaryContact?.email || '',
      contactPhone: account.primaryContact?.phone || '',
      contactDesignation: account.primaryContact?.designation || '',
      notes: account.notes || ''
    });
    setModalOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.legalName.trim() || !form.tradeLicenseNumber.trim()) {
      showToast(language === 'ar' ? 'بيانات ناقصة' : 'Missing data', language === 'ar' ? 'اسم الشركة ورقم الرخصة التجارية مطلوبان.' : 'Company name and trade licence number are required.', 'error');
      return;
    }
    setBusy(true);
    const payload: Partial<CorporateAccount> = {
      legalName: form.legalName.trim(),
      legalNameAr: form.legalNameAr.trim(),
      tradeLicenseNumber: form.tradeLicenseNumber.trim(),
      trnVatNumber: form.trnVatNumber.trim(),
      licenseExpiry: form.licenseExpiry,
      primaryContact: {
        name: form.contactName.trim(),
        email: form.contactEmail.trim(),
        phone: form.contactPhone.trim(),
        designation: form.contactDesignation.trim()
      },
      notes: form.notes.trim(),
      ...NO_CREDIT_COMPATIBILITY_FIELDS
    };
    try {
      if (editing) await updateCorporateAccount(editing.id, payload);
      else await addCorporateAccount(payload);
      showToast(language === 'ar' ? 'تم الحفظ' : 'Saved', language === 'ar' ? 'تم حفظ سجل الشركة بدون أي تسهيلات ائتمانية.' : 'Company record saved with no credit facility.');
      setModalOpen(false);
    } catch (error: any) {
      showToast(language === 'ar' ? 'تعذر الحفظ' : 'Save failed', error?.message || '', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (account: CorporateAccount) => {
    const reason = window.prompt(language === 'ar' ? 'سبب حذف سجل الشركة:' : 'Reason for deleting this company record:');
    if (!reason?.trim()) return;
    try {
      await deleteCorporateAccount(account.id, reason.trim());
      showToast(language === 'ar' ? 'تم الحذف' : 'Deleted', account.legalName);
    } catch (error: any) {
      showToast(language === 'ar' ? 'تعذر الحذف' : 'Delete failed', error?.message || '', 'error');
    }
  };

  return (
    <div className="space-y-5 pb-12 min-w-0 animate-fade-in">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl sm:text-2xl font-display font-bold text-zinc-100">
              <Building2 className="h-5 w-5 text-[#f5d97f]" />
              {language === 'ar' ? 'سجل الشركات' : 'Company Directory'}
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-zinc-400">
              {language === 'ar'
                ? 'هذه شاشة بيانات عميل شركة فقط. سبلندر لا تمنح حد ائتماني أو آجال سداد أو تسهيلات تمويل لأي عميل؛ لذلك أزيلت حقول الائتمان والتعرض والفروع الوهمية من مسار التسجيل.'
                : 'This is a corporate customer master only. Splendor does not grant customer credit limits, payment terms, or financing facilities, so credit/exposure controls and invented branch data are not part of registration.'}
            </p>
          </div>
          <button onClick={openNew} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-xs font-black text-zinc-950 hover:brightness-110">
            <Plus className="h-4 w-4" /> {language === 'ar' ? 'تسجيل شركة' : 'New Company'}
          </button>
        </div>
      </section>

      <div className="relative max-w-xl">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder={language === 'ar' ? 'بحث باسم الشركة أو الرخصة أو TRN أو جهة الاتصال' : 'Search company, licence, TRN or contact'}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 ps-9 pe-3 text-xs text-zinc-100 outline-none focus:border-[#D4AF37]/60"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filtered.map(account => (
          <article key={account.id} className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-zinc-100 break-words">{account.legalName}</div>
                {account.legalNameAr && <div className="mt-0.5 text-xs text-zinc-400 break-words">{account.legalNameAr}</div>}
                <div className="mt-1 text-[10px] font-mono text-zinc-500">{account.id}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => openEdit(account)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-800">{language === 'ar' ? 'تعديل' : 'Edit'}</button>
                <button onClick={() => remove(account)} className="rounded-lg border border-rose-900/60 px-2.5 py-1.5 text-rose-400 hover:bg-rose-950/30" aria-label="delete"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div><dt className="text-zinc-500">{language === 'ar' ? 'الرخصة التجارية' : 'Trade licence'}</dt><dd className="mt-0.5 text-zinc-200 break-all">{account.tradeLicenseNumber || '—'}</dd></div>
              <div><dt className="text-zinc-500">TRN</dt><dd className="mt-0.5 text-zinc-200 break-all">{account.trnVatNumber || '—'}</dd></div>
              <div><dt className="text-zinc-500">{language === 'ar' ? 'انتهاء الرخصة' : 'Licence expiry'}</dt><dd className="mt-0.5 text-zinc-200">{account.licenseExpiry ? formatDate(account.licenseExpiry, language) : '—'}</dd></div>
              <div><dt className="text-zinc-500">{language === 'ar' ? 'جهة الاتصال' : 'Contact'}</dt><dd className="mt-0.5 text-zinc-200 break-words">{account.primaryContact?.name || '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-zinc-500">{language === 'ar' ? 'الهاتف والبريد' : 'Phone & email'}</dt><dd className="mt-0.5 text-zinc-200 break-all">{[account.primaryContact?.phone, account.primaryContact?.email].filter(Boolean).join(' · ') || '—'}</dd></div>
            </dl>
          </article>
        ))}
        {filtered.length === 0 && <div className="xl:col-span-2 rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">{language === 'ar' ? 'لا توجد شركات مطابقة.' : 'No matching companies.'}</div>}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? (language === 'ar' ? 'تعديل بيانات الشركة' : 'Edit company') : (language === 'ar' ? 'تسجيل شركة جديدة' : 'Register company')} size="lg">
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/15 p-3 text-[11px] leading-5 text-emerald-300">
            {language === 'ar' ? 'لا يوجد حد ائتماني أو آجال سداد. أي فاتورة أو دفعة تتبع دورتها المالية الفعلية فقط.' : 'No credit limit or payment terms are granted. Invoices and receipts follow the actual accounting workflow only.'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={language === 'ar' ? 'اسم الشركة بالإنجليزية *' : 'Company name in English *'} value={form.legalName} onChange={value => setForm(f => ({ ...f, legalName: value }))} />
            <Field label={language === 'ar' ? 'اسم الشركة بالعربية' : 'Arabic company name'} value={form.legalNameAr} onChange={value => setForm(f => ({ ...f, legalNameAr: value }))} />
            <Field label={language === 'ar' ? 'رقم الرخصة التجارية *' : 'Trade licence number *'} value={form.tradeLicenseNumber} onChange={value => setForm(f => ({ ...f, tradeLicenseNumber: value }))} />
            <Field label={language === 'ar' ? 'الرقم الضريبي TRN' : 'Tax Registration Number (TRN)'} value={form.trnVatNumber} onChange={value => setForm(f => ({ ...f, trnVatNumber: value }))} />
            <Field type="date" label={language === 'ar' ? 'تاريخ انتهاء الرخصة' : 'Licence expiry'} value={form.licenseExpiry} onChange={value => setForm(f => ({ ...f, licenseExpiry: value }))} />
            <Field label={language === 'ar' ? 'اسم جهة الاتصال' : 'Contact name'} value={form.contactName} onChange={value => setForm(f => ({ ...f, contactName: value }))} />
            <Field label={language === 'ar' ? 'الهاتف' : 'Phone'} value={form.contactPhone} onChange={value => setForm(f => ({ ...f, contactPhone: value }))} />
            <Field type="email" label={language === 'ar' ? 'البريد الإلكتروني' : 'Email'} value={form.contactEmail} onChange={value => setForm(f => ({ ...f, contactEmail: value }))} />
            <Field label={language === 'ar' ? 'صفة جهة الاتصال' : 'Contact designation'} value={form.contactDesignation} onChange={value => setForm(f => ({ ...f, contactDesignation: value }))} />
          </div>
          <label className="block text-[11px] text-zinc-400">
            {language === 'ar' ? 'ملاحظات' : 'Notes'}
            <textarea value={form.notes} onChange={event => setForm(f => ({ ...f, notes: event.target.value }))} className="mt-1.5 min-h-24 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-100 outline-none focus:border-[#D4AF37]/60" />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="inline-flex items-center gap-1 rounded-xl border border-zinc-700 px-4 py-2 text-xs text-zinc-300"><X className="h-3.5 w-3.5" />{language === 'ar' ? 'إلغاء' : 'Cancel'}</button>
            <button disabled={busy} className="rounded-xl bg-[#D4AF37] px-5 py-2 text-xs font-black text-zinc-950 disabled:opacity-50">{busy ? (language === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (language === 'ar' ? 'حفظ الشركة' : 'Save company')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-[11px] text-zinc-400 min-w-0">
      {label}
      <input type={type} value={value} onChange={event => onChange(event.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-xs text-zinc-100 outline-none focus:border-[#D4AF37]/60" />
    </label>
  );
}
