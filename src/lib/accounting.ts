import type { Invoice } from '../types';
import type {
  AccountingAccount,
  AgingBucketKey,
  ARAgingRow,
  APAgingRow,
  AccountsPayableEntry,
  BalanceSheetReport,
  CashBookRow,
  JournalEntry,
  JournalLine,
  ProfitLossReport,
  TrialBalanceRow,
  VatSummary,
  VehicleProfitabilityRow
} from '../accounting/types';

const EPSILON = 0.005;

export function money(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function accountingPeriodKey(date: string | Date): string {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) throw new Error('A valid accounting date is required.');
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function accountingPeriodBounds(periodKey: string): { startDate: string; endDate: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) throw new Error('Accounting period must use YYYY-MM format.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error('Accounting period month must be between 01 and 12.');
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

export function validateJournalLines(lines: JournalLine[]): { totalDebit: number; totalCredit: number } {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('A journal entry requires at least two lines.');
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const [index, line] of lines.entries()) {
    if (!line.accountCode?.trim()) throw new Error(`Journal line ${index + 1} requires an account code.`);
    const debit = money(line.debit);
    const credit = money(line.credit);
    if (debit < 0 || credit < 0) throw new Error(`Journal line ${index + 1} cannot contain a negative debit or credit.`);
    if (debit > 0 && credit > 0) throw new Error(`Journal line ${index + 1} cannot be both debit and credit.`);
    if (debit === 0 && credit === 0) throw new Error(`Journal line ${index + 1} must contain a debit or credit amount.`);
    totalDebit = money(totalDebit + debit);
    totalCredit = money(totalCredit + credit);
  }

  if (Math.abs(totalDebit - totalCredit) > EPSILON) {
    throw new Error(`Journal is not balanced: debit ${totalDebit.toFixed(2)} != credit ${totalCredit.toFixed(2)}.`);
  }
  if (totalDebit <= 0) throw new Error('Journal total must be greater than zero.');
  return { totalDebit, totalCredit };
}

export function assertJournalAccounts(lines: JournalLine[], accounts: AccountingAccount[], directPosting = false): void {
  const accountMap = new Map(accounts.map(account => [account.code, account]));
  for (const line of lines) {
    const account = accountMap.get(line.accountCode);
    if (!account) throw new Error(`Account ${line.accountCode} does not exist in the effective Chart of Accounts.`);
    if (!account.active) throw new Error(`Account ${line.accountCode} is inactive.`);
    if (directPosting && !account.allowDirectPosting) {
      throw new Error(`Account ${line.accountCode} is a control account and cannot be used in an unrestricted manual journal.`);
    }
  }
}

export function filterPostedJournals(journals: JournalEntry[], startDate?: string, endDate?: string): JournalEntry[] {
  const start = startDate ? new Date(`${startDate}T00:00:00.000Z`).getTime() : Number.NEGATIVE_INFINITY;
  const end = endDate ? new Date(`${endDate}T23:59:59.999Z`).getTime() : Number.POSITIVE_INFINITY;
  return journals.filter(journal => {
    if (journal.status !== 'posted') return false;
    const at = new Date(journal.date).getTime();
    return Number.isFinite(at) && at >= start && at <= end;
  });
}

export function buildTrialBalance(
  journals: JournalEntry[],
  accounts: AccountingAccount[],
  startDate?: string,
  endDate?: string
): TrialBalanceRow[] {
  const posted = filterPostedJournals(journals, startDate, endDate);
  const accountMap = new Map(accounts.map(account => [account.code, account]));
  const totals = new Map<string, { debit: number; credit: number }>();

  for (const journal of posted) {
    for (const line of journal.lines) {
      const current = totals.get(line.accountCode) || { debit: 0, credit: 0 };
      current.debit = money(current.debit + line.debit);
      current.credit = money(current.credit + line.credit);
      totals.set(line.accountCode, current);
    }
  }

  return [...totals.entries()]
    .map(([accountCode, total]) => {
      const account = accountMap.get(accountCode);
      return {
        accountCode,
        accountName: account?.name || accountCode,
        accountNameAr: account?.nameAr || accountCode,
        accountClass: account?.accountClass || 'asset',
        debit: total.debit,
        credit: total.credit,
        balance: money(total.debit - total.credit)
      } as TrialBalanceRow;
    })
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

export function buildProfitLoss(
  journals: JournalEntry[],
  accounts: AccountingAccount[],
  periodStart: string,
  periodEnd: string
): ProfitLossReport {
  const rows = buildTrialBalance(journals, accounts, periodStart, periodEnd);
  const revenueAccounts = rows.filter(row => row.accountClass === 'revenue');
  const expenseAccounts = rows.filter(row => row.accountClass === 'expense');
  // Revenue accounts normally carry credit balances; expense accounts carry debit balances.
  const revenue = money(revenueAccounts.reduce((sum, row) => sum + (row.credit - row.debit), 0));
  const expenses = money(expenseAccounts.reduce((sum, row) => sum + (row.debit - row.credit), 0));
  const netProfit = money(revenue - expenses);
  return {
    periodStart,
    periodEnd,
    revenue,
    expenses,
    grossProfit: netProfit,
    netProfit,
    revenueAccounts,
    expenseAccounts
  };
}

export function buildBalanceSheet(
  journals: JournalEntry[],
  accounts: AccountingAccount[],
  asOf: string
): BalanceSheetReport {
  const rows = buildTrialBalance(journals, accounts, undefined, asOf);
  const assets = money(rows.filter(row => row.accountClass === 'asset').reduce((sum, row) => sum + (row.debit - row.credit), 0));
  const liabilities = money(rows.filter(row => row.accountClass === 'liability').reduce((sum, row) => sum + (row.credit - row.debit), 0));
  const equity = money(rows.filter(row => row.accountClass === 'equity').reduce((sum, row) => sum + (row.credit - row.debit), 0));
  const revenue = money(rows.filter(row => row.accountClass === 'revenue').reduce((sum, row) => sum + (row.credit - row.debit), 0));
  const expenses = money(rows.filter(row => row.accountClass === 'expense').reduce((sum, row) => sum + (row.debit - row.credit), 0));
  const currentEarnings = money(revenue - expenses);
  return {
    asOf,
    assets,
    liabilities,
    equity,
    currentEarnings,
    balanced: Math.abs(assets - (liabilities + equity + currentEarnings)) <= 0.01
  };
}

export function buildVatSummary(
  journals: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  inputVatAccountCode = '1700',
  outputVatAccountCode = '2200'
): VatSummary {
  let inputVat = 0;
  let outputVat = 0;
  for (const journal of filterPostedJournals(journals, periodStart, periodEnd)) {
    for (const line of journal.lines) {
      if (line.accountCode === inputVatAccountCode) inputVat = money(inputVat + line.debit - line.credit);
      if (line.accountCode === outputVatAccountCode) outputVat = money(outputVat + line.credit - line.debit);
    }
  }
  return {
    periodStart,
    periodEnd,
    outputVat,
    inputVat,
    vatPayable: money(outputVat - inputVat)
  };
}

function daysPastDue(dueDate: string, asOfDate: string): number {
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00.000Z`).getTime();
  const asOf = new Date(`${asOfDate.slice(0, 10)}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(asOf)) return 0;
  return Math.floor((asOf - due) / 86_400_000);
}

export function agingBucket(dueDate: string, asOfDate: string): AgingBucketKey {
  const days = daysPastDue(dueDate, asOfDate);
  if (days <= 0) return 'current';
  if (days <= 30) return '1_30';
  if (days <= 60) return '31_60';
  if (days <= 90) return '61_90';
  return '90_plus';
}

function emptyAgingTotals() {
  return { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
}

export function buildARAging(
  invoices: Invoice[],
  asOfDate: string,
  adjustedBalanceByInvoiceId: Record<string, number> = {}
): ARAgingRow[] {
  const rows = new Map<string, ARAgingRow>();
  for (const invoice of invoices) {
    if (invoice.status === 'cancelled') continue;
    const balance = money(adjustedBalanceByInvoiceId[invoice.id] ?? invoice.balanceDue ?? 0);
    if (balance <= 0) continue;
    const existing = rows.get(invoice.customerId) || {
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      ...emptyAgingTotals(),
      totalOutstanding: 0,
      oldestInvoiceDate: undefined,
      dueInvoiceCount: 0,
      collectionPriority: 'normal' as const
    };
    const bucket = agingBucket(invoice.dueDate || invoice.issueDate, asOfDate);
    existing[bucket] = money(existing[bucket] + balance);
    existing.totalOutstanding = money(existing.totalOutstanding + balance);
    existing.dueInvoiceCount += daysPastDue(invoice.dueDate || invoice.issueDate, asOfDate) > 0 ? 1 : 0;
    if (!existing.oldestInvoiceDate || invoice.issueDate < existing.oldestInvoiceDate) existing.oldestInvoiceDate = invoice.issueDate;
    rows.set(invoice.customerId, existing);
  }

  return [...rows.values()].map((row): ARAgingRow => ({
    ...row,
    collectionPriority: row['90_plus'] > 0 ? 'critical' : row['61_90'] > 0 ? 'high' : row['31_60'] > 0 ? 'attention' : 'normal'
  })).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}

export function buildAPAging(payables: AccountsPayableEntry[], asOfDate: string): APAgingRow[] {
  const rows = new Map<string, APAgingRow>();
  for (const payable of payables) {
    if (payable.status === 'cancelled' || payable.balance <= 0) continue;
    const existing = rows.get(payable.supplierId) || {
      supplierId: payable.supplierId,
      supplierName: payable.supplierName,
      ...emptyAgingTotals(),
      totalOutstanding: 0,
      oldestInvoiceDate: undefined,
      dueInvoiceCount: 0
    };
    const bucket = agingBucket(payable.dueDate, asOfDate);
    existing[bucket] = money(existing[bucket] + payable.balance);
    existing.totalOutstanding = money(existing.totalOutstanding + payable.balance);
    existing.dueInvoiceCount += daysPastDue(payable.dueDate, asOfDate) > 0 ? 1 : 0;
    if (!existing.oldestInvoiceDate || payable.invoiceDate < existing.oldestInvoiceDate) existing.oldestInvoiceDate = payable.invoiceDate;
    rows.set(payable.supplierId, existing);
  }
  return [...rows.values()].sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}

export function buildCashBook(
  journals: JournalEntry[],
  accounts: AccountingAccount[],
  accountCode?: string,
  openingBalance = 0
): CashBookRow[] {
  const cashCodes = new Set(accounts.filter(account => account.cashEquivalent && (!accountCode || account.code === accountCode)).map(account => account.code));
  const entries: CashBookRow[] = [];
  for (const journal of filterPostedJournals(journals).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    for (const line of journal.lines) {
      if (!cashCodes.has(line.accountCode)) continue;
      entries.push({
        journalId: journal.id,
        date: journal.date,
        accountCode: line.accountCode,
        reference: journal.reference,
        memo: line.memo || journal.memo,
        inflow: money(line.debit),
        outflow: money(line.credit),
        runningBalance: 0
      });
    }
  }
  let running = money(openingBalance);
  return entries.map(entry => {
    running = money(running + entry.inflow - entry.outflow);
    return { ...entry, runningBalance: running };
  });
}

function positiveNetForClass(line: JournalLine, account: AccountingAccount): number {
  if (account.accountClass === 'revenue' || account.accountClass === 'liability' || account.accountClass === 'equity') {
    return money(line.credit - line.debit);
  }
  return money(line.debit - line.credit);
}

export function buildVehicleProfitability(
  journals: JournalEntry[],
  accounts: AccountingAccount[],
  vehicleNames: Record<string, string> = {},
  activeRentalDaysByVehicle: Record<string, number> = {},
  acquisitionCostByVehicle: Record<string, number> = {}
): VehicleProfitabilityRow[] {
  const accountMap = new Map(accounts.map(account => [account.code, account]));
  const rows = new Map<string, VehicleProfitabilityRow>();
  const getRow = (vehicleId: string): VehicleProfitabilityRow => {
    const existing = rows.get(vehicleId);
    if (existing) return existing;
    const fresh: VehicleProfitabilityRow = {
      vehicleId,
      vehicleName: vehicleNames[vehicleId],
      revenue: 0,
      maintenanceCost: 0,
      insuranceCost: 0,
      registrationCost: 0,
      financeCost: 0,
      cleaningCost: 0,
      otherCosts: 0,
      totalCost: 0,
      grossProfit: 0,
      netProfit: 0,
      roiPercent: null,
      revenuePerDay: null,
      costPerDay: null
    };
    rows.set(vehicleId, fresh);
    return fresh;
  };

  for (const journal of filterPostedJournals(journals)) {
    for (const line of journal.lines) {
      const vehicleId = line.dimensions?.vehicleId;
      if (!vehicleId) continue;
      const account = accountMap.get(line.accountCode);
      if (!account) continue;
      const value = positiveNetForClass(line, account);
      const row = getRow(vehicleId);
      if (account.accountClass === 'revenue') row.revenue = money(row.revenue + value);
      if (account.accountClass === 'expense') {
        if (line.accountCode === '5000') row.maintenanceCost = money(row.maintenanceCost + value);
        else if (line.accountCode === '5010') row.insuranceCost = money(row.insuranceCost + value);
        else if (line.accountCode === '5020') row.registrationCost = money(row.registrationCost + value);
        else if (line.accountCode === '5030') row.financeCost = money(row.financeCost + value);
        else if (line.accountCode === '5130') row.cleaningCost = money(row.cleaningCost + value);
        else row.otherCosts = money(row.otherCosts + value);
      }
    }
  }

  return [...rows.values()].map(row => {
    const totalCost = money(row.maintenanceCost + row.insuranceCost + row.registrationCost + row.financeCost + row.cleaningCost + row.otherCosts);
    const netProfit = money(row.revenue - totalCost);
    const acquisitionCost = money(acquisitionCostByVehicle[row.vehicleId] || 0);
    const days = Math.max(0, activeRentalDaysByVehicle[row.vehicleId] || 0);
    return {
      ...row,
      totalCost,
      grossProfit: netProfit,
      netProfit,
      roiPercent: acquisitionCost > 0 ? money((netProfit / acquisitionCost) * 100) : null,
      revenuePerDay: days > 0 ? money(row.revenue / days) : null,
      costPerDay: days > 0 ? money(totalCost / days) : null
    };
  }).sort((a, b) => b.netProfit - a.netProfit);
}

export function adjustedInvoiceBalance(
  invoice: Invoice,
  noteTotals: Array<{ type: 'credit_note' | 'debit_note'; totalAmount: number; status: string }>
): number {
  let balance = money(invoice.balanceDue || 0);
  for (const note of noteTotals) {
    if (note.status !== 'posted') continue;
    balance = money(balance + (note.type === 'debit_note' ? note.totalAmount : -note.totalAmount));
  }
  return Math.max(0, balance);
}
