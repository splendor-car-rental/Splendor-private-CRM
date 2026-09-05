import { Contract, Payment, Deposit, Reservation } from '../types/index.js';

/**
 * Backs the CEO/Admin "Corrections Center" (src/components/views/
 * CorrectionsCenterView.tsx) and the guarded DELETE routes in server.ts.
 * True physical deletion is only ever safe for a record that never became
 * a binding financial fact -- anything past that point must be corrected
 * via the audited lifecycle (cancel/reverse/refund) instead, never removed.
 */

/**
 * `payments` and `deposits` must already be filtered down to the ones
 * referencing this specific contract (e.g. `allPayments.filter(p =>
 * p.contractId === contract.id)`) -- this function only checks whether
 * that filtered list is empty.
 */
export function contractDeletionBlockReason(
  contract: Pick<Contract, 'status'>,
  contractPayments: Pick<Payment, 'contractId'>[],
  contractDeposits: Pick<Deposit, 'contractId'>[]
): string | undefined {
  if (contract.status !== 'draft' && contract.status !== 'review') {
    return `لا يمكن حذف عقد بحالة "${contract.status}" نهائياً. هذا الإجراء متاح فقط للعقود غير المكتملة (مسودة/قيد المراجعة). لإلغاء عقد نشط أو موقّع استخدم إلغاء العقد بدلاً من الحذف.`;
  }
  if (contractPayments.length > 0 || contractDeposits.length > 0) {
    return 'لا يمكن حذف هذا العقد نهائياً لوجود مدفوعات أو تأمين مسجل عليه. استخدم إلغاء العقد أو رد المبلغ بدلاً من الحذف.';
  }
  return undefined;
}

export function reservationDeletionBlockReason(
  reservation: Pick<Reservation, 'status' | 'depositStatus'>
): string | undefined {
  const safeStatus = reservation.status === 'pending' || reservation.status === 'cancelled' || reservation.status === 'no_show';
  if (!safeStatus) {
    return `لا يمكن حذف حجز بحالة "${reservation.status}" نهائياً. هذا الإجراء متاح فقط للحجوزات الملغاة أو المعلّقة أو التي لم يحضر صاحبها. لإلغاء حجز مؤكد استخدم إلغاء الحجز بدلاً من الحذف.`;
  }
  if (reservation.depositStatus === 'collected') {
    return 'لا يمكن حذف هذا الحجز نهائياً لوجود مبلغ تأمين محصّل عليه. قم برد التأمين أولاً ثم أعد المحاولة.';
  }
  return undefined;
}
