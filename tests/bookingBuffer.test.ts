/**
 * Booking Operational Buffer & Temporary Soft Hold (RULE-R03/R04)
 * =================================================================
 *
 * RULE-R03: a mandatory operational buffer (default 3 hours, configurable
 * via the Business Rules Engine) is required after every booking's end
 * before the next booking on the same vehicle may start -- confirmed
 * missing from the pre-existing reserveVehicleSlot() (a plain date-range
 * overlap check, zero buffer) in this session's Master Requirements Map.
 *
 * RULE-R04: a short-lived (default 10 minutes) soft hold on a vehicle/
 * window during checkout, auto-releasing via lazy expiry once its window
 * passes -- no cleanup job required.
 *
 * Runs against the real Firestore emulator, same pattern as
 * tests/durablePersistence.test.ts, since these are genuine Firestore-
 * transaction behaviors a mock can't meaningfully prove.
 */

import { generateKeyPairSync } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

let admin: typeof import('firebase-admin');
let db: FirebaseFirestore.Firestore;
let reserveVehicleSlot: typeof import('../src/server/availability').reserveVehicleSlot;
let placeTemporaryHold: typeof import('../src/server/availability').placeTemporaryHold;
let releaseTemporaryHold: typeof import('../src/server/availability').releaseTemporaryHold;
let AvailabilityConflictError: typeof import('../src/server/availability').AvailabilityConflictError;

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-splendor-crm-rules-test';

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set -- run via `npm test` (firebase emulators:exec), not vitest directly.');
  }

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const fakeServiceAccount = {
    type: 'service_account',
    project_id: PROJECT_ID,
    private_key_id: 'test-key',
    private_key: privateKey,
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`,
    client_id: '000000000000000000000',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token'
  };

  const adminModule = await import('firebase-admin');
  admin = adminModule.default ?? (adminModule as any);
  admin.initializeApp({ credential: admin.credential.cert(fakeServiceAccount as any), projectId: PROJECT_ID });
  db = admin.firestore();

  ({ reserveVehicleSlot, placeTemporaryHold, releaseTemporaryHold, AvailabilityConflictError } = await import('../src/server/availability'));
});

afterAll(async () => {
  await Promise.all(admin.apps.map((app) => app?.delete()));
});

async function clearCollection(name: string) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

afterEach(async () => {
  await Promise.all(['vehicles', 'reservations', 'contracts', 'temporary_holds', 'idempotency_keys'].map(clearCollection));
});

async function seedVehicle(id: string, overrides: Record<string, unknown> = {}) {
  await db.collection('vehicles').doc(id).set({
    id, make: 'Bentley', model: 'Continental GT', plateCity: 'Dubai', plateNumber: 'C 55555',
    vin: 'VINBUF1', dailyRate: 3000, minDeposit: 6000, status: 'available', ...overrides
  });
}

describe('RULE-R03: mandatory 3-hour operational buffer between bookings', () => {
  it('rejects a booking starting less than the buffer after a prior booking ends, even though the date ranges do not literally overlap', async () => {
    await seedVehicle('VEH-BUF-1');
    await reserveVehicleSlot(
      { vehicleId: 'VEH-BUF-1', startIso: '2026-09-01T08:00:00.000Z', endIso: '2026-09-01T10:00:00.000Z' },
      'reservations',
      () => ({ id: 'RES-BUF-1', vehicleId: 'VEH-BUF-1', pickupDateTime: '2026-09-01T08:00:00.000Z', returnDateTime: '2026-09-01T10:00:00.000Z', status: 'confirmed' })
    );

    // Starts 1 hour after the prior booking's return -- inside the default
    // 3-hour buffer, so this must be rejected even though 10:00-11:00 and
    // 11:00-13:00 don't overlap as plain date ranges.
    await expect(
      reserveVehicleSlot(
        { vehicleId: 'VEH-BUF-1', startIso: '2026-09-01T11:00:00.000Z', endIso: '2026-09-01T13:00:00.000Z' },
        'reservations',
        () => ({ id: 'RES-BUF-2', vehicleId: 'VEH-BUF-1', pickupDateTime: '2026-09-01T11:00:00.000Z', returnDateTime: '2026-09-01T13:00:00.000Z', status: 'confirmed' })
      )
    ).rejects.toBeInstanceOf(AvailabilityConflictError);
  });

  it('accepts a booking starting exactly at or after the buffer window', async () => {
    await seedVehicle('VEH-BUF-2');
    await reserveVehicleSlot(
      { vehicleId: 'VEH-BUF-2', startIso: '2026-09-01T08:00:00.000Z', endIso: '2026-09-01T10:00:00.000Z' },
      'reservations',
      () => ({ id: 'RES-BUF-3', vehicleId: 'VEH-BUF-2', pickupDateTime: '2026-09-01T08:00:00.000Z', returnDateTime: '2026-09-01T10:00:00.000Z', status: 'confirmed' })
    );

    // Starts exactly 3 hours after the prior booking's return -- respects
    // the default buffer, must succeed.
    const { doc } = await reserveVehicleSlot(
      { vehicleId: 'VEH-BUF-2', startIso: '2026-09-01T13:00:00.000Z', endIso: '2026-09-01T15:00:00.000Z' },
      'reservations',
      () => ({ id: 'RES-BUF-4', vehicleId: 'VEH-BUF-2', pickupDateTime: '2026-09-01T13:00:00.000Z', returnDateTime: '2026-09-01T15:00:00.000Z', status: 'confirmed' })
    );
    expect(doc.id).toBe('RES-BUF-4');
  });

  it('applies the buffer symmetrically -- a new booking ending less than the buffer before an EXISTING booking is also rejected', async () => {
    await seedVehicle('VEH-BUF-3');
    await reserveVehicleSlot(
      { vehicleId: 'VEH-BUF-3', startIso: '2026-09-05T12:00:00.000Z', endIso: '2026-09-05T14:00:00.000Z' },
      'reservations',
      () => ({ id: 'RES-BUF-5', vehicleId: 'VEH-BUF-3', pickupDateTime: '2026-09-05T12:00:00.000Z', returnDateTime: '2026-09-05T14:00:00.000Z', status: 'confirmed' })
    );

    // Ends 1 hour before the existing booking starts -- inside the buffer.
    await expect(
      reserveVehicleSlot(
        { vehicleId: 'VEH-BUF-3', startIso: '2026-09-05T09:00:00.000Z', endIso: '2026-09-05T11:00:00.000Z' },
        'reservations',
        () => ({ id: 'RES-BUF-6', vehicleId: 'VEH-BUF-3', pickupDateTime: '2026-09-05T09:00:00.000Z', returnDateTime: '2026-09-05T11:00:00.000Z', status: 'confirmed' })
      )
    ).rejects.toBeInstanceOf(AvailabilityConflictError);
  });
});

describe('RULE-R04: temporary soft hold with lazy expiry', () => {
  it('placing a hold blocks a different caller from booking the same window', async () => {
    await seedVehicle('VEH-HOLD-1');
    await placeTemporaryHold({ vehicleId: 'VEH-HOLD-1', startIso: '2026-09-10T10:00:00.000Z', endIso: '2026-09-10T12:00:00.000Z', holderKey: 'customer-A' });

    await expect(
      reserveVehicleSlot(
        { vehicleId: 'VEH-HOLD-1', startIso: '2026-09-10T10:00:00.000Z', endIso: '2026-09-10T12:00:00.000Z' },
        'reservations',
        () => ({ id: 'RES-HOLD-1', vehicleId: 'VEH-HOLD-1', pickupDateTime: '2026-09-10T10:00:00.000Z', returnDateTime: '2026-09-10T12:00:00.000Z', status: 'confirmed' })
      )
    ).rejects.toBeInstanceOf(AvailabilityConflictError);
  });

  it('the SAME caller can convert their own hold into a real booking via excludeHoldId, without it counting as a self-conflict', async () => {
    await seedVehicle('VEH-HOLD-2');
    const hold = await placeTemporaryHold({ vehicleId: 'VEH-HOLD-2', startIso: '2026-09-11T10:00:00.000Z', endIso: '2026-09-11T12:00:00.000Z', holderKey: 'customer-B' });

    const { doc } = await reserveVehicleSlot(
      { vehicleId: 'VEH-HOLD-2', startIso: '2026-09-11T10:00:00.000Z', endIso: '2026-09-11T12:00:00.000Z', excludeHoldId: hold.id },
      'reservations',
      () => ({ id: 'RES-HOLD-2', vehicleId: 'VEH-HOLD-2', pickupDateTime: '2026-09-11T10:00:00.000Z', returnDateTime: '2026-09-11T12:00:00.000Z', status: 'confirmed' })
    );
    expect(doc.id).toBe('RES-HOLD-2');

    // The now-redundant hold was cleaned up as part of confirming the booking.
    const holdSnap = await db.collection('temporary_holds').doc(hold.id).get();
    expect(holdSnap.exists).toBe(false);
  });

  it('an expired hold no longer blocks anyone -- lazy expiry, no cleanup job needed', async () => {
    await seedVehicle('VEH-HOLD-3');
    // Place a hold that's already expired (simulating one placed long ago
    // and never converted or explicitly released) -- expiresAt computed
    // relative to the real clock, not a fixed literal, so this is robust
    // regardless of what "today" actually is.
    const alreadyExpiredHold = {
      id: 'HOLD-EXPIRED-1', vehicleId: 'VEH-HOLD-3',
      startIso: '2026-09-12T10:00:00.000Z', endIso: '2026-09-12T12:00:00.000Z',
      holderKey: 'customer-C', createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
    };
    await db.collection('temporary_holds').doc('HOLD-EXPIRED-1').set(alreadyExpiredHold);

    const { doc } = await reserveVehicleSlot(
      { vehicleId: 'VEH-HOLD-3', startIso: '2026-09-12T10:00:00.000Z', endIso: '2026-09-12T12:00:00.000Z' },
      'reservations',
      () => ({ id: 'RES-HOLD-3', vehicleId: 'VEH-HOLD-3', pickupDateTime: '2026-09-12T10:00:00.000Z', returnDateTime: '2026-09-12T12:00:00.000Z', status: 'confirmed' })
    );
    expect(doc.id).toBe('RES-HOLD-3');
  });

  it('explicitly releasing a hold frees the window immediately, without waiting for expiry', async () => {
    await seedVehicle('VEH-HOLD-4');
    const hold = await placeTemporaryHold({ vehicleId: 'VEH-HOLD-4', startIso: '2026-09-13T10:00:00.000Z', endIso: '2026-09-13T12:00:00.000Z', holderKey: 'customer-D' });
    await releaseTemporaryHold(hold.id);

    const { doc } = await reserveVehicleSlot(
      { vehicleId: 'VEH-HOLD-4', startIso: '2026-09-13T10:00:00.000Z', endIso: '2026-09-13T12:00:00.000Z' },
      'reservations',
      () => ({ id: 'RES-HOLD-4', vehicleId: 'VEH-HOLD-4', pickupDateTime: '2026-09-13T10:00:00.000Z', returnDateTime: '2026-09-13T12:00:00.000Z', status: 'confirmed' })
    );
    expect(doc.id).toBe('RES-HOLD-4');
  });

  it('two concurrent hold requests for the same window: exactly one succeeds', async () => {
    await seedVehicle('VEH-HOLD-5');
    const outcomes = await Promise.allSettled([
      placeTemporaryHold({ vehicleId: 'VEH-HOLD-5', startIso: '2026-09-14T10:00:00.000Z', endIso: '2026-09-14T12:00:00.000Z', holderKey: 'customer-E' }),
      placeTemporaryHold({ vehicleId: 'VEH-HOLD-5', startIso: '2026-09-14T10:00:00.000Z', endIso: '2026-09-14T12:00:00.000Z', holderKey: 'customer-F' })
    ]);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);
  });
});
