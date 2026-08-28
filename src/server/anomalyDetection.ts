import { getRuleValue } from './businessRules';
import type { AuditLog } from '../types';

// ----------------------------------------------------
// ANOMALY DETECTION (Phase 23.6)
// ----------------------------------------------------
// The Business Rules Engine (23.1) and Kill Switch (23.4) answer "is this
// ONE operation allowed?". This module answers a different question: "is
// the PATTERN of operations itself unusual?" -- a single 10% discount is
// unremarkable; the same staff member applying five of them in an hour is
// worth a human glance, even though every individual one was within policy.
//
// This is DETECTION, never ENFORCEMENT: it produces review flags for
// CEO/Admin (GET /api/anomalies), and never blocks, cancels, or modifies a
// single record. A false positive costs a wasted look at a report; it
// never costs a customer a broken transaction. Sensitivity thresholds are
// governed business_rule-tier entries (see src/config/businessRules.ts,
// the `anomaly*` keys) explicitly documented as detection tuning, not
// business policy -- there is nothing pre-existing to migrate them from.

/** Audit actions that represent money moving, a permission/rule changing, or two records being merged into one -- the set this module treats as "sensitive" for frequency/off-hours checks. */
const SENSITIVE_ACTIONS: ReadonlySet<AuditLog['action']> = new Set([
  'refund', 'merge', 'rule_change', 'kill_switch', 'approval_decision',
  // Splendor Procurement, Phase 1: every request->review->approval decision
  // across POs, payments, balances, debts, custody/expenses, and invoices
  // records action:'approval' -- covered here so this same, already-proven
  // detection engine (never enforcement, just a review flag) picks up an
  // unusual PATTERN of procurement approvals exactly like it already does
  // for refunds/merges/rule changes, instead of a second parallel system.
  'approval'
]);
const SENSITIVE_ENTITY_TYPES: ReadonlySet<string> = new Set([
  'Charge', 'Deposit', 'BankImportBatch',
  'PurchaseOrder', 'Supplier', 'SupplierQuote', 'SupplierPaymentRequest', 'AdvanceSettlement',
  'PartyOpeningBalance', 'OffsetRequest', 'CustomerDisputedAmount', 'CustomerCreditBalance',
  'CustomerRefundRequest', 'Debt', 'EmployeeCustody', 'EmployeeExpense', 'SupplierInvoice',
  'OperationalExpense'
]);

function isSensitive(log: AuditLog): boolean {
  return SENSITIVE_ACTIONS.has(log.action) || SENSITIVE_ENTITY_TYPES.has(log.entityType);
}

export type AnomalyType =
  | 'high_frequency_actor'
  | 'repeated_entity_override'
  | 'frequent_customer_merge'
  | 'off_hours_sensitive_action';

export interface AnomalyFlag {
  id: string;
  type: AnomalyType;
  summary: string;
  summaryAr: string;
  detectedAt: string;
  supportingAuditLogIds: string[];
}

/** Gulf Standard Time is a fixed UTC+4 offset with no daylight saving. */
function gstHour(isoTimestamp: string): number {
  const utcHours = new Date(isoTimestamp).getUTCHours();
  return (utcHours + 4) % 24;
}

function isOffHours(isoTimestamp: string, startHour: number, endHour: number): boolean {
  const hour = gstHour(isoTimestamp);
  // Window can wrap past midnight (e.g. 22 -> 6): if start > end, "off
  // hours" is [start,24) U [0,end); otherwise it's the simple [start,end) range.
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

/**
 * Scans the most recent audit log entries for pattern-level anomalies.
 * Bounded to the newest 2000 entries (audit_logs.unshift() keeps this
 * array newest-first) -- anomaly detection only ever cares about recent
 * activity, and this keeps every call cheap enough to run on-demand
 * (GET /api/anomalies) rather than needing a background job.
 */
export function detectAnomalies(auditLogs: AuditLog[]): AnomalyFlag[] {
  const recent = auditLogs.slice(0, 2000);
  const flags: AnomalyFlag[] = [];

  const highFreqCount = getRuleValue('anomalyHighFrequencyActionCount', 5);
  const highFreqWindowMs = getRuleValue('anomalyHighFrequencyWindowHours', 1) * 60 * 60 * 1000;
  const overrideCount = getRuleValue('anomalyRepeatedEntityOverrideCount', 3);
  const overrideWindowMs = getRuleValue('anomalyRepeatedEntityOverrideWindowHours', 1) * 60 * 60 * 1000;
  const mergeCount = getRuleValue('anomalyCustomerMergeCount', 3);
  const mergeWindowMs = getRuleValue('anomalyCustomerMergeWindowHours', 24) * 60 * 60 * 1000;
  const offHoursStart = getRuleValue('anomalyOffHoursStartHour', 22);
  const offHoursEnd = getRuleValue('anomalyOffHoursEndHour', 6);

  // 1. High-frequency sensitive actions by one actor within a rolling window.
  const byActor = new Map<string, AuditLog[]>();
  for (const log of recent) {
    if (!isSensitive(log)) continue;
    const list = byActor.get(log.userId) || [];
    list.push(log);
    byActor.set(log.userId, list);
  }
  for (const [userId, logs] of byActor) {
    const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    for (let i = 0; i + highFreqCount - 1 < sorted.length; i++) {
      const windowStart = new Date(sorted[i].timestamp).getTime();
      const windowEnd = new Date(sorted[i + highFreqCount - 1].timestamp).getTime();
      if (windowEnd - windowStart <= highFreqWindowMs) {
        const windowLogs = sorted.slice(i, i + highFreqCount);
        flags.push({
          id: `high_frequency_actor:${userId}:${sorted[i + highFreqCount - 1].id}`,
          type: 'high_frequency_actor',
          summary: `${windowLogs[0].userName} performed ${windowLogs.length} sensitive actions within ${(windowEnd - windowStart) / 60000 | 0} minutes.`,
          summaryAr: `قام ${windowLogs[0].userName} بتنفيذ ${windowLogs.length} عمليات حساسة خلال ${(windowEnd - windowStart) / 60000 | 0} دقيقة.`,
          detectedAt: new Date().toISOString(),
          supportingAuditLogIds: windowLogs.map(l => l.id)
        });
        break; // one flag per actor is enough signal; avoid flooding with overlapping windows
      }
    }
  }

  // 2. The same record changed repeatedly within a short window, regardless of actor.
  const byEntity = new Map<string, AuditLog[]>();
  for (const log of recent) {
    if (log.action !== 'update' && log.action !== 'rule_change' && log.action !== 'status_change') continue;
    const key = `${log.entityType}:${log.entityId}`;
    const list = byEntity.get(key) || [];
    list.push(log);
    byEntity.set(key, list);
  }
  for (const [key, logs] of byEntity) {
    const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    for (let i = 0; i + overrideCount - 1 < sorted.length; i++) {
      const windowStart = new Date(sorted[i].timestamp).getTime();
      const windowEnd = new Date(sorted[i + overrideCount - 1].timestamp).getTime();
      if (windowEnd - windowStart <= overrideWindowMs) {
        const windowLogs = sorted.slice(i, i + overrideCount);
        flags.push({
          id: `repeated_entity_override:${key}:${sorted[i + overrideCount - 1].id}`,
          type: 'repeated_entity_override',
          summary: `${key} was changed ${windowLogs.length} times within ${(windowEnd - windowStart) / 60000 | 0} minutes.`,
          summaryAr: `تم تعديل ${key} ${windowLogs.length} مرات خلال ${(windowEnd - windowStart) / 60000 | 0} دقيقة.`,
          detectedAt: new Date().toISOString(),
          supportingAuditLogIds: windowLogs.map(l => l.id)
        });
        break;
      }
    }
  }

  // 3. The same staff member merging several customer records in a short window.
  const mergesByActor = new Map<string, AuditLog[]>();
  for (const log of recent) {
    if (log.action !== 'merge') continue;
    const list = mergesByActor.get(log.userId) || [];
    list.push(log);
    mergesByActor.set(log.userId, list);
  }
  for (const [userId, logs] of mergesByActor) {
    const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    for (let i = 0; i + mergeCount - 1 < sorted.length; i++) {
      const windowStart = new Date(sorted[i].timestamp).getTime();
      const windowEnd = new Date(sorted[i + mergeCount - 1].timestamp).getTime();
      if (windowEnd - windowStart <= mergeWindowMs) {
        const windowLogs = sorted.slice(i, i + mergeCount);
        flags.push({
          id: `frequent_customer_merge:${userId}:${sorted[i + mergeCount - 1].id}`,
          type: 'frequent_customer_merge',
          summary: `${windowLogs[0].userName} merged ${windowLogs.length} customer records within ${((windowEnd - windowStart) / 3600000).toFixed(1)} hours.`,
          summaryAr: `قام ${windowLogs[0].userName} بدمج ${windowLogs.length} سجلات عملاء خلال ${((windowEnd - windowStart) / 3600000).toFixed(1)} ساعة.`,
          detectedAt: new Date().toISOString(),
          supportingAuditLogIds: windowLogs.map(l => l.id)
        });
        break;
      }
    }
  }

  // 4. A sensitive action performed outside normal business hours (Gulf Standard Time).
  for (const log of recent) {
    if (!isSensitive(log)) continue;
    if (!isOffHours(log.timestamp, offHoursStart, offHoursEnd)) continue;
    flags.push({
      id: `off_hours_sensitive_action:${log.id}`,
      type: 'off_hours_sensitive_action',
      summary: `${log.userName} performed a ${log.action} on ${log.entityType} ${log.entityId} outside normal business hours.`,
      summaryAr: `قام ${log.userName} بتنفيذ إجراء (${log.action}) على ${log.entityType} ${log.entityId} خارج ساعات العمل الاعتيادية.`,
      detectedAt: new Date().toISOString(),
      supportingAuditLogIds: [log.id]
    });
  }

  return flags.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}
