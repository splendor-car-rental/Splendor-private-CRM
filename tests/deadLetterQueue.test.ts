/**
 * Dead-Letter Queue + Operational Health (Phase 23.7)
 * ======================================================
 *
 * Unit-level: calls src/server/deadLetterQueue.ts and
 * src/server/operationalHealth.ts directly (no Express/HTTP layer),
 * mocking firebase-admin (durable writes) and src/server/whatsapp.ts (send
 * outcomes) so retry behavior is fully deterministic.
 *
 * Proves: a failed send is recorded with what's needed to retry it; a
 * successful retry resolves the job; a failed retry stays open and counts
 * the attempt; resolving requires a note and can't happen twice; the
 * health check reports a real status per dependency instead of a single
 * opaque "ok".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const appsArr: any[] = [{}]; // pre-populated: this suite always behaves as if Admin is configured
  const store = new Map<string, Map<string, any>>();
  const collectionOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const makeDocRef = (collectionName: string, id: string) => ({
    id,
    __collection: collectionName,
    get: async () => {
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
    delete: async () => { collectionOf(collectionName).delete(id); }
  });
  const firestoreObj: any = {
    collection: (name: string) => ({ doc: (id: string) => makeDocRef(name, id), where: () => firestoreObj.collection(name) }),
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
    initializeApp: () => { appsArr.push({}); },
    firestore: () => firestoreObj
  };
  return { default: admin };
});

const sendWhatsAppMessage = vi.fn();
vi.mock('../src/server/whatsapp', () => ({
  sendWhatsAppMessage: (...args: any[]) => sendWhatsAppMessage(...args),
  isWhatsAppConfigured: () => true,
  getWhatsAppGroupRecipients: () => []
}));

describe('Dead-Letter Queue', () => {
  beforeEach(() => {
    sendWhatsAppMessage.mockReset();
  });

  it('records a failed send with what is needed to retry it', async () => {
    const { recordFailedJob, getDeadLetterCache } = await import('../src/server/deadLetterQueue');
    const job = await recordFailedJob('whatsapp_send', { phone: '971500000000', message: 'hello' }, 'Rate limited');
    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(0);
    expect(getDeadLetterCache().some(j => j.id === job.id)).toBe(true);
  });

  it('a successful retry resolves the job', async () => {
    const { recordFailedJob, retryFailedJob } = await import('../src/server/deadLetterQueue');
    sendWhatsAppMessage.mockResolvedValueOnce({ success: true, status: 'sent' });

    const job = await recordFailedJob('whatsapp_send', { phone: '971500000001', message: 'retry me' }, 'Network error');
    const retried = await retryFailedJob(job.id);

    expect(retried.status).toBe('resolved');
    expect(retried.attempts).toBe(1);
  });

  it('a failed retry stays open and records the new error', async () => {
    const { recordFailedJob, retryFailedJob } = await import('../src/server/deadLetterQueue');
    sendWhatsAppMessage.mockResolvedValueOnce({ success: false, status: 'failed', error: 'Still down' });

    const job = await recordFailedJob('whatsapp_send', { phone: '971500000002', message: 'still broken' }, 'Original error');
    const retried = await retryFailedJob(job.id);

    expect(retried.status).toBe('failed');
    expect(retried.attempts).toBe(1);
    expect(retried.error).toBe('Still down');
  });

  it('resolving requires a note', async () => {
    const { recordFailedJob, resolveFailedJob, DeadLetterError } = await import('../src/server/deadLetterQueue');
    const job = await recordFailedJob('whatsapp_send', { phone: '971500000003', message: 'x' }, 'err');
    await expect(resolveFailedJob(job.id, '', { uid: 'U1', name: 'Test' })).rejects.toThrow(DeadLetterError);
  });

  it('cannot resolve an already-resolved job', async () => {
    const { recordFailedJob, resolveFailedJob, DeadLetterError } = await import('../src/server/deadLetterQueue');
    const job = await recordFailedJob('whatsapp_send', { phone: '971500000004', message: 'x' }, 'err');
    await resolveFailedJob(job.id, 'Contacted customer by phone instead.', { uid: 'U1', name: 'Test' });
    await expect(resolveFailedJob(job.id, 'again', { uid: 'U1', name: 'Test' })).rejects.toThrow(DeadLetterError);
  });

  it('markAllAlerted moves every open job to alerted, without touching resolved ones', async () => {
    const { recordFailedJob, resolveFailedJob, markAllAlerted, getDeadLetterCache } = await import('../src/server/deadLetterQueue');
    const openJob = await recordFailedJob('whatsapp_send', { phone: '971500000005', message: 'x' }, 'err');
    const resolvedJob = await recordFailedJob('whatsapp_send', { phone: '971500000006', message: 'x' }, 'err');
    await resolveFailedJob(resolvedJob.id, 'handled manually', { uid: 'U1', name: 'Test' });

    await markAllAlerted();

    const cache = getDeadLetterCache();
    expect(cache.find(j => j.id === openJob.id)?.status).toBe('alerted');
    expect(cache.find(j => j.id === resolvedJob.id)?.status).toBe('resolved');
  });
});

describe('Operational Health', () => {
  it('reports each dependency with its own status, not one opaque flag', async () => {
    const { checkOperationalHealth } = await import('../src/server/operationalHealth');
    const result = await checkOperationalHealth();

    expect(result.overallStatus).toMatch(/healthy|degraded|unhealthy/);
    expect(result.checks.api.status).toBe('healthy');
    expect(['healthy', 'unhealthy']).toContain(result.checks.firestore.status);
    expect(['configured', 'not_configured', 'degraded']).toContain(result.checks.whatsapp.status);
    expect(['configured', 'not_configured']).toContain(result.checks.ai.status);
    expect(['healthy', 'stale', 'never_run']).toContain(result.checks.backgroundJobs.status);
    expect(['healthy', 'has_unresolved']).toContain(result.checks.deadLetterQueue.status);
  });

  it('reflects a non-empty dead-letter queue as degraded, not silently healthy', async () => {
    const { recordFailedJob } = await import('../src/server/deadLetterQueue');
    const { checkOperationalHealth } = await import('../src/server/operationalHealth');

    await recordFailedJob('whatsapp_send', { phone: '971500000099', message: 'x' }, 'still open');
    const result = await checkOperationalHealth();

    expect(result.checks.deadLetterQueue.unresolvedCount).toBeGreaterThan(0);
    expect(result.overallStatus).not.toBe('healthy');
  });
});
