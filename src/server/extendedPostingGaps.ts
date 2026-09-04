import admin from 'firebase-admin';
import { getPostingGaps, listJournals } from './accounting.js';
import { money } from '../lib/accounting.js';
import type { AdditionalCharge, Deposit } from '../types/index.js';
import type { JournalEntry, PostingGap } from '../accounting/types.js';

function firestore() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

function depositJournalAmount(journal: JournalEntry): number {
  return money(journal.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
}

/**
 * Extends the original migration/posting-gap detector with lifecycle checks
 * added after the first accounting merge. This is intentionally diagnostic:
 * it NEVER backfills or mutates historical operational data. Any mismatch
 * remains visible and blocks period close until finance explicitly resolves
 * it through a supported accounting action.
 */
export async function getExtendedPostingGaps(): Promise<PostingGap[]> {
  const [base, journals, chargeSnap, depositSnap] = await Promise.all([
    getPostingGaps(),
    listJournals(5000),
    firestore().collection('charges').get(),
    firestore().collection('deposits').get()
  ]);

  const gaps: PostingGap[] = [...base];
  const postedKey = new Set(journals.map(journal => `${journal.sourceType}:${journal.sourceId}:${journal.sourceAction}`));
  const depositJournals = new Map<string, JournalEntry[]>();
  for (const journal of journals) {
    if (journal.sourceType !== 'Deposit') continue;
    depositJournals.set(journal.sourceId, [...(depositJournals.get(journal.sourceId) || []), journal]);
  }

  for (const doc of chargeSnap.docs) {
    const charge = doc.data() as AdditionalCharge;
    if (charge.approvalStatus !== 'approved') continue;
    if (!postedKey.has(`AdditionalCharge:${charge.id}:approve`)) {
      gaps.push({
        sourceType: 'AdditionalCharge',
        sourceId: charge.id,
        date: charge.timestamp,
        description: `Approved additional charge ${charge.id}`,
        amount: money(charge.totalAmount),
        reason: 'Approved charge has not been posted to Accounts Receivable / revenue / VAT.'
      });
    }
  }

  for (const doc of depositSnap.docs) {
    const deposit = doc.data() as Deposit & { holdType?: string };
    if (deposit.holdType === 'gateway_authorization') continue;
    const related = depositJournals.get(deposit.id) || [];
    const appliedInLedger = money(related
      .filter(journal => journal.sourceAction.startsWith('apply:'))
      .reduce((sum, journal) => sum + depositJournalAmount(journal), 0));
    const refundedInLedger = money(related
      .filter(journal => journal.sourceAction.startsWith('refund:'))
      .reduce((sum, journal) => sum + depositJournalAmount(journal), 0));
    const operationalApplied = money(deposit.appliedAmount || 0);
    const operationalRefunded = money(deposit.refundedAmount || 0);

    if (operationalApplied > appliedInLedger + 0.01) {
      gaps.push({
        sourceType: 'DepositApplication',
        sourceId: deposit.id,
        date: (deposit as any).updatedAt || deposit.createdAt,
        description: `Security deposit ${deposit.id} application`,
        amount: money(operationalApplied - appliedInLedger),
        reason: 'Operational deposit application exceeds the amount represented by posted deposit-application journals.'
      });
    }
    if (operationalRefunded > refundedInLedger + 0.01) {
      gaps.push({
        sourceType: 'DepositRefund',
        sourceId: deposit.id,
        date: deposit.refundDate || (deposit as any).updatedAt || deposit.createdAt,
        description: `Security deposit ${deposit.id} refund`,
        amount: money(operationalRefunded - refundedInLedger),
        reason: 'Operational deposit refund exceeds the amount represented by posted deposit-refund journals.'
      });
    }
  }

  return gaps;
}
