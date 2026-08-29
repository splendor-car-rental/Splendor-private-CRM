/**
 * Vehicle Inspection & Photo Evidence (Splendor Master Rule Set, Module 08)
 * ===========================================================================
 *
 * Runs against the real Firestore emulator (not a mock) since every
 * mutation here is a genuine Firestore transaction, and listInspections()
 * uses .where() queries the mocked-admin test double in coreWorkflows.test.ts
 * only stubs out (it returns everything, unfiltered) -- see
 * tests/coreWorkflows.test.ts for the separate route-level authorization
 * tests, which don't depend on query filtering.
 */

import { generateKeyPairSync } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let admin: typeof import('firebase-admin');
let db: FirebaseFirestore.Firestore;
let startInspection: typeof import('../src/server/vehicleInspections').startInspection;
let updateInspectionDetails: typeof import('../src/server/vehicleInspections').updateInspectionDetails;
let addDamageMarker: typeof import('../src/server/vehicleInspections').addDamageMarker;
let reviewDamageLiability: typeof import('../src/server/vehicleInspections').reviewDamageLiability;
let registerInspectionPhoto: typeof import('../src/server/vehicleInspections').registerInspectionPhoto;
let acknowledgeInspection: typeof import('../src/server/vehicleInspections').acknowledgeInspection;
let completeInspection: typeof import('../src/server/vehicleInspections').completeInspection;
let voidInspection: typeof import('../src/server/vehicleInspections').voidInspection;
let listInspections: typeof import('../src/server/vehicleInspections').listInspections;
let InspectionError: typeof import('../src/server/vehicleInspections').InspectionError;
let IdempotencyConflictError: typeof import('../src/server/idempotency').IdempotencyConflictError;
let fingerprintRequest: typeof import('../src/server/idempotency').fingerprintRequest;

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-splendor-crm-rules-test';
const INSPECTOR = { uid: 'inspector-uid', name: 'Test Inspector', role: 'operations' as const };
const MANAGER = { uid: 'manager-uid', name: 'Test Manager', role: 'ceo' as const };

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

  ({ startInspection, updateInspectionDetails, addDamageMarker, reviewDamageLiability, registerInspectionPhoto, acknowledgeInspection, completeInspection, voidInspection, listInspections, InspectionError } = await import('../src/server/vehicleInspections'));
  ({ IdempotencyConflictError, fingerprintRequest } = await import('../src/server/idempotency'));
});

afterAll(async () => {
  await Promise.all(admin.apps.map((app) => app?.delete()));
});

async function clearCollection(name: string) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

afterEach(async () => {
  await Promise.all(['vehicle_inspections', 'idempotency_keys'].map(clearCollection));
});

const noopAudit = vi.fn().mockResolvedValue(undefined);

function startInput(overrides: Record<string, unknown> = {}) {
  return { vehicleId: 'VEH-INS-1', vehicleName: 'Test Bentley', type: 'pre_delivery' as const, ...overrides };
}

describe('startInspection', () => {
  it('creates a draft inspection with photo requirements snapshotted from the type config', async () => {
    const { result } = await startInspection(startInput(), INSPECTOR, 'key-1', fingerprintRequest(startInput()), noopAudit);
    expect(result.status).toBe('draft');
    expect(result.damages).toEqual([]);
    expect(result.photos).toEqual([]);
    expect(result.requiredPhotoCategories).toContain('front');
    expect(result.inspectorId).toBe(INSPECTOR.uid);
    expect(noopAudit).toHaveBeenCalled();
  });

  it('requires a contract for a handover or return inspection', async () => {
    await expect(
      startInspection(startInput({ type: 'handover' }), INSPECTOR, null, undefined, noopAudit)
    ).rejects.toBeInstanceOf(InspectionError);
  });

  it('replays the same result for a repeated Idempotency-Key with the same body -- no duplicate record created', async () => {
    const body = startInput();
    const first = await startInspection(body, INSPECTOR, 'dup-key', fingerprintRequest(body), noopAudit);
    const second = await startInspection(body, INSPECTOR, 'dup-key', fingerprintRequest(body), noopAudit);
    expect(second.replayed).toBe(true);
    expect(second.result.id).toBe(first.result.id);

    const snap = await db.collection('vehicle_inspections').get();
    expect(snap.docs.length).toBe(1);
  });

  it('rejects the same Idempotency-Key reused for a genuinely different request', async () => {
    await startInspection(startInput(), INSPECTOR, 'conflict-key', fingerprintRequest(startInput()), noopAudit);
    await expect(
      startInspection(startInput({ vehicleId: 'VEH-DIFFERENT' }), INSPECTOR, 'conflict-key', fingerprintRequest(startInput({ vehicleId: 'VEH-DIFFERENT' })), noopAudit)
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  // The real concurrent-double-submission race (two identical requests,
  // same Idempotency-Key, truly simultaneous) is tested at the HTTP layer
  // in tests/coreWorkflows.test.ts against the MOCKED Firestore admin
  // instead of here: runIdempotentCreate's loser-side wait loop is bounded
  // (10 x 150ms), and this sandbox's real Firestore emulator transaction
  // latency can exceed that window, which would make an assertion of
  // "both requests always succeed identically" flaky here through no fault
  // of the idempotency primitive itself (the same bounded wait is already
  // relied on by every other module using runIdempotentCreate). The mocked
  // suite's in-memory Firestore has no such latency, so it reliably proves
  // the "one winner, one replay, never two records" guarantee.
});

describe('damage classification and liability review', () => {
  it('pre_existing damage needs no liability review; new/uncertain damage opens one pending review', async () => {
    const { result: inspection } = await startInspection(startInput({ vehicleId: 'VEH-DMG-1' }), INSPECTOR, null, undefined, noopAudit);

    const withPreExisting = await addDamageMarker(inspection.id, {
      part: 'front_bumper', severity: 'minor_scratch', classification: 'pre_existing', description: 'Old scuff on arrival.'
    }, INSPECTOR, noopAudit);
    expect(withPreExisting.damages[0].liabilityStatus).toBe('not_applicable');

    const withNew = await addDamageMarker(inspection.id, {
      part: 'hood', severity: 'dent', classification: 'new', description: 'Fresh dent found at return.'
    }, INSPECTOR, noopAudit);
    expect(withNew.damages[1].liabilityStatus).toBe('pending_review');
  });

  it('never auto-creates a financial charge -- new damage only ever sets a review flag', async () => {
    const { result: inspection } = await startInspection(startInput({ vehicleId: 'VEH-DMG-2' }), INSPECTOR, null, undefined, noopAudit);
    const updated = await addDamageMarker(inspection.id, {
      part: 'rear_bumper', severity: 'dent', classification: 'new', description: 'Dent found.'
    }, INSPECTOR, noopAudit);
    expect(updated.damages[0]).not.toHaveProperty('chargeAmount');
    expect(updated.damages[0]).not.toHaveProperty('charged');
    expect(updated.damages[0].liabilityStatus).toBe('pending_review');
  });

  it('a reviewer decision requires a note and rejects reviewing pre-existing damage', async () => {
    const { result: inspection } = await startInspection(startInput({ vehicleId: 'VEH-DMG-3' }), INSPECTOR, null, undefined, noopAudit);
    const withDamage = await addDamageMarker(inspection.id, {
      part: 'left_door', severity: 'deep_scratch', classification: 'uncertain', description: 'Not sure if pre-existing.'
    }, INSPECTOR, noopAudit);
    const damageId = withDamage.damages[0].id;

    await expect(
      reviewDamageLiability(inspection.id, { damageId, liabilityStatus: 'customer_liable', reviewNotes: '' }, MANAGER, noopAudit)
    ).rejects.toBeInstanceOf(InspectionError);

    const reviewed = await reviewDamageLiability(inspection.id, { damageId, liabilityStatus: 'customer_liable', reviewNotes: 'Confirmed against handover photos.' }, MANAGER, noopAudit);
    expect(reviewed.damages[0].liabilityStatus).toBe('customer_liable');
    expect(reviewed.damages[0].reviewedByName).toBe(MANAGER.name);

    const preExisting = await addDamageMarker(inspection.id, {
      part: 'roof', severity: 'paint_chip', classification: 'pre_existing', description: 'Known chip.'
    }, INSPECTOR, noopAudit);
    const preExistingId = preExisting.damages[1].id;
    await expect(
      reviewDamageLiability(inspection.id, { damageId: preExistingId, liabilityStatus: 'customer_liable', reviewNotes: 'x' }, MANAGER, noopAudit)
    ).rejects.toBeInstanceOf(InspectionError);
  });
});

describe('photo evidence', () => {
  it('assigns an incrementing sequence number per category', async () => {
    const { result: inspection } = await startInspection(startInput({ vehicleId: 'VEH-PHOTO-1' }), INSPECTOR, null, undefined, noopAudit);
    const p1 = await registerInspectionPhoto(inspection.id, { category: 'front', documentPath: 'vehicle-inspections/x/1.jpg', fileUrl: '/api/documents/file?path=x' }, INSPECTOR, noopAudit);
    const p2 = await registerInspectionPhoto(inspection.id, { category: 'front', documentPath: 'vehicle-inspections/x/2.jpg', fileUrl: '/api/documents/file?path=x2' }, INSPECTOR, noopAudit);
    const p3 = await registerInspectionPhoto(inspection.id, { category: 'rear', documentPath: 'vehicle-inspections/x/3.jpg', fileUrl: '/api/documents/file?path=x3' }, INSPECTOR, noopAudit);

    expect(p1.photos[0].sequence).toBe(1);
    expect(p2.photos[1].sequence).toBe(2);
    expect(p3.photos[2].sequence).toBe(1); // different category, own sequence
    expect(p3.photos[2].uploadedByName).toBe(INSPECTOR.name);
  });

  it('rejects a photo registration missing the uploaded document reference', async () => {
    const { result: inspection } = await startInspection(startInput({ vehicleId: 'VEH-PHOTO-2' }), INSPECTOR, null, undefined, noopAudit);
    await expect(
      registerInspectionPhoto(inspection.id, { category: 'front' } as any, INSPECTOR, noopAudit)
    ).rejects.toBeInstanceOf(InspectionError);
  });
});

describe('completion gate', () => {
  async function fillRequiredPhotos(inspectionId: string, categories: string[]) {
    for (const category of categories) {
      await registerInspectionPhoto(inspectionId, { category: category as any, documentPath: `vehicle-inspections/${inspectionId}/${category}.jpg`, fileUrl: `/api/documents/file?path=${category}` }, INSPECTOR, noopAudit);
    }
  }

  it('refuses completion while required photo categories are missing', async () => {
    const { result: inspection } = await startInspection(startInput({ vehicleId: 'VEH-COMPLETE-1' }), INSPECTOR, null, undefined, noopAudit);
    await expect(completeInspection(inspection.id, null, INSPECTOR, noopAudit)).rejects.toBeInstanceOf(InspectionError);
  });

  it('refuses completion of a handover inspection without customer acknowledgement, but allows an in_rental spot-check with no customer present', async () => {
    const { result: handover } = await startInspection(startInput({ vehicleId: 'VEH-COMPLETE-2', type: 'handover', contractId: 'CON-COMPLETE-2', contractNumber: 'CON-COMPLETE-2' }), INSPECTOR, null, undefined, noopAudit);
    await fillRequiredPhotos(handover.id, ['front', 'rear', 'left', 'right', 'interior', 'dashboard_odometer', 'fuel_gauge']);
    await expect(completeInspection(handover.id, null, INSPECTOR, noopAudit)).rejects.toBeInstanceOf(InspectionError);
    await acknowledgeInspection(handover.id, { acknowledgedByName: 'Jane Customer' }, INSPECTOR, noopAudit);
    const { result: nowCompleted } = await completeInspection(handover.id, null, INSPECTOR, noopAudit);
    expect(nowCompleted.status).toBe('completed');

    // in_rental doesn't require acknowledgement (no customer present for a
    // spot-check) -- proving the gate is type-specific, not a blanket rule.
    const { result: inRental } = await startInspection(startInput({ vehicleId: 'VEH-COMPLETE-2b', type: 'in_rental' }), INSPECTOR, null, undefined, noopAudit);
    await fillRequiredPhotos(inRental.id, ['damage']);
    const { result: completed } = await completeInspection(inRental.id, null, INSPECTOR, noopAudit);
    expect(completed.status).toBe('completed');
  });

  it('refuses completion while a damage record still has a pending liability review', async () => {
    const { result: inspection } = await startInspection(startInput({ vehicleId: 'VEH-COMPLETE-3', type: 'in_rental' }), INSPECTOR, null, undefined, noopAudit);
    await fillRequiredPhotos(inspection.id, ['damage']);
    await addDamageMarker(inspection.id, { part: 'hood', severity: 'dent', classification: 'new', description: 'Dent.' }, INSPECTOR, noopAudit);
    await expect(completeInspection(inspection.id, null, INSPECTOR, noopAudit)).rejects.toBeInstanceOf(InspectionError);
  });

  it('completes successfully once photos, acknowledgement, and damage review are all satisfied, and becomes immutable', async () => {
    const { result: inspection } = await startInspection(startInput({ vehicleId: 'VEH-COMPLETE-4', type: 'handover', contractId: 'CON-TEST-1', contractNumber: 'CON-TEST-1' }), INSPECTOR, null, undefined, noopAudit);
    await fillRequiredPhotos(inspection.id, ['front', 'rear', 'left', 'right', 'interior', 'dashboard_odometer', 'fuel_gauge']);
    await acknowledgeInspection(inspection.id, { acknowledgedByName: 'Jane Customer' }, INSPECTOR, noopAudit);

    const { result: completed, replayed } = await completeInspection(inspection.id, 'complete-key', INSPECTOR, noopAudit);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeTruthy();
    expect(replayed).toBe(false);

    // Idempotent re-completion (double-click / retry) is a safe no-op, not an error.
    const second = await completeInspection(inspection.id, 'complete-key', INSPECTOR, noopAudit);
    expect(second.result.status).toBe('completed');

    // Evidence is now immutable -- no further mutation succeeds.
    await expect(
      registerInspectionPhoto(inspection.id, { category: 'other', documentPath: 'x', fileUrl: 'y' }, INSPECTOR, noopAudit)
    ).rejects.toBeInstanceOf(InspectionError);
    await expect(
      addDamageMarker(inspection.id, { part: 'hood', severity: 'dent', classification: 'new', description: 'x' }, INSPECTOR, noopAudit)
    ).rejects.toBeInstanceOf(InspectionError);
    await expect(
      updateInspectionDetails(inspection.id, { notes: 'late edit attempt' }, INSPECTOR, noopAudit)
    ).rejects.toBeInstanceOf(InspectionError);
  }, 15000);
});

describe('voidInspection', () => {
  it('voids a draft inspection but refuses to void an already-completed one', async () => {
    const { result: draft } = await startInspection(startInput({ vehicleId: 'VEH-VOID-1' }), INSPECTOR, null, undefined, noopAudit);
    const voided = await voidInspection(draft.id, 'Started in error -- wrong vehicle selected.', MANAGER, noopAudit);
    expect(voided.status).toBe('voided');
    expect(voided.voidedByName).toBe(MANAGER.name);

    await expect(
      voidInspection(draft.id, 'trying again', MANAGER, noopAudit)
    ).rejects.toBeInstanceOf(InspectionError);

    const { result: completedInspection } = await startInspection(startInput({ vehicleId: 'VEH-VOID-2', type: 'in_rental' }), INSPECTOR, null, undefined, noopAudit);
    await registerInspectionPhoto(completedInspection.id, { category: 'damage', documentPath: 'x', fileUrl: 'y' }, INSPECTOR, noopAudit);
    await completeInspection(completedInspection.id, null, INSPECTOR, noopAudit);
    await expect(
      voidInspection(completedInspection.id, 'too late', MANAGER, noopAudit)
    ).rejects.toBeInstanceOf(InspectionError);
  });
});

describe('listInspections filtering', () => {
  it('filters by vehicleId and by contractId independently', async () => {
    await startInspection(startInput({ vehicleId: 'VEH-LIST-A' }), INSPECTOR, null, undefined, noopAudit);
    await startInspection(startInput({ vehicleId: 'VEH-LIST-A', type: 'in_rental' }), INSPECTOR, null, undefined, noopAudit);
    await startInspection(startInput({ vehicleId: 'VEH-LIST-B', type: 'handover', contractId: 'CON-LIST-1', contractNumber: 'CON-LIST-1' }), INSPECTOR, null, undefined, noopAudit);

    const forVehicleA = await listInspections({ vehicleId: 'VEH-LIST-A' });
    expect(forVehicleA.length).toBe(2);
    expect(forVehicleA.every(i => i.vehicleId === 'VEH-LIST-A')).toBe(true);

    const forContract = await listInspections({ contractId: 'CON-LIST-1' });
    expect(forContract.length).toBe(1);
    expect(forContract[0].vehicleId).toBe('VEH-LIST-B');
  });
});
