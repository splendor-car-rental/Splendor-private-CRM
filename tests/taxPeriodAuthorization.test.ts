import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => {
  const verifyIdToken = vi.fn();
  const runTransaction = vi.fn();
  const profiles = new Map<string, Record<string, unknown>>();

  const firestore = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = name === 'users' ? profiles.get(id) : undefined;
          return { exists: data !== undefined, id, data: () => data };
        }
      }),
      get: async () => ({ docs: [] }),
      where: () => ({ get: async () => ({ docs: [] }) })
    }),
    runTransaction
  };

  const admin = {
    apps: [{}],
    auth: () => ({ verifyIdToken }),
    firestore: () => firestore
  };

  return { admin, profiles, verifyIdToken, runTransaction };
});

vi.mock('firebase-admin', () => ({ default: firebase.admin }));

import taxPeriodHandler, { resolveTaxPeriodLifecycleAction } from '../src/server/taxPeriodApi';

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

async function invoke(uid: string, action: string) {
  firebase.verifyIdToken.mockResolvedValueOnce({ uid, name: uid });
  const { res, state } = response();
  await taxPeriodHandler({
    method: 'POST',
    headers: { authorization: 'Bearer synthetic-test-token' },
    query: { resource: 'periods', action },
    body: { periodId: 'TAXPERIOD-AUTHORIZATION-TEST' }
  } as any, res);
  return state;
}

describe('Tax Period lifecycle authorization', () => {
  beforeEach(() => {
    firebase.profiles.clear();
    firebase.verifyIdToken.mockReset();
    firebase.runTransaction.mockReset();
    firebase.runTransaction.mockResolvedValue({ error: 'authorization boundary reached transaction' });
  });

  it('uses a closed server-owned action-to-permission mapping', () => {
    expect(resolveTaxPeriodLifecycleAction('open')).toEqual({ action: 'open', permission: 'tax.prepare' });
    expect(resolveTaxPeriodLifecycleAction('submit-review')).toEqual({ action: 'submit-review', permission: 'tax.prepare' });
    expect(resolveTaxPeriodLifecycleAction('complete-review')).toEqual({ action: 'complete-review', permission: 'tax.review' });
    expect(resolveTaxPeriodLifecycleAction('record-professional-validation')).toEqual({ action: 'record-professional-validation', permission: 'tax.approve' });
    expect(resolveTaxPeriodLifecycleAction('close')).toEqual({ action: 'close', permission: 'tax.approve' });
    expect(resolveTaxPeriodLifecycleAction('file')).toBeNull();
    expect(resolveTaxPeriodLifecycleAction('submit-return')).toBeNull();
    expect(resolveTaxPeriodLifecycleAction('anything-else')).toBeNull();
  });

  it('rejects an unknown lifecycle action before a Firestore transaction can run', async () => {
    firebase.profiles.set('finance-unknown-action', { role: 'finance', status: 'active', name: 'Finance' });
    expect(await invoke('finance-unknown-action', 'file')).toMatchObject({ status: 400 });
    expect(firebase.runTransaction).not.toHaveBeenCalled();
  });

  it('rejects a valid action when the authenticated active staff profile lacks its permission', async () => {
    firebase.profiles.set('finance-review-denied', { role: 'finance', status: 'active', name: 'Finance' });
    expect(await invoke('finance-review-denied', 'complete-review')).toMatchObject({ status: 403 });
    expect(firebase.runTransaction).not.toHaveBeenCalled();
  });

  it('allows an authorized preparation action to reach the transaction only after permission succeeds', async () => {
    firebase.profiles.set('finance-prepare', { role: 'finance', status: 'active', name: 'Finance' });
    expect(await invoke('finance-prepare', 'open')).toMatchObject({ status: 400 });
    expect(firebase.runTransaction).toHaveBeenCalledTimes(1);
  });

  it('honors explicitly provisioned review permission but never derives it from request data', async () => {
    firebase.profiles.set('operations-reviewer', {
      role: 'operations',
      status: 'active',
      name: 'Independent Reviewer',
      taxPermissions: ['tax.view', 'tax.review']
    });
    expect(await invoke('operations-reviewer', 'complete-review')).toMatchObject({ status: 400 });
    expect(firebase.runTransaction).toHaveBeenCalledTimes(1);
  });
});
