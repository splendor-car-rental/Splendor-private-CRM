import { PersistenceError, runDurableTransaction } from './persistence';
import { runIdempotent } from './idempotency';
import { getRuleValue } from './businessRules';
import { issueNextNumber } from './idGenerator';

const DEFAULT_BOOKING_BUFFER_HOURS = 3;
const DEFAULT_SOFT_HOLD_MINUTES = 10;

/** RULE-R03 (Splendor Master Rule Set): mandatory operational buffer after every booking, before the next one on the same vehicle may start. */
function getBookingBufferMs(): number {
  return getRuleValue('bookingOperationalBufferHours', DEFAULT_BOOKING_BUFFER_HOURS) * 60 * 60 * 1000;
}

/**
 * True if [aStart, aEnd] and [bStart, bEnd] conflict once a mandatory
 * buffer is required between the end of one and the start of the other,
 * in EITHER order -- not just a simple date-range overlap. Two bookings
 * with a 1-minute gap are still a conflict if that gap is smaller than
 * the configured buffer.
 */
function rangesConflictWithBuffer(aStart: number, aEnd: number, bStart: number, bEnd: number, bufferMs: number): boolean {
  const aFullyBeforeB = aEnd + bufferMs <= bStart;
  const bFullyBeforeA = bEnd + bufferMs <= aStart;
  return !(aFullyBeforeB || bFullyBeforeA);
}

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
  /** The id of a temporary hold (see placeTemporaryHold) this same caller already placed for this exact vehicle/window -- excluded so converting a hold into a real booking doesn't conflict against itself. */
  excludeHoldId?: string;
  /**
   * Optional durable idempotency key (e.g. from an Idempotency-Key header).
   * When supplied, a retried/double-submitted request with the SAME key
   * replays the original result instead of re-running the conflict check
   * against the reservation it itself already created -- without this, a
   * network-retry of a successful booking would see its own just-created
   * reservation as a date-overlap conflict and fail with a false 409.
   */
  idempotencyKey?: string | null;
}

/**
 * Atomically verifies the vehicle is not under a status block and has no
 * conflicting active contract or confirmed/active/pending reservation for
 * [startIso, endIso], then creates `buildDoc()`'s document in
 * `newCollection` -- all inside one Firestore transaction. Throws
 * AvailabilityConflictError (never writes) if a conflict exists.
 *
 * Returns `replayed: true` when `input.idempotencyKey` matches a previous
 * successful call -- callers MUST skip re-applying their own in-memory
 * cache mutations (globalStore.*.unshift, vehicle status flips, etc.) in
 * that case, the same way POST /api/contracts does for createContractDurable().
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

    // RULE-R04: an active (non-expired), non-excluded temporary hold on an
    // overlapping window for the same vehicle blocks a DIFFERENT caller's
    // booking, same as a confirmed reservation would -- the caller
    // converting their OWN hold into a real booking passes its id via
    // excludeHoldId so it isn't seen as a conflict against itself.
    const holdSnap = await tx.get(db.collection('temporary_holds').where('vehicleId', '==', input.vehicleId));
    for (const doc of holdSnap.docs) {
      if (doc.id === input.excludeHoldId) continue;
      const h = doc.data() as any;
      if (new Date(h.expiresAt).getTime() <= nowMs) continue; // lazily-expired, not a real conflict
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
    tx.create(db.collection(newCollection).doc(doc.id), doc as unknown as Record<string, unknown>);
    if (input.excludeHoldId) {
      // The hold is now redundant (superseded by a real, confirmed
      // booking) -- release it so it doesn't linger and confuse a future
      // conflict scan (it would lazily expire anyway, but there's no
      // reason to wait).
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
  holderKey: string; // whoever is mid-checkout -- session id, customer id, or similar caller-supplied identifier
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

/**
 * RULE-R04 (Splendor Master Rule Set): a short-lived soft hold on a
 * vehicle/window while a customer is mid-checkout (payment/ID step),
 * released automatically once it expires -- no cleanup job needed, since
 * every conflict check (reserveVehicleSlot above, and this function
 * itself) treats a hold whose expiresAt has passed as if it doesn't
 * exist. This is the CRM/server-side primitive; a public booking website
 * would call this when checkout begins and pass the returned hold's id as
 * reserveVehicleSlot's excludeHoldId when the booking is actually
 * confirmed.
 */
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
    tx.create(db.collection('temporary_holds').doc(id), hold as unknown as Record<string, unknown>);
    return hold;
  });
}

/** Releases a hold early (e.g. the customer abandoned checkout) -- safe to call even if it already expired or doesn't exist. */
export async function releaseTemporaryHold(holdId: string): Promise<void> {
  const admin = (await import('firebase-admin')).default;
  await admin.firestore().collection('temporary_holds').doc(holdId).delete();
}
