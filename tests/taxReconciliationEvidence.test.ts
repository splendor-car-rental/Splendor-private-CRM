import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../src/accounting/types';
import { buildPostingGaps } from '../src/server/taxReconciliationEvidence';
import type { TaxPeriod } from '../src/tax/types';

const period = {
  id: 'TAXPERIOD-VAT-EVIDENCE-TEST',
  domain: 'VAT',
  periodStart: '2099-01-01',
  periodEnd: '2099-01-31'
} as TaxPeriod;

function invoiceJournal(status: string): JournalEntry {
  return {
    id: `JRN-INVOICE-${status}`,
    date: '2099-01-10',
    periodKey: '2099-01',
    currency: 'AED',
    sourceType: 'Invoice',
    sourceId: 'INV-POSTING-GATE',
    sourceAction: 'issue',
    status,
    lines: [
      { accountCode: '1100', debit: 105, credit: 0 },
      { accountCode: '4000', debit: 0, credit: 100 },
      { accountCode: '2200', debit: 0, credit: 5 }
    ],
    totalDebit: 105,
    totalCredit: 105
  } as unknown as JournalEntry;
}

function gaps(journals: JournalEntry[]) {
  return buildPostingGaps(
    period,
    journals,
    [{ id: 'INV-POSTING-GATE', issueDate: '2099-01-10', status: 'issued', totalAmount: 105 }],
    [],
    [],
    [],
    []
  );
}

describe('Tax Reconciliation posted-ledger evidence boundary', () => {
  it.each(['unposted', 'draft', 'reversed', 'blocked_closed_period'])(
    'does not let a %s journal hide an issued-invoice posting gap',
    status => {
      expect(gaps([invoiceJournal(status)])).toMatchObject([
        { sourceType: 'Invoice', sourceId: 'INV-POSTING-GATE' }
      ]);
    }
  );

  it('recognizes the operational source only after its journal is posted', () => {
    expect(gaps([invoiceJournal('posted')])).toEqual([]);
  });
});
