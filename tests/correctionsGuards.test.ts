import { describe, expect, it } from 'vitest';
import { contractDeletionBlockReason, reservationDeletionBlockReason } from '../src/server/correctionsGuards';

describe('contractDeletionBlockReason -- Corrections Center / DELETE /api/contracts/:id guard', () => {
  it('allows a draft contract with no payments or deposits', () => {
    expect(contractDeletionBlockReason({ status: 'draft' }, [], [])).toBeUndefined();
  });

  it('allows a review-status contract with no payments or deposits', () => {
    expect(contractDeletionBlockReason({ status: 'review' }, [], [])).toBeUndefined();
  });

  it('blocks any status past draft/review, even with no money attached', () => {
    for (const status of ['approved', 'signed', 'active', 'settlement_pending', 'completed', 'cancelled'] as const) {
      expect(contractDeletionBlockReason({ status }, [], [])).toMatch(new RegExp(status));
    }
  });

  it('blocks a draft contract that already has a payment recorded', () => {
    expect(contractDeletionBlockReason({ status: 'draft' }, [{ contractId: 'CON-1' }], [])).toMatch(/مدفوعات أو تأمين/);
  });

  it('blocks a review contract that already has a deposit recorded', () => {
    expect(contractDeletionBlockReason({ status: 'review' }, [], [{ contractId: 'CON-1' }])).toMatch(/مدفوعات أو تأمين/);
  });
});

describe('reservationDeletionBlockReason -- Corrections Center / DELETE /api/reservations/:id guard', () => {
  it('allows a pending reservation with no deposit collected', () => {
    expect(reservationDeletionBlockReason({ status: 'pending', depositStatus: 'pending' })).toBeUndefined();
  });

  it('allows a cancelled reservation with no deposit collected', () => {
    expect(reservationDeletionBlockReason({ status: 'cancelled', depositStatus: 'refunded' })).toBeUndefined();
  });

  it('allows a no_show reservation with no deposit collected', () => {
    expect(reservationDeletionBlockReason({ status: 'no_show', depositStatus: 'pending' })).toBeUndefined();
  });

  it('blocks a confirmed reservation regardless of deposit state', () => {
    expect(reservationDeletionBlockReason({ status: 'confirmed', depositStatus: 'pending' })).toMatch(/confirmed/);
  });

  it('blocks an active reservation', () => {
    expect(reservationDeletionBlockReason({ status: 'active', depositStatus: 'pending' })).toMatch(/active/);
  });

  it('blocks a completed reservation', () => {
    expect(reservationDeletionBlockReason({ status: 'completed', depositStatus: 'refunded' })).toMatch(/completed/);
  });

  it('blocks a pending reservation whose deposit was already collected', () => {
    expect(reservationDeletionBlockReason({ status: 'pending', depositStatus: 'collected' })).toMatch(/تأمين محصّل/);
  });
});
