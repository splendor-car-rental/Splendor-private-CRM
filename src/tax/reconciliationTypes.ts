import type { TaxDomain } from './types';

export interface TaxReconciliationPostingGapEvidence {
  sourceType: string;
  sourceId: string;
  date: string;
  description: string;
  reason: string;
  amount?: number;
}

export type TaxReconciliationSnapshotStatus = 'captured' | 'reviewed_clean';

export interface TaxReconciliationSnapshot {
  id: string;
  periodId: string;
  domain: TaxDomain;
  version: number;
  status: TaxReconciliationSnapshotStatus;
  periodStart: string;
  periodEnd: string;
  accountingEvidenceSource: 'accounting_journals';
  ledgerJournalIds: string[];
  ledgerJournalCount: number;
  ledgerTotalDebit: number;
  ledgerTotalCredit: number;
  ledgerEvidenceHashAlgorithm: 'SHA-256';
  ledgerEvidenceHash: string;
  postingGapCount: number;
  postingGaps: TaxReconciliationPostingGapEvidence[];
  technicalScope: 'POSTED_ACCOUNTING_LEDGER_AND_POSTING_GAPS';
  capturedBy: string;
  capturedByName: string;
  capturedAt: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
}
