import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { canTax } from '../config/taxCompliance';
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
  validateProfessionalValidation,
  type TaxActor
} from './taxCompliancePolicy';

const PROFILE_COLLECTION = 'tax_master_profiles';
const SOURCE_COLLECTION = 'tax_official_sources';
const RULE_COLLECTION = 'tax_rule_versions';
const PERIOD_COLLECTION = 'tax_periods';
const AUDIT_COLLECTION = 'tax_audit_events';
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

function normalizeProfessionalValidation(body: any): TaxProfessionalValidation {
  return {
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

function validateLinkedRules(period: TaxPeriod, rules: TaxRuleVersion[]): string | null {
  if (period.ruleVersionIds.length === 0) return null;
  if (rules.length !== period.ruleVersionIds.length) return 'Every linked tax rule version must exist.';
  const found = new Set(rules.map(rule => rule.id));
  if (period.ruleVersionIds.some(id => !found.has(id))) return 'Every linked tax rule version must exist.';
  for (const rule of rules) {
    if (rule.status !== 'accepted') return 'Only accepted immutable tax rule versions may be bound to a tax period.';
    if (rule.domain !== period.domain && rule.domain !== 'TAX_PROCEDURES') {
      return 'A linked tax rule version is not applicable to this tax period domain.';
    }
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

    tx.create(periodRef, period);
    writeAuditInTransaction(tx, actor, period.id, 'create_draft', undefined, period, 'Evidence-bound Tax Period created in Draft status.');
    return period;
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
      reason = 'External UAE tax-professional validation evidence recorded for this Tax Period.';
    } else if (action === 'close') {
      if (!requirePermission(actor, 'tax.approve', res)) throw new Error('FORBIDDEN_RESPONSE_ALREADY_SENT');
      const closureNote = cleanText(req.body?.closureNote || req.body?.reason, 3000);
      if (!closureNote) throw new Error('A closure note is required. Closing a Tax Period does not mean it was filed.');
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
