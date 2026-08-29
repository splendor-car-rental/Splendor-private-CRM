import React, { useState } from 'react';
import {
  Settings, Shield, Users, History,
  Check, Sparkles, Building, UserPlus2, Pencil, Globe, RefreshCw, AlertTriangle, Trash2
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { AuthenticatedImage } from '../common/AuthenticatedImage';
import { AddStaffModal } from '../auth/AddStaffModal';
import { EditStaffModal } from '../auth/EditStaffModal';
import { GovernanceView } from './GovernanceView';
import { ROLE_RANK } from '../../config/permissions';
import { User } from '../../types';

const ROLE_BADGE_VARIANT: Record<string, 'gold' | 'purple' | 'emerald' | 'sky' | 'zinc'> = {
  ceo: 'gold',
  admin: 'gold',
  sales: 'purple',
  fleet: 'sky',
  finance: 'emerald',
  operations: 'zinc'
};

export const SettingsAuditView: React.FC = () => {
  const { language, t, getRoleLabel, getStatusLabel } = useLanguage();
  const isAr = language === 'ar';
  const { currentUser, staffDirectory } = useAuth();
  const { auditLogs, showToast, getReconciliationReport, resetTransactionalData } = useCRM();

  const [activeTab, setActiveTab] = useState<'general' | 'roles' | 'audit' | 'connect' | 'governance'>('general');
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [reconciliationReport, setReconciliationReport] = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const isAdmin = currentUser.role === 'ceo' || currentUser.role === 'admin';
  const RESET_PHRASE = 'DELETE ALL DATA';

  const [standardDailyKm, setStandardDailyKm] = useState<number>(250);
  const [standardMonthlyKm, setStandardMonthlyKm] = useState<number>(4500);
  const [standardExcessKmRate, setStandardExcessKmRate] = useState<number>(2);
  const [operatingCurrency, setOperatingCurrency] = useState<string>('AED');
  const [depositSlaDays, setDepositSlaDays] = useState<number>(21);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const handleSaveRentalDefaults = () => {
    setSavingDefaults(true);
    setTimeout(() => {
      setSavingDefaults(false);
      showToast(
        language === 'ar' ? 'تم حفظ إعدادات التأجير القياسية' : 'Rental Defaults Saved',
        language === 'ar'
          ? `المسافة اليومية: ${standardDailyKm} كم | الشهرية: ${standardMonthlyKm} كم | رسوم التجاوز: ${standardExcessKmRate} درهم/كم`
          : `Daily: ${standardDailyKm} km | Monthly: ${standardMonthlyKm} km | Excess: ${standardExcessKmRate} AED/km`
      );
    }, 400);
  };

  const handleResetData = async () => {
    if (resetConfirmText !== RESET_PHRASE) return;
    setResetting(true);
    try {
      await resetTransactionalData(resetConfirmText);
      setResetConfirmText('');
    } catch (e: any) {
      showToast(
        language === 'ar' ? 'فشل حذف البيانات' : 'Reset Failed',
        e?.message || (language === 'ar' ? 'حدث خطأ أثناء حذف البيانات.' : 'Something went wrong clearing the data.')
      );
    } finally {
      setResetting(false);
    }
  };

  const loadReconciliation = async () => {
    setLoadingReport(true);
    try {
      const rep = await getReconciliationReport();
      setReconciliationReport(rep);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'إعدادات النظام وسجل التدقيق الأمني' : 'System Configuration & Security Audit'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'إدارة الصلاحيات، سجل التغييرات غير القابل للتعديل، وبيانات الشركة الضريبية' : 'Manage corporate tax entities, role-based access control & immutable operational audit logs'}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setAddStaffOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 text-xs font-bold shadow-md shadow-[#D4AF37]/25 hover:brightness-110 transition-all"
          >
            <UserPlus2 className="w-3.5 h-3.5" />
            <span>{t('addStaffButton')}</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'general' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {t('companyVatConfig')}
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'roles' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {t('staffDirectory')}
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'audit' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {language === 'ar' ? `سجل التدقيق الأمني (${auditLogs.length})` : `Security Audit Trail (${auditLogs.length})`}
        </button>
        <button
          onClick={() => {
            setActiveTab('connect');
            if (reconciliationReport.length === 0) loadReconciliation();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'connect' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>{language === 'ar' ? 'ربط الموقع العام (SPLENDOR Connect)' : 'SPLENDOR Connect & Website Sync'}</span>
        </button>
        <button
          onClick={() => setActiveTab('governance')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'governance' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>{language === 'ar' ? 'الحوكمة والموافقات' : 'Governance & Approvals'}</span>
        </button>
      </div>

      {/* Tab 1: Company Configuration */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm">
              <Building className="w-4 h-4 text-[#D4AF37]" />
              <span>{language === 'ar' ? 'بيانات الكيان القانوني والضريبة' : 'Legal Entity & Tax Information'}</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'اسم الشركة القانوني (إنجليزي)' : 'Company Legal Name (English)'}</label>
                <input
                  type="text"
                  readOnly
                  value="SPLENDOR CAR RENTAL LLC"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-medium"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'اسم الشركة القانوني (عربي)' : 'Company Legal Name (Arabic)'}</label>
                <input
                  type="text"
                  readOnly
                  dir="rtl"
                  value="شركة سبلندر لتأجير السيارات ش.ذ.م.م"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'الرقم الضريبي الاتحادي (TRN)' : 'Federal Tax Number (TRN)'}</label>
                  <input
                    type="text"
                    readOnly
                    value="100482910300003"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'نسبة ضريبة القيمة المضافة' : 'UAE Standard VAT Rate'}</label>
                  <input
                    type="text"
                    readOnly
                    value={language === 'ar' ? '5.0% (تلقائي)' : '5.0% (Automated)'}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'عنوان المكتب' : 'Office Address'}</label>
                <input
                  type="text"
                  readOnly
                  value={language === 'ar' ? 'بناية سيتي أفينيو، بورسعيد، ديرة، دبي، الإمارات' : 'City Avenue Building, Port Saeed, Deira, Dubai, UAE'}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'مكتب الإدارة' : 'Management Office'}</label>
                <input
                  type="text"
                  readOnly
                  value={language === 'ar' ? 'قرية جميرا الدائرية (JVC)، دبي، الإمارات' : 'Jumeirah Village Circle (JVC), Dubai, UAE'}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200"
                />
              </div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm">
                <Settings className="w-4 h-4 text-[#D4AF37]" />
                <span>{language === 'ar' ? 'إعدادات التأجير والمسافات الافتراضية' : 'Standard Rental & Mileage Defaults'}</span>
              </div>
              <button
                type="button"
                onClick={handleSaveRentalDefaults}
                disabled={savingDefaults}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4AF37] hover:brightness-110 text-zinc-950 font-bold text-xs shadow-sm transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{savingDefaults ? (language === 'ar' ? 'جارِ الحفظ...' : 'Saving...') : (language === 'ar' ? 'حفظ التعديلات' : 'Save Defaults')}</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 -mt-2">
              {language === 'ar'
                ? 'القيم الافتراضية المعتمدة لإنشاء العقود الجديدة وعروض الأسعار — قابلة للتعديل والتحكم الكامل.'
                : 'Default baseline for new contracts & quotes -- fully editable and configurable.'}
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{language === 'ar' ? 'المسافة اليومية القياسية (كم/يوم)' : 'Standard Daily Distance (km/day)'}</label>
                  <input
                    type="number"
                    value={standardDailyKm}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setStandardDailyKm(v);
                      if (v > 0) setStandardMonthlyKm(v * 18);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono text-xs focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{language === 'ar' ? 'المسافة الشهرية القياسية (كم/شهر)' : 'Standard Monthly Distance (km/month)'}</label>
                  <input
                    type="number"
                    value={standardMonthlyKm}
                    onChange={e => setStandardMonthlyKm(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono text-xs focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{language === 'ar' ? 'رسوم تجاوز المسافة (د.إ / كم)' : 'Excess Distance Fee (AED/km)'}</label>
                  <input
                    type="number"
                    step="0.25"
                    value={standardExcessKmRate}
                    onChange={e => setStandardExcessKmRate(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-amber-400 font-mono font-bold text-xs focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{language === 'ar' ? 'عملة التشغيل والفوترة' : 'Operating Currency'}</label>
                  <select
                    value={operatingCurrency}
                    onChange={e => setOperatingCurrency(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-[#f5d97f] font-bold text-xs focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="AED">AED - UAE Dirham (درهم إماراتي)</option>
                    <option value="USD">USD - US Dollar (دولار أمريكي)</option>
                    <option value="EUR">EUR - Euro (يورو)</option>
                    <option value="SAR">SAR - Saudi Riyal (ريال سعودي)</option>
                    <option value="GBP">GBP - British Pound (جنيه إسترليني)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-semibold">{language === 'ar' ? 'مدة استرداد التأمين (أيام)' : 'Deposit Release SLA (Days)'}</label>
                  <input
                    type="number"
                    value={depositSlaDays}
                    onChange={e => setDepositSlaDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-mono focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-400">
                {language === 'ar'
                  ? 'تم ضبط رسوم تجاوز المسافة القياسية على 2 درهم/كم مع إمكانية التعديل لكل عقد وسيارة على حدة.'
                  : 'Standard excess mileage rate calibrated to 2 AED/km with per-contract overrides enabled.'}
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="p-6 rounded-3xl bg-rose-500/5 border border-rose-500/25 space-y-4 lg:col-span-2">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                <Trash2 className="w-4 h-4" />
                <span>{language === 'ar' ? 'منطقة الخطر — حذف بيانات النظام' : 'Danger Zone — Reset System Data'}</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {language === 'ar'
                  ? 'يحذف هذا الإجراء جميع بيانات العملاء والسيارات والعقود والحجوزات وعروض الأسعار والمعاملات المالية والبنكية ورسوم سالك/درب والمهام والمستندات وسجل التدقيق نهائياً من النظام و Firestore، ويعيد ضبط أرقام التسلسل لتبدأ من جديد. لا يتأثر حسابات الموظفين وإعدادات النظام. هذا الإجراء لا يمكن التراجع عنه.'
                  : 'This permanently deletes every customer, vehicle, contract, reservation, quotation, financial/bank record, Salik/Darb toll, task, document, and audit log from the system and Firestore, and resets all numbering sequences back to the start. Staff accounts and system configuration are not affected. This cannot be undone.'}
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder={language === 'ar' ? `اكتب "${RESET_PHRASE}" للتأكيد` : `Type "${RESET_PHRASE}" to confirm`}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-zinc-950 border border-rose-500/30 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-rose-400"
                />
                <button
                  type="button"
                  disabled={resetConfirmText !== RESET_PHRASE || resetting}
                  onClick={handleResetData}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold whitespace-nowrap transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {resetting
                    ? (language === 'ar' ? 'جاري الحذف...' : 'Clearing...')
                    : (language === 'ar' ? 'حذف كل البيانات' : 'Delete All Data')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Staff Directory (read-only) */}
      {activeTab === 'roles' && (
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-6 text-xs">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">{t('staffDirectory')}</h3>
            <p className="text-zinc-400 text-xs mt-0.5">{t('staffDirectorySubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {staffDirectory.map(usr => {
              const isSelf = currentUser.id === usr.id;
              // Can only edit staff at or below your own rank (also enforced server-side).
              const canEdit = isAdmin && ROLE_RANK[usr.role] >= ROLE_RANK[currentUser.role];
              return (
                <div
                  key={usr.id}
                  className={`relative p-4 rounded-2xl border space-y-2 ${
                    isSelf
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37]/60 shadow-lg'
                      : 'bg-zinc-950/60 border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant={ROLE_BADGE_VARIANT[usr.role] || 'zinc'} size="sm">
                      {getRoleLabel(usr.role)}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      {isSelf && <Check className="w-4 h-4 text-[#f5d97f]" />}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setEditingStaff(usr)}
                          title={isAr ? 'تعديل' : 'Edit'}
                          className="p-1 rounded-lg text-zinc-500 hover:text-[#f5d97f] hover:bg-zinc-900 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <AuthenticatedImage
                      src={usr.avatar}
                      fallbackSrc="/splendor-logo.png"
                      alt={usr.name}
                      className="w-9 h-9 rounded-xl object-cover border border-zinc-800 shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="font-bold text-zinc-100 text-sm truncate">
                        {language === 'ar' && usr.nameAr ? usr.nameAr : usr.name}
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{usr.email}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{usr.branch}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!isAdmin && (
            <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-400">
              {t('adminOnlyStaffNotice')}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Security Audit Trail */}
      {activeTab === 'audit' && (
        <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden text-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-start">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                  <th className="p-4 text-start font-medium">{language === 'ar' ? 'التوقيت' : 'Timestamp'}</th>
                  <th className="p-4 text-start font-medium">{language === 'ar' ? 'المسؤول' : 'Officer'}</th>
                  <th className="p-4 text-start font-medium">{language === 'ar' ? 'الإجراء' : 'Action'}</th>
                  <th className="p-4 text-start font-medium">{language === 'ar' ? 'مرجع السجل' : 'Entity Reference'}</th>
                  <th className="p-4 text-start font-medium">{language === 'ar' ? 'وصف التدقيق' : 'Audit Description'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-4 font-mono text-zinc-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4 font-semibold text-zinc-200">{log.userName}</td>
                    <td className="p-4 font-mono text-[11px] uppercase text-[#f5d97f]">{log.action}</td>
                    <td className="p-4 font-mono text-zinc-400">{log.entityType} ({log.entityId})</td>
                    <td className="p-4 text-zinc-300">{log.newValue || log.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: SPLENDOR Connect Public Website Sync & Reconciliation */}
      {activeTab === 'connect' && (
        <div className="space-y-6 text-xs">
          <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm">
                  <Globe className="w-4 h-4 text-[#D4AF37]" />
                  <span>{language === 'ar' ? 'تقرير التوفيق والمطابقة بين الأسطول والموقع العام' : 'Fleet ↔ Website Reconciliation & Public Fleet Engine'}</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {language === 'ar'
                    ? 'فحص ومطابقة حالة جميع مركبات الأسطول، الأسعار العامة، والتحقق من عدم تسريب أي بيانات تشغيلية داخلية للواجهة العامة'
                    : 'Audit public showroom publication status, public daily rates, and enforce strict zero-leakage security boundaries'}
                </p>
              </div>

              <button
                onClick={loadReconciliation}
                disabled={loadingReport}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#D4AF37] ${loadingReport ? 'animate-spin' : ''}`} />
                <span>{language === 'ar' ? 'تحديث الفحص الآن' : 'Run Audit Check'}</span>
              </button>
            </div>

            {/* Architecture Rules Pill Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block mb-1">
                  ✓ Operational Single Source of Truth
                </span>
                <p className="text-zinc-300 text-[11px]">
                  {language === 'ar'
                    ? 'نظام الـCRM هو المرجع النهائي للبيانات، واللوحات ليست معرفاً ثابتاً للمركبة بل ترتبط بـVIN.'
                    : 'The CRM is the operational source of truth. VIN is the primary identity, plates are historical intervals.'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider block mb-1">
                  ✓ Public Data Sanitization (DTOs)
                </span>
                <p className="text-zinc-300 text-[11px]">
                  {language === 'ar'
                    ? 'الموقع لا يتلقى أي بيانات للمالكين، التكاليف، أرقام الشاسيه (VIN)، أو هوامش الربح.'
                    : 'All public endpoints strip internal revenue, expenses, GPS, VIN, and contractor data.'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-1">
                  ✓ Historical Attribution Guarantee
                </span>
                <p className="text-zinc-300 text-[11px]">
                  {language === 'ar'
                    ? 'بوابات سالك ودرب والمخالفات ترتبط تلقائياً بالعقود حتى بعد استبدال لوحة المركبة.'
                    : 'Salik & Darb toll reconciliation operates on exact plate assignment datetime spans.'}
                </p>
              </div>
            </div>

            {/* Reconciliation Table */}
            <div className="rounded-2xl border border-zinc-800 overflow-hidden mt-4">
              <table className="w-full text-start">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                    <th className="p-3 text-start font-medium">{language === 'ar' ? 'المركبة' : 'Vehicle'}</th>
                    <th className="p-3 text-start font-medium">{language === 'ar' ? 'اللوحة الحالية' : 'Current Plate'}</th>
                    <th className="p-3 text-start font-medium">{language === 'ar' ? 'حالة الـCRM' : 'CRM Status'}</th>
                    <th className="p-3 text-start font-medium">{language === 'ar' ? 'نشر الموقع' : 'Website Status'}</th>
                    <th className="p-3 text-start font-medium">{language === 'ar' ? 'سعر الموقع' : 'Public Rate'}</th>
                    <th className="p-3 text-start font-medium">{language === 'ar' ? 'المطابقة' : 'Reconciliation'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {reconciliationReport.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-zinc-500">
                        {loadingReport ? (language === 'ar' ? 'جاري الفحص...' : 'Auditing sync status...') : (language === 'ar' ? 'انقر على "تحديث الفحص الآن" لعرض تقرير المطابقة' : 'Click "Run Audit Check" to inspect synchronization.')}
                      </td>
                    </tr>
                  ) : (
                    reconciliationReport.map(item => (
                      <tr key={item.vehicleId} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="p-3 font-semibold text-zinc-200">
                          {item.vehicleName}
                          <span className="block text-[10px] text-zinc-500 font-mono">{item.vehicleId}</span>
                        </td>
                        <td className="p-3 font-mono text-zinc-300">{item.currentPlate || '—'}</td>
                        <td className="p-3">
                          <Badge variant={item.crmStatus === 'available' ? 'emerald' : 'purple'} size="sm">
                            {getStatusLabel(item.crmStatus)}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {item.websiteEnabled ? (
                            <Badge variant="sky" size="sm">{isAr ? (item.websiteVisibility === 'FEATURED' ? 'مميز' : 'منشور') : item.websiteVisibility}</Badge>
                          ) : (
                            <Badge variant="zinc" size="sm">{isAr ? 'غير منشور' : 'UNPUBLISHED'}</Badge>
                          )}
                        </td>
                        <td className="p-3 font-mono text-zinc-200">
                          {item.websiteDailyRate ? `${item.websiteDailyRate.toLocaleString()} ${isAr ? 'د.إ' : 'AED'}` : '—'}
                        </td>
                        <td className="p-3">
                          {item.syncStatus === 'SYNCED' ? (
                            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                              <Check className="w-3.5 h-3.5" />
                              <span>{isAr ? 'متطابق ومُزامن' : 'SYNCED'}</span>
                            </div>
                          ) : item.syncStatus === 'UNPUBLISHED' ? (
                            <span className="text-zinc-500 font-medium">{isAr ? 'خاص / غير منشور' : 'PRIVATE'}</span>
                          ) : (
                            <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>{isAr ? 'يحتاج مزامنة' : item.syncStatus}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Governance & Approval Engine (Phase 23) */}
      {activeTab === 'governance' && <GovernanceView />}

      <AddStaffModal
        isOpen={addStaffOpen}
        onClose={() => setAddStaffOpen(false)}
        onCreated={() => showToast(t('addStaffButton'), t('staffCreatedSuccess'), 'success')}
      />
      <EditStaffModal
        isOpen={!!editingStaff}
        onClose={() => setEditingStaff(null)}
        staffMember={editingStaff}
        onUpdated={() => showToast(
          language === 'ar' ? 'تم تحديث الموظف' : 'Staff Updated',
          language === 'ar' ? 'تم حفظ بيانات الموظف بنجاح.' : 'The staff member\'s details were saved successfully.',
          'success'
        )}
      />
    </div>
  );
};
