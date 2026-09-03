import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Plus, Check, X, Loader2, Undo2, AlertTriangle, UploadCloud, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { formatDateTime } from '../../lib/dateFormat';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { uploadFile, formatFileSize } from '../../lib/upload';
import type { BlocklistEntry, BlocklistIdentifierType, BlocklistTier } from '../../types';

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
            ? 'المطابقة تتم فقط عبر رقم جواز السفر + الدولة، أو رقم الهوية الإماراتية -- لا يتم الحظر بالاسم أبداً. إزالة الحظر تتطلب موافقة شخص آخر مخوّل.'
            : 'Matched only by passport number + issuing country, or Emirates ID number -- never by name. Removing a block requires a different, authorized approver.'}
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
          {language === 'ar' ? `الإدخالات (${entries.length})` : `Entries (${entries.length})`}
        </h3>
        <div className="space-y-2.5">
          {entries.map(entry => {
            const hasPendingUnblock = pendingApprovals.some(a => a.entityId === entry.id);
            return (
              <div key={entry.id} className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={`w-3.5 h-3.5 ${entry.status === 'active' ? 'text-rose-400' : 'text-zinc-600'}`} />
                    <p className="font-semibold text-zinc-100 font-mono">
                      {entry.identifierType === 'passport' ? (language === 'ar' ? 'جواز سفر' : 'Passport') : (language === 'ar' ? 'هوية إماراتية' : 'Emirates ID')}: {entry.identifierValue}
                      {entry.identifierCountry ? ` (${entry.identifierCountry})` : ''}
                    </p>
                    <Badge variant={entry.tier === 'full' ? 'rose' : 'amber'} size="sm">
                      {entry.tier === 'full' ? (language === 'ar' ? 'حظر كلي' : 'Full block') : (language === 'ar' ? 'حظر مشروط' : 'Conditional')}
                    </Badge>
                    <Badge variant={entry.status === 'active' ? 'rose' : 'zinc'} size="sm">
                      {entry.status === 'active' ? (language === 'ar' ? 'نشط' : 'Active') : (language === 'ar' ? 'مُزال' : 'Removed')}
                    </Badge>
                  </div>
                  <p className="text-zinc-500 font-mono">{entry.id}</p>
                </div>
                {entry.customerName && <p className="text-zinc-400 mt-1">{entry.customerName}</p>}
                <p className="text-zinc-300 mt-1.5">{entry.reason}</p>
                {entry.conditionalNote && (
                  <p className="text-amber-400 mt-1">{language === 'ar' ? 'الشرط:' : 'Condition:'} {entry.conditionalNote}</p>
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
  const [tier, setTier] = useState<BlocklistTier>('full');
  const [conditionalNote, setConditionalNote] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdEntry, setCreatedEntry] = useState<BlocklistEntry | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIdentifierType('emirates_id'); setIdentifierValue(''); setIdentifierCountry('');
      setCustomerName(''); setTier('full'); setConditionalNote(''); setReason('');
      setCreatedEntry(null);
    }
  }, [isOpen]);

  const valid = identifierValue.trim() && reason.trim() && (identifierType !== 'passport' || identifierCountry.trim()) && (tier !== 'conditional' || conditionalNote.trim());

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
    if (!valid || duplicateMatch) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifierType, identifierValue, identifierCountry: identifierType === 'passport' ? identifierCountry : undefined,
          customerName: customerName || undefined, tier, conditionalNote: tier === 'conditional' ? conditionalNote : undefined, reason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create this block.');
      showToast(language === 'ar' ? 'تم إنشاء الحظر' : 'Block created', data.id);
      setCreatedEntry(data);
    } catch (err: any) {
      showToast(language === 'ar' ? 'فشل الإنشاء' : 'Creation failed', err?.message || '');
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
          </select>
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{identifierType === 'passport' ? (language === 'ar' ? 'رقم الجواز *' : 'Passport number *') : (language === 'ar' ? 'رقم الهوية *' : 'Emirates ID number *')}</label>
          <input required value={identifierValue} onChange={e => setIdentifierValue(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>
        {identifierType === 'passport' && (
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'دولة الإصدار *' : 'Issuing country *'}</label>
            <input required value={identifierCountry} onChange={e => setIdentifierCountry(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
            <p className="text-[10px] text-zinc-500 mt-1">{language === 'ar' ? 'رقم الجواز وحده غير كافٍ للمطابقة -- الدولة مطلوبة (قاعدة B01).' : 'A passport number alone is not enough to match -- the country is required (RULE-B01).'}</p>
          </div>
        )}
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'اسم العميل (للعرض فقط)' : 'Customer name (display only)'}</label>
          <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
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
