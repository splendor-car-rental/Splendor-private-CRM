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
  action: 'CREATED' | 'PURCHASED' | 'REGISTERED' | 'PLATE_ASSIGNED' | 'PLATE_TRANSFERRED' | 'RENTAL_STARTED' | 'RENTAL_COMPLETED' | 'MAINTENANCE_LOGGED' | 'PUBLISHED_TO_WEB' | 'UNPUBLISHED_FROM_WEB' | 'FEATURED_ON_WEB' | 'PRICING_UPDATED' | 'SOLD' | 'ARCHIVED' | 'RESTORED';
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
  action: 'create' | 'update' | 'delete' | 'status_change' | 'approval' | 'refund' | 'reconcile' | 'merge';
  previousValue?: string;
  newValue?: string;
  reason?: string;
  ipAddress?: string;
  timestamp: string;
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
