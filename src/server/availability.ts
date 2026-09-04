import { PersistenceError, runDurableTransaction } from './persistence.js';
import { runIdempotent } from './idempotency.js';
import { getRuleValue } from './businessRules.js';
import { issueNextNumber } from './idGenerator.js';

const DEFAULT_BOOKING_BUFFER_HOURS = 3;
const DEFAULT_SOFT_HOLD_MINUTES = 10;

function getBookingBufferMs(): number {
  return getRuleValue('bookingOperationalBufferHours', DEFAULT_BOOKING_BUFFER_HOURS) * 60 * 60 * 1000;
}

function rangesConflictWithBuffer(aStart: number, aEnd: number, bStart: number, bEnd: number, bufferMs: number): boolean {
  const aFullyBeforeB = aEnd + bufferMs <= bStart;
  const bFullyBeforeA = bEnd + bufferMs <= aStart;
  return !(aFullyBeforeB || bFullyBeforeA);
}

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
  excludeReservationId?: string;
  excludeContractId?: string;
  excludeHoldId?: string;
  idempotencyKey?: string | null;
}

/**
 * Atomically checks and creates a booking/contract slot.
 *
 * The vehicle document is deliberately updated in the same transaction as
 * the new reservation/contract. This is a Firestore contention anchor:
 * Firestore serializes concurrent transactions that read and write the same
 * vehicle document. Without that write, two transactions could both query an
 * empty reservations collection and both commit successfully.
 */
export async function reserveVehicleSlot<T extends { id: string }>(
  input: SlotCheckInput,
  newCollection: string,
  buildDoc: () => T
): Promise<{ doc: T; replayed: boolean }> {
  const targetStart = new Date(input.startIso).getTime();
  const targetEnd = new Date(input.endIso).getTime();
  const bufferMs = getBookingBufferMs();
  const nowMs = Date.now();

  const { result, replayed } = await runIdempotent(`reserve-slot:${newCollection}`, input.idempotencyKey, async (tx, db) => {
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
      if (rangesConflictWithBuffer(targetStart, targetEnd, rStart, rEnd, bufferMs)) {
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
      if (rangesConflictWithBuffer(targetStart, targetEnd, cStart, cEnd, bufferMs)) {
        conflicts.push({ type: 'active_contract', id: doc.id, contractNumber: c.contractNumber, customer: c.customerName });
      }
    }

    const holdSnap = await tx.get(db.collection('temporary_holds').where('vehicleId', '==', input.vehicleId));
    for (const doc of holdSnap.docs) {
      if (doc.id === input.excludeHoldId) continue;
      const h = doc.data() as any;
      if (new Date(h.expiresAt).getTime() <= nowMs) continue;
      const hStart = new Date(h.startIso).getTime();
      const hEnd = new Date(h.endIso).getTime();
      if (rangesConflictWithBuffer(targetStart, targetEnd, hStart, hEnd, bufferMs)) {
        conflicts.push({ type: 'temporary_hold', id: doc.id, expiresAt: h.expiresAt });
      }
    }

    if (conflicts.length > 0) {
      throw new AvailabilityConflictError('Vehicle has a scheduling conflict for the requested dates.', conflicts);
    }

    const doc = buildDoc();
    const currentAvailabilityVersion = Number(vehicle.availabilityVersion || 0);
    tx.set(vehicleRef, {
      availabilityVersion: currentAvailabilityVersion + 1,
      availabilityLastCheckedAt: new Date().toISOString()
    }, { merge: true });
    tx.create(db.collection(newCollection).doc(doc.id), doc as unknown as Record<string, unknown>);

    if (input.excludeHoldId) {
      tx.delete(db.collection('temporary_holds').doc(input.excludeHoldId));
    }

    return doc;
  });

  return { doc: result, replayed };
}

export interface PlaceTemporaryHoldInput {
  vehicleId: string;
  startIso: string;
  endIso: string;
  holderKey: string;
  holdMinutes?: number;
}

export interface TemporaryHold {
  id: string;
  vehicleId: string;
  startIso: string;
  endIso: string;
  holderKey: string;
  createdAt: string;
  expiresAt: string;
}

export async function placeTemporaryHold(input: PlaceTemporaryHoldInput): Promise<TemporaryHold> {
  const targetStart = new Date(input.startIso).getTime();
  const targetEnd = new Date(input.endIso).getTime();
  const bufferMs = getBookingBufferMs();
  const holdMinutes = input.holdMinutes ?? getRuleValue('bookingSoftHoldMinutes', DEFAULT_SOFT_HOLD_MINUTES);
  const nowMs = Date.now();

  return runDurableTransaction(async (tx, db) => {
    const vehicleRef = db.collection('vehicles').doc(input.vehicleId);
    const vehicleSnap = await tx.get(vehicleRef);
    if (!vehicleSnap.exists) {
      throw new AvailabilityConflictError('Vehicle not found.', ['Vehicle not found']);
    }
    const vehicle = vehicleSnap.data() as any;
    if (vehicle.status === 'maintenance' || vehicle.status === 'unavailable') {
      throw new AvailabilityConflictError(`Vehicle is currently marked as ${vehicle.status}`, [{ type: 'status_block' }]);
    }

    const resSnap = await tx.get(db.collection('reservations').where('vehicleId', '==', input.vehicleId));
    const conSnap = await tx.get(db.collection('contracts').where('vehicleId', '==', input.vehicleId));
    const holdSnap = await tx.get(db.collection('temporary_holds').where('vehicleId', '==', input.vehicleId));

    const conflicts: unknown[] = [];
    for (const doc of resSnap.docs) {
      const r = doc.data() as any;
      if (!['confirmed', 'active', 'pending'].includes(r.status)) continue;
      if (rangesConflictWithBuffer(targetStart, targetEnd, new Date(r.pickupDateTime).getTime(), new Date(r.returnDateTime).getTime(), bufferMs)) {
        conflicts.push({ type: 'reservation', id: doc.id });
      }
    }
    for (const doc of conSnap.docs) {
      const c = doc.data() as any;
      if (c.status !== 'active') continue;
      if (rangesConflictWithBuffer(targetStart, targetEnd, new Date(c.startDateTime).getTime(), new Date(c.endDateTime).getTime(), bufferMs)) {
        conflicts.push({ type: 'active_contract', id: doc.id });
      }
    }
    for (const doc of holdSnap.docs) {
      const h = doc.data() as any;
      if (new Date(h.expiresAt).getTime() <= nowMs) continue;
      if (rangesConflictWithBuffer(targetStart, targetEnd, new Date(h.startIso).getTime(), new Date(h.endIso).getTime(), bufferMs)) {
        conflicts.push({ type: 'temporary_hold', id: doc.id });
      }
    }

    if (conflicts.length > 0) {
      throw new AvailabilityConflictError('Vehicle has a scheduling conflict for the requested dates.', conflicts);
    }

    const id = await issueNextNumber('TemporaryHold');
    const now = new Date().toISOString();
    const hold: TemporaryHold = {
      id,
      vehicleId: input.vehicleId,
      startIso: input.startIso,
      endIso: input.endIso,
      holderKey: input.holderKey,
      createdAt: now,
      expiresAt: new Date(nowMs + holdMinutes * 60 * 1000).toISOString()
    };

    const currentAvailabilityVersion = Number(vehicle.availabilityVersion || 0);
    tx.set(vehicleRef, {
      availabilityVersion: currentAvailabilityVersion + 1,
      availabilityLastCheckedAt: now
    }, { merge: true });
    tx.create(db.collection('temporary_holds').doc(id), hold as unknown as Record<string, unknown>);
    return hold;
  });
}

/** Release a soft hold immediately when checkout is cancelled or converted. */
export async function releaseTemporaryHold(holdId: string): Promise<void> {
  const id = String(holdId || '').trim();
  if (!id) return;

  await runDurableTransaction(async (tx, db) => {
    const ref = db.collection('temporary_holds').doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const hold = snap.data() as TemporaryHold;
    const vehicleRef = db.collection('vehicles').doc(hold.vehicleId);
    const vehicleSnap = await tx.get(vehicleRef);
    if (vehicleSnap.exists) {
      const vehicle = vehicleSnap.data() as any;
      tx.set(vehicleRef, {
        availabilityVersion: Number(vehicle.availabilityVersion || 0) + 1,
        availabilityLastCheckedAt: new Date().toISOString()
      }, { merge: true });
    }
    tx.delete(ref);
  });
}
