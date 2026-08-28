import React, { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, ShieldCheck, History, Check, X, RotateCcw, Loader2, Radar, Activity, Mail } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import type { BusinessRule, ApprovalRequest } from '../../types';

interface AnomalyFlag {
  id: string;
  type: string;
  summary: string;
  summaryAr: string;
  detectedAt: string;
  supportingAuditLogIds: string[];
}

interface HealthCheckResult {
  checkedAt: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, { status: string; [key: string]: unknown }>;
}

interface FailedJob {
  id: string;
  jobType: string;
  status: 'failed' | 'alerted' | 'resolved';
  error: string;
  attempts: number;
  createdAt: string;
  payload: { recipientLabel?: string; eventKey?: string };
}

const TIER_LABEL: Record<string, { en: string; ar: string }> = {
  system_configuration: { en: 'System configuration (read-only)', ar: 'إعدادات النظام (للعرض فقط)' },
  business_rule: { en: 'Business rules', ar: 'قواعد العمل' },
  sensitive_rule: { en: 'Sensitive rules (require approval)', ar: 'القواعد الحساسة (تتطلب موافقة)' },
  emergency_rule: { en: 'Emergency kill switches', ar: 'مفاتيح إيقاف الطوارئ' }
};

const TIER_ORDER = ['emergency_rule', 'sensitive_rule', 'business_rule', 'system_configuration'];

/**
 * Settings > Governance & Approvals: the operator-facing surface for the
 * Phase 23 Governance & Approval Engine (see src/server/businessRules.ts /
 * approvals.ts). Lets an authorized user tune a business rule (with a
 * mandatory reason), flip an emergency kill switch, and decide a pending
 * Four-Eyes approval request -- without this, the backend engine would be
 * fully built but have no way for the business to actually use it.
 */
export const GovernanceView: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const { showToast } = useCRM();
  const isDecider = currentUser.role === 'ceo' || currentUser.role === 'admin';

  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyFlag[]>([]);
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, requestsRes, anomaliesRes, healthRes, dlqRes] = await Promise.all([
        apiFetch('/api/business-rules'),
        apiFetch('/api/approval-requests'),
        isDecider ? apiFetch('/api/anomalies') : Promise.resolve(null),
        isDecider ? apiFetch('/api/health/detailed') : Promise.resolve(null),
        apiFetch('/api/dead-letter-queue')
      ]);
      if (rulesRes.ok) setRules(await rulesRes.json());
      if (requestsRes.ok) setRequests(await requestsRes.json());
      if (anomaliesRes && anomaliesRes.ok) setAnomalies(await anomaliesRes.json());
      if (healthRes && healthRes.ok) setHealth(await healthRes.json());
      if (dlqRes.ok) setFailedJobs(await dlqRes.json());
    } catch (e) {
      console.error('Failed to load governance data:', e);
    } finally {
      setLoading(false);
    }
  }, [isDecider]);

  useEffect(() => { load(); }, [load]);

  const changeRule = async (rule: BusinessRule, nextValue: number | boolean | string) => {
    const reason = window.prompt(
      language === 'ar'
        ? `سبب التغيير مطلوب لـ "${rule.label}":`
        : `A reason is required to change "${rule.label}":`
    );
    if (!reason || !reason.trim()) return;

    setBusyKey(rule.id);
    try {
      const res = await apiFetch(`/api/business-rules/${encodeURIComponent(rule.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: nextValue, reason: reason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to change rule.');
      if (data.status === 'pending_approval') {
        showToast(
          language === 'ar' ? 'بانتظار الموافقة' : 'Pending approval',
          language === 'ar' ? 'تم إرسال الطلب لموافقة شخص آخر مخوّل.' : 'This change requires a second authorized person to approve it.'
        );
      } else {
        showToast(language === 'ar' ? 'تم التحديث' : 'Updated', rule.label);
      }
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل التحديث' : 'Update failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  const decide = async (request: ApprovalRequest, decision: 'approved' | 'rejected') => {
    const note = window.prompt(
      language === 'ar' ? 'ملاحظة القرار مطلوبة:' : 'A decision note is required:'
    );
    if (!note || !note.trim()) return;

    setBusyKey(request.id);
    try {
      const res = await apiFetch(`/api/approval-requests/${encodeURIComponent(request.id)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to decide this request.');
      showToast(
        decision === 'approved' ? (language === 'ar' ? 'تمت الموافقة' : 'Approved') : (language === 'ar' ? 'تم الرفض' : 'Rejected'),
        request.entityId
      );
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل القرار' : 'Decision failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  const retryJob = async (job: FailedJob) => {
    setBusyKey(job.id);
    try {
      const res = await apiFetch(`/api/dead-letter-queue/${encodeURIComponent(job.id)}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Retry failed.');
      showToast(
        data.status === 'resolved' ? (language === 'ar' ? 'نجحت إعادة المحاولة' : 'Retry succeeded') : (language === 'ar' ? 'فشلت إعادة المحاولة مجدداً' : 'Retry failed again'),
        job.payload.recipientLabel || job.id
      );
      await load();
    } catch (e: any) {
      showToast(language === 'ar' ? 'فشل' : 'Failed', e?.message || '');
    } finally {
      setBusyKey(null);
    }
  };

  const resolveJob = async (job: FailedJob) => {
    const note = window.prompt(language === 'ar' ? 'ملاحظة الحل مطلوبة:' : 'A resolution note is required:');
    if (!note || !note.trim()) return;
    setBusyKey(job.id);
    try {
      const res = await apiFetch(`/api/dead-letter-queue/${encodeURIComponent(job.id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to resolve.');
      showToast(language === 'ar' ? 'تم الحل' : 'Resolved', job.payload.recipientLabel || job.id);
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

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const decidedRequests = requests.filter(r => r.status !== 'pending').slice(0, 20);
  const byTier = TIER_ORDER.map(tier => ({ tier, items: rules.filter(r => r.tier === tier) })).filter(g => g.items.length > 0);

  const openJobs = failedJobs.filter(j => j.status !== 'resolved');

  return (
    <div className="space-y-8 text-xs">
      {/* Operational Health (Phase 23.7) */}
      {isDecider && health && (
        <div>
          <h3 className="text-sm font-bold text-zinc-100 mb-2 flex items-center gap-2">
            <Activity className={`w-4 h-4 ${health.overallStatus === 'healthy' ? 'text-emerald-400' : health.overallStatus === 'degraded' ? 'text-amber-400' : 'text-rose-400'}`} />
            {language === 'ar' ? 'الصحة التشغيلية' : 'Operational health'}
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
              health.overallStatus === 'healthy' ? 'bg-emerald-500/15 text-emerald-400' : health.overallStatus === 'degraded' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'
            }`}>{health.overallStatus}</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {Object.entries(health.checks).map(([key, check]) => (
              <div key={key} className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                <p className="text-zinc-500 uppercase tracking-wide text-[10px]">{key}</p>
                <p className="text-zinc-200 font-mono mt-0.5">{String(check.status)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dead-Letter Queue (Phase 23.7) -- failed WhatsApp sends needing review/retry */}
      <div>
        <h3 className="text-sm font-bold text-zinc-100 mb-2 flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#D4AF37]" />
          {language === 'ar' ? `عمليات إرسال فاشلة (${openJobs.length})` : `Failed sends needing review (${openJobs.length})`}
        </h3>
        {openJobs.length === 0 ? (
          <p className="text-zinc-500">{language === 'ar' ? 'لا توجد عمليات معلّقة.' : 'Nothing pending.'}</p>
        ) : (
          <div className="space-y-1.5">
            {openJobs.map(job => (
              <div key={job.id} className="p-2.5 rounded-lg bg-zinc-900/60 border border-rose-500/20 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-zinc-200 truncate">{job.payload.recipientLabel || job.payload.eventKey || job.id} — {job.error}</p>
                  <p className="text-zinc-500 mt-0.5">{language === 'ar' ? 'المحاولات' : 'attempts'}: {job.attempts} · {job.status}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    disabled={busyKey === job.id}
                    onClick={() => retryJob(job)}
                    className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    title={language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={busyKey === job.id}
                    onClick={() => resolveJob(job)}
                    className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                    title={language === 'ar' ? 'وضع علامة كمحلول' : 'Mark resolved'}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Anomaly Detection (Phase 23.6) -- review-only, never blocks anything */}
      {isDecider && (
        <div>
          <h3 className="text-sm font-bold text-zinc-100 mb-2 flex items-center gap-2">
            <Radar className="w-4 h-4 text-[#D4AF37]" />
            {language === 'ar' ? `تنبيهات نمط غير معتاد (${anomalies.length})` : `Unusual pattern flags (${anomalies.length})`}
          </h3>
          {anomalies.length === 0 ? (
            <p className="text-zinc-500">{language === 'ar' ? 'لا توجد أنماط غير معتادة حالياً.' : 'No unusual patterns detected right now.'}</p>
          ) : (
            <div className="space-y-1.5">
              {anomalies.map(a => (
                <div key={a.id} className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/25 text-zinc-300">
                  {language === 'ar' ? a.summaryAr : a.summary}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending approvals */}
      <div>
        <h3 className="text-sm font-bold text-zinc-100 mb-2 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#D4AF37]" />
          {language === 'ar' ? `طلبات الموافقة المعلّقة (${pendingRequests.length})` : `Pending approval requests (${pendingRequests.length})`}
        </h3>
        {pendingRequests.length === 0 ? (
          <p className="text-zinc-500">{language === 'ar' ? 'لا توجد طلبات معلّقة.' : 'No pending requests.'}</p>
        ) : (
          <div className="space-y-2">
            {pendingRequests.map(r => (
              <div key={r.id} className="p-3 rounded-xl bg-zinc-900/60 border border-amber-500/30 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-100">
                    {r.entityId} — {r.beforeValue === null ? (language === 'ar' ? 'غير محدد' : 'not set') : String(r.beforeValue)}
                    {' → '}
                    {r.afterValue === null ? (language === 'ar' ? 'غير محدد' : 'not set') : String(r.afterValue)}
                  </p>
                  <p className="text-zinc-400 mt-0.5">{r.requestedByName} ({r.requestedByRole}) · {r.reason}</p>
                </div>
                {isDecider && r.requestedBy !== currentUser.id && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      disabled={busyKey === r.id}
                      onClick={() => decide(r, 'approved')}
                      className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                      title={language === 'ar' ? 'موافقة' : 'Approve'}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={busyKey === r.id}
                      onClick={() => decide(r, 'rejected')}
                      className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 transition-colors disabled:opacity-50"
                      title={language === 'ar' ? 'رفض' : 'Reject'}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {isDecider && r.requestedBy === currentUser.id && (
                  <span className="text-[10px] text-zinc-500 shrink-0">
                    {language === 'ar' ? 'بانتظار شخص آخر' : 'Awaiting a different approver'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rules by tier */}
      {byTier.map(({ tier, items }) => (
        <div key={tier}>
          <h3 className="text-sm font-bold text-zinc-100 mb-2 flex items-center gap-2">
            {tier === 'emergency_rule' ? <ShieldAlert className="w-4 h-4 text-rose-400" /> : <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />}
            {language === 'ar' ? TIER_LABEL[tier].ar : TIER_LABEL[tier].en}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {items.map(rule => (
              <div key={rule.id} className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-zinc-100">{language === 'ar' && rule.labelAr ? rule.labelAr : rule.label}</p>
                  <span className="text-[10px] text-zinc-500 font-mono">v{rule.version}</span>
                </div>
                <p className="text-zinc-500 mt-1 leading-relaxed">{rule.description}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className={`font-mono font-bold ${rule.tier === 'emergency_rule' && rule.value === true ? 'text-rose-400' : rule.value === null ? 'text-zinc-600 italic' : 'text-[#f5d97f]'}`}>
                    {rule.value === null ? (language === 'ar' ? 'غير محدد' : 'not set') : String(rule.value)}
                  </span>
                  {rule.editable && rule.valueType === 'boolean' && (
                    <button
                      disabled={busyKey === rule.id}
                      onClick={() => changeRule(rule, !rule.value)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-50 ${
                        rule.value ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {rule.value
                        ? (language === 'ar' ? 'إعادة التفعيل' : 'Restore')
                        : (language === 'ar' ? 'إيقاف طارئ' : 'Suspend')}
                    </button>
                  )}
                  {rule.editable && rule.valueType === 'number' && (
                    <button
                      disabled={busyKey === rule.id}
                      onClick={() => {
                        const next = window.prompt(language === 'ar' ? 'القيمة الجديدة:' : 'New value:', rule.value === null ? '' : String(rule.value));
                        if (next === null || next.trim() === '') return;
                        const parsed = Number(next);
                        if (Number.isNaN(parsed)) return;
                        changeRule(rule, parsed);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    >
                      {language === 'ar' ? 'تعديل' : 'Edit'}
                    </button>
                  )}
                  {!rule.editable && (
                    <span className="text-[10px] text-zinc-600">{language === 'ar' ? 'غير قابل للتعديل' : 'Not editable'}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {decidedRequests.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-zinc-100 mb-2 flex items-center gap-2">
            <History className="w-4 h-4 text-zinc-500" />
            {language === 'ar' ? 'قرارات سابقة' : 'Recent decisions'}
          </h3>
          <div className="space-y-1.5">
            {decidedRequests.map(r => (
              <div key={r.id} className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between gap-2">
                <span className="text-zinc-400 truncate">{r.entityId}: {String(r.beforeValue)} → {String(r.afterValue)} — {r.decisionNote}</span>
                <span className={`text-[10px] font-bold shrink-0 ${r.status === 'approved' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {r.status === 'approved' ? (language === 'ar' ? 'موافَق عليه' : 'APPROVED') : (language === 'ar' ? 'مرفوض' : 'REJECTED')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
