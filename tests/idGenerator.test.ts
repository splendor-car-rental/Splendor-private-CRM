import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const store = new Map<string, any>();
  const apps = [{}];
  const db: any = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = store.get(`${name}/${id}`);
          return { exists: data !== undefined, data: () => data };
        }
      })
    }),
    runTransaction: async (fn: any) => {
      const tx = {
        get: async (ref: any) => ref.get(),
        set: (ref: any, data: any) => {
          store.set(`numbering_configs/${ref.id}`, data);
        }
      };
      return fn(tx, db);
    }
  };
  return { default: { apps, firestore: () => db } };
});

describe('durable ID generation', () => {
  it('uses a distinct FailedJob numbering namespace', async () => {
    const { issueNextNumber } = await import('../src/server/idGenerator');
    expect(await issueNextNumber('FailedJob')).toBe('FAI-000001');
    expect(await issueNextNumber('FailedJob')).toBe('FAI-000002');
  });

  it('keeps WhatsApp failed-job numbering independent from other entities', async () => {
    const { issueNextNumber } = await import('../src/server/idGenerator');
    expect(await issueNextNumber('FailedJob')).toBe('FAI-000001');
    expect(await issueNextNumber('Customer')).toBe('CUS-000001');
  });
});
