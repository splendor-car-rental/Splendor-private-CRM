import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, ClipboardList, ShieldCheck, Plus, Check, X, Loader2, Search, Ban, PackageCheck, FileEdit, History, Timer, AlertTriangle, ArrowLeftRight, CheckCheck } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import type { Supplier, PurchaseOrder, SupplierOperationTypeDef, PurchaseOrderAmendmentRequest, PurchaseOrderLineItem, TarsRecord, Contract } from '../../types';

/**
 * Splendor Procurement, Phase 1 -- operator-facing surface.
 *
 * The backend (src/server/{suppliers,purchaseOrders,procurementApprovals,
 * supplierQuotes,supplierPayments,balances,customerRefunds,debts,
 * employeeCustody,supplierInvoices,operationalExpenses,vehicleReceiving,
 * tars,lateFees}.ts) implements all ~15 procurement workflows end to end,
 * each covered by its own HTTP test suite (tests/procurement.test.ts).
 * This screen gives UI coverage to the highest-leverage surfaces:
 * Suppliers + Purchase Orders (the workflow every other one hangs off of,
 * including its full amendment request -> review -> approval workflow),
 * a single universal Approvals inbox that decides EVERY pending
 * procurement request regardless of type, since they all flow through the
 * same generic Segregation-of-Duties engine (procurementApprovals.ts), and
 * TARS (vehicle-transfer deadline tracking -- see the TARS tab below and
 * src/server/tars.ts; deadlines and delays are always computed from real
 * timestamps, never a value a user can type in).
 * Quotes/payments/balances/refunds/debts/custody/invoices/receiving/
 * late-fee screens are intentionally not built in this checkpoint -- see
 * the closure report's UI-coverage section.
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
  decidedBy?: string;
  decidedByName?: string;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
}

interface POLineItemDraft {
  operationType: string;
  description: string;
  vehicleDescription: string;
  quantity: number;
  unitPrice: number;
}

const emptyLineItem = (): POLineItemDraft => ({ operationType: '', description: '', vehicleDescription: '', quantity: 1, unitPrice: 0 });

const STATUS_BADGE: Record<string, { variant: any; label: string; labelAr: string }> = {
  pending_approval: { variant: 'amber', label: 'Pending approval', labelAr: 'بانتظار الموافقة' },
  approved: { variant: 'emerald', label: 'Approved', labelAr: 'معتمد' },
  partially_fulfilled: { variant: 'sky', label: 'Partially fulfilled', labelAr: 'منفّذ جزئياً' },
  fulfilled: { variant: 'emerald', label: 'Fulfilled', labelAr: 'منفّذ بالكامل' },
  partially_cancelled: { variant: 'rose', label: 'Partially cancelled', labelAr: 'ملغى جزئياً' },
  cancelled: { variant: 'rose', label: 'Cancelled', labelAr: 'ملغى' },
  active: { variant: 'emerald', label: 'Active', labelAr: 'نشط' },
  pending_completion: { variant: 'amber', label: 'Pending completion', labelAr: 'بانتظار الاستكمال' },
  inactive: { variant: 'zinc', label: 'Inactive', labelAr: 'غير نشط' }
};

function StatusBadge({ status }: { status: string }) {
  const { language } = useLanguage();
  const meta = STATUS_BADGE[status] || { variant: 'neutral', label: status, labelAr: status };
  return <Badge variant={meta.variant} size="sm">{language === 'ar' ? meta.labelAr : meta.label}</Badge>;
}

export const ProcurementView: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const { showToast } = useCRM();
  const isDecider = currentUser.role === 'ceo' || currentUser.role === 'admin';

  const [tab, setTab] = useState<'suppliers' | 'purchase-orders' | 'approvals' | 'tars'>('purchase-orders');
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [approvals, setApprovals] = useState<ProcurementApproval[]>([]);
  const [operationTypes, setOperationTypes] = useState<SupplierOperationTypeDef[]>([]);
  const [tarsRecords, setTarsRecords] = useState<TarsRecord[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [amendmentModalPo, setAmendmentModalPo] = useState<PurchaseOrder | null>(null);
  const [amendmentsByPo, setAmendmentsByPo] = useState<Record<string, PurchaseOrderAmendmentRequest[]>>({});
  const [tarsModalOpen, setTarsModalOpen] = useState(false);

  // TARS deadlines/escalation are time-based -- re-render every 30s so an
  // "overdue by X minutes" figure stays live without a manual refresh,
  // purely a display tick (nothing here recomputes or stores anything).
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setClockTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [suppliersRes, posRes, approvalsRes, typesRes, tarsRes, tarsEscalationsRes, contractsRes] = await Promise.all([
        apiFetch('/api/suppliers'),
        apiFetch('/api/purchase-orders'),
        apiFetch('/api/procurement/approvals'),
        apiFetch('/api/procurement/supplier-operation-types'),
        apiFetch('/api/tars-records'),
        apiFetch('/api/tars-records/escalations'),
        apiFetch('/api/contracts')
      ]);
      if (suppliersRes.ok) setSuppliers(await suppliersRes.json());
      let pos: PurchaseOrder[] = [];
      if (posRes.ok) { pos = await posRes.json(); setPurchaseOrders(pos); }
      if (approvalsRes.ok) setApprovals(await approvalsRes.json());
      if (typesRes.ok) setOperationTypes(await typesRes.json());
      if (tarsRes.ok) {
        const rawTars: TarsRecord[] = await tarsRes.json();
        // escalationLevel on the stored record is frozen at 'none' from
        // creation -- computeTarsEscalations() is a pure, on-read
        // monitoring function (never persisted, by design: "detection,
        // never enforcement"), so the live level has to come from its own
        // endpoint, not the record's own field.
        const escalated: Array<TarsRecord & { escalationLevel: 'normal' | 'urgent' }> = tarsEscalationsRes.ok ? await tarsEscalationsRes.json() : [];
        const escalationById = new Map(escalated.map(r => [r.id, r.escalationLevel]));
        setTarsRecords(rawTars.map(r => ({ ...r, escalationLevel: escalationById.get(r.id) || 'none' })));
      }
      if (contractsRes.ok) setContracts(await contractsRes.json());

      // Only fetch amendment history for POs that actually have any --
      // most never do, so this stays cheap rather than N fetches per load.
      const withAmendments = pos.filter(po => (po.amendmentRequestIds || []).length > 0);
      if (withAmendments.length > 0) {
        const results = await Promise.all(
          withAmendments.map(po => apiFetch(`/api/purchase-orders/${encodeURIComponent(po.id)}/amendment-requests`))
        );
        const map: Record<string, PurchaseOrderAmendmentRequest[]> = {};
        for (let i = 0; i < withAmendments.length; i++) {
          if (results[i].ok) map[withAmendments[i].id] = await results[i].json();
        }
        setAmendmentsByPo(map);
      } else {
        setAmendmentsByPo({});
      }
    } catch (e) {
      console.error('Failed to load procurement data:', e);
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
        `${approval.entityType} ${approval.entityId}`
      );
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل القرار' : 'Decision failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  const cancelPO = async (po: PurchaseOrder) => {
    const reason = window.prompt(language === 'ar' ? 'سبب إلغاء أمر التوريد بالكامل:' : 'Reason for fully cancelling this purchase order:');
    if (!reason || !reason.trim()) return;
    setBusyKey(po.id);
    try {
      const res = await apiFetch(`/api/purchase-orders/${encodeURIComponent(po.id)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to request cancellation.');
      showToast(language === 'ar' ? 'تم إرسال طلب الإلغاء' : 'Cancellation requested', po.id);
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل الطلب' : 'Request failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  const receiveLineItem = async (po: PurchaseOrder, lineId: string) => {
    setBusyKey(lineId);
    try {
      const res = await apiFetch(`/api/purchase-orders/${encodeURIComponent(po.id)}/line-items/${encodeURIComponent(lineId)}/receive`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to mark received.');
      showToast(language === 'ar' ? 'تم استلام العنصر' : 'Line item received', lineId);
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل' : 'Failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  const cancelLineItem = async (po: PurchaseOrder, lineId: string) => {
    const reason = window.prompt(language === 'ar' ? 'سبب إلغاء هذا العنصر:' : 'Reason for cancelling this line item:');
    if (!reason || !reason.trim()) return;
    setBusyKey(lineId);
    try {
      const res = await apiFetch(`/api/purchase-orders/${encodeURIComponent(po.id)}/line-items/${encodeURIComponent(lineId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to request cancellation.');
      showToast(language === 'ar' ? 'تم إرسال طلب إلغاء العنصر' : 'Line cancellation requested', lineId);
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل الطلب' : 'Request failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  const tarsExecute = async (record: TarsRecord) => {
    setBusyKey(record.id);
    try {
      const res = await apiFetch(`/api/tars-records/${encodeURIComponent(record.id)}/execute`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to record execution.');
      showToast(
        language === 'ar' ? 'تم تسجيل التنفيذ' : 'Execution recorded',
        data.isDelayed ? `${language === 'ar' ? 'متأخر' : 'Delayed'} ${data.delayMinutes} ${language === 'ar' ? 'دقيقة' : 'min'}` : (language === 'ar' ? 'في الموعد' : 'On time')
      );
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل' : 'Failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  const tarsReturnToSupplier = async (record: TarsRecord) => {
    setBusyKey(record.id);
    try {
      const res = await apiFetch(`/api/tars-records/${encodeURIComponent(record.id)}/return-to-supplier`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to record return to supplier.');
      showToast(language === 'ar' ? 'تم تسجيل الإعادة للمورد' : 'Return to supplier recorded', record.id);
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل' : 'Failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  const tarsCloseReturn = async (record: TarsRecord) => {
    setBusyKey(record.id);
    try {
      const res = await apiFetch(`/api/tars-records/${encodeURIComponent(record.id)}/close-return`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to close the return.');
      showToast(
        language === 'ar' ? 'تم إغلاق الإعادة' : 'Return closed',
        data.closingDelayed ? (language === 'ar' ? 'تأخر الإغلاق' : 'Closing was delayed') : (language === 'ar' ? 'في الوقت المناسب' : 'On time')
      );
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل' : 'Failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {language === 'ar' ? 'جارِ التحميل...' : 'Loading...'}
      </div>
    );
  }

  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const decidedApprovals = approvals.filter(a => a.status !== 'pending').slice(0, 30);

  // For an amendment approval, the approval record itself only carries
  // {amendmentRequestId} -- an approver deciding blind on that alone is a
  // poor (and arguably risky) review experience, so resolve the actual
  // before/after line items and total from amendmentsByPo, keyed by the
  // PO (a.entityId) the approval already targets.
  const findAmendment = (a: ProcurementApproval): PurchaseOrderAmendmentRequest | null => {
    if (a.entityType !== 'PurchaseOrder' || a.action !== 'approve_amendment') return null;
    const amendmentId = a.payload?.amendmentRequestId as string | undefined;
    if (!amendmentId) return null;
    return (amendmentsByPo[a.entityId] || []).find(ar => ar.id === amendmentId) || null;
  };

  // Pure display formatting over real timestamps already on the record --
  // never recomputes or alters deadlineAt/executedAt/etc. themselves.
  const formatDuration = (ms: number) => {
    const mins = Math.round(Math.abs(ms) / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  const tarsCountdown = (record: TarsRecord): { text: string; overdue: boolean } => {
    const deadlineMs = new Date(record.deadlineAt).getTime();
    const nowMs = Date.now();
    const diff = deadlineMs - nowMs;
    if (diff > 0) return { text: `${formatDuration(diff)} ${language === 'ar' ? 'متبقٍ' : 'remaining'}`, overdue: false };
    return { text: `${formatDuration(diff)} ${language === 'ar' ? 'متأخر' : 'overdue'}`, overdue: true };
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12 text-xs">
      <div>
        <h2 className="text-2xl font-display font-bold text-zinc-100">
          {language === 'ar' ? 'المشتريات والموردون' : 'Procurement & Suppliers'}
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          {language === 'ar'
            ? 'الموردون، أوامر التوريد، والموافقات -- كل حركة حساسة تمر عبر فصل المهام (منشئ الحركة لا يعتمدها).'
            : 'Suppliers, purchase orders, and the universal Segregation-of-Duties approval inbox -- the requester of any procurement movement can never approve it themselves.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-zinc-800/80 pb-0.5">
        {[
          { id: 'purchase-orders', label: language === 'ar' ? 'أوامر التوريد' : 'Purchase Orders', icon: <ClipboardList className="w-3.5 h-3.5" /> },
          { id: 'suppliers', label: language === 'ar' ? 'الموردون' : 'Suppliers', icon: <Truck className="w-3.5 h-3.5" /> },
          { id: 'tars', label: 'TARS', icon: <Timer className="w-3.5 h-3.5" /> },
          { id: 'approvals', label: `${language === 'ar' ? 'الموافقات' : 'Approvals'} (${pendingApprovals.length})`, icon: <ShieldCheck className="w-3.5 h-3.5" /> }
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id as any)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg font-medium transition-colors border-b-2 ${
              tab === item.id ? 'border-[#D4AF37] text-[#f5d97f]' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'suppliers' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setSupplierModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              {language === 'ar' ? 'مورد جديد' : 'New Supplier'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {suppliers.map(s => (
              <div key={s.id} className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-zinc-100 truncate">{s.legalName}</p>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-zinc-500 mt-1 font-mono">{s.id}</p>
                <p className="text-zinc-400 mt-1">{s.phone || '—'}</p>
              </div>
            ))}
            {suppliers.length === 0 && <p className="text-zinc-500">{language === 'ar' ? 'لا يوجد موردون بعد.' : 'No suppliers yet.'}</p>}
          </div>
        </div>
      )}

      {tab === 'purchase-orders' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setPoModalOpen(true)}
              disabled={suppliers.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title={suppliers.length === 0 ? (language === 'ar' ? 'أضف مورداً أولاً' : 'Add a supplier first') : ''}
            >
              <Plus className="w-3.5 h-3.5" />
              {language === 'ar' ? 'أمر توريد جديد' : 'New Purchase Order'}
            </button>
          </div>
          <div className="space-y-2.5">
            {purchaseOrders.map(po => (
              <div key={po.id} className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-zinc-100 font-mono">{po.id}</p>
                    <StatusBadge status={po.status} />
                    {po.kind === 'retroactive' && <Badge variant="purple" size="sm">{language === 'ar' ? 'بأثر رجعي' : 'Retroactive'}</Badge>}
                  </div>
                  <p className="text-zinc-400">{po.supplierName} · {po.totalValue.toLocaleString()} AED · v{po.version}</p>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {po.lineItems.map(li => (
                    <div key={li.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                      <div className="min-w-0">
                        <p className="text-zinc-300 truncate">{li.description} — {li.quantity} × {li.unitPrice.toLocaleString()} = {li.lineTotal.toLocaleString()} AED</p>
                        <p className="text-zinc-600 font-mono text-[10px]">{li.id}{li.operationId ? ` · ${li.operationId}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={li.status === 'cancelled' ? 'rose' : li.status === 'received' ? 'emerald' : 'zinc'} size="sm">
                          {li.status}
                        </Badge>
                        {po.status !== 'cancelled' && li.status === 'pending' && li.operationId && (
                          <>
                            <button
                              disabled={busyKey === li.id}
                              onClick={() => receiveLineItem(po, li.id)}
                              title={language === 'ar' ? 'وضع علامة كمُستلَم' : 'Mark received'}
                              className="p-1 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
                            >
                              <PackageCheck className="w-3 h-3" />
                            </button>
                            <button
                              disabled={busyKey === li.id}
                              onClick={() => cancelLineItem(po, li.id)}
                              title={language === 'ar' ? 'طلب إلغاء هذا العنصر' : 'Request cancelling this line'}
                              className="p-1 rounded-md bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 disabled:opacity-50"
                            >
                              <Ban className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {(amendmentsByPo[po.id] || []).length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500 flex items-center gap-1">
                      <History className="w-3 h-3" /> {language === 'ar' ? 'سجل التعديلات' : 'Amendment history'}
                    </p>
                    {amendmentsByPo[po.id].map(ar => (
                      <div key={ar.id} className="px-2.5 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-zinc-400 truncate">
                            <span className="font-mono text-zinc-500">{ar.id}</span> — {po.totalValue.toLocaleString()} → {ar.proposedTotalValue.toLocaleString()} AED · {ar.reason}
                          </p>
                          <p className="text-zinc-600 text-[10px]">{ar.requestedByName}{ar.decidedByName ? ` → ${ar.decidedByName}: ${ar.decisionNote || ''}` : ''}</p>
                        </div>
                        <Badge variant={ar.status === 'approved' ? 'emerald' : ar.status === 'rejected' ? 'rose' : 'amber'} size="sm">
                          {ar.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                {po.status !== 'cancelled' && (
                  <div className="mt-2.5 flex justify-end gap-4">
                    {['approved', 'partially_fulfilled', 'fulfilled', 'partially_cancelled'].includes(po.status) && (
                      <button
                        disabled={busyKey === po.id}
                        onClick={() => setAmendmentModalPo(po)}
                        className="text-[11px] font-medium text-[#f5d97f] hover:text-[#e2c48c] disabled:opacity-50 flex items-center gap-1"
                      >
                        <FileEdit className="w-3 h-3" />
                        {language === 'ar' ? 'طلب تعديل' : 'Request amendment'}
                      </button>
                    )}
                    <button
                      disabled={busyKey === po.id}
                      onClick={() => cancelPO(po)}
                      className="text-[11px] font-medium text-rose-400 hover:text-rose-300 disabled:opacity-50"
                    >
                      {language === 'ar' ? 'طلب إلغاء أمر التوريد بالكامل' : 'Request full PO cancellation'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {purchaseOrders.length === 0 && <p className="text-zinc-500">{language === 'ar' ? 'لا توجد أوامر توريد بعد.' : 'No purchase orders yet.'}</p>}
          </div>
        </div>
      )}

      {tab === 'tars' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setTarsModalOpen(true)}
              disabled={contracts.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
              title={contracts.length === 0 ? (language === 'ar' ? 'لا توجد عقود بعد' : 'No contracts exist yet') : ''}
            >
              <Plus className="w-3.5 h-3.5" />
              {language === 'ar' ? 'فتح سجل TARS' : 'Open TARS Record'}
            </button>
          </div>
          <div className="space-y-2.5">
            {tarsRecords.map(r => {
              const countdown = !r.executedAt ? tarsCountdown(r) : null;
              return (
                <div key={r.id} className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-zinc-100 font-mono">{r.id}</p>
                      <span className="text-zinc-500">{r.contractId}{r.vehicleId ? ` · ${r.vehicleId}` : ''}</span>
                      {r.escalationLevel && r.escalationLevel !== 'none' && (
                        <Badge variant={r.escalationLevel === 'urgent' ? 'rose' : 'amber'} size="sm">
                          <AlertTriangle className="w-3 h-3 inline mr-1" />
                          {r.escalationLevel === 'urgent' ? (language === 'ar' ? 'عاجل' : 'URGENT') : (language === 'ar' ? 'تصعيد' : 'ESCALATED')}
                        </Badge>
                      )}
                    </div>
                    {countdown && (
                      <span className={`font-mono ${countdown.overdue ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {countdown.text}
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2 text-zinc-400">
                    <p>{language === 'ar' ? 'وقت توقيع العقد:' : 'Contract signed:'} <span className="font-mono text-zinc-300">{new Date(r.contractSignedAt).toLocaleString()}</span></p>
                    <p>{language === 'ar' ? 'الموعد النهائي (٣ ساعات):' : '3h deadline:'} <span className="font-mono text-zinc-300">{new Date(r.deadlineAt).toLocaleString()}</span></p>
                    {r.executedAt && (
                      <>
                        <p>{language === 'ar' ? 'وقت التنفيذ الفعلي:' : 'Actual execution:'} <span className="font-mono text-zinc-300">{new Date(r.executedAt).toLocaleString()}</span> ({r.executedByName})</p>
                        <p>
                          {language === 'ar' ? 'التأخير:' : 'Delay:'}{' '}
                          {r.isDelayed
                            ? <span className="text-rose-400 font-mono">{r.delayMinutes} {language === 'ar' ? 'دقيقة' : 'min'} — {language === 'ar' ? 'المسؤول:' : 'responsible:'} {r.fineResponsibility}</span>
                            : <span className="text-emerald-400">{language === 'ar' ? 'لا يوجد -- في الموعد' : 'None -- on time'}</span>}
                        </p>
                      </>
                    )}
                    {r.returnedToSupplierAt && (
                      <p>{language === 'ar' ? 'أُعيدت للمورد:' : 'Returned to supplier:'} <span className="font-mono text-zinc-300">{new Date(r.returnedToSupplierAt).toLocaleString()}</span></p>
                    )}
                    {r.returnClosedAt && (
                      <p>
                        {language === 'ar' ? 'إغلاق الإعادة:' : 'Return closed:'} <span className="font-mono text-zinc-300">{new Date(r.returnClosedAt).toLocaleString()}</span>
                        {r.closingDelayed && <span className="text-rose-400"> — {language === 'ar' ? 'متأخر' : 'delayed'}</span>}
                      </p>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-end gap-4">
                    {!r.executedAt && (
                      <button
                        disabled={busyKey === r.id}
                        onClick={() => tarsExecute(r)}
                        className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        {language === 'ar' ? 'تسجيل التنفيذ الآن' : 'Record execution now'}
                      </button>
                    )}
                    {r.executedAt && !r.returnedToSupplierAt && (
                      <button
                        disabled={busyKey === r.id}
                        onClick={() => tarsReturnToSupplier(r)}
                        className="flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:text-sky-300 disabled:opacity-50"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        {language === 'ar' ? 'تسجيل الإعادة للمورد' : 'Record return to supplier'}
                      </button>
                    )}
                    {r.returnedToSupplierAt && !r.returnClosedAt && (
                      <button
                        disabled={busyKey === r.id}
                        onClick={() => tarsCloseReturn(r)}
                        className="flex items-center gap-1 text-[11px] font-medium text-[#f5d97f] hover:text-[#e2c48c] disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {language === 'ar' ? 'إغلاق الإعادة' : 'Close the return'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {tarsRecords.length === 0 && <p className="text-zinc-500">{language === 'ar' ? 'لا توجد سجلات TARS بعد.' : 'No TARS records yet.'}</p>}
          </div>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 mb-2">
              {language === 'ar' ? `طلبات معلّقة (${pendingApprovals.length})` : `Pending requests (${pendingApprovals.length})`}
            </h3>
            {pendingApprovals.length === 0 ? (
              <p className="text-zinc-500">{language === 'ar' ? 'لا توجد طلبات معلّقة.' : 'No pending requests.'}</p>
            ) : (
              <div className="space-y-2">
                {pendingApprovals.map(a => {
                  const amendment = findAmendment(a);
                  return (
                  <div key={a.id} className="p-3 rounded-xl bg-zinc-900/60 border border-amber-500/30 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-100">{a.entityType} {a.entityId} — {a.action}</p>
                      <p className="text-zinc-400 mt-0.5">{a.requestedByName} ({a.requestedByRole}) · {a.reason}</p>
                      {amendment && (
                        <div className="mt-1.5 p-2 rounded-lg bg-zinc-950/70 border border-zinc-800/80">
                          <p className="text-zinc-300">
                            {language === 'ar' ? 'القيمة الإجمالية:' : 'Total value:'}{' '}
                            <span className="font-mono">{(purchaseOrders.find(p => p.id === a.entityId)?.totalValue ?? 0).toLocaleString()}</span>
                            {' → '}
                            <span className="font-mono text-[#f5d97f]">{amendment.proposedTotalValue.toLocaleString()} AED</span>
                          </p>
                          <p className="text-zinc-500 text-[10px] mt-0.5">
                            {amendment.proposedLineItems.length} {language === 'ar' ? 'عنصر بعد التعديل — راجع أمر التوريد لرؤية كل سطر.' : 'line item(s) after this amendment — see the purchase order card for the full line-level detail.'}
                          </p>
                        </div>
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
            )}
          </div>

          {decidedApprovals.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-zinc-100 mb-2">{language === 'ar' ? 'قرارات سابقة' : 'Recent decisions'}</h3>
              <div className="space-y-1.5">
                {decidedApprovals.map(a => (
                  <div key={a.id} className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between gap-2">
                    <span className="text-zinc-400 truncate">{a.entityType} {a.entityId} — {a.action} — {a.decisionNote}</span>
                    <span className={`text-[10px] font-bold shrink-0 ${a.status === 'approved' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {a.status === 'approved' ? (language === 'ar' ? 'موافَق عليه' : 'APPROVED') : (language === 'ar' ? 'مرفوض' : 'REJECTED')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <NewSupplierModal
        isOpen={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        onCreated={async () => { setSupplierModalOpen(false); await load(); }}
      />
      <NewPurchaseOrderModal
        isOpen={poModalOpen}
        onClose={() => setPoModalOpen(false)}
        suppliers={suppliers}
        operationTypes={operationTypes}
        onCreated={async () => { setPoModalOpen(false); await load(); }}
      />
      <AmendmentRequestModal
        po={amendmentModalPo}
        onClose={() => setAmendmentModalPo(null)}
        operationTypes={operationTypes}
        onCreated={async () => { setAmendmentModalPo(null); await load(); }}
      />
      <NewTarsRecordModal
        isOpen={tarsModalOpen}
        onClose={() => setTarsModalOpen(false)}
        contracts={contracts}
        onCreated={async () => { setTarsModalOpen(false); await load(); }}
      />
    </div>
  );
};

const NewSupplierModal: React.FC<{ isOpen: boolean; onClose: () => void; onCreated: () => void }> = ({ isOpen, onClose, onCreated }) => {
  const { language } = useLanguage();
  const { showToast } = useCRM();
  const [legalName, setLegalName] = useState('');
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalName, tradeLicenseNumber, phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to add supplier.');
      showToast(language === 'ar' ? 'تمت إضافة المورد' : 'Supplier added', data.legalName);
      setLegalName(''); setTradeLicenseNumber(''); setPhone('');
      onCreated();
    } catch (err: any) {
      showToast(language === 'ar' ? 'فشلت الإضافة' : 'Failed to add', err?.message || '');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={language === 'ar' ? 'مورد جديد' : 'New Supplier'} maxWidth="md">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'الاسم القانوني *' : 'Legal name *'}</label>
          <input required value={legalName} onChange={e => setLegalName(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'رقم الرخصة التجارية *' : 'Trade license number *'}</label>
          <input required value={tradeLicenseNumber} onChange={e => setTradeLicenseNumber(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'رقم الهاتف *' : 'Phone *'}</label>
          <input required value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>
        <p className="text-zinc-500">
          {language === 'ar'
            ? 'يُفعَّل المورد فور توفر هذه الحقول الأساسية؛ بيانات أخرى (البنك، الضريبة) يمكن استكمالها لاحقاً.'
            : 'The supplier activates as soon as these core fields exist -- other data (bank details, tax registration) can be completed later.'}
        </p>
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold disabled:opacity-50">
            {language === 'ar' ? 'إضافة' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const NewPurchaseOrderModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  operationTypes: SupplierOperationTypeDef[];
  onCreated: () => void;
}> = ({ isOpen, onClose, suppliers, operationTypes, onCreated }) => {
  const { language } = useLanguage();
  const { showToast } = useCRM();
  const [supplierFilter, setSupplierFilter] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [kind, setKind] = useState<'regular' | 'retroactive'>('regular');
  const [retroactiveReason, setRetroactiveReason] = useState('emergency_purchase');
  const [reason, setReason] = useState('');
  const [lineItems, setLineItems] = useState<POLineItemDraft[]>([emptyLineItem()]);
  const [submitting, setSubmitting] = useState(false);

  const filteredSuppliers = useMemo(
    () => suppliers.filter(s => s.status === 'active' && s.legalName.toLowerCase().includes(supplierFilter.toLowerCase())),
    [suppliers, supplierFilter]
  );

  const updateLine = (idx: number, patch: Partial<POLineItemDraft>) => {
    setLineItems(items => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const total = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          retroactiveReason: kind === 'retroactive' ? retroactiveReason : undefined,
          supplierId,
          reason,
          lineItems: lineItems.map(li => ({
            operationType: li.operationType,
            description: li.description,
            vehicleDescription: li.vehicleDescription || undefined,
            quantity: Number(li.quantity),
            unitPrice: Number(li.unitPrice)
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create purchase order.');
      showToast(language === 'ar' ? 'تم إنشاء أمر التوريد' : 'Purchase order created', data.po?.id);
      setSupplierId(''); setReason(''); setLineItems([emptyLineItem()]);
      onCreated();
    } catch (err: any) {
      showToast(language === 'ar' ? 'فشل الإنشاء' : 'Creation failed', err?.message || '');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={language === 'ar' ? 'أمر توريد جديد' : 'New Purchase Order'} maxWidth="4xl">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'المورد *' : 'Supplier *'}</label>
            <div className="relative mb-1.5">
              <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={supplierFilter}
                onChange={e => setSupplierFilter(e.target.value)}
                placeholder={language === 'ar' ? 'ابحث عن مورد...' : 'Search suppliers...'}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <select required value={supplierId} onChange={e => setSupplierId(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
              <option value="">{language === 'ar' ? '-- اختر مورداً --' : '-- Select a supplier --'}</option>
              {filteredSuppliers.map(s => <option key={s.id} value={s.id}>{s.legalName} ({s.id})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'نوع الأمر' : 'PO kind'}</label>
            <select value={kind} onChange={e => setKind(e.target.value as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
              <option value="regular">{language === 'ar' ? 'عادي' : 'Regular'}</option>
              <option value="retroactive">{language === 'ar' ? 'بأثر رجعي' : 'Retroactive'}</option>
            </select>
            {kind === 'retroactive' && (
              <select value={retroactiveReason} onChange={e => setRetroactiveReason(e.target.value)} className="w-full mt-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
                <option value="emergency_purchase">{language === 'ar' ? 'شراء طارئ' : 'Emergency purchase'}</option>
                <option value="invoice_received_before_po">{language === 'ar' ? 'وصول فاتورة قبل وجود أمر توريد' : 'Invoice received before a PO existed'}</option>
                <option value="price_confirmed_after_delivery">{language === 'ar' ? 'تأكيد السعر بعد التسليم فقط' : 'Price only confirmed after delivery'}</option>
                <option value="verbal_agreement_formalized_late">{language === 'ar' ? 'اتفاق شفهي تم توثيقه لاحقًا' : 'Verbal agreement formalized after the fact'}</option>
                <option value="other">{language === 'ar' ? 'أخرى' : 'Other'}</option>
              </select>
            )}
          </div>
        </div>

        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'سبب الطلب *' : 'Reason for this request *'}</label>
          <input required value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-zinc-400 font-medium">{language === 'ar' ? 'العناصر' : 'Line items'}</label>
            <button type="button" onClick={() => setLineItems(items => [...items, emptyLineItem()])} className="text-[11px] text-[#f5d97f] hover:underline">
              + {language === 'ar' ? 'إضافة عنصر' : 'Add line item'}
            </button>
          </div>
          {lineItems.map((li, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
              <select
                required
                value={li.operationType}
                onChange={e => updateLine(idx, { operationType: e.target.value })}
                className="col-span-3 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                <option value="">{language === 'ar' ? '-- النوع --' : '-- Type --'}</option>
                {operationTypes.map(t => <option key={t.key} value={t.key}>{language === 'ar' ? t.labelAr : t.labelEn}</option>)}
              </select>
              <input
                required
                placeholder={language === 'ar' ? 'الوصف' : 'Description'}
                value={li.description}
                onChange={e => updateLine(idx, { description: e.target.value })}
                className="col-span-4 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
              <input
                type="number" min={1} required
                value={li.quantity}
                onChange={e => updateLine(idx, { quantity: Number(e.target.value) })}
                className="col-span-2 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
              <input
                type="number" min={0} step="0.01" required
                placeholder={language === 'ar' ? 'السعر' : 'Unit price'}
                value={li.unitPrice}
                onChange={e => updateLine(idx, { unitPrice: Number(e.target.value) })}
                className="col-span-2 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
              {lineItems.length > 1 && (
                <button type="button" onClick={() => setLineItems(items => items.filter((_, i) => i !== idx))} className="col-span-1 text-rose-400 hover:text-rose-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <p className="text-zinc-400 text-right pt-1">{language === 'ar' ? 'الإجمالي' : 'Total'}: <span className="font-mono text-zinc-100">{total.toLocaleString()} AED</span></p>
        </div>

        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold disabled:opacity-50">
            {language === 'ar' ? 'إرسال للموافقة' : 'Submit for approval'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

interface AmendmentLineDraft {
  id?: string; // present = modifies an existing line; absent = a brand-new line
  operationType: string;
  description: string;
  vehicleDescription: string;
  quantity: number;
  unitPrice: number;
}

const AmendmentRequestModal: React.FC<{
  po: PurchaseOrder | null;
  onClose: () => void;
  operationTypes: SupplierOperationTypeDef[];
  onCreated: () => void;
}> = ({ po, onClose, operationTypes, onCreated }) => {
  const { language } = useLanguage();
  const { showToast } = useCRM();
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<AmendmentLineDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Re-seed the draft from the PO's CURRENT line items every time a
  // different PO is opened for amendment -- each existing line keeps its
  // id (so the backend treats it as "modify this line", carrying forward
  // anything left untouched exactly as it already works: an existing line
  // not mentioned at all is never silently removed).
  useEffect(() => {
    if (po) {
      setLines(po.lineItems.map((li): AmendmentLineDraft => ({
        id: li.id,
        operationType: li.operationType,
        description: li.description,
        vehicleDescription: li.vehicleDescription || '',
        quantity: li.quantity,
        unitPrice: li.unitPrice
      })));
      setReason('');
    }
  }, [po]);

  if (!po) return null;

  const updateLine = (idx: number, patch: Partial<AmendmentLineDraft>) => {
    setLines(items => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const proposedTotal = lines.reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/purchase-orders/${encodeURIComponent(po.id)}/amendment-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          lineItems: lines.map(li => ({
            id: li.id,
            operationType: li.operationType,
            description: li.description,
            vehicleDescription: li.vehicleDescription || undefined,
            quantity: Number(li.quantity),
            unitPrice: Number(li.unitPrice)
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to request this amendment.');
      showToast(
        language === 'ar' ? 'تم إرسال طلب التعديل' : 'Amendment requested',
        `${po.id} · ${po.totalValue.toLocaleString()} → ${data.amendmentRequest.proposedTotalValue.toLocaleString()} AED`
      );
      onCreated();
    } catch (err: any) {
      showToast(language === 'ar' ? 'فشل الطلب' : 'Request failed', err?.message || '');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={!!po}
      onClose={onClose}
      title={language === 'ar' ? `طلب تعديل — ${po.id}` : `Request Amendment — ${po.id}`}
      subtitle={language === 'ar'
        ? 'عدّل السطور الحالية أو أضف سطوراً جديدة. لا يمكن حذف سطر موجود من هنا -- فقط طلب إلغائه بشكل منفصل.'
        : 'Edit existing lines or add new ones. An existing line can\'t be deleted here -- request its own cancellation separately for that.'}
      maxWidth="4xl"
    >
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'سبب التعديل *' : 'Reason for this amendment *'}</label>
          <input
            required
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={language === 'ar' ? 'مثال: تصحيح السعر بعد عرض سعر جديد من المورد' : 'e.g. Correcting the price after a new supplier quote'}
            className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-zinc-400 font-medium">{language === 'ar' ? 'العناصر' : 'Line items'}</label>
            <button
              type="button"
              onClick={() => setLines(items => [...items, { operationType: '', description: '', vehicleDescription: '', quantity: 1, unitPrice: 0 }])}
              className="text-[11px] text-[#f5d97f] hover:underline"
            >
              + {language === 'ar' ? 'إضافة عنصر جديد' : 'Add new line item'}
            </button>
          </div>
          {lines.map((li, idx) => (
            <div key={li.id || `new-${idx}`} className="grid grid-cols-12 gap-1.5 items-center">
              <select
                required
                value={li.operationType}
                onChange={e => updateLine(idx, { operationType: e.target.value })}
                className="col-span-3 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                <option value="">{language === 'ar' ? '-- النوع --' : '-- Type --'}</option>
                {operationTypes.map(t => <option key={t.key} value={t.key}>{language === 'ar' ? t.labelAr : t.labelEn}</option>)}
              </select>
              <input
                required
                placeholder={language === 'ar' ? 'الوصف' : 'Description'}
                value={li.description}
                onChange={e => updateLine(idx, { description: e.target.value })}
                className="col-span-4 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
              <input
                type="number" min={1} required
                value={li.quantity}
                onChange={e => updateLine(idx, { quantity: Number(e.target.value) })}
                className="col-span-2 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
              <input
                type="number" min={0} step="0.01" required
                placeholder={language === 'ar' ? 'السعر' : 'Unit price'}
                value={li.unitPrice}
                onChange={e => updateLine(idx, { unitPrice: Number(e.target.value) })}
                className="col-span-2 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
              {li.id ? (
                <span className="col-span-1 text-center text-[9px] text-zinc-600 font-mono truncate" title={li.id}>{language === 'ar' ? 'موجود' : 'existing'}</span>
              ) : (
                <button type="button" onClick={() => setLines(items => items.filter((_, i) => i !== idx))} className="col-span-1 text-rose-400 hover:text-rose-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <p className="text-zinc-400 text-right pt-1">
            {language === 'ar' ? 'الإجمالي الحالي' : 'Current total'}: <span className="font-mono">{po.totalValue.toLocaleString()} AED</span>
            {' → '}
            {language === 'ar' ? 'المقترح' : 'Proposed'}: <span className="font-mono text-[#f5d97f]">{proposedTotal.toLocaleString()} AED</span>
          </p>
        </div>

        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="submit" disabled={submitting || !reason.trim()} className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold disabled:opacity-50">
            {language === 'ar' ? 'إرسال طلب التعديل للموافقة' : 'Submit amendment for approval'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const NewTarsRecordModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  contracts: Contract[];
  onCreated: () => void;
}> = ({ isOpen, onClose, contracts, onCreated }) => {
  const { language } = useLanguage();
  const { showToast } = useCRM();
  const [contractId, setContractId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedContract = contracts.find(c => c.id === contractId);

  useEffect(() => {
    if (selectedContract) setVehicleId(selectedContract.vehicleId);
  }, [contractId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/tars-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: selectedContract.id,
          vehicleId: vehicleId || undefined,
          // The signed time is the contract's own createdAt -- never a
          // value typed into this form. Letting a human pick an arbitrary
          // "signed at" time would be exactly the kind of timestamp
          // manipulation the 3-hour deadline exists to be immune to.
          contractSignedAt: selectedContract.createdAt
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to open a TARS record.');
      showToast(language === 'ar' ? 'تم فتح سجل TARS' : 'TARS record opened', `${data.id} — ${language === 'ar' ? 'الموعد النهائي' : 'deadline'} ${new Date(data.deadlineAt).toLocaleString()}`);
      setContractId(''); setVehicleId('');
      onCreated();
    } catch (err: any) {
      showToast(language === 'ar' ? 'فشل الفتح' : 'Failed to open', err?.message || '');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'ar' ? 'فتح سجل TARS' : 'Open a TARS Record'}
      subtitle={language === 'ar'
        ? 'الموعد النهائي (٣ ساعات) يُحسب من وقت توقيع العقد الفعلي -- لا يمكن تعديله يدوياً.'
        : 'The 3-hour deadline is computed from the contract\'s actual signed time -- it can\'t be edited here.'}
      maxWidth="md"
    >
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'العقد *' : 'Contract *'}</label>
          <select
            required
            value={contractId}
            onChange={e => setContractId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
          >
            <option value="">{language === 'ar' ? '-- اختر عقداً --' : '-- Select a contract --'}</option>
            {contracts.map(c => <option key={c.id} value={c.id}>{c.contractNumber} — {c.customerName} — {c.vehicleName}</option>)}
          </select>
        </div>
        {selectedContract && (
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
            <p className="text-zinc-400">
              {language === 'ar' ? 'وقت التوقيع الفعلي (من سجل العقد):' : 'Actual signed time (from the contract record):'}{' '}
              <span className="font-mono text-zinc-200">{new Date(selectedContract.createdAt).toLocaleString()}</span>
            </p>
            <p className="text-zinc-500 mt-1">
              {language === 'ar' ? 'الموعد النهائي سيكون:' : 'Deadline will be:'}{' '}
              <span className="font-mono text-[#f5d97f]">{new Date(new Date(selectedContract.createdAt).getTime() + 3 * 60 * 60 * 1000).toLocaleString()}</span>
            </p>
          </div>
        )}
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="submit" disabled={submitting || !contractId} className="px-5 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold disabled:opacity-50">
            {language === 'ar' ? 'فتح السجل' : 'Open record'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
