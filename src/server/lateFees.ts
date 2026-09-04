import { createDurable, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals.js';
import { LATE_FEE_GRACE_PERIOD_HOURS, LATE_FEE_EXTRA_DAY_CONVERSION_HOURS } from '../config/procurement.js';
import { getRuleValue, type RecordAuditFn } from './businessRules.js';
import type { LateFeeWaiver, UserRole } from '../types/index.js';

// ----------------------------------------------------
// CUSTOMER LATE FEE (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// 1-hour grace period (from spec), then billed in whole hours, rounding to
// the nearest hour with an exact half-hour rounding UP (also from spec).
// Once the delay PAST the grace period exceeds 6 hours (from spec), the
// whole charge converts to one full extra rental day instead of continuing
// hourly. A waiver never erases this calculation -- the original fee is
// always computed first and kept on record; the waiver is a separate,
// reason-mandatory, approval-gated record layered on top of it.

export class LateFeeError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'LateFeeError';
  }
}

export interface LateFeeComputation {
  rawDelayMinutes: number;
  withinGrace: boolean;
  billableHours: number;
  convertedToExtraDay: boolean;
  feeAmount: number;
}

/**
 * hourlyRate = dailyRate / 24 -- a standard prorated hourly rate. This
 * specific multiplier is a STARTER DEFAULT -- NEEDS BUSINESS REVIEW: only
 * the grace-period/rounding/conversion TIME thresholds were given as real
 * numbers by the business; the rate-per-hour formula itself was not.
 *
 * The grace-period and conversion thresholds are read from the Business
 * Rules Engine (CONFIG-002: these are configurable operational thresholds,
 * not values that should live as hardcoded literals) -- the imported
 * constants below are only the fallback used if the engine hasn't
 * hydrated yet, identical to the values it's seeded with. This function
 * stays pure and synchronous: it reads the CURRENT rule value fresh on
 * every call and returns a plain computation, storing nothing itself, so
 * changing either rule only affects fees computed after the change --
 * anything already recorded (a LateFeeWaiver's originalLateFeeAmount) is
 * a frozen snapshot number, never retroactively recalculated.
 */
export function computeLateFee(dailyRate: number, scheduledReturnAt: string, actualReturnAt: string): LateFeeComputation {
  const scheduled = new Date(scheduledReturnAt).getTime();
  const actual = new Date(actualReturnAt).getTime();
  const rawDelayMinutes = Math.max(0, Math.round((actual - scheduled) / 60000));

  const gracePeriodHours = getRuleValue('lateFeeGracePeriodHours', LATE_FEE_GRACE_PERIOD_HOURS);
  const extraDayConversionHours = getRuleValue('lateFeeExtraDayConversionHours', LATE_FEE_EXTRA_DAY_CONVERSION_HOURS);

  const graceMinutes = gracePeriodHours * 60;
  const pastGraceMinutes = rawDelayMinutes - graceMinutes;
  if (pastGraceMinutes <= 0) {
    return { rawDelayMinutes, withinGrace: true, billableHours: 0, convertedToExtraDay: false, feeAmount: 0 };
  }

  const conversionMinutes = extraDayConversionHours * 60;
  if (pastGraceMinutes > conversionMinutes) {
    return { rawDelayMinutes, withinGrace: false, billableHours: 0, convertedToExtraDay: true, feeAmount: Math.round(dailyRate * 100) / 100 };
  }

  const hours = Math.floor(pastGraceMinutes / 60);
  const remainder = pastGraceMinutes % 60;
  const billableHours = remainder === 0 ? hours : remainder >= 30 ? hours + 1 : hours;
  const hourlyRate = dailyRate / 24;
  const feeAmount = Math.round(billableHours * hourlyRate * 100) / 100;

  return { rawDelayMinutes, withinGrace: false, billableHours, convertedToExtraDay: false, feeAmount };
}

export interface RequestLateFeeWaiverInput {
  contractId: string;
  dailyRate: number;
  scheduledReturnAt: string;
  actualReturnAt: string;
  waivedAmount: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

/** The original fee is always computed here, from the same real timestamps, before any waiver is considered -- never invented, never skipped. */
export async function requestLateFeeWaiver(input: RequestLateFeeWaiverInput, recordAudit: RecordAuditFn): Promise<{ originalLateFeeAmount: number; approvalRequestId: string }> {
  if (!input.reason?.trim()) {
    throw new LateFeeError('A reason is required to waive a late fee.');
  }
  const computation = computeLateFee(input.dailyRate, input.scheduledReturnAt, input.actualReturnAt);
  if (computation.feeAmount <= 0) {
    throw new LateFeeError('There is no late fee to waive for this return.');
  }
  if (typeof input.waivedAmount !== 'number' || input.waivedAmount <= 0 || input.waivedAmount > computation.feeAmount) {
    throw new LateFeeError(`waivedAmount must be greater than zero and no more than the original fee (${computation.feeAmount.toLocaleString()} AED).`);
  }

  const approvalRequest = await createProcurementApproval({
    entityType: 'LateFeeWaiver',
    entityId: input.contractId,
    action: 'approve_waiver',
    payload: { contractId: input.contractId, originalLateFeeAmount: computation.feeAmount, waivedAmount: input.waivedAmount },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'LateFeeWaiver',
    entityId: input.contractId,
    action: 'update',
    newValue: `Requested waiver of ${input.waivedAmount.toLocaleString()} AED of the ${computation.feeAmount.toLocaleString()} AED late fee on contract ${input.contractId}.`,
    reason: input.reason
  });

  return { originalLateFeeAmount: computation.feeAmount, approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('LateFeeWaiver', 'approve_waiver', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const { contractId, originalLateFeeAmount, waivedAmount } = request.payload as { contractId: string; originalLateFeeAmount: number; waivedAmount: number };

  const id = await issueNextNumber('LateFeeWaiver');
  const now = new Date().toISOString();
  const waiver: LateFeeWaiver = {
    id,
    contractId,
    originalLateFeeAmount,
    waivedAmount,
    reason: request.reason,
    waivedBy: decider.uid,
    waivedByName: decider.name,
    waivedAt: now
  };
  await createDurable('late_fee_waivers', waiver as unknown as { id: string });

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'LateFeeWaiver',
    entityId: id,
    action: 'approval',
    newValue: `Waived ${waivedAmount.toLocaleString()} AED of the ${originalLateFeeAmount.toLocaleString()} AED late fee on contract ${contractId}. Original fee record is never erased.`,
    reason: request.reason
  });
});
