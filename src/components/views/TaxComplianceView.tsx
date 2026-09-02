import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileWarning,
  LockKeyhole,
  RefreshCw,
  Scale,
  ShieldCheck,
  ShieldX,
  Plus,
  Database
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { apiFetch } from '../../lib/apiFetch';
import { canTax } from '../../config/taxCompliance';
import type { TaxMasterProfile, TaxOfficialSource, TaxRuleVersion } from '../../tax/types';

interface TaxSummary {
  profile: TaxMasterProfile | null;
  sourceCount: number;
  validatedSourceCount: number;
  proposedRuleCount: number;
  validatedRuleCount: number;
  acceptedRuleCount: number;
  filingReadiness: 'NOT_READY_FOR_FILING';
  professionalValidationRequired: boolean;
}

const emptyProfile = {
  legalEntityName: 'SPLENDOR CAR RENTAL LLC',
  legalEntityNameAr: 'شركة سبلندر لتأجير السيارات ش.ذ.م.م',
  vatRegistrationStatus: 'not_configured',
  vatTrn: '',
  vatRegistrationDate: '',
  vatTaxPeriodDescription: '',
  corporateTaxRegistrationStatus: 'not_configured',
  corporateTaxTrn: '',
  corporateTaxRegistrationDate: '',
  financialYearStart: '',
  financialYearEnd: '',
  accountingStandard: '',
  vatTaxGroupStatus: 'unknown',
  corporateTaxGroupStatus: 'unknown',
  emirate: 'Dubai',
  effectiveFrom: '',
  notes: '',
  verificationStatus: 'unverified',
  reason: ''
};

export const TaxComplianceView: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'profile' | 'sources' | 'rules' | 'vat' | 'ct' | 'calendar' | 'handbook'>('overview');
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [sources, setSources] = useState<TaxOfficialSource[]>([]);
  const [rules, setRules] = useState<TaxRuleVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [profileForm, setProfileForm] = useState<any>(emptyProfile);
  const [sourceForm, setSourceForm] = useState<any>({
    domain: 'VAT', authority: 'FTA', officialTitle: '', lawDecisionGuideNumber: '', officialUrl: '',
    publicationDate: '', effectiveFrom: '', effectiveTo: '', versionRevision: '', applicablePeriod: '',
    topics: '', interpretationRequired: true, sourceLanguage: 'bilingual', notes: ''
  });
  const [sourceValidationReasons, setSourceValidationReasons] = useState<Record<string, string>>({});
  const [ruleForm, setRuleForm] = useState<any>({
    domain: 'VAT', code: '', version: '1.0.0', title: '', description: '', effectiveFrom: '', effectiveTo: '',
    sourceIds: [] as string[], interpretationRequired: true, implementationScope: ''
  });

  const canManageProfile = canTax(currentUser.role, 'tax.profile.manage');
  const canManageSources = canTax(currentUser.role, 'tax.sources.manage');
  const canProposeRules = canTax(currentUser.role, 'tax.rules.propose');

  const loadTaxFoundation = async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, sourcesRes, rulesRes] = await Promise.all([
        apiFetch('/api/tax-compliance?resource=summary'),
        apiFetch('/api/tax-compliance?resource=sources'),
        apiFetch('/api/tax-compliance?resource=rules')
      ]);
      if (!summaryRes.ok || !sourcesRes.ok || !rulesRes.ok) {
        const failed = [summaryRes, sourcesRes, rulesRes].find(response => !response.ok)!;
        const body = await failed.json().catch(() => ({}));
        throw new Error(body?.error || `Tax Compliance API failed (${failed.status}).`);
      }
      const nextSummary = await summaryRes.json() as TaxSummary;
      const nextSources = await sourcesRes.json() as TaxOfficialSource[];
      const nextRules = await rulesRes.json() as TaxRuleVersion[];
      setSummary(nextSummary);
      setSources(nextSources);
      setRules(nextRules);
      if (nextSummary.profile) {
        setProfileForm({ ...emptyProfile, ...nextSummary.profile, reason: '' });
      }
    } catch (err: any) {
      setError(err?.message || 'Tax Compliance data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadTaxFoundation(); }, []);

  const readinessItems = useMemo(() => [
    { labelEn: 'Tax Master Profile', labelAr: 'الملف الضريبي الرئيسي', ready: Boolean(summary?.profile) },
    { labelEn: 'Validated official sources', labelAr: 'المصادر الرسمية المراجعة', ready: (summary?.validatedSourceCount || 0) > 0 },
    { labelEn: 'Accepted tax rules', labelAr: 'القواعد الضريبية المعتمدة', ready: (summary?.acceptedRuleCount || 0) > 0 },
    { labelEn: 'Professional validation', labelAr: 'اعتماد مختص الضرائب', ready: false },
    { labelEn: 'VAT filing engine', labelAr: 'محرك إقرار القيمة المضافة', ready: false },
    { labelEn: 'Corporate Tax filing engine', labelAr: 'محرك إقرار ضريبة الشركات', ready: false },
    { labelEn: 'Historical parallel run', labelAr: 'إعادة إنتاج إقرار تاريخي', ready: false },
    { labelEn: 'Evidence & filing reconciliation', labelAr: 'أدلة التقديم ومطابقة السداد', ready: false }
  ], [summary]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorking(true); setError(''); setMessage('');
    try {
      const response = await apiFetch('/api/tax-compliance?resource=profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profileForm)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Tax profile update failed (${response.status}).`);
      setMessage(language === 'ar' ? 'تم حفظ النسخة الجديدة من الملف الضريبي مع سجل تدقيق وتاريخ سابق محفوظ.' : 'Tax Master Profile version saved with immutable history and audit evidence.');
      await loadTaxFoundation();
    } catch (err: any) { setError(err?.message || 'Tax profile update failed.'); }
    finally { setWorking(false); }
  };

  const addSource = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorking(true); setError(''); setMessage('');
    try {
      const payload = {
        ...sourceForm,
        topics: String(sourceForm.topics || '').split(',').map((value: string) => value.trim()).filter(Boolean),
        retrievedAt: new Date().toISOString()
      };
      const response = await apiFetch('/api/tax-compliance?resource=sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Source registration failed (${response.status}).`);
      setSourceForm((prev: any) => ({ ...prev, officialTitle: '', lawDecisionGuideNumber: '', officialUrl: '', publicationDate: '', effectiveFrom: '', effectiveTo: '', versionRevision: '', applicablePeriod: '', topics: '', notes: '' }));
      setMessage(language === 'ar' ? 'تم تسجيل المصدر كدليل Proposed فقط. يحتاج مراجعة مستقلة قبل استخدامه في قاعدة معتمدة.' : 'Official source registered as Proposed evidence only. Independent validation is still required.');
      await loadTaxFoundation();
    } catch (err: any) { setError(err?.message || 'Official source registration failed.'); }
    finally { setWorking(false); }
  };

  const validateSource = async (sourceId: string) => {
    const reason = String(sourceValidationReasons[sourceId] || '').trim();
    if (!reason) {
      setError(language === 'ar' ? 'اكتب سبب المراجعة والتحقق من المصدر أولًا.' : 'Enter a source-validation reason first.');
      return;
    }
    setWorking(true); setError(''); setMessage('');
    try {
      const response = await apiFetch('/api/tax-compliance?resource=sources&action=validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId, reason })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Source validation failed (${response.status}).`);
      setSourceValidationReasons(prev => ({ ...prev, [sourceId]: '' }));
      setMessage(language === 'ar' ? 'تم توثيق مراجعة المصدر. هذا لا يعني اعتماد أي تفسير ضريبي.' : 'Source authenticity review recorded. This does not accept any tax interpretation.');
      await loadTaxFoundation();
    } catch (err: any) { setError(err?.message || 'Source validation failed.'); }
    finally { setWorking(false); }
  };

  const proposeRule = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorking(true); setError(''); setMessage('');
    try {
      const response = await apiFetch('/api/tax-compliance?resource=rules&action=propose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ruleForm)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Rule proposal failed (${response.status}).`);
      setRuleForm((prev: any) => ({ ...prev, code: '', title: '', description: '', implementationScope: '', sourceIds: [] }));
      setMessage(language === 'ar' ? 'تم إنشاء نسخة قاعدة Proposed. لا تؤثر على أي حساب أو إقرار حتى الاعتماد المهني والتقني.' : 'Proposed rule version created. It cannot affect filing or calculations until professional and technical acceptance.');
      await loadTaxFoundation();
    } catch (err: any) { setError(err?.message || 'Tax rule proposal failed.'); }
    finally { setWorking(false); }
  };

  const tabs = [
    ['overview', 'Overview', 'نظرة عامة'], ['profile', 'Tax Profile', 'الملف الضريبي'],
    ['sources', 'Official Sources', 'المصادر الرسمية'], ['rules', 'Tax Rules', 'القواعد الضريبية'],
    ['vat', 'VAT', 'ضريبة القيمة المضافة'], ['ct', 'Corporate Tax', 'ضريبة الشركات'],
    ['calendar', 'Tax Calendar', 'التقويم الضريبي'], ['handbook', 'Handbook', 'كتيب الإرشادات']
  ] as const;

  const lockedModule = (titleEn: string, titleAr: string, detailEn: string, detailAr: string) => (
    <div className="rounded-3xl border border-amber-500/20 bg-zinc-900/70 p-8 text-center space-y-4">
      <LockKeyhole className="w-10 h-10 text-amber-400 mx-auto" />
      <div>
        <h3 className="font-display font-bold text-zinc-100 text-lg">{language === 'ar' ? titleAr : titleEn}</h3>
        <p className="text-xs text-zinc-400 mt-2 max-w-2xl mx-auto">{language === 'ar' ? detailAr : detailEn}</p>
      </div>
      <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] font-bold">
        <ShieldX className="w-3.5 h-3.5" /> NOT READY FOR FILING
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-6 h-6 text-[#D4AF37]" />
            <h2 className="text-2xl font-display font-bold text-zinc-100">{language === 'ar' ? 'الامتثال الضريبي' : 'Tax Compliance'}</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-3xl">
            {language === 'ar'
              ? 'مساحة مستقلة لبناء وإثبات وإدارة ضريبة القيمة المضافة وضريبة الشركات. لا تعتبر هذه الشاشة تصريحًا بأن النظام جاهز لتقديم الإقرارات.'
              : 'Independent VAT and Corporate Tax governance workspace. This screen does not represent the system as filing-ready.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-300 text-[11px] font-bold flex items-center gap-2">
            <ShieldX className="w-4 h-4" /> NOT READY FOR FILING
          </div>
          <button onClick={() => void loadTaxFoundation()} disabled={loading || working} className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}
      {message && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" />{message}</div>}

      <div className="flex gap-2 overflow-x-auto border-b border-zinc-800 pb-2">
        {tabs.map(([id, en, ar]) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${activeTab === id ? 'bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#f5d97f]' : 'text-zinc-400 hover:text-zinc-200'}`}>
            {language === 'ar' ? ar : en}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              ['Official Sources', 'المصادر الرسمية', summary?.sourceCount || 0, Database],
              ['Validated Sources', 'المصادر المراجعة', summary?.validatedSourceCount || 0, ShieldCheck],
              ['Proposed / Review Rules', 'قواعد مقترحة/للمراجعة', (summary?.proposedRuleCount || 0) + (summary?.validatedRuleCount || 0), FileWarning],
              ['Accepted Rules', 'القواعد المعتمدة', summary?.acceptedRuleCount || 0, FileCheck2]
            ].map(([en, ar, value, Icon]: any) => (
              <div key={en} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 flex items-center justify-between">
                <div><p className="text-[10px] uppercase text-zinc-500 font-bold">{language === 'ar' ? ar : en}</p><p className="text-2xl font-bold text-zinc-100 mt-1">{value}</p></div>
                <Icon className="w-5 h-5 text-[#D4AF37]" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
              <h3 className="font-bold text-zinc-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#D4AF37]" />{language === 'ar' ? 'بوابات الجاهزية' : 'Filing Readiness Gates'}</h3>
              {readinessItems.map(item => (
                <div key={item.labelEn} className="flex items-center justify-between gap-3 py-2 border-b border-zinc-800/70 last:border-0 text-xs">
                  <span className="text-zinc-300">{language === 'ar' ? item.labelAr : item.labelEn}</span>
                  {item.ready ? <span className="text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />READY</span> : <span className="text-rose-400 font-bold flex items-center gap-1"><ShieldX className="w-3.5 h-3.5" />BLOCKED</span>}
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
              <h3 className="font-bold text-zinc-100">{language === 'ar' ? 'حدود المرحلة الحالية' : 'Current Foundation Boundary'}</h3>
              <p className="text-xs text-zinc-400 leading-6">{language === 'ar' ? 'المتاح الآن هو حوكمة الملف الضريبي والمصادر الرسمية وإصدارات القواعد. لا يوجد زر تقديم، ولا حساب VAT201، ولا حساب Corporate Tax قابل للتقديم حتى إكمال المراحل والتحقق المهني.' : 'The current phase governs the Tax Master Profile, official sources and rule versions. No return filing, VAT201 computation or filing-authoritative Corporate Tax calculation is enabled until later gates and professional validation are complete.'}</p>
              <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-300 text-[11px] flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{language === 'ar' ? 'صلاحيات النظام الداخلية لا تستبدل اعتماد مختص ضرائب إماراتي.' : 'Internal Splendor roles never substitute for UAE tax-professional validation.'}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <form onSubmit={saveProfile} className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-5">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-zinc-100">{language === 'ar' ? 'الملف الضريبي الرئيسي' : 'Tax Master Profile'}</h3><p className="text-[11px] text-zinc-500 mt-1">{language === 'ar' ? 'لا يتم استيراد أي TRN قديم أو قيمة hard-coded تلقائيًا. أدخل فقط البيانات المؤكدة.' : 'No historical hard-coded TRN is auto-promoted. Enter verified entity data only.'}</p></div><span className="text-[10px] rounded-full px-2 py-1 bg-zinc-800 text-zinc-400">{summary?.profile ? 'CONFIGURED' : 'NOT CONFIGURED'}</span></div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
            {[
              ['legalEntityName', 'Legal Entity Name', 'اسم الكيان القانوني', 'text'], ['legalEntityNameAr', 'Arabic Legal Name', 'الاسم القانوني بالعربية', 'text'],
              ['vatTrn', 'VAT TRN', 'رقم تسجيل VAT', 'text'], ['vatRegistrationDate', 'VAT Registration Date', 'تاريخ تسجيل VAT', 'date'],
              ['corporateTaxTrn', 'Corporate Tax TRN', 'رقم تسجيل ضريبة الشركات', 'text'], ['corporateTaxRegistrationDate', 'CT Registration Date', 'تاريخ تسجيل CT', 'date'],
              ['financialYearStart', 'Financial Year Start', 'بداية السنة المالية', 'date'], ['financialYearEnd', 'Financial Year End', 'نهاية السنة المالية', 'date'],
              ['accountingStandard', 'Accounting Standard', 'المعيار المحاسبي', 'text'], ['vatTaxPeriodDescription', 'VAT Tax Period', 'الفترة الضريبية VAT', 'text'],
              ['effectiveFrom', 'Profile Effective From', 'سريان الملف من', 'date'], ['emirate', 'Emirate', 'الإمارة', 'text']
            ].map(([key, en, ar, type]) => <label key={key} className="space-y-1"><span className="text-zinc-400">{language === 'ar' ? ar : en}</span><input disabled={!canManageProfile} type={type} value={profileForm[key] || ''} onChange={e => setProfileForm((prev: any) => ({ ...prev, [key]: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 disabled:opacity-60" /></label>)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1"><span className="text-zinc-400">VAT registration status</span><select disabled={!canManageProfile} value={profileForm.vatRegistrationStatus} onChange={e => setProfileForm((p: any) => ({ ...p, vatRegistrationStatus: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800"><option value="not_configured">Not configured</option><option value="registered">Registered</option><option value="not_registered">Not registered</option><option value="under_review">Under review</option></select></label>
            <label className="space-y-1"><span className="text-zinc-400">Corporate Tax registration status</span><select disabled={!canManageProfile} value={profileForm.corporateTaxRegistrationStatus} onChange={e => setProfileForm((p: any) => ({ ...p, corporateTaxRegistrationStatus: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800"><option value="not_configured">Not configured</option><option value="registered">Registered</option><option value="not_registered">Not registered</option><option value="under_review">Under review</option></select></label>
          </div>
          {summary?.profile && canManageProfile && <label className="block text-xs space-y-1"><span className="text-zinc-400">{language === 'ar' ? 'سبب التعديل *' : 'Change reason *'}</span><input required value={profileForm.reason || ''} onChange={e => setProfileForm((p: any) => ({ ...p, reason: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800" /></label>}
          {canManageProfile && <button disabled={working} className="px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold text-xs disabled:opacity-50">{working ? 'Saving…' : (language === 'ar' ? 'حفظ نسخة الملف الضريبي' : 'Save Tax Profile Version')}</button>}
        </form>
      )}

      {activeTab === 'sources' && (
        <div className="space-y-5">
          {canManageSources && <form onSubmit={addSource} className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4"><h3 className="font-bold text-zinc-100 flex items-center gap-2"><Plus className="w-4 h-4 text-[#D4AF37]" />{language === 'ar' ? 'تسجيل مصدر رسمي Proposed' : 'Register Official Source as Proposed Evidence'}</h3><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1"><span className="text-zinc-400">Domain</span><select value={sourceForm.domain} onChange={e => setSourceForm((p: any) => ({ ...p, domain: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800"><option>VAT</option><option>CORPORATE_TAX</option><option>TAX_PROCEDURES</option><option>E_INVOICING</option><option>CROSS_DOMAIN</option></select></label>
            <label className="space-y-1"><span className="text-zinc-400">Authority</span><select value={sourceForm.authority} onChange={e => setSourceForm((p: any) => ({ ...p, authority: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800"><option>FTA</option><option>MOF</option><option>UAE_LEGISLATION</option><option>OTHER_OFFICIAL_UAE</option></select></label>
            {[
              ['officialTitle', 'Official title', 'text'], ['lawDecisionGuideNumber', 'Law / Decision / Guide number', 'text'], ['officialUrl', 'Official HTTPS URL', 'url'],
              ['publicationDate', 'Publication date', 'date'], ['effectiveFrom', 'Effective from', 'date'], ['effectiveTo', 'Effective to', 'date'],
              ['versionRevision', 'Version / Revision', 'text'], ['applicablePeriod', 'Applicable period', 'text'], ['topics', 'Topics (comma separated)', 'text']
            ].map(([key, label, type]) => <label key={key} className="space-y-1"><span className="text-zinc-400">{label}</span><input required={['officialTitle','officialUrl'].includes(key)} type={type} value={sourceForm[key] || ''} onChange={e => setSourceForm((p: any) => ({ ...p, [key]: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800" /></label>)}
          </div><button disabled={working} className="px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold text-xs disabled:opacity-50">{language === 'ar' ? 'تسجيل المصدر المقترح' : 'Register Proposed Source'}</button></form>}
          <div className="space-y-3">{sources.length === 0 ? <div className="p-6 text-center text-zinc-500 text-xs border border-zinc-800 rounded-2xl">No official sources registered yet.</div> : sources.map(source => <div key={source.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3"><div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="text-[10px] font-mono text-[#f5d97f]">{source.id}</span><span className={`text-[10px] px-2 py-1 rounded-full font-bold ${source.status === 'validated' || source.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{source.status.toUpperCase()}</span><span className="text-[10px] text-zinc-500">{source.authority} · {source.domain}</span></div><h4 className="text-sm font-bold text-zinc-100 mt-2">{source.officialTitle}</h4><p className="text-[11px] text-zinc-500 break-all mt-1">{source.officialUrl}</p></div>{canManageSources && source.status === 'proposed' && source.createdBy !== currentUser.id && <div className="w-full lg:w-80 space-y-2"><input placeholder={language === 'ar' ? 'سبب تحقق المصدر' : 'Source validation reason'} value={sourceValidationReasons[source.id] || ''} onChange={e => setSourceValidationReasons(prev => ({ ...prev, [source.id]: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs" /><button type="button" disabled={working} onClick={() => void validateSource(source.id)} className="w-full px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">Validate official source</button></div>}</div></div>)}</div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-5">
          {canProposeRules && <form onSubmit={proposeRule} className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4"><div><h3 className="font-bold text-zinc-100">{language === 'ar' ? 'اقتراح إصدار قاعدة ضريبية' : 'Propose Tax Rule Version'}</h3><p className="text-[11px] text-zinc-500 mt-1">{language === 'ar' ? 'الاقتراح لا يغيّر أي حساب أو إقرار. الاعتماد يحتاج مصدرًا مراجعًا ودليل مختص ضرائب مستقل وFour-Eyes.' : 'Proposal does not change any calculation or filing. Acceptance requires validated sources, external professional evidence and Four-Eyes.'}</p></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1"><span className="text-zinc-400">Domain</span><select value={ruleForm.domain} onChange={e => setRuleForm((p: any) => ({ ...p, domain: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800"><option>VAT</option><option>CORPORATE_TAX</option><option>TAX_PROCEDURES</option><option>E_INVOICING</option></select></label>
            {[
              ['code','Rule code','text'], ['version','Version','text'], ['title','Title','text'], ['effectiveFrom','Effective from','date'], ['effectiveTo','Effective to','date']
            ].map(([key,label,type]) => <label key={key} className="space-y-1"><span className="text-zinc-400">{label}</span><input required={key !== 'effectiveTo'} type={type} value={ruleForm[key] || ''} onChange={e => setRuleForm((p: any) => ({ ...p, [key]: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800" /></label>)}
          </div><label className="block text-xs space-y-1"><span className="text-zinc-400">Description / proposed legal treatment</span><textarea required rows={4} value={ruleForm.description} onChange={e => setRuleForm((p: any) => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800" /></label><div className="text-xs"><p className="text-zinc-400 mb-2">Supporting official sources</p><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{sources.map(source => <label key={source.id} className="flex items-start gap-2 p-2.5 rounded-xl border border-zinc-800 bg-zinc-950"><input type="checkbox" checked={ruleForm.sourceIds.includes(source.id)} onChange={e => setRuleForm((p: any) => ({ ...p, sourceIds: e.target.checked ? [...p.sourceIds, source.id] : p.sourceIds.filter((id: string) => id !== source.id) }))} /><span><b className="text-zinc-200">{source.officialTitle}</b><small className="block text-zinc-500">{source.status} · {source.id}</small></span></label>)}</div></div><button disabled={working || ruleForm.sourceIds.length === 0} className="px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold text-xs disabled:opacity-40">{language === 'ar' ? 'إنشاء Proposed Rule' : 'Create Proposed Rule'}</button></form>}
          <div className="space-y-3">{rules.length === 0 ? <div className="p-6 text-center text-zinc-500 text-xs border border-zinc-800 rounded-2xl">No tax rules proposed yet.</div> : rules.map(rule => <div key={rule.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-[10px] text-[#f5d97f]">{rule.code} v{rule.version}</span><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${rule.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-300' : rule.status === 'validated' ? 'bg-sky-500/10 text-sky-300' : 'bg-amber-500/10 text-amber-300'}`}>{rule.status.toUpperCase()}</span><span className="text-[10px] text-zinc-500">effective {rule.effectiveFrom}</span></div><h4 className="font-bold text-zinc-100 mt-2">{rule.title}</h4><p className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap">{rule.description}</p>{rule.status !== 'accepted' && <div className="mt-3 p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-300 text-[11px]">{language === 'ar' ? 'غير مسموح باستخدام هذه القاعدة في إقرار قابل للتقديم حتى استكمال Professional Validation والاعتماد المستقل.' : 'This rule is not filing-authoritative until professional validation evidence and independent acceptance are complete.'}</div>}</div>)}</div>
        </div>
      )}

      {activeTab === 'vat' && lockedModule('VAT Filing Engine', 'محرك ضريبة القيمة المضافة', 'Tax Point, invoice validation, VAT ledger, VAT201 box mapping and reconciliation will be enabled only after the accepted-rule foundation exists.', 'سيتم فتح Tax Point والتحقق من الفواتير وVAT Ledger وربط VAT201 والمطابقة فقط بعد وجود قواعد معتمدة.')}
      {activeTab === 'ct' && lockedModule('Corporate Tax Engine', 'محرك ضريبة الشركات', 'Corporate Tax adjustment schedules will remain blocked until company facts, accounting-period rules and professional tax treatments are validated.', 'جداول تعديلات ضريبة الشركات ستظل مغلقة حتى تأكيد بيانات الشركة والقواعد والفحص المهني.')}
      {activeTab === 'calendar' && lockedModule('Tax Calendar & Escalation', 'التقويم والتنبيهات الضريبية', 'Deadline automation will be generated from the verified Tax Master Profile and official effective-dated deadline sources, never from guessed periods.', 'سيتم توليد المواعيد من الملف الضريبي المؤكد ومصادر المواعيد الرسمية المؤرخة، وليس من افتراضات.')}
      {activeTab === 'handbook' && lockedModule('Tax Operations Handbook', 'كتيب تشغيل الضرائب', 'The bilingual interactive handbook will be versioned with accepted rule sets and the implemented filing workflow so it cannot drift away from the system.', 'سيكون الكتيب التفاعلي العربي/الإنجليزي مرتبطًا بإصدارات القواعد المعتمدة ومسار العمل الفعلي حتى لا يصبح أقدم من النظام.')}
    </div>
  );
};
