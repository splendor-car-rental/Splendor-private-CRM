import admin from 'firebase-admin';
import type { TaxPeriod } from '../tax/types';

export type TaxCalendarEventKey = 'tax_period_deadline_due' | 'tax_period_deadline_overdue';

export interface TaxCalendarReminder {
  eventKey: TaxCalendarEventKey;
  cooldownKey: string;
  periodId: string;
  domain: TaxPeriod['domain'];
  deadline: string;
  deadlineSourceId: string;
  deadlineSourceVersionUpdatedAt: string;
  messageEn: string;
  messageAr: string;
}

function uaeCalendarDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizedDate(value: string | undefined): string | null {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === date ? date : null;
}

/**
 * Derives reminders only from the documented deadline already stored on an
 * evidence-bound TaxPeriod. There are deliberately no tax-specific lead-day
 * assumptions here: a future deadline produces no reminder until an accepted
 * rule/source-driven reminder policy is added later.
 */
export function deriveTaxCalendarReminders(periods: TaxPeriod[], now: Date = new Date()): TaxCalendarReminder[] {
  const today = uaeCalendarDate(now);
  const reminders: TaxCalendarReminder[] = [];

  for (const period of periods) {
    const deadline = normalizedDate(period.filingDeadline);
    if (!deadline || !period.deadlineSourceId || !period.deadlineSourceVersionUpdatedAt) continue;
    if (today < deadline) continue;

    const overdue = today > deadline;
    const eventKey: TaxCalendarEventKey = overdue ? 'tax_period_deadline_overdue' : 'tax_period_deadline_due';
    const stateEn = overdue ? 'is overdue' : 'is due today';
    const stateAr = overdue ? 'متأخر عن الموعد الموثق' : 'مستحق اليوم حسب الموعد الموثق';
    const trace = `${period.deadlineSourceId}@${period.deadlineSourceVersionUpdatedAt}`;

    reminders.push({
      eventKey,
      cooldownKey: `${eventKey}:${period.id}`,
      periodId: period.id,
      domain: period.domain,
      deadline,
      deadlineSourceId: period.deadlineSourceId,
      deadlineSourceVersionUpdatedAt: period.deadlineSourceVersionUpdatedAt,
      messageEn: `Tax Period ${period.id} (${period.domain}) deadline ${deadline} ${stateEn}. Official-source trace: ${trace}. This reminder does not represent a filed return.`,
      messageAr: `تنبيه الفترة الضريبية ${period.id} (${period.domain}): الموعد الموثق ${deadline} ${stateAr}. مرجع المصدر الرسمي: ${trace}. هذا التنبيه لا يعني أن الإقرار تم تقديمه.`
    });
  }

  return reminders;
}

/**
 * Loads Tax Periods for the existing notification sweep. If Firebase Admin is
 * unavailable, fail closed with no reminders rather than inventing calendar
 * state or starting an alternate scheduler.
 */
export async function loadTaxCalendarPeriods(): Promise<TaxPeriod[]> {
  if (admin.apps.length === 0) return [];
  const snapshot = await admin.firestore().collection('tax_periods').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaxPeriod));
}
