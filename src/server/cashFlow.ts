import { buildCashFlowReport } from '../lib/cashFlow';
import type { CashFlowReport } from '../accounting/types';
import { getEffectiveChartOfAccounts, listJournals } from './accounting';

export async function getCashFlowReport(input?: { startDate?: string; endDate?: string }): Promise<CashFlowReport> {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = input?.startDate || `${today.slice(0, 7)}-01`;
  const endDate = input?.endDate || today;
  if (startDate > endDate) throw new Error('Cash flow start date cannot be after end date.');
  const [accounts, journals] = await Promise.all([
    getEffectiveChartOfAccounts(),
    listJournals(5000)
  ]);
  return buildCashFlowReport(journals, accounts, startDate, endDate);
}
