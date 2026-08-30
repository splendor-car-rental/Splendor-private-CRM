/**
 * Vehicle Master Profile & Verified Vehicle Catalog
 * ===================================================
 *
 * Covers the required scenarios from the mission brief:
 *  - Add flow (POST /api/fleet) accepts the new classification/technical
 *    fields with zero server changes to the generic route.
 *  - Edit flow (PUT /api/fleet/:id) proves zero data loss: editing one
 *    field never wipes any other previously-set field.
 *  - Master Catalog: manufacturer/model lists never leak across
 *    manufacturers; a staff-proposed new model stays PENDING until an
 *    authorized, DIFFERENT person approves it (Four-Eyes/SoD reused as-is);
 *    a rejected proposal never enters the catalog.
 *  - Verified Publish Gate: an incomplete/unconfirmed vehicle is BLOCKED
 *    from publish with the exact missing reasons; a complete one succeeds;
 *    editing a published vehicle's core data re-verifies and auto-unpublishes
 *    if that edit leaves required data missing.
 *  - toPublicVehicleDTO never fabricates a features list or a mileage
 *    fallback, and never leaks internal purchase/financing data.
 *
 * ISOLATION: firebase-admin is fully mocked (same in-memory Firestore
 * simulation as tests/massAssignment.test.ts) -- no real Firebase project
 * is contacted.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import request from 'supertest';
import type { Vehicle } from '../src/types';

vi.mock('firebase-admin', () => {
  const appsArr: any[] = [];
  const verifyIdToken = vi.fn();
  const usersDb = new Map<string, { role: string; name: string }>();
  const store = new Map<string, Map<string, any>>();
  const collectionOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  const makeDocRef = (collectionName: string, id: string) => ({
    id,
    __collection: collectionName,
    get: async () => {
      if (collectionName === 'users') {
        const u = usersDb.get(id);
        return { exists: !!u, data: () => u, id };
      }
      const data = collectionOf(collectionName).get(id);
      return { exists: data !== undefined, data: () => data, id };
    },
    set: async (data: any, opts?: { merge?: boolean }) => {
      const col = collectionOf(collectionName);
      const existing = col.get(id);
      col.set(id, opts?.merge && existing ? { ...existing, ...data } : data);
    },
    create: async (data: any) => {
      const col = collectionOf(collectionName);
      if (col.has(id)) {
        const err: any = new Error('ALREADY_EXISTS');
        err.code = 6;
        throw err;
      }
      col.set(id, data);
    },
    delete: async () => {
      collectionOf(collectionName).delete(id);
    }
  });

  const makeCollectionRef = (name: string): any => ({
    doc: (id: string) => makeDocRef(name, id),
    get: async () => {
      const col = collectionOf(name);
      const docs = Array.from(col.entries()).map(([id, data]) => ({ id, data: () => data }));
      return { docs, size: docs.length };
    },
    where: (field: string, op: string, value: any) => ({
      ...makeCollectionRef(name),
      get: async () => {
        const col = collectionOf(name);
        const docs = Array.from(col.entries())
          .filter(([, data]) => data && data[field] === value)
          .map(([id, data]) => ({ id, data: () => data }));
        return { docs, size: docs.length };
      }
    })
  });

  const firestoreObj: any = {
    collection: (name: string) => makeCollectionRef(name),
    batch: () => {
      const ops: Array<() => void> = [];
      const applySet = (ref: any, data: any, opts?: { merge?: boolean }) => {
        const col = collectionOf(ref.__collection);
        const existing = col.get(ref.id);
        col.set(ref.id, opts?.merge && existing ? { ...existing, ...data } : data);
      };
      return {
        set: (ref: any, data: any, opts?: any) => ops.push(() => applySet(ref, data, opts)),
        create: (ref: any, data: any) => ops.push(() => collectionOf(ref.__collection).set(ref.id, data)),
        delete: (ref: any) => ops.push(() => collectionOf(ref.__collection).delete(ref.id)),
        commit: async () => { ops.forEach((op) => op()); }
      };
    },
    runTransaction: async (fn: any) => {
      const applySet = (ref: any, data: any, opts?: { merge?: boolean }) => {
        const col = collectionOf(ref.__collection);
        const existing = col.get(ref.id);
        col.set(ref.id, opts?.merge && existing ? { ...existing, ...data } : data);
      };
      const tx = {
        get: async (refOrQuery: any) => refOrQuery.get(),
        set: (ref: any, data: any, opts?: any) => applySet(ref, data, opts),
        create: (ref: any, data: any) => {
          const col = collectionOf(ref.__collection);
          if (col.has(ref.id)) {
            const err: any = new Error('ALREADY_EXISTS');
            err.code = 6;
            throw err;
          }
          col.set(ref.id, data);
        },
        delete: (ref: any) => collectionOf(ref.__collection).delete(ref.id)
      };
      return fn(tx, firestoreObj);
    }
  };

  const admin: any = {
    apps: appsArr,
    credential: { cert: (x: any) => x },
    initializeApp: (_opts: any) => { appsArr.push({}); },
    auth: () => ({ verifyIdToken }),
    firestore: () => firestoreObj,
    storage: () => ({ bucket: () => ({ file: () => ({}) }) }),
    __test: { verifyIdToken, usersDb, appsArr, store }
  };

  return { default: admin };
});

let app: any;
let globalStore: any;
let adminMock: { verifyIdToken: Mock; usersDb: Map<string, { role: string; name: string }> };

const CEO_UID = 'ceo-uid';
const ADMIN_UID = 'admin2-uid';
const FLEET_UID = 'fleet-uid';

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(CEO_UID, { role: 'ceo', name: 'Test CEO' });
  adminMock.usersDb.set(ADMIN_UID, { role: 'admin', name: 'Second Admin' });
  adminMock.usersDb.set(FLEET_UID, { role: 'fleet', name: 'Fleet Staff' });

  const serverModule = await import('../server');
  app = serverModule.default;

  const dataStoreModule = await import('../src/server/dataStore');
  globalStore = dataStoreModule.globalStore;
});

afterAll(() => {
  delete process.env.VERCEL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
});

beforeEach(() => {
  adminMock.verifyIdToken.mockReset();
});

afterEach(() => {
  globalStore.vehicles.length = 0;
});

function authAs(uid: string) {
  adminMock.verifyIdToken.mockResolvedValueOnce({ uid });
  return { Authorization: 'Bearer test-token' };
}

function fullVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'VEH-TEST',
    vin: 'VIN0001',
    plateNumber: 'A 1',
    plateCity: 'Dubai',
    make: 'Ferrari',
    model: '296 GTB',
    year: 2025,
    trim: 'Assetto Fiorano',
    exteriorColor: 'Rosso Corsa',
    interiorColor: 'Black Leather',
    category: 'supercar',
    engine: '3.0L Twin-Turbo V6',
    horsepower: 819,
    transmission: 'automatic',
    fuelType: 'phev',
    mileage: 500,
    dailyRate: 9000,
    weeklyRate: 55000,
    monthlyRate: 180000,
    minDeposit: 20000,
    status: 'available',
    lifecycleStatus: 'ACTIVE',
    images: ['https://example.com/1.jpg'],
    thumbnail: 'https://example.com/thumb.jpg',
    ...overrides
  } as unknown as Vehicle;
}

// ----------------------------------------------------
// ADD FLOW
// ----------------------------------------------------
describe('POST /api/fleet -- Add flow with Master Profile classification fields', () => {
  it('accepts and persists the new classification/technical fields alongside every existing field', async () => {
    const res = await request(app)
      .post('/api/fleet')
      .set(authAs(FLEET_UID))
      .send({
        make: 'Lamborghini', model: 'Revuelto', year: 2025, category: 'supercar',
        exteriorColor: 'Verde', interiorColor: 'Black', dailyRate: 11000, minDeposit: 25000,
        bodyStyle: 'coupe', vehicleClassTier: 'hypercar', performanceClass: 'hypercar',
        rentalSegment: 'hypercar', usageTypes: ['performance', 'vip'], drivetrain: 'awd',
        doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'Italy'
      });

    expect(res.status).toBe(201);
    expect(res.body.bodyStyle).toBe('coupe');
    expect(res.body.vehicleClassTier).toBe('hypercar');
    expect(res.body.usageTypes).toEqual(['performance', 'vip']);
    expect(res.body.drivetrain).toBe('awd');
    expect(res.body.doors).toBe(2);
    expect(res.body.countryOfOrigin).toBe('Italy');
    // Existing fields untouched by the new additive fields.
    expect(res.body.make).toBe('Lamborghini');
    expect(res.body.dailyRate).toBe(11000);
  });
});

// ----------------------------------------------------
// EDIT FLOW -- ZERO DATA LOSS
// ----------------------------------------------------
describe('PUT /api/fleet/:id -- Edit flow proves zero data loss', () => {
  it('editing one field never wipes any other previously-set field, including new classification fields', async () => {
    globalStore.vehicles.push(fullVehicle({
      id: 'VEH-EDIT1', bodyStyle: 'coupe', vehicleClassTier: 'hypercar',
      performanceClass: 'hypercar', drivetrain: 'rwd', doors: 2, seats: 2
    } as any));

    const res = await request(app)
      .put('/api/fleet/VEH-EDIT1')
      .set(authAs(CEO_UID))
      .send({ mileage: 1500 }); // only touch one field

    expect(res.status).toBe(200);
    expect(res.body.mileage).toBe(1500);
    // Every other field, including the new Master Profile fields, survives untouched.
    expect(res.body.make).toBe('Ferrari');
    expect(res.body.model).toBe('296 GTB');
    expect(res.body.vin).toBe('VIN0001');
    expect(res.body.dailyRate).toBe(9000);
    expect(res.body.minDeposit).toBe(20000);
    expect(res.body.bodyStyle).toBe('coupe');
    expect(res.body.vehicleClassTier).toBe('hypercar');
    expect(res.body.performanceClass).toBe('hypercar');
    expect(res.body.drivetrain).toBe('rwd');
    expect(res.body.doors).toBe(2);
    expect(res.body.seats).toBe(2);
    expect(res.body.images).toEqual(['https://example.com/1.jpg']);
  });
});

// ----------------------------------------------------
// MASTER CATALOG
// ----------------------------------------------------
describe('Master Vehicle Catalog -- manufacturers/models never leak across manufacturers', () => {
  it('returns only the requested manufacturer\'s own models', async () => {
    const ferrariRes = await request(app).get('/api/vehicle-catalog/models?manufacturerId=ferrari').set(authAs(FLEET_UID));
    const lamboRes = await request(app).get('/api/vehicle-catalog/models?manufacturerId=lamborghini').set(authAs(FLEET_UID));

    expect(ferrariRes.status).toBe(200);
    expect(ferrariRes.body.length).toBeGreaterThan(0);
    expect(ferrariRes.body.every((m: any) => m.manufacturerId === 'ferrari')).toBe(true);
    expect(ferrariRes.body.some((m: any) => m.model === 'Revuelto')).toBe(false);

    expect(lamboRes.body.some((m: any) => m.model === '296 GTB')).toBe(false);
  });

  it('lists the seeded manufacturers', async () => {
    const res = await request(app).get('/api/vehicle-catalog/manufacturers').set(authAs(FLEET_UID));
    expect(res.status).toBe(200);
    expect(res.body.some((m: any) => m.id === 'ferrari')).toBe(true);
    expect(res.body.some((m: any) => m.id === 'rolls-royce')).toBe(true);
  });
});

describe('Master Vehicle Catalog -- propose/approve/reject flow (Four-Eyes reused)', () => {
  it('a proposed new model stays pending, cannot be self-approved, and only enters the catalog once a different authorized person approves it', async () => {
    const proposeRes = await request(app)
      .post('/api/vehicle-catalog/model-requests')
      .set(authAs(FLEET_UID))
      .send({ requestType: 'new_model', manufacturerName: 'Ferrari', modelName: 'Test Model X', details: 'seen at dealership' });

    expect(proposeRes.status).toBe(201);
    expect(proposeRes.body.status).toBe('pending');
    const requestId = proposeRes.body.id;

    // Not yet in the readable catalog.
    const beforeApproval = await request(app).get('/api/vehicle-catalog/models?manufacturerId=ferrari').set(authAs(FLEET_UID));
    expect(beforeApproval.body.some((m: any) => m.model === 'Test Model X')).toBe(false);

    // The requester (fleet staff) cannot decide their own request -- Four-Eyes/SoD.
    const selfDecide = await request(app)
      .post(`/api/vehicle-catalog/model-requests/${requestId}/decide`)
      .set(authAs(FLEET_UID))
      .send({ decision: 'approved', note: 'self-approving' });
    expect([403, 409]).toContain(selfDecide.status);

    // A different authorized person (CEO) approves it.
    const decideRes = await request(app)
      .post(`/api/vehicle-catalog/model-requests/${requestId}/decide`)
      .set(authAs(CEO_UID))
      .send({ decision: 'approved', note: 'Verified against manufacturer press kit.' });

    expect(decideRes.status).toBe(200);
    expect(decideRes.body.status).toBe('approved');
    expect(decideRes.body.resultingModelId).toBeTruthy();

    // Now it appears in the readable catalog, scoped to Ferrari only.
    const afterApproval = await request(app).get('/api/vehicle-catalog/models?manufacturerId=ferrari').set(authAs(FLEET_UID));
    expect(afterApproval.body.some((m: any) => m.model === 'Test Model X')).toBe(true);
  });

  it('a rejected proposal never enters the catalog', async () => {
    const proposeRes = await request(app)
      .post('/api/vehicle-catalog/model-requests')
      .set(authAs(FLEET_UID))
      .send({ requestType: 'new_model', manufacturerName: 'Ferrari', modelName: 'Rejected Model Y' });
    const requestId = proposeRes.body.id;

    const decideRes = await request(app)
      .post(`/api/vehicle-catalog/model-requests/${requestId}/decide`)
      .set(authAs(ADMIN_UID))
      .send({ decision: 'rejected', note: 'Cannot verify this model exists.' });

    expect(decideRes.status).toBe(200);
    expect(decideRes.body.status).toBe('rejected');

    const models = await request(app).get('/api/vehicle-catalog/models?manufacturerId=ferrari').set(authAs(FLEET_UID));
    expect(models.body.some((m: any) => m.model === 'Rejected Model Y')).toBe(false);
  });
});

// ----------------------------------------------------
// VERIFIED PUBLISH GATE
// ----------------------------------------------------
describe('PUT /api/fleet/:id/website-publish -- Verified Publish Gate', () => {
  it('blocks publishing an incomplete/unconfirmed vehicle with the exact missing reasons', async () => {
    globalStore.vehicles.push(fullVehicle({
      id: 'VEH-INCOMPLETE', horsepower: 0, engine: '', images: [], thumbnail: ''
    } as any));

    const res = await request(app)
      .put('/api/fleet/VEH-INCOMPLETE/website-publish')
      .set(authAs(CEO_UID))
      .send({ publication: { enabled: true, visibility: 'FEATURED', publicName: 'Test', publicDescription: 'Desc', mileageAllowance: 250 } });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('غير جاهز للنشر');
    expect(res.body.missingReasonsEn.length).toBeGreaterThan(0);
    expect(res.body.missingReasonsEn.some((r: string) => /engine/i.test(r))).toBe(true);
    expect(res.body.missingReasonsEn.some((r: string) => /photo/i.test(r))).toBe(true);

    // Never actually published.
    const stillHidden = globalStore.vehicles.find((v: any) => v.id === 'VEH-INCOMPLETE');
    expect(stillHidden.website?.enabled).not.toBe(true);
  });

  it('publishes successfully once every required field is complete and confirmed', async () => {
    globalStore.vehicles.push(fullVehicle({ id: 'VEH-COMPLETE' } as any));

    const res = await request(app)
      .put('/api/fleet/VEH-COMPLETE/website-publish')
      .set(authAs(CEO_UID))
      .send({ publication: { enabled: true, visibility: 'FEATURED', publicName: 'Ferrari 296 GTB', publicDescription: 'A real description.', mileageAllowance: 250 } });

    expect(res.status).toBe(200);
    expect(res.body.vehicle.website.enabled).toBe(true);
  });

  it('re-verifies on the next core-data edit and auto-unpublishes if that edit leaves required data missing', async () => {
    globalStore.vehicles.push(fullVehicle({
      id: 'VEH-REVERIFY',
      website: {
        enabled: true, visibility: 'FEATURED', featured: true, publicVehicleId: 'veh-reverify',
        publicName: 'Ferrari 296 GTB', publicDescription: 'Desc', category: 'supercar', images: [],
        dailyRate: 9000, weeklyRate: 55000, monthlyRate: 180000, deposit: 20000, mileageAllowance: 250, slug: 'veh-reverify'
      }
    } as any));

    const res = await request(app)
      .put('/api/fleet/VEH-REVERIFY')
      .set(authAs(CEO_UID))
      .send({ exteriorColor: '' }); // blanks a required published field

    expect(res.status).toBe(200);
    expect(res.body.website.enabled).toBe(false);
    expect(res.body.autoUnpublishedReasons).toBeDefined();
    expect(res.body.autoUnpublishedReasons.length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------
// PUBLIC DTO -- no fabrication, no internal-data leakage
// ----------------------------------------------------
describe('SplendorConnectEngine.toPublicVehicleDTO -- never fabricates data, never leaks internal fields', () => {
  it('never invents a features list when none is confirmed', async () => {
    const { SplendorConnectEngine } = await import('../src/server/splendorConnectEngine');
    const vehicle = fullVehicle({
      id: 'VEH-DTO1',
      website: {
        enabled: true, visibility: 'FEATURED', featured: true, publicVehicleId: 'veh-dto1',
        publicName: 'Ferrari 296 GTB', publicDescription: 'Desc', category: 'supercar', images: ['a.jpg'],
        dailyRate: 9000, weeklyRate: 55000, monthlyRate: 180000, deposit: 20000, mileageAllowance: 0, slug: 'veh-dto1'
        // features intentionally omitted -- never confirmed
      }
    } as any);

    const dto = SplendorConnectEngine.toPublicVehicleDTO(vehicle);
    expect(dto).not.toBeNull();
    expect(dto!.features).toEqual([]);
    expect(dto!.featuresAr).toEqual([]);
    // No fabricated 250km fallback -- reflects the real (unset -> 0) value.
    expect(dto!.pricing.mileageAllowanceKm).toBe(0);
  });

  it('never exposes purchase/financing/internal fields through the public DTO', async () => {
    const { SplendorConnectEngine } = await import('../src/server/splendorConnectEngine');
    const vehicle = fullVehicle({
      id: 'VEH-DTO2',
      // Internal-only fields a real vehicle record may carry.
      purchasePrice: 900000,
      financingParty: 'Emirates NBD',
      profitabilityScore: 42,
      website: {
        enabled: true, visibility: 'FEATURED', featured: true, publicVehicleId: 'veh-dto2',
        publicName: 'Ferrari 296 GTB', publicDescription: 'Desc', category: 'supercar', images: ['a.jpg'],
        dailyRate: 9000, weeklyRate: 55000, monthlyRate: 180000, deposit: 20000, mileageAllowance: 250, slug: 'veh-dto2'
      }
    } as any);

    const dto: any = SplendorConnectEngine.toPublicVehicleDTO(vehicle);
    expect(dto).not.toBeNull();
    expect(dto.purchasePrice).toBeUndefined();
    expect(dto.financingParty).toBeUndefined();
    expect(dto.profitabilityScore).toBeUndefined();
    expect(dto.vin).toBeUndefined();
    expect(dto.plateNumber).toBeUndefined();
  });
});
