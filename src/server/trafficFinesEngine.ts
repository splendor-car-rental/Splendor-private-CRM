import { TrafficFine, FineStatus, FineSource, Contract, Customer, Vehicle } from '../types/index.js';
import { DataStore } from './dataStore.js';

export interface FineImportRow {
  ticketNumber: string;
  source?: FineSource;
  violationDate: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  violationTime?: string;
  violationDescription: string;
  violationDescriptionAr?: string;
  violationCode?: string;
  location: string;
  city?: string;
  plateNumber: string;
  plateCode?: string;
  plateEmirate?: string;
  fineAmount: number;
  blackPoints?: number;
}

export class TrafficFinesEngine {
  public static readonly DEFAULT_KNOWLEDGE_FEE = 20; // AED Knowledge / Innovation Fee
  public static readonly DEFAULT_ADMIN_SURCHARGE_PERCENT = 0.10; // 10%
  public static readonly MIN_ADMIN_SURCHARGE_AED = 50; // Minimum 50 AED admin processing

  /**
   * Calculate fine total with Dubai/UAE knowledge fees and company processing surcharge
   */
  public static computeFineCharges(baseFineAmount: number, customAdminFee?: number): {
    fineAmount: number;
    knowledgeFee: number;
    adminSurcharge: number;
    totalCharged: number;
  } {
    const knowledgeFee = this.DEFAULT_KNOWLEDGE_FEE;
    let adminSurcharge = customAdminFee !== undefined 
      ? customAdminFee 
      : Math.max(this.MIN_ADMIN_SURCHARGE_AED, Math.round(baseFineAmount * this.DEFAULT_ADMIN_SURCHARGE_PERCENT));
    
    const totalCharged = baseFineAmount + knowledgeFee + adminSurcharge;
    return {
      fineAmount: baseFineAmount,
      knowledgeFee,
      adminSurcharge,
      totalCharged
    };
  }

  /**
   * Find matching contract for a traffic violation based on vehicle plate and exact timestamp
   */
  public static matchFineToContract(
    fine: FineImportRow,
    contracts: Contract[],
    vehicles: Vehicle[]
  ): {
    matchedContract?: Contract;
    matchedVehicle?: Vehicle;
    confidence: number;
    reason: string;
  } {
    // 1. Clean plate representation
    const cleanFinePlate = (fine.plateNumber || '').replace(/[\s\-_]/g, '').toUpperCase();
    if (!cleanFinePlate) {
      return { confidence: 0, reason: 'Missing plate number on fine ticket.' };
    }

    // 2. Find vehicle by current plate or plate history
    const matchedVehicle = vehicles.find((v) => {
      const vPlate = (v.plateNumber || '').replace(/[\s\-_]/g, '').toUpperCase();
      if (vPlate === cleanFinePlate) return true;
      if (v.plateHistory && v.plateHistory.some((ph) => ph.plateNumber.replace(/[\s\-_]/g, '').toUpperCase() === cleanFinePlate)) {
        return true;
      }
      return false;
    });

    if (!matchedVehicle) {
      return { confidence: 0, reason: `No fleet vehicle found for plate: ${fine.plateNumber}` };
    }

    // 3. Parse fine violation timestamp
    const fineTimeMs = new Date(fine.violationDate).getTime();
    if (isNaN(fineTimeMs)) {
      return { matchedVehicle, confidence: 30, reason: 'Invalid violation timestamp on fine.' };
    }

    // 4. Find active contract that enveloped this exact moment
    const candidateContracts = contracts.filter((c) => {
      if (c.vehicleId !== matchedVehicle.id && c.vehiclePlate !== fine.plateNumber) {
        return false;
      }
      // Consider status: active, completed, closed, pending_return
      if (['cancelled', 'draft'].includes(c.status)) return false;

      const startMs = new Date(c.startDateTime).getTime();
      const endMs = new Date(c.returnDetails?.returnDateTime || c.endDateTime).getTime();

      // Buffer of 30 mins for grace handover intervals
      return fineTimeMs >= startMs - 1800000 && fineTimeMs <= endMs + 1800000;
    });

    if (candidateContracts.length === 1) {
      return {
        matchedContract: candidateContracts[0],
        matchedVehicle,
        confidence: 100,
        reason: `Matched to active Contract #${candidateContracts[0].contractNumber || candidateContracts[0].id}`
      };
    }

    if (candidateContracts.length > 1) {
      // Pick the most direct non-buffered match
      const exact = candidateContracts.find((c) => {
        const s = new Date(c.startDateTime).getTime();
        const e = new Date(c.returnDetails?.returnDateTime || c.endDateTime).getTime();
        return fineTimeMs >= s && fineTimeMs <= e;
      });
      return {
        matchedContract: exact || candidateContracts[0],
        matchedVehicle,
        confidence: 85,
        reason: `Multiple contracts near interval; matched to #${(exact || candidateContracts[0]).id}`
      };
    }

    return {
      matchedVehicle,
      confidence: 40,
      reason: 'Vehicle matched, but no active rental contract encompassed this violation timestamp.'
    };
  }

  /**
   * Process raw fine input into authoritative TrafficFine entity
   */
  public static createTrafficFine(
    raw: FineImportRow,
    contracts: Contract[],
    customers: Customer[],
    vehicles: Vehicle[],
    userId: string = 'USR-001'
  ): TrafficFine {
    const calculation = this.computeFineCharges(raw.fineAmount);
    const match = this.matchFineToContract(raw, contracts, vehicles);

    let customerId: string | undefined;
    let customerName: string | undefined;
    let contractId: string | undefined;
    let status: FineStatus = 'unallocated';

    if (match.matchedContract) {
      contractId = match.matchedContract.id;
      customerId = match.matchedContract.customerId;
      customerName = match.matchedContract.customerName;
      status = 'allocated_to_contract';
    } else if (match.matchedVehicle) {
      // Vehicle found but no contract
      status = 'unallocated';
    }

    const fineId = `FIN-${Math.floor(100000 + Math.random() * 900000)}`;

    const fine: TrafficFine = {
      id: fineId,
      ticketNumber: raw.ticketNumber,
      source: raw.source || 'dubai_police',
      violationDate: raw.violationDate,
      violationTime: raw.violationTime,
      violationCode: raw.violationCode,
      violationDescription: raw.violationDescription,
      violationDescriptionAr: raw.violationDescriptionAr,
      location: raw.location,
      city: (raw.city as any) || 'Dubai',
      plateNumber: raw.plateNumber,
      plateCode: raw.plateCode,
      plateEmirate: raw.plateEmirate || 'Dubai',
      vehicleId: match.matchedVehicle?.id,
      fineAmount: calculation.fineAmount,
      knowledgeFee: calculation.knowledgeFee,
      adminSurcharge: calculation.adminSurcharge,
      totalFineCharged: calculation.totalCharged,
      blackPoints: raw.blackPoints || 0,
      contractId,
      customerId,
      customerName,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return fine;
  }
}
