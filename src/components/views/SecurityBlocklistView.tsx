import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Plus, Check, X, Loader2, Undo2, Trash2, Building2, UserRound } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import type { BlocklistEntry, BlocklistTier } from '../../types';

type IdentifierType =
  | 'emirates_id' | 'passport' | 'gcc_id' | 'national_id' | 'driving_license'
  | 'international_driving_permit' | 'trade_license' | 'company_registration'
  | 'tax_registration' | 'phone' | 'email' | 'other';

type IdentifierRow = { type: IdentifierType; value: string; issuingCountry: string; expiryDate: string; label: string };
type ExtendedEntry = BlocklistEntry & {
  subjectType?: 'individual' | 'company';
  identifiers?: Array<{ type: IdentifierType; value: string; issuingCountry?: string; expiryDate?: string; label?: string }>;
  profile?: Record<string, string>;
};

interface ProcurementApproval {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

const IDENTIFIER_TYPES: Array<{ value: IdentifierType; en: string; ar: string; country?: boolean }> = [
  { value: 'emirates_id', en: 'Emirates ID', ar: 'الهوية الإماراتية' },
  { value: 'passport', en: 'Passport', ar: 'جواز السفر', country: true },
  { value: 'gcc_id', en: 'GCC ID', ar: 'هوية خليجية', country: true },
  { value: 'national_id', en: 'Foreign National ID', ar: 'هوية وطنية أجنبية', country: true },
  { value: 'driving_license', en: 'Driving Licence', ar: 'رخصة قيادة', country: true },
  { value: 'international_driving_permit', en: 'International Driving Permit', ar: 'رخصة قيادة دولية', country: true },
  { value: 'trade_license', en: 'Trade Licence', ar: 'رخصة تجارية' },
  { value: 'company_registration', en: 'Company Registration', ar: 'رقم تسجيل الشركة' },
  { value: 'tax_registration', en: 'Tax Registration / TRN', ar: 'الرقم الضريبي / TRN' },
  { value: 'phone', en: 'Phone / WhatsApp', ar: 'هاتف / واتساب' },
  { value: 'email', en: 'Email', ar: 'البريد الإلكتروني' },
  { value: 'other', en: 'Other reliable identifier', ar: 'معرّف موثوق آخر' }
];

const blankIdentifier = (type: IdentifierType = 'emirates_id'): IdentifierRow => ({ type, value: '', issuingCountry: '', expiryDate: '', label: '' });
const countryRelevant = (type: IdentifierType) => IDENTIFIER_TYPES.find(item => item.value === type)?.country === true;
const identifierLabel = (type: IdentifierType, language: 'ar' | 'en') => {
  const def = IDENTIFIER_TYPES.find(item => item.value === type);
  return language === 'ar' ? def?.ar || type : def?.en || type;
};

export const SecurityBlocklistView: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const { showToast } = useCRM();
  const isDecider = currentUser.role === 'ceo' || currentUser.role === 'admin';
  const canManage = isDecider || currentUser.role === 'operations';
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<ExtendedEntry[]>([]);
  const [approvals, setApprovals] = useState<ProcurementApproval[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [unblockModalEntry, setUnblockModalEntry] = useState<ExtendedEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, approvalsRes] = await Promise.all([apiFetch('/api/blocklist'), apiFetch('/api/procurement/approvals')]);
      if (!entriesRes.ok) throw new Error((await entriesRes.json().catch(() => null))?.error || 'Blocklist could not be loaded.');
      setEntries(await entriesRes.json());
      if (approvalsRes.ok) {
        const all: ProcurementApproval[] = await approvalsRes.json();
        setApprovals(all.filter(a => a.entityType === 'BlocklistEntry'));
      }
    } catch (error: any) {
      showToast(language === 'ar' ? 'فشل تحميل قائمة الحظر' : 'Blocklist load failed', error?.message || '', 'error');
    } finally {
      setLoading(false);
    }
  }, [language, showToast]);

  useEffect(() => { load(); }, [load]);

  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const decideApproval = async (approval: ProcurementApproval, decision: 'approved' | 'rejected') => {
    const note = window.prompt(language === 'ar' ? 'ملاحظة القرار مطلوبة:' : 'A decision note is required:');
    if (!note?.trim()) return;
    setBusyKey(approval.id);
    try {
      const res = await apiFetch(`/api/procurement/approvals/${encodeURIComponent(approval.id)}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note: note.trim() })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Decision failed.');
      showToast(decision === 'approved' ? (language === 'ar' ? 'تمت الموافقة' : 'Approved') : (language === 'ar' ? 'تم الرفض' : 'Rejected'), approval.entityId);
      await load();
    } catch (error: any) {
      showToast(language === 'ar' ? 'فشل القرار' : 'Decision failed', error?.message || '', 'error');
    } finally { setBusyKey(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-16 text-zinc-500 text-sm gap-2"><Loader2 className="w-4 h-4 animate-spin" />{language === 'ar' ? 'جارِ التحميل...' : 'Loading...'}</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-12 text-xs">
      <div>
        <h2 className="text-2xl font-display font-bold text-zinc-100">{language === 'ar' ? 'الأمن والقائمة المحظورة' : 'Security & Blocklist'}</h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          {language === 'ar'
            ? 'حظر أفراد أو شركات باستخدام أي معرّفات موثوقة متاحة. المطابقة آلية فقط على المعرّفات الدقيقة، وليس الاسم وحده، لمنع الحظر الخاطئ.'
            : 'Block individuals or companies using any available reliable identifiers. Automatic matching uses exact identifiers, never name alone, to avoid false blocks.'}
        </p>
      </div>

      {canManage && <div className="flex justify-end"><button onClick={() => setNewModalOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold"><Plus className="w-3.5 h-3.5" />{language === 'ar' ? 'حظر جديد' : 'New Block'}</button></div>}

      {pendingApprovals.length > 0 && <div className="space-y-2">
        <h3 className="text-sm font-bold text-zinc-100">{language === 'ar' ? `طلبات فك حظر معلّقة (${pendingApprovals.length})` : `Pending unblock requests (${pendingApprovals.length})`}</h3>
        {pendingApprovals.map(a => {
          const entry = entries.find(e => e.id === a.entityId);
          return <div key={a.id} className="p-3 rounded-xl bg-zinc-900/60 border border-amber-500/30 flex items-center justify-between gap-3">
            <div><p className="font-semibold text-zinc-100">{entry?.customerName || entry?.profile?.legalName || entry?.id || a.entityId}</p><p className="text-zinc-400 mt-0.5">{a.requestedByName} ({a.requestedByRole}) · {a.reason}</p></div>
            {isDecider && a.requestedBy !== currentUser.id && <div className="flex gap-1.5"><button disabled={busyKey === a.id} onClick={() => decideApproval(a, 'approved')} className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400" title="Approve"><Check className="w-3.5 h-3.5" /></button><button disabled={busyKey === a.id} onClick={() => decideApproval(a, 'rejected')} className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400" title="Reject"><X className="w-3.5 h-3.5" /></button></div>}
          </div>;
        })}
      </div>}

      <div className="space-y-2.5">
        <h3 className="text-sm font-bold text-zinc-100">{language === 'ar' ? `الإدخالات (${entries.length})` : `Entries (${entries.length})`}</h3>
        {entries.map(entry => {
          const identifiers = entry.identifiers?.length ? entry.identifiers : [{ type: entry.identifierType as IdentifierType, value: entry.identifierValue, issuingCountry: entry.identifierCountry }];
          const hasPending = pendingApprovals.some(a => a.entityId === entry.id);
          return <div key={entry.id} className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2"><ShieldAlert className={entry.status === 'active' ? 'w-4 h-4 text-rose-400' : 'w-4 h-4 text-zinc-600'} /><span className="font-semibold text-zinc-100">{entry.customerName || entry.profile?.legalName || (language === 'ar' ? 'سجل بدون اسم' : 'Unnamed record')}</span><Badge variant={entry.tier === 'full' ? 'rose' : 'amber'} size="sm">{entry.tier === 'full' ? (language === 'ar' ? 'حظر كلي' : 'Full') : (language === 'ar' ? 'مشروط' : 'Conditional')}</Badge><Badge variant={entry.status === 'active' ? 'rose' : 'zinc'} size="sm">{entry.status}</Badge></div>
              <span className="font-mono text-zinc-500">{entry.id}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">{identifiers.map((id, index) => <span key={`${id.type}-${index}`} className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-zinc-300">{identifierLabel(id.type, language)}: {id.value}{id.issuingCountry ? ` · ${id.issuingCountry}` : ''}</span>)}</div>
            <p className="text-zinc-300 mt-2">{entry.reason}</p>
            {entry.conditionalNote && <p className="text-amber-400 mt-1">{language === 'ar' ? 'الشرط:' : 'Condition:'} {entry.conditionalNote}</p>}
            <p className="text-zinc-600 text-[10px] mt-2">{entry.createdByName} · {new Date(entry.createdAt).toLocaleString()}</p>
            {canManage && entry.status === 'active' && !hasPending && <button onClick={() => setUnblockModalEntry(entry)} className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-sky-400"><Undo2 className="w-3 h-3" />{language === 'ar' ? 'طلب فك الحظر' : 'Request unblock'}</button>}
          </div>;
        })}
        {entries.length === 0 && <p className="text-zinc-500">{language === 'ar' ? 'لا توجد إدخالات في القائمة المحظورة.' : 'No blocklist entries.'}</p>}
      </div>

      <NewBlockModal isOpen={newModalOpen} onClose={() => setNewModalOpen(false)} onCreated={async () => { setNewModalOpen(false); await load(); }} />
      <RequestUnblockModal entry={unblockModalEntry} onClose={() => setUnblockModalEntry(null)} onCreated={async () => { setUnblockModalEntry(null); await load(); }} />
    </div>
  );
};

const NewBlockModal: React.FC<{ isOpen: boolean; onClose: () => void; onCreated: () => Promise<void> | void }> = ({ isOpen, onClose, onCreated }) => {
  const { language } = useLanguage();
  const { showToast } = useCRM();
  const [subjectType, setSubjectType] = useState<'individual' | 'company'>('individual');
  const [identifiers, setIdentifiers] = useState<IdentifierRow[]>([blankIdentifier()]);
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [tier, setTier] = useState<BlocklistTier>('full');
  const [conditionalNote, setConditionalNote] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSubjectType('individual'); setIdentifiers([blankIdentifier()]); setProfile({}); setTier('full'); setConditionalNote(''); setReason('');
  }, [isOpen]);

  const usableIdentifiers = useMemo(() => identifiers.filter(item => item.value.trim()), [identifiers]);
  const valid = usableIdentifiers.length > 0 && reason.trim() && usableIdentifiers.every(item => item.type !== 'passport' || item.issuingCountry.trim()) && (tier !== 'conditional' || conditionalNote.trim());
  const updateProfile = (key: string, value: string) => setProfile(prev => ({ ...prev, [key]: value }));
  const updateIdentifier = (index: number, patch: Partial<IdentifierRow>) => setIdentifiers(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const primary = usableIdentifiers[0];
      const res = await apiFetch('/api/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectType,
          identifiers: usableIdentifiers.map(item => ({ type: item.type, value: item.value.trim(), issuingCountry: item.issuingCountry.trim() || undefined, expiryDate: item.expiryDate || undefined, label: item.label.trim() || undefined })),
          identifierType: primary.type,
          identifierValue: primary.value,
          identifierCountry: primary.issuingCountry || undefined,
          customerName: subjectType === 'company' ? (profile.legalName || profile.tradeName) : profile.fullName,
          profile,
          tier,
          conditionalNote: tier === 'conditional' ? conditionalNote.trim() : undefined,
          reason: reason.trim()
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || (language === 'ar' ? 'تعذر حفظ الحظر.' : 'The block could not be saved.'));
      // Success invariant: close only after a real successful API response,
      // then show an unambiguous confirmation and refresh the authoritative list.
      await onCreated();
      showToast(language === 'ar' ? 'تم الحفظ بنجاح' : 'Saved successfully', language === 'ar' ? `تم إنشاء الحظر ${data.id}` : `Block ${data.id} was created.`);
    } catch (error: any) {
      showToast(language === 'ar' ? 'فشل حفظ الحظر' : 'Block save failed', error?.message || '', 'error');
    } finally { setSubmitting(false); }
  };

  return <Modal isOpen={isOpen} onClose={onClose} title={language === 'ar' ? 'إضافة إلى قائمة الحظر' : 'Add to Blocklist'} subtitle={language === 'ar' ? 'أدخل كل المعلومات المتاحة. يلزم معرّف موثوق واحد على الأقل.' : 'Enter every available detail. At least one reliable identifier is required.'} maxWidth="2xl">
    <form onSubmit={submit} className="space-y-5 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setSubjectType('individual'); if (identifiers.length === 1 && ['trade_license', 'company_registration', 'tax_registration'].includes(identifiers[0].type)) setIdentifiers([blankIdentifier('passport')]); }} className={`p-3 rounded-xl border flex items-center justify-center gap-2 ${subjectType === 'individual' ? 'border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#f5d97f]' : 'border-zinc-800 text-zinc-400'}`}><UserRound className="w-4 h-4" />{language === 'ar' ? 'فرد / سائح' : 'Individual / Tourist'}</button>
        <button type="button" onClick={() => { setSubjectType('company'); if (identifiers.length === 1 && identifiers[0].type === 'emirates_id') setIdentifiers([blankIdentifier('trade_license')]); }} className={`p-3 rounded-xl border flex items-center justify-center gap-2 ${subjectType === 'company' ? 'border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#f5d97f]' : 'border-zinc-800 text-zinc-400'}`}><Building2 className="w-4 h-4" />{language === 'ar' ? 'شركة' : 'Company'}</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {subjectType === 'individual' ? <>
          <Field label={language === 'ar' ? 'الاسم الكامل' : 'Full name'} value={profile.fullName || ''} onChange={v => updateProfile('fullName', v)} />
          <Field label={language === 'ar' ? 'الجنسية' : 'Nationality'} value={profile.nationality || ''} onChange={v => updateProfile('nationality', v)} />
          <Field label={language === 'ar' ? 'تاريخ الميلاد' : 'Date of birth'} value={profile.dateOfBirth || ''} onChange={v => updateProfile('dateOfBirth', v)} type="date" />
          <Field label={language === 'ar' ? 'الهاتف' : 'Phone'} value={profile.phone || ''} onChange={v => updateProfile('phone', v)} />
          <Field label={language === 'ar' ? 'البريد الإلكتروني' : 'Email'} value={profile.email || ''} onChange={v => updateProfile('email', v)} />
          <Field label={language === 'ar' ? 'العنوان' : 'Address'} value={profile.address || ''} onChange={v => updateProfile('address', v)} />
        </> : <>
          <Field label={language === 'ar' ? 'الاسم القانوني للشركة' : 'Legal company name'} value={profile.legalName || ''} onChange={v => updateProfile('legalName', v)} />
          <Field label={language === 'ar' ? 'الاسم التجاري' : 'Trade name'} value={profile.tradeName || ''} onChange={v => updateProfile('tradeName', v)} />
          <Field label={language === 'ar' ? 'دولة / جهة التسجيل' : 'Registration country / jurisdiction'} value={profile.registrationCountry || ''} onChange={v => updateProfile('registrationCountry', v)} />
          <Field label={language === 'ar' ? 'اسم المدير / المفوض' : 'Manager / authorized person'} value={profile.managerName || ''} onChange={v => updateProfile('managerName', v)} />
          <Field label={language === 'ar' ? 'هاتف الشركة / المدير' : 'Company / manager phone'} value={profile.managerPhone || ''} onChange={v => updateProfile('managerPhone', v)} />
          <Field label={language === 'ar' ? 'البريد الإلكتروني' : 'Email'} value={profile.email || ''} onChange={v => updateProfile('email', v)} />
          <Field label={language === 'ar' ? 'العنوان' : 'Address'} value={profile.address || ''} onChange={v => updateProfile('address', v)} />
        </>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between"><label className="font-semibold text-zinc-200">{language === 'ar' ? 'المعرّفات المتاحة *' : 'Available identifiers *'}</label><button type="button" onClick={() => setIdentifiers(prev => [...prev, blankIdentifier(subjectType === 'company' ? 'trade_license' : 'passport')])} className="text-[#f5d97f] flex items-center gap-1"><Plus className="w-3 h-3" />{language === 'ar' ? 'إضافة معرّف' : 'Add identifier'}</button></div>
        {identifiers.map((item, index) => <div key={index} className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/50 grid grid-cols-1 sm:grid-cols-12 gap-2">
          <select value={item.type} onChange={e => updateIdentifier(index, { type: e.target.value as IdentifierType, issuingCountry: '' })} className="sm:col-span-3 px-2 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100">{IDENTIFIER_TYPES.map(t => <option key={t.value} value={t.value}>{language === 'ar' ? t.ar : t.en}</option>)}</select>
          <input value={item.value} onChange={e => updateIdentifier(index, { value: e.target.value })} placeholder={language === 'ar' ? 'الرقم / القيمة' : 'Number / value'} className="sm:col-span-4 px-2 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100" />
          <input value={item.issuingCountry} onChange={e => updateIdentifier(index, { issuingCountry: e.target.value })} placeholder={countryRelevant(item.type) ? (language === 'ar' ? 'دولة الإصدار' : 'Issuing country') : (language === 'ar' ? 'الدولة / الجهة (اختياري)' : 'Country / authority (optional)')} className="sm:col-span-3 px-2 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100" />
          <input type="date" value={item.expiryDate} onChange={e => updateIdentifier(index, { expiryDate: e.target.value })} className="sm:col-span-1 px-1 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100" title={language === 'ar' ? 'تاريخ الانتهاء' : 'Expiry date'} />
          <button type="button" onClick={() => setIdentifiers(prev => prev.length === 1 ? [blankIdentifier(subjectType === 'company' ? 'trade_license' : 'emirates_id')] : prev.filter((_, i) => i !== index))} className="sm:col-span-1 flex items-center justify-center text-rose-400"><Trash2 className="w-4 h-4" /></button>
        </div>)}
        <p className="text-[10px] text-zinc-500">{language === 'ar' ? 'يمكن إضافة جواز، هوية، رخصة محلية أو أجنبية، رخصة دولية، ترخيص شركة، TRN، هاتف، بريد أو أي معرّف موثوق آخر.' : 'Add passport, national ID, local/foreign driving licence, international permit, company licence, TRN, phone, email or another reliable identifier.'}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'مستوى الحظر *' : 'Block tier *'}</label><select value={tier} onChange={e => setTier(e.target.value as BlocklistTier)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"><option value="full">{language === 'ar' ? 'حظر كلي' : 'Full block'}</option><option value="conditional">{language === 'ar' ? 'حظر مشروط' : 'Conditional block'}</option></select></div>{tier === 'conditional' && <Field label={language === 'ar' ? 'شروط السماح *' : 'Required conditions *'} value={conditionalNote} onChange={setConditionalNote} />}</div>
      <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'سبب الحظر *' : 'Reason *'}</label><textarea required rows={3} value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" /></div>
      <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'ملاحظات إضافية' : 'Additional notes'}</label><textarea rows={2} value={profile.notes || ''} onChange={e => updateProfile('notes', e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" /></div>
      <div className="pt-3 border-t border-zinc-800 flex justify-end gap-3"><button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={submitting || !valid} className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold disabled:opacity-50 flex items-center gap-2">{submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{language === 'ar' ? 'حفظ وإنشاء الحظر' : 'Save & create block'}</button></div>
    </form>
  </Modal>;
};

const Field: React.FC<{ label: string; value: string; onChange: (value: string) => void; type?: string }> = ({ label, value, onChange, type = 'text' }) => <div><label className="block text-zinc-400 mb-1">{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" /></div>;

const RequestUnblockModal: React.FC<{ entry: ExtendedEntry | null; onClose: () => void; onCreated: () => Promise<void> | void }> = ({ entry, onClose, onCreated }) => {
  const { language } = useLanguage();
  const { showToast } = useCRM();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { if (entry) setReason(''); }, [entry]);
  if (!entry) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!reason.trim() || submitting) return; setSubmitting(true);
    try {
      const res = await apiFetch(`/api/blocklist/${encodeURIComponent(entry.id)}/unblock-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
      const data = await res.json().catch(() => null); if (!res.ok) throw new Error(data?.error || 'Request failed.');
      await onCreated();
      showToast(language === 'ar' ? 'تم إرسال الطلب' : 'Request submitted', entry.id);
    } catch (error: any) { showToast(language === 'ar' ? 'فشل الطلب' : 'Request failed', error?.message || '', 'error'); }
    finally { setSubmitting(false); }
  };
  return <Modal isOpen={!!entry} onClose={onClose} title={language === 'ar' ? 'طلب فك الحظر' : 'Request Unblock'} subtitle={language === 'ar' ? 'يتطلب موافقة شخص آخر مخوّل.' : 'Requires a different authorized approver.'} maxWidth="sm"><form onSubmit={submit} className="space-y-4 text-xs"><div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800"><p className="text-zinc-200">{entry.customerName || entry.id}</p><p className="text-zinc-500 mt-1">{entry.reason}</p></div><textarea required rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder={language === 'ar' ? 'سبب فك الحظر' : 'Reason for unblock'} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" /><div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={submitting || !reason.trim()} className="px-5 py-2 rounded-xl bg-sky-500 text-zinc-950 font-semibold">{language === 'ar' ? 'إرسال الطلب' : 'Submit request'}</button></div></form></Modal>;
};
