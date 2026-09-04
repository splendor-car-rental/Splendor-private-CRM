import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Calculator, Check, CheckCircle2, ClipboardList, Loader2, RefreshCw, Scale, TrendingDown, TrendingUp, X } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { formatDateTime } from '../../lib/dateFormat';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useCRM } from '../../context/CRMContext';
import type { TaxPeriod } from '../../accounting/types';

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `فشل الطلب (${response.status})`);
  return body as T;
}

const money = (value: number | undefined) => `${(Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} د.إ`;

interface ProcurementApproval {
  id: string;
  entityType: string;
  entityId: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * Tax & Filing (الضرائب والإقرارات): a UI over the existing, tested
 * src/server/taxPeriods.ts review workflow, which had no frontend before
 * this. By deliberate design (Splendor OS 3.0 execution blueprint, Rule 15)
 * this system tracks draft -> under_review -> reviewed ONLY -- there is no
 * "filed" status and no filing action here. Reviewing a period is the
 * internal sign-off record; actually filing the return with the UAE FTA
 * stays a human, out-of-band act on the FTA's own portal.
 */
export const TaxFilingView: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const { showToast } = useCRM();
  const isAr = language === 'ar';

  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<TaxPeriod[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<(TaxPeriod & { stale: boolean }) | null>(null);
  const [approvals, setApprovals] = useState<ProcurementApproval[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');

  const currentPeriodKey = new Date().toISOString().slice(0, 7);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [periodList, current, approvalsRes] = await Promise.all([
        getJson<TaxPeriod[]>('/api/tax/periods'),
        getJson<TaxPeriod & { stale: boolean }>(`/api/tax/periods/${encodeURIComponent(currentPeriodKey)}`),
        apiFetch('/api/procurement/approvals')
      ]);
      setPeriods(periodList);
      setCurrentPeriod(current);
      if (approvalsRes.ok) {
        const all: ProcurementApproval[] = await approvalsRes.json();
        setApprovals(all.filter(a => a.entityType === 'TaxPeriod'));
      }
    } catch (error: any) {
      showToast(isAr ? 'تعذر تحميل بيانات الضرائب' : 'Failed to load tax data', error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentPeriodKey, isAr, showToast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const prepare = async (periodKey: string) => {
    setBusyKey(`prepare-${periodKey}`);
    try {
      await getJson(`/api/tax/periods/${encodeURIComponent(periodKey)}/prepare`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      showToast(isAr ? 'تم تجهيز الفترة' : 'Period prepared', periodKey, 'success');
      await refresh();
    } catch (error: any) {
      showToast(isAr ? 'تعذر التجهيز' : 'Prepare failed', error.message, 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const requestReview = async (periodKey: string) => {
    if (!reviewReason.trim()) {
      showToast(isAr ? 'السبب مطلوب' : 'Reason required', isAr ? 'اكتب سبب طلب المراجعة أولًا.' : 'Enter a reason for the review request first.', 'error');
      return;
    }
    setBusyKey(`review-${periodKey}`);
    try {
      await getJson(`/api/tax/periods/${encodeURIComponent(periodKey)}/request-review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reviewReason.trim() })
      });
      setReviewReason('');
      showToast(isAr ? 'تم إرسال طلب المراجعة' : 'Review requested', periodKey, 'success');
      await refresh();
    } catch (error: any) {
      showToast(isAr ? 'تعذر إرسال الطلب' : 'Request failed', error.message, 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const decideApproval = async (approval: ProcurementApproval, decision: 'approved' | 'rejected') => {
    const note = window.prompt(isAr ? 'ملاحظة القرار مطلوبة:' : 'A decision note is required:');
    if (!note || !note.trim()) return;
    setBusyKey(approval.id);
    try {
      const res = await apiFetch(`/api/procurement/approvals/${encodeURIComponent(approval.id)}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note: note.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to decide this request.');
      showToast(decision === 'approved' ? (isAr ? 'تمت الموافقة' : 'Approved') : (isAr ? 'تم الرفض' : 'Rejected'), approval.entityId);
      await refresh();
    } catch (error: any) {
      showToast(isAr ? 'فشل القرار' : 'Decision failed', error.message, 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const isDecider = currentUser.role === 'ceo' || currentUser.role === 'admin';
  const pendingApprovals = approvals.filter(a => a.status === 'pending');

  const statusLabel = (p: { status: string; stale?: boolean }) => {
    if (p.stale) return isAr ? 'قديمة -- تحتاج إعادة تجهيز' : 'Stale -- needs re-preparing';
    if (p.status === 'reviewed') return isAr ? 'تمت المراجعة' : 'Reviewed';
    if (p.status === 'under_review') return isAr ? 'قيد المراجعة' : 'Under review';
    return isAr ? 'مسودة' : 'Draft';
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12" dir={isAr ? 'rtl' : 'ltr'}>
      <div>
        <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold mb-1"><Calculator className="w-4 h-4" /><span>{isAr ? 'الضرائب والإقرارات' : 'Tax & Filing'}</span></div>
        <h2 className="text-2xl lg:text-3xl font-display font-bold text-zinc-100">{isAr ? 'مراجعة ضريبة القيمة المضافة قبل التقديم' : 'VAT Review Before Filing'}</h2>
        <p className="text-xs text-zinc-400 mt-1 max-w-3xl">
          {isAr
            ? 'الأرقام هنا مأخوذة مباشرة من القيود المحاسبية المرحلة فعليًا -- وليست تقديرًا. هذه الشاشة سجل مراجعة واعتماد داخلي فقط؛ تقديم الإقرار الفعلي يتم يدويًا عبر بوابة الهيئة الاتحادية للضرائب (FTA) ولا يقوم هذا السيستم بتقديمه نيابةً عنكم عمدًا.'
            : "These numbers come directly from posted accounting journals -- never an estimate. This screen is an internal review-and-sign-off record only; actually filing the return happens manually on the FTA's own portal -- this system deliberately never files it for you."}
        </p>
      </div>

      <div className="p-5 rounded-3xl bg-blue-500/10 border border-blue-500/30">
        <h3 className="font-bold text-zinc-100 flex items-center gap-2 mb-3"><ClipboardList className="w-4 h-4 text-blue-300" />{isAr ? 'تعليمات العمل طوال الفترة الضريبية' : 'Standing instructions for the whole tax period'}</h3>
        <ol className="space-y-2 text-xs text-zinc-300 list-decimal list-inside">
          <li>{isAr ? 'أول كل فترة: تأكد أن كل فاتورة عميل ودفعة وتأمين ومصروف يُرحّل محاسبيًا فور حدوثه، ولا يُترك متراكمًا لآخر الفترة.' : 'At the start of each period: post every customer invoice, payment, deposit and expense as it happens -- do not let postings pile up until period-end.'}</li>
          <li>{isAr ? 'راجع تبويب «سلامة الترحيل» في شاشة المالية بانتظام -- طلب المراجعة هنا يُرفض تلقائيًا طالما توجد فجوة ترحيل واحدة داخل الفترة.' : "Review Finance's Integrity tab regularly -- a review request here is automatically blocked while even one posting gap remains inside the period."}</li>
          <li>{isAr ? 'بعد نهاية الفترة، اضغط «تجهيز الفترة» أدناه لحساب أرقام الضريبة الحية، ثم أرسل «طلب مراجعة» مع سبب واضح.' : "After period-end, click Prepare Period below to compute live VAT figures, then submit a Request Review with a clear reason."}</li>
          <li>{isAr ? 'يجب أن يعتمد الطلب شخص آخر مخوّل (رئيس تنفيذي أو إدارة) غير من قام بالتجهيز أو الطلب -- نفس مبدأ الفصل بين المهام المطبّق في كل السيستم.' : 'A different authorized person (CEO or admin) than whoever prepared or requested it must approve -- the same segregation-of-duties principle used everywhere else in the system.'}</li>
          <li>{isAr ? 'أي عملية محاسبية جديدة تُرحّل بعد اعتماد المراجعة تجعل الفترة «قديمة» تلقائيًا وتعيدها إلى مسودة -- كرر التجهيز والمراجعة.' : "Any accounting posting made after the review is approved automatically marks the period stale and resets it to draft -- repeat prepare and review."}</li>
          <li>{isAr ? 'بعد اعتماد المراجعة: قدّم الإقرار فعليًا وبنفسك عبر بوابة الهيئة الاتحادية للضرائب (FTA) بالاستناد إلى هذه الأرقام المعتمدة -- هذا السيستم لا يحتفظ بحالة «مُقدَّم» عمدًا، فالتقديم فعل بشري خارج السيستم.' : "Once reviewed: file the return yourself on the FTA's own portal using these approved figures -- this system deliberately keeps no 'filed' status, since filing is a human act outside it."}</li>
        </ol>
      </div>

      {loading ? <div className="min-h-[200px] flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-400" /></div> : <>
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-zinc-100">{isAr ? `الفترة الحالية (${currentPeriodKey})` : `Current period (${currentPeriodKey})`}</h3>
            <button onClick={() => void refresh()} className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300" title={isAr ? 'تحديث' : 'Refresh'}><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Kpi title={isAr ? 'ضريبة المخرجات' : 'Output VAT'} value={money(currentPeriod?.outputVat)} icon={<TrendingUp className="w-4 h-4" />} />
            <Kpi title={isAr ? 'ضريبة المدخلات' : 'Input VAT'} value={money(currentPeriod?.inputVat)} icon={<TrendingDown className="w-4 h-4" />} />
            <Kpi title={isAr ? 'صافي الضريبة المستحقة' : 'Net VAT payable'} value={money(currentPeriod?.vatPayable)} icon={<Scale className="w-4 h-4" />} />
          </div>
          {currentPeriod && (
            <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={`text-xs font-bold flex items-center gap-1.5 ${currentPeriod.stale ? 'text-amber-400' : currentPeriod.status === 'reviewed' ? 'text-emerald-400' : 'text-zinc-300'}`}>
                  {currentPeriod.stale || currentPeriod.status !== 'reviewed' ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {statusLabel(currentPeriod)}
                </span>
                <span className="text-[11px] text-zinc-500">{isAr ? `فجوات ترحيل: ${currentPeriod.postingGapCount}` : `Posting gaps: ${currentPeriod.postingGapCount}`}</span>
              </div>
              {currentPeriod.staleNote && <p className="text-[11px] text-amber-400">{currentPeriod.staleNote}</p>}
              {currentPeriod.status === 'reviewed' && !currentPeriod.stale && (
                <p className="text-[11px] text-emerald-300">{isAr ? `اعتمدها ${currentPeriod.reviewedByName} في ${currentPeriod.reviewedAt ? formatDateTime(currentPeriod.reviewedAt) : '—'}` : `Reviewed by ${currentPeriod.reviewedByName} on ${currentPeriod.reviewedAt ? formatDateTime(currentPeriod.reviewedAt) : '—'}`}</p>
              )}
              {(currentPeriod.status === 'draft' || currentPeriod.stale) && (
                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-zinc-800">
                  <button onClick={() => prepare(currentPeriodKey)} disabled={busyKey === `prepare-${currentPeriodKey}`} className="px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center justify-center gap-2">{busyKey === `prepare-${currentPeriodKey}` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{isAr ? 'تجهيز الفترة' : 'Prepare Period'}</button>
                  <input value={reviewReason} onChange={e => setReviewReason(e.target.value)} placeholder={isAr ? 'سبب طلب المراجعة...' : 'Reason for review request...'} className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs" />
                  <button onClick={() => requestReview(currentPeriodKey)} disabled={busyKey === `review-${currentPeriodKey}` || currentPeriod.postingGapCount > 0} title={currentPeriod.postingGapCount > 0 ? (isAr ? 'أغلق كل فجوات الترحيل أولًا' : 'Resolve all posting gaps first') : undefined} className="px-4 py-2 rounded-xl bg-blue-500 text-zinc-950 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">{busyKey === `review-${currentPeriodKey}` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{isAr ? 'طلب مراجعة' : 'Request Review'}</button>
                </div>
              )}
              {currentPeriod.status === 'under_review' && <p className="text-[11px] text-amber-400 pt-2 border-t border-zinc-800">{isAr ? 'بانتظار اعتماد شخص آخر مخوّل أدناه.' : 'Awaiting approval from a different authorized person below.'}</p>}
            </div>
          )}
        </div>

        {pendingApprovals.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-zinc-100 mb-2">{isAr ? `طلبات مراجعة معلّقة (${pendingApprovals.length})` : `Pending review requests (${pendingApprovals.length})`}</h3>
            <div className="space-y-2">
              {pendingApprovals.map(a => (
                <div key={a.id} className="p-3 rounded-xl bg-zinc-900/60 border border-amber-500/30 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-100 text-xs font-mono">{a.entityId}</p>
                    <p className="text-zinc-400 mt-0.5 text-xs">{a.requestedByName} ({a.requestedByRole}) · {a.reason}</p>
                  </div>
                  {isDecider && a.requestedBy !== currentUser.id && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button disabled={busyKey === a.id} onClick={() => decideApproval(a, 'approved')} className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50" title={isAr ? 'موافقة' : 'Approve'}><Check className="w-3.5 h-3.5" /></button>
                      <button disabled={busyKey === a.id} onClick={() => decideApproval(a, 'rejected')} className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 disabled:opacity-50" title={isAr ? 'رفض' : 'Reject'}><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  {isDecider && a.requestedBy === currentUser.id && <span className="text-[10px] text-zinc-500 shrink-0">{isAr ? 'بانتظار شخص آخر' : 'Awaiting a different approver'}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-bold text-zinc-100 mb-2">{isAr ? 'سجل الفترات المُجهّزة' : 'Prepared periods history'}</h3>
          <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[760px]">
                <thead><tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="p-3 text-start font-medium">{isAr ? 'الفترة' : 'Period'}</th>
                  <th className="p-3 text-start font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="p-3 text-start font-medium">{isAr ? 'ضريبة المخرجات' : 'Output VAT'}</th>
                  <th className="p-3 text-start font-medium">{isAr ? 'ضريبة المدخلات' : 'Input VAT'}</th>
                  <th className="p-3 text-start font-medium">{isAr ? 'صافي المستحق' : 'Net payable'}</th>
                  <th className="p-3 text-start font-medium">{isAr ? 'اعتُمدت بواسطة' : 'Reviewed by'}</th>
                </tr></thead>
                <tbody>
                  {periods.map(p => (
                    <tr key={p.id} className="border-b border-zinc-800/50 text-zinc-300">
                      <td className="p-3 font-mono">{p.periodKey}</td>
                      <td className="p-3">{statusLabel(p)}</td>
                      <td className="p-3 font-mono">{money(p.outputVat)}</td>
                      <td className="p-3 font-mono">{money(p.inputVat)}</td>
                      <td className="p-3 font-mono font-bold">{money(p.vatPayable)}</td>
                      <td className="p-3">{p.reviewedByName || '—'}</td>
                    </tr>
                  ))}
                  {periods.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-zinc-500">{isAr ? 'لم تُجهَّز أي فترة بعد.' : 'No period has been prepared yet.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </>}
    </div>
  );
};

const Kpi: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 min-w-0">
    <div className="flex items-center justify-between gap-2"><p className="text-[10px] text-zinc-500 font-semibold">{title}</p><span className="text-blue-400">{icon}</span></div>
    <p className="text-lg font-bold text-zinc-100 mt-2 truncate">{value}</p>
  </div>
);
