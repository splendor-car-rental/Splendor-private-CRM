import {
  Vehicle, PlateAssignmentHistory, VehicleTimelineEvent,
  PublicVehicleDTO, WebsiteVehiclePublication, PublicWebsiteLeadRequest,
  PublicWebsiteReservationRequest, WebsiteReconciliationItem, TollTransaction,
  Contract, Reservation, Customer, Lead
} from '../types';
import { globalStore } from './dataStore';

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
    if (vehicle.lifecycleStatus === 'SOLD' || vehicle.lifecycleStatus === 'DISPOSED' || vehicle.lifecycleStatus === 'ARCHIVED') {
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
      features: pub.features || ['Bespoke Interior', 'Premium Sound System', 'Chauffeured Delivery Available'],
      featuresAr: pub.featuresAr || ['مقصورة مخصصة فاخرة', 'نظام صوتي فائق الجودة', 'خدمة التوصيل مع سائق خاصة'],
      pricing: {
        dailyRate: pub.dailyRate || vehicle.dailyRate,
        weeklyRate: pub.weeklyRate || vehicle.weeklyRate,
        monthlyRate: pub.monthlyRate || vehicle.monthlyRate,
        deposit: pub.deposit || vehicle.minDeposit,
        mileageAllowanceKm: pub.mileageAllowance || 250,
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
  public static assignPlateToVehicle(params: {
    vehicleId: string;
    newPlateNumber: string;
    newPlateCity: string;
    reason: string;
    assignedBy: string;
    assignedByName: string;
    effectiveDate?: string;
  }): { success: boolean; vehicle?: Vehicle; error?: string } {
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

    globalStore.logAudit({
      userId: params.assignedBy,
      userName: params.assignedByName,
      userRole: 'fleet',
      entityType: 'Vehicle',
      entityId: vehicle.id,
      action: 'update',
      previousValue: `Plate: ${prevPlateCity} ${prevPlateNumber}`,
      newValue: `Plate: ${params.newPlateCity} ${params.newPlateNumber}`,
      reason: params.reason
    });

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

    for (const v of globalStore.vehicles) {
      // Check current plate if timestamp is recent and no history
      if (v.plateNumber === plateNumber) {
        if (!v.plateHistory || v.plateHistory.length === 0) {
          matchedVehicle = v;
          break;
        }
      }

      // Search plate history intervals [startDate, endDate]
      if (v.plateHistory && v.plateHistory.length > 0) {
        const found = v.plateHistory.find(ph => {
          if (ph.plateNumber !== plateNumber) return false;
          const start = new Date(ph.startDate).getTime();
          const end = ph.endDate ? new Date(ph.endDate).getTime() : Infinity;
          return txTime >= start && txTime <= end;
        });

        if (found) {
          matchedVehicle = v;
          break;
        }
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
   * Process Public Website Inbound Lead
   */
  public static handlePublicLead(data: PublicWebsiteLeadRequest): { success: boolean; leadId: string } {
    const leadId = globalStore.getNextNumber('Lead');
    const newLead: Lead = {
      id: leadId,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
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

    globalStore.leads.unshift(newLead);

    globalStore.logAudit({
      userId: 'SPLENDOR-CONNECT',
      userName: 'Website Gateway',
      userRole: 'admin',
      entityType: 'Lead',
      entityId: leadId,
      action: 'create',
      newValue: `Website lead received from ${data.fullName} for vehicle ${data.preferredVehicle || 'N/A'}`
    });

    return { success: true, leadId };
  }

  /**
   * Process Public Reservation Request from Website
   */
  public static handlePublicReservation(data: PublicWebsiteReservationRequest): {
    success: boolean;
    reservationId?: string;
    error?: string;
  } {
    // 1. Resolve vehicle
    let targetVehicle = globalStore.vehicles.find(
      v => v.id === data.publicVehicleId || v.publicVehicleId === data.publicVehicleId || (v.website && v.website.publicVehicleId === data.publicVehicleId)
    );

    if (!targetVehicle) {
      targetVehicle = globalStore.vehicles[0];
    }

    // 2. Check schedule availability
    const avail = globalStore.checkVehicleAvailability(targetVehicle.id, data.pickupDateTime, data.returnDateTime);
    if (!avail.available) {
      return {
        success: false,
        error: 'The requested vehicle is already booked for these selected dates. Please select alternate dates or another model.'
      };
    }

    // 3. Find or Create Customer
    let customer = globalStore.customers.find(
      c => c.email.toLowerCase() === data.email.toLowerCase() || c.phone === data.phone
    );

    if (!customer) {
      const custId = globalStore.getNextNumber('Customer');
      customer = {
        id: custId,
        type: 'individual',
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        whatsapp: data.whatsapp || data.phone,
        address: data.pickupLocation || 'Dubai, UAE',
        city: 'Dubai',
        country: 'United Arab Emirates',
        nationality: 'VIP Visitor',
        idType: 'passport',
        idNumber: 'PENDING_UPLOAD',
        idExpiryDate: '2028-12-31',
        licenseNumber: 'PENDING_UPLOAD',
        licenseCountry: 'UAE',
        licenseExpiryDate: '2028-12-31',
        source: 'website',
        status: 'active',
        ownerId: 'USR-001',
        ownerName: 'Tariq Al-Mansoor',
        isVIP: true,
        tags: ['Website VIP Online Booking'],
        preferences: {
          favoriteCategory: targetVehicle.category
        },
        notes: 'Created via Splendor VIP Website Online Reservation Gateway',
        lifetimeValue: 0,
        totalRentals: 0,
        outstandingBalance: 0,
        securityDepositsHeld: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString()
      };
      globalStore.customers.unshift(customer);
    }

    // 4. Create Reservation Record in CRM
    const resId = globalStore.getNextNumber('Reservation');
    const days = Math.max(1, Math.ceil((new Date(data.returnDateTime).getTime() - new Date(data.pickupDateTime).getTime()) / (1000 * 60 * 60 * 24)));
    const dailyRate = targetVehicle.dailyRate || 5000;
    const estAmount = days * dailyRate;

    const newReservation: Reservation = {
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
      totalAmount: estAmount,
      depositAmount: targetVehicle.minDeposit || 10000,
      depositStatus: 'pending',
      status: 'confirmed',
      ownerId: 'USR-001',
      ownerName: 'Tariq Al-Mansoor',
      notes: `[ONLINE RESERVATION] Special requests: ${data.specialRequests || 'None'}. Delivery: ${data.pickupLocation || 'Showroom'}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    globalStore.reservations.unshift(newReservation);

    // Audit log
    globalStore.logAudit({
      userId: 'SPLENDOR-CONNECT',
      userName: 'Website Reservation Engine',
      userRole: 'sales',
      entityType: 'Reservation',
      entityId: resId,
      action: 'create',
      newValue: `Confirmed online booking for ${customer.fullName} - ${targetVehicle.make} ${targetVehicle.model} (${days} days, ${estAmount} AED)`
    });

    return { success: true, reservationId: resId };
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
