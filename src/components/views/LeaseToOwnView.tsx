import React, { useCallback, useEffect, useState } from 'react';
import {
  KeySquare, Plus, Loader2, CheckCircle2, XCircle, ShieldCheck, Wallet,
  CalendarClock, FileWarning, Handshake, ArrowRightLeft, RefreshCcw, FileText
} from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { Badge, type BadgeVariant } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate } from '../../lib/dateFormat';
import type { Contract, LtoApplication, LtoApplicationStatus, LtoInstallment, LtoSettlementRequest } from '../../types';

/**
 * Lease-to-Own workspace (Splendor Private Mobility Operating System).
 * A thin UI over src/server/leaseToOwn.ts's /api/lto/* routes -- every
 * number shown here (offer, schedule, outstanding balance, settlement
 * amount) is server-computed; this view never calculates money itself.
 */

const APPLICATION_STATUS_VARIANT: Record<LtoApplicationStatus, BadgeVariant> = {
  draft: 'zinc', submitted: 'sky', under_review: 'amber', approved: 'emerald', rejected: 'rose', cancelled: 'zinc'
};

const LTO_STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: 'emerald', settlement_requested: 'amber', settled: 'sky', default: 'rose',
  termination_requested: 'amber', terminated: 'rose', ownership_transfer_pending: 'purple',
  ownership_transferred: 'gold', completed: 'gold'
};

const INSTALLMENT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  upcoming: 'zinc', due: 'sky', partially_paid: 'amber', paid: 'emerald', late: 'amber', overdue: 'rose', settled: 'gold'
};

function money(n: number | undefined | null) {
  return `AED ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | undefined) {
  if (!iso) return '—';
  return formatDate(iso);
}

export const LeaseToOwnView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { currentUser } = useAuth();
  const { customers, vehicles, showToast } = useCRM();

  const canCreate = ['ceo', 'admin', 'operations', 'sales'].includes(currentUser.role);
  const canDecide = ['ceo', 'admin', 'finance'].includes(currentUser.role);
  const canOperate = ['ceo', 'admin', 'operations', 'finance', 'sales'].includes(currentUser.role);

  const [tab, setTab] = useState<'applications' | 'agreements'>('applications');
  const [applications, setApplications] = useState<LtoApplication[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, contractsRes] = await Promise.all([
        apiFetch('/api/lto/applications'),
        apiFetch('/api/lto/contracts')
      ]);
      if (appsRes.ok) setApplications(await appsRes.json());
      if (contractsRes.ok) setContracts(await contractsRes.json());
    } catch (e) {
      console.error('Failed to load Lease-to-Own data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedApp = applications.find(a => a.id === selectedAppId) || null;
  const selectedContract = contracts.find(c => c.id === selectedContractId) || null;

  const errorText = (e: unknown) => (e instanceof Error ? e.message : isAr ? 'حدث خطأ غير متوقع.' : 'Something went wrong.');

  async function callApi(path: string, method: string, body?: unknown) {
    const res = await apiFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
    return data;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {isAr ? 'جارِ التحميل...' : 'Loading...'}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12 text-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100 flex items-center gap-2">
            <KeySquare className="w-6 h-6 text-[#D4AF37]" />
            {isAr ? 'الإيجار المنتهي بالتملك' : 'Lease-to-Own'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {isAr
              ? 'الطلب، الأهلية، العرض المالي، الموافقة، العقد، التسليم، جدول الدفعات، التحصيل، التسوية، ونقل الملكية -- دورة حياة كاملة موثّقة ومُدقّقة.'
              : 'Application, eligibility, financial offer, approval, agreement, handover, payment schedule, collections, settlement, and ownership transfer -- one fully audited lifecycle.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 transition-colors" title={isAr ? 'تحديث' : 'Refresh'}>
            <RefreshCcw className="w-3.5 h-3.5" />
          </button>
          {canCreate && (
            <button
              onClick={() => setNewModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              {isAr ? 'طلب جديد' : 'New Application'}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {(['applications', 'agreements'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${tab === t ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 border border-transparent hover:bg-zinc-900'}`}
          >
            {t === 'applications' ? (isAr ? 'الطلبات' : 'Applications') : (isAr ? 'الاتفاقيات النشطة' : 'Agreements')}
          </button>
        ))}
      </div>

      {tab === 'applications' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 space-y-2 max-h-[75vh] overflow-y-auto pr-1">
            {applications.length === 0 && (
              <p className="text-zinc-500 text-center py-8">{isAr ? 'لا توجد طلبات بعد.' : 'No applications yet.'}</p>
            )}
            {applications.map(app => (
              <button
                key={app.id}
                onClick={() => setSelectedAppId(app.id)}
                className={`w-full text-start p-3 rounded-xl border transition-all ${selectedAppId === app.id ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40' : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-zinc-300">{app.id}</span>
                  <Badge variant={APPLICATION_STATUS_VARIANT[app.status]} size="sm">{app.status.replace('_', ' ')}</Badge>
                </div>
                <p className="text-zinc-200 font-medium mt-1">{app.customerName}</p>
                <p className="text-zinc-500">{app.vehicleName} · {app.requestedTermMonths}mo · {money(app.vehiclePrice)}</p>
              </button>
            ))}
          </div>
          <div className="lg:col-span-8">
            {selectedApp ? (
              <ApplicationDetail
                application={selectedApp}
                isAr={isAr}
                canDecide={canDecide}
                busy={busy}
                setBusy={setBusy}
                callApi={callApi}
                showToast={showToast}
                errorText={errorText}
                onChanged={load}
              />
            ) : (
              <div className="flex items-center justify-center py-16 text-zinc-500">
                {isAr ? 'اختر طلبًا لعرض التفاصيل.' : 'Select an application to view details.'}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 space-y-2 max-h-[75vh] overflow-y-auto pr-1">
            {contracts.length === 0 && (
              <p className="text-zinc-500 text-center py-8">{isAr ? 'لا توجد اتفاقيات بعد.' : 'No agreements yet.'}</p>
            )}
            {contracts.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedContractId(c.id)}
                className={`w-full text-start p-3 rounded-xl border transition-all ${selectedContractId === c.id ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40' : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-zinc-300">{c.id}</span>
                  <Badge variant={LTO_STATUS_VARIANT[c.lto?.ltoStatus || ''] || 'zinc'} size="sm">{(c.lto?.ltoStatus || '').replace(/_/g, ' ')}</Badge>
                </div>
                <p className="text-zinc-200 font-medium mt-1">{c.customerName}</p>
                <p className="text-zinc-500">{c.vehicleName} · {money(c.lto?.outstandingAmount)} outstanding</p>
              </button>
            ))}
          </div>
          <div className="lg:col-span-8">
            {selectedContract ? (
              <AgreementDetail
                contract={selectedContract}
                isAr={isAr}
                canDecide={canDecide}
                canOperate={canOperate}
                busy={busy}
                setBusy={setBusy}
                callApi={callApi}
                showToast={showToast}
                errorText={errorText}
                onChanged={load}
              />
            ) : (
              <div className="flex items-center justify-center py-16 text-zinc-500">
                {isAr ? 'اختر اتفاقية لعرض التفاصيل.' : 'Select an agreement to view details.'}
              </div>
            )}
          </div>
        </div>
      )}

      {newModalOpen && (
        <NewApplicationModal
          isAr={isAr}
          customers={customers}
          vehicles={vehicles}
          onClose={() => setNewModalOpen(false)}
          onCreated={() => { setNewModalOpen(false); load(); setTab('applications'); }}
          callApi={callApi}
          showToast={showToast}
          errorText={errorText}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

function NewApplicationModal({ isAr, customers, vehicles, onClose, onCreated, callApi, showToast, errorText }: any) {
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [termMonths, setTermMonths] = useState(24);
  const [downPayment, setDownPayment] = useState(0);
  const [vehiclePrice, setVehiclePrice] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const customer = customers.find((c: any) => c.id === customerId);
  const vehicle = vehicles.find((v: any) => v.id === vehicleId);

  // Live installment preview -- purely informational (server-computed, per
  // this module's own rule that money is never calculated client-side); a
  // staff member typing vehicle price/down payment/term sees the resulting
  // monthly installment immediately instead of only much later at approval.
  useEffect(() => {
    if (!vehiclePrice || vehiclePrice <= 0 || !termMonths || termMonths <= 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const result = await callApi('/api/lto/offer-preview', 'POST', { vehiclePrice, downPayment, termMonths, hasFinalPayment: false });
        setPreview(result);
        setPreviewError(null);
      } catch (e) {
        setPreview(null);
        setPreviewError(errorText(e));
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [vehiclePrice, downPayment, termMonths, callApi, errorText]);

  const submit = async () => {
    if (!customer || !vehicle) return;
    setSubmitting(true);
    try {
      await callApi('/api/lto/applications', 'POST', {
        customerId, customerName: customer.fullName, vehicleId,
        vehicleName: `${vehicle.make} ${vehicle.model}`, requestedTermMonths: termMonths,
        requestedDownPayment: downPayment, vehiclePrice, notes
      });
      showToast(isAr ? 'تم إنشاء الطلب' : 'Application Created', isAr ? 'تم إنشاء طلب الإيجار المنتهي بالتملك كمسودة.' : 'Lease-to-Own application created as a draft.');
      onCreated();
    } catch (e) {
      showToast(isAr ? 'فشل الإنشاء' : 'Creation Failed', errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isAr ? 'طلب إيجار منتهٍ بالتملك جديد' : 'New Lease-to-Own Application'} maxWidth="lg"
      actions={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button
            onClick={submit}
            disabled={submitting || !customerId || !vehicleId || !vehiclePrice}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold disabled:opacity-40"
          >
            {submitting ? (isAr ? 'جارِ الحفظ...' : 'Saving...') : (isAr ? 'إنشاء' : 'Create')}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        <label className="block">
          <span className="text-zinc-400">{isAr ? 'العميل' : 'Customer'}</span>
          <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200">
            <option value="">{isAr ? '-- اختر --' : '-- Select --'}</option>
            {customers.map((c: any) => <option key={c.id} value={c.id}>{c.fullName} ({c.id})</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-zinc-400">{isAr ? 'المركبة' : 'Vehicle'}</span>
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200">
            <option value="">{isAr ? '-- اختر --' : '-- Select --'}</option>
            {vehicles.filter((v: any) => v.status === 'available').map((v: any) => <option key={v.id} value={v.id}>{v.make} {v.model} ({v.plateNumber})</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-zinc-400">{isAr ? 'سعر المركبة' : 'Vehicle Price'}</span>
            <input type="number" value={vehiclePrice || ''} onChange={e => setVehiclePrice(Number(e.target.value))} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
          </label>
          <label className="block">
            <span className="text-zinc-400">{isAr ? 'الدفعة المقدمة' : 'Down Payment'}</span>
            <input type="number" value={downPayment || ''} onChange={e => setDownPayment(Number(e.target.value))} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
          </label>
          <label className="block">
            <span className="text-zinc-400">{isAr ? 'المدة (أشهر)' : 'Term (months)'}</span>
            <input type="number" value={termMonths} onChange={e => setTermMonths(Number(e.target.value))} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
          </label>
        </div>

        {(previewLoading || preview || previewError) && (
          <div className={`p-3 rounded-lg border ${previewError ? 'border-amber-500/30 bg-amber-950/20 text-amber-300' : 'border-[#D4AF37]/30 bg-[#D4AF37]/5 text-zinc-200'}`}>
            {previewLoading ? (
              <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {isAr ? 'جارِ حساب القسط...' : 'Calculating installment...'}</span>
            ) : previewError ? (
              <span>{previewError}</span>
            ) : preview ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-zinc-500">{isAr ? 'القسط الشهري المتوقع' : 'Expected Monthly Installment'}</p>
                  <p className="text-sm font-bold text-[#f5d97f]">{money(preview.monthlyInstallment)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">{isAr ? 'إجمالي قيمة العقد' : 'Total Contract Value'}</p>
                  <p className="font-semibold">{money(preview.totalContractValue)}</p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <label className="block">
          <span className="text-zinc-400">{isAr ? 'ملاحظات' : 'Notes'}</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
        </label>
        <p className="text-[10px] text-zinc-600">
          {isAr
            ? 'هذا القسط تقديري وقابل للتغيير عند اعتماد الطلب رسمياً. القيمة النهائية تُحسب دائماً من الخادم، ولا يمكن إدخالها يدوياً.'
            : 'This installment is a preview and may change at formal approval. The final value is always server-computed, never manually entered.'}
        </p>
      </div>
    </Modal>
  );
}

function ApplicationDetail({ application, isAr, canDecide, busy, setBusy, callApi, showToast, errorText, onChanged }: any) {
  const [eligibility, setEligibility] = useState<any>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [decideModalOpen, setDecideModalOpen] = useState<'approved' | 'rejected' | null>(null);

  const checkEligibility = async () => {
    setCheckingEligibility(true);
    try {
      const result = await callApi('/api/lto/eligibility', 'POST', { customerId: application.customerId, vehicleId: application.vehicleId });
      setEligibility(result);
    } catch (e) {
      showToast(isAr ? 'فشل الفحص' : 'Check Failed', errorText(e));
    } finally {
      setCheckingEligibility(false);
    }
  };

  const submitApplication = async () => {
    setBusy(true);
    try {
      await callApi(`/api/lto/applications/${application.id}/submit`, 'POST');
      showToast(isAr ? 'تم الإرسال' : 'Submitted', isAr ? 'تم إرسال الطلب للمراجعة.' : 'Application submitted for review.');
      onChanged();
    } catch (e) {
      showToast(isAr ? 'فشل الإرسال' : 'Submission Failed', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">{application.id}</h3>
          <p className="text-zinc-400">{application.customerName} · {application.vehicleName}</p>
        </div>
        <Badge variant={APPLICATION_STATUS_VARIANT[application.status as LtoApplicationStatus]}>{application.status.replace('_', ' ')}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={isAr ? 'سعر المركبة' : 'Vehicle Price'} value={money(application.vehiclePrice)} />
        <Stat label={isAr ? 'الدفعة المقدمة المطلوبة' : 'Requested Down Payment'} value={money(application.requestedDownPayment)} />
        <Stat label={isAr ? 'المدة المطلوبة' : 'Requested Term'} value={`${application.requestedTermMonths} mo`} />
      </div>

      {application.notes && <p className="text-zinc-400 border-t border-zinc-800 pt-3">{application.notes}</p>}

      {application.status === 'draft' && (
        <div className="border-t border-zinc-800 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={checkEligibility} disabled={checkingEligibility} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
              <ShieldCheck className="w-3.5 h-3.5" />
              {checkingEligibility ? (isAr ? 'جارِ الفحص...' : 'Checking...') : (isAr ? 'فحص الأهلية' : 'Check Eligibility')}
            </button>
            <button onClick={submitApplication} disabled={busy} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold disabled:opacity-40">
              {isAr ? 'إرسال للمراجعة' : 'Submit for Review'}
            </button>
          </div>
          {eligibility && (
            <div className={`p-3 rounded-lg border ${eligibility.eligible ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300' : 'border-rose-500/30 bg-rose-950/20 text-rose-300'}`}>
              {eligibility.eligible ? (isAr ? 'العميل مؤهل.' : 'Customer is eligible.') : (
                <ul className="list-disc list-inside space-y-0.5">
                  {eligibility.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {(application.status === 'submitted' || application.status === 'under_review') && (
        <div className="border-t border-zinc-800 pt-4 space-y-2">
          {application.eligibilityCheck && !application.eligibilityCheck.eligible && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-950/20 text-rose-300">
              <ul className="list-disc list-inside space-y-0.5">
                {application.eligibilityCheck.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          {canDecide && (
            <div className="flex items-center gap-2">
              <button onClick={() => setDecideModalOpen('approved')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 transition-colors">
                <CheckCircle2 className="w-3.5 h-3.5" /> {isAr ? 'موافقة' : 'Approve'}
              </button>
              <button onClick={() => setDecideModalOpen('rejected')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 transition-colors">
                <XCircle className="w-3.5 h-3.5" /> {isAr ? 'رفض' : 'Reject'}
              </button>
            </div>
          )}
        </div>
      )}

      {application.status === 'approved' && application.contractId && (
        <div className="border-t border-zinc-800 pt-4 text-zinc-400">
          {isAr ? 'تم إنشاء العقد: ' : 'Agreement created: '}<span className="font-mono text-zinc-200">{application.contractId}</span>
          {isAr ? ' -- راجع تبويب "الاتفاقيات النشطة".' : ' -- see the Agreements tab.'}
        </div>
      )}

      {decideModalOpen && (
        <DecideApplicationModal
          decision={decideModalOpen}
          application={application}
          isAr={isAr}
          onClose={() => setDecideModalOpen(null)}
          onDecided={() => { setDecideModalOpen(null); onChanged(); }}
          callApi={callApi}
          showToast={showToast}
          errorText={errorText}
        />
      )}
    </div>
  );
}

function DecideApplicationModal({ decision, application, isAr, onClose, onDecided, callApi, showToast, errorText }: any) {
  const [note, setNote] = useState('');
  const [downPayment, setDownPayment] = useState(application.requestedDownPayment);
  const [termMonths, setTermMonths] = useState(application.requestedTermMonths);
  const [hasFinalPayment, setHasFinalPayment] = useState(false);
  const [finalPaymentAmount, setFinalPaymentAmount] = useState(0);
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const runPreview = useCallback(async () => {
    if (decision !== 'approved') return;
    setPreviewError(null);
    try {
      const result = await callApi('/api/lto/offer-preview', 'POST', {
        vehiclePrice: application.vehiclePrice, downPayment, termMonths, hasFinalPayment, finalPaymentAmount
      });
      setPreview(result);
    } catch (e) {
      setPreview(null);
      setPreviewError(errorText(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision, downPayment, termMonths, hasFinalPayment, finalPaymentAmount]);

  useEffect(() => { runPreview(); }, [runPreview]);

  const submit = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      await callApi(`/api/lto/applications/${application.id}/decide`, 'POST', {
        decision, note,
        offer: decision === 'approved' ? { downPayment, termMonths, hasFinalPayment, finalPaymentAmount } : undefined
      });
      showToast(
        decision === 'approved' ? (isAr ? 'تمت الموافقة' : 'Approved') : (isAr ? 'تم الرفض' : 'Rejected'),
        decision === 'approved' ? (isAr ? 'تم إنشاء اتفاقية الإيجار المنتهي بالتملك.' : 'The Lease-to-Own agreement has been created.') : (isAr ? 'تم رفض الطلب.' : 'The application was rejected.')
      );
      onDecided();
    } catch (e) {
      showToast(isAr ? 'فشل القرار' : 'Decision Failed', errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={decision === 'approved' ? (isAr ? 'الموافقة على الطلب' : 'Approve Application') : (isAr ? 'رفض الطلب' : 'Reject Application')} maxWidth="lg"
      actions={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button onClick={submit} disabled={submitting || !note.trim() || (decision === 'approved' && !preview)}
            className={`px-4 py-2 rounded-lg font-semibold disabled:opacity-40 ${decision === 'approved' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
            {submitting ? (isAr ? 'جارِ الحفظ...' : 'Saving...') : (isAr ? 'تأكيد' : 'Confirm')}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        {decision === 'approved' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-zinc-400">{isAr ? 'الدفعة المقدمة' : 'Down Payment'}</span>
                <input type="number" value={downPayment} onChange={e => setDownPayment(Number(e.target.value))} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
              </label>
              <label className="block">
                <span className="text-zinc-400">{isAr ? 'المدة (أشهر)' : 'Term (months)'}</span>
                <input type="number" value={termMonths} onChange={e => setTermMonths(Number(e.target.value))} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
              </label>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={hasFinalPayment} onChange={e => setHasFinalPayment(e.target.checked)} />
              <span className="text-zinc-300">{isAr ? 'يوجد دفعة نهائية (بالون)' : 'Has a final (balloon) payment'}</span>
            </label>
            {hasFinalPayment && (
              <label className="block">
                <span className="text-zinc-400">{isAr ? 'قيمة الدفعة النهائية' : 'Final Payment Amount'}</span>
                <input type="number" value={finalPaymentAmount} onChange={e => setFinalPaymentAmount(Number(e.target.value))} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
              </label>
            )}
            {previewError && (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-950/20 text-amber-300">{previewError}</div>
            )}
            {preview && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-950/60">
                <Stat label={isAr ? 'القسط الشهري' : 'Monthly Installment'} value={money(preview.monthlyInstallment)} />
                <Stat label={isAr ? 'إجمالي قيمة العقد' : 'Total Contract Value'} value={money(preview.totalContractValue)} />
                <Stat label={isAr ? 'رسوم المعالجة + الضريبة' : 'Processing Fee + VAT'} value={money(preview.processingFee + preview.vatAmount)} />
                <Stat label={isAr ? 'الدفعة النهائية' : 'Final Payment'} value={money(preview.finalPayment)} />
              </div>
            )}
          </>
        )}
        <label className="block">
          <span className="text-zinc-400">{isAr ? 'ملاحظة القرار (إلزامي)' : 'Decision Note (required)'}</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
        </label>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p className="text-zinc-100 font-semibold">{value}</p>
    </div>
  );
}

function AgreementDetail({ contract, isAr, canDecide, canOperate, busy, setBusy, callApi, showToast, errorText, onChanged }: any) {
  const [installments, setInstallments] = useState<LtoInstallment[]>([]);
  const [handoverInspectionId, setHandoverInspectionId] = useState<string | undefined>();
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [payModal, setPayModal] = useState<LtoInstallment | null>(null);
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [termModalOpen, setTermModalOpen] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const lto = contract.lto;

  const generateAndOpenContract = async () => {
    setGeneratingDoc(true);
    try {
      const doc = await callApi(`/api/lto/contracts/${contract.id}/generate-contract`, 'POST');
      const res = await apiFetch(doc.fileUrl);
      if (!res.ok) throw new Error(`Failed to load document (${res.status}).`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (e) {
      showToast(isAr ? 'فشل توليد العقد' : 'Contract Generation Failed', errorText(e));
    } finally {
      setGeneratingDoc(false);
    }
  };

  const loadView = useCallback(async () => {
    setLoadingSchedule(true);
    try {
      const view = await callApi(`/api/lto/contracts/${contract.id}`, 'GET');
      setInstallments(view.installments || []);
      setHandoverInspectionId(view.handoverInspectionId);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSchedule(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.id]);

  useEffect(() => { loadView(); }, [loadView]);

  const act = async (path: string, method: string, body?: unknown, successMsg?: string) => {
    setBusy(true);
    try {
      await callApi(path, method, body);
      if (successMsg) showToast(isAr ? 'تم' : 'Done', successMsg);
      await loadView();
      onChanged();
    } catch (e) {
      showToast(isAr ? 'فشلت العملية' : 'Action Failed', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">{contract.id}</h3>
          <p className="text-zinc-400">{contract.customerName} · {contract.vehicleName}</p>
        </div>
        <Badge variant={LTO_STATUS_VARIANT[lto?.ltoStatus] || 'zinc'}>{(lto?.ltoStatus || '').replace(/_/g, ' ')}</Badge>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat label={isAr ? 'إجمالي قيمة العقد' : 'Total Contract Value'} value={money(lto?.totalContractValue)} />
        <Stat label={isAr ? 'المسدد' : 'Paid'} value={money(lto?.paidAmount)} />
        <Stat label={isAr ? 'المتبقي' : 'Outstanding'} value={money(lto?.outstandingAmount)} />
        <Stat label={isAr ? 'القسط الشهري' : 'Monthly Installment'} value={money(lto?.monthlyInstallment)} />
      </div>

      {handoverInspectionId && (
        <p className="text-zinc-500 flex items-center gap-1.5"><Handshake className="w-3.5 h-3.5" /> {isAr ? 'فحص التسليم:' : 'Handover inspection:'} <span className="font-mono text-zinc-300">{handoverInspectionId}</span></p>
      )}

      {canOperate && (
        <div>
          <button
            onClick={generateAndOpenContract}
            disabled={generatingDoc}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <FileText className="w-3.5 h-3.5" />
            {generatingDoc ? (isAr ? 'جارِ التوليد...' : 'Generating...') : (isAr ? 'توليد عقد الإيجار المنتهي بالتملك' : 'Generate Lease-to-Own Contract')}
          </button>
        </div>
      )}

      <div className="border-t border-zinc-800 pt-4">
        <h4 className="text-zinc-300 font-semibold mb-2 flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> {isAr ? 'جدول الدفعات' : 'Payment Schedule'}</h4>
        {loadingSchedule ? (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[520px]">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="py-1.5 pr-3">#</th>
                  <th className="py-1.5 pr-3">{isAr ? 'الاستحقاق' : 'Due'}</th>
                  <th className="py-1.5 pr-3">{isAr ? 'المبلغ' : 'Amount'}</th>
                  <th className="py-1.5 pr-3">{isAr ? 'المتبقي' : 'Remaining'}</th>
                  <th className="py-1.5 pr-3">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {installments.map(i => (
                  <tr key={i.id} className="border-b border-zinc-900">
                    <td className="py-1.5 pr-3 text-zinc-400">{i.installmentNumber}{i.isFinalPayment ? ' (final)' : ''}</td>
                    <td className="py-1.5 pr-3 text-zinc-300">{fmtDate(i.dueDate)}</td>
                    <td className="py-1.5 pr-3 text-zinc-300">{money(i.amount)}</td>
                    <td className="py-1.5 pr-3 text-zinc-300">{money(i.remainingAmount)}</td>
                    <td className="py-1.5 pr-3"><Badge variant={INSTALLMENT_STATUS_VARIANT[i.status] || 'zinc'} size="sm">{i.status.replace('_', ' ')}</Badge></td>
                    <td className="py-1.5">
                      {canOperate && i.status !== 'paid' && i.status !== 'settled' && (
                        <button onClick={() => setPayModal(i)} className="text-[#f5d97f] hover:underline flex items-center gap-1"><Wallet className="w-3 h-3" /> {isAr ? 'تسجيل دفعة' : 'Record Payment'}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {lto?.ltoStatus === 'active' && (
        <div className="border-t border-zinc-800 pt-4 flex flex-wrap gap-2">
          {canOperate && (
            <button onClick={() => setSettleModalOpen(true)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
              {isAr ? 'طلب تسوية مبكرة' : 'Request Early Settlement'}
            </button>
          )}
          {canOperate && (
            <button onClick={() => setTermModalOpen(true)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
              {isAr ? 'طلب إنهاء' : 'Request Termination'}
            </button>
          )}
          {canDecide && (
            <button
              onClick={() => act(`/api/lto/contracts/${contract.id}/flag-default`, 'POST', undefined, isAr ? 'تم وضع علامة التعثر.' : 'Flagged as default.')}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-700/50 text-rose-300 hover:bg-rose-950/40 transition-colors"
            >
              <FileWarning className="w-3.5 h-3.5" /> {isAr ? 'وضع علامة تعثر' : 'Flag Default'}
            </button>
          )}
        </div>
      )}

      {lto?.ltoStatus === 'settled' && canOperate && (
        <div className="border-t border-zinc-800 pt-4">
          <button
            onClick={() => act(`/api/lto/contracts/${contract.id}/ownership-transfer`, 'POST', undefined, isAr ? 'تم بدء نقل الملكية.' : 'Ownership transfer started.')}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/40 text-purple-300 hover:bg-purple-600/30 transition-colors"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" /> {isAr ? 'بدء نقل الملكية' : 'Start Ownership Transfer'}
          </button>
        </div>
      )}

      {lto?.ltoStatus === 'ownership_transfer_pending' && canOperate && (
        <div className="border-t border-zinc-800 pt-4">
          <p className="text-zinc-500 mb-2">
            {isAr ? 'نقل ملكية RTA عملية خارجية يدوية -- لا يوجد تكامل تلقائي. أكد هنا بعد إتمامها فعليًا.' : 'The actual RTA ownership transfer is an external, manual process -- no automatic integration exists. Confirm here once it has genuinely happened.'}
          </p>
          <button
            onClick={() => act(`/api/lto/contracts/${contract.id}/ownership-transfer/confirm`, 'POST', {}, isAr ? 'تم تأكيد نقل الملكية.' : 'Ownership transfer confirmed.')}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold disabled:opacity-40"
          >
            {isAr ? 'تأكيد اكتمال نقل الملكية' : 'Confirm Ownership Transfer Complete'}
          </button>
        </div>
      )}

      {lto?.ltoStatus === 'ownership_transferred' && canOperate && (
        <div className="border-t border-zinc-800 pt-4">
          <button
            onClick={() => act(`/api/lto/contracts/${contract.id}/complete`, 'POST', undefined, isAr ? 'تم إكمال الاتفاقية.' : 'Agreement completed.')}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold disabled:opacity-40"
          >
            {isAr ? 'إكمال الاتفاقية' : 'Complete Agreement'}
          </button>
        </div>
      )}

      {lto?.ltoStatus === 'terminated' && canOperate && (
        <div className="border-t border-zinc-800 pt-4">
          <button
            onClick={() => act(`/api/lto/contracts/${contract.id}/vehicle-recovered`, 'POST', undefined, isAr ? 'تم تأكيد استرجاع المركبة.' : 'Vehicle recovery confirmed.')}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            {isAr ? 'تأكيد استرجاع المركبة' : 'Confirm Vehicle Recovered'}
          </button>
        </div>
      )}

      {payModal && (
        <RecordPaymentModal
          installment={payModal}
          isAr={isAr}
          onClose={() => setPayModal(null)}
          onPaid={() => { setPayModal(null); loadView(); onChanged(); }}
          callApi={callApi}
          showToast={showToast}
          errorText={errorText}
        />
      )}
      {settleModalOpen && (
        <RequestSettlementModal
          contract={contract}
          isAr={isAr}
          canDecide={canDecide}
          onClose={() => setSettleModalOpen(false)}
          onDone={() => { setSettleModalOpen(false); loadView(); onChanged(); }}
          callApi={callApi}
          showToast={showToast}
          errorText={errorText}
        />
      )}
      {termModalOpen && (
        <RequestTerminationModal
          contract={contract}
          isAr={isAr}
          canDecide={canDecide}
          onClose={() => setTermModalOpen(false)}
          onDone={() => { setTermModalOpen(false); loadView(); onChanged(); }}
          callApi={callApi}
          showToast={showToast}
          errorText={errorText}
        />
      )}
    </div>
  );
}

function RecordPaymentModal({ installment, isAr, onClose, onPaid, callApi, showToast, errorText }: any) {
  const [amount, setAmount] = useState(installment.remainingAmount);
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'card' | 'online_link' | 'corporate_credit'>('bank_transfer');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await callApi(`/api/lto/installments/${installment.id}/payments`, 'POST', { amount, method });
      showToast(isAr ? 'تم تسجيل الدفعة' : 'Payment Recorded', isAr ? 'تم تسجيل الدفعة بنجاح.' : 'The payment was recorded successfully.');
      onPaid();
    } catch (e) {
      showToast(isAr ? 'فشل التسجيل' : 'Recording Failed', errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isAr ? 'تسجيل دفعة' : 'Record Payment'}
      actions={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button onClick={submit} disabled={submitting || amount <= 0} className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold disabled:opacity-40">
            {submitting ? (isAr ? 'جارِ الحفظ...' : 'Saving...') : (isAr ? 'تسجيل' : 'Record')}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        <p className="text-zinc-400">{isAr ? `القسط رقم ${installment.installmentNumber} -- المتبقي: ${money(installment.remainingAmount)}` : `Installment #${installment.installmentNumber} -- remaining: ${money(installment.remainingAmount)}`}</p>
        <label className="block">
          <span className="text-zinc-400">{isAr ? 'المبلغ' : 'Amount'}</span>
          <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} max={installment.remainingAmount} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
        </label>
        <label className="block">
          <span className="text-zinc-400">{isAr ? 'طريقة الدفع' : 'Payment Method'}</span>
          <select value={method} onChange={e => setMethod(e.target.value as any)} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200">
            <option value="bank_transfer">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</option>
            <option value="cash">{isAr ? 'نقدًا' : 'Cash'}</option>
            <option value="card">{isAr ? 'بطاقة' : 'Card'}</option>
            <option value="online_link">{isAr ? 'رابط دفع' : 'Online Link'}</option>
            <option value="corporate_credit">{isAr ? 'ائتمان شركات' : 'Corporate Credit'}</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}

function RequestSettlementModal({ contract, isAr, canDecide, onClose, onDone, callApi, showToast, errorText }: any) {
  const [adjustments, setAdjustments] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [request, setRequest] = useState<LtoSettlementRequest | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitRequest = async () => {
    setSubmitting(true);
    try {
      const result = await callApi(`/api/lto/contracts/${contract.id}/early-settlement`, 'POST', { adjustments, adjustmentReason: adjustmentReason || undefined });
      setRequest(result);
      showToast(isAr ? 'تم إنشاء طلب التسوية' : 'Settlement Requested', isAr ? 'بانتظار قرار الموافقة.' : 'Awaiting approval decision.');
    } catch (e) {
      showToast(isAr ? 'فشل الطلب' : 'Request Failed', errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!request || !decisionNote.trim()) return;
    setSubmitting(true);
    try {
      await callApi(`/api/lto/settlements/${request.id}/decide`, 'POST', { decision, note: decisionNote });
      showToast(isAr ? 'تم' : 'Done', decision === 'approved' ? (isAr ? 'تمت التسوية بالكامل.' : 'Settlement completed.') : (isAr ? 'تم رفض التسوية.' : 'Settlement rejected.'));
      onDone();
    } catch (e) {
      showToast(isAr ? 'فشل القرار' : 'Decision Failed', errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isAr ? 'التسوية المبكرة' : 'Early Settlement'} maxWidth="lg"
      actions={!request ? (
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button onClick={submitRequest} disabled={submitting} className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold disabled:opacity-40">
            {isAr ? 'حساب وطلب' : 'Compute & Request'}
          </button>
        </>
      ) : canDecide ? (
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors">{isAr ? 'إغلاق' : 'Close'}</button>
          <button onClick={() => decide('rejected')} disabled={submitting || !decisionNote.trim()} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold disabled:opacity-40">{isAr ? 'رفض' : 'Reject'}</button>
          <button onClick={() => decide('approved')} disabled={submitting || !decisionNote.trim()} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-40">{isAr ? 'موافقة وتسوية' : 'Approve & Settle'}</button>
        </>
      ) : (
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors">{isAr ? 'إغلاق' : 'Close'}</button>
      )}
    >
      {!request ? (
        <div className="space-y-3 text-xs">
          <p className="text-zinc-500">
            {isAr ? 'وفق بند التسوية المبكرة في العقد المعتمد: لا توجد نسبة خصم أو غرامة -- المبلغ هو الرصيد المتبقي بالكامل بالإضافة إلى رسوم نقل الملكية.' : 'Per the approved contract\'s settlement clause: no percentage discount or penalty -- the amount is the full outstanding balance plus the ownership-transfer fee.'}
          </p>
          <label className="block">
            <span className="text-zinc-400">{isAr ? 'تعديلات (اختياري)' : 'Adjustments (optional)'}</span>
            <input type="number" value={adjustments} onChange={e => setAdjustments(Number(e.target.value))} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
          </label>
          {adjustments !== 0 && (
            <label className="block">
              <span className="text-zinc-400">{isAr ? 'سبب التعديل' : 'Adjustment Reason'}</span>
              <input value={adjustmentReason} onChange={e => setAdjustmentReason(e.target.value)} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
            </label>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-950/60">
            <Stat label={isAr ? 'الرصيد المتبقي' : 'Outstanding'} value={money(request.outstandingBalance)} />
            <Stat label={isAr ? 'رسوم النقل' : 'Transfer Fee'} value={money(request.ownershipTransferFee)} />
            <Stat label={isAr ? 'إجمالي التسوية' : 'Final Settlement'} value={money(request.finalSettlementAmount)} />
          </div>
          {canDecide && (
            <label className="block">
              <span className="text-zinc-400">{isAr ? 'ملاحظة القرار (إلزامي)' : 'Decision Note (required)'}</span>
              <textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)} rows={2} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}

function RequestTerminationModal({ contract, isAr, canDecide, onClose, onDone, callApi, showToast, errorText }: any) {
  const [reason, setReason] = useState('');
  const [requested, setRequested] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitRequest = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await callApi(`/api/lto/contracts/${contract.id}/termination`, 'POST', { reason });
      setRequested(true);
      showToast(isAr ? 'تم طلب الإنهاء' : 'Termination Requested', isAr ? 'بانتظار قرار الموافقة.' : 'Awaiting approval decision.');
    } catch (e) {
      showToast(isAr ? 'فشل الطلب' : 'Request Failed', errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!decisionNote.trim()) return;
    setSubmitting(true);
    try {
      await callApi(`/api/lto/contracts/${contract.id}/termination/decide`, 'POST', { decision, note: decisionNote });
      showToast(isAr ? 'تم' : 'Done', isAr ? 'تم تسجيل القرار. لن يتم تنفيذ أي إجراء استرداد تلقائي.' : 'Decision recorded. No automatic recovery action is taken.');
      onDone();
    } catch (e) {
      showToast(isAr ? 'فشل القرار' : 'Decision Failed', errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isAr ? 'طلب إنهاء' : 'Request Termination'}
      actions={!requested ? (
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button onClick={submitRequest} disabled={submitting || !reason.trim()} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold disabled:opacity-40">{isAr ? 'إرسال الطلب' : 'Submit Request'}</button>
        </>
      ) : canDecide ? (
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors">{isAr ? 'إغلاق' : 'Close'}</button>
          <button onClick={() => decide('rejected')} disabled={submitting || !decisionNote.trim()} className="px-4 py-2 rounded-lg bg-zinc-700 text-white font-semibold disabled:opacity-40">{isAr ? 'رفض' : 'Reject'}</button>
          <button onClick={() => decide('approved')} disabled={submitting || !decisionNote.trim()} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold disabled:opacity-40">{isAr ? 'موافقة على الإنهاء' : 'Approve Termination'}</button>
        </>
      ) : (
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors">{isAr ? 'إغلاق' : 'Close'}</button>
      )}
    >
      <div className="space-y-3 text-xs">
        <p className="text-zinc-500">
          {isAr ? 'لن يتم تنفيذ أي إجراء قانوني أو استرداد للمركبة تلقائيًا -- هذا يسجل فقط طلب/قرار الإنهاء.' : 'No automatic legal action or vehicle repossession is taken -- this only records the termination request/decision.'}
        </p>
        {!requested ? (
          <label className="block">
            <span className="text-zinc-400">{isAr ? 'سبب طلب الإنهاء' : 'Reason for termination request'}</span>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
          </label>
        ) : canDecide && (
          <label className="block">
            <span className="text-zinc-400">{isAr ? 'ملاحظة القرار (إلزامي)' : 'Decision Note (required)'}</span>
            <textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)} rows={2} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200" />
          </label>
        )}
      </div>
    </Modal>
  );
}
