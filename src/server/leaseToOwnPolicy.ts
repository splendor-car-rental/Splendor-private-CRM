import { getRule, getRuleValue } from './businessRules.js';
import { applyVat, calculateVatOnNet } from '../config/tax.js';
import type { LtoFinancialOffer, LtoInstallmentStatus } from '../types/index.js';

/**
 * Lease-to-Own calculation & eligibility policy.
 *
 * Grounded in Splendor's own real, approved LTO contract template (a PDF
 * supplied during this build, content-only -- its branding/layout was
 * deliberately never used; only its actual clauses shaped this policy):
 *
 *  - Clause 3: the payment schedule must show, per installment, how much
 *    of the base rent value counts toward the ownership right -- see
 *    monthlyPrincipalPortion/monthlyMarkupPortion below and each
 *    LtoInstallment's own principalPortion/markupPortion.
 *  - Clause 3: the lessor may terminate and recover the vehicle after TWO
 *    CONSECUTIVE MONTHS of missed installment payments -- a real, sourced
 *    number (ltoConsecutiveMissedInstallmentsForDefault, default 2), not
 *    invented.
 *  - Clause 6: early/full settlement carries NO percentage penalty or
 *    discount on the contract's own terms -- the customer pays the
 *    outstanding balance in full and ownership transfers immediately, "at
 *    the customer's expense" for the transfer itself. Modeled as a flat
 *    ownership-transfer fee (ltoOwnershipTransferFeeAed), not an invented
 *    percentage -- see computeSettlementAmount().
 *
 * Numbers this codebase and the contract genuinely have no value for yet
 * (the monthly markup rate, the processing fee, the ownership-transfer fee
 * amount) are seeded as `sensitive_rule` with `value: null` in
 * src/config/businessRules.ts, per this app's own established precedent
 * (see retentionCustomerRecordsDays etc.) -- never an invented number. This
 * module's calculation functions refuse to run until a CEO/Admin has set
 * them via the existing Business Rules Engine. "لا تفترض معالجة محاسبية أو
 * قانونية غير معتمدة" applied literally: the system is fully built, but a
 * human makes the actual financial-policy decision once, before the first
 * real offer/settlement is computed.
 */

export class LtoPolicyNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LtoPolicyNotConfiguredError';
  }
}

/** Throws LtoPolicyNotConfiguredError if the given sensitive financial rule has never been set (value still null). */
function requireConfiguredRule(key: string, label: string): number {
  const rule = getRule(key);
  if (!rule || rule.value === null || rule.value === undefined) {
    throw new LtoPolicyNotConfiguredError(`سياسة الإيجار المنتهي بالتملك "${label}" (${key}) لم يتم إعدادها بعد. يجب على الرئيس التنفيذي أو الإدارة تحديدها من الإعدادات -> قواعد العمل قبل إتمام هذا الإجراء.`);
  }
  return rule.value as number;
}

export interface LtoOfferInput {
  vehiclePrice: number;
  downPayment: number;
  termMonths: number;
  /** true if the term ends with a single larger balloon payment instead of the vehicle price being fully amortized across the monthly installments. */
  hasFinalPayment: boolean;
  /** Required only when hasFinalPayment is true. */
  finalPaymentAmount?: number;
}

/**
 * Pure, deterministic, testable. Financed amount = vehiclePrice -
 * downPayment - finalPaymentAmount (if any); that amount plus the
 * configured flat markup rate is spread evenly across termMonths. VAT is
 * applied via the SAME shared UAE_VAT_RATE helper every other financial
 * route in this app already uses (src/config/tax.ts) -- never a second VAT
 * calculation. Throws LtoPolicyNotConfiguredError if the markup rate or
 * processing fee has never been set by a CEO/Admin.
 */
export function computeLtoFinancialOffer(input: LtoOfferInput): LtoFinancialOffer {
  if (input.vehiclePrice <= 0) throw new Error('سعر المركبة يجب أن يكون أكبر من صفر.');
  if (input.downPayment < 0 || input.downPayment >= input.vehiclePrice) throw new Error('الدفعة المقدمة يجب أن تكون صفراً أو أكثر، وأقل من سعر المركبة.');
  if (input.termMonths <= 0) throw new Error('مدة العقد (بالأشهر) يجب أن تكون أكبر من صفر.');
  const finalPayment = input.hasFinalPayment ? (input.finalPaymentAmount || 0) : 0;
  if (finalPayment < 0 || finalPayment >= input.vehiclePrice) throw new Error('الدفعة الختامية يجب أن تكون صفراً أو أكثر، وأقل من سعر المركبة.');

  const monthlyMarkupRatePercent = requireConfiguredRule('ltoMonthlyMarkupRatePercent', 'نسبة الهامش الشهري (%)');
  const processingFeeAed = requireConfiguredRule('ltoProcessingFeeAed', 'رسوم المعالجة (درهم)');

  const financedAmount = input.vehiclePrice - input.downPayment - finalPayment;
  if (financedAmount <= 0) throw new Error('مجموع الدفعة المقدمة والدفعة الختامية يجب أن يكون أقل من سعر المركبة -- يجب أن يتبقى مبلغ ممول يُوزَّع على مدة العقد.');

  const totalMarkup = financedAmount * (monthlyMarkupRatePercent / 100);
  const monthlyPrincipalPortion = Math.round((financedAmount / input.termMonths) * 100) / 100;
  const monthlyMarkupPortion = Math.round((totalMarkup / input.termMonths) * 100) / 100;
  const monthlyInstallment = Math.round((monthlyPrincipalPortion + monthlyMarkupPortion) * 100) / 100;

  const vatAmount = calculateVatOnNet(processingFeeAed);
  const totalContractValue = Math.round((input.downPayment + monthlyInstallment * input.termMonths + finalPayment + applyVat(processingFeeAed)) * 100) / 100;

  return {
    vehiclePrice: input.vehiclePrice,
    downPayment: input.downPayment,
    termMonths: input.termMonths,
    monthlyInstallment,
    monthlyPrincipalPortion,
    monthlyMarkupPortion,
    finalPayment,
    processingFee: processingFeeAed,
    vatAmount: Math.round(vatAmount * 100) / 100,
    totalContractValue,
    computedAt: new Date().toISOString(),
    policySnapshot: { monthlyMarkupRatePercent, processingFeeAed }
  };
}

/** Outstanding balance = every unpaid/partially-paid/late/overdue installment's remainingAmount, summed. Pure -- callers pass in the installments already loaded. */
export function computeOutstandingBalance(installments: { status: LtoInstallmentStatus; remainingAmount: number }[]): number {
  return Math.round(installments.filter(i => i.status !== 'paid' && i.status !== 'settled').reduce((sum, i) => sum + i.remainingAmount, 0) * 100) / 100;
}

/**
 * Final settlement amount = outstanding balance + the flat ownership-
 * transfer processing fee -- per Clause 6 of Splendor's own LTO contract
 * template, there is no percentage penalty or discount; the customer pays
 * what remains, plus the real cost of transferring ownership to them.
 * Throws LtoPolicyNotConfiguredError if the transfer fee has never been set.
 */
export function computeSettlementAmount(outstandingBalance: number, adjustments = 0): { ownershipTransferFee: number; finalSettlementAmount: number } {
  const ownershipTransferFee = requireConfiguredRule('ltoOwnershipTransferFeeAed', 'رسوم معالجة نقل الملكية (درهم)');
  const finalSettlementAmount = Math.round((outstandingBalance + ownershipTransferFee + adjustments) * 100) / 100;
  return { ownershipTransferFee, finalSettlementAmount };
}

/** Minimum customer age (years) to be eligible for an LTO agreement. */
export function getLtoMinCustomerAgeYears(): number {
  return getRuleValue('ltoMinCustomerAgeYears', 21);
}

/** Days after an installment's due date before it moves from LATE to OVERDUE (operational/collections urgency labeling only -- NOT the default-eligibility trigger, see below). */
export function getLtoLateThresholdDays(): number {
  return getRuleValue('ltoLateThresholdDays', 15);
}

/** Days of grace after the due date before an unpaid installment is even considered LATE (still shown as DUE within this window). */
export function getLtoGraceDays(): number {
  return getRuleValue('ltoGraceDays', 5);
}

/** How long (days) a vehicle stays held for a customer while their LTO application is under review, before the hold can lapse. */
export function getLtoApplicationHoldDays(): number {
  return getRuleValue('ltoApplicationHoldDays', 3);
}

/** Consecutive fully-missed monthly installments that make an agreement eligible for default/termination -- sourced from Splendor's real LTO contract template Clause 3 ("two consecutive months"), default 2. This is the actual default-eligibility gate; grace/late-threshold days above are for collections urgency display only. */
export function getLtoConsecutiveMissedInstallmentsForDefault(): number {
  return getRuleValue('ltoConsecutiveMissedInstallmentsForDefault', 2);
}

/**
 * Computes an installment's display status from its own data plus "now" --
 * pure and deterministic (no side effects, no writes), so it can be called
 * both when READING a schedule (to show current status without needing a
 * background job to have run) and by the collections sweep (to decide who
 * needs a reminder/escalation). Precedence, most specific first: fully paid
 * or already marked settled wins outright; otherwise lateness is judged
 * from the due date regardless of a partial payment, since a customer who
 * paid half but is 20 days late is still overdue on the remainder, not
 * merely "partially paid".
 */
export function computeInstallmentStatus(
  installment: { amount: number; paidAmount: number; dueDate: string; status: LtoInstallmentStatus },
  now: Date = new Date()
): LtoInstallmentStatus {
  if (installment.status === 'settled') return 'settled';
  if (installment.paidAmount >= installment.amount) return 'paid';

  const dueMs = new Date(installment.dueDate).getTime();
  const daysLate = Math.floor((now.getTime() - dueMs) / (24 * 60 * 60 * 1000));
  const graceDays = getLtoGraceDays();
  const lateThresholdDays = getLtoLateThresholdDays();

  if (daysLate > lateThresholdDays) return 'overdue';
  if (daysLate > graceDays) return 'late';
  if (installment.paidAmount > 0) return 'partially_paid';
  if (daysLate >= 0) return 'due';
  return 'upcoming';
}

/**
 * Counts how many of the MOST RECENT consecutive due installments (by
 * installmentNumber, excluding the not-yet-due future ones) are fully
 * unpaid (paidAmount === 0) -- i.e. genuinely missed, not merely partially
 * paid. A single partial payment or a fully-paid installment breaks the
 * streak, matching the contract's own plain-language "two consecutive
 * months of non-payment", not "two months of underpayment".
 */
export function countConsecutiveMissedInstallments(
  installments: { installmentNumber: number; dueDate: string; paidAmount: number }[],
  now: Date = new Date()
): number {
  const due = installments
    .filter(i => new Date(i.dueDate).getTime() <= now.getTime())
    .sort((a, b) => b.installmentNumber - a.installmentNumber);

  let streak = 0;
  for (const installment of due) {
    if (installment.paidAmount === 0) streak++;
    else break;
  }
  return streak;
}
