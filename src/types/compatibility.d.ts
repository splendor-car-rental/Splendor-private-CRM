import type { VehicleTimelineEvent as _VehicleTimelineEvent } from './index';

declare module './index' {
  // KycStatus, CustomerKycCategory, DocumentCategory, KycDocument, and
  // CustomerKycProfile are now real types declared directly in index.ts
  // (and Customer.kycProfile/kycStatus/kycCustomerCategory are real fields
  // there too) -- this file no longer needs to patch them in as `string`-
  // typed ambient overrides.
  export interface Customer { emirate?: string; dateOfBirth?: string; uploadedDocuments?: KycDocument[]; }
  export interface Vehicle { chassisNumber?: string; engineNumber?: string; plateCategory?: string; registrationDate?: string; trafficFileNumber?: string; insuranceCompany?: string; insuranceType?: string; insurancePolicyNumber?: string; mortgagee?: string; manufacturingCountry?: string; seatingCapacity?: number; gpsTrackingCompany?: string; gpsCertificateExpiry?: string; dailyMileageAllowance?: number; monthlyMileageAllowance?: number; extraKmRate?: number; }
  export interface Contract { monthlyMileageAllowance?: number; currency?: string; exchangeRate?: number; }
  export interface CompanyBankAccount { id: string; bankName: string; bankNameAr?: string; accountName?: string; accountNameAr?: string; accountNumber?: string; iban?: string; swiftCode?: string; swiftBic?: string; currency?: string; branch?: string; openingBalance?: number; status?: 'active' | 'inactive' | string; isPrimary?: boolean; notes?: string; createdAt?: string; updatedAt?: string; }
  export interface VehicleTimelineEvent { action: _VehicleTimelineEvent['action']; }
}

