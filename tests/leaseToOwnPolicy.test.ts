/**
 * Lease-to-Own calculation & eligibility policy (src/server/leaseToOwnPolicy.ts)
 * ===========================================================================
 *
 * Pure functions only -- no Firestore/emulator dependency. Uses
 * businessRules.__setRuleForTests() (the same test-only seam
 * tests/governanceEngine.test.ts already uses) to inject real numeric
 * values for the two `sensitive_rule` financial thresholds this module
 * refuses to compute with until a CEO/Admin has set them for real.
 */

import { describe, expect, it } from 'vitest';
import { __setRuleForTests } from '../src/server/businessRules';
import {
  computeLtoFinancialOffer, computeOutstandingBalance, computeSettlementAmount,
  computeInstallmentStatus, countConsecutiveMissedInstallments, LtoPolicyNotConfiguredError
} from '../src/server/leaseToOwnPolicy';

function configureSensitiveRules() {
  __setRuleForTests({
    id: 'ltoMonthlyMarkupRatePercent', label: 'Test', tier: 'sensitive_rule', valueType: 'number',
    value: 6, min: 0, max: 100, editable: true
  } as any);
  __setRuleForTests({
    id: 'ltoProcessingFeeAed', label: 'Test', tier: 'sensitive_rule', valueType: 'number',
    value: 1000, min: 0, max: 100000, editable: true
  } as any);
  __setRuleForTests({
    id: 'ltoOwnershipTransferFeeAed', label: 'Test', tier: 'sensitive_rule', valueType: 'number',
    value: 500, min: 0, max: 100000, editable: true
  } as any);
}

function clearSensitiveRules() {
  __setRuleForTests({ id: 'ltoMonthlyMarkupRatePercent', label: 'Test', tier: 'sensitive_rule', valueType: 'number', value: null, min: 0, max: 100, editable: true } as any);
  __setRuleForTests({ id: 'ltoProcessingFeeAed', label: 'Test', tier: 'sensitive_rule', valueType: 'number', value: null, min: 0, max: 100000, editable: true } as any);
  __setRuleForTests({ id: 'ltoOwnershipTransferFeeAed', label: 'Test', tier: 'sensitive_rule', valueType: 'number', value: null, min: 0, max: 100000, editable: true } as any);
}

describe('computeLtoFinancialOffer', () => {
  it('refuses to compute an offer until the CEO/Admin has configured the markup rate and processing fee', () => {
    clearSensitiveRules();
    expect(() => computeLtoFinancialOffer({ vehiclePrice: 150000, downPayment: 30000, termMonths: 36, hasFinalPayment: false })).toThrow(LtoPolicyNotConfiguredError);
  });

  it('computes a deterministic offer once policy is configured, spreading financed amount + markup evenly across the term', () => {
    configureSensitiveRules();
    const offer = computeLtoFinancialOffer({ vehiclePrice: 150000, downPayment: 30000, termMonths: 24, hasFinalPayment: false });
    const financed = 150000 - 30000;
    const expectedPrincipal = Math.round((financed / 24) * 100) / 100;
    const expectedMarkup = Math.round((financed * 0.06 / 24) * 100) / 100;
    expect(offer.monthlyPrincipalPortion).toBeCloseTo(expectedPrincipal, 2);
    expect(offer.monthlyMarkupPortion).toBeCloseTo(expectedMarkup, 2);
    expect(offer.monthlyInstallment).toBeCloseTo(expectedPrincipal + expectedMarkup, 2);
    expect(offer.processingFee).toBe(1000);
    expect(offer.vatAmount).toBeGreaterThan(0);
  });

  it('accounts for a balloon final payment by excluding it from the financed/amortized amount', () => {
    configureSensitiveRules();
    const offer = computeLtoFinancialOffer({ vehiclePrice: 150000, downPayment: 20000, termMonths: 24, hasFinalPayment: true, finalPaymentAmount: 40000 });
    expect(offer.finalPayment).toBe(40000);
    const financed = 150000 - 20000 - 40000;
    expect(offer.monthlyPrincipalPortion).toBeCloseTo(Math.round((financed / 24) * 100) / 100, 2);
  });

  it('rejects a down payment that would leave nothing to finance', () => {
    configureSensitiveRules();
    expect(() => computeLtoFinancialOffer({ vehiclePrice: 100000, downPayment: 100000, termMonths: 12, hasFinalPayment: false })).toThrow();
  });

  it('rejects a non-positive vehicle price or term', () => {
    configureSensitiveRules();
    expect(() => computeLtoFinancialOffer({ vehiclePrice: 0, downPayment: 0, termMonths: 12, hasFinalPayment: false })).toThrow();
    expect(() => computeLtoFinancialOffer({ vehiclePrice: 100000, downPayment: 0, termMonths: 0, hasFinalPayment: false })).toThrow();
  });
});

describe('computeOutstandingBalance', () => {
  it('sums only the remaining amount of installments that are not paid/settled', () => {
    const balance = computeOutstandingBalance([
      { status: 'paid', remainingAmount: 0 },
      { status: 'settled', remainingAmount: 0 },
      { status: 'due', remainingAmount: 5000 },
      { status: 'overdue', remainingAmount: 5000 },
      { status: 'partially_paid', remainingAmount: 2500 }
    ] as any);
    expect(balance).toBe(12500);
  });
});

describe('computeSettlementAmount (Clause 6: no percentage penalty/discount)', () => {
  it('refuses to compute until the ownership-transfer fee is configured', () => {
    clearSensitiveRules();
    expect(() => computeSettlementAmount(10000)).toThrow(LtoPolicyNotConfiguredError);
  });

  it('is outstanding balance + flat transfer fee + adjustments -- never a percentage', () => {
    configureSensitiveRules();
    const { ownershipTransferFee, finalSettlementAmount } = computeSettlementAmount(20000, 250);
    expect(ownershipTransferFee).toBe(500);
    expect(finalSettlementAmount).toBe(20000 + 500 + 250);
  });
});

describe('computeInstallmentStatus', () => {
  const base = { amount: 1000, paidAmount: 0, dueDate: '', status: 'upcoming' as const };
  const now = new Date('2026-06-15T00:00:00.000Z');

  it('is upcoming before the due date', () => {
    expect(computeInstallmentStatus({ ...base, dueDate: '2026-07-01T00:00:00.000Z' }, now)).toBe('upcoming');
  });

  it('is due on/just after the due date, within grace', () => {
    expect(computeInstallmentStatus({ ...base, dueDate: '2026-06-14T00:00:00.000Z' }, now)).toBe('due');
  });

  it('is late once past the grace window but within the late threshold', () => {
    const dueDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days late > default 5-day grace
    expect(computeInstallmentStatus({ ...base, dueDate }, now)).toBe('late');
  });

  it('is overdue once past the late threshold', () => {
    const dueDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(); // 20 days late > default 15-day threshold
    expect(computeInstallmentStatus({ ...base, dueDate }, now)).toBe('overdue');
  });

  it('is paid once paidAmount reaches the full amount, regardless of lateness', () => {
    const dueDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeInstallmentStatus({ ...base, dueDate, paidAmount: 1000 }, now)).toBe('paid');
  });

  it('settled always wins outright', () => {
    expect(computeInstallmentStatus({ ...base, status: 'settled', dueDate: '2020-01-01T00:00:00.000Z' }, now)).toBe('settled');
  });

  it('a partial payment past grace but within the late threshold still reads as late, not partially_paid -- a customer who paid half but is late is still late on the remainder', () => {
    const dueDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeInstallmentStatus({ ...base, dueDate, paidAmount: 400 }, now)).toBe('late');
  });
});

describe('countConsecutiveMissedInstallments (Clause 3: two consecutive months)', () => {
  const now = new Date('2026-06-15T00:00:00.000Z');
  function due(n: number, monthsAgo: number) {
    return { installmentNumber: n, dueDate: new Date(now.getTime() - monthsAgo * 30 * 24 * 60 * 60 * 1000).toISOString(), paidAmount: 0 };
  }

  it('counts zero when the most recent due installment was paid', () => {
    const installments = [due(1, 2), { ...due(2, 1), paidAmount: 500 }];
    expect(countConsecutiveMissedInstallments(installments, now)).toBe(0);
  });

  it('counts a genuine 2-month streak of fully unpaid installments', () => {
    const installments = [due(1, 3), due(2, 2), due(3, 1)];
    expect(countConsecutiveMissedInstallments(installments.slice(1), now)).toBe(2);
  });

  it('a single payment breaks the streak even if an earlier installment is also unpaid', () => {
    const installments = [due(1, 2), { ...due(2, 1), paidAmount: 100 }];
    expect(countConsecutiveMissedInstallments(installments, now)).toBe(0);
  });

  it('ignores installments not yet due', () => {
    const future = { installmentNumber: 3, dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), paidAmount: 0 };
    const installments = [due(1, 2), due(2, 1), future];
    expect(countConsecutiveMissedInstallments(installments, now)).toBe(2);
  });
});
