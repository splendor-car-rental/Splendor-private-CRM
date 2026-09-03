import { describe, expect, it } from 'vitest';
import { executeContractExtensionTransaction } from '../src/server/contractExtensionRecovery';

type Ref = { kind: 'doc' | 'query'; collection: string; id?: string };

function snapshot(id: string, data: Record<string, unknown> | null) {
  return { id, exists: data !== null, data: () => data };
}

function makeStrictTransactionDb() {
  let writesStarted = false;
  const reads: string[] = [];
  const writes: Array<{ collection: string; id?: string; data: any; merge: boolean }> = [];

  const contract = {
    id: 'CON-100',
    contractNumber: 'CON-100',
    customerName: 'Customer',
    customerPhone: '+971000000000',
    vehicleId: 'VEH-1',
    vehicleName: 'Vehicle',
    vehiclePlate: 'DUBAI TEST',
    endDateTime: '2026-09-10T10:00:00.000Z',
    dailyRate: 1000,
    rentalTotal: 3000,
    vatAmount: 150,
    grandTotal: 3150,
    extensions: []
  };

  const db: any = {
    collection(collection: string) {
      return {
        doc(id: string): Ref { return { kind: 'doc', collection, id }; }
      };
    },
    async runTransaction(callback: (tx: any) => Promise<any>) {
      const tx = {
        async get(ref: Ref) {
          if (writesStarted) throw new Error('STRICT_TX_READ_AFTER_WRITE');
          reads.push(`${ref.collection}/${ref.id || '*'}`);
          if (ref.collection === 'contracts' && ref.id === 'CON-100') return snapshot('CON-100', contract);
          if (ref.collection === 'vehicles' && ref.id === 'VEH-1') return snapshot('VEH-1', { id: 'VEH-1', status: 'rented' });
          return snapshot(ref.id || 'unknown', null);
        },
        set(ref: Ref, data: any, options: { merge?: boolean } = {}) {
          writesStarted = true;
          writes.push({ collection: ref.collection, id: ref.id, data, merge: Boolean(options.merge) });
        }
      };
      return callback(tx);
    }
  };

  return { db, reads, writes };
}

describe('contract extension clean recovery', () => {
  it('completes every Firestore read before the first write', async () => {
    const { db, reads, writes } = makeStrictTransactionDb();
    const result = await executeContractExtensionTransaction(db, {
      contractId: 'CON-100',
      newEndDateTime: '2026-09-12T10:00:00.000Z',
      actor: { uid: 'ops-1', name: 'Operations', role: 'operations' },
      addendumId: 'ADD-1',
      now: '2026-09-03T00:00:00.000Z'
    });

    expect(reads).toEqual(['contracts/CON-100', 'vehicles/VEH-1']);
    expect(writes.map(write => `${write.collection}/${write.id}`)).toEqual(['contracts/CON-100', 'vehicles/VEH-1']);
    expect(result.contract.endDateTime).toBe('2026-09-12T10:00:00.000Z');
    expect(result.addendum.currentEndDateTime).toBe('2026-09-10T10:00:00.000Z');
    expect(result.extraDays).toBe(2);
  });

  it('preserves the configured operational extension calculation and addendum totals', async () => {
    const { db } = makeStrictTransactionDb();
    const result = await executeContractExtensionTransaction(db, {
      contractId: 'CON-100',
      newEndDateTime: '2026-09-12T10:00:00.000Z',
      actor: { uid: 'ops-1', name: 'Operations', role: 'operations' },
      addendumId: 'ADD-1',
      now: '2026-09-03T00:00:00.000Z'
    });

    expect(result.addendum.periodRentalAmount).toBe(2000);
    expect(result.addendum.vatAmount).toBe(100);
    expect(result.extraAmount).toBe(2100);
    expect(result.contract.rentalTotal).toBe(5000);
    expect(result.contract.vatAmount).toBe(250);
    expect(result.contract.grandTotal).toBe(5250);
  });

  it('rejects an invalid or non-forward extension without writing', async () => {
    const { db, writes } = makeStrictTransactionDb();
    await expect(executeContractExtensionTransaction(db, {
      contractId: 'CON-100',
      newEndDateTime: '2026-09-10T10:00:00.000Z',
      actor: { uid: 'ops-1', name: 'Operations', role: 'operations' },
      addendumId: 'ADD-1',
      now: '2026-09-03T00:00:00.000Z'
    })).rejects.toThrow(/strictly after/);
    expect(writes).toHaveLength(0);
  });
});
