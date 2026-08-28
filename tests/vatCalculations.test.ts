/**
 * VAT Calculation Regression Suite (Phase 18)
 * ==============================================
 *
 * UAE's 5% VAT was previously a bare `0.05` / `1.05` literal duplicated
 * independently across 8 locations (server.ts's quotation/contract-extend/
 * return-settlement/manual-charge routes, contractOps.ts's server-
 * authoritative contract pricing, and two frontend preview calculators).
 * Centralized into src/config/tax.ts (UAE_VAT_RATE, applyVat, vatPortion).
 *
 * This suite locks in that the centralized helpers compute EXACTLY the
 * same numbers the old inline literals did (5% of the base, base+5%),
 * so the migration is provably behavior-preserving, and pins the rate
 * itself at 5% so an accidental future edit to tax.ts is caught here
 * rather than silently changing every quotation/contract/charge total
 * across the app at once.
 */

import { describe, expect, it } from 'vitest';
import { UAE_VAT_RATE, applyVat, vatPortion } from '../src/config/tax';

describe('UAE_VAT_RATE', () => {
  it('is exactly 5%, the UAE\'s federally-set VAT rate', () => {
    expect(UAE_VAT_RATE).toBe(0.05);
  });
});

describe('vatPortion()', () => {
  it('computes 5% of a rental total (matches the old `amount * 0.05` literal)', () => {
    expect(vatPortion(4000)).toBe(200);
  });

  it('computes 5% of a quotation subtotal with a discount already applied', () => {
    const subtotal = 13000;
    expect(vatPortion(subtotal)).toBe(650); // matches the synthetic test-suite fixture's expected 13,650 grand total
  });

  it('returns 0 for a zero base amount', () => {
    expect(vatPortion(0)).toBe(0);
  });
});

describe('applyVat()', () => {
  it('adds 5% VAT on top of the base amount (matches the old `amount * 1.05` literal)', () => {
    expect(applyVat(1000)).toBe(1050);
  });

  it('is equivalent to base + vatPortion(base) for any amount', () => {
    const amounts = [0, 1, 999.99, 4200, 100000];
    for (const amount of amounts) {
      expect(applyVat(amount)).toBeCloseTo(amount + vatPortion(amount), 10);
    }
  });
});

describe('End-to-end pricing scenarios (same figures the old per-route literals produced)', () => {
  it('a 4-day rental at 1000 AED/day: rentalTotal 4000, vatAmount 200, grandTotal 4200', () => {
    const dailyRate = 1000;
    const days = 4;
    const rentalTotal = dailyRate * days;
    const vatAmount = vatPortion(rentalTotal);
    const grandTotal = rentalTotal + vatAmount;
    expect(rentalTotal).toBe(4000);
    expect(vatAmount).toBe(200);
    expect(grandTotal).toBe(4200);
  });

  it('a 2-day contract extension at 1000 AED/day adds 2000 rental + 100 VAT = 2100 to the grand total', () => {
    const extraDays = 2;
    const dailyRate = 1000;
    const extraRental = extraDays * dailyRate;
    const extraVat = vatPortion(extraRental);
    expect(extraRental).toBe(2000);
    expect(extraVat).toBe(100);
    expect(extraRental + extraVat).toBe(2100);
  });

  it('a 500 AED return-settlement additional charge totals 525 AED including VAT', () => {
    const additionalCharges = 500;
    expect(vatPortion(additionalCharges)).toBe(25);
    expect(applyVat(additionalCharges)).toBe(525);
  });
});
