/**
 * Preventive Maintenance Scheduling (RULE-M01-M03, Splendor Master Rule Set)
 * ===========================================================================
 *
 * RULE-M01/M02: maintenanceStatus auto-recomputes from mileage alone
 * (computeMaintenanceScheduleUpdate), using the configurable
 * maintenanceOilFilterIntervalKm/maintenanceAlertLeadKm Business Rules.
 * RULE-M03: startMaintenance/logMaintenanceCompleted are genuine Firestore
 * transactions (read-then-write on the vehicle doc), so this runs against
 * the real emulator rather than a mock, same pattern as
 * tests/bookingBuffer.test.ts and tests/durablePersistence.test.ts.
 */

import { generateKeyPairSync } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let admin: typeof import('firebase-admin');
let db: FirebaseFirestore.Firestore;
let computeMaintenanceScheduleUpdate: typeof import('../src/server/maintenance').computeMaintenanceScheduleUpdate;
let startMaintenance: typeof import('../src/server/maintenance').startMaintenance;
let logMaintenanceCompleted: typeof import('../src/server/maintenance').logMaintenanceCompleted;
let MaintenanceError: typeof import('../src/server/maintenance').MaintenanceError;

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-splendor-crm-rules-test';
const ACTOR = { uid: 'fleet-uid', name: 'Test Fleet', role: 'fleet' as const };

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

  ({ computeMaintenanceScheduleUpdate, startMaintenance, logMaintenanceCompleted, MaintenanceError } = await import('../src/server/maintenance'));
});

afterAll(async () => {
  await Promise.all(admin.apps.map((app) => app?.delete()));
});

async function clearCollection(name: string) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

afterEach(async () => {
  await Promise.all(['vehicles', 'system_state'].map(clearCollection));
});

async function seedVehicle(id: string, overrides: Record<string, unknown> = {}) {
  await db.collection('vehicles').doc(id).set({
    id, make: 'Toyota', model: 'Land Cruiser', status: 'available',
    mileage: 5000, lastMaintenanceMileage: 0, maintenanceStatus: 'optimal', timeline: [],
    ...overrides
  });
}

describe('RULE-M02: computeMaintenanceScheduleUpdate (pure mileage recompute)', () => {
  it('stays optimal when mileage is well below the next threshold', () => {
    const update = computeMaintenanceScheduleUpdate({ lastMaintenanceMileage: 0, maintenanceStatus: 'optimal' }, 3000);
    expect(update.maintenanceStatus).toBe('optimal');
    expect(update.nextMaintenanceMileage).toBe(7000); // default interval
  });

  it('flips to due_soon once mileage enters the alert lead window before the threshold', () => {
    // default interval 7000, default lead 500 -> due_soon starts at 6500
    const update = computeMaintenanceScheduleUpdate({ lastMaintenanceMileage: 0, maintenanceStatus: 'optimal' }, 6600);
    expect(update.maintenanceStatus).toBe('due_soon');
  });

  it('never overwrites an in_service vehicle -- that is a human signal, not mileage-driven', () => {
    const update = computeMaintenanceScheduleUpdate({ lastMaintenanceMileage: 0, maintenanceStatus: 'in_service', nextMaintenanceMileage: 7000 }, 9000);
    expect(update).toEqual({});
  });

  it('keeps an already-initialized nextMaintenanceMileage instead of re-deriving it from lastMaintenanceMileage', () => {
    const update = computeMaintenanceScheduleUpdate({ lastMaintenanceMileage: 2000, nextMaintenanceMileage: 12000, maintenanceStatus: 'optimal' }, 8000);
    expect(update.nextMaintenanceMileage).toBe(12000);
    expect(update.maintenanceStatus).toBe('optimal');
  });
});

describe('RULE-M03: startMaintenance / logMaintenanceCompleted (real Firestore transactions)', () => {
  it('starts maintenance: flips status to maintenance, maintenanceStatus to in_service, and appends a timeline event', async () => {
    await seedVehicle('VEH-MX-1', { maintenanceStatus: 'due_soon' });
    const recordAudit = vi.fn().mockResolvedValue(undefined);

    const updated = await startMaintenance('VEH-MX-1', ACTOR, recordAudit, 'Scheduled 7,000 km service');
    expect(updated.status).toBe('maintenance');
    expect(updated.maintenanceStatus).toBe('in_service');
    expect(updated.timeline).toHaveLength(1);
    expect(updated.timeline[0].action).toBe('MAINTENANCE_STARTED');
    expect(recordAudit).toHaveBeenCalledTimes(1);

    const persisted = (await db.collection('vehicles').doc('VEH-MX-1').get()).data();
    expect(persisted?.status).toBe('maintenance');
    expect(persisted?.maintenanceStatus).toBe('in_service');
  });

  it('refuses to start maintenance on a vehicle that is currently rented or reserved', async () => {
    await seedVehicle('VEH-MX-2', { status: 'rented' });
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    await expect(startMaintenance('VEH-MX-2', ACTOR, recordAudit, 'Test')).rejects.toBeInstanceOf(MaintenanceError);
  });

  it('logs a completed service: resets the interval from the service mileage, clears in_service, and returns the vehicle to available', async () => {
    await seedVehicle('VEH-MX-3', { status: 'maintenance', maintenanceStatus: 'in_service', mileage: 7200, lastMaintenanceMileage: 0 });
    const recordAudit = vi.fn().mockResolvedValue(undefined);

    const updated = await logMaintenanceCompleted({ vehicleId: 'VEH-MX-3', mileageAtService: 7200, notes: 'Oil + filter changed' }, ACTOR, recordAudit);
    expect(updated.status).toBe('available');
    expect(updated.maintenanceStatus).toBe('optimal');
    expect(updated.lastMaintenanceMileage).toBe(7200);
    expect(updated.nextMaintenanceMileage).toBe(7200 + 7000); // default interval
    expect(updated.timeline.some((e: any) => e.action === 'MAINTENANCE_LOGGED')).toBe(true);
  });

  it('defaults the service mileage to the vehicle current odometer reading when not explicitly provided', async () => {
    await seedVehicle('VEH-MX-4', { mileage: 9999 });
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const updated = await logMaintenanceCompleted({ vehicleId: 'VEH-MX-4' }, ACTOR, recordAudit);
    expect(updated.lastMaintenanceMileage).toBe(9999);
  });

  it('rejects a service mileage lower than the last recorded service -- an odometer cannot go backwards', async () => {
    await seedVehicle('VEH-MX-5', { lastMaintenanceMileage: 20000, mileage: 25000 });
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    await expect(
      logMaintenanceCompleted({ vehicleId: 'VEH-MX-5', mileageAtService: 15000 }, ACTOR, recordAudit)
    ).rejects.toBeInstanceOf(MaintenanceError);
  });
});
