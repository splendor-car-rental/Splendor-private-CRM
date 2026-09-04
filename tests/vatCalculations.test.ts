/**
 * VAT Calculation Regression Suite (Phase 18, extended by the Tax/VAT
 * governance audit)
 * ==============================================
 *
 * UAE's 5% VAT was previously a bare `0.05` / `1.05` literal duplicated
 * independently across 8 locations (server.ts's quotation/contract-extend/
 * return-settlement/manual-charge routes, contractOps.ts's server-
 * authoritative contract pricing, and two frontend preview calculators).
 * Centralized into src/config/tax.ts (UAE_VAT_RATE, applyVat,
 * calculateVatOnNet).
 *
 * The Tax/VAT governance audit found one of that centralization's own call
 * sites (server.ts's reservation-to-contract conversion route) applying the
 * NET-amount formula (amount * rate) to reserv.totalAmount, which is
 * actually GROSS (VAT-inclusive) -- overstating VAT collected and
 * understating net rental revenue on every contract created from a
 * reservation. Fixed by adding extractVatFromGross() (gross *
 * rate/(1+rate), the correct way to back VAT out of an amount that already
 * includes it) and renaming the ambiguous `vatPortion` to
 * `calculateVatOnNet` so its one required precondition -- the argument
 * must be VAT-exclusive -- is part of the name, not just a comment a future
 * caller can miss.
 *
 * This suite locks in that the centralized helpers compute EXACTLY the
 * same numbers the old inline literals did (5% of the base, base+5%),
 * so the migration is provably behavior-preserving, and pins the rate
 * itself at 5% so an accidental future edit to tax.ts is caught here
 * rather than silently changing every quotation/contract/charge total
 * across the app at once. It also locks in the fixed gross-to-net split
 * so this specific bug cannot silently return.
 */

import { describe, expect, it } from 'vitest';
import { UAE_VAT_RATE, applyVat, calculateVatOnNet, extractVatFromGross } from '../src/config/tax';

describe('UAE_VAT_RATE', () => {
  it('is exactly 5%, the UAE\'s federally-set VAT rate', () => {
    expect(UAE_VAT_RATE).toBe(0.05);
  });
});

describe('calculateVatOnNet()', () => {
  it('computes 5% of a rental total (matches the old `amount * 0.05` literal)', () => {
    expect(calculateVatOnNet(4000)).toBe(200);
  });

  it('computes 5% of a quotation subtotal with a discount already applied', () => {
    const subtotal = 13000;
    expect(calculateVatOnNet(subtotal)).toBe(650); // matches the synthetic test-suite fixture's expected 13,650 grand total
  });

  it('returns 0 for a zero base amount', () => {
    expect(calculateVatOnNet(0)).toBe(0);
  });
});

describe('applyVat()', () => {
  it('adds 5% VAT on top of the base amount (matches the old `amount * 1.05` literal)', () => {
    expect(applyVat(1000)).toBe(1050);
  });

  it('is equivalent to base + calculateVatOnNet(base) for any amount', () => {
    const amounts = [0, 1, 999.99, 4200, 100000];
    for (const amount of amounts) {
      expect(applyVat(amount)).toBeCloseTo(amount + calculateVatOnNet(amount), 10);
    }
  });
});

describe('extractVatFromGross() -- backing VAT out of an amount that already includes it', () => {
  it('recovers the exact net/VAT split for a round-tripped applyVat() output', () => {
    const net = 1000;
    const gross = applyVat(net); // 1050
    const recoveredVat = extractVatFromGross(gross);
    expect(recoveredVat).toBeCloseTo(50, 10);
    expect(gross - recoveredVat).toBeCloseTo(net, 10);
  });

  it('is NOT the same number as calculateVatOnNet() applied to a gross amount -- this is the exact bug that was fixed', () => {
    const gross = 1050;
    expect(extractVatFromGross(gross)).toBeCloseTo(50, 10);
    expect(calculateVatOnNet(gross)).toBe(52.5); // the wrong number a caller would get by misusing the net-only helper
    expect(extractVatFromGross(gross)).not.toBeCloseTo(calculateVatOnNet(gross), 5);
  });

  it('returns 0 for a zero gross amount', () => {
    expect(extractVatFromGross(0)).toBe(0);
  });

  it('round-trips correctly for an arbitrary set of net amounts', () => {
    for (const net of [1, 999.99, 4200, 13650, 100000]) {
      const gross = applyVat(net);
      const recoveredNet = gross - extractVatFromGross(gross);
      expect(recoveredNet).toBeCloseTo(net, 8);
    }
  });
});

describe('End-to-end pricing scenarios (same figures the old per-route literals produced)', () => {
  it('a 4-day rental at 1000 AED/day: rentalTotal 4000, vatAmount 200, grandTotal 4200', () => {
    const dailyRate = 1000;
    const days = 4;
    const rentalTotal = dailyRate * days;
    const vatAmount = calculateVatOnNet(rentalTotal);
    const grandTotal = rentalTotal + vatAmount;
    expect(rentalTotal).toBe(4000);
    expect(vatAmount).toBe(200);
    expect(grandTotal).toBe(4200);
  });

  it('a 2-day contract extension at 1000 AED/day adds 2000 rental + 100 VAT = 2100 to the grand total', () => {
    const extraDays = 2;
    const dailyRate = 1000;
    const extraRental = extraDays * dailyRate;
    const extraVat = calculateVatOnNet(extraRental);
    expect(extraRental).toBe(2000);
    expect(extraVat).toBe(100);
    expect(extraRental + extraVat).toBe(2100);
  });

  it('a 500 AED return-settlement additional charge totals 525 AED including VAT', () => {
    const additionalCharges = 500;
    expect(calculateVatOnNet(additionalCharges)).toBe(25);
    expect(applyVat(additionalCharges)).toBe(525);
  });

  it('a reservation-to-contract conversion correctly splits a VAT-inclusive reservation total (the fixed bug)', () => {
    // Mirrors src/components/views/ReservationsView.tsx: the reservation's
    // stored totalAmount is applyVat(dailyRate * days), i.e. GROSS.
    const dailyRate = 1000;
    const days = 4;
    const reservationTotalAmount = applyVat(dailyRate * days); // 4200
    const vatAmount = extractVatFromGross(reservationTotalAmount);
    const rentalTotal = reservationTotalAmount - vatAmount;
    expect(rentalTotal).toBeCloseTo(4000, 8);
    expect(vatAmount).toBeCloseTo(200, 8);
    expect(rentalTotal + vatAmount).toBeCloseTo(reservationTotalAmount, 8);
  });
});
