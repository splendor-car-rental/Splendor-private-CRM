import type { VehicleTimelineEvent as _VehicleTimelineEvent } from './index';

declare module './index' {
  export type KycStatus = 'pending' | 'in_progress' | 'verified' | 'rejected' | 'expired';
  export type CustomerKycCategory = 'identity' | 'driving_license' | 'address' | 'corporate' | 'other';
  export type DocumentCategory = CustomerKycCategory | 'passport' | 'emirates_id' | 'driving_license' | 'proof_of_address' | 'company' | 'other' | string;

  export interface KycDocument {
    id: string;
    category: CustomerKycCategory | string;
    documentCategory?: DocumentCategory;
    fileName?: string;
    fileUrl?: string;
    documentNumber?: string;
    expiryDate?: string;
    status?: KycStatus;
    uploadedAt?: string;
    verifiedAt?: string;
    verifiedBy?: string;
    notes?: string;
  }

  export interface CustomerKycProfile {
    status: KycStatus;
    documents: KycDocument[];
    lastReviewedAt?: string;
    lastReviewedBy?: string;
    rejectionReason?: string;
    notes?: string;
  }

  export interface CustomerUploadedDoc extends KycDocument {}

  export interface Customer {
    emirate?: string;
    dateOfBirth?: string;
    kyc?: CustomerKycProfile;
    kycProfile?: CustomerKycProfile;
    kycStatus?: KycStatus;
    kycCustomerCategory?: CustomerKycCategory;
    uploadedDocuments?: CustomerUploadedDoc[];
  }

  export interface Vehicle {
    chassisNumber?: string;
    engineNumber?: string;
    plateCategory?: string;
    registrationDate?: string;
    trafficFileNumber?: string;
    insuranceCompany?: string;
    insuranceType?: string;
    insurancePolicyNumber?: string;
    mortgagee?: string;
    manufacturingCountry?: string;
    seatingCapacity?: number;
    gpsTrackingCompany?: string;
    gpsCertificateExpiry?: string;
    dailyMileageAllowance?: number;
    monthlyMileageAllowance?: number;
    extraKmRate?: number;
  }

  export interface Contract {
    monthlyMileageAllowance?: number;
    currency?: string;
    exchangeRate?: number;
  }

  export interface CompanyBankAccount {
    id: string;
    bankName: string;
    accountName?: string;
    accountNumber?: string;
    iban?: string;
    swiftCode?: string;
    currency?: string;
    branch?: string;
    status?: 'active' | 'inactive' | string;
    isPrimary?: boolean;
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
  }

  export type DepositLifecycleStatus = 'pending' | 'held' | 'applied' | 'partially_refunded' | 'refunded' | 'cancelled';
  export interface SecurityDepositRecord {
    id: string;
    customerId: string;
    contractId?: string;
    reservationId?: string;
    amount: number;
    appliedAmount?: number;
    refundedAmount?: number;
    balance?: number;
    status: DepositLifecycleStatus;
    holdReleaseDueDate?: string;
    appliedReason?: string;
    refundDate?: string;
    transactionRef?: string;
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
  }

  export type FineStatus = 'pending' | 'approved' | 'billed' | 'paid' | 'disputed' | 'cancelled';
  export type FineSource = 'rta' | 'police' | 'manual' | 'import' | 'other';
  export interface TrafficFine {
    id: string;
    vehicleId?: string;
    vehiclePlate?: string;
    customerId?: string;
    contractId?: string;
    reservationId?: string;
    date: string;
    amount: number;
    status: FineStatus;
    source: FineSource;
    referenceNumber?: string;
    description?: string;
    evidenceUrl?: string;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface TelematicsPing { id: string; vehicleId: string; timestamp: string; latitude: number; longitude: number; speed?: number; heading?: number; mileage?: number; ignition?: boolean; metadata?: Record<string, unknown>; }
  export interface TelematicsAlert { id: string; vehicleId: string; type: string; severity?: 'low' | 'medium' | 'high' | 'critical' | string; message?: string; timestamp: string; resolved?: boolean; resolvedAt?: string; resolvedBy?: string; metadata?: Record<string, unknown>; }
  export interface GeofenceZone { id: string; name: string; description?: string; latitude?: number; longitude?: number; radiusMeters?: number; active?: boolean; polygon?: Array<{ latitude: number; longitude: number }>; createdAt?: string; updatedAt?: string; }
  export interface SeasonalityRule { id: string; name: string; startDate?: string; endDate?: string; multiplier: number; active?: boolean; priority?: number; }
  export interface OccupancyMultiplierRule { id: string; minOccupancy: number; maxOccupancy: number; multiplier: number; active?: boolean; priority?: number; }
  export interface YieldPricingQuoteResult { vehicleId?: string; dailyRate: number; weeklyRate?: number; monthlyRate?: number; currency?: string; durationDays?: number; occupancyMultiplier?: number; seasonalityMultiplier?: number; breakdown?: Record<string, number>; }

  export interface VehicleTimelineEvent { action: _VehicleTimelineEvent['action']; }
}

declare module '../context/CRMContext' {
  interface CRMContextType {
    addCompanyBankAccount?: (account: any) => Promise<any> | any;
    updateCompanyBankAccount?: (id: string, patch: any) => Promise<any> | any;
  }
}
