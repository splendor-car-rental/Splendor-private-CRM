export type Language = 'en' | 'ar';

export type UserRole = 'ceo' | 'admin' | 'operations' | 'sales' | 'fleet' | 'finance';

export interface User {
  id: string;
  name: string;
  nameAr?: string;
  email: string;
  role: UserRole;
  avatar: string;
  phone: string;
  branch: string;
  status: 'active' | 'inactive';
}

export type CustomerType = 'individual' | 'corporate' | 'vip';
export type CustomerStatus = 'active' | 'inactive' | 'blocklisted' | 'vip';

// ---- Security Blocklist / Watchlist (Splendor Master Rule Set, Module 03) ----
export type BlocklistIdentifierType = 'passport' | 'emirates_id';
export type BlocklistTier = 'full' | 'conditional';

export interface BlocklistEntry {
  id: string; // BLK-000001
  identifierType: BlocklistIdentifierType;
  identifierValue: string; // normalized uppercase -- never matched by name
  identifierCountry?: string; // required, and only meaningful, when identifierType === 'passport'
  customerName?: string; // display only -- never used as the match key (RULE-B01)
  tier: BlocklistTier;
  reason: string;
  conditionalNote?: string; // required when tier === 'conditional': what's needed to proceed (raised deposit, manager sign-off, etc.)
  status: 'active' | 'removed';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  removedAt?: string;
  removedBy?: string;
  removedByName?: string;
}

export interface Customer {
  id: string; // e.g. CUS-000001
  type: CustomerType;
  fullName: string;
  fullNameAr?: string;
  companyName?: string;
  email: string;
  phone: string;
  whatsapp?: string;
  address: string;
  city: string;
  country: string;
  nationality: string;
  
  // IDs & License
  idType: 'emirates_id' | 'passport' | 'gcc_id';
  idNumber: string;
  idExpiryDate: string;
  licenseNumber: string;
  licenseCountry: string;
  licenseExpiryDate: string;

  // CRM details
  source: string;
  ownerId: string;
  ownerName: string;
  status: CustomerStatus;
  isVIP: boolean;
  tier?: string;
  tags: string[];
  preferences: {
    favoriteCategory?: string;
    preferredColor?: string;
    deliveryLocation?: string;
    specialRequests?: string;
    smokingPreference?: 'non-smoking' | 'smoking';
  };
  notes: string;
  
  // Financial metrics
  lifetimeValue: number;
  totalRentals: number;
  outstandingBalance: number;
  securityDepositsHeld: number;

  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  customFields?: Record<string, any>;
}

export type LeadSource = 
  | 'website' 
  | 'whatsapp' 
  | 'instagram' 
  | 'tiktok' 
  | 'phone' 
  | 'referral' 
  | 'corporate' 
  | 'walk-in' 
  | 'campaign' 
  | 'partner' 
  | 'manual';

export type LeadStatus = 
  | 'new' 
  | 'assigned' 
  | 'contacted' 
  | 'qualified' 
  | 'opportunity' 
  | 'proposal_sent'
  | 'quotation' 
  | 'negotiation' 
  | 'won' 
  | 'lost';

export interface Lead {
  id: string; // LEAD-000001
  fullName: string;
  companyName?: string;
  email: string;
  phone: string;
  source: LeadSource;
  ownerId: string;
  ownerName: string;
  status: LeadStatus;
  estimatedValue: number;
  preferredCategory?: string;
  preferredVehicleId?: string;
  rentalDurationDays?: number;
  expectedStartDate?: string;
  nextFollowUpDate?: string;
  notes: string;
  lostReason?: string;
  aiScore?: number;
  aiSummary?: string;
  customerId?: string; // linked once won/converted
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

export type OpportunityStage = 
  | 'qualified' 
  | 'quotation_sent' 
  | 'negotiation' 
  | 'closing' 
  | 'won' 
  | 'lost';

export interface Opportunity {
  id: string; // OPP-000001
  title: string;
  customerId?: string;
  customerName: string;
  leadId?: string;
  estimatedValue: number;
  probability: number; // 0 - 100
  expectedCloseDate: string;
  stage: OpportunityStage;
  ownerId: string;
  ownerName: string;
  vehicleId?: string;
  quotationId?: string;
  notes: string;
  lostReason?: string;
  source?: 'direct' | 'referral' | 'instagram' | 'corporate' | 'partner' | 'website';
  campaign?: string;
  sourcePage?: string;
  createdAt: string;
  updatedAt: string;
}

export type VehicleStatus = 'available' | 'reserved' | 'rented' | 'maintenance' | 'unavailable';
export type VehicleLifecycleStatus = 'ACTIVE' | 'INACTIVE' | 'SOLD' | 'ARCHIVED' | 'DISPOSED' | 'TRANSFERRED';
export type VehicleOwnershipSource = 'OWNED' | 'LEASED' | 'PARTNER' | 'EXTERNAL' | 'CONSIGNMENT' | 'OTHER';
export type WebsiteVisibility = 'INTERNAL_ONLY' | 'WEBSITE' | 'FEATURED' | 'PRIVATE';
export type VehicleCategory = 'supercar' | 'ultra_luxury_sedan' | 'executive_suv' | 'grand_tourer' | 'exotic_convertible';

export interface PlateAssignmentHistory {
  id: string; // PLT-0001
  plateNumber: string;
  plateCity: string;
  vehicleId: string;
  vehicleVin: string;
  vehicleName: string;
  startDate: string; // ISO date/time
  endDate?: string; // ISO date/time (empty if currently active)
  isCurrent: boolean;
  reason?: string;
  assignedBy: string;
  assignedByName?: string;
  unassignedBy?: string;
  unassignedByName?: string;
  createdAt: string;
}

export interface VehicleTimelineEvent {
  id: string; // EVT-0001
  vehicleId: string;
  date: string;
  action: 'CREATED' | 'PURCHASED' | 'REGISTERED' | 'PLATE_ASSIGNED' | 'PLATE_TRANSFERRED' | 'RENTAL_STARTED' | 'RENTAL_COMPLETED' | 'MAINTENANCE_STARTED' | 'MAINTENANCE_LOGGED' | 'PUBLISHED_TO_WEB' | 'UNPUBLISHED_FROM_WEB' | 'FEATURED_ON_WEB' | 'PRICING_UPDATED' | 'SOLD' | 'ARCHIVED' | 'RESTORED';
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  reason?: string;
  userId: string;
  userName: string;
  userRole?: string;
  createdAt: string;
}

export interface WebsiteVehiclePublication {
  enabled: boolean;
  visibility: WebsiteVisibility;
  featured: boolean;
  publicVehicleId: string; // Stable slug/id for public URLs, e.g. "rolls-royce-spectre-2025-bespoke"
  publicName: string;
  publicNameAr?: string;
  publicDescription: string;
  publicDescriptionAr?: string;
  category: VehicleCategory;
  images: string[];
  features?: string[];
  featuresAr?: string[];
  dailyRate: number; // Public authorized daily rate
  weeklyRate: number; // Public authorized weekly rate
  monthlyRate: number; // Public authorized monthly rate
  deposit: number; // Public authorized security deposit
  mileageAllowance: number; // Daily km allowance (e.g. 250 km)
  slug: string;
  lastPublishedAt?: string;
  lastPublishedBy?: string;
  lastPublishedByName?: string;
}

export interface VehicleSaleRecord {
  saleDate: string;
  salePrice?: number;
  buyerName?: string;
  saleReference?: string;
  reason?: string;
  authorizedBy: string;
  authorizedByName?: string;
  retainedPlateNumber?: string;
  retainedPlateCity?: string;
}

export interface Vehicle {
  id: string; // VEH-0001
  vin: string;
  plateNumber: string;
  plateCity: string; // Dubai, Abu Dhabi, etc.
  make: string; // Rolls-Royce, Ferrari, Bentley, Lamborghini, Mercedes-Maybach
  model: string; // Spectre, 296 GTB, Revuelto, Flying Spur, S680
  year: number;
  trim: string;
  exteriorColor: string;
  interiorColor: string;
  category: VehicleCategory;
  engine: string;
  horsepower: number;
  transmission: string;
  fuelType: 'petrol' | 'electric' | 'hybrid';
  
  mileage: number;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  minDeposit: number;
  
  status: VehicleStatus;
  lifecycleStatus?: VehicleLifecycleStatus; // Default ACTIVE
  ownershipSource?: VehicleOwnershipSource; // Default OWNED
  
  // Public website publishing layer
  publicVehicleId?: string;
  website?: WebsiteVehiclePublication;
  
  // Plate assignment and timeline
  currentPlateAssignmentId?: string;
  plateHistory?: PlateAssignmentHistory[];
  timeline?: VehicleTimelineEvent[];
  
  // Sale & Archive records
  saleRecord?: VehicleSaleRecord;
  archivedAt?: string;
  archivedBy?: string;
  archivedReason?: string;
  
  currentLocation: string;
  currentCustomerId?: string;
  currentContractId?: string;
  nextReservationDate?: string;
  
  insuranceExpiry: string;
  registrationExpiry: string;
  lastMaintenanceMileage: number;
  nextMaintenanceMileage: number;
  maintenanceStatus: 'optimal' | 'due_soon' | 'in_service';
  
  totalRevenue: number;
  totalExpenses: number;
  profitabilityScore: number;
  
  images: string[];
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
  customFields?: Record<string, any>;
}

// ----------------------------------------------------
// Public Website Integration Models (DTOs)
// ----------------------------------------------------
export interface PublicVehicleDTO {
  publicVehicleId: string;
  slug: string;
  make: string;
  model: string;
  year: number;
  trim: string;
  category: VehicleCategory;
  publicName: string;
  publicNameAr?: string;
  publicDescription: string;
  publicDescriptionAr?: string;
  exteriorColor: string;
  interiorColor: string;
  horsepower: number;
  transmission: string;
  fuelType: 'petrol' | 'electric' | 'hybrid';
  images: string[];
  thumbnail: string;
  features: string[];
  featuresAr?: string[];
  pricing: {
    dailyRate: number;
    weeklyRate: number;
    monthlyRate: number;
    deposit: number;
    mileageAllowanceKm: number;
    currency: string;
  };
  featured: boolean;
  visibility: WebsiteVisibility;
  isAvailableNow: boolean;
}

export interface PublicAvailabilityRequest {
  publicVehicleId: string;
  pickupDateTime: string; // ISO
  returnDateTime: string; // ISO
}

export interface PublicAvailabilityResponse {
  publicVehicleId: string;
  isAvailable: boolean;
  reason?: string;
  dailyRate?: number;
  totalDays?: number;
  estimatedTotal?: number;
  deposit?: number;
  currency: string;
  earliestAvailableDate?: string;
}

export interface PublicWebsiteLeadRequest {
  fullName: string;
  email: string;
  phone: string;
  whatsapp?: string;
  preferredVehicle?: string;
  publicVehicleId?: string;
  pickupDateTime?: string;
  returnDateTime?: string;
  message?: string;
  language?: 'en' | 'ar';
  sourcePage?: string;
  campaign?: string;
  idempotencyKey?: string;
}

export interface PublicWebsiteReservationRequest {
  publicVehicleId: string;
  fullName: string;
  email: string;
  phone: string;
  whatsapp?: string;
  pickupDateTime: string;
  returnDateTime: string;
  pickupLocation?: string;
  returnLocation?: string;
  specialRequests?: string;
  sourcePage?: string;
  campaign?: string;
  idempotencyKey?: string;
}

/**
 * Same shape/intent as PublicWebsiteReservationRequest, but for the WhatsApp
 * channel: email is optional (a WhatsApp customer's identity is their phone
 * number, not an email address -- forcing an email here would just push
 * customers to type a throwaway one), and pickupLocation/returnLocation are
 * collected conversationally rather than posted as one form. Handled by the
 * SAME reservation-creation transaction (reserveVehicleSlot) as the website
 * path -- see SplendorConnectEngine.handleWhatsAppReservation().
 */
export interface WhatsAppReservationRequest {
  vehicleId: string; // resolved from the conversation's selected vehicle -- an internal Vehicle.id, not a public slug
  fullName: string;
  phone: string;
  email?: string;
  pickupDateTime: string;
  returnDateTime: string;
  pickupLocation: string;
  returnLocation: string;
  idempotencyKey?: string;
}

export interface WebsiteReconciliationItem {
  websiteVehicleId: string;
  websiteName: string;
  websiteDailyRate: number;
  crmVehicleId?: string;
  crmName?: string;
  crmDailyRate?: number;
  matchStatus: 'EXACT_MATCH' | 'POSSIBLE_MATCH' | 'NO_MATCH' | 'CONFLICT';
  confidence: number; // 0 - 100
  priceDifference: number;
  dataDifference: string[];
  actionRequired: 'NONE' | 'LINK' | 'PRICE_REVIEW' | 'CREATE_CRM_RECORD' | 'RESOLVE_CONFLICT';
}

export type QuotationStatus = 'draft' | 'sent' | 'viewed' | 'negotiation' | 'accepted' | 'rejected' | 'expired';

export interface QuotationExtraService {
  id: string;
  name: string;
  nameAr?: string;
  price: number;
  included: boolean;
}

export interface Quotation {
  id: string; // QT-000001
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleId?: string;
  vehicleName: string;
  category: VehicleCategory;
  startDate: string;
  endDate: string;
  durationDays: number;
  dailyRate: number;
  baseTotal: number;
  extraServices: QuotationExtraService[];
  extraServicesTotal: number;
  discountAmount: number;
  discountPercentage: number;
  // RULE-P01 (Splendor Master Rule Set): a discount above the configured
  // staffDiscountCeilingPercent requires sales-manager (ceo/admin) sign-off.
  // While pending, discountAmount/discountPercentage above reflect the
  // CAPPED (safe, already-authorized) discount actually applied to
  // baseTotal/vatAmount/grandTotal -- requestedDiscountAmount/Percentage
  // preserve what the requester originally asked for, applied in full only
  // once discountApprovalId is approved.
  discountOverridePending?: boolean;
  discountApprovalId?: string;
  requestedDiscountAmount?: number;
  requestedDiscountPercentage?: number;
  vatAmount: number; // 5% UAE VAT
  grandTotal: number;
  securityDeposit: number;
  status: QuotationStatus;
  validUntil: string;
  notes: string;
  termsAndConditions: string;
  ownerId: string;
  ownerName: string;
  reservationId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReservationStatus = 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled' | 'no_show';

export interface Reservation {
  id: string; // RES-000001
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  pickupDateTime: string;
  returnDateTime: string;
  durationDays: number;
  pickupLocation: string;
  returnLocation: string;
  dailyRate: number;
  totalAmount: number;
  depositAmount: number;
  depositStatus: 'pending' | 'collected' | 'refunded';
  status: ReservationStatus;
  ownerId: string;
  ownerName: string;
  contractId?: string;
  quotationId?: string;
  notes: string;
  flightNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export type ContractStatus = 'draft' | 'review' | 'approved' | 'signed' | 'active' | 'completed' | 'cancelled';

export interface VehicleDamageMarker {
  id: string;
  part: 'front_bumper' | 'rear_bumper' | 'hood' | 'roof' | 'left_door' | 'right_door' | 'left_fender' | 'right_fender' | 'windshield' | 'rims' | 'interior';
  severity: 'minor_scratch' | 'deep_scratch' | 'dent' | 'paint_chip' | 'curb_rash';
  notes: string;
  photoUrl?: string;
}

export interface HandoverInspection {
  handoverDateTime: string;
  employeeId: string;
  employeeName: string;
  startMileage: number;
  fuelLevelPercent: number; // 0 - 100
  cleanliness: 'pristine' | 'clean' | 'fair';
  damages: VehicleDamageMarker[];
  accessories: {
    vipKeyFob: boolean;
    manualAndDocs: boolean;
    scentKit: boolean;
    highEndCharger: boolean;
    firstAidKit: boolean;
    safetyTriangle: boolean;
  };
  customerSignatureUrl?: string;
  employeeSignatureUrl?: string;
  notes?: string;
}

export interface ReturnInspection {
  returnDateTime: string;
  employeeId: string;
  employeeName: string;
  endMileage: number;
  fuelLevelPercent: number;
  cleanliness: 'pristine' | 'clean' | 'needs_detailing';
  newDamages: VehicleDamageMarker[];
  accessoriesReturned: {
    vipKeyFob: boolean;
    manualAndDocs: boolean;
    scentKit: boolean;
    highEndCharger: boolean;
    firstAidKit: boolean;
    safetyTriangle: boolean;
  };
  extraKms: number;
  extraKmCharge: number;
  fuelDifferenceCharge: number;
  damageCharge: number;
  lateReturnCharge: number;
  salikTollCharge: number;
  trafficFinesCharge: number;
  totalAdditionalCharges: number;
  finalSettlementBalance: number; // additional charges - held deposit
  customerSignatureUrl?: string;
  employeeSignatureUrl?: string;
  notes?: string;
}

// ----------------------------------------------------
// VEHICLE INSPECTION & PHOTO EVIDENCE (Splendor Master Rule Set, Module 08)
// ----------------------------------------------------
// A standalone entity, deliberately separate from the older embedded
// Contract.handover/returnDetails fields above (which stay exactly as they
// are -- this is additive, not a replacement of a working system). Every
// point in a vehicle's lifecycle that needs documented evidence (before a
// customer ever sees it, at handover, spot-checks during a long rental, at
// return, and a deeper post-return review) is one InspectionType, so the
// same data model, photo pipeline, and damage-comparison workflow serves
// all of them instead of five bespoke ones.

export type InspectionType = 'pre_delivery' | 'handover' | 'in_rental' | 'return' | 'post_return';

export type InspectionStatus = 'draft' | 'completed' | 'voided';

/** Never auto-derived from an image diff -- always a human's explicit judgment call. */
export type DamageClassification = 'pre_existing' | 'new' | 'uncertain';

/** Whether a piece of recorded damage should become a customer charge is a SEPARATE, reviewable decision from recording the damage itself -- recording damage never auto-creates a charge. */
export type DamageLiabilityStatus = 'not_applicable' | 'pending_review' | 'customer_liable' | 'not_customer_liable';

/** Configurable per src/config/inspectionPhotoCategories.ts -- not hardcoded into any single inspection type's validation. */
export type InspectionPhotoCategory = 'front' | 'rear' | 'left' | 'right' | 'interior' | 'dashboard_odometer' | 'fuel_gauge' | 'damage' | 'other';

export interface InspectionPhoto {
  id: string; // INSPPH-000001
  inspectionId: string;
  vehicleId: string;
  contractId?: string;
  category: InspectionPhotoCategory;
  /** Storage path from POST /api/upload (folder 'vehicle-inspections') -- never a raw Storage URL. */
  documentPath: string;
  /** GET /api/documents/file?path=... proxy URL -- what the UI actually renders/fetches. */
  fileUrl: string;
  /** Position within its category, 1-based -- lets the UI show "Front 1 of 3" and preserves capture order. */
  sequence: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  notes?: string;
}

export interface InspectionDamageMarker {
  id: string;
  part: VehicleDamageMarker['part'];
  severity: VehicleDamageMarker['severity'];
  classification: DamageClassification;
  description: string;
  photoIds: string[];
  liabilityStatus: DamageLiabilityStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
}

export interface InspectionCustomerAcknowledgement {
  acknowledgedAt: string;
  /** The customer doesn't hold a login -- this records the name they gave in person/on the phone, witnessed and entered by staff. Not a signature-capture system (out of this mission's scope); see RULE-C04 for the separate, still-unbuilt OTP-signature concept. */
  acknowledgedByName: string;
  witnessedBy: string;
  witnessedByName: string;
  notes?: string;
}

export interface VehicleInspection {
  id: string; // INSP-000001
  vehicleId: string;
  vehicleName: string;
  contractId?: string;
  contractNumber?: string;
  type: InspectionType;
  status: InspectionStatus;
  inspectorId: string;
  inspectorName: string;
  startedAt: string;
  completedAt?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidedByName?: string;
  voidReason?: string;
  mileage?: number;
  fuelLevelPercent?: number;
  exteriorCondition?: 'pristine' | 'clean' | 'fair' | 'needs_detailing';
  interiorCondition?: 'pristine' | 'clean' | 'fair' | 'needs_detailing';
  damages: InspectionDamageMarker[];
  /** Snapshotted at creation from the current config default for this type -- so changing the default later never rewrites what a past inspection actually required. */
  requiredPhotoCategories: InspectionPhotoCategory[];
  /** Embedded, not a separate collection -- one inspection's photos are always read/written together with the inspection itself, so there's no benefit to a second collection and a real cost in cross-document consistency. */
  photos: InspectionPhoto[];
  /** e.g. a 'return' inspection points back at its 'handover' counterpart so the UI can render both photo sets and damage lists side by side for a human to compare. */
  compareAgainstInspectionId?: string;
  customerAcknowledgement?: InspectionCustomerAcknowledgement;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------
// WHATSAPP CONVERSATIONAL COMMERCE (Splendor Master Rule Set, Module 10)
// ----------------------------------------------------
// A real, persisted conversation state machine per customer phone number --
// distinct from `whatsapp_inbound_events` (the low-level, append-only raw
// webhook log used purely for delivery idempotency/audit) and from
// `WhatsAppMessageLogEntry` (the Control Center's outbound broadcast log).
// This is the CRM's own record of "where is this customer in the
// conversation," so the bot and a human agent are always looking at the
// exact same state.

export type WhatsAppConversationState =
  | 'NEW'
  | 'BROWSING'
  | 'VEHICLE_SELECTED'
  | 'DATES_PENDING'
  | 'LOCATION_PENDING'
  | 'RESERVATION_CONFIRM'
  | 'RESERVATION_CREATED'
  | 'HUMAN_ASSISTANCE'
  | 'CLOSED';

export type WhatsAppConversationPriority = 'normal' | 'high' | 'vip';

export type WhatsAppCustomerMatchStatus = 'matched' | 'unmatched' | 'ambiguous_review';

/** In-progress booking details the customer is building through the chat -- never itself a Reservation; only handWhatsAppReservation() in splendorConnectEngine.ts, calling the real reservation engine, can turn this into one. */
export interface WhatsAppConversationDraft {
  vehicleId?: string;
  vehiclePublicId?: string;
  vehicleName?: string;
  category?: VehicleCategory;
  pickupDateTime?: string;
  returnDateTime?: string;
  pickupLocation?: string;
  returnLocation?: string;
  fullName?: string;
  email?: string;
}

export interface WhatsAppConversation {
  id: string; // normalized phone (digits only), also the Firestore doc id
  phone: string;
  customerId?: string;
  customerName?: string;
  customerMatchStatus: WhatsAppCustomerMatchStatus;
  state: WhatsAppConversationState;
  /** false once a human has taken over -- the bot goes silent (no automated replies) until a staff member explicitly hands the conversation back. */
  botActive: boolean;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  priority: WhatsAppConversationPriority;
  tags: string[];
  draft: WhatsAppConversationDraft;
  lastReservationId?: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  lastMessagePreview?: string;
  /** true when the last inbound message has not yet been seen by staff (cleared by GET /api/whatsapp/conversations/:phone). Irrelevant while botActive, since the bot is already handling it. */
  unread: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One message in a conversation's `whatsapp_conversations/{phone}/messages` subcollection -- a subcollection rather than an embedded array (unlike InspectionPhoto[] above) because a chat thread grows unboundedly over a customer's lifetime, while an inspection's photo set is small and bounded by definition. */
export interface WhatsAppConversationMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'interactive' | 'image' | 'document' | 'system';
  body: string;
  sentBy?: string; // 'bot', or a staff uid for a manual reply
  sentByName?: string;
  timestamp: string;
}

export interface Contract {
  id: string; // CON-000001
  contractNumber: string;
  reservationId?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehicleVin: string;
  
  startDateTime: string;
  endDateTime: string;
  pickupLocation: string;
  returnLocation: string;
  dailyRate: number;
  rentalTotal: number;
  vatAmount: number;
  grandTotal: number;
  depositAmount: number;
  mileageAllowancePerDay: number; // default 200 km/day -- editable per contract
  extraKmRate: number; // e.g. 15 AED / km
  depositReleaseDays: number; // default 21 days -- editable per contract
  
  status: ContractStatus;
  handover?: HandoverInspection;
  returnDetails?: ReturnInspection;
  
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  depositStatus: 'pending' | 'collected' | 'held' | 'applied' | 'partially_refunded' | 'refunded';
  
  notes: string;
  termsAccepted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ChargeType = 
  | 'extra_km' 
  | 'extra_hour' 
  | 'late_return' 
  | 'fuel' 
  | 'damage' 
  | 'salik' 
  | 'traffic_fine' 
  | 'delivery' 
  | 'collection' 
  | 'vip_concierge' 
  | 'other';

export interface AdditionalCharge {
  id: string; // CHG-000001
  type: ChargeType;
  amount: number;
  vatAmount: number; // 5%
  totalAmount: number;
  relatedContractId?: string;
  relatedReservationId?: string;
  customerId: string;
  customerName: string;
  vehicleId?: string;
  vehiclePlate?: string;
  description: string;
  evidenceUrl?: string;
  approvalStatus: 'approved' | 'pending_approval' | 'rejected';
  approvedBy?: string;
  createdBy: string;
  timestamp: string;
  /** Set once this charge has been used to justify a deposit deduction (Splendor Procurement rule: no direct deduction from a deposit -- a charge/claim must exist and be approved first). Prevents the same charge from being deducted twice. */
  deductedFromDepositId?: string;
}

export type DepositStatus = 'collected' | 'held' | 'applied' | 'partially_refunded' | 'refunded';

export interface Deposit {
  id: string; // DEP-000001
  customerId: string;
  customerName: string;
  contractId?: string;
  reservationId?: string;
  amount: number;
  appliedAmount: number;
  refundedAmount: number;
  balance: number;
  paymentMethod: PaymentMethod;
  status: DepositStatus;
  holdReleaseDueDate: string;
  appliedReason?: string;
  refundDate?: string;
  transactionRef?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'online_link' | 'corporate_credit';
export type PaymentStatus = 'received' | 'validated' | 'allocated' | 'refunded';

export interface Payment {
  id: string; // PAY-000001
  customerId: string;
  customerName: string;
  contractId?: string;
  invoiceId?: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  referenceNumber: string;
  allocatedTo: Array<{
    invoiceId: string;
    amount: number;
  }>;
  receivedBy: string;
  receivedAt: string;
  receiptNumber: string;
  notes: string;
  createdAt: string;
}

export interface Invoice {
  id: string; // INV-000001
  customerId: string;
  customerName: string;
  contractId?: string;
  reservationId?: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  vatAmount: number; // 5%
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  status: 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface StatementEntry {
  id: string;
  date: string;
  type: 'invoice' | 'payment' | 'credit' | 'debit' | 'deposit_in' | 'deposit_refund' | 'adjustment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  totalInvoiced: number;
  totalPaid: number;
  totalDepositsHeld: number;
  closingBalance: number;
  entries: StatementEntry[];
  generatedAt: string;
}

export type BankTransactionStatus = 
  | 'unmatched' 
  | 'suggested_match' 
  | 'matched' 
  | 'partially_matched' 
  | 'needs_review' 
  | 'approved' 
  | 'rejected'
  | 'reconciled';

export interface BankTransaction {
  id: string; // BTX-0001
  batchId: string;
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  suggestedMatch?: {
    customerId?: string;
    customerName?: string;
    invoiceId?: string;
    contractId?: string;
    confidence: number; // e.g. 96
    rationale: string;
    rationaleAr?: string;
  };
  matchedRecord?: {
    type: 'invoice' | 'deposit' | 'payment';
    id: string;
    matchedBy: string;
    matchedAt: string;
  };
  status: BankTransactionStatus;
  reconciled: boolean;
  notes?: string;
  // FIN-002: what this received amount actually represents. Required at
  // reconcile time (never guessed); reclassifiable afterward via
  // POST /api/bank-transactions/:id/reclassify, which never touches
  // paidAmount/balanceDue -- classification is metadata about the money,
  // not a change to the money itself.
  receivedAmountClassification?: ReceivedAmountClassification;
  classificationHistory?: ReceivedAmountClassificationEvent[];
}

export interface BankImportBatch {
  id: string; // BATCH-001
  fileName: string;
  bankName: string;
  accountNumber: string;
  statementPeriod: string;
  uploadedBy: string;
  uploadedAt: string;
  totalTransactions: number;
  matchedCount: number;
  unmatchedCount: number;
  duplicateCount: number;
  status: 'processing' | 'ready_for_review' | 'partially_reconciled' | 'reconciled';
}

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskCategory = 'lead_follow_up' | 'customer_follow_up' | 'quotation_follow_up' | 'contract_renewal' | 'payment_reminder' | 'document_expiry' | 'vehicle_maintenance' | 'general';

export interface CRMTask {
  id: string; // TSK-000001
  title: string;
  titleAr?: string;
  description: string;
  category: TaskCategory;
  relatedEntityType?: 'customer' | 'lead' | 'opportunity' | 'quotation' | 'reservation' | 'contract' | 'vehicle';
  relatedEntityId?: string;
  relatedEntityName?: string;
  customerName?: string;
  assignedToId: string;
  assignedToName: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type Task = CRMTask;

export type CommunicationChannel = 'whatsapp' | 'email' | 'sms' | 'phone_call' | 'internal_note' | 'system_alert';

export interface Communication {
  id: string;
  channel: CommunicationChannel;
  direction: 'inbound' | 'outbound' | 'internal';
  sender: string;
  recipient: string;
  subject?: string;
  content: string;
  contentAr?: string;
  relatedEntityType: 'customer' | 'lead' | 'opportunity' | 'reservation' | 'contract' | 'vehicle';
  relatedEntityId: string;
  timestamp: string;
  createdById: string;
  createdByName: string;
  deliveryStatus?: 'sent' | 'delivered' | 'read' | 'failed';
}

export interface CRMDocument {
  id: string; // DOC-000001
  title: string;
  category: 'contract' | 'quotation' | 'invoice' | 'receipt' | 'customer_id' | 'driving_license' | 'vehicle_reg' | 'vehicle_insurance' | 'inspection_sheet' | 'statement' | 'other';
  fileName: string;
  fileSize: string;
  fileType: string;
  fileUrl: string;
  relatedEntityType: 'customer' | 'vehicle' | 'contract' | 'reservation' | 'quotation' | 'invoice';
  relatedEntityId: string;
  relatedEntityName?: string;
  expiryDate?: string;
  version: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  nameAr: string;
  category: 'quotation' | 'rental_contract' | 'handover_sheet' | 'return_sheet' | 'invoice' | 'receipt' | 'customer_statement';
  content: string;
  contentAr: string;
  variables: string[]; // e.g. ['customer_name', 'vehicle_model', 'start_date', 'grand_total']
  isDefault: boolean;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'status_change' | 'approval' | 'refund' | 'reconcile' | 'reclassify' | 'merge' | 'rule_change' | 'kill_switch' | 'approval_decision';
  previousValue?: string;
  newValue?: string;
  reason?: string;
  ipAddress?: string;
  timestamp: string;
  /** Tamper-evidence hash chain (RULE-A01) -- see src/server/auditIntegrity.ts. Absent on entries written before this feature existed; those are treated as unverifiable, not tampered. */
  contentHash?: string;
  previousHash?: string;
}

// ----------------------------------------------------
// GOVERNANCE & APPROVAL ENGINE (Phase 23)
// ----------------------------------------------------
// Four tiers, in increasing order of how carefully a change must be
// controlled:
//  - system_configuration: read-only visibility of a security/integrity
//    constant that lives in code on purpose (role ranks, password policy,
//    document-path allowlists, ...). ALWAYS editable:false -- no role, not
//    even CEO, can change it through this engine. Existing here only so the
//    governance dashboard has full visibility, not just over financial data.
//  - business_rule: a normal operational threshold a manager should be able
//    to tune (mileage allowance, notification windows, ...). Direct-edit is
//    restricted to the same roles already trusted with pricing elsewhere in
//    the app (see RULE_TIER_DIRECT_EDIT_ROLES) and is versioned + audited,
//    but does not require a second approver.
//  - sensitive_rule: a threshold whose change should never take effect from
//    a single person's action alone -- proposing a change creates an
//    ApprovalRequest; a DIFFERENT authorized person must decide it before
//    the new value ever applies (Four-Eyes / Segregation of Duties).
//  - emergency_rule: a kill-switch-style on/off control for one category of
//    high-risk operation. Restricted to CEO/Admin, applies immediately (an
//    incident response control that waited for a second approver would
//    defeat its own purpose), but every flip is fully audited with a
//    mandatory reason.
export type BusinessRuleTier = 'system_configuration' | 'business_rule' | 'sensitive_rule' | 'emergency_rule';
export type BusinessRuleValueType = 'number' | 'boolean' | 'string';

export interface BusinessRuleVersion {
  version: number;
  value: number | boolean | string | null;
  changedBy: string;
  changedByName: string;
  changedByRole: string;
  changedAt: string;
  reason: string;
  approvalRequestId?: string;
  effectiveAt?: string; // when set and in the future, this version is SCHEDULED, not yet live -- see promoteScheduledRuleVersions()
}

export interface BusinessRule {
  id: string; // the rule key, e.g. 'notificationExpiryLookaheadDays'
  label: string;
  labelAr?: string;
  description: string;
  tier: BusinessRuleTier;
  valueType: BusinessRuleValueType;
  value: number | boolean | string | null;
  min?: number;
  max?: number;
  /**
   * false = this entry is catalog-visibility only and can NEVER be changed
   * through this engine, regardless of role or tier -- used for
   * system_configuration entries (security/integrity constants) and for
   * "fast-follow" mirror entries that still live behind their own existing
   * route (see sourceNote).
   */
  editable: boolean;
  version: number;
  history: BusinessRuleVersion[]; // append-only; a rollback appends a new version pointing back to an old value, it never rewrites history
  updatedBy?: string;
  updatedByName?: string;
  updatedByRole?: string;
  updatedAt?: string;
  /** Where this rule used to be (or still is) hardcoded/managed, for traceability. */
  sourceNote?: string;
}

export type ApprovalRequestType = 'rule_change';
export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  type: ApprovalRequestType;
  entityType: string; // 'BusinessRule'
  entityId: string; // the rule key
  fieldPath?: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: string;
  reason: string; // mandatory -- "mandatory reason for overrides"
  beforeValue: number | boolean | string | null;
  afterValue: number | boolean | string | null;
  status: ApprovalRequestStatus;
  decidedBy?: string;
  decidedByName?: string;
  decidedByRole?: string;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
}

// ----------------------------------------------------
// OPERATIONAL MONITORING & DEAD-LETTER QUEUE (Phase 23.7)
// ----------------------------------------------------
export interface HealthCheckResult {
  checkedAt: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    api: { status: 'healthy'; uptimeSeconds: number; nodeVersion: string; memoryUsedMb: number; runtime: 'vercel' | 'node' };
    firestore: { status: 'healthy' | 'unhealthy'; latencyMs?: number; error?: string };
    whatsapp: { status: 'configured' | 'not_configured' | 'degraded'; recentFailureCount: number };
    ai: { status: 'configured' | 'not_configured' };
    backgroundJobs: { status: 'healthy' | 'stale' | 'never_run'; lastRunAt?: string; alertsFired?: number; staleSinceHours?: number };
    deadLetterQueue: { status: 'healthy' | 'has_unresolved'; unresolvedCount: number };
  };
}

/**
 * A background operation (currently: a WhatsApp send) that failed and
 * needs a human or a retry to resolve it, instead of disappearing into a
 * log line no one is watching. Lifecycle: created already-failed and
 * -recorded (a dead-letter entry only ever exists because something
 * failed) -> alertedAt is set the first time the operational-health sweep
 * notices a non-empty queue and successfully raises it -> retryable is
 * implicit (true whenever status !== 'resolved') -> resolved either by a
 * successful retry or a human explicitly closing it out with a note.
 */
export interface FailedJob {
  id: string;
  jobType: 'whatsapp_send';
  status: 'failed' | 'alerted' | 'resolved';
  payload: Record<string, unknown>;
  error: string;
  attempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  alertedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolutionNote?: string;
}

export interface CustomFieldDefinition {
  id: string;
  entityType: 'customer' | 'lead' | 'vehicle' | 'contract' | 'reservation';
  label: string;
  labelAr: string;
  key: string;
  type: 'text' | 'number' | 'date' | 'dropdown' | 'boolean' | 'currency' | 'email' | 'phone';
  options?: string[];
  required: boolean;
  active: boolean;
}

export interface NumberingConfig {
  entity: string;
  prefix: string;
  digits: number;
  nextNumber: number;
  sample: string;
}

export interface SystemHealth {
  status: 'healthy' | 'attention_required' | 'critical';
  databaseLatencyMs: number;
  activeSessions: number;
  apiAvailabilityPercent: number;
  failedJobsCount: number;
  failedImportsCount: number;
  pendingReconciliationsCount: number;
  lastBackupAt: string;
  uptimeSeconds: number;
}

export interface NotificationItem {
  id: string;
  type: 'critical' | 'important' | 'informational';
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  link?: string;
  read: boolean;
  timestamp: string;
}

// ----------------------------------------------------
// Tolls (Salik / Darb) & Parking
// ----------------------------------------------------
// Shape agreed with the business owner: one unified transaction type across
// all three (discriminated by `type`), imported in bulk from a Salik/Darb
// statement or entered manually, matched to the contract/customer who was
// renting the vehicle at the time, and billed at a fixed customer rate
// regardless of the actual (often variable) cost to the company. See
// src/lib/tollCalculations.ts for the pricing rules themselves.
export type TollType = 'salik' | 'darb' | 'parking';
export type TollSource = 'manual' | 'excel_import' | 'pdf_import';

export interface TollTransaction {
  id: string; // TOL-000001
  type: TollType;
  date: string; // trip/parking date, ISO (yyyy-mm-dd)
  time?: string; // trip time as shown on the statement, e.g. "02:54 PM"
  locationName: string; // toll gate name, or parking location for 'parking'
  direction?: string; // Salik/Darb "Direction/Zone", e.g. "To Abu Dhabi"
  tagNumber?: string; // Salik/Darb tag number, if present
  plateNumber?: string; // vehicle plate exactly as shown on the statement
  transactionRef?: string; // the provider's own transaction ID, if present
  isPeakTime?: boolean; // informational tag only -- not used in the profit calc, since the imported actual cost already reflects it

  actualCompanyCost: number; // real cost to Splendor for this transaction (VAT-inclusive where applicable)
  customerBillingRate: number; // fixed rate billed to the customer: Salik 7.5, Darb 6, Parking base + 10%
  totalChargedToCustomer: number; // usually equals customerBillingRate; kept distinct for manual overrides/waivers
  netProfit: number; // totalChargedToCustomer - actualCompanyCost

  parkingBaseAmount?: number; // 'parking' only: the entered base amount before the 10% markup

  vehicleId?: string; // resolved from plateNumber once matched to a vehicle
  contractId?: string; // which rental this belongs to -- set at manual entry, or once an imported row is matched to a contract
  reservationId?: string;
  customerId?: string;
  customerName?: string;

  isPaid: boolean; // has this been collected from the customer
  billedChargeId?: string; // set once rolled into an AdditionalCharge/invoice

  discountAmount?: number; // flat AED discount off the customer billing rate (Admin/Finance/Sales only)
  discountPercent?: number; // percent discount off the customer billing rate (Admin/Finance/Sales only)
  rateOverridden?: boolean; // true when actualCompanyCost and/or customerBillingRate were manually entered/edited instead of using the current default rate -- kept for audit clarity

  source: TollSource;
  importBatchId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialSummary {
  totalCost: number;
  totalCollected: number;
  totalNetProfit: number;
  count: number;
}

/**
 * The company's current default toll/parking rates. Not hardcoded forever --
 * Salik/Darb/parking pricing can rise or fall over time, so these live as an
 * editable record (one row, id 'default') rather than fixed constants.
 * Editing this is restricted to CEO/Admin/Finance/Sales (see
 * TOLL_PRICING_EDIT_ROLES in src/config/permissions.ts). Individual manual
 * entries can still override these defaults per-transaction for the same
 * roles -- see TollTransaction.rateOverridden.
 */
export interface TollPricingConfig {
  id: 'default';
  salikCustomerRate: number; // flat AED billed to the customer per Salik transaction (default 7.5)
  darbCompanyCost: number; // fixed AED cost to the company per Darb transaction, excl. VAT (default 4)
  darbCustomerRate: number; // fixed AED billed to the customer per Darb transaction, incl. VAT (default 6)
  parkingMarkupPercent: number; // markup applied over the entered parking base amount (default 10)
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: string;
}

export interface TollImportBatch {
  id: string; // TOLBATCH-0001
  type: TollType;
  fileName: string;
  fileFormat: 'excel' | 'pdf' | 'csv';
  accountNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  totalTransactions: number;
  matchedCount: number; // rows auto-linked to a contract/customer by plate + date
  unmatchedCount: number; // rows still needing manual assignment
  totalActualCost: number;
  totalCustomerBilling: number;
  totalTopUps?: number; // account reload/payment total, read from the statement's own summary section when present
  uploadedBy: string;
  uploadedAt: string;
  status: 'processed' | 'failed';
  errorMessage?: string;
}

// ----------------------------------------------------
// Global Notification & WhatsApp Control Center
// ----------------------------------------------------
// One toggle-able "event" per real action/milestone across the CRM. The
// static list of events (key/category/labels) lives in
// src/config/notificationEvents.ts, shared by client and server, so both
// always agree on what "customer_blocklisted" etc. means. What's stored
// here is only the per-event CONFIG (on/off, who gets it).
export type NotificationCategory = 'customer' | 'contract' | 'fleet' | 'financial' | 'tolls' | 'system';

export interface NotificationEventConfig {
  eventKey: string;
  enabled: boolean;
  /** "General WhatsApp Group Broadcast" toggle from the spec. The WhatsApp
   *  Cloud API has no concept of posting into a group from a business
   *  number, so this fans out to every number listed in the
   *  WHATSAPP_GROUP_RECIPIENTS env var -- functionally identical to
   *  broadcasting into a group of those people. */
  broadcastToGroup: boolean;
  /** Specific staff (by User.id) who should get this event on WhatsApp, independent of the group toggle. */
  staffRecipientIds: string[];
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: string;
}

/** Admin-authored ad-hoc notification/task, routed to the group and/or specific staff -- the "manual custom-reminder creator" from the spec. */
export interface CustomReminder {
  id: string; // REM-000001
  title: string;
  message: string;
  broadcastToGroup: boolean;
  staffRecipientIds: string[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  /** 'not_configured' means WhatsApp credentials aren't set yet -- the reminder is still saved, just not actually sendable. */
  status: 'sent' | 'partially_sent' | 'failed' | 'not_configured';
}

/** One row per actual WhatsApp send attempt (real or blocked-by-not-configured), for the Control Center's activity log. */
export interface WhatsAppMessageLogEntry {
  id: string; // WA-000001
  eventKey?: string; // absent for a custom reminder
  reminderId?: string;
  recipientType: 'group' | 'staff' | 'customer';
  recipientLabel: string;
  recipientPhone?: string;
  message: string;
  status: 'sent' | 'failed' | 'not_configured';
  errorMessage?: string;
  createdAt: string;
}

/** On/off switch for one customer-facing WhatsApp message type (Salik/fine charges, payment receipts, payment due/overdue reminders, contract-expiring reminders, extension notices). No staff/group routing -- the recipient is always the customer on the specific record. */
export interface CustomerNotificationConfig {
  eventKey: string;
  enabled: boolean;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: string;
}

// ============================================================================
// PROCUREMENT & SUPPLIER MANAGEMENT -- Splendor Procurement, Phase 1
// ============================================================================
// One closed-scope build covering: Supplier -> Purchase Order -> Quotes ->
// Approval -> Payment -> Receiving -> Invoice -> Settlement -> Vehicle/
// Operation -> Customer (where applicable) -> TARS (where applicable) ->
// Expenses -> Balances -> Audit Trail. Every fixed dropdown list below that
// the spec gave verbatim is implemented as given; a short number of lists
// the spec required to be "fixed" without enumerating every value are a
// clearly-labeled configurable starter set, not a final business decision --
// see the Phase 1 closure report's "decisions needing approval" section.

// ---- Supplier operation types (configurable from Settings) ----
export type SupplierOperationTypeKey =
  | 'vehicle_supply_rental' | 'spare_parts' | 'maintenance_repair' | 'tires'
  | 'operating_materials' | 'equipment' | 'services' | 'other_purchases' | 'other';

export interface SupplierOperationTypeDef {
  key: SupplierOperationTypeKey;
  labelEn: string;
  labelAr: string;
  active: boolean;
}

// ---- Suppliers ----
export type SupplierFieldTier = 'core_mandatory' | 'required_to_complete' | 'optional';
export type SupplierStatus = 'active' | 'pending_completion' | 'inactive';

export interface SupplierBankDetails {
  bankName?: string;
  accountName?: string;
  iban?: string;
  swiftCode?: string;
}

export interface Supplier {
  id: string; // SUP-000001
  legalName: string;
  tradeName?: string;
  tradeLicenseNumber?: string;
  taxRegistrationNumber?: string;
  contactPersonName?: string;
  contactPersonTitle?: string;
  phone?: string;
  email?: string;
  address?: string;
  bankDetails?: SupplierBankDetails;
  documentIds?: string[];
  agreementDocumentIds?: string[];
  policiesNotes?: string;
  status: SupplierStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  customFields?: Record<string, any>;
}

export type SupplierFieldKey =
  | 'legalName' | 'tradeLicenseNumber' | 'phone' | 'taxRegistrationNumber' | 'bankDetails'
  | 'email' | 'address' | 'tradeName' | 'documentIds' | 'agreementDocumentIds' | 'policiesNotes';

export interface SupplierEligibilityResult {
  supplierId: string;
  operationType: SupplierOperationTypeKey;
  status: 'met' | 'non_blocking_gap' | 'blocking_gap';
  missingFields: SupplierFieldKey[];
}

export interface SupplierCompletenessSummary {
  supplierId: string;
  supplierName: string;
  completionPercent: number;
  missingRequiredToComplete: SupplierFieldKey[];
  presentFields: SupplierFieldKey[];
}

// ---- Supplier quotes / offers ----
export type QuoteSource = 'official_quote' | 'whatsapp' | 'email' | 'phone_call' | 'prior_agreement' | 'other';

export interface SupplierQuote {
  id: string; // QTV-000001
  purchaseOrderId?: string;
  supplierId: string;
  supplierName: string;
  source: QuoteSource;
  sourceOther?: string;
  contactInfo?: string;
  /** Mandatory alongside phoneContactPersonPhone when source is 'phone_call' -- the spec requires the responsible supplier contact's name and number to be captured for a verbal quote. The date/time of capture is `createdAt`. */
  phoneContactPersonName?: string;
  phoneContactPersonPhone?: string;
  price: number;
  terms?: string;
  documentIds?: string[];
  isSelected: boolean;
  selectedBy?: string;
  selectedByName?: string;
  selectedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Purchase Orders ----
export type PurchaseOrderKind = 'regular' | 'retroactive';
export type PurchaseOrderStatus =
  | 'draft' | 'pending_approval' | 'approved'
  | 'partially_fulfilled' | 'fulfilled'
  | 'partially_cancelled' | 'cancelled';

// The spec requires "a fixed list" of retroactive-PO reasons but names only
// "emergency purchase" explicitly -- the rest is a sensible configurable
// starter set (Settings-editable, same pattern as SupplierOperationTypeDef),
// not a final business decision. See the closure report.
export type RetroactivePOReason =
  | 'emergency_purchase' | 'invoice_received_before_po' | 'price_confirmed_after_delivery'
  | 'verbal_agreement_formalized_late' | 'other';

export interface PurchaseOrderLineItemCancellation {
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  financialImpact?: string;
  status: 'pending_approval' | 'approved' | 'rejected';
}

export interface PurchaseOrderLineItem {
  id: string;
  operationType: SupplierOperationTypeKey;
  operationTypeOther?: string;
  description: string;
  vehicleDescription?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: 'pending' | 'received' | 'partially_cancelled' | 'cancelled';
  operationId?: string;
  cancellation?: PurchaseOrderLineItemCancellation;
}

export interface PurchaseOrderAmendmentRequest {
  id: string; // POAR-000001
  purchaseOrderId: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  reason: string;
  proposedLineItems: PurchaseOrderLineItem[];
  proposedTotalValue: number;
  status: 'pending_approval' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  resultingVersion?: number;
}

export interface PurchaseOrderVersionSnapshot {
  version: number;
  lineItems: PurchaseOrderLineItem[];
  totalValue: number;
  requiredApprovalTier: string;
  changedBy: string;
  changedByName: string;
  changedAt: string;
  reason: string;
  amendmentRequestId?: string;
}

export interface PurchaseOrderCancellation {
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  financialImpact?: string;
  status: 'pending_approval' | 'approved' | 'rejected';
}

export interface PurchaseOrder {
  id: string; // PO-SCR-100, PO-SCR-101, ...
  kind: PurchaseOrderKind;
  retroactiveReason?: RetroactivePOReason;
  retroactiveReasonOther?: string;
  actualOperationDate?: string;
  supplierId: string;
  supplierName: string;
  lineItems: PurchaseOrderLineItem[];
  totalValue: number;
  requiredApprovalTier: string;
  status: PurchaseOrderStatus;
  requestedBy: string;
  requestedByName: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  version: number;
  history: PurchaseOrderVersionSnapshot[];
  amendmentRequestIds?: string[];
  cancellation?: PurchaseOrderCancellation;
  createdAt: string;
  updatedAt: string;
}

// ---- Per-line "Operation" -- the unified reference id everything auto-links to ----
export type ProcurementOperationStatus = 'open' | 'in_progress' | 'closed' | 'cancelled';

export interface ProcurementOperation {
  id: string; // OPS-000001
  purchaseOrderId: string;
  lineItemId: string;
  supplierId: string;
  supplierName: string;
  operationType: SupplierOperationTypeKey;
  description: string;
  status: ProcurementOperationStatus;
  vehicleId?: string;
  supplierInvoiceIds: string[];
  supplierPaymentIds: string[];
  supplierAgreementDocumentIds: string[];
  customerContractId?: string;
  documentIds: string[];
  tarsRecordId?: string;
  receivingRecordId?: string;
  totalCost: number;
  totalRevenue: number;
  profitLoss: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Procurement payment methods (spec's own fixed list, separate from the existing customer-facing PaymentMethod) ----
export type ProcurementPaymentMethod =
  | 'cash' | 'bank_card' | 'bank_transfer' | 'cheque' | 'electronic_payment' | 'employee_custody' | 'other';

// ---- Supplier payments: post-verification vs advance ----
export type SupplierPaymentTrack = 'post_verification' | 'advance';
export type SupplierPaymentStatus = 'pending_approval' | 'approved' | 'paid' | 'rejected';

export interface SupplierPaymentRequest {
  id: string; // SPR-000001
  purchaseOrderId: string;
  operationId?: string;
  supplierId: string;
  supplierName: string;
  track: SupplierPaymentTrack;
  amount: number;
  paymentMethod: ProcurementPaymentMethod;
  paymentMethodOther?: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  reason?: string;
  status: SupplierPaymentStatus;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  paidAt?: string;
  isIncreaseOfRequestId?: string;
}

export interface AdvanceSettlement {
  id: string; // ADVS-000001
  purchaseOrderId: string;
  operationId?: string;
  supplierId: string;
  originalAdvanceAmount: number;
  amountDueToSupplierPerCancellationTerms: number;
  amountToBeRefunded: number;
  deductionsOrFees: number;
  netRefund: number;
  refundStatus: 'pending' | 'in_progress' | 'completed';
  reason: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
}

// ---- Balances: opening balances, offsetting, non-offsettable states ----
export type BalanceDirection = 'owed_to_us' | 'owed_by_us' | 'zero';
export type BalanceOffsetEligibility =
  | 'offsettable' | 'not_offsettable_dispute' | 'not_offsettable_investigation' | 'not_offsettable_unsettled';

export interface PartyOpeningBalance {
  id: string; // OBAL-000001
  partyType: 'supplier' | 'customer';
  partyId: string;
  amount: number;
  direction: BalanceDirection;
  offsetEligibility: BalanceOffsetEligibility;
  notes?: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
}

export interface OffsetRequest {
  id: string; // OFS-000001
  partyType: 'supplier' | 'customer';
  partyId: string;
  balanceBefore: number;
  offsetAmount: number;
  linkedOperationIds: string[];
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  balanceAfter?: number;
}

// ---- Customer disputed amounts / credit balances / refunds ----
export interface CustomerDisputedAmount {
  id: string; // DISP-000001
  customerId: string;
  amount: number;
  relatedChargeId?: string;
  relatedContractId?: string;
  status: 'open' | 'under_review' | 'resolved_upheld' | 'resolved_waived' | 'resolved_partial';
  objectionReason: string;
  raisedAt: string;
  resolution?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
}

export type CustomerCreditBalanceSource = 'cancellation_refund_due' | 'overpayment' | 'goodwill_adjustment' | 'other';

export interface CustomerCreditBalance {
  id: string; // CCB-000001
  customerId: string;
  amount: number;
  originalAmount: number;
  source: CustomerCreditBalanceSource;
  sourceOther?: string;
  relatedContractId?: string;
  status: 'open' | 'partially_used' | 'refunded' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface CustomerRefundRequest {
  id: string; // CREF-000001
  customerId: string;
  creditBalanceId?: string;
  amount: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executed';
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  executedBy?: string;
  executedByName?: string;
  executedAt?: string;
  paymentMethod?: ProcurementPaymentMethod;
}

export type ReceivedAmountClassification =
  | 'settlement' | 'advance_payment' | 'security_deposit' | 'credit_balance'
  | 'settlement_adjustment' | 'other_approved' | 'unclassified';

// FIN-002: the runtime-checkable form of the type above -- used by the
// server to validate an incoming classification value (never guessed;
// 'unclassified' is a real, explicit choice a reconciler makes, not a
// silent default for a missing field) and by the UI to render the
// dropdown. Wired into POST /api/bank-transactions/:id/reconcile and
// /reclassify -- see server.ts.
export const RECEIVED_AMOUNT_CLASSIFICATIONS: ReceivedAmountClassification[] = [
  'settlement', 'advance_payment', 'security_deposit', 'credit_balance',
  'settlement_adjustment', 'other_approved', 'unclassified'
];

export interface ReceivedAmountClassificationEvent {
  classification: ReceivedAmountClassification;
  setBy: string;
  setByName: string;
  setAt: string;
  reason?: string; // required for a reclassification, not for the initial classification at reconcile time
}

// ---- Debts / charges (the spec's own fixed list -- distinct from the existing ChargeType) ----
export type DebtType =
  | 'late_fee' | 'traffic_fine' | 'salik' | 'damage' | 'fuel_shortage'
  | 'cleaning' | 'delivery_collection' | 'other_approved' | 'other';

export interface DebtSettlementMovement {
  id: string;
  method: ProcurementPaymentMethod;
  methodOther?: string;
  amount: number;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
  correctedFromMovementId?: string;
  reversedMovementId?: string;
  isReversal?: boolean;
}

export interface DebtCorrection {
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  amountBefore: number;
  amountAfter: number;
  status: 'pending_approval' | 'approved' | 'rejected';
}

export interface DebtCancellation {
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  status: 'pending_approval' | 'approved' | 'rejected';
}

export interface Debt {
  id: string; // DBT-000001
  customerId: string;
  customerName: string;
  type: DebtType;
  typeOther?: string;
  description: string;
  evidenceDocumentIds?: string[];
  originalAmount: number;
  settlements: DebtSettlementMovement[];
  paidAmount: number;
  remainingAmount: number;
  status: 'open' | 'partially_paid' | 'paid' | 'cancelled';
  corrections?: DebtCorrection[];
  cancellation?: DebtCancellation;
  relatedContractId?: string;
  relatedOperationId?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Employee custody / float ----
export interface EmployeeCustodyMovement {
  id: string;
  type: 'opening_balance' | 'amount_issued' | 'expense' | 'amount_returned' | 'settlement';
  amount: number;
  relatedExpenseId?: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
  note?: string;
}

export interface EmployeeCustody {
  id: string; // FLOAT-000001
  employeeId: string;
  employeeName: string;
  movements: EmployeeCustodyMovement[];
  currentBalance: number;
  createdAt: string;
  updatedAt: string;
}

export type EmployeeExpenseStatus = 'pending_review' | 'approved' | 'rejected';
export type EmployeeExpenseFundingSource = 'custody_float' | 'employee_own_money';

export interface EmployeeExpenseRejection {
  reason: string;
  rejectedBy: string;
  rejectedByName: string;
  rejectedAt: string;
}

export interface EmployeeExpense {
  id: string; // EEXP-000001
  employeeId: string;
  employeeName: string;
  custodyId?: string;
  fundingSource: EmployeeExpenseFundingSource;
  category: string;
  categoryOther?: string;
  amount: number;
  date: string;
  vendorOrPartyName?: string;
  documentIds?: string[];
  status: EmployeeExpenseStatus;
  amountOwedToEmployee?: number;
  rejectionHistory?: EmployeeExpenseRejection[];
  resubmittedAt?: string;
  duplicateWarning?: { possibleDuplicateOfExpenseId: string; acknowledgedReason?: string };
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
}

// ---- Supplier invoices ----
export interface SupplierInvoiceCancellation {
  reason: string;
  cancelledBy: string;
  cancelledByName: string;
  cancelledAt: string;
  replacementInvoiceId?: string;
}

export interface SupplierInvoice {
  id: string; // SINV-000001
  purchaseOrderId?: string;
  operationId?: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  documentIds: string[];
  status: 'pending_review' | 'approved' | 'cancelled';
  correctionOfInvoiceId?: string;
  correctionReason?: string;
  cancellation?: SupplierInvoiceCancellation;
  duplicateWarning?: { possibleDuplicateOfInvoiceId: string; acknowledgedReason?: string };
  poVarianceAmount?: number;
  varianceApprovalRequestId?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Expense without invoice / undocumented expense ----
export type ExpenseDocumentationLevel = 'has_invoice' | 'no_invoice_has_alternate_document' | 'undocumented';

export interface OperationalExpense {
  id: string; // OPEXP-000001
  operationId?: string;
  documentationLevel: ExpenseDocumentationLevel;
  category: string;
  categoryOther?: string;
  amount: number;
  date: string;
  vendorOrPartyName?: string;
  reasonForNoInvoice?: string;
  alternateDocumentIds?: string[];
  paymentMethod: ProcurementPaymentMethod;
  paymentMethodOther?: string;
  detailedDescription?: string;
  evidenceIds?: string[];
  status: 'pending_approval' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

// ---- Vehicle receiving from supplier ----
export type ReceivingResult = 'matching' | 'with_reservation' | 'rejected';
export type ReservationSeverity = 'simple' | 'impactful' | 'dangerous_safety';

export interface VehicleReceivingRecord {
  id: string; // RCV-000001
  operationId: string;
  purchaseOrderId: string;
  supplierId: string;
  vehicleId?: string;
  result: ReceivingResult;
  reservationSeverity?: ReservationSeverity;
  reservationReason?: string;
  description: string;
  mediaDocumentIds: string[];
  receivedBy: string;
  receivedByName: string;
  receivedAt: string;
  decision: 'proceed' | 'requires_approval_before_handover' | 'blocked';
  approvedForHandoverBy?: string;
  approvedForHandoverByName?: string;
  approvedForHandoverAt?: string;
  financialImpact?: string;
  createdAt: string;
}

export interface NewDamageAtReturn {
  id: string; // DMGR-000001
  operationId?: string;
  vehicleId?: string;
  contractId: string;
  description: string;
  mediaDocumentIds: string[];
  comparedToReceivingRecordId?: string;
  responsibilityDetermination?: 'customer' | 'supplier' | 'splendor' | 'undetermined';
  financialSettlementStatus: 'pending_determination' | 'settled';
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
}

// ---- TARS ----
export interface TarsRecord {
  id: string; // TARS-000001
  operationId?: string;
  contractId: string;
  vehicleId?: string;
  contractSignedAt: string;
  deadlineAt: string;
  executedAt?: string;
  executedBy?: string;
  executedByName?: string;
  proofDocumentIds?: string[];
  isDelayed?: boolean;
  delayMinutes?: number;
  fineAmount?: number;
  fineResponsibility?: 'supplier' | 'splendor';
  supplierListingDelay?: boolean;
  returnedToSupplierAt?: string;
  returnClosedAt?: string;
  closingDelayed?: boolean;
  escalationLevel?: 'none' | 'normal' | 'urgent';
  createdAt: string;
  updatedAt: string;
}

// ---- Customer delay / late-fee waiver ----
export interface LateFeeWaiver {
  id: string; // LFW-000001
  contractId: string;
  originalLateFeeAmount: number;
  waivedAmount: number;
  reason: string;
  waivedBy: string;
  waivedByName: string;
  waivedAt: string;
}
