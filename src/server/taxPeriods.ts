import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { createDurable, updateDurable, PersistenceError } from './persistence';
import { accountingPeriodBounds, buildVatSummary, money } from '../lib/accounting';
import { listJournals } from './accounting';
import { getExtendedPostingGaps } from './extendedPostingGaps';
import {
  createProcurementApproval, registerApprovalHandler,
  type ProcurementApprovalRequest, type ProcurementApprovalActor
} from './procurementApprovals';
import type { RecordAuditFn } from './businessRules';
import type { JournalEntry, PostingGap, TaxPeriod } from '../accounting/types';

// ----------------------------------------------------
// TAX / VAT GOVERNANCE -- period review workflow (Splendor OS 3.0, P2)
// ----------------------------------------------------
// This is a review-and-sign-off workflow over figures the accounting layer
// already computes correctly (buildVatSummary, src/lib/accounting.ts) --
// it invents no new tax math and no new VAT rules. It is permanently
// restricted to draft -> under_review -> reviewed: there is no Filing API,
// no Submit Return action, no Filed/READY_FOR_FILING status, and no DELETE
// on a tax period, by design (Splendor OS 3.0 execution blueprint, Rule 15).
// Actually filing a return with the UAE FTA remains a human, out-of-band
// act; this only produces the reviewed internal record that act would be
// based on.
//
// Reuses the existing Procurement Approval engine (the same Four-Eyes/
// Segregation-of-Duties primitive already used for offset requests, debt
// corrections, and supplier payments) for the one privileged transition
// (draft -> reviewed): the preparer can never also be the reviewer, and
// the decision goes through the same generic, audited
// POST /api/procurement/approvals/:id/decide route as every other
// approval in this codebase -- no separate review endpoint to keep in sync.

export class TaxPeriodError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'TaxPeriodError';
  }
}

function db() {
  if (admin.apps.length === 0) throw new TaxPeriodError('Firebase Admin is not initialized.');
  return admin.firestore();
}

function validatePeriodKey(periodKey: string): { startDate: string; endDate: string } {
  try {
    return accountingPeriodBounds(periodKey);
  } catch {
    throw new TaxPeriodError('Tax period must use YYYY-MM format.');
  }
}

/**
 * Deterministic fingerprint of every posted journal touching this period.
 * Used to detect that new postings landed in a period AFTER it was
 * reviewed -- an accounting mutation after review must invalidate the
 * review that relied on the earlier state, never leave a stale
 * 'reviewed' status silently standing next to numbers that no longer
 * match it.
 */
function computeEvidenceRevision(journals: JournalEntry[], startDate: string, endDate: string): string {
  const relevant = journals
    .filter(journal => journal.status !== 'reversed' && journal.date >= startDate && journal.date <= endDate)
    .map(journal => `${journal.id}:${money(journal.totalDebit)}:${money(journal.totalCredit)}`)
    .sort();
  return crypto.createHash('sha256').update(relevant.join('|')).digest('hex');
}

interface TaxPeriodSnapshot {
  startDate: string;
  endDate: string;
  outputVat: number;
  inputVat: number;
  vatPayable: number;
  gaps: PostingGap[];
  evidenceRevision: string;
}

/**
 * A posting gap without a date can't be proven unrelated to this period,
 * so it conservatively counts against every period rather than none --
 * failing closed (blocking review) is the safe direction here, never the
 * other way around.
 */
async function computeSnapshot(periodKey: string): Promise<TaxPeriodSnapshot> {
  const { startDate, endDate } = validatePeriodKey(periodKey);
  const journals = await listJournals(5000);
  const summary = buildVatSummary(journals, startDate, endDate);
  const allGaps = await getExtendedPostingGaps();
  const gaps = allGaps.filter(gap => !gap.date || (gap.date >= startDate && gap.date <= endDate));
  const evidenceRevision = computeEvidenceRevision(journals, startDate, endDate);
  return {
    startDate,
    endDate,
    outputVat: summary.outputVat,
    inputVat: summary.inputVat,
    vatPayable: summary.vatPayable,
    gaps,
    evidenceRevision
  };
}

async function loadStoredPeriod(periodKey: string): Promise<TaxPeriod | null> {
  const snap = await db().collection('tax_periods').doc(periodKey).get();
  return snap.exists ? (snap.data() as TaxPeriod) : null;
}

/**
 * Read-only view: reports live figures always, and if a stored 'reviewed'
 * period's evidence no longer matches the current accounting state,
 * reports it as stale (status downgraded to 'draft' in the response, with
 * staleNote explaining why) WITHOUT writing anything -- a GET must never
 * have a side effect. Call prepareTaxPeriod to actually persist that
 * downgrade and clear the stale review.
 */
export async function getTaxPeriodView(periodKey: string): Promise<TaxPeriod & { stale: boolean }> {
  const snapshot = await computeSnapshot(periodKey);
  const stored = await loadStoredPeriod(periodKey);
  const now = new Date().toISOString();

  const base: TaxPeriod = stored || {
    id: periodKey,
    periodKey,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    status: 'draft',
    outputVat: 0,
    inputVat: 0,
    vatPayable: 0,
    postingGapCount: 0,
    evidenceRevision: '',
    createdAt: now,
    updatedAt: now
  };

  const isStale = stored?.status === 'reviewed' && stored.evidenceRevision !== snapshot.evidenceRevision;

  return {
    ...base,
    outputVat: snapshot.outputVat,
    inputVat: snapshot.inputVat,
    vatPayable: snapshot.vatPayable,
    postingGapCount: snapshot.gaps.length,
    evidenceRevision: snapshot.evidenceRevision,
    status: isStale ? 'draft' : base.status,
    staleNote: isStale
      ? 'New accounting postings were recorded in this period after it was reviewed. The review is no longer valid for the current figures -- re-prepare and request review again.'
      : (isStale === false ? undefined : base.staleNote),
    stale: !!isStale
  };
}

export async function listTaxPeriods(limit = 24): Promise<TaxPeriod[]> {
  const snap = await db().collection('tax_periods').orderBy('periodKey', 'desc').limit(Math.max(1, Math.min(limit, 120))).get();
  return snap.docs.map(doc => doc.data() as TaxPeriod);
}

/**
 * Recomputes and persists a period's snapshot. This is the only place a
 * tax_periods document is written outside the review-approval handler
 * below. A previously-reviewed period whose evidence has gone stale is
 * explicitly reset to 'draft' here (never silently left as 'reviewed'),
 * with its own audit entry documenting why -- the reset itself is a
 * compliance-relevant event, not a routine recompute.
 */
export async function prepareTaxPeriod(
  periodKey: string,
  actor: ProcurementApprovalActor,
  recordAudit: RecordAuditFn
): Promise<TaxPeriod> {
  const snapshot = await computeSnapshot(periodKey);
  const stored = await loadStoredPeriod(periodKey);
  const now = new Date().toISOString();

  if (stored?.status === 'reviewed' && stored.evidenceRevision === snapshot.evidenceRevision) {
    // Nothing changed since the review -- leave the reviewed record alone.
    return stored;
  }

  const wasStaleReview = stored?.status === 'reviewed';

  const updated: TaxPeriod = {
    id: periodKey,
    periodKey,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    status: 'draft',
    outputVat: snapshot.outputVat,
    inputVat: snapshot.inputVat,
    vatPayable: snapshot.vatPayable,
    postingGapCount: snapshot.gaps.length,
    evidenceRevision: snapshot.evidenceRevision,
    pendingApprovalRequestId: wasStaleReview ? undefined : stored?.pendingApprovalRequestId,
    preparedBy: actor.uid,
    preparedByName: actor.name,
    preparedAt: now,
    reviewedBy: wasStaleReview ? undefined : stored?.reviewedBy,
    reviewedByName: wasStaleReview ? undefined : stored?.reviewedByName,
    reviewedAt: wasStaleReview ? undefined : stored?.reviewedAt,
    staleNote: wasStaleReview
      ? 'New accounting postings were recorded after this period was reviewed. Reset to draft; a fresh review is required.'
      : undefined,
    createdAt: stored?.createdAt || now,
    updatedAt: now
  };

  if (stored) {
    await updateDurable('tax_periods', periodKey, updated as unknown as Record<string, unknown>);
  } else {
    await createDurable('tax_periods', updated as unknown as { id: string });
  }

  if (wasStaleReview) {
    await recordAudit({
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'TaxPeriod',
      entityId: periodKey,
      action: 'update',
      newValue: `Tax period ${periodKey} reset from reviewed to draft: new postings recorded after review (was output VAT ${stored!.outputVat.toLocaleString()}, now ${snapshot.outputVat.toLocaleString()}).`,
      reason: 'Stale review detected on prepare'
    });
  }

  return updated;
}

/**
 * Requests the Four-Eyes review of a freshly-prepared period. Blocked
 * while any posting gap remains in this period -- the whole point of the
 * Posting Gap engine (getExtendedPostingGaps) is that a tax figure is
 * never signed off while operational data it should include is still
 * unposted.
 */
export async function requestTaxPeriodReview(
  periodKey: string,
  actor: ProcurementApprovalActor,
  reason: string,
  recordAudit: RecordAuditFn
): Promise<{ taxPeriod: TaxPeriod; approvalRequestId: string }> {
  const prepared = await prepareTaxPeriod(periodKey, actor, recordAudit);

  if (prepared.status === 'under_review') {
    throw new TaxPeriodError(`Tax period ${periodKey} already has a pending review request.`);
  }
  if (prepared.postingGapCount > 0) {
    throw new TaxPeriodError(`${prepared.postingGapCount} unresolved posting gap(s) must be resolved before this period can be reviewed.`);
  }

  const approvalRequest = await createProcurementApproval({
    entityType: 'TaxPeriod',
    entityId: periodKey,
    action: 'review_tax_period',
    payload: { periodKey },
    requestedBy: actor.uid,
    requestedByName: actor.name,
    requestedByRole: actor.role,
    reason
  }, recordAudit);

  const now = new Date().toISOString();
  const updated: TaxPeriod = { ...prepared, status: 'under_review', pendingApprovalRequestId: approvalRequest.id, updatedAt: now };
  await updateDurable('tax_periods', periodKey, updated as unknown as Record<string, unknown>);

  return { taxPeriod: updated, approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('TaxPeriod', 'review_tax_period', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const periodKey = String(request.payload.periodKey);
  // Recompute live rather than trust the figures at request time -- the
  // period must still be genuinely gap-free and its evidence still
  // current at the moment of decision, not only when review was requested.
  const snapshot = await computeSnapshot(periodKey);
  if (snapshot.gaps.length > 0) {
    throw new TaxPeriodError(`${snapshot.gaps.length} posting gap(s) appeared in ${periodKey} since review was requested. Resolve them and request review again.`);
  }

  const stored = await loadStoredPeriod(periodKey);
  const now = new Date().toISOString();
  const reviewed: TaxPeriod = {
    id: periodKey,
    periodKey,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    status: 'reviewed',
    outputVat: snapshot.outputVat,
    inputVat: snapshot.inputVat,
    vatPayable: snapshot.vatPayable,
    postingGapCount: 0,
    evidenceRevision: snapshot.evidenceRevision,
    pendingApprovalRequestId: undefined,
    preparedBy: stored?.preparedBy,
    preparedByName: stored?.preparedByName,
    preparedAt: stored?.preparedAt,
    reviewedBy: decider.uid,
    reviewedByName: decider.name,
    reviewedAt: now,
    staleNote: undefined,
    createdAt: stored?.createdAt || now,
    updatedAt: now
  };

  if (stored) {
    await updateDurable('tax_periods', periodKey, reviewed as unknown as Record<string, unknown>);
  } else {
    await createDurable('tax_periods', reviewed as unknown as { id: string });
  }

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'TaxPeriod',
    entityId: periodKey,
    action: 'approval',
    newValue: `Tax period ${periodKey} reviewed: output VAT ${reviewed.outputVat.toLocaleString()} AED, input VAT ${reviewed.inputVat.toLocaleString()} AED, VAT payable ${reviewed.vatPayable.toLocaleString()} AED. This is an internal review record, not a filed return.`,
    reason: request.reason
  });
});
