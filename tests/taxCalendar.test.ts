import { describe, expect, it } from 'vitest';
import { deriveTaxCalendarReminders } from '../src/server/taxCalendar';
import type { TaxPeriod } from '../src/tax/types';

const basePeriod: TaxPeriod = {
  id: 'TAXPERIOD-VAT-2026Q3',
  domain: 'VAT',
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  filingDeadline: '2026-10-28',
  deadlineBasis: 'OFFICIAL_SOURCE',
  deadlineSourceId: 'SRC-DEADLINE-1',
  deadlineSourceVersionUpdatedAt: '2026-09-02T11:00:00.000Z',
  taxProfileVersionUpdatedAt: '2026-09-02T10:00:00.000Z',
  status: 'open',
  ruleVersionIds: [],
  blockingExceptionCount: 0,
  governanceReadiness: 'IN_PREPARATION',
  createdBy: 'finance-1',
  createdByName: 'Finance',
  createdAt: '2026-09-02T12:00:00.000Z',
  updatedAt: '2026-09-02T12:00:00.000Z'
};

describe('Tax Calendar foundation', () => {
  it('does not invent a lead-time reminder before the documented deadline', () => {
    expect(deriveTaxCalendarReminders([basePeriod], new Date('2026-10-27T12:00:00.000Z'))).toEqual([]);
  });

  it('emits a due-today reminder using the UAE calendar day and preserves source-version traceability', () => {
    const reminders = deriveTaxCalendarReminders([basePeriod], new Date('2026-10-27T20:30:00.000Z'));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].eventKey).toBe('tax_period_deadline_due');
    expect(reminders[0].deadlineSourceId).toBe(basePeriod.deadlineSourceId);
    expect(reminders[0].deadlineSourceVersionUpdatedAt).toBe(basePeriod.deadlineSourceVersionUpdatedAt);
    expect(reminders[0].messageEn).toContain('does not represent a filed return');
  });

  it('emits an overdue reminder after the documented deadline without inferring filing state', () => {
    const reminders = deriveTaxCalendarReminders([basePeriod], new Date('2026-10-29T08:00:00.000Z'));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].eventKey).toBe('tax_period_deadline_overdue');
  });

  it('fails closed when official-source version traceability is missing', () => {
    const missingSourceVersion = { ...basePeriod, deadlineSourceVersionUpdatedAt: '' } as TaxPeriod;
    expect(deriveTaxCalendarReminders([missingSourceVersion], new Date('2026-10-29T08:00:00.000Z'))).toEqual([]);
  });

  it('does not equate Closed with Filed', () => {
    const closed: TaxPeriod = { ...basePeriod, status: 'closed', governanceReadiness: 'CLOSED' };
    const reminders = deriveTaxCalendarReminders([closed], new Date('2026-10-29T08:00:00.000Z'));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].messageEn).toContain('does not represent a filed return');
  });
});
