import { beforeEach, describe, expect, it, vi } from 'vitest';

const collections = new Map<string, Map<string, any>>();
const ids = new Map<string, number>();

function collection(name: string) {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name)!;
}

function makeDocRef(collectionName: string, id: string) {
  return { kind: 'doc' as const, collectionName, id };
}

function makeQueryRef(collectionName: string, field: string, value: unknown) {
  return { kind: 'query' as const, collectionName, field, value };
}

vi.mock('../src/server/idGenerator', () => ({
  issueNextNumber: async (entity: string) => {
    const next = (ids.get(entity) || 0) + 1;
    ids.set(entity, next);
    if (entity === 'Contract') return `CON-2026-${String(next).padStart(5, '0')}`;
    if (entity === 'AuditLog') return `AUD-${String(next).padStart(6, '0')}`;
    return `${entity}-${next}`;
  }
}));

vi.mock('../src/server/persistence', () => {
  class PersistenceError extends Error {}
  return { PersistenceError };
});

vi.mock('../src/server/availability', () => {
  class AvailabilityConflictError extends Error {
    conflicts: unknown[];
    constructor(message: string, conflicts: unknown[]) {
      super(message);
      this.conflicts = conflicts;
    }
  }
  return { AvailabilityConflictError };
});

vi.mock('../src/server/idempotency', () => ({
  runIdempotent: async (_scope: string, _key: string | null | undefined, fn: any) => {
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => makeDocRef(name, id),
        where: (field: string, _op: string, value: unknown) => makeQueryRef(name, field, value)
      })
    };
    const tx = {
      get: async (ref: any) => {
        if (ref.kind === 'doc') {
          const data = collection(ref.collectionName).get(ref.id);
          return { exists: data !== undefined, id: ref.id, data: () => data };
        }
        const docs = [...collection(ref.collectionName).entries()]
          .filter(([, data]) => data?.[ref.field] === ref.value)
          .map(([id, data]) => ({ id, data: () => data }));
        return { docs, size: docs.length };
      },
      create: (ref: any, data: any) => {
        const target = collection(ref.collectionName);
        if (target.has(ref.id)) throw new Error('ALREADY_EXISTS');
        target.set(ref.id, data);
      },
      set: (ref: any, data: any, options?: { merge?: boolean }) => {
        const target = collection(ref.collectionName);
        const current = target.get(ref.id);
        target.set(ref.id, options?.merge && current ? { ...current, ...data } : data);
      }
    };
    return { result: await fn(tx, db), replayed: false };
  }
}));

import { createContractDurable } from '../src/server/contractOps';

beforeEach(() => {
  collections.clear();
  ids.clear();
  collection('vehicles').set('VEH-1', {
    id: 'VEH-1', make: 'Mercedes-AMG', model: 'G63', plateCity: 'Dubai', plateNumber: 'A 12345',
    vin: 'VIN-G63-1', dailyRate: 2500, minDeposit: 10000, status: 'available'
  });
  collection('customers').set('CUS-1', {
    id: 'CUS-1', fullName: 'Lifecycle Test Client', phone: '+971500000000', address: 'Dubai',
    totalRentals: 7, lifetimeValue: 123456, outstandingBalance: 0, securityDepositsHeld: 0
  });
});

describe('rental contract creation lifecycle gate', () => {
  it('creates a non-operative draft even when a caller tries to force status=active', async () => {
    const beforeVehicle = structuredClone(collection('vehicles').get('VEH-1'));
    const beforeCustomer = structuredClone(collection('customers').get('CUS-1'));

    const outcome = await createContractDurable({
      vehicleId: 'VEH-1',
      customerId: 'CUS-1',
      startDateTime: '2026-09-10T10:00:00.000Z',
      endDateTime: '2026-09-13T10:00:00.000Z',
      status: 'active'
    });

    expect(outcome.contract.status).toBe('draft');
    expect(outcome.contract.depositStatus).toBe('pending');
    expect(outcome.contract.termsAccepted).toBe(false);
    expect(outcome.contract.dailyRate).toBe(2500);
    expect(outcome.contract.rentalTotal).toBe(7500);

    expect(outcome.vehicleUpdate).toEqual({});
    expect(outcome.customerUpdate).toEqual({});
    expect(collection('vehicles').get('VEH-1')).toEqual(beforeVehicle);
    expect(collection('customers').get('CUS-1')).toEqual(beforeCustomer);

    const persisted = collection('contracts').get(outcome.contract.id);
    expect(persisted.status).toBe('draft');
    expect(persisted.depositStatus).toBe('pending');
    expect(persisted.termsAccepted).toBe(false);
  });

  it('does not treat another draft as an operational booking conflict', async () => {
    collection('contracts').set('CON-EXISTING-DRAFT', {
      id: 'CON-EXISTING-DRAFT', vehicleId: 'VEH-1', status: 'draft',
      startDateTime: '2026-09-10T10:00:00.000Z', endDateTime: '2026-09-13T10:00:00.000Z'
    });

    await expect(createContractDurable({
      vehicleId: 'VEH-1', customerId: 'CUS-1',
      startDateTime: '2026-09-11T10:00:00.000Z', endDateTime: '2026-09-12T10:00:00.000Z'
    })).resolves.toMatchObject({ contract: { status: 'draft' } });
  });
});
