import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Plus, Check, X, Loader2, Undo2, AlertTriangle, UploadCloud, CheckCircle2, Search, CalendarClock } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { formatDate, formatDateTime, formatPhoneNumber } from '../../lib/dateFormat';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { DayMonthYearDateInput } from '../common/DayMonthYearDateInput';
import { PhoneNumberInput } from '../common/PhoneNumberInput';
import { EmiratesIdInput } from '../common/EmiratesIdInput';
import { uploadFile, formatFileSize } from '../../lib/upload';
import { ALL_COUNTRIES } from '../../lib/customerData';
import type { BlocklistEntry, BlocklistIdentifierType, BlocklistTier, BlocklistBanType } from '../../types';

function isBanExpired(entry: BlocklistEntry): boolean {
  if (entry.banType !== 'temporary' || !entry.expiryDate) return false;
  return new Date(entry.expiryDate).getTime() < Date.now();
}

/**
 * Security Blocklist / Watchlist (Splendor Master Rule Set, Module 03).
 * See src/server/blocklist.ts for the backend -- matched ONLY by an exact
 * identifier pair (passport number + issuing country, or Emirates ID
 * number), never by name; tiered (full vs conditional); removal is
 * approval-gated via the shared Segregation-of-Duties engine
 * (procurementApprovals.ts), surfaced here as its own inbox rather than
 * requiring staff to go find it under Procurement & Suppliers.
 */

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
  decidedByName?: string;
  decisionNote?: string;
}

export const SecurityBlocklistView: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const { showToast } = useCRM();
  const isDecider = currentUser.role === 'ceo' || currentUser.role === 'admin';
  const canManage = isDecider || currentUser.role === 'operations';

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<BlocklistEntry[]>([]);
  const [approvals, setApprovals] = useState<ProcurementApproval[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [unblockModalEntry, setUnblockModalEntry] = useState<BlocklistEntry | null>(null);
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, approvalsRes] = await Promise.all([
        apiFetch('/api/blocklist'),
        apiFetch('/api/procurement/approvals')
      ]);
      if (entriesRes.ok) setEntries(await entriesRes.json());
      if (approvalsRes.ok) {
        const all: ProcurementApproval[] = await approvalsRes.json();
        setApprovals(all.filter(a => a.entityType === 'BlocklistEntry'));
      }
    } catch (e) {
      console.error('Failed to load blocklist data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decideApproval = async (approval: ProcurementApproval, decision: 'approved' | 'rejected') => {
    const note = window.prompt(language === 'ar' ? 'ملاحظة القرار مطلوبة:' : 'A decision note is required:');
    if (!note || !note.trim()) return;
    setBusyKey(approval.id);
    try {
      const res = await apiFetch(`/api/procurement/approvals/${encodeURIComponent(approval.id)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to decide this request.');
      showToast(
        decision === 'approved' ? (language === 'ar' ? 'تمت الموافقة' : 'Approved') : (language === 'ar' ? 'تم الرفض' : 'Rejected'),
        approval.entityId
      );
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل القرار' : 'Decision failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  const pendingApprovals = approvals.filter(a => a.status === 'pending');

  const filteredEntries = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return entries.filter(entry => {
      if (text) {
        const haystack = [entry.id, entry.identifierValue, entry.customerName, entry.nationality, entry.mobile, entry.reason]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      if (dateFrom && entry.createdAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && entry.createdAt.slice(0, 10) > dateTo) return false;
      return true;
    });
  }, [entries, searchText, dateFrom, dateTo]);

  const entryContext = (a: ProcurementApproval): BlocklistEntry | undefined => entries.find(e => e.id === a.entityId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {language === 'ar' ? 'جارِ التحميل...' : 'Loading...'}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12 text-xs">
      <div>
        <h2 className="text-2xl font-display font-bold text-zinc-100">
          {language === 'ar' ? 'الأمن والقائمة المحظورة' : 'Security & Blocklist'}
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          {language === 'ar'
            ? 'المطابقة تتم فقط عبر رقم جواز السفر + الدولة، أو رقم الهوية الإماراتية، أو رقم الرخصة التجارية للشركات -- لا يتم الحظر بالاسم أبداً. إزالة الحظر تتطلب موافقة شخص آخر مخوّل.'
            : 'Matched only by passport number + issuing country, Emirates ID number, or a company\'s trade license number -- never by name. Removing a block requires a different, authorized approver.'}
        </p>
      </div>

      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setNewModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            {language === 'ar' ? 'حظر جديد' : 'New Block'}
          </button>
        </div>
      )}

      {pendingApprovals.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-zinc-100 mb-2">
            {language === 'ar' ? `طلبات فك حظر معلّقة (${pendingApprovals.length})` : `Pending unblock requests (${pendingApprovals.length})`}
          </h3>
          <div className="space-y-2">
            {pendingApprovals.map(a => {
              const entry = entryContext(a);
              return (
                <div key={a.id} className="p-3 rounded-xl bg-zinc-900/60 border border-amber-500/30 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-100">
                      {entry ? `${entry.identifierType} ${entry.identifierValue}${entry.identifierCountry ? ` (${entry.identifierCountry})` : ''}` : a.entityId}
                    </p>
                    <p className="text-zinc-400 mt-0.5">{a.requestedByName} ({a.requestedByRole}) · {a.reason}</p>
                    {entry && (
                      <p className="text-zinc-500 mt-1">
                        {language === 'ar' ? 'سبب الحظر الأصلي:' : 'Original block reason:'} {entry.reason}
                      </p>
                    )}
                  </div>
                  {isDecider && a.requestedBy !== currentUser.id && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        disabled={busyKey === a.id}
                        onClick={() => decideApproval(a, 'approved')}
                        className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                        title={language === 'ar' ? 'موافقة' : 'Approve'}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={busyKey === a.id}
                        onClick={() => decideApproval(a, 'rejected')}
                        className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 transition-colors disabled:opacity-50"
                        title={language === 'ar' ? 'رفض' : 'Reject'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {isDecider && a.requestedBy === currentUser.id && (
                    <span className="text-[10px] text-zinc-500 shrink-0">{language === 'ar' ? 'بانتظار شخص آخر' : 'Awaiting a different approver'}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-zinc-100 mb-2">
          {language === 'ar' ? `الإدخالات (${filteredEntries.length}/${entries.length})` : `Entries (${filteredEntries.length}/${entries.length})`}
        </h3>
        <div className="flex flex-wrap items-end gap-3 mb-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80">
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-[11px] text-zinc-400 mb-1">{language === 'ar' ? 'بحث فوري' : 'Instant search'}</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder={language === 'ar' ? 'الاسم، المعرّف، الهاتف، السبب...' : 'Name, identifier, phone, reason...'}
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-zinc-400 mb-1">{language === 'ar' ? 'من تاريخ' : 'From date'}</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none" />
          </div>
          <div>
            <label className="block text-[11px] text-zinc-400 mb-1">{language === 'ar' ? 'إلى تاريخ' : 'To date'}</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none" />
          </div>
          {(searchText || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setSearchText(''); setDateFrom(''); setDateTo(''); }}
              className="px-3 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs"
            >
              {language === 'ar' ? 'مسح الفلاتر' : 'Clear filters'}
            </button>
          )}
        </div>
        <div className="space-y-2.5">
          {filteredEntries.map(entry => {
            const hasPendingUnblock = pendingApprovals.some(a => a.entityId === entry.id);
            return (
              <div key={entry.id} className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={`w-3.5 h-3.5 ${entry.status === 'active' ? 'text-rose-400' : 'text-zinc-600'}`} />
                    <p className="font-semibold text-zinc-100 font-mono">
                      {entry.identifierType === 'passport'
                        ? (language === 'ar' ? 'جواز سفر' : 'Passport')
                        : entry.identifierType === 'gcc_id'
                        ? (language === 'ar' ? 'هوية خليجية' : 'GCC National ID')
                        : entry.identifierType === 'trade_license'
                        ? (language === 'ar' ? 'رخصة تجارية' : 'Trade License')
                        : (language === 'ar' ? 'هوية إماراتية' : 'Emirates ID')}: {entry.identifierValue}
                      {entry.identifierCountry ? ` (${entry.identifierCountry})` : ''}
                    </p>
                    <Badge variant={entry.tier === 'full' ? 'rose' : 'amber'} size="sm">
                      {entry.tier === 'full' ? (language === 'ar' ? 'حظر كلي' : 'Full block') : (language === 'ar' ? 'حظر مشروط' : 'Conditional')}
                    </Badge>
                    <Badge variant={entry.status === 'active' ? 'rose' : 'zinc'} size="sm">
                      {entry.status === 'active' ? (language === 'ar' ? 'نشط' : 'Active') : (language === 'ar' ? 'مُزال' : 'Removed')}
                    </Badge>
                    <Badge variant={entry.banType === 'temporary' ? 'sky' : 'purple'} size="sm">
                      {entry.banType === 'temporary' ? (language === 'ar' ? 'حظر مؤقت' : 'Temporary') : (language === 'ar' ? 'حظر دائم' : 'Permanent')}
                    </Badge>
                    {entry.status === 'active' && isBanExpired(entry) && (
                      <Badge variant="amber" size="sm" icon={<CalendarClock className="w-3 h-3" />}>
                        {language === 'ar' ? 'يحتاج مراجعة -- انتهت المدة' : 'Needs review -- expired'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-zinc-500 font-mono">{entry.id}</p>
                </div>
                {entry.customerName && (
                  <p className="text-zinc-400 mt-1">
                    {entry.customerName}{entry.nationality ? ` · ${entry.nationality}` : ''}{entry.mobile ? ` · ${formatPhoneNumber(entry.mobile)}` : ''}
                  </p>
                )}
                <p className="text-zinc-300 mt-1.5">{entry.reason}</p>
                {entry.conditionalNote && (
                  <p className="text-amber-400 mt-1">{language === 'ar' ? 'الشرط:' : 'Condition:'} {entry.conditionalNote}</p>
                )}
                {(entry.incidentDate || entry.idExpiryDate || entry.expiryDate) && (
                  <p className="text-zinc-500 text-[10px] mt-1.5 flex flex-wrap gap-x-3">
                    {entry.incidentDate && <span>{language === 'ar' ? 'تاريخ الحادثة:' : 'Incident date:'} {formatDate(entry.incidentDate)}</span>}
                    {entry.idExpiryDate && <span>{language === 'ar' ? 'انتهاء الهوية:' : 'ID expiry:'} {formatDate(entry.idExpiryDate)}</span>}
                    {entry.banType === 'temporary' && entry.expiryDate && <span>{language === 'ar' ? 'انتهاء الحظر:' : 'Ban expiry:'} {formatDate(entry.expiryDate)}</span>}
                  </p>
                )}
                <p className="text-zinc-600 text-[10px] mt-1.5">{entry.createdByName} · {formatDateTime(entry.createdAt)}</p>
                {entry.status === 'removed' && entry.removedByName && (
                  <p className="text-zinc-600 text-[10px]">{language === 'ar' ? 'أُزيل بواسطة:' : 'Removed by:'} {entry.removedByName} · {entry.removedAt ? formatDateTime(entry.removedAt) : '—'}</p>
                )}
                {canManage && entry.status === 'active' && !hasPendingUnblock && (
                  <button
                    onClick={() => setUnblockModalEntry(entry)}
                    className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-sky-400 hover:text-sky-300"
                  >
                    <Undo2 className="w-3 h-3" />
                    {language === 'ar' ? 'طلب فك الحظر' : 'Request unblock'}
                  </button>
                )}
                {hasPendingUnblock && (
                  <p className="mt-2.5 text-[11px] text-amber-400">{language === 'ar' ? 'يوجد طلب فك حظر معلّق' : 'An unblock request is pending'}</p>
                )}
              </div>
            );
          })}
          {entries.length === 0 && <p className="text-zinc-500">{language === 'ar' ? 'لا توجد إدخالات في القائمة المحظورة.' : 'No blocklist entries.'}</p>}
          {entries.length > 0 && filteredEntries.length === 0 && <p className="text-zinc-500">{language === 'ar' ? 'لا توجد نتائج مطابقة للفلاتر الحالية.' : 'No entries match the current filters.'}</p>}
        </div>
      </div>

      <NewBlockModal isOpen={newModalOpen} entries={entries} onClose={() => setNewModalOpen(false)} onCreated={async () => { setNewModalOpen(false); await load(); }} />
      <RequestUnblockModal entry={unblockModalEntry} onClose={() => setUnblockModalEntry(null)} onCreated={async () => { setUnblockModalEntry(null); await load(); }} />
    </div>
  );
};

const NewBlockModal: React.FC<{ isOpen: boolean; entries: BlocklistEntry[]; onClose: () => void; onCreated: () => void }> = ({ isOpen, entries, onClose, onCreated }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { currentUser } = useAuth();
  const { showToast, addDocument } = useCRM();
  const [identifierType, setIdentifierType] = useState<BlocklistIdentifierType>('emirates_id');
  const [identifierValue, setIdentifierValue] = useState('');
  const [identifierCountry, setIdentifierCountry] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [nationality, setNationality] = useState('Emirati');
  const [mobile, setMobile] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [idExpiryDate, setIdExpiryDate] = useState('');
  const [tier, setTier] = useState<BlocklistTier>('full');
  const [conditionalNote, setConditionalNote] = useState('');
  const [banType, setBanType] = useState<BlocklistBanType>('permanent');
  const [expiryDate, setExpiryDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdEntry, setCreatedEntry] = useState<BlocklistEntry | null>(null);
  const [uploading, setUploading] = useState(false);
  const submitLockRef = React.useRef(false);

  useEffect(() => {
    if (isOpen) {
      setIdentifierType('emirates_id'); setIdentifierValue(''); setIdentifierCountry('');
      setCustomerName(''); setNationality('Emirati'); setMobile(''); setIncidentDate(''); setIdExpiryDate('');
      setTier('full'); setConditionalNote(''); setBanType('permanent'); setExpiryDate(''); setReason('');
      setCreatedEntry(null);
      submitLockRef.current = false;
    }
  }, [isOpen]);

  const valid = identifierValue.trim() && customerName.trim() && reason.trim() && (identifierType !== 'passport' || identifierCountry.trim())
    && (tier !== 'conditional' || conditionalNote.trim()) && (banType !== 'temporary' || expiryDate.trim());

  // Real, evidence-based duplicate check against the active entries already
  // loaded -- matched only by the exact identifier pair (same rule the
  // blocklist itself matches by), never by the display-only name.
  const duplicateMatch = React.useMemo(() => {
    const value = identifierValue.trim().toUpperCase();
    if (!value) return null;
    return entries.find(e =>
      e.status === 'active' &&
      e.identifierType === identifierType &&
      e.identifierValue.trim().toUpperCase() === value &&
      (identifierType !== 'passport' || (e.identifierCountry || '').trim().toUpperCase() === identifierCountry.trim().toUpperCase())
    ) || null;
  }, [entries, identifierType, identifierValue, identifierCountry]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // A synchronous lock, checked before React's async setSubmitting(true)
    // re-render commits -- a fast double-click/double-Enter on the same
    // submit event could otherwise fire this handler twice before the
    // disabled button state takes effect, creating two blocklist entries
    // for one user action. apiFetch also attaches its own short-lived
    // Idempotency-Key for this route, so even a request that slips past
    // this lock (e.g. a genuine network retry) cannot double-create.
    if (!valid || duplicateMatch || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifierType, identifierValue, identifierCountry: identifierType === 'passport' ? identifierCountry : undefined,
          customerName: customerName.trim(), nationality: identifierType === 'trade_license' ? undefined : nationality, mobile: mobile.trim() || undefined,
          idExpiryDate: idExpiryDate || undefined, incidentDate: incidentDate || undefined,
          tier, conditionalNote: tier === 'conditional' ? conditionalNote : undefined,
          banType, expiryDate: banType === 'temporary' ? expiryDate : undefined, reason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create this block.');
      showToast(language === 'ar' ? 'تم إنشاء الحظر' : 'Block created', data.id);
      setCreatedEntry(data);
    } catch (err: any) {
      showToast(language === 'ar' ? 'فشل الإنشاء' : 'Creation failed', err?.message || '');
      submitLockRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !createdEntry) return;
    setUploading(true);
    try {
      const { url } = await uploadFile(file, 'customer-documents', {});
      await addDocument({
        title: file.name,
        category: 'blocklist_evidence',
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        fileType: file.type,
        fileUrl: url,
        relatedEntityType: 'blocklist_entry',
        relatedEntityId: createdEntry.id,
        relatedEntityName: createdEntry.customerName || createdEntry.identifierValue,
        version: 1,
        uploadedBy: currentUser?.name || 'Security'
      });
      showToast(isAr ? 'تم رفع الدليل' : 'Evidence Uploaded', isAr ? 'تم إرفاق مستند الإثبات بقرار الحظر.' : 'The evidence document was attached to this block.', 'success');
    } catch (err: any) {
      showToast(isAr ? 'فشل الرفع' : 'Upload Failed', err?.message || '', 'error');
    } finally {
      setUploading(false);
    }
  };

  if (createdEntry) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onCreated}
        title={isAr ? 'تم إنشاء الحظر بنجاح' : 'Block Created Successfully'}
        subtitle={createdEntry.id}
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{isAr ? 'يمكنك الآن إرفاق مستند إثبات حقيقي (اختياري لكن موصى به) -- تقرير حادثة، محضر، أو مذكرة قرار داخلية.' : 'You can now attach a real supporting document (optional, recommended) -- an incident report, police report, or internal decision memo.'}</span>
          </div>
          <label className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-[#D4AF37]/50 cursor-pointer flex flex-col items-center gap-2 text-center transition-all">
            <UploadCloud className="w-5 h-5 text-[#D4AF37]" />
            <span className="text-zinc-200 font-medium">{isAr ? 'رفع مستند الإثبات' : 'Upload Evidence Document'}</span>
            <span className="text-[10px] text-zinc-500">{uploading ? (isAr ? 'جاري الرفع...' : 'Uploading...') : (isAr ? 'JPG, PNG أو PDF' : 'JPG, PNG or PDF')}</span>
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleEvidenceUpload} disabled={uploading} />
          </label>
          <div className="flex items-center justify-end pt-3 border-t border-zinc-800">
            <button type="button" onClick={onCreated} className="px-6 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold">
              {isAr ? 'إنهاء' : 'Done'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'ar' ? 'حظر جديد' : 'New Block'}
      subtitle={language === 'ar' ? 'المطابقة تعتمد فقط على المعرّف الفريد -- لا يُستخدم الاسم مطلقاً للمطابقة.' : 'Matching relies entirely on the unique identifier -- name is never used to match.'}
      maxWidth="sm"
    >
      <form onSubmit={submit} className="space-y-4 text-xs">
        {duplicateMatch && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>
              {isAr
                ? `يوجد حظر نشط بالفعل بنفس المعرّف: ${duplicateMatch.id}${duplicateMatch.customerName ? ` (${duplicateMatch.customerName})` : ''}`
                : `An active block already exists for this exact identifier: ${duplicateMatch.id}${duplicateMatch.customerName ? ` (${duplicateMatch.customerName})` : ''}`}
            </span>
          </div>
        )}
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'نوع المعرّف *' : 'Identifier type *'}</label>
          <select value={identifierType} onChange={e => setIdentifierType(e.target.value as BlocklistIdentifierType)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
            <option value="emirates_id">{language === 'ar' ? 'هوية إماراتية' : 'Emirates ID'}</option>
            <option value="passport">{language === 'ar' ? 'جواز سفر' : 'Passport'}</option>
            <option value="gcc_id">{language === 'ar' ? 'هوية خليجية' : 'GCC National ID'}</option>
            <option value="trade_license">{language === 'ar' ? 'رخصة تجارية (شركة)' : 'Trade License (Company)'}</option>
          </select>
        </div>
        {identifierType === 'emirates_id' ? (
          <EmiratesIdInput
            label={language === 'ar' ? 'رقم الهوية *' : 'Emirates ID number *'}
            required
            value={identifierValue}
            onChange={setIdentifierValue}
            isAr={isAr}
          />
        ) : (
          <div>
            <label className="block text-zinc-400 font-medium mb-1">
              {identifierType === 'passport'
                ? (language === 'ar' ? 'رقم الجواز *' : 'Passport number *')
                : identifierType === 'trade_license'
                ? (language === 'ar' ? 'رقم الرخصة التجارية *' : 'Trade license number *')
                : (language === 'ar' ? 'رقم الهوية الخليجية *' : 'GCC National ID number *')}
            </label>
            <input required value={identifierValue} onChange={e => setIdentifierValue(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
          </div>
        )}
        {identifierType === 'passport' && (
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'دولة الإصدار *' : 'Issuing country *'}</label>
            <input required value={identifierCountry} onChange={e => setIdentifierCountry(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
            <p className="text-[10px] text-zinc-500 mt-1">{language === 'ar' ? 'رقم الجواز وحده غير كافٍ للمطابقة -- الدولة مطلوبة (قاعدة B01).' : 'A passport number alone is not enough to match -- the country is required (RULE-B01).'}</p>
          </div>
        )}
        <div>
          <label className="block text-zinc-400 font-medium mb-1">
            {identifierType === 'trade_license'
              ? (language === 'ar' ? 'الاسم القانوني للشركة *' : 'Company legal name *')
              : (language === 'ar' ? 'اسم العميل الكامل *' : 'Customer full name *')}
          </label>
          <input required value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
          <p className="text-[10px] text-zinc-500 mt-1">{language === 'ar' ? 'مطلوب مطابقةً لسياسة تسجيل العميل الجديد -- لكنه يُسجَّل للعرض فقط ولا يُستخدم أبداً كمعيار للمطابقة (قاعدة B01).' : 'Required to match customer-registration policy -- recorded for display only and never used to match a block (RULE-B01).'}</p>
        </div>
        {identifierType !== 'trade_license' && (
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'الجنسية' : 'Nationality'}</label>
            <select value={nationality} onChange={e => setNationality(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
              {ALL_COUNTRIES.map(c => (
                <option key={c.iso} value={c.nationalityEn}>{language === 'ar' ? c.nationalityAr : c.nationalityEn}</option>
              ))}
            </select>
          </div>
        )}
        <PhoneNumberInput
          label={identifierType === 'trade_license' ? (language === 'ar' ? 'هاتف التواصل للشركة' : 'Company contact number') : (language === 'ar' ? 'رقم الهاتف' : 'Mobile Number')}
          value={mobile}
          onChange={setMobile}
          isAr={isAr}
        />
        <div className="grid grid-cols-2 gap-3">
          <DayMonthYearDateInput
            label={language === 'ar' ? 'تاريخ الحادثة' : 'Incident date'}
            value={incidentDate}
            onChange={setIncidentDate}
            isAr={isAr}
          />
          <DayMonthYearDateInput
            label={language === 'ar' ? 'تاريخ انتهاء الهوية' : 'ID expiry date'}
            value={idExpiryDate}
            onChange={setIdExpiryDate}
            isAr={isAr}
          />
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'مستوى الحظر *' : 'Block tier *'}</label>
          <select value={tier} onChange={e => setTier(e.target.value as BlocklistTier)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
            <option value="full">{language === 'ar' ? 'حظر كلي -- رفض فوري' : 'Full -- reject outright'}</option>
            <option value="conditional">{language === 'ar' ? 'حظر مشروط -- يسمح بشروط' : 'Conditional -- allow with conditions'}</option>
          </select>
        </div>
        {tier === 'conditional' && (
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'الشروط المطلوبة *' : 'Required conditions *'}</label>
            <input required value={conditionalNote} onChange={e => setConditionalNote(e.target.value)} placeholder={language === 'ar' ? 'مثال: وديعة مرفوعة 5000 درهم وموافقة مدير العمليات' : 'e.g. Raised deposit of 5,000 AED and operations-manager sign-off'} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
          </div>
        )}
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'مدة الحظر *' : 'Ban duration *'}</label>
          <select value={banType} onChange={e => setBanType(e.target.value as BlocklistBanType)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
            <option value="permanent">{language === 'ar' ? 'دائم' : 'Permanent'}</option>
            <option value="temporary">{language === 'ar' ? 'مؤقت -- ينتهي بتاريخ محدد' : 'Temporary -- ends on a set date'}</option>
          </select>
        </div>
        {banType === 'temporary' && (
          <DayMonthYearDateInput
            label={language === 'ar' ? 'تاريخ انتهاء الحظر *' : 'Ban expiry date *'}
            value={expiryDate}
            onChange={setExpiryDate}
            required
            isAr={isAr}
          />
        )}
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'السبب *' : 'Reason *'}</label>
          <textarea required rows={2} value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={submitting || !valid || !!duplicateMatch} className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold disabled:opacity-50">{language === 'ar' ? 'إنشاء' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
};

const RequestUnblockModal: React.FC<{ entry: BlocklistEntry | null; onClose: () => void; onCreated: () => void }> = ({ entry, onClose, onCreated }) => {
  const { language } = useLanguage();
  const { showToast } = useCRM();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (entry) setReason(''); }, [entry]);

  if (!entry) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/blocklist/${encodeURIComponent(entry.id)}/unblock-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to request removal of this block.');
      showToast(language === 'ar' ? 'تم إرسال طلب فك الحظر' : 'Unblock requested', entry.id);
      onCreated();
    } catch (err: any) {
      showToast(language === 'ar' ? 'فشل الطلب' : 'Request failed', err?.message || '');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={!!entry}
      onClose={onClose}
      title={language === 'ar' ? 'طلب فك الحظر' : 'Request Unblock'}
      subtitle={language === 'ar' ? 'يتطلب موافقة شخص آخر مخوّل -- لا يمكنك الموافقة على طلبك الخاص.' : 'Requires approval from a different, authorized person -- you cannot approve your own request.'}
      maxWidth="sm"
    >
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
          <p className="text-zinc-400">{entry.identifierType} <span className="font-mono text-zinc-200">{entry.identifierValue}{entry.identifierCountry ? ` (${entry.identifierCountry})` : ''}</span></p>
          <p className="text-zinc-500 mt-1">{language === 'ar' ? 'السبب الأصلي:' : 'Original reason:'} {entry.reason}</p>
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'سبب طلب فك الحظر *' : 'Reason for requesting removal *'}</label>
          <textarea required rows={2} value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={submitting || !reason.trim()} className="px-5 py-2 rounded-xl bg-sky-500 text-zinc-950 font-semibold disabled:opacity-50">{language === 'ar' ? 'إرسال الطلب' : 'Submit request'}</button>
        </div>
      </form>
    </Modal>
  );
};
