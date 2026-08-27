import { runDurableTransaction, PersistenceError } from './persistence';

// Replaces relying on globalStore.checkVehicleAvailability() as the GATE
// for actually creating a reservation/contract. That function is still
// used for the advisory, read-only "is this probably available" preview
// (POST /api/fleet/availability, the public availability routes) -- fine
// to be eventually-consistent there, since nothing is committed.
//
// The gate that actually decides whether a booking succeeds is different:
// globalStore is a separate in-memory copy per serverless instance, so two
// concurrent requests for the same vehicle/overlapping dates, routed to
// two different warm instances, could both read "available" and both
// write a "confirmed" record -- a real double-booking. Firestore
// transactions serialize conflicting reads/writes across ALL instances
// (the platform retries a transaction if another one committed a
// conflicting write to the same documents first), so checking AND writing
// the new reservation/contract inside one transaction makes double-booking
// structurally impossible rather than merely unlikely.

export class AvailabilityConflictError extends PersistenceError {
  constructor(message: string, public readonly conflicts: unknown[]) {
    super(message);
    this.name = 'AvailabilityConflictError';
  }
}

export interface SlotCheckInput {
  vehicleId: string;
  startIso: string;
  endIso: string;
  /** Exclude this reservation from the conflict scan (e.g. when converting
   * that same reservation into a contract). */
  excludeReservationId?: string;
  excludeContractId?: string;
}

/**
 * Atomically verifies the vehicle is not under a status block and has no
 * conflicting active contract or confirmed/active/pending reservation for
 * [startIso, endIso], then creates `buildDoc()`'s document in
 * `newCollection` -- all inside one Firestore transaction. Throws
 * AvailabilityConflictError (never writes) if a conflict exists.
 */
export async function reserveVehicleSlot<T extends { id: string }>(
  input: SlotCheckInput,
  newCollection: string,
  buildDoc: () => T
): Promise<T> {
  const targetStart = new Date(input.startIso).getTime();
  const targetEnd = new Date(input.endIso).getTime();

  return runDurableTransaction(async (tx, db) => {
    const vehicleRef = db.collection('vehicles').doc(input.vehicleId);
    const vehicleSnap = await tx.get(vehicleRef);
    if (!vehicleSnap.exists) {
      throw new AvailabilityConflictError('Vehicle not found.', ['Vehicle not found']);
    }
    const vehicle = vehicleSnap.data() as any;

    const conflicts: unknown[] = [];
    if (vehicle.status === 'maintenance' || vehicle.status === 'unavailable') {
      conflicts.push({ type: 'status_block', message: `Vehicle is currently marked as ${vehicle.status}` });
    }

    const resSnap = await tx.get(db.collection('reservations').where('vehicleId', '==', input.vehicleId));
    for (const doc of resSnap.docs) {
      if (doc.id === input.excludeReservationId) continue;
      const r = doc.data() as any;
      if (!['confirmed', 'active', 'pending'].includes(r.status)) continue;
      const rStart = new Date(r.pickupDateTime).getTime();
      const rEnd = new Date(r.returnDateTime).getTime();
      if (targetStart <= rEnd && targetEnd >= rStart) {
        conflicts.push({ type: 'reservation', id: doc.id, customer: r.customerName, dates: `${r.pickupDateTime} - ${r.returnDateTime}` });
      }
    }

    const conSnap = await tx.get(db.collection('contracts').where('vehicleId', '==', input.vehicleId));
    for (const doc of conSnap.docs) {
      if (doc.id === input.excludeContractId) continue;
      const c = doc.data() as any;
      if (c.status !== 'active') continue;
      const cStart = new Date(c.startDateTime).getTime();
      const cEnd = new Date(c.endDateTime).getTime();
      if (targetStart <= cEnd && targetEnd >= cStart) {
        conflicts.push({ type: 'active_contract', id: doc.id, contractNumber: c.contractNumber, customer: c.customerName });
      }
    }

    if (conflicts.length > 0) {
      throw new AvailabilityConflictError('Vehicle has a scheduling conflict for the requested dates.', conflicts);
    }

    const doc = buildDoc();
    tx.create(db.collection(newCollection).doc(doc.id), doc as unknown as Record<string, unknown>);
    return doc;
  });
}
