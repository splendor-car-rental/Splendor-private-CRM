import type { VehicleTimelineEvent as _VehicleTimelineEvent } from './index';

declare module './index' {
  export type KycStatus = 'pending' | 'in_progress' | 'verified' | 'rejected' | 'expired' | 'PENDING' | 'UNDER_REVIEW' | 'DOCUMENTS_PENDING' | 'VERIFIED' | 'EXPIRED' | 'REJECTED' | 'UNVERIFIED' | 'ACCEPTED';
  export type CustomerKycCategory = 'identity' | 'driving_license' | 'address' | 'corporate' | 'other' | 'UAE_RESIDENT' | 'TOURIST' | 'GCC_NATIONAL';
  export type DocumentCategory = CustomerKycCategory | 'passport' | 'emirates_id' | 'driving_license' | 'proof_of_address' | 'company' | 'other' | string;
  export interface KycDocument {
    id: string; category: CustomerKycCategory | string; customerId?: string; documentCategory?: DocumentCategory; fileName?: string;
    fileUrl?: string; fileType?: string; storagePath?: string; documentNumber?: string; documentNumberMasked?: string;
    expiryDate?: string; issuingCountry?: string; status?: KycStatus; uploadedAt?: string; verifiedAt?: string; verifiedBy?: string;
    verifiedByName?: string; rejectionReason?: string; notes?: string;
  }
  export interface CustomerKycProfile {
    status: KycStatus; customerId?: string; customerCategory?: CustomerKycCategory; documents: KycDocument[];
    lastReviewedAt?: string; lastReviewedBy?: string; rejectionReason?: string; rejectionNotes?: string; notes?: string;
    riskScore?: any; ceoExceptionGranted?: boolean; age?: any; dateOfBirth?: string;
  }
  export interface CustomerUploadedDoc extends KycDocument {}
  export interface Customer { emirate?: string; dateOfBirth?: string; kyc?: CustomerKycProfile; kycProfile?: CustomerKycProfile; kycStatus?: KycStatus; kycCustomerCategory?: CustomerKycCategory; uploadedDocuments?: CustomerUploadedDoc[]; }
  export interface Vehicle {
    chassisNumber?: string; engineNumber?: string; plateCategory?: string; registrationDate?: string; trafficFileNumber?: string;
    insuranceCompany?: string; insuranceType?: string; insurancePolicyNumber?: string; mortgagee?: string; manufacturingCountry?: string;
    seatingCapacity?: number; gpsTrackingCompany?: string; gpsCertificateExpiry?: string; dailyMileageAllowance?: number;
    monthlyMileageAllowance?: number; extraKmRate?: number;
  }
  export interface Contract { monthlyMileageAllowance?: number; currency?: string; exchangeRate?: number; }
  export interface CompanyBankAccount {
    id: string; bankName: string; bankNameAr?: string; accountName?: string; accountNameAr?: string; accountNumber?: string;
    iban?: string; swiftCode?: string; swiftBic?: string; currency?: string; branch?: string; openingBalance?: number;
    status?: 'active' | 'inactive' | string; isPrimary?: boolean; notes?: string; createdAt?: string; updatedAt?: string;
  }
  export type DepositLifecycleStatus = 'pending' | 'held' | 'applied' | 'partially_refunded' | 'refunded' | 'cancelled' | 'HELD_ACTIVE' | 'POST_RENTAL_HOLD' | 'FULLY_DEDUCTED' | 'PARTIALLY_DEDUCTED' | 'RELEASED_REFUNDED';
  export interface SecurityDepositRecord {
    id: string; customerId: string; customerName?: string; contractId?: string; reservationId?: string; amount: number;
    appliedAmount?: number; refundedAmount?: number; balance?: number; currentBalance?: number; totalDeductions?: number; deductions?: any[];
    paymentMethod?: string; status: DepositLifecycleStatus; holdReleaseDueDate?: string; holdReleaseEligibleDate?: string;
    appliedReason?: string; refundDate?: string; returnDate?: string; releasedAt?: string; releasedBy?: string; transactionRef?: string;
    auditHistory?: any[]; notes?: string; createdAt?: string; updatedAt?: string;
  }
  export type FineStatus = 'pending' | 'approved' | 'billed' | 'paid' | 'disputed' | 'cancelled' | 'unallocated' | 'allocated_to_contract';
  export type FineSource = 'rta' | 'police' | 'manual' | 'import' | 'other' | 'dubai_police';
  export interface TrafficFine {
    id: string; vehicleId?: string; vehiclePlate?: string; customerId?: string; contractId?: string; reservationId?: string; date: string;
    amount: number; status: FineStatus; source: FineSource; referenceNumber?: string; ticketNumber?: string; description?: string;
    evidenceUrl?: string; createdAt?: string; updatedAt?: string;
  }
  export interface TelematicsPing { id: string; vehicleId: string; timestamp: string; latitude: number; longitude: number; speed?: number; speedKmh?: number; heading?: number; mileage?: number; ignition?: boolean; metadata?: Record<string, unknown>; }
  export interface TelematicsAlert { id: string; vehicleId: string; contractId?: string; customerId?: string; type: string; severity?: 'low' | 'medium' | 'high' | 'critical' | string; message?: string; timestamp: string; resolved?: boolean; resolvedAt?: string; resolvedBy?: string; metadata?: Record<string, unknown>; }
  export interface GeofenceZone {
    id: string; name: string; nameAr?: string; description?: string; latitude?: number; longitude?: number; radiusMeters?: number;
    coordinates?: Array<{ lat: number; lng: number }>; radius?: number; zoneType?: string; penaltyAmountAed?: number; active?: boolean;
    polygon?: Array<{ lat: number; lng: number }>; createdAt?: string; updatedAt?: string;
  }
  export interface SeasonalityRule {
    id: string; name: string; nameAr?: string; startDate?: string; endDate?: string; multiplier: number; active?: boolean; priority?: number;
    applicableCategories?: string[]; baseDailyRate?: number; minRentalDays?: number;
  }
  export interface OccupancyMultiplierRule {
    id: string; minOccupancy?: number; maxOccupancy?: number; minOccupancyPercent?: number; maxOccupancyPercent?: number;
    multiplier: number; active?: boolean; priority?: number;
  }
  export interface YieldPricingQuoteResult {
    vehicleId?: string; dailyRate: number; baseDailyRate?: number; weeklyRate?: number; monthlyRate?: number; currency?: string;
    durationDays?: number; occupancyMultiplier?: number; seasonalityMultiplier?: number; seasonalityApplied?: boolean; breakdown?: Record<string, number>;
  }
  export interface VehicleTimelineEvent { action: _VehicleTimelineEvent['action']; }
}

declare module '../context/CRMContext' {
  interface CRMContextType {
    reclassifyBankTransaction?: (txnId: string, classification: any, reason: string) => Promise<void>;
    previewBankImport?: (file: any) => Promise<any>;
    confirmBankImport?: (file: any) => Promise<any>;
    startVehicleMaintenance?: (vehicleId: string, data?: any) => Promise<any>;
    logVehicleMaintenance?: (vehicleId: string, data?: any) => Promise<any>;
  }
}
