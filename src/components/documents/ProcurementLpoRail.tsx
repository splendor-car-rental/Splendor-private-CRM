import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Loader2, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useLanguage } from '../../context/LanguageContext';
import { WorkflowDocumentPreviewButton } from './WorkflowDocumentPreviewButton';
import type { PurchaseOrder } from '../../types';

const ISSUABLE_STATUSES = new Set(['approved', 'partially_fulfilled', 'fulfilled', 'partially_cancelled']);

export const ProcurementLpoRail: React.FC = () => {
  const { language } = useLanguage();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch('/api/purchase-orders');
        if (!response.ok) throw new Error(`Purchase orders could not be loaded (${response.status}).`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Purchase-order response was not a collection.');
        if (cancelled) return;
        setPurchaseOrders(data);
        setSelectedId(current => current && data.some((po: PurchaseOrder) => po.id === current) ? current : (data[0]?.id || ''));
      } catch (cause: any) {
        if (!cancelled) setError(cause?.message || 'Purchase orders could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(() => purchaseOrders.find(po => po.id === selectedId), [purchaseOrders, selectedId]);
  const canIssue = Boolean(selected && ISSUABLE_STATUSES.has(selected.status) && selected.approvedBy && selected.approvedAt);

  return (
    <div className="mb-5 rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-r from-[#181409] via-zinc-950 to-zinc-950 px-4 py-3 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 p-2 text-[#f5d97f]"><ClipboardCheck className="h-4 w-4" /></div>
          <div className="min-w-0">
            <div className="text-xs font-black text-[#f5d97f]">{language === 'ar' ? 'LPO الرسمي من أمر الشراء' : 'Official LPO from Purchase Order'}</div>
            <div className="mt-0.5 text-[10px] text-zinc-500">{language === 'ar' ? 'اختر أمر الشراء المحفوظ. المعاينة لا تحجز رقماً؛ الإصدار لا يُفتح إلا بعد اعتماد الخادم.' : 'Select the persisted PO. Preview consumes no serial; official issue unlocks only after server-side approval.'}</div>
          </div>
        </div>

        <div className="flex min-w-[280px] flex-1 flex-wrap items-center justify-end gap-2">
          {loading ? <div className="inline-flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />{language === 'ar' ? 'تحميل أوامر الشراء' : 'Loading purchase orders'}</div> : (
            <>
              <select
                value={selectedId}
                onChange={event => setSelectedId(event.target.value)}
                className="min-w-[240px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-200 outline-none focus:border-[#D4AF37]/60"
              >
                {purchaseOrders.length === 0 && <option value="">{language === 'ar' ? 'لا توجد أوامر شراء' : 'No purchase orders'}</option>}
                {purchaseOrders.map(po => <option key={po.id} value={po.id}>{po.id} · {po.supplierName} · {po.status}</option>)}
              </select>
              {selected && (
                <WorkflowDocumentPreviewButton
                  kind="lpo"
                  source={{ type: 'purchase_order', id: selected.id }}
                  labelAr="معاينة LPO"
                  labelEn="Preview LPO"
                  canIssue={canIssue}
                  issueLabelAr="إصدار وأرشفة LPO"
                  issueLabelEn="Issue & Archive LPO"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-3 py-2 text-xs font-black text-[#f5d97f] transition hover:bg-[#D4AF37]/20"
                />
              )}
            </>
          )}
        </div>
      </div>

      {error && <div role="alert" className="mt-2 text-[11px] font-semibold text-rose-400">{error}</div>}
      {selected && <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
        <span className="font-mono text-zinc-400">{selected.id}</span>
        <span>• {selected.supplierName}</span>
        <span>• {selected.totalValue.toLocaleString()} AED</span>
        <span className={canIssue ? 'text-emerald-400' : 'text-amber-400'}>
          <ShieldCheck className="mr-1 inline h-3 w-3" />
          {canIssue ? (language === 'ar' ? 'مؤهل للإصدار الرسمي' : 'Eligible for official issue') : (language === 'ar' ? 'معاينة فقط حتى الاعتماد' : 'Preview only until approved')}
        </span>
      </div>}
    </div>
  );
};
