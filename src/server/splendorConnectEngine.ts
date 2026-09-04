import admin from 'firebase-admin';
import {
  Vehicle, PlateAssignmentHistory, VehicleTimelineEvent,
  PublicVehicleDTO, WebsiteVehiclePublication, PublicWebsiteLeadRequest,
  PublicWebsiteReservationRequest, WhatsAppReservationRequest, WebsiteReconciliationItem, TollTransaction,
  Contract, Reservation, Customer, Lead, AuditLog
} from '../types/index.js';
import { globalStore } from './dataStore.js';
import { updateDurable, createDurable, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { reserveVehicleSlot, AvailabilityConflictError } from './availability.js';

/**
 * In-memory idempotency cache for deduplicating rapid duplicate submissions
 * Key -> { result: any, timestamp: number }
 */
const idempotencyCache = new Map<string, { result: any; timestamp: number }>();
const IDEMPOTENCY_TTL_MS = 60 * 1000; // 60 seconds

function checkIdempotency(key: string): any | null {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(key);
    return null;
  }
  return entry.result;
}

function storeIdempotency(key: string, result: any): void {
  // Clean old entries if cache grows
  if (idempotencyCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of idempotencyCache.entries()) {
      if (now - v.timestamp > IDEMPOTENCY_TTL_MS) {
        idempotencyCache.delete(k);
      }
    }
  }
  idempotencyCache.set(key, { result, timestamp: Date.now() });
}

/**
 * Firestore persistence helper. Used to swallow failures (only
 * console.error, never surfaced) and was called without `await` from
 * assignPlateToVehicle -- meaning the HTTP response could be sent, and
 * Vercel could freeze the function, before this write even landed. Every
 * call site now awaits this, and a failure propagates as a PersistenceError
 * (via updateDurable) instead of disappearing into a log line.
 */
async function syncToFirestore(collectionName: string, docId: string, data: any): Promise<void> {
  if (admin.apps.length === 0) return;
  await updateDurable(collectionName, docId, data);
}

/**
 * SPLENDOR CONNECT MASTER ENGINE
 * Server-authoritative logic for:
 * 1. Plate assignment history & transfer with timeline audit
 * 2. Immutable toll/fine attribution to vehicle ID & contract at exact timestamp
 * 3. Public Vehicle DTO compilation (Sanitizing internal CRM data, margins, costs)
 * 4. Real-time availability calculation (Reservations, active contracts, maintenance, buffer hours)
 * 5. Inbound public website leads & reservations normalization
 * 6. Website fleet reconciliation & migration audit
 */
export class SplendorConnectEngine {
  /**
   * Safe Public DTO transformation
   * Strips: VIN, exact license plate number, insurance expiry, purchase cost, margin, profit score, client identities
   */
  public static toPublicVehicleDTO(vehicle: Vehicle): PublicVehicleDTO | null {
    // If not active in lifecycle or unpublished / hidden, do not expose
    if (
      !vehicle ||
      vehicle.lifecycleStatus === 'SOLD' ||
      vehicle.lifecycleStatus === 'DISPOSED' ||
      vehicle.lifecycleStatus === 'ARCHIVED' ||
      vehicle.lifecycleStatus === 'TRANSFERRED' ||
      vehicle.lifecycleStatus === 'INACTIVE'
    ) {
      return null;
    }

    const pub = vehicle.website;
    if (!pub || !pub.enabled || pub.visibility === 'INTERNAL_ONLY' || pub.visibility === 'PRIVATE') {
      return null;
    }

    // Availability is dynamic and separated from visibility
    const isAvailableNow = vehicle.status === 'available' && vehicle.lifecycleStatus === 'ACTIVE';

    return {
      publicVehicleId: pub.publicVehicleId || vehicle.publicVehicleId || vehicle.id.toLowerCase(),
      slug: pub.slug || pub.publicVehicleId || vehicle.id.toLowerCase(),
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      trim: vehicle.trim || '',
      category: pub.category || vehicle.category,
      publicName: pub.publicName || `${vehicle.make} ${vehicle.model}`,
      publicNameAr: pub.publicNameAr || pub.publicName || `${vehicle.make} ${vehicle.model}`,
      publicDescription: pub.publicDescription || `${vehicle.make} ${vehicle.model} available for luxury private rental in Dubai.`,
      publicDescriptionAr: pub.publicDescriptionAr || `استمتع بقيادة ${vehicle.make} ${vehicle.model} الفاخرة في دبي مع خدمة سبلندر الحصرية.`,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      horsepower: vehicle.horsepower,
      transmission: vehicle.transmission,
      fuelType: vehicle.fuelType,
      images: pub.images && pub.images.length > 0 ? pub.images : (vehicle.images || []),
      thumbnail: vehicle.thumbnail || (pub.images && pub.images[0]) || '',
      // Never fabricate a features list -- SPLENDOR does not publish a spec
      // or amenity claim about a vehicle unless it is real and confirmed
      // (Vehicle Master Profile mission, section 18). An unconfirmed/empty
      // features list on the publication record means the public page
      // simply shows none, never an invented placeholder list.
      features: pub.features && pub.features.length > 0 ? pub.features : [],
      featuresAr: pub.featuresAr && pub.featuresAr.length > 0 ? pub.featuresAr : [],
      pricing: {
        dailyRate: pub.dailyRate || vehicle.dailyRate,
        weeklyRate: pub.weeklyRate || vehicle.weeklyRate,
        monthlyRate: pub.monthlyRate || vehicle.monthlyRate,
        deposit: pub.deposit || vehicle.minDeposit,
        // The confirmed mileage allowance set on this vehicle's own
        // publication record -- never a fabricated fallback number.
        mileageAllowanceKm: pub.mileageAllowance || 0,
        currency: 'AED'
      },
      featured: !!pub.featured,
      visibility: pub.visibility,
      isAvailableNow
    };
  }

  /**
   * Transfer or Assign a Plate with full historical continuity and timeline event
   */
  public static async assignPlateToVehicle(params: {
    vehicleId: string;
    newPlateNumber: string;
    newPlateCity: string;
    reason: string;
    assignedBy: string;
    assignedByName: string;
    effectiveDate?: string;
  }): Promise<{ success: boolean; vehicle?: Vehicle; error?: string }> {
    const vehicle = globalStore.vehicles.find(v => v.id === params.vehicleId);
    if (!vehicle) {
      return { success: false, error: 'Vehicle record not found' };
    }

    const now = params.effectiveDate || new Date().toISOString();
    const prevPlateNumber = vehicle.plateNumber;
    const prevPlateCity = vehicle.plateCity;

    // Check if plate is currently used on another active vehicle
    const otherVehicleWithPlate = globalStore.vehicles.find(
      v => v.id !== vehicle.id && v.plateNumber === params.newPlateNumber && v.plateCity === params.newPlateCity
    );

    if (otherVehicleWithPlate) {
      // Archive other vehicle's current plate assignment
      if (otherVehicleWithPlate.plateHistory) {
        const currentOther = otherVehicleWithPlate.plateHistory.find(p => p.isCurrent);
        if (currentOther) {
          currentOther.isCurrent = false;
          currentOther.endDate = now;
          currentOther.reason = `Plate transferred to vehicle ${vehicle.id} (${vehicle.make} ${vehicle.model})`;
        }
      }
      otherVehicleWithPlate.plateNumber = 'PENDING-PLATE';
      otherVehicleWithPlate.updatedAt = now;
      otherVehicleWithPlate.timeline = otherVehicleWithPlate.timeline || [];
      otherVehicleWithPlate.timeline.push({
        id: `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        vehicleId: otherVehicleWithPlate.id,
        date: now,
        action: 'PLATE_TRANSFERRED',
        previousState: { plateNumber: params.newPlateNumber, plateCity: params.newPlateCity },
        newState: { plateNumber: 'PENDING-PLATE' },
        reason: `Plate transferred to ${vehicle.id} (${params.reason})`,
        userId: params.assignedBy,
        userName: params.assignedByName,
        createdAt: now
      });

      // Persist other vehicle to Firestore (awaited -- see syncToFirestore's
      // doc comment for why this used to be able to silently not happen).
      await syncToFirestore('vehicles', otherVehicleWithPlate.id, otherVehicleWithPlate);
    }

    // Close previous assignment on this vehicle
    vehicle.plateHistory = vehicle.plateHistory || [];
    const currentAssignment = vehicle.plateHistory.find(p => p.isCurrent);
    if (currentAssignment) {
      currentAssignment.isCurrent = false;
      currentAssignment.endDate = now;
      currentAssignment.unassignedBy = params.assignedBy;
      currentAssignment.unassignedByName = params.assignedByName;
    }

    // Add new assignment
    const newAssignment: PlateAssignmentHistory = {
      id: `PLT-${Date.now().toString().slice(-4)}`,
      plateNumber: params.newPlateNumber,
      plateCity: params.newPlateCity,
      vehicleId: vehicle.id,
      vehicleVin: vehicle.vin,
      vehicleName: `${vehicle.make} ${vehicle.model}`,
      startDate: now,
      isCurrent: true,
      reason: params.reason,
      assignedBy: params.assignedBy,
      assignedByName: params.assignedByName,
      createdAt: now
    };
    vehicle.plateHistory.push(newAssignment);

    // Update active plate fields
    vehicle.plateNumber = params.newPlateNumber;
    vehicle.plateCity = params.newPlateCity;
    vehicle.updatedAt = now;

    // Timeline event
    vehicle.timeline = vehicle.timeline || [];
    vehicle.timeline.push({
      id: `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      vehicleId: vehicle.id,
      date: now,
      action: 'PLATE_ASSIGNED',
      previousState: { plateNumber: prevPlateNumber, plateCity: prevPlateCity },
      newState: { plateNumber: params.newPlateNumber, plateCity: params.newPlateCity },
      reason: params.reason,
      userId: params.assignedBy,
      userName: params.assignedByName,
      createdAt: now
    });

    const auditId = await issueNextNumber('AuditLog');
    const auditLog: AuditLog = {
      id: auditId,
      timestamp: new Date().toISOString(),
      userId: params.assignedBy,
      userName: params.assignedByName,
      userRole: 'fleet',
      entityType: 'Vehicle',
      entityId: vehicle.id,
      action: 'update',
      previousValue: `Plate: ${prevPlateCity} ${prevPlateNumber}`,
      newValue: `Plate: ${params.newPlateCity} ${params.newPlateNumber}`,
      reason: params.reason
    };
    globalStore.auditLogs.unshift(auditLog);

    // Persist this vehicle & audit log to Firestore -- awaited, so the
    // caller's response only goes out once both writes are confirmed.
    await syncToFirestore('vehicles', vehicle.id, vehicle);
    await syncToFirestore('audit_logs', auditLog.id, auditLog);

    return { success: true, vehicle };
  }

  /**
   * Accurate Historical Toll / Fine Attribution
   * Matches a toll by exact date & time against vehicle plate history and contract period
   */
  public static attributeTollToVehicleAndContract(
    plateNumber: string,
    transactionIsoTimestamp: string
  ): {
    matchedVehicle: Vehicle | null;
    matchedContract: Contract | null;
    matchedCustomer: Customer | null;
    confidence: 'HIGH' | 'EXACT' | 'UNMATCHED';
    notes: string;
  } {
    const txTime = new Date(transactionIsoTimestamp).getTime();

    // 1. Find vehicle that held this plate at this specific timestamp
    let matchedVehicle: Vehicle | null = null;

    const cleanInputPlate = plateNumber.trim().toUpperCase().replace(/\s+/g, ' ');

    for (const v of globalStore.vehicles) {
      const vPlate = (v.plateNumber || '').trim().toUpperCase().replace(/\s+/g, ' ');
      // Check current plate
      if (vPlate === cleanInputPlate) {
        if (!v.plateHistory || v.plateHistory.length === 0) {
          matchedVehicle = v;
          break;
        }
      }

      // Search plate history intervals [startDate, endDate]
      if (v.plateHistory && v.plateHistory.length > 0) {
        const found = v.plateHistory.find(ph => {
          const phPlate = (ph.plateNumber || '').trim().toUpperCase().replace(/\s+/g, ' ');
          if (phPlate !== cleanInputPlate) return false;
          const start = new Date(ph.startDate).getTime();
          const end = ph.endDate ? new Date(ph.endDate).getTime() : Infinity;
          return txTime >= start && txTime <= end;
        });

        if (found) {
          matchedVehicle = v;
          break;
        }
      }

      // Fallback: if current plate matches and no conflicting interval found
      if (vPlate === cleanInputPlate) {
        matchedVehicle = v;
        break;
      }
    }

    if (!matchedVehicle) {
      return {
        matchedVehicle: null,
        matchedContract: null,
        matchedCustomer: null,
        confidence: 'UNMATCHED',
        notes: `Plate ${plateNumber} was not assigned to any fleet vehicle at ${transactionIsoTimestamp}`
      };
    }

    // 2. Find Contract covering this vehicle at this timestamp
    const matchedContract = globalStore.contracts.find(c => {
      if (c.vehicleId !== matchedVehicle!.id) return false;
      const start = new Date(c.startDateTime).getTime();
      const end = new Date(c.endDateTime).getTime();
      return txTime >= start && txTime <= end;
    }) || null;

    let matchedCustomer: Customer | null = null;
    if (matchedContract) {
      matchedCustomer = globalStore.customers.find(cu => cu.id === matchedContract.customerId) || null;
    }

    return {
      matchedVehicle,
      matchedContract,
      matchedCustomer,
      confidence: matchedContract ? 'EXACT' : 'HIGH',
      notes: matchedContract
        ? `Matched to Vehicle ${matchedVehicle.make} ${matchedVehicle.model} and active contract ${matchedContract.id} (${matchedContract.customerName})`
        : `Matched to Vehicle ${matchedVehicle.make} ${matchedVehicle.model} (Internal fleet movement / between rentals)`
    };
  }

  /**
   * Validates a public lead submission and returns the trimmed fields, or
   * an error. Shared by both the durable and sync-only code paths below so
   * the validation rules can't drift between them.
   */
  private static validateLeadRequest(data: PublicWebsiteLeadRequest): { fullName: string; email: string; phone: string } | { error: string } {
    const fullName = (data.fullName || '').trim();
    const email = (data.email || '').trim();
    const phone = (data.phone || '').trim();
    if (!fullName || fullName.length < 2) return { error: 'Please provide a valid full name.' };
    if (!email && !phone) return { error: 'A valid email address or phone number is required.' };
    return { fullName, email, phone };
  }

  private static buildLeadRecord(data: PublicWebsiteLeadRequest, leadId: string, fields: { fullName: string; email: string; phone: string }): Lead {
    return {
      id: leadId,
      fullName: fields.fullName,
      email: fields.email,
      phone: fields.phone,
      source: 'website',
      status: 'new',
      ownerId: 'USR-001',
      ownerName: 'Tariq Al-Mansoor',
      estimatedValue: 15000,
      preferredVehicleId: data.publicVehicleId,
      notes: `[SPLENDOR CONNECT - WEBSITE INQUIRY]
Preferred Vehicle: ${data.preferredVehicle || data.publicVehicleId || 'General Inquiry'}
Preferred Dates: ${data.pickupDateTime || 'N/A'} to ${data.returnDateTime || 'N/A'}
Message: ${data.message || 'No additional message'}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString()
    };
  }

  /**
   * Process Public Website Inbound Lead with validation, idempotency, and
   * DURABLE persistence: the Lead ID is issued atomically from Firestore
   * (issueNextNumber), and the lead + audit log are written to Firestore
   * BEFORE this resolves -- a Firestore failure throws (PersistenceError /
   * IdGenerationError) instead of the request silently succeeding with data
   * that only ever existed in this instance's memory. This is the path used
   * by the real POST /api/public/leads endpoint.
   */
  public static async handlePublicLead(data: PublicWebsiteLeadRequest): Promise<{ success: boolean; leadId: string; error?: string }> {
    const validated = SplendorConnectEngine.validateLeadRequest(data);
    if ('error' in validated) {
      return { success: false, leadId: '', error: validated.error };
    }
    const { fullName, email, phone } = validated;

    const idempotencyKey = `lead:${email.toLowerCase()}:${phone}:${data.preferredVehicle || ''}:${data.pickupDateTime || ''}`;
    const cached = checkIdempotency(idempotencyKey);
    if (cached) {
      return cached;
    }

    const leadId = await issueNextNumber('Lead');
    const newLead = SplendorConnectEngine.buildLeadRecord(data, leadId, { fullName, email, phone });
    await createDurable('leads', newLead);
    globalStore.leads.unshift(newLead);

    const auditId = await issueNextNumber('AuditLog');
    const auditLog: AuditLog = {
      id: auditId,
      timestamp: new Date().toISOString(),
      userId: 'SPLENDOR-CONNECT',
      userName: 'Website Gateway',
      userRole: 'admin',
      entityType: 'Lead',
      entityId: leadId,
      action: 'create',
      newValue: `Website lead received from ${fullName} for vehicle ${data.preferredVehicle || 'N/A'}`
    };
    await createDurable('audit_logs', auditLog);
    globalStore.auditLogs.unshift(auditLog);

    const response = { success: true, leadId };
    storeIdempotency(idempotencyKey, response);
    return response;
  }

  /**
   * SYNCHRONOUS, in-memory-only counterpart of handlePublicLead(), used
   * exclusively by the isolated test-suite harness (POST /api/tests/run-all,
   * TC-12) which runs inside DataStore.withIsolatedState() -- a callback
   * that MUST stay synchronous and MUST NOT touch real Firestore (see that
   * method's doc comment in dataStore.ts). Do not call this from any real
   * request path; it does not durably persist anything.
   */
  public static handlePublicLeadSync(data: PublicWebsiteLeadRequest): { success: boolean; leadId: string; error?: string } {
    const validated = SplendorConnectEngine.validateLeadRequest(data);
    if ('error' in validated) {
      return { success: false, leadId: '', error: validated.error };
    }
    const { fullName, email, phone } = validated;

    const idempotencyKey = `lead:${email.toLowerCase()}:${phone}:${data.preferredVehicle || ''}:${data.pickupDateTime || ''}`;
    const cached = checkIdempotency(idempotencyKey);
    if (cached) {
      return cached;
    }

    const leadId = globalStore.getNextNumber('Lead');
    const newLead = SplendorConnectEngine.buildLeadRecord(data, leadId, { fullName, email, phone });
    globalStore.leads.unshift(newLead);

    const auditLog = globalStore.logAudit({
      userId: 'SPLENDOR-CONNECT',
      userName: 'Website Gateway',
      userRole: 'admin',
      entityType: 'Lead',
      entityId: leadId,
      action: 'create',
      newValue: `Website lead received from ${fullName} for vehicle ${data.preferredVehicle || 'N/A'}`
    });

    const response = { success: true, leadId };
    storeIdempotency(idempotencyKey, response);
    return response;
  }

  /**
   * Shared validation + vehicle resolution for a public reservation request.
   * Pure and synchronous (reads only the in-memory vehicle catalog, which is
   * fine to be eventually-consistent for this preliminary eligibility check
   * -- the actual booking-conflict decision happens later, transactionally,
   * against Firestore). Used by both the durable and sync-only code paths.
   */
  private static resolvePublicReservationRequest(data: PublicWebsiteReservationRequest):
    | { fullName: string; email: string; phone: string; pickupTime: number; returnTime: number; targetVehicle: Vehicle }
    | { error: string } {
    const fullName = (data.fullName || '').trim();
    const email = (data.email || '').trim();
    const phone = (data.phone || '').trim();
    const vehicleKey = (data.publicVehicleId || '').trim();

    if (!vehicleKey) return { error: 'A valid luxury vehicle must be specified for this reservation request.' };
    if (!fullName || fullName.length < 2) return { error: 'Please provide a valid full name.' };
    if (!email || !phone) return { error: 'Both a valid email address and phone number are required for VIP booking verification.' };
    if (!data.pickupDateTime || !data.returnDateTime) return { error: 'Pickup date and return date are required.' };

    const pickupTime = new Date(data.pickupDateTime).getTime();
    const returnTime = new Date(data.returnDateTime).getTime();
    if (isNaN(pickupTime) || isNaN(returnTime)) return { error: 'Invalid pickup or return date format.' };
    if (returnTime <= pickupTime) return { error: 'Return date must be scheduled after the pickup date.' };

    const target = vehicleKey.toLowerCase();
    const targetVehicle = globalStore.vehicles.find(v =>
      v.id.toLowerCase() === target ||
      (v.publicVehicleId && v.publicVehicleId.toLowerCase() === target) ||
      (v.website && v.website.publicVehicleId && v.website.publicVehicleId.toLowerCase() === target) ||
      (v.website && v.website.slug && v.website.slug.toLowerCase() === target)
    );

    if (!targetVehicle) {
      console.warn(`[SplendorConnectEngine] Reservation rejected: Invalid or unknown vehicle identifier "${vehicleKey}" requested by ${email}`);
      return { error: 'The requested vehicle is currently unavailable or could not be found in our active showroom fleet.' };
    }

    if (
      targetVehicle.lifecycleStatus === 'SOLD' ||
      targetVehicle.lifecycleStatus === 'DISPOSED' ||
      targetVehicle.lifecycleStatus === 'ARCHIVED' ||
      targetVehicle.lifecycleStatus === 'TRANSFERRED' ||
      targetVehicle.lifecycleStatus === 'INACTIVE'
    ) {
      console.warn(`[SplendorConnectEngine] Reservation rejected: Vehicle ${targetVehicle.id} is in status ${targetVehicle.lifecycleStatus}`);
      return { error: 'The requested vehicle is currently out of service or unavailable for new bookings.' };
    }

    const pub = targetVehicle.website;
    if (!pub || !pub.enabled || pub.visibility === 'INTERNAL_ONLY' || pub.visibility === 'PRIVATE') {
      console.warn(`[SplendorConnectEngine] Reservation rejected: Vehicle ${targetVehicle.id} is not publicly listed for online booking`);
      return { error: 'The requested vehicle is reserved for private CRM requests and not available for online booking.' };
    }

    return { fullName, email, phone, pickupTime, returnTime, targetVehicle };
  }

  private static buildReservationCustomer(data: PublicWebsiteReservationRequest, custId: string, fullName: string, email: string, phone: string, targetVehicle: Vehicle): Customer {
    return {
      id: custId,
      type: 'individual',
      fullName,
      email,
      phone,
      whatsapp: data.whatsapp || phone,
      address: data.pickupLocation || 'Dubai, UAE',
      city: 'Dubai',
      country: 'United Arab Emirates',
      nationality: 'VIP Visitor',
      idType: 'passport',
      idNumber: 'PENDING_VERIFICATION',
      idExpiryDate: '2028-12-31',
      licenseNumber: 'PENDING_VERIFICATION',
      licenseCountry: 'UAE',
      licenseExpiryDate: '2028-12-31',
      source: 'website',
      status: 'active',
      ownerId: 'USR-001',
      ownerName: 'Tariq Al-Mansoor',
      isVIP: true,
      tags: ['Website VIP Online Booking'],
      preferences: { favoriteCategory: targetVehicle.category },
      notes: 'Created via Splendor VIP Website Online Reservation Gateway',
      lifetimeValue: 0,
      totalRentals: 0,
      outstandingBalance: 0,
      securityDepositsHeld: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString()
    };
  }

  private static buildReservationRecord(
    data: PublicWebsiteReservationRequest,
    resId: string,
    customer: Customer,
    targetVehicle: Vehicle,
    days: number,
    dailyRate: number,
    totalAmount: number,
    depositAmount: number
  ): Reservation {
    return {
      id: resId,
      customerId: customer.id,
      customerName: customer.fullName,
      customerPhone: customer.phone,
      vehicleId: targetVehicle.id,
      vehicleName: `${targetVehicle.make} ${targetVehicle.model}`,
      vehiclePlate: targetVehicle.plateNumber,
      pickupDateTime: data.pickupDateTime,
      returnDateTime: data.returnDateTime,
      durationDays: days,
      pickupLocation: data.pickupLocation || 'Dubai Flagship Showroom',
      returnLocation: data.returnLocation || 'Dubai Flagship Showroom',
      dailyRate,
      totalAmount,
      depositAmount,
      depositStatus: 'pending',
      status: 'pending', // Pending operations / concierge review
      ownerId: 'USR-001',
      ownerName: 'Tariq Al-Mansoor',
      notes: `[WEBSITE ONLINE RESERVATION - PENDING REVIEW]
Requested Vehicle: ${targetVehicle.make} ${targetVehicle.model} (${targetVehicle.id})
Special requests: ${data.specialRequests || 'None'}
Pickup: ${data.pickupLocation || 'Dubai Flagship Showroom'} | Return: ${data.returnLocation || 'Dubai Flagship Showroom'}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Process Public Reservation Request from Website.
   * STRICT HARDENING: Zero fallback to invalid vehicles, server pricing
   * derivation, idempotency, and a genuinely durable, cross-instance-safe
   * availability check.
   *
   * The actual booking decision is delegated to reserveVehicleSlot(), which
   * checks for conflicts AND creates the reservation document inside one
   * Firestore transaction -- structurally impossible to double-book even
   * when two requests for the same vehicle land on two different Vercel
   * instances at the same time (see availability.ts). This is the path used
   * by the real POST /api/public/reservations endpoint.
   */
  public static async handlePublicReservation(data: PublicWebsiteReservationRequest): Promise<{
    success: boolean;
    reservationId?: string;
    error?: string;
  }> {
    const resolved = SplendorConnectEngine.resolvePublicReservationRequest(data);
    if ('error' in resolved) {
      return { success: false, error: resolved.error };
    }
    const { fullName, email, phone, pickupTime, returnTime, targetVehicle } = resolved;

    const idempotencyKey = `res:${email.toLowerCase()}:${targetVehicle.id}:${data.pickupDateTime}:${data.returnDateTime}`;
    const cached = checkIdempotency(idempotencyKey);
    if (cached) {
      return cached;
    }

    // Customer Deduplication: Find existing customer by email or phone
    let customer = globalStore.customers.find(
      c => (c.email && c.email.toLowerCase() === email.toLowerCase()) || (phone && c.phone === phone)
    );

    if (!customer) {
      const custId = await issueNextNumber('Customer');
      customer = SplendorConnectEngine.buildReservationCustomer(data, custId, fullName, email, phone, targetVehicle);
      await createDurable('customers', customer);
      globalStore.customers.unshift(customer);
    }

    // Server-Authoritative Pricing Calculation (Client cannot override rates)
    const durationMs = returnTime - pickupTime;
    const days = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));
    const dailyRate = targetVehicle.website?.dailyRate || targetVehicle.dailyRate || 5000;
    const totalAmount = days * dailyRate;
    const depositAmount = targetVehicle.website?.deposit || targetVehicle.minDeposit || 10000;

    const resId = await issueNextNumber('Reservation');
    let newReservation: Reservation;
    let replayed = false;
    try {
      ({ doc: newReservation, replayed } = await reserveVehicleSlot(
        { vehicleId: targetVehicle.id, startIso: data.pickupDateTime, endIso: data.returnDateTime, idempotencyKey },
        'reservations',
        () => SplendorConnectEngine.buildReservationRecord(data, resId, customer!, targetVehicle, days, dailyRate, totalAmount, depositAmount)
      ));
    } catch (err) {
      if (err instanceof AvailabilityConflictError) {
        return {
          success: false,
          error: 'The requested vehicle is already reserved for the selected dates. Please choose alternate dates or select another model from our showroom.'
        };
      }
      throw err;
    }
    if (replayed) {
      const response = { success: true, reservationId: newReservation.id };
      storeIdempotency(idempotencyKey, response);
      return response;
    }
    globalStore.reservations.unshift(newReservation);

    const auditId = await issueNextNumber('AuditLog');
    const auditLog: AuditLog = {
      id: auditId,
      timestamp: new Date().toISOString(),
      userId: 'SPLENDOR-CONNECT',
      userName: 'Website Reservation Gateway',
      userRole: 'sales',
      entityType: 'Reservation',
      entityId: resId,
      action: 'create',
      newValue: `Website reservation request for ${customer.fullName} - ${targetVehicle.make} ${targetVehicle.model} (${days} days, ${totalAmount} AED) [Pending Review]`
    };
    await createDurable('audit_logs', auditLog);
    globalStore.auditLogs.unshift(auditLog);

    const response = { success: true, reservationId: resId };
    storeIdempotency(idempotencyKey, response);
    return response;
  }

  /**
   * SYNCHRONOUS, in-memory-only counterpart of handlePublicReservation(),
   * used exclusively by the isolated test-suite harness (POST
   * /api/tests/run-all, TC-13) which runs inside
   * DataStore.withIsolatedState() -- a callback that MUST stay synchronous
   * and MUST NOT touch real Firestore (see that method's doc comment in
   * dataStore.ts). Do not call this from any real request path; it does not
   * durably persist anything, and its availability check is only the
   * in-memory, eventually-consistent one (fine here since the isolated
   * store is single-writer by construction).
   */
  public static handlePublicReservationSync(data: PublicWebsiteReservationRequest): {
    success: boolean;
    reservationId?: string;
    error?: string;
  } {
    const resolved = SplendorConnectEngine.resolvePublicReservationRequest(data);
    if ('error' in resolved) {
      return { success: false, error: resolved.error };
    }
    const { fullName, email, phone, pickupTime, returnTime, targetVehicle } = resolved;

    const idempotencyKey = `res:${email.toLowerCase()}:${targetVehicle.id}:${data.pickupDateTime}:${data.returnDateTime}`;
    const cached = checkIdempotency(idempotencyKey);
    if (cached) {
      return cached;
    }

    const avail = globalStore.checkVehicleAvailability(targetVehicle.id, data.pickupDateTime, data.returnDateTime);
    if (!avail.available) {
      return {
        success: false,
        error: 'The requested vehicle is already reserved for the selected dates. Please choose alternate dates or select another model from our showroom.'
      };
    }

    let customer = globalStore.customers.find(
      c => (c.email && c.email.toLowerCase() === email.toLowerCase()) || (phone && c.phone === phone)
    );

    if (!customer) {
      const custId = globalStore.getNextNumber('Customer');
      customer = SplendorConnectEngine.buildReservationCustomer(data, custId, fullName, email, phone, targetVehicle);
      globalStore.customers.unshift(customer);
    }

    const durationMs = returnTime - pickupTime;
    const days = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));
    const dailyRate = targetVehicle.website?.dailyRate || targetVehicle.dailyRate || 5000;
    const totalAmount = days * dailyRate;
    const depositAmount = targetVehicle.website?.deposit || targetVehicle.minDeposit || 10000;

    const resId = globalStore.getNextNumber('Reservation');
    const newReservation = SplendorConnectEngine.buildReservationRecord(data, resId, customer, targetVehicle, days, dailyRate, totalAmount, depositAmount);
    globalStore.reservations.unshift(newReservation);

    const auditLog = globalStore.logAudit({
      userId: 'SPLENDOR-CONNECT',
      userName: 'Website Reservation Gateway',
      userRole: 'sales',
      entityType: 'Reservation',
      entityId: resId,
      action: 'create',
      newValue: `Website reservation request for ${customer.fullName} - ${targetVehicle.make} ${targetVehicle.model} (${days} days, ${totalAmount} AED) [Pending Review]`
    });
    void auditLog;

    const response = { success: true, reservationId: resId };
    storeIdempotency(idempotencyKey, response);
    return response;
  }

  /**
   * Validates a WhatsApp reservation request and resolves the target
   * vehicle by its internal id (the conversation engine already resolved a
   * public catalog entry to a real Vehicle.id before this is called, so no
   * slug lookup is needed here the way the website path needs one).
   */
  private static resolveWhatsAppReservationRequest(data: WhatsAppReservationRequest):
    | { fullName: string; phone: string; email: string; pickupTime: number; returnTime: number; targetVehicle: Vehicle }
    | { error: string } {
    const fullName = (data.fullName || '').trim();
    const phone = (data.phone || '').trim();
    const email = (data.email || '').trim();

    if (!data.vehicleId) return { error: 'A vehicle must be selected before a reservation can be created.' };
    if (!fullName || fullName.length < 2) return { error: 'A valid full name is required.' };
    if (!phone) return { error: 'A valid phone number is required.' };
    if (!data.pickupDateTime || !data.returnDateTime) return { error: 'Pickup date and return date are required.' };

    const pickupTime = new Date(data.pickupDateTime).getTime();
    const returnTime = new Date(data.returnDateTime).getTime();
    if (isNaN(pickupTime) || isNaN(returnTime)) return { error: 'Invalid pickup or return date format.' };
    if (returnTime <= pickupTime) return { error: 'Return date must be scheduled after the pickup date.' };

    const targetVehicle = globalStore.vehicles.find(v => v.id === data.vehicleId);
    if (!targetVehicle) return { error: 'The requested vehicle could not be found.' };

    if (
      targetVehicle.lifecycleStatus === 'SOLD' ||
      targetVehicle.lifecycleStatus === 'DISPOSED' ||
      targetVehicle.lifecycleStatus === 'ARCHIVED' ||
      targetVehicle.lifecycleStatus === 'TRANSFERRED' ||
      targetVehicle.lifecycleStatus === 'INACTIVE'
    ) {
      return { error: 'The requested vehicle is currently out of service or unavailable for new bookings.' };
    }

    return { fullName, phone, email, pickupTime, returnTime, targetVehicle };
  }

  private static buildWhatsAppReservationCustomer(custId: string, fullName: string, phone: string, email: string, targetVehicle: Vehicle): Customer {
    return {
      id: custId,
      type: 'individual',
      fullName,
      email, // may be '' -- a WhatsApp customer's real identity is their phone number; KYC/full profile completion happens later, same PENDING_VERIFICATION pattern as the website gateway
      phone,
      whatsapp: phone,
      address: 'Dubai, UAE',
      city: 'Dubai',
      country: 'United Arab Emirates',
      nationality: 'Pending Verification',
      idType: 'passport',
      idNumber: 'PENDING_VERIFICATION',
      idExpiryDate: '2028-12-31',
      licenseNumber: 'PENDING_VERIFICATION',
      licenseCountry: 'UAE',
      licenseExpiryDate: '2028-12-31',
      source: 'whatsapp',
      status: 'active',
      ownerId: 'USR-001',
      ownerName: 'Tariq Al-Mansoor',
      isVIP: false,
      tags: ['WhatsApp Conversational Booking'],
      preferences: { favoriteCategory: targetVehicle.category },
      notes: 'Created via the WhatsApp conversational booking flow (Module 13). Documents and full KYC pending.',
      lifetimeValue: 0,
      totalRentals: 0,
      outstandingBalance: 0,
      securityDepositsHeld: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString()
    };
  }

  private static buildWhatsAppReservationRecord(
    data: WhatsAppReservationRequest,
    resId: string,
    customer: Customer,
    targetVehicle: Vehicle,
    days: number,
    dailyRate: number,
    totalAmount: number,
    depositAmount: number
  ): Reservation {
    return {
      id: resId,
      customerId: customer.id,
      customerName: customer.fullName,
      customerPhone: customer.phone,
      vehicleId: targetVehicle.id,
      vehicleName: `${targetVehicle.make} ${targetVehicle.model}`,
      vehiclePlate: targetVehicle.plateNumber,
      pickupDateTime: data.pickupDateTime,
      returnDateTime: data.returnDateTime,
      durationDays: days,
      pickupLocation: data.pickupLocation,
      returnLocation: data.returnLocation,
      dailyRate,
      totalAmount,
      depositAmount,
      depositStatus: 'pending',
      status: 'pending', // Pending operations / concierge review -- same as a website booking; WhatsApp never auto-confirms
      ownerId: 'USR-001',
      ownerName: 'Tariq Al-Mansoor',
      notes: `[WHATSAPP CONVERSATIONAL BOOKING - PENDING REVIEW]\nRequested Vehicle: ${targetVehicle.make} ${targetVehicle.model} (${targetVehicle.id})\nPickup: ${data.pickupLocation} | Return: ${data.returnLocation}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Process a reservation request confirmed through the WhatsApp
   * conversation engine (src/server/whatsappConversation.ts). Deliberately
   * a sibling of handlePublicReservation() above, not a copy of its
   * booking decision: the actual conflict check + creation still goes
   * through the SAME reserveVehicleSlot() transaction (buffer hours,
   * temporary-hold awareness, cross-instance safety, idempotency) --
   * WhatsApp is a second front door into the one reservation engine, never
   * a second engine.
   */
  public static async handleWhatsAppReservation(data: WhatsAppReservationRequest): Promise<{
    success: boolean;
    reservationId?: string;
    error?: string;
  }> {
    const resolved = SplendorConnectEngine.resolveWhatsAppReservationRequest(data);
    if ('error' in resolved) {
      return { success: false, error: resolved.error };
    }
    const { fullName, phone, email, pickupTime, returnTime, targetVehicle } = resolved;

    const idempotencyKey = data.idempotencyKey || `wa-res:${phone}:${targetVehicle.id}:${data.pickupDateTime}:${data.returnDateTime}`;
    const cached = checkIdempotency(idempotencyKey);
    if (cached) {
      return cached;
    }

    // Customer matching by phone only -- a WhatsApp customer has no email
    // to dedupe on. Ambiguous matches are resolved by the conversation
    // engine BEFORE this is ever called (see matchCustomerByPhone()); by
    // the time execution reaches here there is at most one candidate.
    let customer = globalStore.customers.find(c => c.phone === phone);
    if (!customer) {
      const custId = await issueNextNumber('Customer');
      customer = SplendorConnectEngine.buildWhatsAppReservationCustomer(custId, fullName, phone, email, targetVehicle);
      await createDurable('customers', customer);
      globalStore.customers.unshift(customer);
    }

    const durationMs = returnTime - pickupTime;
    const days = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));
    const dailyRate = targetVehicle.website?.dailyRate || targetVehicle.dailyRate || 5000;
    const totalAmount = days * dailyRate;
    const depositAmount = targetVehicle.website?.deposit || targetVehicle.minDeposit || 10000;

    const resId = await issueNextNumber('Reservation');
    let newReservation: Reservation;
    let replayed = false;
    try {
      ({ doc: newReservation, replayed } = await reserveVehicleSlot(
        { vehicleId: targetVehicle.id, startIso: data.pickupDateTime, endIso: data.returnDateTime, idempotencyKey },
        'reservations',
        () => SplendorConnectEngine.buildWhatsAppReservationRecord(data, resId, customer!, targetVehicle, days, dailyRate, totalAmount, depositAmount)
      ));
    } catch (err) {
      if (err instanceof AvailabilityConflictError) {
        return {
          success: false,
          error: 'The requested vehicle is no longer available for the selected dates. Please choose alternate dates or another vehicle.'
        };
      }
      throw err;
    }
    if (replayed) {
      const response = { success: true, reservationId: newReservation.id };
      storeIdempotency(idempotencyKey, response);
      return response;
    }
    globalStore.reservations.unshift(newReservation);

    const auditId = await issueNextNumber('AuditLog');
    const auditLog: AuditLog = {
      id: auditId,
      timestamp: new Date().toISOString(),
      userId: 'SPLENDOR-CONNECT',
      userName: 'WhatsApp Conversational Gateway',
      userRole: 'sales',
      entityType: 'Reservation',
      entityId: resId,
      action: 'create',
      newValue: `WhatsApp reservation request for ${customer.fullName} (${phone}) - ${targetVehicle.make} ${targetVehicle.model} (${days} days, ${totalAmount} AED) [Pending Review]`
    };
    await createDurable('audit_logs', auditLog);
    globalStore.auditLogs.unshift(auditLog);

    const response = { success: true, reservationId: resId };
    storeIdempotency(idempotencyKey, response);
    return response;
  }

  /**
   * Fleet Reconciliation & Publication Health Audit
   */
  public static getReconciliationReport(): WebsiteReconciliationItem[] {
    return globalStore.vehicles.map(v => {
      const pub = v.website;
      const isPublished = !!(pub && pub.enabled && pub.visibility !== 'INTERNAL_ONLY' && pub.visibility !== 'PRIVATE');
      const rateMatches = pub ? (pub.dailyRate === v.dailyRate) : true;
      const hasImages = !!((pub && pub.images && pub.images.length > 0) || (v.images && v.images.length > 0));

      let matchStatus: 'EXACT_MATCH' | 'POSSIBLE_MATCH' | 'NO_MATCH' | 'CONFLICT' = 'EXACT_MATCH';
      if (!isPublished) {
        matchStatus = 'NO_MATCH';
      } else if (!rateMatches || !hasImages) {
        matchStatus = 'CONFLICT';
      }

      const issues: string[] = [];
      if (!rateMatches) issues.push('Website daily rate differs from CRM rate');
      if (!hasImages) issues.push('No showcase photos assigned');

      return {
        websiteVehicleId: pub?.publicVehicleId || v.publicVehicleId || v.id,
        websiteName: pub?.publicName || `${v.make} ${v.model}`,
        websiteDailyRate: pub?.dailyRate || v.dailyRate,
        crmVehicleId: v.id,
        crmName: `${v.make} ${v.model}`,
        crmDailyRate: v.dailyRate,
        matchStatus,
        confidence: isPublished && rateMatches ? 100 : 75,
        priceDifference: Math.abs((pub?.dailyRate || v.dailyRate) - v.dailyRate),
        dataDifference: issues,
        actionRequired: matchStatus === 'CONFLICT' ? 'PRICE_REVIEW' : 'NONE'
      };
    });
  }
}

