import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { canTax } from '../config/taxCompliance';
import type { JournalEntry } from '../accounting/types';
import type { TaxBlockingException } from '../tax/exceptionTypes';
import type { TaxReconciliationPostingGapEvidence, TaxReconciliationSnapshot } from '../tax/reconciliationTypes';
import type { TaxPeriod, TaxPermission } from '../tax/types';
import type { UserRole } from '../types';
import type { TaxActor } from './taxCompliancePolicy';
import {
  journalEvidenceHash,
  readAuthoritativeReconciliationEvidence,
  reconciliationMoney
} from './taxReconciliationEvidence';
import { validateCaptureTaxReconciliation, validateResolveReconciliationPostingGap } from './taxReconciliationPolicy';

const PERIOD_COLLECTION = 'tax_periods';
const EXCEPTION_COLLECTION = 'tax_period_exceptions';
const RECONCILIATION_COLLECTION = 'tax_reconciliation_snapshots';
const RECONCILIATION_STATE_COLLECTION = 'tax_reconciliation_states';
const AUDIT_COLLECTION = 'tax_audit_events';
const USER_ROLES = new Set<UserRole>(['ceo', 'admin', 'operations', 'sales', 'fleet', 'finance']);

function cleanText(value: unknown, maxLength = 500): string {
  return String(value ?? '').trim().slice(0, maxLength);
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
    if (!data || !USER_ROLES.has(role) || String(data?.status || 'active') !== 'active') {
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

function buildSnapshot(
  refId: string,
  period: TaxPeriod,
  version: number,
  actor: TaxActor,
  postedJournals: JournalEntry[],
  postingGaps: TaxReconciliationPostingGapEvidence[],
  status: TaxReconciliationSnapshot['status'],
  now: string
): TaxReconciliationSnapshot {
  const sorted = [...postedJournals].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return {
    id: refId,
    periodId: period.id,
    domain: period.domain,
    version,
    status,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    accountingEvidenceSource: 'accounting_journals',
    ledgerJournalIds: sorted.map(journal => journal.id),
    ledgerJournalCount: sorted.length,
    ledgerTotalDebit: reconciliationMoney(sorted.reduce((sum, journal) => sum + journal.totalDebit, 0)),
    ledgerTotalCredit: reconciliationMoney(sorted.reduce((sum, journal) => sum + journal.totalCredit, 0)),
    ledgerEvidenceHashAlgorithm: 'SHA-256',
    ledgerEvidenceHash: journalEvidenceHash(sorted),
    postingGapCount: postingGaps.length,
    postingGaps,
    technicalScope: 'POSTED_ACCOUNTING_LEDGER_AND_POSTING_GAPS',
    capturedBy: actor.uid,
    capturedByName: actor.name,
    capturedAt: now,
    ...(status === 'reviewed_clean' ? { reviewedBy: actor.uid, reviewedByName: actor.name, reviewedAt: now } : {})
  };
}

function writeAuditInTransaction(
  tx: admin.firestore.Transaction,
  actor: TaxActor,
  entityType: 'TaxReconciliationSnapshot' | 'TaxBlockingException' | 'TaxPeriod',
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

async function captureReconciliation(req: Request, res: Response, actor: TaxActor) {
  if (!requirePermission(actor, 'tax.prepare', res)) return;
  const periodId = cleanText(req.body?.periodId || req.query.periodId, 180);
  if (!periodId) return res.status(400).json({ error: 'periodId is required.' });

  const firestore = admin.firestore();
  const periodRef = firestore.collection(PERIOD_COLLECTION).doc(periodId);
  const snapshotRef = firestore.collection(RECONCILIATION_COLLECTION).doc();
  const stateRef = firestore.collection(RECONCILIATION_STATE_COLLECTION).doc(periodId);
  const blockerRef = firestore.collection(EXCEPTION_COLLECTION).doc();
  const now = new Date().toISOString();

  const result = await firestore.runTransaction(async tx => {
    const periodSnap = await tx.get(periodRef);
    if (!periodSnap.exists) throw new Error('Tax Period not found.');
    const period = { id: periodSnap.id, ...periodSnap.data() } as TaxPeriod;
    const policyError = validateCaptureTaxReconciliation(period, actor);
    if (policyError) throw new Error(policyError);

    const evidence = await readAuthoritativeReconciliationEvidence(tx, firestore, period);
    const [stateSnap, exceptionsSnap] = await Promise.all([
      tx.get(stateRef),
      tx.get(firestore.collection(EXCEPTION_COLLECTION).where('periodId', '==', periodId))
    ]);
    const lastVersion = stateSnap.exists ? Number(stateSnap.data()?.lastVersion || 0) : 0;
    const snapshot = buildSnapshot(snapshotRef.id, period, lastVersion + 1, actor, evidence.postedJournals, evidence.postingGaps, 'captured', now);
    const exceptions = exceptionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaxBlockingException));
    const openExceptions = exceptions.filter(exception => exception.status === 'open');
    const existingManagedBlocker = openExceptions.find(exception => exception.managedBy === 'TAX_RECONCILIATION' && exception.managedKey === 'POSTING_GAPS');
    let blocker: TaxBlockingException | undefined;
    let nextOpenCount = openExceptions.length;

    if (snapshot.postingGapCount > 0 && !existingManagedBlocker) {
      blocker = {
        id: blockerRef.id,
        periodId,
        domain: period.domain,
        category: 'POSTING_GAP',
        title: 'Accounting posting gaps block Tax Reconciliation',
        description: `${snapshot.postingGapCount} authoritative accounting posting gap(s) were captured in Tax Reconciliation snapshot ${snapshot.id}.`,
        status: 'open',
        evidenceReference: snapshot.id,
        managedBy: 'TAX_RECONCILIATION',
        managedKey: 'POSTING_GAPS',
        openedBy: actor.uid,
        openedByName: actor.name,
        openedAt: now,
        updatedAt: now
      };
      nextOpenCount += 1;
    }

    const nextPeriod: TaxPeriod = {
      ...period,
      blockingExceptionCount: nextOpenCount,
      latestReconciliationSnapshotId: snapshot.id,
      latestReconciliationCapturedAt: now,
      latestReconciliationPostingGapCount: snapshot.postingGapCount,
      latestReconciliationLedgerEvidenceHash: snapshot.ledgerEvidenceHash,
      updatedAt: now
    };

    tx.create(snapshotRef, snapshot);
    tx.set(stateRef, { periodId, lastVersion: snapshot.version, latestSnapshotId: snapshot.id, updatedAt: now }, { merge: false });
    if (blocker) tx.create(blockerRef, blocker);
    tx.set(periodRef, nextPeriod, { merge: false });
    writeAuditInTransaction(tx, actor, 'TaxReconciliationSnapshot', snapshot.id, 'capture', undefined, snapshot, 'Immutable server-side snapshot of posted accounting ledger evidence and posting gaps captured for Tax Reconciliation.');
    if (blocker) writeAuditInTransaction(tx, actor, 'TaxBlockingException', blocker.id, 'open_from_reconciliation', undefined, blocker, blocker.description);
    writeAuditInTransaction(tx, actor, 'TaxPeriod', period.id, 'reconciliation_snapshot_captured', period, nextPeriod, `Tax Reconciliation snapshot ${snapshot.id} captured. This does not calculate or file a tax return.`);
    return { snapshot, blocker: blocker || existingManagedBlocker || null };
  }).catch(error => ({ error: error instanceof Error ? error.message : 'Tax Reconciliation capture failed.' }));

  if ('error' in result) return res.status(400).json(result);
  return res.status(201).json(result);
}

async function resolvePostingGapBlocker(req: Request, res: Response, actor: TaxActor) {
  if (!requirePermission(actor, 'tax.review', res)) return;
  const periodId = cleanText(req.body?.periodId || req.query.periodId, 180);
  if (!periodId) return res.status(400).json({ error: 'periodId is required.' });

  const firestore = admin.firestore();
  const periodRef = firestore.collection(PERIOD_COLLECTION).doc(periodId);
  const snapshotRef = firestore.collection(RECONCILIATION_COLLECTION).doc();
  const stateRef = firestore.collection(RECONCILIATION_STATE_COLLECTION).doc(periodId);
  const now = new Date().toISOString();

  const result = await firestore.runTransaction(async tx => {
    const periodSnap = await tx.get(periodRef);
    if (!periodSnap.exists) throw new Error('Tax Period not found.');
    const period = { id: periodSnap.id, ...periodSnap.data() } as TaxPeriod;
    const evidence = await readAuthoritativeReconciliationEvidence(tx, firestore, period);
    const [stateSnap, exceptionsSnap] = await Promise.all([
      tx.get(stateRef),
      tx.get(firestore.collection(EXCEPTION_COLLECTION).where('periodId', '==', periodId))
    ]);
    const exceptions = exceptionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaxBlockingException));
    const openExceptions = exceptions.filter(exception => exception.status === 'open');
    const blocker = openExceptions.find(exception => exception.managedBy === 'TAX_RECONCILIATION' && exception.managedKey === 'POSTING_GAPS');
    if (!blocker) throw new Error('No open Tax Reconciliation posting-gap blocker exists for this period.');
    const policyError = validateResolveReconciliationPostingGap(period, blocker, actor, evidence.postingGaps.length);
    if (policyError) throw new Error(policyError);

    const lastVersion = stateSnap.exists ? Number(stateSnap.data()?.lastVersion || 0) : 0;
    const snapshot = buildSnapshot(snapshotRef.id, period, lastVersion + 1, actor, evidence.postedJournals, evidence.postingGaps, 'reviewed_clean', now);
    const resolvedBlocker: TaxBlockingException = {
      ...blocker,
      status: 'resolved',
      resolutionNote: 'Independent Tax Reconciliation review confirmed that the authoritative period-scoped posting-gap scan currently returns zero gaps.',
      resolutionReference: snapshot.id,
      resolvedBy: actor.uid,
      resolvedByName: actor.name,
      resolvedAt: now,
      updatedAt: now
    };
    const nextPeriod: TaxPeriod = {
      ...period,
      blockingExceptionCount: Math.max(0, openExceptions.length - 1),
      latestReconciliationSnapshotId: snapshot.id,
      latestReconciliationCapturedAt: now,
      latestReconciliationPostingGapCount: 0,
      latestReconciliationLedgerEvidenceHash: snapshot.ledgerEvidenceHash,
      updatedAt: now
    };

    tx.create(snapshotRef, snapshot);
    tx.set(stateRef, { periodId, lastVersion: snapshot.version, latestSnapshotId: snapshot.id, updatedAt: now }, { merge: false });
    tx.set(firestore.collection(EXCEPTION_COLLECTION).doc(blocker.id), resolvedBlocker, { merge: false });
    tx.set(periodRef, nextPeriod, { merge: false });
    writeAuditInTransaction(tx, actor, 'TaxReconciliationSnapshot', snapshot.id, 'review_clean', undefined, snapshot, 'Independent reviewer captured a zero-posting-gap reconciliation snapshot.');
    writeAuditInTransaction(tx, actor, 'TaxBlockingException', blocker.id, 'resolve_from_reconciliation', blocker, resolvedBlocker, resolvedBlocker.resolutionNote || 'Reconciliation blocker resolved.');
    writeAuditInTransaction(tx, actor, 'TaxPeriod', period.id, 'reconciliation_posting_gap_blocker_resolved', period, nextPeriod, `Managed reconciliation blocker ${blocker.id} resolved against snapshot ${snapshot.id}.`);
    return { snapshot, resolvedBlocker };
  }).catch(error => ({ error: error instanceof Error ? error.message : 'Tax Reconciliation review failed.' }));

  if ('error' in result) return res.status(400).json(result);
  return res.status(200).json(result);
}

export default async function taxReconciliationHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Tax-Compliance-Readiness', 'NOT_READY_FOR_FILING');

  const actor = await authenticate(req, res);
  if (!actor) return;
  if (!requirePermission(actor, 'tax.view', res)) return;

  const method = String(req.method || 'GET').toUpperCase();
  const action = cleanText(req.query.action, 60);
  if (method === 'GET') {
    const periodId = cleanText(req.query.periodId, 180);
    if (!periodId) return res.status(400).json({ error: 'periodId is required to list Tax Reconciliation snapshots.' });
    const snapshot = await admin.firestore().collection(RECONCILIATION_COLLECTION).where('periodId', '==', periodId).get();
    const reconciliations = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as TaxReconciliationSnapshot))
      .sort((a, b) => b.version - a.version);
    return res.status(200).json(reconciliations);
  }

  if (method === 'POST' && (!action || action === 'capture')) return captureReconciliation(req, res, actor);
  if (method === 'POST' && action === 'resolve-posting-gaps') return resolvePostingGapBlocker(req, res, actor);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method or Tax Reconciliation action not allowed.' });
}
