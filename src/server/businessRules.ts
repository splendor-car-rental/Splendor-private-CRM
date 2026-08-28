import admin from 'firebase-admin';
import { updateDurable, PersistenceError } from './persistence';
import {
  DEFAULT_BUSINESS_RULES,
  canDirectEditRuleTier,
  canProposeRuleChange as roleCanProposeRuleChange,
  canReadRuleTier
} from '../config/businessRules';
import type { AuditLog, BusinessRule, BusinessRuleVersion, UserRole } from '../types';

/** The recordAudit() shape from server.ts, reused as-is so this module and approvals.ts can both write into the same immutable, system-wide audit trail rather than a parallel one. */
export type RecordAuditFn = (log: Omit<AuditLog, 'id' | 'timestamp'>) => Promise<unknown>;

// ----------------------------------------------------
// BUSINESS RULES ENGINE (Phase 23.1)
// ----------------------------------------------------
// One authoritative, tiered, versioned, audited store for the business
// thresholds and safety controls previously scattered as magic numbers
// across server.ts and src/server/*.ts (see the Phase 23.0 repository
// inventory for exactly which literal each seeded rule replaces). Every
// applied change is versioned (append-only history, never rewritten) and
// mirrored into the existing audit_logs collection so it shows up
// alongside every other action in Settings > Security Audit Trail.
//
// This module never decides WHO gets to change a rule end-to-end by
// itself for the approval-required paths -- see evaluateRuleChangeRequest
// below, and src/server/approvals.ts for the Four-Eyes decision flow that
// completes a sensitive_rule change. Keeping the "does this need a second
// approver" decision here and the "who is allowed to approve/reject"
// mechanics in approvals.ts avoids a circular import between the two.

export class RuleValidationError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'RuleValidationError';
  }
}
export class RuleNotEditableError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'RuleNotEditableError';
  }
}
export class RuleForbiddenError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'RuleForbiddenError';
  }
}
export class RuleNotFoundError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'RuleNotFoundError';
  }
}

let ruleCache: Record<string, BusinessRule> | null = null;

function seedDefaultsAsRules(): Record<string, BusinessRule> {
  const now = new Date().toISOString();
  const cache: Record<string, BusinessRule> = {};
  for (const seed of DEFAULT_BUSINESS_RULES) {
    const initialVersion: BusinessRuleVersion = {
      version: 1,
      value: seed.value,
      changedBy: 'system',
      changedByName: 'System (initial seed)',
      changedByRole: 'ceo',
      changedAt: now,
      reason: 'Initial seed from the Phase 23.0 repository inventory -- value matches the pre-existing code default.'
    };
    cache[seed.id] = { ...seed, version: 1, history: [initialVersion], updatedAt: now };
  }
  return cache;
}

/**
 * Loads every business rule from Firestore into the in-memory cache at
 * server boot, seeding any rule from DEFAULT_BUSINESS_RULES that doesn't
 * have a Firestore document yet (first deploy of this engine) with its
 * real, already-existing value -- never an invented one. If Firebase Admin
 * isn't configured (some unit tests, or a misconfigured deploy), falls back
 * to an in-memory-only default set rather than throwing, matching how
 * globalStore.tollPricingConfig degrades.
 */
export async function hydrateBusinessRules(): Promise<Record<string, BusinessRule>> {
  if (admin.apps.length === 0) {
    ruleCache = seedDefaultsAsRules();
    return ruleCache;
  }

  const db = admin.firestore();
  const snap = await db.collection('business_rules').get();
  const existing: Record<string, BusinessRule> = {};
  snap.docs.forEach((doc) => {
    existing[doc.id] = doc.data() as BusinessRule;
  });

  const cache: Record<string, BusinessRule> = {};
  for (const seed of DEFAULT_BUSINESS_RULES) {
    if (existing[seed.id]) {
      cache[seed.id] = existing[seed.id];
      continue;
    }
    const now = new Date().toISOString();
    const initialVersion: BusinessRuleVersion = {
      version: 1,
      value: seed.value,
      changedBy: 'system',
      changedByName: 'System (initial seed)',
      changedByRole: 'ceo',
      changedAt: now,
      reason: 'Initial seed from the Phase 23.0 repository inventory -- value matches the pre-existing code default.'
    };
    const rule: BusinessRule = { ...seed, version: 1, history: [initialVersion], updatedAt: now };
    // Upsert (set), not create: two Vercel instances can cold-start and
    // seed concurrently. Both computed the same content from
    // DEFAULT_BUSINESS_RULES, so whichever writes second harmlessly
    // overwrites with identical data -- create() would instead throw
    // ALREADY_EXISTS on the loser of that race and crash boot hydration.
    await updateDurable('business_rules', rule.id, rule as unknown as Record<string, unknown>);
    cache[seed.id] = rule;
  }
  ruleCache = cache;
  return cache;
}

export function getAllRulesCached(): Record<string, BusinessRule> {
  return ruleCache || seedDefaultsAsRules();
}

export function getRule(key: string): BusinessRule | undefined {
  return getAllRulesCached()[key];
}

/**
 * TEST-ONLY seam: injects a rule directly into the in-memory cache,
 * bypassing Firestore entirely. Exists so tests/governanceEngine.test.ts
 * can exercise the sensitive_rule tier's always-requires-approval pathway
 * with a synthetic fixture, without adding a fake threshold to the real
 * production catalog in src/config/businessRules.ts (the Phase 23.0 audit
 * found no existing sensitive numeric rule anywhere in the app, and
 * inventing one there would be exactly the kind of invented business
 * threshold the governance directive prohibits). No runtime route ever
 * calls this.
 */
export function __setRuleForTests(rule: BusinessRule): void {
  const cache = getAllRulesCached();
  cache[rule.id] = rule;
  ruleCache = cache;
}

/**
 * Safe accessor for other server modules that just need a rule's current
 * value for a normal (non-financial-transaction) read -- e.g.
 * notificationEngine.ts's sweep. Never throws: falls back to the caller's
 * own literal if the engine hasn't hydrated yet or the rule is missing, so
 * behavior is identical to today's hardcoded constant in that edge case.
 */
export function getRuleValue<T extends number | boolean | string>(key: string, fallback: T): T {
  const rule = getRule(key);
  if (!rule || rule.value === null || rule.value === undefined) return fallback;
  return rule.value as T;
}

export function listReadableRules(role: UserRole): BusinessRule[] {
  return Object.values(getAllRulesCached()).filter((r) => canReadRuleTier(role, r.tier));
}

export function validateRuleValue(rule: BusinessRule, value: unknown): void {
  if (rule.valueType === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new RuleValidationError(`${rule.id} requires a numeric value.`);
    }
    if (rule.min !== undefined && value < rule.min) {
      throw new RuleValidationError(`${rule.id} must be >= ${rule.min}.`);
    }
    if (rule.max !== undefined && value > rule.max) {
      throw new RuleValidationError(`${rule.id} must be <= ${rule.max}.`);
    }
  } else if (rule.valueType === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new RuleValidationError(`${rule.id} requires a boolean value.`);
    }
  } else if (rule.valueType === 'string') {
    if (typeof value !== 'string' || !value.trim()) {
      throw new RuleValidationError(`${rule.id} requires a non-empty string value.`);
    }
  }
}

export interface RuleChangeActor {
  uid: string;
  name: string;
  role: UserRole;
}

/**
 * The single writer for a rule's value -- bumps the version, APPENDS a new
 * history entry (history is never rewritten or truncated, satisfying
 * "immutable approval/change history"), persists it, refreshes the cache,
 * and mirrors the change into the existing audit_logs collection. Used
 * both for a direct edit and for applying an already-approved sensitive
 * rule change (see src/server/approvals.ts) -- the caller is responsible
 * for having already established the actor is authorized to reach this
 * point (evaluateRuleChangeRequest below for direct edits; the approval
 * decision flow for sensitive ones).
 */
export async function applyRuleValue(
  key: string,
  value: number | boolean | string,
  reason: string,
  actor: RuleChangeActor,
  recordAudit: RecordAuditFn,
  approvalRequestId?: string
): Promise<BusinessRule> {
  const rule = getRule(key);
  if (!rule) throw new RuleNotFoundError(`Unknown business rule: ${key}`);
  if (!rule.editable) throw new RuleNotEditableError(`${key} is a system-enforced constant and cannot be changed through this engine.`);

  validateRuleValue(rule, value);

  const now = new Date().toISOString();
  const nextVersion = rule.version + 1;
  const versionEntry: BusinessRuleVersion = {
    version: nextVersion,
    value,
    changedBy: actor.uid,
    changedByName: actor.name,
    changedByRole: actor.role,
    changedAt: now,
    reason,
    approvalRequestId
  };

  const updated: BusinessRule = {
    ...rule,
    value,
    version: nextVersion,
    history: [...rule.history, versionEntry],
    updatedBy: actor.uid,
    updatedByName: actor.name,
    updatedByRole: actor.role,
    updatedAt: now
  };

  await updateDurable('business_rules', key, updated as unknown as Record<string, unknown>);

  const cache = getAllRulesCached();
  cache[key] = updated;
  ruleCache = cache;

  await recordAudit({
    userId: actor.uid,
    userName: actor.name,
    userRole: actor.role,
    entityType: 'BusinessRule',
    entityId: key,
    action: rule.tier === 'emergency_rule' ? 'kill_switch' : 'rule_change',
    previousValue: JSON.stringify(rule.value),
    newValue: JSON.stringify(value),
    reason
  });

  return updated;
}

export type RuleChangeOutcome =
  | { applied: true; rule: BusinessRule }
  | { applied: false; needsApproval: true; rule: BusinessRule };

/**
 * Decides what happens when `actor` asks to change `key` to `value`:
 *  - not editable at all                       -> RuleNotEditableError
 *  - actor's role isn't allowed to touch this tier at all -> RuleForbiddenError
 *  - actor's role can edit this tier directly (business_rule, emergency_rule) -> applies immediately, returns { applied: true }
 *  - actor's role can only PROPOSE (sensitive_rule)        -> returns { applied: false, needsApproval: true } -- the
 *    caller (the PATCH /api/business-rules/:key route) is responsible for creating the ApprovalRequest via
 *    src/server/approvals.ts and must NOT apply the value itself.
 * `reason` is required by the route handler before this is ever called -- see server.ts.
 */
export async function evaluateRuleChangeRequest(
  key: string,
  value: number | boolean | string,
  reason: string,
  actor: RuleChangeActor,
  recordAudit: Parameters<typeof applyRuleValue>[4]
): Promise<RuleChangeOutcome> {
  const rule = getRule(key);
  if (!rule) throw new RuleNotFoundError(`Unknown business rule: ${key}`);
  if (!rule.editable) throw new RuleNotEditableError(`${key} is a system-enforced constant and cannot be changed through this engine.`);

  validateRuleValue(rule, value);

  if (canDirectEditRuleTier(actor.role, rule.tier)) {
    const updated = await applyRuleValue(key, value, reason, actor, recordAudit);
    return { applied: true, rule: updated };
  }

  if (roleCanProposeRuleChange(actor.role, rule.tier)) {
    return { applied: false, needsApproval: true, rule };
  }

  throw new RuleForbiddenError('You do not have permission to change this rule.');
}

/**
 * Reverts a rule to the value it held at `toVersion`. Never rewrites or
 * deletes history -- a rollback is itself just a new forward version whose
 * value happens to match an old one, going through the exact same
 * tier/approval logic as any other change (so rolling back a sensitive
 * rule still requires a second approver).
 */
export async function evaluateRollbackRequest(
  key: string,
  toVersion: number,
  reason: string,
  actor: RuleChangeActor,
  recordAudit: Parameters<typeof applyRuleValue>[4]
): Promise<RuleChangeOutcome> {
  const rule = getRule(key);
  if (!rule) throw new RuleNotFoundError(`Unknown business rule: ${key}`);
  const target = rule.history.find((h) => h.version === toVersion);
  if (!target || target.value === null || target.value === undefined) {
    throw new RuleValidationError(`Version ${toVersion} not found in ${key}'s history.`);
  }
  return evaluateRuleChangeRequest(key, target.value, `Rollback to v${toVersion}: ${reason}`, actor, recordAudit);
}
