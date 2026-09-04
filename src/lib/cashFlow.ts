import type {
  AccountingAccount,
  CashFlowClass,
  CashFlowReport,
  CashFlowSection,
  JournalEntry
} from '../accounting/types.js';
import { filterPostedJournals, money } from './accounting.js';

const EMPTY_SECTION = (): CashFlowSection => ({ inflows: 0, outflows: 0, net: 0 });

function cashDelta(journal: JournalEntry, cashCodes: Set<string>): number {
  return money(journal.lines.reduce((sum, line) => {
    if (!cashCodes.has(line.accountCode)) return sum;
    return sum + Number(line.debit || 0) - Number(line.credit || 0);
  }, 0));
}

function classifyJournal(
  journal: JournalEntry,
  accountMap: Map<string, AccountingAccount>,
  cashCodes: Set<string>
): CashFlowClass | 'unclassified' {
  const classes = new Set<CashFlowClass>();
  for (const line of journal.lines) {
    if (cashCodes.has(line.accountCode)) continue;
    const classification = accountMap.get(line.accountCode)?.cashFlowClass;
    if (classification) classes.add(classification);
  }
  return classes.size === 1 ? [...classes][0] : 'unclassified';
}

function applyMovement(section: CashFlowSection, delta: number): void {
  if (delta > 0) section.inflows = money(section.inflows + delta);
  if (delta < 0) section.outflows = money(section.outflows + Math.abs(delta));
  section.net = money(section.inflows - section.outflows);
}

/**
 * Direct-method cash-flow report derived only from posted journals.
 *
 * Cash-to-cash transfers (e.g. bank -> petty cash) net to zero and are
 * excluded so they never inflate inflows/outflows. A cash journal whose
 * non-cash counterpart spans more than one cash-flow class is deliberately
 * reported as `unclassified` rather than guessed. Account classifications
 * live in the configurable Chart of Accounts and do not change debit/credit
 * semantics or historical journal data.
 */
export function buildCashFlowReport(
  journals: JournalEntry[],
  accounts: AccountingAccount[],
  periodStart: string,
  periodEnd: string
): CashFlowReport {
  const accountMap = new Map(accounts.map(account => [account.code, account]));
  const cashCodes = new Set(accounts.filter(account => account.cashEquivalent).map(account => account.code));

  const openingCash = money(filterPostedJournals(journals, undefined, periodStart)
    .filter(journal => journal.date < periodStart)
    .reduce((sum, journal) => sum + cashDelta(journal, cashCodes), 0));

  const report: CashFlowReport = {
    periodStart,
    periodEnd,
    openingCash,
    operating: EMPTY_SECTION(),
    investing: EMPTY_SECTION(),
    financing: EMPTY_SECTION(),
    unclassified: EMPTY_SECTION(),
    netCashMovement: 0,
    closingCash: openingCash
  };

  for (const journal of filterPostedJournals(journals, periodStart, periodEnd)) {
    const delta = cashDelta(journal, cashCodes);
    if (Math.abs(delta) < 0.005) continue;
    const classification = classifyJournal(journal, accountMap, cashCodes);
    applyMovement(report[classification], delta);
  }

  report.netCashMovement = money(
    report.operating.net + report.investing.net + report.financing.net + report.unclassified.net
  );
  report.closingCash = money(report.openingCash + report.netCashMovement);
  return report;
}
