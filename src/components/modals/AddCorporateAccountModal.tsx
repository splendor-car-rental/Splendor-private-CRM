import React, { useState } from 'react';
import { Building2, AlertTriangle } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { CorporateAccount } from '../../types';
import { Modal } from '../common/Modal';
import { DayMonthYearDateInput } from '../common/DayMonthYearDateInput';
import { SOVEREIGN_BRANCHES } from '../../config/branches';

interface AddCorporateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (account: CorporateAccount) => void;
}

const EMPTY_FORM = {
  legalName: '',
  legalNameAr: '',
  tradeLicenseNumber: '',
  trnVatNumber: '',
  licenseExpiry: '',
  branchId: SOVEREIGN_BRANCHES[0]?.id || '',
  primaryContact: { name: '', email: '', phone: '', designation: '' },
  creditLimitAed: 100000,
  paymentTermsDays: 30,
  status: 'under_review' as 'active' | 'under_review' | 'credit_hold',
  notes: ''
};

/**
 * A corporate customer is a CorporateAccount (Accounts-Receivable entity
 * with its own credit governance), never a Customer record with
 * type:'corporate' -- that would fork the same kind of client into two
 * divergent data paths (see CorporateBranchPortalView, the existing,
 * working corporate flow this modal submits into via addCorporateAccount).
 */
export const AddCorporateAccountModal: React.FC<AddCorporateAccountModalProps> = ({ isOpen, onClose, onCreated }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { addCorporateAccount, corporateAccounts } = useCRM();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real, evidence-based duplicate check against the accounts already
  // loaded in context -- matched only by trade license or TRN (the two
  // legally unique identifiers), never by company name (which can
  // legitimately repeat across unrelated entities).
  const duplicateMatch = React.useMemo(() => {
    const license = form.tradeLicenseNumber.trim().toLowerCase();
    const trn = form.trnVatNumber.trim().toLowerCase();
    if (license.length < 3 && trn.length < 6) return null;
    return (corporateAccounts || []).find(acc =>
      (license.length >= 3 && (acc.tradeLicenseNumber || '').trim().toLowerCase() === license) ||
      (trn.length >= 6 && (acc.trnVatNumber || '').trim().toLowerCase() === trn)
    ) || null;
  }, [form.tradeLicenseNumber, form.trnVatNumber, corporateAccounts]);

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.legalName.trim()) {
      setError(isAr ? 'اسم الشركة القانوني مطلوب' : 'Legal company name is required.');
      return;
    }
    if (!form.tradeLicenseNumber.trim()) {
      setError(isAr ? 'رقم الرخصة التجارية مطلوب' : 'Trade license number is required.');
      return;
    }
    if (duplicateMatch) {
      setError(isAr
        ? `يوجد حساب شركة مسجل مسبقاً بنفس الرخصة التجارية أو الرقم الضريبي: ${duplicateMatch.legalName} (${duplicateMatch.id})`
        : `A corporate account already exists with this trade license or TRN: ${duplicateMatch.legalName} (${duplicateMatch.id})`);
      return;
    }
    setSubmitting(true);
    try {
      const created = await addCorporateAccount({
        ...form,
        creditLimitAed: Number(form.creditLimitAed) || 0,
        paymentTermsDays: Number(form.paymentTermsDays) || 30
      });
      if (onCreated) onCreated(created);
      handleClose();
    } catch (err: any) {
      setError(err?.message || (isAr ? 'تعذر إنشاء حساب الشركة.' : 'Failed to create the corporate account.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isAr ? 'تسجيل حساب شركة جديد (KYB)' : 'Register New Corporate Account (KYB)'}
      subtitle={isAr ? 'حساب الشركة كيان مستقل بحدود ائتمانية خاصة به -- ليس عميلاً فردياً' : 'A corporate account is an independent AR entity with its own credit governance -- not an individual customer'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!error && duplicateMatch && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              {isAr ? 'تنبيه: رخصة تجارية أو رقم ضريبي مطابق موجود مسبقاً -- ' : 'Warning: a matching trade license or TRN already exists -- '}
              {duplicateMatch.legalName} ({duplicateMatch.id})
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 mb-1">{isAr ? 'اسم الشركة الرسمي (English) *' : 'Legal Company Name (EN) *'}</label>
            <input
              type="text" required value={form.legalName}
              onChange={e => setForm({ ...form, legalName: e.target.value })}
              placeholder="e.g. Al Futtaim Group LLC"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">{isAr ? 'اسم الشركة بالعربي' : 'Company Name (AR)'}</label>
            <input
              type="text" value={form.legalNameAr}
              onChange={e => setForm({ ...form, legalNameAr: e.target.value })}
              placeholder="مثال: مجموعة الفطيم ش.ذ.م.م"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-zinc-400 mb-1">{isAr ? 'رقم الرخصة التجارية *' : 'Trade License No. *'}</label>
            <input
              type="text" required value={form.tradeLicenseNumber}
              onChange={e => setForm({ ...form, tradeLicenseNumber: e.target.value })}
              placeholder="CN-1234567"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">{isAr ? 'الرقم الضريبي TRN' : 'VAT TRN Number'}</label>
            <input
              type="text" value={form.trnVatNumber}
              onChange={e => setForm({ ...form, trnVatNumber: e.target.value })}
              placeholder="100293847500003"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <DayMonthYearDateInput
            label={isAr ? 'انتهاء الرخصة' : 'License Expiry'}
            value={form.licenseExpiry}
            onChange={iso => setForm({ ...form, licenseExpiry: iso })}
            isAr={isAr}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-zinc-400 mb-1">{isAr ? 'الفرع المسؤول' : 'Assigned Branch'}</label>
            <select
              value={form.branchId}
              onChange={e => setForm({ ...form, branchId: e.target.value })}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
            >
              {SOVEREIGN_BRANCHES.map(b => (
                <option key={b.id} value={b.id}>{isAr ? b.nameAr : b.nameEn}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">{isAr ? 'سقف الائتمان المطلوب (AED)' : 'Requested Credit Limit (AED)'}</label>
            <input
              type="number" min="0" step="5000" value={form.creditLimitAed}
              onChange={e => setForm({ ...form, creditLimitAed: Number(e.target.value) })}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">{isAr ? 'فترة السداد (أيام)' : 'Payment Terms (Days)'}</label>
            <input
              type="number" min="0" value={form.paymentTermsDays}
              onChange={e => setForm({ ...form, paymentTermsDays: Number(e.target.value) })}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-200">
          {isAr
            ? 'يُنشأ الحساب بحالة "قيد المراجعة" -- سقف الائتمان يُفعَّل فقط بعد اعتماد الإدارة المالية، وليس تلقائياً عند التسجيل.'
            : 'The account is created with status "Under Review" -- the credit limit only activates once Finance approves it, never automatically at registration.'}
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
          <div className="font-semibold text-zinc-300">{isAr ? 'بيانات جهة الاتصال المعتمدة (الشخص المخوّل)' : 'Primary Authorized Contact'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1">{isAr ? 'الاسم الكامل *' : 'Contact Person Name *'}</label>
              <input
                type="text" required value={form.primaryContact.name}
                onChange={e => setForm({ ...form, primaryContact: { ...form.primaryContact, name: e.target.value } })}
                placeholder="e.g. John Doe"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">{isAr ? 'المسمى الوظيفي' : 'Designation / Title'}</label>
              <input
                type="text" value={form.primaryContact.designation}
                onChange={e => setForm({ ...form, primaryContact: { ...form.primaryContact, designation: e.target.value } })}
                placeholder="e.g. Fleet Procurement Director"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">{isAr ? 'رقم الهاتف *' : 'Phone Number *'}</label>
              <input
                type="text" required value={form.primaryContact.phone}
                onChange={e => setForm({ ...form, primaryContact: { ...form.primaryContact, phone: e.target.value } })}
                placeholder="+971 50 000 0000"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">{isAr ? 'البريد الإلكتروني' : 'Email Address'}</label>
              <input
                type="email" value={form.primaryContact.email}
                onChange={e => setForm({ ...form, primaryContact: { ...form.primaryContact, email: e.target.value } })}
                placeholder="corporate@company.ae"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-zinc-400 mb-1">{isAr ? 'ملاحظات وشروط خاصة' : 'Special Notes & Terms'}</label>
          <textarea
            rows={2} value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder="Additional agreements, VIP driver notes..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
          <button
            type="button" onClick={handleClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit" disabled={submitting}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 cursor-pointer flex items-center gap-2"
          >
            <Building2 className="w-4 h-4" />
            <span>{submitting ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ وتسجيل الشركة' : 'Save Corporate Account')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
