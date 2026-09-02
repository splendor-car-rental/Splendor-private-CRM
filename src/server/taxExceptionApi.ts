import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { canTax } from '../config/taxCompliance';
import type { TaxBlockingException, TaxBlockingExceptionCategory } from '../tax/exceptionTypes';
import type { TaxPeriod, TaxPermission } from '../tax/types';
import type { UserRole } from '../types';
import type { TaxActor } from './taxCompliancePolicy';
import { applyBlockingExceptionToPeriod, validateCreateBlockingException, validateResolveBlockingException } from './taxExceptionPolicy';

const PERIOD_COLLECTION = 'tax_periods';
const EXCEPTION_COLLECTION = 'tax_period_exceptions';
const AUDIT_COLLECTION = 'tax_audit_events';
const USER_ROLES = new Set<UserRole>(['ceo', 'admin', 'operations', 'sales', 'fleet', 'finance']);
const CATEGORIES = new Set<TaxBlockingExceptionCategory>([
  'POSTING_GAP',
  'UNCLASSIFIED_TAX_ITEM',
  'RECONCILIATION_DIFFERENCE',
  'MISSING_EVIDENCE',
  'INVALID_TAX_DOCUMENT_CLASSIFICATION',
  'TAX_ADJUSTMENT_PENDING',
  'OTHER'
]);

function cleanText(value: unknown, maxLength = 500): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength = 500): string | undefined {
  const cleaned = cleanText(value, maxLength);
  return cleaned || undefined;
}

function normalizeExplicitPermissions(value: unknown): TaxPermission[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((permission): permission is TaxPermission => typeof permission === 'string' && permission.startsWith('tax.'));
}

async function authenticate(req: Request, res: Response): Promise<TaxActor | null> {
  if (admin.apps.length === 0) {
    res.status(503).json({ error: 'Tax Compliance runtime is not initialized.' });
    return null;
  }
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
    const data = profile.exists ? profile.data() as any : null;
    const role = String(data?.role || '') as UserRole;
    if (!data || !USER_ROLES.has(role) || String(data?.status || '') !== 'active') {
      res.status(403).json({ error: 'A valid active Splendor staff role is required.' });
      return null;
    }
    return {
      uid: decoded.uid,
      name: String(data.name || decoded.name || decoded.uid),
      role,
      explicitTaxPermissions: normalizeExplicitPermissions(data.taxPermissions)
    };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}

function requirePermission(actor: TaxActor, permission: TaxPermission, res: Response): boolean {
  if (canTax(actor.role, permission, actor.explicitTaxPermissions)) return true;
  res.status(403).json({ error: `Missing required Tax Compliance permission: ${permission}` });
  return false;
}

function canRaiseException(actor: TaxActor): boolean {
  return canTax(actor.role, 'tax.prepare', actor.explicitTaxPermissions) || canTax(actor.role, 'tax.review', actor.explicitTaxPermissions);
}

function writeAuditInTransaction(
  tx: admin.firestore.Transaction,
  actor: TaxActor,
  entityType: 'TaxBlockingException' | 'TaxPeriod',
  entityId: string,
  action: string,
  previousValue: unknown,
  newValue: unknown,
  reason: string
) {
  const ref = admin.firestore().collection(AUDIT_COLLECTION).doc();
  tx.create(ref, {
    id: ref.id,
    entityType,
    entityId,
    action,
    actorId: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    reason,
    ...(previousValue !== undefined ? { previousValue } : {}),
    ...(newValue !== undefined ? { newValue } : {}),
    timestamp: new Date().toISOString()
  });
}

function exceptionFingerprint(input: {
  periodId: string;
  category: string;
  title: string;
  description: string;
  evidenceReference?: string;
  evidenceDocumentId?: string;
}): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32).toUpperCase();
}

async function createException(req: Request, res: Response, actor: TaxActor) {
  if (!canRaiseException(actor)) return res.status(403).json({ error: 'Missing required Tax Compliance prepare/review permission.' });
  const periodId = cleanText(req.body?.periodId, 180);
  const category = cleanText(req.body?.category, 80) as TaxBlockingExceptionCategory;
  const title = cleanText(req.body?.title, 240);
  const description = cleanText(req.body?.description, 4000);
  const evidenceReference = optionalText(req.body?.evidenceReference, 500);
  const evidenceDocumentId = optionalText(req.body?.evidenceDocumentId, 240);
  if (!periodId || !CATEGORIES.has(category)) return res.status(400).json({ error: 'periodId and a valid blocking-exception category are required.' });

  const db = admin.firestore();
  const periodRef = db.collection(PERIOD_COLLECTION).doc(periodId);
  const exceptionId = `TAXEX-${exceptionFingerprint({ periodId, category, title, description, evidenceReference, evidenceDocumentId })}`;
  const exceptionRef = db.collection(EXCEPTION_COLLECTION).doc(exceptionId);
  const now = new Date().toISOString();

  const result = await db.runTransaction(async tx => {
    const [periodSnap, existingExceptionSnap, existingSnap] = await Promise.all([
      tx.get(periodRef),
      tx.get(exceptionRef),
      tx.get(db.collection(EXCEPTION_COLLECTION).where('periodId', '==', periodId))
    ]);
    if (!periodSnap.exists) throw new Error('Tax period not found.');
    if (existingExceptionSnap.exists) {
      return { replayed: true, exception: { id: existingExceptionSnap.id, ...existingExceptionSnap.data() } as TaxBlockingException };
    }
    const period = { id: periodSnap.id, ...periodSnap.data() } as TaxPeriod;
    const exception: TaxBlockingException = {
      id: exceptionRef.id,
      periodId,
      domain: period.domain,
      category,
      title,
      description,
      status: 'open',
      evidenceReference,
      evidenceDocumentId,
      openedBy: actor.uid,
      openedByName: actor.name,
      openedAt: now,
      updatedAt: now
    };
    const policyError = validateCreateBlockingException(period, exception);
    if (policyError) throw new Error(policyError);

    const openCount = existingSnap.docs.filter(doc => (doc.data() as TaxBlockingException).status === 'open').length;
    const nextPeriod = applyBlockingExceptionToPeriod(period, openCount + 1, now);

    tx.create(exceptionRef, exception);
    tx.set(periodRef, nextPeriod, { merge: false });
    writeAuditInTransaction(tx, actor, 'TaxBlockingException', exception.id, 'open', undefined, exception, description);
    writeAuditInTransaction(tx, actor, 'TaxPeriod', period.id, 'blocking_exception_added', period, nextPeriod, `Blocking exception ${exception.id} opened. Any completed internal-review readiness is invalidated until independent review passes again.`);
    return { replayed: false, exception };
  }).catch(error => ({ error: error instanceof Error ? error.message : 'Tax Blocking Exception creation failed.' }));

  if ('error' in result) return res.status(400).json(result);
  return res.status(result.replayed ? 200 : 201).json(result.exception);
}

async function resolveException(req: Request, res: Response, actor: TaxActor) {
  if (!requirePermission(actor, 'tax.review', res)) return;
  const exceptionId = cleanText(req.body?.exceptionId || req.query.exceptionId, 180);
  const resolutionNote = cleanText(req.body?.resolutionNote, 3000);
  const resolutionReference = optionalText(req.body?.resolutionReference, 500);
  const resolutionEvidenceDocumentId = optionalText(req.body?.resolutionEvidenceDocumentId, 240);
  if (!exceptionId) return res.status(400).json({ error: 'exceptionId is required.' });

  const db = admin.firestore();
  const exceptionRef = db.collection(EXCEPTION_COLLECTION).doc(exceptionId);
  const now = new Date().toISOString();

  const result = await db.runTransaction(async tx => {
    const exceptionSnap = await tx.get(exceptionRef);
    if (!exceptionSnap.exists) throw new Error('Tax Blocking Exception not found.');
    const previous = { id: exceptionSnap.id, ...exceptionSnap.data() } as TaxBlockingException;
    const periodRef = db.collection(PERIOD_COLLECTION).doc(previous.periodId);
    const [periodSnap, exceptionsSnap] = await Promise.all([
      tx.get(periodRef),
      tx.get(db.collection(EXCEPTION_COLLECTION).where('periodId', '==', previous.periodId))
    ]);
    if (!periodSnap.exists) throw new Error('Authoritative Tax Period not found for this exception.');
    const period = { id: periodSnap.id, ...periodSnap.data() } as TaxPeriod;
    const policyError = validateResolveBlockingException(period, previous, actor, resolutionNote, resolutionReference, resolutionEvidenceDocumentId);
    if (policyError) throw new Error(policyError);

    const openCount = exceptionsSnap.docs.filter(doc => (doc.data() as TaxBlockingException).status === 'open').length;
    const nextException: TaxBlockingException = {
      ...previous,
      status: 'resolved',
      resolutionNote,
      resolutionReference,
      resolutionEvidenceDocumentId,
      resolvedBy: actor.uid,
      resolvedByName: actor.name,
      resolvedAt: now,
      updatedAt: now
    };
    const nextPeriod: TaxPeriod = { ...period, blockingExceptionCount: Math.max(0, openCount - 1), updatedAt: now };

    tx.set(exceptionRef, nextException, { merge: false });
    tx.set(periodRef, nextPeriod, { merge: false });
    writeAuditInTransaction(tx, actor, 'TaxBlockingException', previous.id, 'resolve', previous, nextException, resolutionNote);
    writeAuditInTransaction(tx, actor, 'TaxPeriod', period.id, 'blocking_exception_resolved', period, nextPeriod, `Blocking exception ${previous.id} resolved with independent evidence.`);
    return nextException;
  }).catch(error => ({ error: error instanceof Error ? error.message : 'Tax Blocking Exception resolution failed.' }));

  if ('error' in result) return res.status(400).json(result);
  return res.status(200).json(result);
}

export default async function taxExceptionHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Tax-Compliance-Readiness', 'NOT_READY_FOR_FILING');

  const actor = await authenticate(req, res);
  if (!actor) return;
  if (!requirePermission(actor, 'tax.view', res)) return;

  const method = String(req.method || 'GET').toUpperCase();
  const action = cleanText(req.query.action, 60);
  if (method === 'GET') {
    const periodId = cleanText(req.query.periodId, 180);
    if (!periodId) return res.status(400).json({ error: 'periodId is required to list Tax Blocking Exceptions.' });
    const snapshot = await admin.firestore().collection(EXCEPTION_COLLECTION).where('periodId', '==', periodId).get();
    const exceptions = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as TaxBlockingException))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    return res.status(200).json(exceptions);
  }

  if (method === 'POST' && !action) return createException(req, res, actor);
  if (method === 'POST' && action === 'resolve') return resolveException(req, res, actor);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method or Tax Blocking Exception action not allowed.' });
}
