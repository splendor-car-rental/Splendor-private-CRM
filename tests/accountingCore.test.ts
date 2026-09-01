import { describe, expect, it } from 'vitest';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../src/config/accounting';
import {
  accountingPeriodBounds,
  accountingPeriodKey,
  adjustedInvoiceBalance,
  agingBucket,
  buildAPAging,
  buildARAging,
  buildBalanceSheet,
  buildCashBook,
  buildProfitLoss,
  buildTrialBalance,
  buildVatSummary,
  buildVehicleProfitability,
  validateJournalLines
} from '../src/lib/accounting';
import type { AccountsPayableEntry, JournalEntry } from '../src/accounting/types';
import type { Invoice } from '../src/types';

const journal = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'JRN-TEST',
  date: '2026-09-01',
  periodKey: '2026-09',
  currency: 'AED',
  sourceType: 'Test',
  sourceId: 'TEST-1',
  sourceAction: 'post',
  memo: 'Test journal',
  status: 'posted',
  lines: [
    { accountCode: '1300', debit: 1050, credit: 0 },
    { accountCode: '4000', debit: 0, credit: 1000 },
    { accountCode: '2200', debit: 0, credit: 50 }
  ],
  totalDebit: 1050,
  totalCredit: 1050,
  createdBy: 'U1',
  createdByName: 'Finance',
  createdByRole: 'finance',
  createdAt: '2026-09-01T10:00:00.000Z',
  postedAt: '2026-09-01T10:00:00.000Z',
  ...overrides
});

describe('accounting integrity', () => {
  it('accepts a balanced double-entry journal', () => {
    expect(validateJournalLines(journal().lines)).toEqual({ totalDebit: 1050, totalCredit: 1050 });
  });

  it('rejects an unbalanced journal', () => {
    expect(() => validateJournalLines([
      { accountCode: '1000', debit: 100, credit: 0 },
      { accountCode: '4000', debit: 0, credit: 99 }
    ])).toThrow(/not balanced/i);
  });

  it('rejects a journal line that is both debit and credit', () => {
    expect(() => validateJournalLines([
      { accountCode: '1000', debit: 10, credit: 1 },
      { accountCode: '4000', debit: 0, credit: 9 }
    ])).toThrow(/both debit and credit/i);
  });

  it('derives accounting period keys and bounds without local-time drift', () => {
    expect(accountingPeriodKey('2026-09-30')).toBe('2026-09');
    expect(accountingPeriodBounds('2026-02')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' });
  });
});

describe('financial reporting', () => {
  const journals: JournalEntry[] = [
    journal(),
    journal({
      id: 'JRN-EXP', sourceId: 'EXP-1', date: '2026-09-02',
      lines: [
        { accountCode: '5000', debit: 200, credit: 0, dimensions: { vehicleId: 'VEH-1' } },
        { accountCode: '1700', debit: 10, credit: 0, dimensions: { vehicleId: 'VEH-1' } },
        { accountCode: '1100', debit: 0, credit: 210, dimensions: { vehicleId: 'VEH-1' } }
      ],
      totalDebit: 210, totalCredit: 210
    }),
    journal({
      id: 'JRN-VEH-REV', sourceId: 'INV-VEH', date: '2026-09-03',
      lines: [
        { accountCode: '1300', debit: 525, credit: 0, dimensions: { vehicleId: 'VEH-1' } },
        { accountCode: '4000', debit: 0, credit: 500, dimensions: { vehicleId: 'VEH-1' } },
        { accountCode: '2200', debit: 0, credit: 25, dimensions: { vehicleId: 'VEH-1' } }
      ], totalDebit: 525, totalCredit: 525
    })
  ];

  it('builds a balanced trial balance', () => {
    const rows = buildTrialBalance(journals, DEFAULT_CHART_OF_ACCOUNTS, '2026-09-01', '2026-09-30');
    expect(rows.reduce((sum, row) => sum + row.debit, 0)).toBe(rows.reduce((sum, row) => sum + row.credit, 0));
  });

  it('builds profit and loss from posted revenue and expense accounts', () => {
    const result = buildProfitLoss(journals, DEFAULT_CHART_OF_ACCOUNTS, '2026-09-01', '2026-09-30');
    expect(result.revenue).toBe(1500);
    expect(result.expenses).toBe(200);
    expect(result.netProfit).toBe(1300);
  });

  it('keeps the balance sheet accounting equation balanced including current earnings', () => {
    const result = buildBalanceSheet(journals, DEFAULT_CHART_OF_ACCOUNTS, '2026-09-30');
    expect(result.balanced).toBe(true);
  });

  it('computes output VAT, input VAT, and VAT payable', () => {
    const result = buildVatSummary(journals, '2026-09-01', '2026-09-30');
    expect(result.outputVat).toBe(75);
    expect(result.inputVat).toBe(10);
    expect(result.vatPayable).toBe(65);
  });

  it('builds a cash book from cash-equivalent asset accounts only', () => {
    const rows = buildCashBook(journals, DEFAULT_CHART_OF_ACCOUNTS);
    expect(rows).toHaveLength(1);
    expect(rows[0].accountCode).toBe('1100');
    expect(rows[0].outflow).toBe(210);
    expect(rows[0].runningBalance).toBe(-210);
  });

  it('calculates vehicle profitability from dimension-tagged journal lines', () => {
    const rows = buildVehicleProfitability(journals, DEFAULT_CHART_OF_ACCOUNTS, { 'VEH-1': 'Test Car' }, { 'VEH-1': 5 }, { 'VEH-1': 10000 });
    const row = rows.find(r => r.vehicleId === 'VEH-1');
    expect(row?.revenue).toBe(500);
    expect(row?.maintenanceCost).toBe(200);
    expect(row?.netProfit).toBe(300);
    expect(row?.roiPercent).toBe(3);
    expect(row?.revenuePerDay).toBe(100);
  });
});

describe('aging and post-issuance adjustments', () => {
  const invoice = (id: string, dueDate: string, balanceDue: number): Invoice => ({
    id,
    customerId: 'CUS-1',
    customerName: 'Client',
    issueDate: '2026-05-01',
    dueDate,
    subtotal: balanceDue,
    vatAmount: 0,
    totalAmount: balanceDue,
    paidAmount: 0,
    balanceDue,
    status: 'unpaid',
    items: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z'
  });

  it('classifies AR aging buckets correctly', () => {
    expect(agingBucket('2026-09-01', '2026-09-01')).toBe('current');
    expect(agingBucket('2026-08-20', '2026-09-01')).toBe('1_30');
    expect(agingBucket('2026-07-15', '2026-09-01')).toBe('31_60');
    expect(agingBucket('2026-06-15', '2026-09-01')).toBe('61_90');
    expect(agingBucket('2026-05-01', '2026-09-01')).toBe('90_plus');
  });

  it('builds customer AR aging and collection priority', () => {
    const rows = buildARAging([invoice('INV-1', '2026-08-20', 100), invoice('INV-2', '2026-05-01', 200)], '2026-09-01');
    expect(rows[0].totalOutstanding).toBe(300);
    expect(rows[0]['1_30']).toBe(100);
    expect(rows[0]['90_plus']).toBe(200);
    expect(rows[0].collectionPriority).toBe('critical');
  });

  it('builds supplier AP aging from unpaid balances', () => {
    const payable: AccountsPayableEntry = {
      id: 'AP-1', supplierInvoiceId: 'SINV-1', supplierId: 'SUP-1', supplierName: 'Supplier', invoiceNumber: 'S-100',
      invoiceDate: '2026-05-01', dueDate: '2026-05-15', expenseAccountCode: '5170', amountBeforeVat: 1000, vatAmount: 50,
      totalAmount: 1050, paidAmount: 250, balance: 800, status: 'partially_paid', journalId: 'JRN-AP', createdAt: '2026-05-01', updatedAt: '2026-05-01'
    };
    const rows = buildAPAging([payable], '2026-09-01');
    expect(rows[0]['90_plus']).toBe(800);
    expect(rows[0].totalOutstanding).toBe(800);
  });

  it('applies credit and debit notes to the displayed invoice balance without rewriting the invoice', () => {
    const original = invoice('INV-10', '2026-09-15', 1000);
    const adjusted = adjustedInvoiceBalance(original, [
      { type: 'credit_note', totalAmount: 200, status: 'posted' },
      { type: 'debit_note', totalAmount: 50, status: 'posted' }
    ]);
    expect(adjusted).toBe(850);
    expect(original.balanceDue).toBe(1000);
  });
});
