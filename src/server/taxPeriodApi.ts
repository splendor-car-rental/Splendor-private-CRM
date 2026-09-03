import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { canTax } from '../config/taxCompliance';
import type { TaxBlockingException } from '../tax/exceptionTypes';
import type { TaxReconciliationSnapshot } from '../tax/reconciliationTypes';
import type {
  TaxDeadlineBasis,
  TaxMasterProfile,
  TaxOfficialSource,
  TaxPeriod,
  TaxPermission,
  TaxProfessionalValidation,
  TaxRuleVersion
} from '../tax/types';
import type { UserRole } from '../types';
import {
  periodsOverlap,
  validateCloseTaxPeriod,
  validateIndependentReview,
  validateOpenTaxPeriod,
  validateRecordPeriodProfessionalValidation,
  validateSubmitForReview,
  validateTaxPeriodDraft
} from './taxPeriodPolicy';
import {
  validateOfficialSourceAuthority,
  validateProfessionalValidation,
  type TaxActor
} from './taxCompliancePolicy';
import {
  journalEvidenceHash,
  readAuthoritativeReconciliationEvidence
} from './taxReconciliationEvidence';

const PROFILE_COLLECTION = 'tax_master_profiles';
const SOURCE_COLLECTION = 'tax_official_sources';
const RULE_COLLECTION = 'tax_rule_versions';
const PERIOD_COLLECTION = 'tax_periods';
const EXCEPTION_COLLECTION = 'tax_period_exceptions';
const RECONCILIATION_COLLECTION = 'tax_reconciliation_snapshots';
const AUDIT_COLLECTION = 'tax_audit_events';
const PROFESSIONAL_REGISTRY_COLLECTION = 'tax_professional_validators';
const ACCOUNTING_PERIOD_COLLECTION = 'accounting_periods';
const PROFILE_ID = 'splendor';

const USER_ROLES = new Set<UserRole>(['ceo', 'admin', 'operations', 'sales', 'fleet', 'finance']);
const PERIOD_DOMAINS = new Set(['VAT', 'CORPORATE_TAX']);
const DEADLINE_BASES = new Set<TaxDeadlineBasis>(['EMARATAX_CONFIRMED', 'OFFICIAL_SOURCE', 'SPECIAL_OFFICIAL_NOTICE']);

function cleanText(value: unknown, maxLength = 500): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength = 500): string | undefined {
  const cleaned = cleanText(value, maxLength);
  return cleaned || undefined;
}

function cleanTextArray(value: unknown, maxItems = 30, maxLength = 140): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => cleanText(item, maxLength)).filter(Boolean))).slice(0, maxItems);
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
    // Fail closed: a missing status is not an active account.
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

function normalizeProfessionalValidation(body: any): TaxProfessionalValidation {
  return {
    validatorRegistryId: optionalText(body?.validatorRegistryId, 180),
    validatorName: cleanText(body?.validatorName, 200),
    validatorOrganization: optionalText(body?.validatorOrganization, 240),
    validatorCapacity: 'UAE_TAX_PROFESSIONAL',
    validationReference: optionalText(body?.validationReference, 240),
    validationEvidenceDocumentId: optionalText(body?.validationEvidenceDocumentId, 240),
    scope: cleanText(body?.scope, 3000),
    validatedAt: cleanText(body?.validatedAt, 40),
    validThrough: optionalText(body?.validThrough, 40),
    qualificationsOrLimitations: optionalText(body?.qualificationsOrLimitations, 3000),
    notes: optionalText(body?.notes, 3000)
  };
}

function makePeriodId(domain: string, start: string, end: string): string {
  const safe = (value: string) => value.toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return `TAXPERIOD-${safe(domain)}-${safe(start)}-${safe(end)}`;
}

function normalizePeriod(body: any, actor: TaxActor): TaxPeriod {
  const now = new Date().toISOString();
  const domain = cleanText(body?.domain, 40) as TaxPeriod['domain'];
  const periodStart = cleanText(body?.periodStart, 40);
  const periodEnd = cleanText(body?.periodEnd, 40);
  const filingDeadline = cleanText(body?.filingDeadline, 40);
  return {
    id: makePeriodId(domain, periodStart, periodEnd),
    domain,
    periodStart,
    periodEnd,
    filingDeadline,
    deadlineBasis: cleanText(body?.deadlineBasis, 50) as TaxDeadlineBasis,
    deadlineSourceId: cleanText(body?.deadlineSourceId, 140),
    deadlineSourceVersionUpdatedAt: cleanText(body?.deadlineSourceVersionUpdatedAt, 60),
    deadlineEvidenceReference: optionalText(body?.deadlineEvidenceReference, 500),
    deadlineEvidenceDocumentId: optionalText(body?.deadlineEvidenceDocumentId, 240),
    taxProfileVersionUpdatedAt: cleanText(body?.taxProfileVersionUpdatedAt, 60),
    status: 'draft',
    ruleVersionIds: cleanTextArray(body?.ruleVersionIds),
    blockingExceptionCount: 0,
    governanceReadiness: 'DRAFT',
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: now,
    updatedAt: now
  };
}

function validatePeriodShape(period: TaxPeriod): string | null {
  if (!PERIOD_DOMAINS.has(period.domain)) return 'Tax period domain must be VAT or CORPORATE_TAX.';
  if (!DEADLINE_BASES.has(period.deadlineBasis)) return 'Tax period deadline basis is invalid.';
  if (!period.deadlineSourceId) return 'A documented official deadline source is required.';
  return null;
}

function nextDayIso(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function validateLinkedRules(period: TaxPeriod, rules: TaxRuleVersion[]): string | null {
  if (period.ruleVersionIds.length === 0) return 'A Tax Period must be bound to accepted tax rule versions; an empty rule set is not permitted.';
  if (rules.length !== period.ruleVersionIds.length) return 'Every linked tax rule version must exist.';
  const found = new Set(rules.map(rule => rule.id));
  if (period.ruleVersionIds.some(id => !found.has(id))) return 'Every linked tax rule version must exist.';

  const domainIntervals: Array<{ start: string; end: string }> = [];
  for (const rule of rules) {
    if (rule.status !== 'accepted') return 'Only accepted immutable tax rule versions may be bound to a tax period.';
    if (rule.domain !== period.domain && rule.domain !== 'TAX_PROCEDURES') {
      return 'A linked tax rule version is not applicable to this tax period domain.';
    }
    const effectiveFrom = String(rule.effectiveFrom || '').slice(0, 10);
    const effectiveTo = String(rule.effectiveTo || '9999-12-31').slice(0, 10);
    if (!effectiveFrom || effectiveTo < period.periodStart || effectiveFrom > period.periodEnd) {
      return `Tax rule ${rule.id} is outside the tax period effective dates.`;
    }
    if (rule.domain === period.domain) {
      domainIntervals.push({ start: effectiveFrom, end: effectiveTo });
    }
  }

  // Domain-specific accepted rules must cover the complete period without an
  // ungoverned calendar gap. Multiple sequential versions are allowed.
  const sorted = domainIntervals.sort((a, b) => a.start.localeCompare(b.start));
  if (sorted.length === 0 || sorted[0].start > period.periodStart) {
    return 'Accepted domain tax rules do not cover the beginning of this Tax Period.';
  }
  let coveredThrough = sorted[0].end;
  for (let i = 1; i < sorted.length && coveredThrough < period.periodEnd; i += 1) {
    const interval = sorted[i];
    if (interval.start > nextDayIso(coveredThrough)) return 'Accepted domain tax rules contain an effective-date gap inside this Tax Period.';
    if (interval.end > coveredThrough) coveredThrough = interval.end;
  }
  if (coveredThrough < period.periodEnd) return 'Accepted domain tax rules do not cover the end of this Tax Period.';
  return null;
}

type LinkedRuleEvidencePins = {
  ruleVersionUpdatedAtById: Record<string, string>;
  ruleSourceVersionUpdatedAtById: Record<string, string>;
};

async function validateAndPinLinkedRuleEvidence(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  period: TaxPeriod,
  rules: TaxRuleVersion[],
  expectedPins?: LinkedRuleEvidencePins
): Promise<{ error: string | null; pins?: LinkedRuleEvidencePins }> {
  const ruleVersionUpdatedAtById: Record<string, string> = {};
  for (const rule of rules) {
    const updatedAt = String(rule.updatedAt || '');
    if (!updatedAt) return { error: `Accepted tax rule ${rule.id} has no immutable version timestamp.` };
    if (expectedPins?.ruleVersionUpdatedAtById?.[rule.id] !== undefined && expectedPins.ruleVersionUpdatedAtById[rule.id] !== updatedAt) {
      return { error: `Accepted tax rule ${rule.id} changed after this Tax Period was created.` };
    }
    if (expectedPins && !expectedPins.ruleVersionUpdatedAtById?.[rule.id]) {
      return { error: `Tax Period is missing the pinned version timestamp for accepted rule ${rule.id}.` };
    }
    const validationError = validateProfessionalValidation(rule.professionalValidation);
    if (validationError) return { error: `Accepted tax rule ${rule.id}: ${validationError}` };
    const registryError = await validateProfessionalRegistryEvidence(tx, db, rule.professionalValidation!, period.domain);
    if (registryError) return { error: `Accepted tax rule ${rule.id}: ${registryError}` };
    ruleVersionUpdatedAtById[rule.id] = updatedAt;
  }

  const sourceIds = Array.from(new Set(rules.flatMap(rule => rule.sourceIds || [])));
  if (sourceIds.length === 0) return { error: 'Accepted tax rules must remain bound to official source records.' };
  const sourceSnaps = await Promise.all(sourceIds.map(id => tx.get(db.collection(SOURCE_COLLECTION).doc(id))));
  const ruleSourceVersionUpdatedAtById: Record<string, string> = {};
  for (let index = 0; index < sourceIds.length; index += 1) {
    const sourceId = sourceIds[index];
    const sourceSnap = sourceSnaps[index];
    if (!sourceSnap.exists) return { error: `Official source ${sourceId} supporting an accepted tax rule no longer exists.` };
    const source = { id: sourceSnap.id, ...sourceSnap.data() } as TaxOfficialSource;
    if (!['validated', 'accepted'].includes(source.status)) {
      return { error: `Official source ${sourceId} supporting an accepted tax rule is no longer validated/accepted.` };
    }
    const authorityError = validateOfficialSourceAuthority(source.authority, source.officialUrl);
    if (authorityError) return { error: `Official source ${sourceId}: ${authorityError}` };
    const updatedAt = String(source.updatedAt || '');
    if (!updatedAt) return { error: `Official source ${sourceId} has no immutable version timestamp.` };
    if (expectedPins?.ruleSourceVersionUpdatedAtById?.[sourceId] !== undefined && expectedPins.ruleSourceVersionUpdatedAtById[sourceId] !== updatedAt) {
      return { error: `Official source ${sourceId} supporting an accepted tax rule changed after this Tax Period was created.` };
    }
    if (expectedPins && !expectedPins.ruleSourceVersionUpdatedAtById?.[sourceId]) {
      return { error: `Tax Period is missing the pinned source version for accepted rule evidence ${sourceId}.` };
    }
    ruleSourceVersionUpdatedAtById[sourceId] = updatedAt;
  }

  return { error: null, pins: { ruleVersionUpdatedAtById, ruleSourceVersionUpdatedAtById } };
}

function accountingPeriodKeys(period: TaxPeriod): string[] {
  const start = new Date(`${period.periodStart.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${period.periodEnd.slice(0, 7)}-01T00:00:00.000Z`);
  const keys: string[] = [];
  for (let cursor = start; cursor <= end; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

export async function validateCurrentPeriodGovernanceEvidence(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  period: TaxPeriod
): Promise<string | null> {
  const sourceRef = db.collection(SOURCE_COLLECTION).doc(period.deadlineSourceId);
  const ruleRefs = period.ruleVersionIds.map(id => db.collection(RULE_COLLECTION).doc(id));
  const [sourceSnap, ...ruleSnaps] = await Promise.all([tx.get(sourceRef), ...ruleRefs.map(ref => tx.get(ref))]);
  if (!sourceSnap.exists) return 'The Tax Period deadline source no longer exists.';
  const source = { id: sourceSnap.id, ...sourceSnap.data() } as TaxOfficialSource;
  if (!['validated', 'accepted'].includes(source.status)) return 'The Tax Period deadline source is no longer validated/accepted.';
  if (source.updatedAt !== period.deadlineSourceVersionUpdatedAt) return 'The Tax Period deadline source version changed after the period was created.';
  const authorityError = validateOfficialSourceAuthority(source.authority, source.officialUrl);
  if (authorityError) return authorityError;
  const rules = ruleSnaps.filter(snapshot => snapshot.exists).map(snapshot => ({ id: snapshot.id, ...snapshot.data() } as TaxRuleVersion));
  const ruleError = validateLinkedRules(period, rules);
  if (ruleError) return ruleError;
  if (!period.ruleVersionUpdatedAtById || !period.ruleSourceVersionUpdatedAtById) {
    return 'Tax Period is missing exact accepted-rule/source version pins and cannot advance.';
  }
  const linkedEvidence = await validateAndPinLinkedRuleEvidence(tx, db, period, rules, {
    ruleVersionUpdatedAtById: period.ruleVersionUpdatedAtById,
    ruleSourceVersionUpdatedAtById: period.ruleSourceVersionUpdatedAtById
  });
  return linkedEvidence.error;
}

async function validateProfessionalRegistryEvidence(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  validation: TaxProfessionalValidation,
  domain: TaxPeriod['domain']
): Promise<string | null> {
  const registryId = String(validation.validatorRegistryId || '').trim();
  const evidenceId = String(validation.validationEvidenceDocumentId || '').trim();
  if (!registryId || !evidenceId) return 'Professional validation requires a verified validator registry id and durable evidence document id.';
  const registryRef = db.collection(PROFESSIONAL_REGISTRY_COLLECTION).doc(registryId);
  const evidenceRef = db.collection('documents').doc(evidenceId);
  const issuedEvidenceRef = db.collection('issued_documents').doc(evidenceId);
  const [registrySnap, evidenceSnap, issuedEvidenceSnap] = await Promise.all([
    tx.get(registryRef), tx.get(evidenceRef), tx.get(issuedEvidenceRef)
  ]);
  if (!registrySnap.exists) return 'The referenced Tax Professional Registry record does not exist.';
  const registry = registrySnap.data() as any;
  if (String(registry.status || '') !== 'active' || String(registry.validatorCapacity || '') !== 'UAE_TAX_PROFESSIONAL') {
    return 'The referenced Tax Professional Registry record is not active and eligible.';
  }
  if (String(registry.validatorName || '').trim().toLowerCase() !== String(validation.validatorName || '').trim().toLowerCase()) {
    return 'Professional validator identity does not match the verified registry record.';
  }
  const domains = Array.isArray(registry.domains) ? registry.domains.map(String) : [];
  if (domains.length > 0 && !domains.includes(domain) && !domains.includes('ALL_TAX')) {
    return 'The verified professional validator registry scope does not cover this tax domain.';
  }
  if (!evidenceSnap.exists && !issuedEvidenceSnap.exists) return 'The professional validation evidence document does not exist.';
  return null;
}

async function validateAccountingClosureForTaxPeriod(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  period: TaxPeriod
): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  if (today <= period.periodEnd.slice(0, 10)) return 'A Tax Period cannot be closed before the tax period has fully ended.';
  const keys = accountingPeriodKeys(period);
  const snapshots = await Promise.all(keys.map(key => tx.get(db.collection(ACCOUNTING_PERIOD_COLLECTION).doc(key))));
  for (let i = 0; i < keys.length; i += 1) {
    if (!snapshots[i].exists) return `Accounting period ${keys[i]} must exist and be closed before the overlapping Tax Period can close.`;
    if (String((snapshots[i].data() as any)?.status || '') !== 'closed') {
      return `Accounting period ${keys[i]} must be closed before the overlapping Tax Period can close.`;
    }
  }
  return null;
}

export async function validateAuthoritativeReconciliationFreshness(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  period: TaxPeriod
): Promise<string | null> {
  if (!period.latestReconciliationSnapshotId || !period.latestReconciliationLedgerEvidenceHash) return null;

  const reconciliationRef = db.collection(RECONCILIATION_COLLECTION).doc(period.latestReconciliationSnapshotId);
  const exceptionQuery = db.collection(EXCEPTION_COLLECTION).where('periodId', '==', period.id);
  const [reconciliationSnap, exceptionSnap] = await Promise.all([
    tx.get(reconciliationRef),
    tx.get(exceptionQuery)
  ]);

  if (!reconciliationSnap.exists) {
    return 'The latest Tax Reconciliation evidence snapshot is missing. Capture a new authoritative reconciliation before this Tax Period can advance.';
  }

  const reconciliation = { id: reconciliationSnap.id, ...reconciliationSnap.data() } as TaxReconciliationSnapshot;
  if (reconciliation.periodId !== period.id) {
    return 'The latest Tax Reconciliation evidence snapshot is not bound to this Tax Period.';
  }
  if (
    reconciliation.ledgerEvidenceHash !== period.latestReconciliationLedgerEvidenceHash ||
    reconciliation.postingGapCount !== period.latestReconciliationPostingGapCount
  ) {
    return 'Tax Period reconciliation metadata does not match the immutable latest Tax Reconciliation snapshot.';
  }

  const evidence = await readAuthoritativeReconciliationEvidence(tx, db, period);
  const currentLedgerHash = journalEvidenceHash(evidence.postedJournals);
  if (currentLedgerHash !== reconciliation.ledgerEvidenceHash) {
    return 'Tax Reconciliation evidence is stale because authoritative posted accounting journals changed after the latest snapshot was captured.';
  }
  if (evidence.postingGaps.length !== 0) {
    return 'Tax Reconciliation evidence is stale because authoritative posting gaps changed after the latest snapshot was captured.';
  }

  const openExceptions = exceptionSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as TaxBlockingException))
    .filter(exception => exception.status === 'open');
  const storedBlockingCount = Number(period.blockingExceptionCount || 0);
  if (openExceptions.length !== storedBlockingCount) {
    return 'Tax Period blocking exception count is inconsistent with authoritative open exceptions. Reconcile blockers before advancing.';
  }
  if (openExceptions.length > 0) {
    return 'Authoritative blocking exceptions must be resolved before this Tax Period can advance.';
  }

  return null;
}

function writeAuditInTransaction(
  tx: admin.firestore.Transaction,
  actor: TaxActor,
  periodId: string,
  action: string,
  previousValue: unknown,
  newValue: unknown,
  reason: string
) {
  const ref = admin.firestore().collection(AUDIT_COLLECTION).doc();
  tx.create(ref, {
    id: ref.id,
    entityType: 'TaxPeriod',
    entityId: periodId,
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

async function createTaxPeriod(req: Request, res: Response, actor: TaxActor) {
  if (!requirePermission(actor, 'tax.prepare', res)) return;
  const period = normalizePeriod(req.body, actor);
  const shapeError = validatePeriodShape(period);
  if (shapeError) return res.status(400).json({ error: shapeError });

  const db = admin.firestore();
  const periodRef = db.collection(PERIOD_COLLECTION).doc(period.id);
  const profileRef = db.collection(PROFILE_COLLECTION).doc(PROFILE_ID);
  const sourceRef = db.collection(SOURCE_COLLECTION).doc(period.deadlineSourceId);
  const overlapQuery = db.collection(PERIOD_COLLECTION).where('domain', '==', period.domain);
  const ruleRefs = period.ruleVersionIds.map(id => db.collection(RULE_COLLECTION).doc(id));

  const result = await db.runTransaction(async tx => {
    const [existing, profileSnap, sourceSnap, overlapSnap, ...ruleSnaps] = await Promise.all([
      tx.get(periodRef),
      tx.get(profileRef),
      tx.get(sourceRef),
      tx.get(overlapQuery),
      ...ruleRefs.map(ref => tx.get(ref))
    ]);

    if (existing.exists) throw new Error('This tax period already exists. Tax period definitions are immutable after creation.');
    const profile = profileSnap.exists ? profileSnap.data() as TaxMasterProfile : null;
    const source = sourceSnap.exists ? ({ id: sourceSnap.id, ...sourceSnap.data() } as TaxOfficialSource) : null;
    const policyError = validateTaxPeriodDraft(period, profile, source);
    if (policyError) throw new Error(policyError);

    const overlappingPeriods = overlapSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as TaxPeriod))
      .filter(existingPeriod => periodsOverlap(period, existingPeriod));
    if (overlappingPeriods.length > 0) throw new Error('Tax periods in the same domain cannot overlap.');

    const rules = ruleSnaps.filter(snapshot => snapshot.exists).map(snapshot => ({ id: snapshot.id, ...snapshot.data() } as TaxRuleVersion));
    const ruleError = validateLinkedRules(period, rules);
    if (ruleError) throw new Error(ruleError);

    const linkedEvidence = await validateAndPinLinkedRuleEvidence(tx, db, period, rules);
    if (linkedEvidence.error || !linkedEvidence.pins) throw new Error(linkedEvidence.error || 'Accepted tax rule evidence could not be pinned.');
    const pinnedPeriod: TaxPeriod = { ...period, ...linkedEvidence.pins };

    tx.create(periodRef, pinnedPeriod);
    writeAuditInTransaction(tx, actor, period.id, 'create_draft', undefined, pinnedPeriod, 'Evidence-bound Tax Period created in Draft status with exact accepted-rule and official-source versions pinned.');
    return pinnedPeriod;
  }).catch(error => ({ error: error instanceof Error ? error.message : 'Tax period creation failed.' }));

  if ('error' in result) return res.status(400).json(result);
  return res.status(201).json(result);
}

async function transitionTaxPeriod(req: Request, res: Response, actor: TaxActor, action: string) {
  const periodId = cleanText(req.body?.periodId || req.query.periodId, 180);
  if (!periodId) return res.status(400).json({ error: 'periodId is required.' });

  const db = admin.firestore();
  const ref = db.collection(PERIOD_COLLECTION).doc(periodId);
  const now = new Date().toISOString();

  const result = await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error('Tax period not found.');
    const previous = { id: snapshot.id, ...snapshot.data() } as TaxPeriod;
    let next: TaxPeriod;
    let reason: string;

    // Once preparation starts, every advancement is re-bound to live source
    // and accepted-rule state. Superseding a relied-on source/rule therefore
    // invalidates readiness instead of leaving a stale accepted period.
    if (action !== 'open') {
      const governanceError = await validateCurrentPeriodGovernanceEvidence(tx, db, previous);
      if (governanceError) throw new Error(governanceError);
    }

    if (action === 'open') {
      if (!requirePermission(actor, 'tax.prepare', res)) throw new Error('FORBIDDEN_RESPONSE_ALREADY_SENT');
      const error = validateOpenTaxPeriod(previous, actor);
      if (error) throw new Error(error);
      next = {
        ...previous,
        status: 'open',
        governanceReadiness: 'IN_PREPARATION',
        preparationStartedBy: actor.uid,
        preparationStartedByName: actor.name,
        preparationStartedAt: now,
        updatedAt: now
      };
      reason = 'Tax Period opened for controlled preparation.';
    } else if (action === 'submit-review') {
      if (!requirePermission(actor, 'tax.prepare', res)) throw new Error('FORBIDDEN_RESPONSE_ALREADY_SENT');
      const freshnessError = await validateAuthoritativeReconciliationFreshness(tx, db, previous);
      if (freshnessError) throw new Error(freshnessError);
      const error = validateSubmitForReview(previous, actor);
      if (error) throw new Error(error);
      next = {
        ...previous,
        status: 'under_review',
        governanceReadiness: 'INTERNAL_REVIEW',
        preparedBy: actor.uid,
        preparedByName: actor.name,
        preparedAt: now,
        reviewStatus: 'pending',
        updatedAt: now
      };
      reason = 'Prepared Tax Period submitted for independent internal review.';
    } else if (action === 'complete-review') {
      if (!requirePermission(actor, 'tax.review', res)) throw new Error('FORBIDDEN_RESPONSE_ALREADY_SENT');
      const freshnessError = await validateAuthoritativeReconciliationFreshness(tx, db, previous);
      if (freshnessError) throw new Error(freshnessError);
      const error = validateIndependentReview(previous, actor);
      if (error) throw new Error(error);
      next = {
        ...previous,
        status: 'ready_for_professional_review',
        governanceReadiness: 'AWAITING_PROFESSIONAL_VALIDATION',
        reviewStatus: 'passed',
        reviewNotes: optionalText(req.body?.reviewNotes, 3000),
        reviewedBy: actor.uid,
        reviewedByName: actor.name,
        reviewedAt: now,
        updatedAt: now
      };
      reason = 'Independent internal review passed; external professional validation is now required.';
    } else if (action === 'record-professional-validation') {
      if (!requirePermission(actor, 'tax.approve', res)) throw new Error('FORBIDDEN_RESPONSE_ALREADY_SENT');
      const validation = normalizeProfessionalValidation(req.body?.professionalValidation || req.body);
      const evidenceError = validateProfessionalValidation(validation);
      if (evidenceError) throw new Error(evidenceError);
      const registryError = await validateProfessionalRegistryEvidence(tx, db, validation, previous.domain);
      if (registryError) throw new Error(registryError);
      const freshnessError = await validateAuthoritativeReconciliationFreshness(tx, db, previous);
      if (freshnessError) throw new Error(freshnessError);
      const error = validateRecordPeriodProfessionalValidation(previous, actor, validation);
      if (error) throw new Error(error);
      next = {
        ...previous,
        status: 'professionally_validated',
        governanceReadiness: 'PROFESSIONALLY_VALIDATED',
        professionalValidation: validation,
        professionalValidationRecordedBy: actor.uid,
        professionalValidationRecordedByName: actor.name,
        professionalValidationRecordedAt: now,
        updatedAt: now
      };
      reason = 'Verified external UAE tax-professional validation evidence recorded for this Tax Period.';
    } else if (action === 'close') {
      if (!requirePermission(actor, 'tax.approve', res)) throw new Error('FORBIDDEN_RESPONSE_ALREADY_SENT');
      const closureNote = cleanText(req.body?.closureNote || req.body?.reason, 3000);
      if (!closureNote) throw new Error('A closure note is required. Closing a Tax Period does not mean it was filed.');
      const accountingClosureError = await validateAccountingClosureForTaxPeriod(tx, db, previous);
      if (accountingClosureError) throw new Error(accountingClosureError);
      const freshnessError = await validateAuthoritativeReconciliationFreshness(tx, db, previous);
      if (freshnessError) throw new Error(freshnessError);
      const error = validateCloseTaxPeriod(previous, actor);
      if (error) throw new Error(error);
      next = {
        ...previous,
        status: 'closed',
        governanceReadiness: 'CLOSED',
        closedBy: actor.uid,
        closedByName: actor.name,
        closedAt: now,
        closureNote,
        updatedAt: now
      };
      reason = closureNote;
    } else {
      throw new Error('Unknown Tax Period lifecycle action.');
    }

    tx.set(ref, next, { merge: false });
    writeAuditInTransaction(tx, actor, periodId, action.replace(/-/g, '_'), previous, next, reason);
    return next;
  }).catch(error => ({ error: error instanceof Error ? error.message : 'Tax period transition failed.' }));

  if ('error' in result) {
    if (result.error === 'FORBIDDEN_RESPONSE_ALREADY_SENT') return;
    return res.status(400).json(result);
  }
  return res.status(200).json(result);
}

export default async function taxPeriodHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Tax-Compliance-Readiness', 'NOT_READY_FOR_FILING');

  const actor = await authenticate(req, res);
  if (!actor) return;
  if (!requirePermission(actor, 'tax.view', res)) return;

  const method = String(req.method || 'GET').toUpperCase();
  const resource = cleanText(req.query.resource || '', 40);
  const action = cleanText(req.query.action, 60);
  if (resource !== 'periods') return res.status(400).json({ error: 'Unknown Tax Period resource.' });

  if (method === 'GET') {
    const periodId = cleanText(req.query.periodId, 180);
    if (periodId) {
      const snapshot = await admin.firestore().collection(PERIOD_COLLECTION).doc(periodId).get();
      return res.status(snapshot.exists ? 200 : 404).json(snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() }) : { error: 'Tax period not found.' });
    }
    const snapshot = await admin.firestore().collection(PERIOD_COLLECTION).get();
    const periods = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as TaxPeriod))
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    return res.status(200).json(periods);
  }

  if (method === 'POST' && !action) return createTaxPeriod(req, res, actor);
  if (method === 'POST' && action) return transitionTaxPeriod(req, res, actor, action);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method or Tax Period action not allowed.' });
}
