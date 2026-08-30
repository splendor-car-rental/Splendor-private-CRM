import type { VehicleTimelineEvent as _VehicleTimelineEvent } from './index';

declare module './index' {
  export interface KycDocument {
    documentNumberRaw?: string;
    documentCategory?: DocumentCategory;
    fileType?: string;
    storagePath?: string;
    documentNumber?: string;
    documentNumberMasked?: string;
    issuingCountry?: string;
    status?: KycStatus;
    verifiedByName?: string;
    rejectionReason?: string;
    notes?: string;
  }
  export interface CustomerKycProfile {
    status?: KycStatus;
    customerId?: string;
    customerCategory?: CustomerKycCategory;
    rejectionReason?: string;
    rejectionNotes?: string;
    notes?: string;
    riskScore?: unknown;
    isAgeVerified?: boolean;
    updatedAt?: string;
    ceoExceptionGranted?: boolean;
    age?: unknown;
  }
  export interface CustomerUploadedDoc extends KycDocument {}
  export interface Customer {
    kyc?: CustomerKycProfile;
    uploadedDocuments?: CustomerUploadedDoc[];
  }
  export interface CompanyBankAccount {
    bankNameAr?: string;
    accountNameAr?: string;
    swiftBic?: string;
    branch?: string;
    openingBalance?: number;
    status?: string;
    isPrimary?: boolean;
    notes?: string;
  }
  export interface SecurityDepositRecord {
    vehicleId?: string;
    customerName?: string;
    vehicleName?: string;
    originalAmount?: number;
    preAuthRef?: string;
    preAuthExpiry?: string;
    collectedAt?: string;
    appliedAmount?: number;
    refundedAmount?: number;
    balance?: number;
    currentBalance?: number;
    totalDeductions?: number;
    deductions?: unknown[];
    paymentMethod?: string;
    holdReleaseDueDate?: string;
    holdReleaseEligibleDate?: string;
    appliedReason?: string;
    refundDate?: string;
    returnDate?: string;
    releasedAt?: string;
    releasedBy?: string;
    transactionRef?: string;
    auditHistory?: unknown[];
    notes?: string;
  }
  export interface TelematicsPing {
    speedKmh?: number;
    mileage?: number;
    ignition?: boolean;
    metadata?: Record<string, unknown>;
  }
  export interface TelematicsAlert {
    contractId?: string;
    customerId?: string;
    title?: string;
    titleAr?: string;
    description?: string;
    speedKmh?: number;
    latitude?: number;
    longitude?: number;
    message?: string;
    resolved?: boolean;
    resolvedAt?: string;
    resolvedBy?: string;
    metadata?: Record<string, unknown>;
  }
  export interface GeofenceZone {
    nameAr?: string;
    description?: string;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
    isRestricted?: boolean;
    coordinates?: Array<{ lat: number; lng: number }>;
    zoneType?: string;
    penaltyAmountAed?: number;
    active?: boolean;
    polygon?: Array<{ lat: number; lng: number }>;
  }
  export interface SeasonalityRule {
    name?: string;
    nameAr?: string;
    multiplier?: number;
    active?: boolean;
    priority?: number;
    applicableCategories?: string[];
    baseDailyRate?: number;
    minRentalDays?: number;
  }
  export interface OccupancyMultiplierRule {
    minOccupancy?: number;
    maxOccupancy?: number;
    minOccupancyPercent?: number;
    maxOccupancyPercent?: number;
    active?: boolean;
    priority?: number;
  }
  export interface YieldPricingQuoteResult {
    dailyRate?: number;
    baseDailyRate?: number;
    weeklyRate?: number;
    monthlyRate?: number;
    currency?: string;
    durationDays?: number;
    totalDays?: number;
    seasonalityApplied?: unknown;
    occupancyPercent?: number;
    durationDiscountPercent?: number;
    finalDailyRate?: number;
    subtotal?: number;
    vatAmount?: number;
    grandTotal?: number;
    suggestedDeposit?: number;
    calculationBreakdown?: string[];
  }
  export interface VehicleTimelineEvent {
    action: _VehicleTimelineEvent['action'];
  }

  // Missing PR9 feature aliases/interfaces. These are declarations only;
  // runtime behavior remains in the feature modules that consume them.
  export type VehicleManufacturer = string;
  export interface VehicleCatalogModel { id: string; manufacturer: string; model: string; year?: number; trim?: string; active?: boolean; [key: string]: unknown; }
  export type VehicleBodyStyle = 'sedan' | 'suv' | 'coupe' | 'convertible' | 'hatchback' | 'wagon' | 'pickup' | 'van' | string;
  export type VehicleClassTier = 'economy' | 'standard' | 'premium' | 'luxury' | 'exotic' | 'supercar' | string;
  export type VehicleSuvClass = 'compact' | 'midsize' | 'fullsize' | 'luxury' | string;
  export type VehiclePerformanceClass = 'standard' | 'sport' | 'performance' | 'supercar' | 'hypercar' | string;
  export type VehicleRentalSegment = 'economy' | 'compact' | 'suv' | 'luxury' | 'premium' | 'exotic' | 'supercar' | string;
  export type VehicleUsageType = 'rental' | 'lease_to_own' | 'company' | 'fleet' | 'demo' | string;
  export type VehicleDrivetrain = 'fwd' | 'rwd' | 'awd' | '4wd' | string;
  export type VehicleRoofType = 'standard' | 'sunroof' | 'panoramic' | 'convertible' | 'hardtop' | string;

  export type BankMatchClassification = 'exact' | 'probable' | 'possible' | 'manual_review' | 'unmatched' | string;
  export interface UnmatchedCrmPaymentReportEntry { paymentId: string; amount: number; reference?: string; customerId?: string; customerName?: string; reason?: string; }

  export interface LtoApplication { id: string; customerId: string; vehicleId: string; contractId?: string; status: LtoApplicationStatus; requestedAmount?: number; createdAt: string; updatedAt: string; [key: string]: unknown; }
  export type LtoApplicationStatus = 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'active' | 'completed' | 'cancelled' | string;
  export interface LtoEligibilityCheck { eligible: boolean; reasons?: string[]; score?: number; [key: string]: unknown; }
  export interface LtoFinancialOffer { id?: string; vehiclePrice?: number; downPayment?: number; financedAmount?: number; monthlyPayment?: number; termMonths?: number; [key: string]: unknown; }
  export interface LtoContractDetails { applicationId?: string; termMonths?: number; downPayment?: number; monthlyPayment?: number; totalPayable?: number; [key: string]: unknown; }
  export type LtoStatus = 'draft' | 'pending' | 'approved' | 'active' | 'completed' | 'settled' | 'terminated' | string;
  export interface LtoInstallment { id: string; applicationId?: string; contractId?: string; amount: number; dueDate: string; paidAt?: string; status: LtoInstallmentStatus; [key: string]: unknown; }
  export type LtoInstallmentStatus = 'pending' | 'paid' | 'overdue' | 'waived' | 'cancelled' | string;
  export interface LtoSettlementRequest { id: string; applicationId?: string; contractId?: string; amount: number; reason?: string; status?: string; createdAt?: string; [key: string]: unknown; }

  export interface BlocklistEntry { id: string; identifier: string; identifierType: BlocklistIdentifierType; tier: BlocklistTier; reason?: string; active?: boolean; customerId?: string; createdAt?: string; updatedAt?: string; [key: string]: unknown; }
  export type BlocklistIdentifierType = 'customer' | 'phone' | 'email' | 'id_number' | 'passport' | 'license' | string;
  export type BlocklistTier = 'low' | 'medium' | 'high' | 'critical' | string;

  export interface VehicleInspection { id: string; vehicleId: string; contractId?: string; type: InspectionType; photos?: InspectionPhoto[]; damages?: InspectionDamageMarker[]; notes?: string; createdAt?: string; updatedAt?: string; [key: string]: unknown; }
  export type InspectionType = 'receiving' | 'handover' | 'return' | 'periodic' | string;
  export type InspectionPhotoCategory = 'exterior' | 'interior' | 'damage' | 'odometer' | 'fuel' | 'documents' | string;
  export interface InspectionDamageMarker { id: string; category?: string; severity?: string; description?: string; [key: string]: unknown; }
  export interface InspectionPhoto { id: string; url: string; category: InspectionPhotoCategory; caption?: string; [key: string]: unknown; }
  export type DamageClassification = 'minor' | 'moderate' | 'major' | 'total_loss' | string;
  export type DamageLiabilityStatus = 'customer' | 'supplier' | 'splendor' | 'insurance' | 'undetermined' | string;

  export interface WhatsAppConversation { id: string; customerId?: string; customerName?: string; phone?: string; state: WhatsAppConversationState; priority: WhatsAppConversationPriority; messages?: WhatsAppConversationMessage[]; [key: string]: unknown; }
  export type WhatsAppConversationState = 'open' | 'pending' | 'resolved' | 'closed' | string;
  export interface WhatsAppConversationMessage { id: string; conversationId?: string; direction?: 'inbound' | 'outbound' | string; body?: string; text?: string; timestamp?: string; [key: string]: unknown; }
  export type WhatsAppConversationPriority = 'low' | 'normal' | 'high' | 'urgent' | string;
  export interface WhatsAppConversationDraft { conversationId?: string; body?: string; text?: string; [key: string]: unknown; }
  export type WhatsAppCustomerMatchStatus = 'matched' | 'unmatched' | 'ambiguous' | string;
  export interface WhatsAppReservationRequest { id?: string; customerId?: string; conversationId?: string; vehicleId?: string; pickupDateTime?: string; returnDateTime?: string; [key: string]: unknown; }

  export type PaymentGatewayProvider = 'tabby' | 'stripe' | 'network' | 'manual' | string;
  export type PaymentIntentPurpose = 'rental' | 'deposit' | 'invoice' | 'lto_installment' | 'other' | string;
  export type PaymentIntentStatus = 'created' | 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | string;
  export type PaymentGatewayEventType = 'payment_succeeded' | 'payment_failed' | 'refund_succeeded' | 'refund_failed' | string;
  export interface PaymentIntent { id: string; customerId?: string; amount: number; currency?: string; purpose: PaymentIntentPurpose; status: PaymentIntentStatus; provider?: PaymentGatewayProvider; idempotencyKey?: string; createdAt?: string; updatedAt?: string; [key: string]: unknown; }
  export interface PaymentGatewayEvent { id: string; type: PaymentGatewayEventType; paymentIntentId?: string; payload?: Record<string, unknown>; createdAt?: string; [key: string]: unknown; }
  export interface PaymentRefund { id: string; paymentIntentId?: string; amount: number; status?: string; reason?: string; createdAt?: string; [key: string]: unknown; }

  export interface VehicleCatalogUpdateRequest { id?: string; vehicleId?: string; manufacturer?: string; model?: string; status?: VehicleCatalogRequestStatus; [key: string]: unknown; }
  export type VehicleCatalogRequestStatus = 'pending' | 'approved' | 'rejected' | 'applied' | string;
}