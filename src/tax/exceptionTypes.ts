import type { TaxDomain } from './types';

export type TaxBlockingExceptionCategory =
  | 'POSTING_GAP'
  | 'UNCLASSIFIED_TAX_ITEM'
  | 'RECONCILIATION_DIFFERENCE'
  | 'MISSING_EVIDENCE'
  | 'INVALID_TAX_DOCUMENT_CLASSIFICATION'
  | 'TAX_ADJUSTMENT_PENDING'
  | 'OTHER';

export type TaxBlockingExceptionStatus = 'open' | 'resolved';
export type TaxBlockingExceptionManager = 'TAX_RECONCILIATION';

export interface TaxBlockingException {
  id: string;
  periodId: string;
  domain: TaxDomain;
  category: TaxBlockingExceptionCategory;
  title: string;
  description: string;
  status: TaxBlockingExceptionStatus;
  evidenceReference?: string;
  evidenceDocumentId?: string;
  managedBy?: TaxBlockingExceptionManager;
  managedKey?: string;
  openedBy: string;
  openedByName: string;
  openedAt: string;
  resolutionNote?: string;
  resolutionReference?: string;
  resolutionEvidenceDocumentId?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  updatedAt: string;
}
