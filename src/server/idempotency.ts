import { runDurableTransaction } from './persistence';

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
 */
export async function runIdempotent<T>(
  scope: string,
  idempotencyKey: string | undefined | null,
  fn: (tx: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore) => Promise<T>
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
      return { result: (existing.data() as { result: T }).result, replayed: true };
    }

    const result = await fn(tx, db);

    tx.create(ref, {
      scope,
      idempotencyKey,
      result,
      createdAt: new Date().toISOString()
    });

    return { result, replayed: false };
  });
}
