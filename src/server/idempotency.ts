import crypto from 'node:crypto';
import { runDurableTransaction, PersistenceError } from './persistence.js';

// Durable idempotency for critical, duplicate-sensitive mutations (contract
// creation, payment recording, ...). Previously the only idempotency
// mechanism anywhere in the backend was an in-memory Map with a 60-second
// TTL in src/server/splendorConnectEngine.ts, used just for the public
// website's lead/reservation intake -- process-local, so it only protects
// against a duplicate landing on the SAME warm instance, and nothing at
// all protected contract creation or payment recording, where a
// double-click or a network retry could double-bill a customer.
//
// This stores "this key already ran, here is its result" as a Firestore
// document, checked and written inside the SAME transaction as the
// operation itself -- durable across restarts, and safe across concurrent
// serverless instances the same way reserveVehicleSlot() is.

export interface IdempotentOutcome<T> {
  result: T;
  replayed: boolean;
}

/** Same (scope, idempotencyKey) reused for a request whose body doesn't match the first one that used it -- refused rather than silently replaying the wrong result or silently creating a second effect. */
export class IdempotencyConflictError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

/** Deterministic fingerprint of a request body, used to detect a key reused for a genuinely different request. Not a security boundary -- just a duplicate-vs-conflict distinguisher. */
export function fingerprintRequest(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}

/**
 * Runs `fn` exactly once per (scope, idempotencyKey) pair. `fn` receives
 * the same transaction/db this function itself is using, and MUST perform
 * all of its own Firestore reads before any writes (a Firestore
 * requirement for transactions) -- this wrapper's own idempotency-key read
 * happens first and its write happens last, so composing correctly with
 * `fn` only requires `fn` itself to keep its reads before its writes.
 *
 * If `idempotencyKey` is omitted, `fn` still runs inside a durable
 * transaction (still safe), just without duplicate-suppression -- callers
 * that always have a key (the frontend now sends one on every mutation
 * this guards) get full protection; this is only a fallback for direct
 * API callers that don't supply one.
 *
 * `fingerprint`, when supplied, is compared against the fingerprint stored
 * with the original request on a key match; a mismatch throws
 * `IdempotencyConflictError` instead of replaying the old result. Omitting
 * it (as every caller before this parameter existed still does) preserves
 * the original replay-only behavior exactly.
 */
export async function runIdempotent<T>(
  scope: string,
  idempotencyKey: string | undefined | null,
  fn: (tx: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore) => Promise<T>,
  fingerprint?: string
): Promise<IdempotentOutcome<T>> {
  if (!idempotencyKey) {
    const result = await runDurableTransaction((tx, db) => fn(tx, db));
    return { result, replayed: false };
  }

  const docId = `${scope}:${idempotencyKey}`.replace(/\//g, '_');
  return runDurableTransaction(async (tx, db) => {
    const ref = db.collection('idempotency_keys').doc(docId);
    const existing = await tx.get(ref);
    if (existing.exists) {
      const stored = existing.data() as { result: T; fingerprint?: string };
      if (fingerprint && stored.fingerprint && stored.fingerprint !== fingerprint) {
        throw new IdempotencyConflictError('This Idempotency-Key was already used for a different request. Use a new key for a new request.');
      }
      return { result: stored.result, replayed: true };
    }

    const result = await fn(tx, db);

    tx.create(ref, {
      scope,
      idempotencyKey,
      result,
      ...(fingerprint ? { fingerprint } : {}),
      createdAt: new Date().toISOString()
    });

    return { result, replayed: false };
  });
}

/**
 * Idempotency for callers whose guarded work is a plain async function
 * (issueNextNumber + createDurable + recordAudit, e.g. every Procurement
 * "create X" route) rather than a transaction-composable callback --
 * runIdempotent above can't be used here since fn doesn't take (tx, db)
 * and can't be nested inside this wrapper's own transaction.
 *
 * Safe under real concurrency without one: reserving the idempotency key
 * is a single atomic Firestore `.create()` (fails with ALREADY_EXISTS if
 * another request already holds it -- no transaction needed for exclusivity
 * on one document). Only the request that wins the reservation runs `fn`.
 * A loser either replays the winner's stored result (same fingerprint) or
 * is told the key conflicts (different fingerprint) once the winner's
 * result lands; a small bounded wait covers the brief window where the
 * winner is still mid-flight. If `fn` itself throws, the reservation is
 * removed so a genuine retry with the same key and the same request isn't
 * permanently blocked by a failed attempt that had no real effect.
 */
export async function runIdempotentCreate<T>(
  scope: string,
  idempotencyKey: string | undefined | null,
  fingerprint: string | undefined,
  fn: () => Promise<T>
): Promise<IdempotentOutcome<T>> {
  if (!idempotencyKey) {
    return { result: await fn(), replayed: false };
  }

  const db = (await import('firebase-admin')).default.firestore();
  const docId = `${scope}:${idempotencyKey}`.replace(/\//g, '_');
  const ref = db.collection('idempotency_keys').doc(docId);

  const resolveExisting = async (): Promise<IdempotentOutcome<T> | null> => {
    const snap = await ref.get();
    if (!snap.exists) return null;
    const stored = snap.data() as { status: 'in_progress' | 'done'; fingerprint?: string; result?: T };
    if (fingerprint && stored.fingerprint && stored.fingerprint !== fingerprint) {
      throw new IdempotencyConflictError('This Idempotency-Key was already used for a different request. Use a new key for a new request.');
    }
    if (stored.status === 'done') {
      return { result: stored.result as T, replayed: true };
    }
    return null; // still in_progress -- caller will wait and re-check
  };

  const existing = await resolveExisting();
  if (existing) return existing;

  try {
    await ref.create({ scope, idempotencyKey, fingerprint: fingerprint ?? null, status: 'in_progress', createdAt: new Date().toISOString() });
  } catch (err: any) {
    // Lost the reservation race to a concurrent identical request -- wait
    // briefly for it to finish, then replay its result (or surface a
    // conflict if the fingerprints actually differ).
    if (err?.code === 6 /* ALREADY_EXISTS */) {
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 150));
        const resolved = await resolveExisting();
        if (resolved) return resolved;
      }
      throw new IdempotencyConflictError('A request with this Idempotency-Key is already in progress. Please retry shortly.');
    }
    throw err;
  }

  try {
    const result = await fn();
    await ref.set({ scope, idempotencyKey, fingerprint: fingerprint ?? null, status: 'done', result, createdAt: new Date().toISOString() });
    return { result, replayed: false };
  } catch (err) {
    await ref.delete().catch(() => {});
    throw err;
  }
}
