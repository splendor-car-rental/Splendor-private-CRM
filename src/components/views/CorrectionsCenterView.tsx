import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert, FileWarning, CalendarX, CarFront, Search,
  Trash2, Loader2, AlertTriangle, ExternalLink, RefreshCw
} from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { PhoneText } from '../common/PhoneText';

type CorrectionContractRow = {
  id: string;
  contractNumber: string;
  customerName: string;
  vehicleName: string;
  vehiclePlate: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  deletable: boolean;
  blockReason?: string;
};

type CorrectionReservationRow = {
  id: string;
  customerName: string;
  customerPhone: string;
  vehicleName: string;
  vehiclePlate: string;
  status: string;
  depositStatus: string;
  totalAmount: number;
  pickupDateTime: string;
  createdAt: string;
  deletable: boolean;
  blockReason?: string;
};

const money = (value: number | undefined) => `${(Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} د.إ`;

async function getJson<T>(url: string): Promise<T> {
  const response = await apiFetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `فشل الطلب (${response.status})`);
  return body as T;
}

type Tab = 'contracts' | 'reservations' | 'vehicles' | 'customers';

const TABS: { key: Tab; labelAr: string; labelEn: string; icon: React.ReactNode }[] = [
  { key: 'contracts', labelAr: 'عقود غير مكتملة', labelEn: 'Incomplete Contracts', icon: <FileWarning className="w-4 h-4" /> },
  { key: 'reservations', labelAr: 'حجوزات بالخطأ', labelEn: 'Mistaken Reservations', icon: <CalendarX className="w-4 h-4" /> },
  { key: 'vehicles', labelAr: 'التخلص من مركبة', labelEn: 'Vehicle Disposal', icon: <CarFront className="w-4 h-4" /> },
  { key: 'customers', labelAr: 'تصحيح بيانات عميل', labelEn: 'Correct Customer Data', icon: <Search className="w-4 h-4" /> }
];

/**
 * CEO/Admin-only screen for correcting mistakes without weakening the
 * server's financial-integrity guards: a truly incomplete contract or a
 * mistaken reservation can be permanently deleted (the same guarded DELETE
 * routes reject anything with money attached); everything else -- a vehicle
 * that was sold/disposed/had its ownership transferred, or a customer record
 * with wrong data -- routes to the app's own existing edit surfaces
 * (the Fleet lifecycle modal, the Customer 360 profile) rather than a new
 * generic editor, since those already exist and are already audited.
 */
export const CorrectionsCenterView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const {
    vehicles, customers, showToast,
    deleteContract, deleteReservation,
    setSelectedVehicleId, setSelectedCustomerId, setActiveView
  } = useCRM();

  const [tab, setTab] = useState<Tab>('contracts');
  const [contracts, setContracts] = useState<CorrectionContractRow[] | null>(null);
  const [reservations, setReservations] = useState<CorrectionReservationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'contract' | 'reservation'; id: string; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const data = await getJson<{ contracts: CorrectionContractRow[] }>('/api/corrections/contracts');
      setContracts(data.contracts);
    } catch (err: any) {
      showToast(isAr ? 'تعذر التحميل' : 'Load failed', err?.message || '', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadReservations = async () => {
    setLoading(true);
    try {
      const data = await getJson<{ reservations: CorrectionReservationRow[] }>('/api/corrections/reservations');
      setReservations(data.reservations);
    } catch (err: any) {
      showToast(isAr ? 'تعذر التحميل' : 'Load failed', err?.message || '', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'contracts' && contracts === null) loadContracts();
    if (tab === 'reservations' && reservations === null) loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filteredVehicles = useMemo(() => {
    const active = vehicles.filter(v => !v.lifecycleStatus || v.lifecycleStatus === 'ACTIVE');
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return active.slice(0, 40);
    return active.filter(v =>
      v.plateNumber?.toLowerCase().includes(q) ||
      v.make?.toLowerCase().includes(q) ||
      v.model?.toLowerCase().includes(q) ||
      v.vin?.toLowerCase().includes(q)
    ).slice(0, 40);
  }, [vehicles, vehicleSearch]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return [];
    return customers.filter(c =>
      c.fullName?.toLowerCase().includes(q) ||
      c.fullNameAr?.toLowerCase().includes(q) ||
      c.fullNameEn?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    ).slice(0, 25);
  }, [customers, customerSearch]);

  const openVehicle = (id: string) => {
    setSelectedVehicleId(id);
    setActiveView('fleet');
  };

  const openCustomer = (id: string) => {
    setSelectedCustomerId(id);
    setActiveView('customers');
  };

  const runDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    try {
      if (confirmTarget.type === 'contract') {
        await deleteContract(confirmTarget.id, reason.trim() || undefined);
        setContracts(prev => prev?.filter(c => c.id !== confirmTarget.id) || prev);
      } else {
        await deleteReservation(confirmTarget.id, reason.trim() || undefined);
        setReservations(prev => prev?.filter(r => r.id !== confirmTarget.id) || prev);
      }
      setConfirmTarget(null);
      setReason('');
    } catch {
      // deleteContract/deleteReservation already show an error toast
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-10" dir={isAr ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-xl font-display font-bold text-zinc-100 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" /> {isAr ? 'مركز التصحيحات' : 'Corrections Center'}
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          {isAr
            ? 'مخصص لتصحيح الأخطاء بأمان: عقد غير مكتمل أو حجز بالخطأ يُحذف نهائياً هنا؛ أما بيع/التخلص من مركبة أو تصحيح بيانات عميل فيتم عبر شاشاتها المعتادة مع الاحتفاظ بسجل التدقيق الكامل.'
            : 'For safely correcting mistakes: an incomplete contract or a mistaken reservation is permanently deleted here; disposing of a vehicle or correcting customer data routes to its normal screen, keeping the full audit trail.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              tab === t.key ? 'bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/40' : 'text-zinc-400 hover:bg-zinc-900 border border-transparent'
            }`}
          >
            {t.icon} {isAr ? t.labelAr : t.labelEn}
          </button>
        ))}
      </div>

      {tab === 'contracts' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">{isAr ? 'عقود بحالة مسودة أو قيد المراجعة فقط.' : 'Draft or review-status contracts only.'}</p>
            <button onClick={loadContracts} disabled={loading} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {isAr ? 'تحديث' : 'Refresh'}
            </button>
          </div>
          {(contracts || []).length === 0 && !loading && (
            <div className="text-xs text-zinc-500 p-6 text-center rounded-2xl border border-dashed border-zinc-800">
              {isAr ? 'لا توجد عقود غير مكتملة حالياً.' : 'No incomplete contracts right now.'}
            </div>
          )}
          <div className="space-y-2">
            {(contracts || []).map(c => (
              <div key={c.id} className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[220px]">
                  <div className="text-sm font-semibold text-zinc-100">{c.contractNumber} · {c.customerName}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">{c.vehicleName} · <span dir="ltr">{c.vehiclePlate}</span> · {money(c.grandTotal)} · {c.status}</div>
                </div>
                {c.deletable ? (
                  <button
                    onClick={() => setConfirmTarget({ type: 'contract', id: c.id, label: `${c.contractNumber} — ${c.customerName}` })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {isAr ? 'حذف نهائي' : 'Delete permanently'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {c.blockReason || (isAr ? 'غير قابل للحذف.' : 'Not deletable.')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'reservations' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">{isAr ? 'حجوزات معلّقة أو ملغاة أو لم يحضر صاحبها، بدون تأمين محصّل.' : 'Pending, cancelled, or no-show reservations with no collected deposit.'}</p>
            <button onClick={loadReservations} disabled={loading} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {isAr ? 'تحديث' : 'Refresh'}
            </button>
          </div>
          {(reservations || []).length === 0 && !loading && (
            <div className="text-xs text-zinc-500 p-6 text-center rounded-2xl border border-dashed border-zinc-800">
              {isAr ? 'لا توجد حجوزات قابلة للتصحيح حالياً.' : 'No correctable reservations right now.'}
            </div>
          )}
          <div className="space-y-2">
            {(reservations || []).map(r => (
              <div key={r.id} className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[220px]">
                  <div className="text-sm font-semibold text-zinc-100">{r.id} · {r.customerName}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1 flex-wrap">
                    <span>{r.vehicleName} · <span dir="ltr">{r.vehiclePlate}</span> · {money(r.totalAmount)} · {r.status}</span>
                    {r.customerPhone && <span className="flex items-center gap-1">· <PhoneText value={r.customerPhone} /></span>}
                  </div>
                </div>
                {r.deletable ? (
                  <button
                    onClick={() => setConfirmTarget({ type: 'reservation', id: r.id, label: `${r.id} — ${r.customerName}` })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {isAr ? 'حذف نهائي' : 'Delete permanently'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {r.blockReason || (isAr ? 'غير قابل للحذف.' : 'Not deletable.')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'vehicles' && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            {isAr
              ? 'بيع مركبة أو التخلص منها أو نقل ملكيتها لا يُحذف سجلها أبداً -- بل يُنقل عبر دورة حياة مؤرشفة ومدقّقة. اختر مركبة لفتح ملفها الكامل ثم استخدم "دورة حياة المركبة" لتسجيل البيع/التخلص/النقل.'
              : 'Selling, disposing of, or transferring a vehicle never deletes its record -- it moves through an audited archive lifecycle instead. Pick a vehicle to open its full profile, then use "Vehicle Lifecycle" there to record the sale/disposal/transfer.'}
          </p>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={vehicleSearch}
              onChange={e => setVehicleSearch(e.target.value)}
              placeholder={isAr ? 'ابحث بالموديل أو رقم اللوحة أو VIN...' : 'Search by model, plate, or VIN...'}
              className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#D4AF37]/60"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredVehicles.map(v => (
              <button
                key={v.id}
                onClick={() => openVehicle(v.id)}
                className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-[#D4AF37]/40 text-start flex items-center justify-between gap-3 transition-colors"
              >
                <div>
                  <div className="text-sm font-semibold text-zinc-100">{v.make} {v.model} ({v.year})</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5" dir="ltr">{v.plateNumber} · {v.vin}</div>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-500 shrink-0" />
              </button>
            ))}
            {filteredVehicles.length === 0 && (
              <div className="text-xs text-zinc-500 p-6 text-center rounded-2xl border border-dashed border-zinc-800 md:col-span-2">
                {isAr ? 'لا توجد نتائج.' : 'No results.'}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'customers' && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            {isAr
              ? 'ابحث عن العميل صاحب البيانات الخاطئة، ثم افتح ملفه الكامل لتصحيح بياناته من هناك.'
              : 'Search for the customer with incorrect data, then open their full profile to correct it there.'}
          </p>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              placeholder={isAr ? 'ابحث بالاسم أو الهاتف أو البريد الإلكتروني...' : 'Search by name, phone, or email...'}
              className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#D4AF37]/60"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredCustomers.map(c => (
              <button
                key={c.id}
                onClick={() => openCustomer(c.id)}
                className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-[#D4AF37]/40 text-start flex items-center justify-between gap-3 transition-colors"
              >
                <div>
                  <div className="text-sm font-semibold text-zinc-100">{c.fullName}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5"><PhoneText value={c.phone} /> {c.email ? `· ${c.email}` : ''}</div>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-500 shrink-0" />
              </button>
            ))}
            {customerSearch.trim() && filteredCustomers.length === 0 && (
              <div className="text-xs text-zinc-500 p-6 text-center rounded-2xl border border-dashed border-zinc-800 md:col-span-2">
                {isAr ? 'لا توجد نتائج.' : 'No results.'}
              </div>
            )}
          </div>
        </div>
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !deleting && setConfirmTarget(null)}>
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-zinc-100 font-bold text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-400" /> {isAr ? 'تأكيد الحذف النهائي' : 'Confirm permanent deletion'}
            </h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              {isAr
                ? `سيتم حذف "${confirmTarget.label}" نهائياً من النظام. هذا الإجراء لا يمكن التراجع عنه.`
                : `"${confirmTarget.label}" will be permanently deleted from the system. This cannot be undone.`}
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={isAr ? 'سبب الحذف (اختياري)' : 'Reason for deletion (optional)'}
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-rose-500/60"
            />
            <div className="flex gap-2">
              <button onClick={() => setConfirmTarget(null)} disabled={deleting} className="flex-1 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:bg-zinc-800/60 text-xs font-semibold disabled:opacity-50">
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={runDelete} disabled={deleting} className="flex-1 py-2 rounded-xl bg-rose-600 text-white font-semibold text-xs disabled:opacity-50">
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : (isAr ? 'حذف نهائي' : 'Delete permanently')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
