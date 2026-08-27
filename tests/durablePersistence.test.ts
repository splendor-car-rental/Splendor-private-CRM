/**
 * Durable Persistence & Concurrency Test Suite
 * =============================================
 *
 * Proves the actual atomicity/durability claims behind the remediation of
 * three of the audit's confirmed blockers:
 *
 *   - ID generation: getNextNumber() was a plain in-memory counter, never
 *     persisted on ordinary use, reset on every cold start -- two entities
 *     created after two different cold starts could receive the SAME id,
 *     silently overwriting each other in Firestore. issueNextNumber()
 *     (src/server/idGenerator.ts) replaces it with a Firestore transaction.
 *   - Vehicle availability: checkVehicleAvailability() read purely from
 *     in-memory globalStore, which is a separate copy per serverless
 *     instance -- two concurrent bookings for the same vehicle/overlapping
 *     dates on two different instances could both succeed.
 *     reserveVehicleSlot()/createContractDurable() (src/server/
 *     availability.ts, contractOps.ts) check-and-write inside one
 *     transaction instead.
 *   - Idempotency: contract creation had no duplicate-request protection
 *     at all. runIdempotent() (src/server/idempotency.ts) makes a repeated
 *     request with the same key return the original result.
 *
 * Unlike tests/tollImportSecurity.test.ts, this file does NOT mock
 * firebase-admin -- these specific guarantees (Firestore transaction
 * serialization under real concurrency) can only be proven against a real
 * Firestore engine, so this talks to the local emulator that `npm test`
 * already starts (`firebase emulators:exec`, which exports
 * FIRESTORE_EMULATOR_HOST for this process automatically). No real Google
 * Cloud project or real credentials are used or required -- a throwaway
 * in-memory keypair satisfies firebase-admin's credential shape check
 * without ever being used to sign a real request (the emulator does not
 * authenticate).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomUUID } from 'crypto';

let admin: typeof import('firebase-admin');
let db: FirebaseFirestore.Firestore;
let issueNextNumber: typeof import('../src/server/idGenerator').issueNextNumber;
let reserveVehicleSlot: typeof import('../src/server/availability').reserveVehicleSlot;
let AvailabilityConflictError: typeof import('../src/server/availability').AvailabilityConflictError;
let createContractDurable: typeof import('../src/server/contractOps').createContractDurable;

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-splendor-crm-rules-test';

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set -- run via `npm test` (firebase emulators:exec), not vitest directly.'
    );
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
  admin.initializeApp({
    credential: admin.credential.cert(fakeServiceAccount as any),
    projectId: PROJECT_ID
  });
  db = admin.firestore();

  ({ issueNextNumber } = await import('../src/server/idGenerator'));
  ({ reserveVehicleSlot, AvailabilityConflictError } = await import('../src/server/availability'));
  ({ createContractDurable } = await import('../src/server/contractOps'));
});

afterAll(async () => {
  await Promise.all(admin.apps.map((app) => app?.delete()));
});

async function clearCollection(name: string) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

afterEach(async () => {
  await Promise.all(
    ['numbering_configs', 'vehicles', 'customers', 'contracts', 'reservations', 'audit_logs', 'idempotency_keys'].map(
      clearCollection
    )
  );
});

describe('issueNextNumber — atomic durable ID generation (Phase 2)', () => {
  it('hands out a unique id to every one of 25 truly concurrent callers', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => issueNextNumber('Customer')));
    expect(new Set(results).size).toBe(25);
  }, 45000); // real contention on one Firestore document forces the emulator to serialize + retry transactions -- genuinely slower than vitest's 5s default (and slower still when other test files share the same local emulator), not a hang.

  it('never loses an increment: the counter after N concurrent calls is exactly N', async () => {
    await Promise.all(Array.from({ length: 15 }, () => issueNextNumber('Lead')));
    const doc = await db.collection('numbering_configs').doc('lead').get();
    expect(doc.data()?.nextNumber).toBe(16); // started at 1, issued 15 -> next is 16
  }, 45000);

  it('survives a simulated cold start: a fresh call after "restart" continues the sequence, never resets', async () => {
    const first = await issueNextNumber('Quotation');
    // Nothing in this process is cached between calls -- issueNextNumber
    // re-reads Firestore from scratch every time, exactly as it would from
    // a brand-new cold-started serverless instance with an empty
    // in-memory globalStore.
    const second = await issueNextNumber('Quotation');
    expect(first).not.toBe(second);
    expect(second.replace('QT-', '')).toBe(String(Number(first.replace('QT-', '')) + 1).padStart(6, '0'));
  });

  it('keeps the existing prefix/digit format unchanged', async () => {
    const id = await issueNextNumber('Contract');
    expect(id).toMatch(/^CON-2026-\d{5}$/);
  });
});

describe('reserveVehicleSlot — transactional double-booking prevention (Phase 3)', () => {
  async function seedVehicle(id: string, overrides: Record<string, unknown> = {}) {
    await db.collection('vehicles').doc(id).set({
      id, make: 'Rolls-Royce', model: 'Spectre', plateCity: 'Dubai', plateNumber: 'A 12345',
      vin: 'VIN123', dailyRate: 5000, minDeposit: 10000, status: 'available', ...overrides
    });
  }

  it('lets exactly one of two concurrent overlapping-date requests for the same vehicle succeed', async () => {
    await seedVehicle('VEH-CONC-1');
    const build = (n: number) => () => ({
      id: `RES-CONC-${n}`, vehicleId: 'VEH-CONC-1',
      pickupDateTime: '2026-09-01T10:00:00.000Z', returnDateTime: '2026-09-05T10:00:00.000Z',
      status: 'confirmed'
    });

    const outcomes = await Promise.allSettled([
      reserveVehicleSlot({ vehicleId: 'VEH-CONC-1', startIso: '2026-09-01T10:00:00.000Z', endIso: '2026-09-05T10:00:00.000Z' }, 'reservations', build(1)),
      reserveVehicleSlot({ vehicleId: 'VEH-CONC-1', startIso: '2026-09-03T10:00:00.000Z', endIso: '2026-09-07T10:00:00.000Z' }, 'reservations', build(2))
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AvailabilityConflictError);

    const snap = await db.collection('reservations').where('vehicleId', '==', 'VEH-CONC-1').get();
    expect(snap.size).toBe(1); // never two reservations for the overlapping range
  });

  it('lets two concurrent NON-overlapping requests for the same vehicle both succeed', async () => {
    await seedVehicle('VEH-CONC-2');
    const outcomes = await Promise.allSettled([
      reserveVehicleSlot(
        { vehicleId: 'VEH-CONC-2', startIso: '2026-10-01T10:00:00.000Z', endIso: '2026-10-03T10:00:00.000Z' },
        'reservations',
        () => ({ id: 'RES-NOOVERLAP-1', vehicleId: 'VEH-CONC-2', pickupDateTime: '2026-10-01T10:00:00.000Z', returnDateTime: '2026-10-03T10:00:00.000Z', status: 'confirmed' })
      ),
      reserveVehicleSlot(
        { vehicleId: 'VEH-CONC-2', startIso: '2026-10-10T10:00:00.000Z', endIso: '2026-10-12T10:00:00.000Z' },
        'reservations',
        () => ({ id: 'RES-NOOVERLAP-2', vehicleId: 'VEH-CONC-2', pickupDateTime: '2026-10-10T10:00:00.000Z', returnDateTime: '2026-10-12T10:00:00.000Z', status: 'confirmed' })
      )
    ]);
    expect(outcomes.every((o) => o.status === 'fulfilled')).toBe(true);
  }, 15000);

  it('rejects a booking against a vehicle marked under maintenance', async () => {
    await seedVehicle('VEH-MAINT', { status: 'maintenance' });
    await expect(
      reserveVehicleSlot(
        { vehicleId: 'VEH-MAINT', startIso: '2026-11-01T10:00:00.000Z', endIso: '2026-11-03T10:00:00.000Z' },
        'reservations',
        () => ({ id: 'RES-MAINT-1', vehicleId: 'VEH-MAINT', pickupDateTime: '2026-11-01T10:00:00.000Z', returnDateTime: '2026-11-03T10:00:00.000Z', status: 'confirmed' })
      )
    ).rejects.toBeInstanceOf(AvailabilityConflictError);
  });
});

describe('createContractDurable — server-authoritative pricing + idempotency (Phases 5 & 7)', () => {
  async function seedVehicleAndCustomer() {
    await db.collection('vehicles').doc('VEH-CONTRACT-1').set({
      id: 'VEH-CONTRACT-1', make: 'Ferrari', model: '296 GTB', plateCity: 'Dubai', plateNumber: 'B 99999',
      vin: 'VIN999', dailyRate: 4000, minDeposit: 8000, status: 'available'
    });
    await db.collection('customers').doc('CUS-CONTRACT-1').set({
      id: 'CUS-CONTRACT-1', fullName: 'Test VIP', phone: '+971500000000', address: 'Dubai, UAE',
      totalRentals: 0, lifetimeValue: 0, outstandingBalance: 0, securityDepositsHeld: 0
    });
  }

  it('ignores a client-supplied price and computes it from the vehicle\'s own dailyRate', async () => {
    await seedVehicleAndCustomer();
    const outcome = await createContractDurable({
      vehicleId: 'VEH-CONTRACT-1',
      customerId: 'CUS-CONTRACT-1',
      startDateTime: '2026-09-01T10:00:00.000Z',
      endDateTime: '2026-09-04T10:00:00.000Z', // 3 days
      // These two fields don't exist on CreateContractInput at all (the
      // whole point of the fix) -- cast through `any` to prove that even
      // if a client smuggled them into the request body, there is no code
      // path left that would read them.
      dailyRate: 1,
      grandTotal: 1
    } as any);

    expect(outcome.contract.dailyRate).toBe(4000);
    expect(outcome.contract.rentalTotal).toBe(12000); // 4000 * 3 days
    expect(outcome.contract.vatAmount).toBeCloseTo(600); // 5%
    expect(outcome.contract.grandTotal).toBeCloseTo(12600);
    expect(outcome.replayed).toBe(false);
  });

  it('a repeated request with the same idempotency key returns the original contract, not a second one', async () => {
    await seedVehicleAndCustomer();
    const key = randomUUID();
    const first = await createContractDurable({
      vehicleId: 'VEH-CONTRACT-1', customerId: 'CUS-CONTRACT-1',
      startDateTime: '2026-09-01T10:00:00.000Z', endDateTime: '2026-09-03T10:00:00.000Z',
      idempotencyKey: key
    });
    const second = await createContractDurable({
      vehicleId: 'VEH-CONTRACT-1', customerId: 'CUS-CONTRACT-1',
      startDateTime: '2026-09-01T10:00:00.000Z', endDateTime: '2026-09-03T10:00:00.000Z',
      idempotencyKey: key
    });

    expect(second.replayed).toBe(true);
    expect(second.contract.id).toBe(first.contract.id);

    const contractsSnap = await db.collection('contracts').where('vehicleId', '==', 'VEH-CONTRACT-1').get();
    expect(contractsSnap.size).toBe(1);
  });

  it('two concurrent double-click requests (same key) create exactly one contract', async () => {
    await seedVehicleAndCustomer();
    const key = randomUUID();
    const input = {
      vehicleId: 'VEH-CONTRACT-1', customerId: 'CUS-CONTRACT-1',
      startDateTime: '2026-09-01T10:00:00.000Z', endDateTime: '2026-09-03T10:00:00.000Z',
      idempotencyKey: key
    };
    const [a, b] = await Promise.all([createContractDurable(input), createContractDurable(input)]);
    expect(a.contract.id).toBe(b.contract.id);

    const contractsSnap = await db.collection('contracts').where('vehicleId', '==', 'VEH-CONTRACT-1').get();
    expect(contractsSnap.size).toBe(1);
  });

  it('atomically updates the vehicle status and the customer lifetime value together with the contract', async () => {
    await seedVehicleAndCustomer();
    const outcome = await createContractDurable({
      vehicleId: 'VEH-CONTRACT-1', customerId: 'CUS-CONTRACT-1',
      startDateTime: '2026-09-01T10:00:00.000Z', endDateTime: '2026-09-02T10:00:00.000Z', status: 'active'
    });

    const vehicleDoc = await db.collection('vehicles').doc('VEH-CONTRACT-1').get();
    const customerDoc = await db.collection('customers').doc('CUS-CONTRACT-1').get();

    expect(vehicleDoc.data()?.status).toBe('rented');
    expect(vehicleDoc.data()?.currentContractId).toBe(outcome.contract.id);
    expect(customerDoc.data()?.totalRentals).toBe(1);
    expect(customerDoc.data()?.lifetimeValue).toBeCloseTo(outcome.contract.grandTotal);
  });

  it('rejects contract creation for an unknown vehicle without writing anything', async () => {
    await seedVehicleAndCustomer();
    await expect(
      createContractDurable({ vehicleId: 'VEH-DOES-NOT-EXIST', customerId: 'CUS-CONTRACT-1' })
    ).rejects.toThrow(/Vehicle not found/);
    const snap = await db.collection('contracts').get();
    expect(snap.size).toBe(0);
  });
});
