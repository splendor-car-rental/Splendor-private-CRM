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
  createdAt: string;
  updatedAt: string;
}

export type VehicleStatus = 'available' | 'reserved' | 'rented' | 'maintenance' | 'unavailable';
export type VehicleCategory = 'supercar' | 'ultra_luxury_sedan' | 'executive_suv' | 'grand_tourer' | 'exotic_convertible';

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
  depositReleaseDays?: number; // default 21 days -- editable per contract
  
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
  | 'rejected';

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
