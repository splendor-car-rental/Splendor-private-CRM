import { runIdempotent } from './idempotency';
import { AvailabilityConflictError } from './availability';
import { issueNextNumber } from './idGenerator';
import { PersistenceError } from './persistence';
import { vatPortion } from '../config/tax';
import type { AuditLog, Contract, Customer, Vehicle } from '../types';

// Server-authoritative "instant contract" creation (POST /api/contracts).
//
// Contract creation is NOT the authoritative event for operational rental
// metrics. A contract can exist before physical handover, and a retry or an
// alternate reservation-to-contract entry path must not change the meaning
// of `totalRentals` or `lifetimeValue`.
//
// The clean-recovery invariant for #36 is therefore:
// - contract creation may create the durable contract and preserve the
//   existing vehicle reservation/rented compatibility behavior;
// - it MUST NOT increment customer totalRentals;
// - it MUST NOT recognize customer lifetimeValue;
// - handover is the single operational rental-count event;
// - financial closure is the single lifetime-value recognition event.
//
// Pricing and availability remain server-authoritative and this function
// remains idempotent, so this change removes the metric side effect without
// weakening the existing contract-creation protections.

export class ContractValidationError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

export interface CreateContractInput {
  vehicleId: string;
  customerId: string;
  startDateTime?: string;
  endDateTime?: string;
  pickupLocation?: string;
  returnLocation?: string;
  mileageAllowancePerDay?: number;
  extraKmRate?: number;
  depositReleaseDays?: number;
  status?: string;
  notes?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  idempotencyKey?: string | null;
}

export interface CreateContractResult {
  contract: Contract;
  auditEntry: AuditLog;
  vehicleUpdate: { status: string; currentCustomerId: string; currentContractId: string };
  /** Contract creation no longer mutates customer operational/financial metrics. */
  customerUpdate: Record<string, never>;
  replayed: boolean;
}

export async function createContractDurable(input: CreateContractInput): Promise<CreateContractResult> {
  const contractId = await issueNextNumber('Contract');
  const auditId = await issueNextNumber('AuditLog');

  const { result, replayed } = await runIdempotent(
    'contract-create',
    input.idempotencyKey,
    async (tx, db) => {
      const vehicleRef = db.collection('vehicles').doc(input.vehicleId);
      const customerRef = db.collection('customers').doc(input.customerId);

      // --- reads first (Firestore transaction requirement) ---
      const [vehicleSnap, customerSnap] = await Promise.all([tx.get(vehicleRef), tx.get(customerRef)]);
      if (!vehicleSnap.exists) throw new ContractValidationError('Vehicle not found.');
      if (!customerSnap.exists) throw new ContractValidationError('Customer not found.');
      const vehicle = vehicleSnap.data() as Vehicle;
      const customer = customerSnap.data() as Customer;

      const startDateTime = input.startDateTime || new Date().toISOString();
      const endDateTime = input.endDateTime || new Date(Date.now() + 86400000 * 3).toISOString();
      const startTime = new Date(startDateTime).getTime();
      const endTime = new Date(endDateTime).getTime();
      if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
        throw new ContractValidationError('endDateTime must be a valid date after startDateTime.');
      }
      const days = Math.max(1, Math.ceil((endTime - startTime) / 86400000));

      const [resSnap, conSnap] = await Promise.all([
        tx.get(db.collection('reservations').where('vehicleId', '==', input.vehicleId)),
        tx.get(db.collection('contracts').where('vehicleId', '==', input.vehicleId))
      ]);

      // --- server-authoritative pricing: the vehicle's own record decides
      // the rate, never a client-supplied figure ---
      const dailyRate = vehicle.dailyRate;
      const rentalTotal = dailyRate * days;
      const vatAmount = vatPortion(rentalTotal);
      const grandTotal = rentalTotal + vatAmount;
      const depositAmount = vehicle.minDeposit || 5000;

      // --- availability check, inside the same transaction as the write ---
      const conflicts: unknown[] = [];
      if (vehicle.status === 'maintenance' || vehicle.status === 'unavailable') {
        conflicts.push({ type: 'status_block', message: `Vehicle is currently marked as ${vehicle.status}` });
      }
      for (const doc of resSnap.docs) {
        const r = doc.data() as any;
        if (!['confirmed', 'active', 'pending'].includes(r.status)) continue;
        const rStart = new Date(r.pickupDateTime).getTime();
        const rEnd = new Date(r.returnDateTime).getTime();
        if (startTime <= rEnd && endTime >= rStart) {
          conflicts.push({ type: 'reservation', id: doc.id, customer: r.customerName, dates: `${r.pickupDateTime} - ${r.returnDateTime}` });
        }
      }
      for (const doc of conSnap.docs) {
        const c = doc.data() as any;
        if (c.status !== 'active') continue;
        const cStart = new Date(c.startDateTime).getTime();
        const cEnd = new Date(c.endDateTime).getTime();
        if (startTime <= cEnd && endTime >= cStart) {
          conflicts.push({ type: 'active_contract', id: doc.id, contractNumber: c.contractNumber, customer: c.customerName });
        }
      }
      if (conflicts.length > 0) {
        throw new AvailabilityConflictError('Vehicle has a scheduling conflict for the requested dates.', conflicts);
      }

      // --- writes ---
      const now = new Date().toISOString();
      const status = (input.status || 'active') as Contract['status'];

      const contract: Contract = {
        id: contractId,
        contractNumber: contractId,
        customerId: customer.id,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        vehicleId: vehicle.id,
        vehicleName: `${vehicle.make} ${vehicle.model}`,
        vehiclePlate: `${vehicle.plateCity} ${vehicle.plateNumber}`,
        vehicleVin: vehicle.vin,
        startDateTime,
        endDateTime,
        pickupLocation: input.pickupLocation || 'Dubai Flagship Showroom',
        returnLocation: input.returnLocation || 'Dubai Flagship Showroom',
        dailyRate,
        rentalTotal,
        vatAmount,
        grandTotal,
        depositAmount,
        mileageAllowancePerDay: input.mileageAllowancePerDay || 200,
        extraKmRate: input.extraKmRate || 15,
        depositReleaseDays: input.depositReleaseDays || 21,
        status,
        paymentStatus: 'unpaid',
        depositStatus: 'held',
        termsAccepted: true,
        notes: input.notes || 'Instant VIP rental agreement',
        createdAt: now,
        updatedAt: now
      };

      const vehicleUpdate = {
        status: status === 'active' ? 'rented' : 'reserved',
        currentCustomerId: contract.customerId,
        currentContractId: contract.id
      };
      const customerUpdate: Record<string, never> = {};

      const auditEntry: AuditLog = {
        id: auditId,
        timestamp: now,
        userId: input.actorId || 'USR-001',
        userName: input.actorName || 'Admin',
        userRole: (input.actorRole || 'admin') as AuditLog['userRole'],
        entityType: 'Contract',
        entityId: contractId,
        action: 'create',
        newValue: `Issued instant contract ${contractId} for ${contract.customerName} (${grandTotal.toLocaleString()} AED)`,
        reason: 'Executive instant contract creation; customer rental/LTV metrics are deferred to their authoritative lifecycle events'
      } as AuditLog;

      tx.create(db.collection('contracts').doc(contractId), contract as unknown as Record<string, unknown>);
      tx.set(vehicleRef, { ...vehicleUpdate, updatedAt: now }, { merge: true });
      // Intentionally no customer metric write here. Reservation-derived
      // contract creation already behaves this way; both entry paths are now
      // consistent and handover owns totalRentals.
      tx.create(db.collection('audit_logs').doc(auditId), auditEntry as unknown as Record<string, unknown>);

      return { contract, auditEntry, vehicleUpdate, customerUpdate };
    }
  );

  return { ...result, replayed };
}
