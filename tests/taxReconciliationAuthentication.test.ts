import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => {
  const verifyIdToken = vi.fn();
  const profiles = new Map<string, Record<string, unknown>>();
  const firestore = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = name === 'users' ? profiles.get(id) : undefined;
          return { exists: data !== undefined, id, data: () => data };
        }
      }),
      where: () => ({ get: async () => ({ docs: [] }) })
    })
  };
  const admin = {
    apps: [{}],
    auth: () => ({ verifyIdToken }),
    firestore: () => firestore
  };
  return { admin, profiles, verifyIdToken };
});

vi.mock('firebase-admin', () => ({ default: firebase.admin }));

import taxReconciliationHandler from '../src/server/taxReconciliationApi';

function response() {
  const state = { status: 200, body: undefined as unknown };
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((status: number) => {
      state.status = status;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      state.body = body;
      return res;
    })
  };
  return { res, state };
}

async function invoke(uid: string) {
  firebase.verifyIdToken.mockResolvedValueOnce({ uid, name: uid });
  const { res, state } = response();
  await taxReconciliationHandler({
    method: 'GET',
    headers: { authorization: 'Bearer synthetic-test-token' },
    query: { periodId: 'TAXPERIOD-AUTH-TEST' }
  } as any, res);
  return state;
}

describe('Tax Reconciliation active-staff authentication', () => {
  beforeEach(() => {
    firebase.profiles.clear();
    firebase.verifyIdToken.mockReset();
  });

  it('rejects a legacy staff profile whose active status is missing', async () => {
    firebase.profiles.set('finance-statusless', { role: 'finance', name: 'Statusless Finance' });
    expect(await invoke('finance-statusless')).toMatchObject({ status: 403 });
  });

  it('rejects an explicitly inactive staff profile', async () => {
    firebase.profiles.set('finance-inactive', { role: 'finance', status: 'inactive', name: 'Inactive Finance' });
    expect(await invoke('finance-inactive')).toMatchObject({ status: 403 });
  });

  it('allows an active tax-viewer through the authentication boundary', async () => {
    firebase.profiles.set('finance-active', { role: 'finance', status: 'active', name: 'Active Finance' });
    expect(await invoke('finance-active')).toMatchObject({ status: 200, body: [] });
  });
});
