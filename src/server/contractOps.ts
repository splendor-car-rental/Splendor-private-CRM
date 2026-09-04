import { runIdempotent } from './idempotency';
import { AvailabilityConflictError } from './availability';
import { issueNextNumber } from './idGenerator';
import { PersistenceError } from './persistence';
import { calculateVatOnNet } from '../config/tax';
import type { AuditLog, Contract, Customer, Vehicle } from '../types';

// Server-authoritative rental-contract draft creation (POST /api/contracts).
//
// A newly-created contract is intentionally NON-OPERATIVE. Creating the
// document must never itself mean that KYC passed, a security deposit was
// actually collected, terms were signed, a vehicle was handed over, or a
// rental became revenue. Those are distinct lifecycle events and must be
// proven by their own authoritative records before the handover transition.
//
// This function therefore does four things only:
//   1. validates the vehicle/customer and requested rental period;
//   2. checks the requested window against already committed rentals;
//   3. computes the commercial figures server-side from the vehicle master;
//   4. creates an immutable/audited DRAFT contract idempotently.
//
// It deliberately does NOT mutate vehicle operational status and does NOT
// increment customer rental/LTV metrics. Those mutations belong to handover
// and return/settlement, respectively.

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
  /**
   * Retained for backwards-compatible request typing only. The caller is not
   * allowed to choose the lifecycle state during creation; the server always
   * creates a DRAFT.
   */
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
  /** Kept so server.ts can remain backwards compatible; draft creation no longer mutates the vehicle. */
  vehicleUpdate: Record<string, never>;
  /** Kept so server.ts can remain backwards compatible; draft creation no longer mutates customer metrics. */
  customerUpdate: Record<string, never>;
  replayed: boolean;
}

export async function createContractDurable(input: CreateContractInput): Promise<CreateContractResult> {
  // Ids are issued via their own atomic transactions (on numbering_configs
  // documents, unrelated to the vehicle/customer/contract documents this
  // function's own transaction touches) before that transaction opens --
  // Firestore does not support nesting one transaction inside another.
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

      // --- server-authoritative pricing: the vehicle master decides the
      // rate; client-supplied price fields are not part of this input. ---
      const dailyRate = vehicle.dailyRate;
      const rentalTotal = dailyRate * days;
      const vatAmount = calculateVatOnNet(rentalTotal);
      const grandTotal = rentalTotal + vatAmount;
      const depositAmount = vehicle.minDeposit || 5000;

      // --- availability check, inside the same transaction as the write ---
      // A draft itself is not an operational hold. Only reservations and
      // contract states that have crossed a commitment gate block the window.
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
        if (!['approved', 'signed', 'active'].includes(c.status)) continue;
        const cStart = new Date(c.startDateTime).getTime();
        const cEnd = new Date(c.endDateTime).getTime();
        if (startTime <= cEnd && endTime >= cStart) {
          conflicts.push({ type: 'committed_contract', id: doc.id, contractNumber: c.contractNumber, customer: c.customerName, status: c.status });
        }
      }
      if (conflicts.length > 0) {
        throw new AvailabilityConflictError('Vehicle has a scheduling conflict for the requested dates.', conflicts);
      }

      // --- draft-only write ---
      const now = new Date().toISOString();
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
        status: 'draft',
        paymentStatus: 'unpaid',
        // This is a requirement/value expectation, not evidence that money
        // has been collected. Deposit evidence lives in `deposits`.
        depositStatus: 'pending',
        // Contract creation is not signature acceptance. The later signing
        // transition must provide the actual evidence.
        termsAccepted: false,
        notes: input.notes || 'Rental agreement draft',
        createdAt: now,
        updatedAt: now
      };

      const vehicleUpdate: Record<string, never> = {};
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
        newValue: `Created draft contract ${contractId} for ${contract.customerName} (${grandTotal.toLocaleString()} AED)`,
        reason: 'Draft rental agreement created; no operational handover or financial collection implied'
      } as AuditLog;

      tx.create(db.collection('contracts').doc(contractId), contract as unknown as Record<string, unknown>);
      tx.create(db.collection('audit_logs').doc(auditId), auditEntry as unknown as Record<string, unknown>);

      return { contract, auditEntry, vehicleUpdate, customerUpdate };
    }
  );

  return { ...result, replayed };
}
