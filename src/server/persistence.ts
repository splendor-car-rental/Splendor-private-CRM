import admin from 'firebase-admin';

// Server-authoritative persistence helpers. Before this remediation, core
// entity routes (customers, leads, contracts, quotations, reservations,
// invoices, payments, deposits, ...) wrote ONLY to the in-memory
// `globalStore` (never persisted for these entities), and the BROWSER made
// a second, independent, best-effort write straight to Firestore
// afterward, wrapped in try/catch with only a console.warn on failure. If
// that second write never happened (network drop, tab closed), the record
// existed nowhere durable -- silent, permanent data loss, even though the
// user already saw a success toast.
//
// The fix: the server is now the only writer. A mutation route calls
// createDurable/updateDurable itself, INSIDE the request, and only updates
// its in-memory globalStore cache (and returns a response) after that
// Firestore write is confirmed. The client never writes to Firestore for
// these entities again -- see CRMContext.tsx, which now only reads from
// Firestore via its existing onSnapshot subscriptions.

export class PersistenceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PersistenceError';
  }
}

function requireDb() {
  if (admin.apps.length === 0) {
    throw new PersistenceError('Firebase Admin is not configured; cannot durably persist this operation.');
  }
  return admin.firestore();
}

/**
 * Fleet master data and Tax Compliance governance/audit records are never
 * physically deleted through shared persistence helpers. Their controlled
 * archive/supersession/status lifecycles preserve historical evidence. This
 * guard sits below individual routes so future code cannot accidentally
 * reintroduce the destructive primitive.
 */
const PROTECTED_DELETE_COLLECTIONS = new Set([
  'vehicles',
  'tax_master_profiles',
  'tax_master_profile_versions',
  'tax_official_sources',
  'tax_rule_versions',
  'tax_periods',
  'tax_period_exceptions',
  'tax_reconciliation_snapshots',
  'tax_reconciliation_states',
  'tax_audit_events',
  'tax_professional_validators'
]);

function assertDeleteAllowed(collection: string): void {
  if (PROTECTED_DELETE_COLLECTIONS.has(collection)) {
    throw new PersistenceError(`Physical deletion of protected master/audit records in ${collection} is prohibited. Use its controlled lifecycle.`);
  }
}

/**
 * Creates a new document with a guaranteed-fresh id (normally issued by
 * issueNextNumber() just before this call). Uses Firestore's `.create()`
 * rather than `.set()`, so if an id somehow collides with an existing
 * document -- a bug elsewhere, not something that should happen given
 * issueNextNumber()'s atomicity -- this fails loudly with ALREADY_EXISTS
 * instead of silently merging two unrelated records together.
 */
export async function createDurable<T extends { id: string }>(collection: string, data: T): Promise<T> {
  try {
    await requireDb().collection(collection).doc(data.id).create(data as Record<string, unknown>);
    return data;
  } catch (err) {
    throw new PersistenceError(`Failed to persist new ${collection}/${data.id}.`, err);
  }
}

/** Merges an update into an existing document. */
export async function updateDurable(collection: string, id: string, data: Record<string, unknown>): Promise<void> {
  try {
    await requireDb().collection(collection).doc(id).set(data, { merge: true });
  } catch (err) {
    throw new PersistenceError(`Failed to persist update to ${collection}/${id}.`, err);
  }
}

/** Deletes a document, except immutable/master-data collections such as Fleet. */
export async function deleteDurable(collection: string, id: string): Promise<void> {
  assertDeleteAllowed(collection);
  try {
    await requireDb().collection(collection).doc(id).delete();
  } catch (err) {
    throw new PersistenceError(`Failed to persist delete of ${collection}/${id}.`, err);
  }
}

/**
 * Runs several create/update/delete operations as one atomic Firestore
 * batch (all-or-nothing) -- for mutations that touch more than one
 * document (e.g. a contract plus the vehicle/reservation it affects), so a
 * partial failure can never leave related documents inconsistent.
 */
export type BatchOp =
  | { type: 'create'; collection: string; id: string; data: Record<string, unknown> }
  | { type: 'update'; collection: string; id: string; data: Record<string, unknown> }
  | { type: 'delete'; collection: string; id: string };

export async function runDurableBatch(ops: BatchOp[]): Promise<void> {
  if (ops.length === 0) return;
  for (const op of ops) {
    if (op.type === 'delete') assertDeleteAllowed(op.collection);
  }
  const db = requireDb();
  try {
    const batch = db.batch();
    for (const op of ops) {
      const ref = db.collection(op.collection).doc(op.id);
      if (op.type === 'create') batch.create(ref, op.data);
      else if (op.type === 'update') batch.set(ref, op.data, { merge: true });
      else batch.delete(ref);
    }
    await batch.commit();
  } catch (err) {
    throw new PersistenceError('Failed to persist a multi-document batch operation.', err);
  }
}

/** Runs a Firestore transaction with the shared "Admin not configured" guard. */
export async function runDurableTransaction<T>(
  fn: (tx: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore) => Promise<T>
): Promise<T> {
  const db = requireDb();
  try {
    return await db.runTransaction((tx) => fn(tx, db));
  } catch (err) {
    if (err instanceof PersistenceError) throw err;
    throw new PersistenceError('Transaction failed.', err);
  }
}
