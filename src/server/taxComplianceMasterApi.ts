import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { canTax } from '../config/taxCompliance.js';
import {
  validateOfficialSourceAuthority,
  validateProfessionalValidation,
  validateRuleAcceptance,
  type TaxActor
} from './taxCompliancePolicy.js';
import { planOfficialSourceSupersession, planTaxRuleSupersession } from './taxVersionSupersession.js';
import type {
  TaxMasterProfile,
  TaxOfficialSource,
  TaxPermission,
  TaxProfessionalValidation,
  TaxRuleVersion,
  TaxSourceAuthority
} from '../tax/types.js';
import type { UserRole } from '../types/index.js';

const PROFILE_COLLECTION = 'tax_master_profiles';
const PROFILE_HISTORY_COLLECTION = 'tax_master_profile_versions';
const SOURCE_COLLECTION = 'tax_official_sources';
const RULE_COLLECTION = 'tax_rule_versions';
const AUDIT_COLLECTION = 'tax_audit_events';
const PROFESSIONAL_REGISTRY_COLLECTION = 'tax_professional_validators';
const PROFILE_ID = 'splendor';

const USER_ROLES = new Set<UserRole>(['ceo', 'admin', 'operations', 'sales', 'fleet', 'finance']);
const SOURCE_AUTHORITIES = new Set<TaxSourceAuthority>(['FTA', 'MOF', 'UAE_LEGISLATION', 'OTHER_OFFICIAL_UAE']);
const SOURCE_DOMAINS = new Set(['VAT', 'CORPORATE_TAX', 'TAX_PROCEDURES', 'E_INVOICING', 'CROSS_DOMAIN']);
const RULE_DOMAINS = new Set(['VAT', 'CORPORATE_TAX', 'TAX_PROCEDURES', 'E_INVOICING']);

function ensureFirebaseAdmin(): boolean {
  if (admin.apps.length > 0) return true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return false;
  try {
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      ...(serviceAccount.project_id ? { projectId: serviceAccount.project_id } : {})
    });
    return true;
  } catch {
    console.error('[tax-compliance] Firebase Admin initialization failed');
    return false;
  }
}

function cleanText(value: unknown, maxLength = 500): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength = 500): string | undefined {
  const cleaned = cleanText(value, maxLength);
  return cleaned || undefined;
}

function cleanTextArray(value: unknown, maxItems = 50, maxLength = 160): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => cleanText(item, maxLength)).filter(Boolean))).slice(0, maxItems);
}

function isIsoDateLike(value: string | undefined): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value));
}

function normalizeExplicitPermissions(value: unknown): TaxPermission[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((permission): permission is TaxPermission => typeof permission === 'string' && permission.startsWith('tax.'));
}

async function authenticate(req: Request, res: Response): Promise<TaxActor | null> {
  if (!ensureFirebaseAdmin()) {
    res.status(503).json({ error: 'Server authentication is not configured. Contact your administrator.' });
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

function auditRef() {
  return admin.firestore().collection(AUDIT_COLLECTION).doc();
}

function writeAuditInTransaction(
  tx: admin.firestore.Transaction,
  actor: TaxActor,
  entityType: 'TaxMasterProfile' | 'TaxOfficialSource' | 'TaxRuleVersion',
  entityId: string,
  action: string,
  previousValue: unknown,
  newValue: unknown,
  reason?: string
) {
  const ref = auditRef();
  tx.create(ref, {
    id: ref.id,
    entityType,
    entityId,
    action,
    actorId: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    ...(reason ? { reason } : {}),
    ...(previousValue !== undefined ? { previousValue } : {}),
    ...(newValue !== undefined ? { newValue } : {}),
    timestamp: new Date().toISOString()
  });
}

function normalizeProfile(body: any, actor: TaxActor, previous?: TaxMasterProfile): TaxMasterProfile {
  const now = new Date().toISOString();
  const verificationRequested = cleanText(body?.verificationStatus, 40);
  const verificationStatus = verificationRequested === 'internally_verified' ? 'internally_verified' : 'unverified';
  return {
    id: 'splendor',
    legalEntityName: cleanText(body?.legalEntityName, 200),
    legalEntityNameAr: optionalText(body?.legalEntityNameAr, 200),
    vatRegistrationStatus: ['registered', 'not_registered', 'under_review'].includes(body?.vatRegistrationStatus)
      ? body.vatRegistrationStatus
      : 'not_configured',
    vatTrn: optionalText(body?.vatTrn, 40),
    vatRegistrationDate: optionalText(body?.vatRegistrationDate, 40),
    vatTaxPeriodDescription: optionalText(body?.vatTaxPeriodDescription, 300),
    corporateTaxRegistrationStatus: ['registered', 'not_registered', 'under_review'].includes(body?.corporateTaxRegistrationStatus)
      ? body.corporateTaxRegistrationStatus
      : 'not_configured',
    corporateTaxTrn: optionalText(body?.corporateTaxTrn, 40),
    corporateTaxRegistrationDate: optionalText(body?.corporateTaxRegistrationDate, 40),
    financialYearStart: optionalText(body?.financialYearStart, 40),
    financialYearEnd: optionalText(body?.financialYearEnd, 40),
    accountingStandard: optionalText(body?.accountingStandard, 160),
    vatTaxGroupStatus: ['not_member', 'member'].includes(body?.vatTaxGroupStatus) ? body.vatTaxGroupStatus : 'unknown',
    corporateTaxGroupStatus: ['not_member', 'member'].includes(body?.corporateTaxGroupStatus) ? body.corporateTaxGroupStatus : 'unknown',
    emirate: optionalText(body?.emirate, 80),
    notes: optionalText(body?.notes, 3000),
    effectiveFrom: cleanText(body?.effectiveFrom || previous?.effectiveFrom, 40),
    effectiveTo: optionalText(body?.effectiveTo, 40),
    verificationStatus,
    ...(verificationStatus === 'internally_verified' ? { verifiedBy: actor.uid, verifiedAt: now } : {}),
    updatedBy: actor.uid,
    updatedByName: actor.name,
    updatedAt: now
  };
}

function validateProfile(profile: TaxMasterProfile): string | null {
  if (!profile.legalEntityName) return 'Legal entity name is required.';
  if (!isIsoDateLike(profile.effectiveFrom)) return 'A valid effective-from date is required.';
  if (profile.effectiveTo && !isIsoDateLike(profile.effectiveTo)) return 'effectiveTo must be an ISO date.';
  if (profile.vatRegistrationDate && !isIsoDateLike(profile.vatRegistrationDate)) return 'VAT registration date must be an ISO date.';
  if (profile.corporateTaxRegistrationDate && !isIsoDateLike(profile.corporateTaxRegistrationDate)) return 'Corporate Tax registration date must be an ISO date.';
  if (profile.financialYearStart && !isIsoDateLike(profile.financialYearStart)) return 'Financial year start must be an ISO date.';
  if (profile.financialYearEnd && !isIsoDateLike(profile.financialYearEnd)) return 'Financial year end must be an ISO date.';
  return null;
}

function normalizeSource(body: any, actor: TaxActor, id: string): TaxOfficialSource {
  const now = new Date().toISOString();
  const authority = cleanText(body?.authority, 40) as TaxSourceAuthority;
  return {
    id,
    domain: cleanText(body?.domain, 40) as TaxOfficialSource['domain'],
    authority,
    officialTitle: cleanText(body?.officialTitle, 300),
    lawDecisionGuideNumber: optionalText(body?.lawDecisionGuideNumber, 160),
    officialUrl: cleanText(body?.officialUrl, 1000),
    publicationDate: optionalText(body?.publicationDate, 40),
    effectiveFrom: optionalText(body?.effectiveFrom, 40),
    effectiveTo: optionalText(body?.effectiveTo, 40),
    versionRevision: optionalText(body?.versionRevision, 160),
    applicablePeriod: optionalText(body?.applicablePeriod, 300),
    topics: cleanTextArray(body?.topics),
    supersedesSourceIds: cleanTextArray(body?.supersedesSourceIds, 20, 100),
    interpretationRequired: body?.interpretationRequired !== false,
    status: 'proposed',
    retrievedAt: cleanText(body?.retrievedAt || now, 40),
    sourceLanguage: ['ar', 'en', 'bilingual'].includes(body?.sourceLanguage) ? body.sourceLanguage : undefined,
    notes: optionalText(body?.notes, 3000),
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: now,
    updatedAt: now
  };
}

function validateSource(source: TaxOfficialSource): string | null {
  if (!SOURCE_DOMAINS.has(source.domain)) return 'Invalid tax source domain.';
  if (!SOURCE_AUTHORITIES.has(source.authority)) return 'Invalid official source authority.';
  if (!source.officialTitle) return 'Official source title is required.';
  const authorityError = validateOfficialSourceAuthority(source.authority, source.officialUrl);
  if (authorityError) return authorityError;
  if (!isIsoDateLike(source.retrievedAt)) return 'Source retrieval date is required.';
  for (const field of [source.publicationDate, source.effectiveFrom, source.effectiveTo]) {
    if (field && !isIsoDateLike(field)) return 'Source date fields must use ISO dates.';
  }
  return null;
}

function makeRuleId(code: string, version: string): string {
  const safeCode = code.toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const safeVersion = version.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `TAXRULE-${safeCode}-${safeVersion}`;
}

function normalizeRule(body: any, actor: TaxActor): TaxRuleVersion {
  const now = new Date().toISOString();
  const code = cleanText(body?.code, 80);
  const version = cleanText(body?.version, 40);
  return {
    id: makeRuleId(code, version),
    domain: cleanText(body?.domain, 40) as TaxRuleVersion['domain'],
    code,
    version,
    title: cleanText(body?.title, 240),
    description: cleanText(body?.description, 5000),
    status: 'proposed',
    effectiveFrom: cleanText(body?.effectiveFrom, 40),
    effectiveTo: optionalText(body?.effectiveTo, 40),
    sourceIds: cleanTextArray(body?.sourceIds, 30, 120),
    interpretationRequired: body?.interpretationRequired !== false,
    implementationScope: optionalText(body?.implementationScope, 3000),
    supersedesRuleId: optionalText(body?.supersedesRuleId, 120),
    proposedBy: actor.uid,
    proposedByName: actor.name,
    proposedAt: now,
    updatedAt: now
  };
}

function validateProposedRule(rule: TaxRuleVersion): string | null {
  if (!RULE_DOMAINS.has(rule.domain)) return 'Invalid tax rule domain.';
  if (!rule.code || !rule.version || !rule.title || !rule.description) return 'Rule code, version, title, and description are required.';
  if (!isIsoDateLike(rule.effectiveFrom)) return 'Rule effective-from date is required.';
  if (rule.effectiveTo && !isIsoDateLike(rule.effectiveTo)) return 'Rule effective-to date must be an ISO date.';
  if (rule.sourceIds.length === 0) return 'At least one official source must support a proposed rule.';
  return null;
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

async function validateProfessionalRegistryEvidence(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  validation: TaxProfessionalValidation,
  domain: TaxRuleVersion['domain']
): Promise<string | null> {
  const registryId = String(validation.validatorRegistryId || '').trim();
  const evidenceId = String(validation.validationEvidenceDocumentId || '').trim();
  if (!registryId || !evidenceId) return 'Professional validation requires a verified validator registry id and durable evidence document id.';

  const registryRef = db.collection(PROFESSIONAL_REGISTRY_COLLECTION).doc(registryId);
  const evidenceRef = db.collection('documents').doc(evidenceId);
  const issuedEvidenceRef = db.collection('issued_documents').doc(evidenceId);
  const [registrySnap, evidenceSnap, issuedEvidenceSnap] = await Promise.all([
    tx.get(registryRef),
    tx.get(evidenceRef),
    tx.get(issuedEvidenceRef)
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
    return 'The verified professional validator registry scope does not cover this tax rule domain.';
  }
  if (!evidenceSnap.exists && !issuedEvidenceSnap.exists) return 'The professional validation evidence document does not exist.';
  return null;
}

async function getRuleSupportingSources(tx: admin.firestore.Transaction, rule: TaxRuleVersion): Promise<TaxOfficialSource[]> {
  const refs = rule.sourceIds.map(id => admin.firestore().collection(SOURCE_COLLECTION).doc(id));
  const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
  return snapshots.filter(snapshot => snapshot.exists).map(snapshot => ({ id: snapshot.id, ...snapshot.data() } as TaxOfficialSource));
}

async function getSummary() {
  const db = admin.firestore();
  const [profileSnap, sourcesSnap, rulesSnap] = await Promise.all([
    db.collection(PROFILE_COLLECTION).doc(PROFILE_ID).get(),
    db.collection(SOURCE_COLLECTION).get(),
    db.collection(RULE_COLLECTION).get()
  ]);
  const rules = rulesSnap.docs.map(doc => doc.data() as TaxRuleVersion);
  const sources = sourcesSnap.docs.map(doc => doc.data() as TaxOfficialSource);
  return {
    profile: profileSnap.exists ? profileSnap.data() : null,
    sourceCount: sources.length,
    validatedSourceCount: sources.filter(source => source.status === 'validated' || source.status === 'accepted').length,
    proposedRuleCount: rules.filter(rule => rule.status === 'proposed' || rule.status === 'professional_review_required').length,
    validatedRuleCount: rules.filter(rule => rule.status === 'validated').length,
    acceptedRuleCount: rules.filter(rule => rule.status === 'accepted').length,
    filingReadiness: 'NOT_READY_FOR_FILING' as const,
    professionalValidationRequired: true
  };
}

export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Tax-Compliance-Readiness', 'NOT_READY_FOR_FILING');

  const actor = await authenticate(req, res);
  if (!actor) return;
  if (!requirePermission(actor, 'tax.view', res)) return;

  const method = String(req.method || 'GET').toUpperCase();
  const resource = cleanText(req.query.resource || 'summary', 40);
  const action = cleanText(req.query.action, 60);
  const db = admin.firestore();

  if (method === 'GET') {
    if (resource === 'summary') return res.status(200).json(await getSummary());
    if (resource === 'profile') {
      const snapshot = await db.collection(PROFILE_COLLECTION).doc(PROFILE_ID).get();
      return res.status(200).json(snapshot.exists ? snapshot.data() : null);
    }
    if (resource === 'sources') {
      const snapshot = await db.collection(SOURCE_COLLECTION).orderBy('createdAt', 'desc').get();
      return res.status(200).json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }
    if (resource === 'rules') {
      const snapshot = await db.collection(RULE_COLLECTION).orderBy('proposedAt', 'desc').get();
      return res.status(200).json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }
    return res.status(400).json({ error: 'Unknown Tax Compliance resource.' });
  }

  if ((method === 'PUT' || method === 'PATCH') && resource === 'profile') {
    if (!requirePermission(actor, 'tax.profile.manage', res)) return;
    const ref = db.collection(PROFILE_COLLECTION).doc(PROFILE_ID);
    const reason = cleanText(req.body?.reason, 1000);
    const result = await db.runTransaction(async tx => {
      const previousSnap = await tx.get(ref);
      const previous = previousSnap.exists ? previousSnap.data() as TaxMasterProfile : undefined;
      if (previous && !reason) throw new Error('A reason is required when changing the existing Tax Master Profile.');
      const next = normalizeProfile(req.body, actor, previous);
      const error = validateProfile(next);
      if (error) throw new Error(error);

      if (previous) {
        const historyRef = db.collection(PROFILE_HISTORY_COLLECTION).doc();
        tx.create(historyRef, {
          ...previous,
          id: historyRef.id,
          originalProfileId: PROFILE_ID,
          archivedAt: new Date().toISOString(),
          supersededByUpdateActorId: actor.uid,
          supersessionReason: reason
        });
      }
      tx.set(ref, next, { merge: false });
      writeAuditInTransaction(tx, actor, 'TaxMasterProfile', PROFILE_ID, previous ? 'update' : 'create', previous, next, reason || 'Initial Tax Master Profile configuration.');
      return next;
    }).catch(error => ({ error: error instanceof Error ? error.message : 'Tax profile update failed.' }));
    if ('error' in result) return res.status(400).json(result);
    return res.status(200).json(result);
  }

  if (method === 'POST' && resource === 'sources' && !action) {
    if (!requirePermission(actor, 'tax.sources.manage', res)) return;
    const ref = db.collection(SOURCE_COLLECTION).doc();
    const source = normalizeSource(req.body, actor, ref.id);
    const error = validateSource(source);
    if (error) return res.status(400).json({ error });

    await db.runTransaction(async tx => {
      tx.create(ref, source);
      writeAuditInTransaction(tx, actor, 'TaxOfficialSource', ref.id, 'propose', undefined, source, 'Official source registered as Proposed evidence.');
    });
    return res.status(201).json(source);
  }

  if (method === 'POST' && resource === 'sources' && action === 'validate') {
    if (!requirePermission(actor, 'tax.sources.manage', res)) return;
    const sourceId = cleanText(req.body?.sourceId || req.query.sourceId, 120);
    const reason = cleanText(req.body?.reason, 1000);
    if (!sourceId || !reason) return res.status(400).json({ error: 'sourceId and validation reason are required.' });
    const ref = db.collection(SOURCE_COLLECTION).doc(sourceId);

    const result = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new Error('Official source not found.');
      const previous = { id: snapshot.id, ...snapshot.data() } as TaxOfficialSource;
      if (previous.createdBy === actor.uid) throw new Error('Four-Eyes control prevents the source creator from validating the same source.');
      const authorityError = validateOfficialSourceAuthority(previous.authority, previous.officialUrl);
      if (authorityError) throw new Error(authorityError);
      if (previous.status === 'validated' || previous.status === 'accepted') {
        throw new Error('A validated/accepted official source version is immutable. Register a new source version instead of re-validating it.');
      }
      if (previous.status === 'superseded' || previous.status === 'deprecated') throw new Error('A retired source cannot be validated.');

      const supersededSourceIds = Array.from(new Set(previous.supersedesSourceIds || []));
      const supersededRefs = supersededSourceIds.map(id => db.collection(SOURCE_COLLECTION).doc(id));
      const supersededSnaps = await Promise.all(supersededRefs.map(sourceRef => tx.get(sourceRef)));
      const supersededSources = supersededSnaps
        .filter(sourceSnap => sourceSnap.exists)
        .map(sourceSnap => ({ id: sourceSnap.id, ...sourceSnap.data() } as TaxOfficialSource));
      const now = new Date().toISOString();
      const next: TaxOfficialSource = {
        ...previous,
        status: 'validated',
        validatedBy: actor.uid,
        validatedByName: actor.name,
        validatedAt: now,
        validationReason: reason,
        updatedAt: now
      };
      const supersessionPlan = planOfficialSourceSupersession(next, supersededSources, now);
      if (supersessionPlan.error) throw new Error(supersessionPlan.error);

      for (const mutation of supersessionPlan.mutations) {
        const predecessorRef = db.collection(SOURCE_COLLECTION).doc(mutation.previous.id);
        tx.set(predecessorRef, mutation.next, { merge: false });
        writeAuditInTransaction(
          tx,
          actor,
          'TaxOfficialSource',
          mutation.previous.id,
          'supersede',
          mutation.previous,
          mutation.next,
          `Official source version superseded by ${sourceId}. Effective/publication dates remain preserved exactly as captured.`
        );
      }
      tx.set(ref, next, { merge: false });
      writeAuditInTransaction(tx, actor, 'TaxOfficialSource', sourceId, 'validate', previous, next, reason);
      return next;
    }).catch(error => ({ error: error instanceof Error ? error.message : 'Official source validation failed.' }));
    if ('error' in result) return res.status(400).json(result);
    return res.status(200).json(result);
  }

  if (method === 'POST' && resource === 'rules' && (!action || action === 'propose')) {
    if (!requirePermission(actor, 'tax.rules.propose', res)) return;
    const rule = normalizeRule(req.body, actor);
    const error = validateProposedRule(rule);
    if (error) return res.status(400).json({ error });
    const ruleRef = db.collection(RULE_COLLECTION).doc(rule.id);

    const result = await db.runTransaction(async tx => {
      const current = await tx.get(ruleRef);
      if (current.exists) throw new Error('This tax rule code/version already exists. Create a new version instead of overwriting history.');
      const sourceRefs = rule.sourceIds.map(id => db.collection(SOURCE_COLLECTION).doc(id));
      const sourceSnaps = await Promise.all(sourceRefs.map(ref => tx.get(ref)));
      if (sourceSnaps.some(snapshot => !snapshot.exists)) throw new Error('Every proposed tax rule source must already exist in the official source registry.');
      tx.create(ruleRef, rule);
      writeAuditInTransaction(tx, actor, 'TaxRuleVersion', rule.id, 'propose', undefined, rule, 'Tax rule proposed. It is not filing-authoritative.');
      return rule;
    }).catch(error => ({ error: error instanceof Error ? error.message : 'Tax rule proposal failed.' }));
    if ('error' in result) return res.status(400).json(result);
    return res.status(201).json(result);
  }

  if (method === 'POST' && resource === 'rules' && action === 'record-professional-validation') {
    if (!requirePermission(actor, 'tax.rules.accept', res)) return;
    const ruleId = cleanText(req.body?.ruleId || req.query.ruleId, 140);
    const validation = normalizeProfessionalValidation(req.body?.professionalValidation || req.body);
    const validationError = validateProfessionalValidation(validation);
    if (!ruleId) return res.status(400).json({ error: 'ruleId is required.' });
    if (validationError) return res.status(400).json({ error: validationError });
    const ref = db.collection(RULE_COLLECTION).doc(ruleId);

    const result = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new Error('Tax rule not found.');
      const previous = { id: snapshot.id, ...snapshot.data() } as TaxRuleVersion;
      if (previous.status === 'accepted' || previous.status === 'superseded' || previous.status === 'deprecated') {
        throw new Error('Professional validation cannot rewrite an accepted or retired rule version.');
      }
      if (previous.proposedBy === actor.uid) {
        throw new Error('Four-Eyes control prevents the rule proposer from recording professional validation for the same rule.');
      }
      const registryError = await validateProfessionalRegistryEvidence(tx, db, validation, previous.domain);
      if (registryError) throw new Error(registryError);
      const now = new Date().toISOString();
      const next: TaxRuleVersion = {
        ...previous,
        status: 'validated',
        professionalValidation: validation,
        professionalValidationRecordedBy: actor.uid,
        professionalValidationRecordedByName: actor.name,
        professionalValidationRecordedAt: now,
        updatedAt: now
      };
      tx.set(ref, next, { merge: false });
      writeAuditInTransaction(tx, actor, 'TaxRuleVersion', ruleId, 'record_professional_validation', previous, next, 'External UAE tax-professional validation evidence recorded.');
      return next;
    }).catch(error => ({ error: error instanceof Error ? error.message : 'Professional validation recording failed.' }));
    if ('error' in result) return res.status(400).json(result);
    return res.status(200).json(result);
  }

  if (method === 'POST' && resource === 'rules' && action === 'accept') {
    if (!requirePermission(actor, 'tax.rules.accept', res)) return;
    const ruleId = cleanText(req.body?.ruleId || req.query.ruleId, 140);
    const reason = cleanText(req.body?.reason, 1000);
    if (!ruleId || !reason) return res.status(400).json({ error: 'ruleId and acceptance reason are required.' });
    const ref = db.collection(RULE_COLLECTION).doc(ruleId);

    const result = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new Error('Tax rule not found.');
      const previous = { id: snapshot.id, ...snapshot.data() } as TaxRuleVersion;
      const sources = await getRuleSupportingSources(tx, previous);
      const professionalError = previous.professionalValidation
        ? await validateProfessionalRegistryEvidence(tx, db, previous.professionalValidation, previous.domain)
        : 'Professional UAE tax validation is required before a tax rule can be accepted.';
      if (professionalError) throw new Error(professionalError);
      const predecessorRef = previous.supersedesRuleId
        ? db.collection(RULE_COLLECTION).doc(previous.supersedesRuleId)
        : null;
      const predecessorSnap = predecessorRef ? await tx.get(predecessorRef) : null;
      const predecessor = predecessorSnap?.exists
        ? ({ id: predecessorSnap.id, ...predecessorSnap.data() } as TaxRuleVersion)
        : null;
      const acceptanceError = validateRuleAcceptance(previous, sources, actor);
      if (acceptanceError) throw new Error(acceptanceError);
      const now = new Date().toISOString();
      const next: TaxRuleVersion = {
        ...previous,
        status: 'accepted',
        acceptedBy: actor.uid,
        acceptedByName: actor.name,
        acceptedAt: now,
        updatedAt: now
      };
      const supersessionPlan = planTaxRuleSupersession(next, predecessor, now);
      if (supersessionPlan.error) throw new Error(supersessionPlan.error);
      if (supersessionPlan.mutation) {
        tx.set(db.collection(RULE_COLLECTION).doc(supersessionPlan.mutation.previous.id), supersessionPlan.mutation.next, { merge: false });
        writeAuditInTransaction(
          tx,
          actor,
          'TaxRuleVersion',
          supersessionPlan.mutation.previous.id,
          'supersede',
          supersessionPlan.mutation.previous,
          supersessionPlan.mutation.next,
          `Accepted tax rule version superseded by ${ruleId}. Effective dates and source evidence remain preserved exactly as recorded.`
        );
      }
      tx.set(ref, next, { merge: false });
      writeAuditInTransaction(tx, actor, 'TaxRuleVersion', ruleId, 'accept', previous, next, reason);
      return next;
    }).catch(error => ({ error: error instanceof Error ? error.message : 'Tax rule acceptance failed.' }));
    if ('error' in result) return res.status(400).json(result);
    return res.status(200).json(result);
  }

  res.setHeader('Allow', 'GET, POST, PUT, PATCH');
  return res.status(405).json({ error: 'Method or Tax Compliance action not allowed.' });
}
