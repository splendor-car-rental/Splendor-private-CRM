import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const calendar = readFileSync(new URL('../src/server/taxCalendar.ts', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../src/server/notificationEngine.ts', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/config/notificationEvents.ts', import.meta.url), 'utf8');

describe('Tax Calendar runtime boundary', () => {
  it('reuses the existing automated notification sweep instead of creating a scheduler', () => {
    expect(engine).toContain("from './taxCalendar'");
    expect(engine).toContain('loadTaxCalendarPeriods()');
    expect(engine).toContain('deriveTaxCalendarReminders');
    expect(calendar).not.toMatch(/setInterval|setTimeout|cron|scheduleJob/i);
  });

  it('registers tax deadline events in the existing notification event registry', () => {
    expect(events).toContain("key: 'tax_period_deadline_due'");
    expect(events).toContain("key: 'tax_period_deadline_overdue'");
    expect(events).toMatch(/tax_period_deadline_due[^\n]+category: 'financial'[^\n]+automated: true/);
    expect(events).toMatch(/tax_period_deadline_overdue[^\n]+category: 'financial'[^\n]+automated: true/);
  });

  it('derives reminders from persisted Tax Period deadline evidence and has no tax-specific lead threshold', () => {
    expect(calendar).toContain("collection('tax_periods')");
    expect(calendar).toContain('period.filingDeadline');
    expect(calendar).toContain('period.deadlineSourceId');
    expect(calendar).toContain('period.deadlineSourceVersionUpdatedAt');
    expect(calendar).not.toMatch(/tax.*lookahead|tax.*lead.*days|filing.*lead.*days/i);
  });

  it('does not create filing readiness or submission behavior', () => {
    expect(calendar).not.toContain("'READY_FOR_FILING'");
    expect(calendar).not.toMatch(/action\s*===\s*['"](?:file|filing|submit-return|submit-filing)['"]/i);
    expect(calendar).toContain('does not represent a filed return');
  });
});
