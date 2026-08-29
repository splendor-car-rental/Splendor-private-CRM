import { SecurityDepositRecord, DepositLifecycleStatus, Contract, Customer, TrafficFine, TollTransaction } from '../types';

export class DepositLifecycleEngine {
  public static readonly STANDARD_POST_RENTAL_HOLD_DAYS = 14;

  /**
   * Initialize a new Security Deposit Record when a contract is signed / deposit is pre-authorized
   */
  public static initializeDeposit(
    contract: Contract,
    customer: Customer,
    amount: number,
    paymentMethod: SecurityDepositRecord['paymentMethod'] = 'credit_card_preauth',
    preAuthRef?: string,
    preAuthExpiry?: string,
    collectedBy: string = 'USR-001'
  ): SecurityDepositRecord {
    const depositId = `DEP-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    const record: SecurityDepositRecord = {
      id: depositId,
      contractId: contract.id,
      customerId: customer.id,
      customerName: customer.fullName,
      vehicleId: contract.vehicleId,
      vehicleName: contract.vehicleName || 'Luxury Fleet Vehicle',
      originalAmount: amount,
      currentBalance: amount,
      totalDeductions: 0,
      refundedAmount: 0,
      paymentMethod,
      preAuthRef,
      preAuthExpiry,
      status: 'HELD_ACTIVE',
      collectedAt: now,
      deductions: [],
      auditHistory: [
        {
          timestamp: now,
          action: 'DEPOSIT_INITIALIZED',
          performedBy: collectedBy,
          previousStatus: 'PENDING_COLLECTION',
          newStatus: 'HELD_ACTIVE',
          notes: `Initial security deposit of AED ${amount.toLocaleString()} secured via ${paymentMethod}.`
        }
      ]
    };

    return record;
  }

  /**
   * Transition deposit into 14-Day Post-Rental Hold upon vehicle return
   */
  public static initiatePostRentalHold(
    deposit: SecurityDepositRecord,
    actualReturnDate: string,
    performedBy: string = 'USR-001'
  ): SecurityDepositRecord {
    const returnMs = new Date(actualReturnDate).getTime();
    const releaseEligibleMs = returnMs + this.STANDARD_POST_RENTAL_HOLD_DAYS * 24 * 60 * 60 * 1000;
    const holdReleaseEligibleDate = new Date(releaseEligibleMs).toISOString();

    const prevStatus = deposit.status;
    deposit.returnDate = actualReturnDate;
    deposit.holdReleaseEligibleDate = holdReleaseEligibleDate;
    deposit.status = 'POST_RENTAL_HOLD';

    deposit.auditHistory.push({
      timestamp: new Date().toISOString(),
      action: 'INITIATE_POST_RENTAL_HOLD',
      performedBy,
      previousStatus: prevStatus,
      newStatus: 'POST_RENTAL_HOLD',
      notes: `Vehicle returned on ${actualReturnDate}. 14-day hold engaged until ${holdReleaseEligibleDate} to clear pending RTA fines and Salik tolls.`
    });

    return deposit;
  }

  /**
   * Apply deduction (Traffic Fine, Salik tolls, Excess Mileage, Damage)
   */
  public static applyDeduction(
    deposit: SecurityDepositRecord,
    type: 'traffic_fine' | 'salik_tolls' | 'damage_excess' | 'late_return' | 'fuel_deficit' | 'admin_fee',
    amount: number,
    description: string,
    referenceId?: string,
    deductedBy: string = 'USR-001'
  ): {
    success: boolean;
    error?: string;
    deposit: SecurityDepositRecord;
    amountDeducted: number;
    uncoveredBalance: number;
  } {
    if (amount <= 0) {
      return { success: false, error: 'Deduction amount must be positive.', deposit, amountDeducted: 0, uncoveredBalance: 0 };
    }

    if (deposit.currentBalance <= 0) {
      return {
        success: false,
        error: 'Security deposit balance is fully depleted.',
        deposit,
        amountDeducted: 0,
        uncoveredBalance: amount
      };
    }

    const deductionActual = Math.min(amount, deposit.currentBalance);
    const uncovered = amount - deductionActual;

    deposit.currentBalance -= deductionActual;
    deposit.totalDeductions += deductionActual;

    deposit.deductions.push({
      id: `DED-${Math.floor(100000 + Math.random() * 900000)}`,
      type,
      referenceId,
      description,
      amount: deductionActual,
      deductedAt: new Date().toISOString(),
      deductedBy
    });

    const prevStatus = deposit.status;
    const newStatus: DepositLifecycleStatus = deposit.currentBalance === 0 ? 'FULLY_DEDUCTED' : 'PARTIALLY_DEDUCTED';
    deposit.status = newStatus;

    deposit.auditHistory.push({
      timestamp: new Date().toISOString(),
      action: 'APPLY_DEDUCTION',
      performedBy: deductedBy,
      previousStatus: prevStatus,
      newStatus,
      notes: `Deducted AED ${deductionActual.toLocaleString()} for [${type}]: ${description}. Remaining balance: AED ${deposit.currentBalance.toLocaleString()}.`
    });

    return {
      success: true,
      deposit,
      amountDeducted: deductionActual,
      uncoveredBalance: uncovered
    };
  }

  /**
   * Release and refund remaining deposit balance after 14-day hold or via executive override
   */
  public static releaseRefund(
    deposit: SecurityDepositRecord,
    releasedBy: string,
    isExecutiveOverride: boolean = false,
    overrideReason?: string
  ): {
    success: boolean;
    error?: string;
    deposit: SecurityDepositRecord;
    refundedAmount: number;
  } {
    if (deposit.currentBalance <= 0) {
      return { success: false, error: 'No remaining balance to refund.', deposit, refundedAmount: 0 };
    }

    // Check 14-day hold safety invariant
    const now = Date.now();
    if (deposit.holdReleaseEligibleDate) {
      const eligibleTime = new Date(deposit.holdReleaseEligibleDate).getTime();
      if (now < eligibleTime && !isExecutiveOverride) {
        const remainingDays = Math.ceil((eligibleTime - now) / (1000 * 60 * 60 * 24));
        return {
          success: false,
          error: `Deposit cannot be automatically released before 14-day safety hold (${remainingDays} days remaining until ${deposit.holdReleaseEligibleDate.slice(0, 10)}). Executive waiver required.`,
          deposit,
          refundedAmount: 0
        };
      }
    }

    const refundAmount = deposit.currentBalance;
    deposit.refundedAmount += refundAmount;
    deposit.currentBalance = 0;
    deposit.releasedAt = new Date().toISOString();
    deposit.releasedBy = releasedBy;

    const prevStatus = deposit.status;
    deposit.status = 'RELEASED_REFUNDED';

    deposit.auditHistory.push({
      timestamp: new Date().toISOString(),
      action: isExecutiveOverride ? 'EXECUTIVE_RELEASE_REFUND' : 'STANDARD_RELEASE_REFUND',
      performedBy: releasedBy,
      previousStatus: prevStatus,
      newStatus: 'RELEASED_REFUNDED',
      notes: `Refunded AED ${refundAmount.toLocaleString()} to client.${isExecutiveOverride ? ` [Executive Override: ${overrideReason || 'Approved'}]` : ''}`
    });

    return {
      success: true,
      deposit,
      refundedAmount: refundAmount
    };
  }
}
