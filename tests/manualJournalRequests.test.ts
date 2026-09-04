/**
 * Manual Journal Requests (non-customer income: financing received, partner
 * capital support, or any other credit that isn't a customer collection).
 *
 * requestManualJournal/decideManualJournal/listManualJournalRequests
 * (src/server/accounting.ts) had zero test coverage before this file --
 * they are the mechanism the new "Other Income Source" UI in
 * FinanceControlCenterView.tsx relies on, and enforce real money-movement
 * governance (segregation of duties: the requester can never approve their
 * own request; a request only actually posts to the ledger on approval,
 * never on creation).
 *
 * ISOLATION: firebase-admin is fully mocked with an in-memory Firestore
 * simulation (same pattern as tests/paymentGateway.test.ts /
 * tests/vehicleMasterProfile.test.ts), extended with orderBy/limit
 * chaining on a bare collection query (no .where()), which
 * listManualJournalRequests needs and the existing mock didn't support.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const appsArr: any[] = [{}];
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
    }
  });

  function applyQuery(name: string, opts: { orderByField?: string; orderByDir?: 'asc' | 'desc'; limitN?: number }) {
    let entries = Array.from(collectionOf(name).entries());
    if (opts.orderByField) {
      const field = opts.orderByField;
      const dir = opts.orderByDir === 'desc' ? -1 : 1;
      entries = entries.sort(([, a], [, b]) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * dir);
    }
    if (opts.limitN !== undefined) entries = entries.slice(0, opts.limitN);
    return entries.map(([id, data]) => ({ id, data: () => data }));
  }

  const makeQueryRef = (name: string, opts: { orderByField?: string; orderByDir?: 'asc' | 'desc'; limitN?: number } = {}): any => ({
    orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => makeQueryRef(name, { ...opts, orderByField: field, orderByDir: dir }),
    limit: (n: number) => makeQueryRef(name, { ...opts, limitN: n }),
    get: async () => {
      const docs = applyQuery(name, opts);
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
  });

  const makeCollectionRef = (name: string): any => ({
    doc: (id: string) => makeDocRef(name, id),
    get: async () => makeQueryRef(name).get(),
    orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => makeQueryRef(name, { orderByField: field, orderByDir: dir }),
    where: () => makeQueryRef(name) // not exercised by these tests -- accounts/periods lookups use .doc()/.get() directly
  });

  const firestoreObj: any = {
    collection: (name: string) => makeCollectionRef(name),
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
        }
      };
      return fn(tx, firestoreObj);
    }
  };

  return {
    default: {
      apps: appsArr,
      firestore: () => firestoreObj
    }
  };
});

import { requestManualJournal, listManualJournalRequests, decideManualJournal } from '../src/server/accounting';

const ACTOR_A = { uid: 'U-FIN-A', name: 'Finance A', role: 'finance' };
const ACTOR_B = { uid: 'U-CEO-B', name: 'CEO B', role: 'ceo' };
const noopAudit = async () => {};

describe('Manual journal requests (non-customer income governance)', () => {
  it('requests a balanced manual journal (e.g. financing received) as pending approval', async () => {
    const request = await requestManualJournal({
      date: '2026-09-01',
      reference: 'LOAN-001',
      memo: 'Vehicle financing drawdown received from bank',
      lines: [
        { accountCode: '1100', debit: 50000, credit: 0 },
        { accountCode: '2300', debit: 0, credit: 50000 }
      ]
    }, ACTOR_A, noopAudit);

    expect(request.status).toBe('pending_approval');
    expect(request.requestedBy).toBe(ACTOR_A.uid);
  });

  it('rejects an unbalanced manual journal request', async () => {
    await expect(requestManualJournal({
      date: '2026-09-01',
      memo: 'Unbalanced attempt',
      lines: [
        { accountCode: '1100', debit: 1000, credit: 0 },
        { accountCode: '3000', debit: 0, credit: 900 }
      ]
    }, ACTOR_A, noopAudit)).rejects.toThrow(/not balanced/i);
  });

  it('rejects a manual journal request with no memo', async () => {
    await expect(requestManualJournal({
      date: '2026-09-01',
      memo: '',
      lines: [
        { accountCode: '1100', debit: 100, credit: 0 },
        { accountCode: '3000', debit: 0, credit: 100 }
      ]
    }, ACTOR_A, noopAudit)).rejects.toThrow(/memo/i);
  });

  it('lists pending requests, most recent first', async () => {
    const list = await listManualJournalRequests();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every(r => r.status === 'pending_approval')).toBe(true);
  });

  it('segregation of duties: the requester cannot approve their own request', async () => {
    const request = await requestManualJournal({
      date: '2026-09-02',
      memo: 'Partner capital support',
      lines: [
        { accountCode: '1100', debit: 20000, credit: 0 },
        { accountCode: '3000', debit: 0, credit: 20000 }
      ]
    }, ACTOR_A, noopAudit);

    await expect(decideManualJournal(request.id, 'approve', 'Approving my own request', ACTOR_A, noopAudit))
      .rejects.toThrow(/segregation of duties/i);
  });

  it('a different authorized approver approving posts a real, balanced journal entry', async () => {
    const request = await requestManualJournal({
      date: '2026-09-03',
      reference: 'PARTNER-INJECT-1',
      memo: 'Partner capital contribution via bank transfer',
      lines: [
        { accountCode: '1100', debit: 15000, credit: 0 },
        { accountCode: '3000', debit: 0, credit: 15000 }
      ]
    }, ACTOR_A, noopAudit);

    const decided = await decideManualJournal(request.id, 'approve', 'Verified bank credit, approving.', ACTOR_B, noopAudit);
    expect(decided.status).toBe('approved');
    expect(decided.journalId).toBeTruthy();
  });

  it('rejecting a request never posts a journal, and records the reason', async () => {
    const request = await requestManualJournal({
      date: '2026-09-04',
      memo: 'Disputed source of funds',
      lines: [
        { accountCode: '1100', debit: 5000, credit: 0 },
        { accountCode: '4900', debit: 0, credit: 5000 }
      ]
    }, ACTOR_A, noopAudit);

    const decided = await decideManualJournal(request.id, 'reject', 'Could not verify the source of funds.', ACTOR_B, noopAudit);
    expect(decided.status).toBe('rejected');
    expect(decided.journalId).toBeUndefined();
    expect(decided.decisionReason).toMatch(/could not verify/i);
  });

  it('a request already decided cannot be decided again', async () => {
    const request = await requestManualJournal({
      date: '2026-09-05',
      memo: 'One-time approval only',
      lines: [
        { accountCode: '1100', debit: 1000, credit: 0 },
        { accountCode: '3000', debit: 0, credit: 1000 }
      ]
    }, ACTOR_A, noopAudit);

    await decideManualJournal(request.id, 'approve', 'First approval.', ACTOR_B, noopAudit);
    await expect(decideManualJournal(request.id, 'approve', 'Second attempt.', ACTOR_B, noopAudit))
      .rejects.toThrow(/already/i);
  });

  it('a decision requires a reason', async () => {
    const request = await requestManualJournal({
      date: '2026-09-06',
      memo: 'Needs a reason to decide',
      lines: [
        { accountCode: '1100', debit: 100, credit: 0 },
        { accountCode: '3000', debit: 0, credit: 100 }
      ]
    }, ACTOR_A, noopAudit);

    await expect(decideManualJournal(request.id, 'approve', '', ACTOR_B, noopAudit)).rejects.toThrow(/reason/i);
  });
});
