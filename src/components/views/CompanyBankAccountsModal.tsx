import React, { useState, useEffect } from 'react';
import { Landmark, Check, X, ShieldCheck, DollarSign, Building, AlertCircle } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Modal } from '../common/Modal';
import { CompanyBankAccount } from '../../types';

interface CompanyBankAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountToEdit?: CompanyBankAccount | null;
}

const COMMON_UAE_BANKS = [
  { nameEn: 'Emirates NBD', nameAr: 'بنك الإمارات دبي الوطني', swift: 'EBBDAEAD' },
  { nameEn: 'First Abu Dhabi Bank (FAB)', nameAr: 'بنك أبوظبي الأول', swift: 'NBADAEAD' },
  { nameEn: 'Abu Dhabi Commercial Bank (ADCB)', nameAr: 'بنك أبوظبي التجاري', swift: 'ADCBAEAA' },
  { nameEn: 'Dubai Islamic Bank (DIB)', nameAr: 'بنك دبي الإسلامي', swift: 'DUIBAEAD' },
  { nameEn: 'Mashreq Bank', nameAr: 'بنك المشرق', swift: 'MSHQAEAD' },
  { nameEn: 'Commercial Bank of Dubai (CBD)', nameAr: 'بنك دبي التجاري', swift: 'CBDAAEAD' },
  { nameEn: 'Abu Dhabi Islamic Bank (ADIB)', nameAr: 'مصرف أبوظبي الإسلامي', swift: 'ADIBBBAA' },
  { nameEn: 'RAKBANK (National Bank of Ras Al Khaimah)', nameAr: 'بنك رأس الخيمة الوطني', swift: 'RAKBAEAE' },
  { nameEn: 'Sharjah Islamic Bank', nameAr: 'مصرف الشارقة الإسلامي', swift: 'SHJIAEAA' },
  { nameEn: 'Emirates Islamic Bank', nameAr: 'الإمارات الإسلامي', swift: 'MEBLAEAD' },
  { nameEn: 'HSBC Bank Middle East', nameAr: 'بنك إتش إس بي سي الشرق الأوسط', swift: 'BBMEAEAD' },
  { nameEn: 'Standard Chartered UAE', nameAr: 'ستاندرد تشارترد بنك', swift: 'SCBLAEAD' }
];

export const CompanyBankAccountModal: React.FC<CompanyBankAccountModalProps> = ({
  isOpen,
  onClose,
  accountToEdit
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { addCompanyBankAccount, updateCompanyBankAccount, showToast } = useCRM();

  const [bankName, setBankName] = useState('');
  const [bankNameAr, setBankNameAr] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNameAr, setAccountNameAr] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [swiftBic, setSwiftBic] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [branch, setBranch] = useState('');
  const [openingBalance, setOpeningBalance] = useState<number | ''>(0);
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accountToEdit) {
      setBankName(accountToEdit.bankName || '');
      setBankNameAr(accountToEdit.bankNameAr || '');
      setAccountName(accountToEdit.accountName || '');
      setAccountNameAr(accountToEdit.accountNameAr || '');
      setAccountNumber(accountToEdit.accountNumber || '');
      setIban(accountToEdit.iban || '');
      setSwiftBic(accountToEdit.swiftBic || '');
      setCurrency(accountToEdit.currency || 'AED');
      setBranch(accountToEdit.branch || '');
      setOpeningBalance(accountToEdit.openingBalance || 0);
      setIsPrimary(Boolean(accountToEdit.isPrimary));
      setNotes(accountToEdit.notes || '');
    } else {
      setBankName('Emirates NBD');
      setBankNameAr('بنك الإمارات دبي الوطني');
      setAccountName('Car Rental LLC - Main Ops');
      setAccountNameAr('شركة تأجير السيارات ذ.م.م - الحساب التشغيلي الرئيسي');
      setAccountNumber('');
      setIban('');
      setSwiftBic('EBBDAEAD');
      setCurrency('AED');
      setBranch('Dubai Main Branch');
      setOpeningBalance(0);
      setIsPrimary(false);
      setNotes('');
    }
    setError(null);
  }, [accountToEdit, isOpen]);

  const handleBankSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = COMMON_UAE_BANKS.find(b => b.nameEn === e.target.value);
    if (selected) {
      setBankName(selected.nameEn);
      setBankNameAr(selected.nameAr);
      setSwiftBic(selected.swift);
    } else {
      setBankName(e.target.value);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!bankName.trim()) {
      setError(isAr ? 'يرجى إدخال اسم البنك' : 'Bank name is required');
      return;
    }
    if (!accountName.trim()) {
      setError(isAr ? 'يرجى إدخال اسم صاحب الحساب أو الشركة' : 'Account name is required');
      return;
    }
    if (!accountNumber.trim()) {
      setError(isAr ? 'يرجى إدخال رقم الحساب البنكي' : 'Account number is required');
      return;
    }
    if (!iban.trim()) {
      setError(isAr ? 'يرجى إدخال رقم الآيبان (IBAN)' : 'IBAN is required');
      return;
    }

    // Clean IBAN
    const cleanIban = iban.trim().toUpperCase().replace(/\s+/g, '');
    if (currency === 'AED' && !cleanIban.startsWith('AE')) {
      setError(isAr ? 'يجب أن يبدأ الآيبان الإماراتي بالحرفين AE' : 'UAE IBAN must start with AE');
      return;
    }

    setSaving(true);
    try {
      if (accountToEdit) {
        await updateCompanyBankAccount(accountToEdit.id, {
          bankName: bankName.trim(),
          bankNameAr: bankNameAr.trim() || undefined,
          accountName: accountName.trim(),
          accountNameAr: accountNameAr.trim() || undefined,
          accountNumber: accountNumber.trim(),
          iban: cleanIban,
          swiftBic: swiftBic.trim().toUpperCase() || undefined,
          currency: currency.toUpperCase(),
          branch: branch.trim() || undefined,
          openingBalance: Number(openingBalance) || 0,
          isPrimary,
          notes: notes.trim() || undefined
        });
      } else {
        await addCompanyBankAccount({
          bankName: bankName.trim(),
          bankNameAr: bankNameAr.trim() || undefined,
          accountName: accountName.trim(),
          accountNameAr: accountNameAr.trim() || undefined,
          accountNumber: accountNumber.trim(),
          iban: cleanIban,
          swiftBic: swiftBic.trim().toUpperCase() || undefined,
          currency: currency.toUpperCase(),
          branch: branch.trim() || undefined,
          openingBalance: Number(openingBalance) || 0,
          isPrimary,
          notes: notes.trim() || undefined
        });
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || (isAr ? 'فشل حفظ الحساب البنكي' : 'Failed to save bank account'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        accountToEdit
          ? (isAr ? 'تعديل بيانات الحساب البنكي' : 'Edit Company Bank Account')
          : (isAr ? 'إضافة حساب بنكي جديد للشركة' : 'Add New Company Bank Account')
      }
      subtitle={
        isAr
          ? 'تسجيل حساب رسمي لاستقبال الحوالات وتغذية كشوف الحساب والمطابقة'
          : 'Register an official corporate account for incoming wires, statement imports & reconciliation'
      }
      maxWidth="2xl"
    >
      <form onSubmit={handleSave} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Bank Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              {isAr ? 'اسم البنك (الرئيسي)' : 'Bank Name'} <span className="text-rose-400">*</span>
            </label>
            <div className="space-y-1.5">
              <select
                onChange={handleBankSelect}
                value={COMMON_UAE_BANKS.some(b => b.nameEn === bankName) ? bankName : 'custom'}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]"
              >
                {COMMON_UAE_BANKS.map(b => (
                  <option key={b.nameEn} value={b.nameEn}>
                    {isAr ? `${b.nameAr} (${b.nameEn})` : `${b.nameEn} - ${b.nameAr}`}
                  </option>
                ))}
                <option value="custom">{isAr ? 'بنك آخر (مخصص)...' : 'Other Bank (Custom)...'}</option>
              </select>

              {(!COMMON_UAE_BANKS.some(b => b.nameEn === bankName) || bankName === 'custom') && (
                <input
                  type="text"
                  value={bankName === 'custom' ? '' : bankName}
                  onChange={e => setBankName(e.target.value)}
                  placeholder={isAr ? 'اكتب اسم البنك بالإنجليزية' : 'Enter bank name in English'}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              {isAr ? 'اسم البنك بالعربية' : 'Bank Name (Arabic)'}
            </label>
            <input
              type="text"
              value={bankNameAr}
              onChange={e => setBankNameAr(e.target.value)}
              placeholder={isAr ? 'مثال: بنك أبوظبي التجاري' : 'e.g. بنك أبوظبي التجاري'}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>

        {/* Account Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              {isAr ? 'اسم صاحب الحساب / اسم الشركة' : 'Beneficiary / Account Name'} <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              placeholder="e.g. Royal Prestige Car Rental LLC"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              {isAr ? 'اسم الحساب بالعربية' : 'Account Name (Arabic)'}
            </label>
            <input
              type="text"
              value={accountNameAr}
              onChange={e => setAccountNameAr(e.target.value)}
              placeholder={isAr ? 'مثال: شركة رويال برستيج لتأجير السيارات ذ.م.م' : 'Arabic Account Title'}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>

        {/* Account Number & IBAN */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              {isAr ? 'رقم الحساب البنكي الداخلي' : 'Account Number'} <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
              placeholder="e.g. 102030405060"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              {isAr ? 'رقم الآيبان الدولي (IBAN)' : 'IBAN Number'} <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={iban}
              onChange={e => setIban(e.target.value)}
              placeholder="AE09 0260 0012 3456 7890 01"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono uppercase focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>

        {/* SWIFT, Currency, Branch */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              {isAr ? 'رمز السويفت (SWIFT / BIC)' : 'SWIFT / BIC'}
            </label>
            <input
              type="text"
              value={swiftBic}
              onChange={e => setSwiftBic(e.target.value)}
              placeholder="EBBDAEAD"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono uppercase focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              {isAr ? 'العملة' : 'Currency'}
            </label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-semibold focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="AED">AED - UAE Dirham (درهم إماراتي)</option>
              <option value="USD">USD - US Dollar (دولار أمريكي)</option>
              <option value="EUR">EUR - Euro (يورو)</option>
              <option value="SAR">SAR - Saudi Riyal (ريال سعودي)</option>
              <option value="GBP">GBP - British Pound (جنيه إسترليني)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              {isAr ? 'الفرع' : 'Branch'}
            </label>
            <input
              type="text"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              placeholder={isAr ? 'مثال: فرع دبي مول' : 'e.g. Dubai Main Branch'}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>

        {/* Opening Balance & Primary Account Flag */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center pt-2">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
              {isAr ? 'الرصيد الافتتاحي (د.إ)' : 'Opening Balance'}
            </label>
            <input
              type="number"
              value={openingBalance}
              onChange={e => setOpeningBalance(e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div className="sm:pt-5">
            <label className="flex items-center gap-2.5 cursor-pointer select-none p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 transition-colors">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={e => setIsPrimary(e.target.checked)}
                className="w-4 h-4 rounded text-[#D4AF37] focus:ring-[#D4AF37] accent-[#D4AF37] bg-zinc-900 border-zinc-700"
              />
              <div>
                <span className="font-semibold text-zinc-200">{isAr ? 'حساب الشركة الرئيسي الافتراضي' : 'Primary / Default Corporate Account'}</span>
                <p className="text-[10px] text-zinc-500">{isAr ? 'يتم اختياره تلقائياً للفواتير وسندات القبض' : 'Auto-selected on invoices and receipt vouchers'}</p>
              </div>
            </label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
            {isAr ? 'ملاحظات وتفاصيل إضافية' : 'Notes & Additional Details'}
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={isAr ? 'أي تعليمات تحويل أو غرض الحساب...' : 'Any wire instructions or internal account purpose...'}
            className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-300 hover:bg-zinc-800 font-semibold transition-all"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
          >
            {saving ? (
              <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{accountToEdit ? (isAr ? 'تحديث الحساب' : 'Update Account') : (isAr ? 'حفظ وتثبيت الحساب' : 'Save Account')}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
