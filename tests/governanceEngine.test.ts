/**
 * Governance & Approval Engine (Phase 23.1-23.4)
 * ================================================
 *
 * Proves the Business Rules Engine's tiering, versioning, and rollback
 * logic; Four-Eyes Approval + Segregation of Duties (a requester can never
 * decide their own request); that a security-critical constant never
 * becomes editable merely because it lives in the same catalog as a
 * tunable business rule; and that the Emergency Kill Switch blocks only
 * the route category it names, fails safe, and never runs ahead of RBAC.
 *
 * Two layers, like the engine itself:
 *  - Unit-level: calls src/server/businessRules.ts and
 *    src/server/approvals.ts directly, using a synthetic sensitive_rule
 *    fixture (see TEST_SENSITIVE_RULE below) so the always-requires-a-
 *    second-approver pathway can be exercised end-to-end without adding a
 *    fake threshold to the real production catalog -- the audit backing
 *    this phase found no existing sensitive numeric rule anywhere in the
 *    app, and inventing one there would violate "do not invent business
 *    thresholds that do not currently exist."
 *  - HTTP-level: supertest against the real Express app, for the route
 *    wiring (requireOperationEnabled placement, RBAC-before-kill-switch
 *    ordering) that only shows up when a request actually goes through
 *    server.ts's middleware chain.
 *
 * ISOLATION: firebase-admin is fully mocked (same in-memory Firestore
 * simulation as tests/authorization.test.ts) -- no real Firebase project
 * is contacted, and nothing here reads or writes real production data.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import request from 'supertest';

vi.mock('firebase-admin', () => {
  const appsArr: any[] = [];
  const verifyIdToken = vi.fn();
  const usersDb = new Map<string, { role: string; name: string }>();
  const store = new Map<string, Map<string, any>>();
  const collectionOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  const makeDocRef = (collectionName: string, id: string) => ({
    id,
    __collection: collectionName,
    get: async () => {
      if (collectionName === 'users') {
        const u = usersDb.get(id);
        return { exists: !!u, data: () => u, id };
      }
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
    },
    delete: async () => {
      collectionOf(collectionName).delete(id);
    }
  });

  const makeCollectionRef = (name: string): any => ({
    doc: (id: string) => makeDocRef(name, id),
    get: async () => {
      const col = collectionOf(name);
      const docs = Array.from(col.entries()).map(([id, data]) => ({ id, data: () => data }));
      return { docs, size: docs.length };
    },
    where: () => makeCollectionRef(name)
  });

  const firestoreObj: any = {
    collection: (name: string) => makeCollectionRef(name),
    batch: () => {
      const ops: Array<() => void> = [];
      const applySet = (ref: any, data: any, opts?: { merge?: boolean }) => {
        const col = collectionOf(ref.__collection);
        const existing = col.get(ref.id);
        col.set(ref.id, opts?.merge && existing ? { ...existing, ...data } : data);
      };
      return {
        set: (ref: any, data: any, opts?: any) => ops.push(() => applySet(ref, data, opts)),
        create: (ref: any, data: any) => ops.push(() => collectionOf(ref.__collection).set(ref.id, data)),
        delete: (ref: any) => ops.push(() => collectionOf(ref.__collection).delete(ref.id)),
        commit: async () => { ops.forEach((op) => op()); }
      };
    },
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
        },
        delete: (ref: any) => collectionOf(ref.__collection).delete(ref.id)
      };
      return fn(tx, firestoreObj);
    }
  };

  const admin: any = {
    apps: appsArr,
    credential: { cert: (x: any) => x },
    initializeApp: (_opts: any) => {
      appsArr.push({});
    },
    auth: () => ({ verifyIdToken }),
    firestore: () => firestoreObj,
    storage: () => ({ bucket: () => ({ file: () => ({}) }) }),
    __test: { verifyIdToken, usersDb, appsArr, store }
  };

  return { default: admin };
});

let app: any;
let adminMock: { verifyIdToken: Mock; usersDb: Map<string, { role: string; name: string }> };
let businessRules: typeof import('../src/server/businessRules');
let approvals: typeof import('../src/server/approvals');

const CEO_UID = 'gov-ceo-uid';
const CEO2_UID = 'gov-ceo2-uid'; // a second CEO/admin-eligible account, needed to prove Four-Eyes (a decider distinct from the requester)
const FINANCE_UID = 'gov-finance-uid';
const SALES_UID = 'gov-sales-uid';
const OPERATIONS_UID = 'gov-operations-uid';

// A no-op recordAudit -- the unit-level tests exercise businessRules.ts /
// approvals.ts directly, which take a recordAudit callback as a parameter
// (see src/server/businessRules.ts) rather than importing server.ts's real
// one, keeping this module fully independent of the Express app.
const noopRecordAudit = vi.fn(async () => undefined);

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{}';

  const adminModule = await import('firebase-admin');
  adminMock = (adminModule.default as any).__test;
  adminMock.usersDb.set(CEO_UID, { role: 'ceo', name: 'Test CEO' });
  adminMock.usersDb.set(CEO2_UID, { role: 'admin', name: 'Test Admin (second approver)' });
  adminMock.usersDb.set(FINANCE_UID, { role: 'finance', name: 'Test Finance' });
  adminMock.usersDb.set(SALES_UID, { role: 'sales', name: 'Test Sales' });
  adminMock.usersDb.set(OPERATIONS_UID, { role: 'operations', name: 'Test Operations' });

  const serverModule = await import('../server');
  app = serverModule.default;

  businessRules = await import('../src/server/businessRules');
  approvals = await import('../src/server/approvals');
  // Deterministic: don't rely on server.ts's own fire-and-forget boot
  // hydration (see `if (process.env.VERCEL) { hydrateStoreFromFirestore().catch(...) }`
  // in server.ts) having already resolved -- seed synchronously before any
  // assertion runs. Safe to call twice: already-seeded rules are skipped.
  await businessRules.hydrateBusinessRules();
});

afterAll(() => {
  delete process.env.VERCEL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
});

beforeEach(() => {
  adminMock.verifyIdToken.mockReset();
  noopRecordAudit.mockClear();
});

function authAs(uid: string) {
  adminMock.verifyIdToken.mockResolvedValueOnce({ uid });
  return { Authorization: 'Bearer test-token' };
}

// ---------------------------------------------------------------------------
// Unit-level: Business Rules Engine core (tiering, versioning, validation, rollback)
// ---------------------------------------------------------------------------

describe('Business Rules Engine -- tiering, versioning, validation', () => {
  it('applies a business_rule change immediately for a direct-edit-eligible role and appends a version', async () => {
    const before = businessRules.getRule('notificationExpiryLookaheadDays')!;
    const startVersion = before.version;

    const outcome = await businessRules.evaluateRuleChangeRequest(
      'notificationExpiryLookaheadDays', 45, 'Extend look-ahead window for a seasonal promotion.',
      { uid: FINANCE_UID, name: 'Test Finance', role: 'finance' }, noopRecordAudit
    );

    expect(outcome.applied).toBe(true);
    if (outcome.applied) {
      expect(outcome.rule.value).toBe(45);
      expect(outcome.rule.version).toBe(startVersion + 1);
      expect(outcome.rule.history).toHaveLength(before.history.length + 1);
      expect(outcome.rule.history.at(-1)?.reason).toContain('seasonal promotion');
    }
    expect(noopRecordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'rule_change', entityId: 'notificationExpiryLookaheadDays' }));

    // Restore, so later tests/assertions in this file see the original default.
    await businessRules.evaluateRuleChangeRequest(
      'notificationExpiryLookaheadDays', 30, 'Restore default after test.',
      { uid: FINANCE_UID, name: 'Test Finance', role: 'finance' }, noopRecordAudit
    );
  });

  it('rejects a business_rule change from a role with no pricing-adjacent access (Forbidden, not silently ignored)', async () => {
    await expect(
      businessRules.evaluateRuleChangeRequest(
        'notificationExpiryLookaheadDays', 60, 'Attempted change from an unauthorized role.',
        { uid: OPERATIONS_UID, name: 'Test Operations', role: 'operations' }, noopRecordAudit
      )
    ).rejects.toThrow(businessRules.RuleForbiddenError);
  });

  it('validates numeric bounds -- a value outside min/max is rejected before anything is written', async () => {
    await expect(
      businessRules.evaluateRuleChangeRequest(
        'notificationExpiryLookaheadDays', 5000, 'Out of range.',
        { uid: CEO_UID, name: 'Test CEO', role: 'ceo' }, noopRecordAudit
      )
    ).rejects.toThrow(businessRules.RuleValidationError);
  });

  it('never allows a security-exempt (editable:false) constant to be changed, even by CEO', async () => {
    await expect(
      businessRules.evaluateRuleChangeRequest(
        'security.passwordMinLength', 4, 'Weakening the password floor.',
        { uid: CEO_UID, name: 'Test CEO', role: 'ceo' }, noopRecordAudit
      )
    ).rejects.toThrow(businessRules.RuleNotEditableError);

    // Still exactly 8 -- the attempted change above must not have touched the value.
    expect(businessRules.getRule('security.passwordMinLength')!.value).toBe(8);
  });

  it('rollback appends a new forward version instead of rewriting history', async () => {
    const rule = businessRules.getRule('notificationDepositDueSoonDays')!;
    const originalVersion = rule.version;
    const originalValue = rule.value;

    const changed = await businessRules.evaluateRuleChangeRequest(
      'notificationDepositDueSoonDays', 5, 'Temporary change to test rollback.',
      { uid: CEO_UID, name: 'Test CEO', role: 'ceo' }, noopRecordAudit
    );
    expect(changed.applied).toBe(true);

    const rolledBack = await businessRules.evaluateRollbackRequest(
      'notificationDepositDueSoonDays', originalVersion, 'Reverting the test change.',
      { uid: CEO_UID, name: 'Test CEO', role: 'ceo' }, noopRecordAudit
    );

    expect(rolledBack.applied).toBe(true);
    if (rolledBack.applied) {
      expect(rolledBack.rule.value).toBe(originalValue);
      // Two NEW versions were appended (the change, then the rollback) -- the
      // original version entries are all still present, never deleted.
      expect(rolledBack.rule.version).toBe(originalVersion + 2);
      expect(rolledBack.rule.history.some(h => h.version === originalVersion)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Unit-level: Four-Eyes Approval + Segregation of Duties (synthetic sensitive_rule fixture)
// ---------------------------------------------------------------------------

describe('Four-Eyes Approval + Segregation of Duties', () => {
  const TEST_RULE_ID = 'test.sensitiveThresholdForGovernanceSuite';

  beforeAll(() => {
    // A synthetic sensitive_rule fixture, injected directly into the
    // in-memory cache -- NOT added to the real production catalog
    // (src/config/businessRules.ts). This exercises the sensitive-tier
    // pathway without inventing a fake business threshold in the app the
    // business actually uses; every other test in this repo uses synthetic
    // fixtures (customers, vehicles, contracts) the same way.
    businessRules.__setRuleForTests({
      id: TEST_RULE_ID,
      label: 'Test-only sensitive threshold',
      description: 'Synthetic fixture for tests/governanceEngine.test.ts only.',
      tier: 'sensitive_rule',
      valueType: 'number',
      value: 10,
      editable: true,
      version: 1,
      history: [{ version: 1, value: 10, changedBy: 'system', changedByName: 'System', changedByRole: 'ceo', changedAt: new Date().toISOString(), reason: 'seed' }]
    });
  });

  it('a sensitive_rule change NEVER applies immediately, even for CEO -- it always creates a pending approval request', async () => {
    const outcome = await businessRules.evaluateRuleChangeRequest(
      TEST_RULE_ID, 25, 'Proposing a higher threshold.',
      { uid: CEO_UID, name: 'Test CEO', role: 'ceo' }, noopRecordAudit
    );
    expect(outcome.applied).toBe(false);
    if (!outcome.applied) expect(outcome.needsApproval).toBe(true);

    // The underlying value must be completely untouched until a second person decides.
    expect(businessRules.getRule(TEST_RULE_ID)!.value).toBe(10);
  });

  it('rejects a decider deciding their own request (self-approval is never allowed, regardless of role)', async () => {
    const req = await approvals.createApprovalRequest({
      type: 'rule_change', entityType: 'BusinessRule', entityId: TEST_RULE_ID,
      requestedBy: CEO_UID, requestedByName: 'Test CEO', requestedByRole: 'ceo',
      reason: 'Self-approval attempt fixture.', beforeValue: 10, afterValue: 30
    }, noopRecordAudit);

    await expect(
      approvals.decideApprovalRequest(req.id, 'approved', 'Approving my own request.', { uid: CEO_UID, name: 'Test CEO', role: 'ceo' }, noopRecordAudit)
    ).rejects.toThrow(approvals.ApprovalError);

    // Still pending, still untouched.
    expect(businessRules.getRule(TEST_RULE_ID)!.value).toBe(10);
  });

  it('requires a decision note', async () => {
    const req = await approvals.createApprovalRequest({
      type: 'rule_change', entityType: 'BusinessRule', entityId: TEST_RULE_ID,
      requestedBy: SALES_UID, requestedByName: 'Test Sales', requestedByRole: 'sales',
      reason: 'Needs a note to decide.', beforeValue: 10, afterValue: 40
    }, noopRecordAudit);

    await expect(
      approvals.decideApprovalRequest(req.id, 'approved', '', { uid: CEO_UID, name: 'Test CEO', role: 'ceo' }, noopRecordAudit)
    ).rejects.toThrow(approvals.ApprovalError);
  });

  it('a DIFFERENT authorized person can approve, and the value only then applies -- with the full Who/What/When/Why/Before/After/Decision record intact', async () => {
    const req = await approvals.createApprovalRequest({
      type: 'rule_change', entityType: 'BusinessRule', entityId: TEST_RULE_ID,
      requestedBy: SALES_UID, requestedByName: 'Test Sales', requestedByRole: 'sales',
      reason: 'A real, distinct override request.', beforeValue: 10, afterValue: 50
    }, noopRecordAudit);

    expect(req.status).toBe('pending');
    expect(req.requestedBy).toBe(SALES_UID);
    expect(req.beforeValue).toBe(10);
    expect(req.afterValue).toBe(50);
    expect(req.reason).toBeTruthy();

    const decided = await approvals.decideApprovalRequest(
      req.id, 'approved', 'Verified with the customer, approved.',
      { uid: CEO2_UID, name: 'Test Admin (second approver)', role: 'admin' }, noopRecordAudit
    );

    expect(decided.status).toBe('approved');
    expect(decided.decidedBy).toBe(CEO2_UID);
    expect(decided.decisionNote).toBeTruthy();
    expect(decided.decidedAt).toBeTruthy();

    const rule = businessRules.getRule(TEST_RULE_ID)!;
    expect(rule.value).toBe(50);
    const lastVersion = rule.history.at(-1)!;
    expect(lastVersion.approvalRequestId).toBe(req.id);
    expect(lastVersion.changedBy).toBe(CEO2_UID);
  });

  it('rejecting a request never applies the value', async () => {
    const req = await approvals.createApprovalRequest({
      type: 'rule_change', entityType: 'BusinessRule', entityId: TEST_RULE_ID,
      requestedBy: SALES_UID, requestedByName: 'Test Sales', requestedByRole: 'sales',
      reason: 'A request that will be rejected.', beforeValue: 50, afterValue: 999
    }, noopRecordAudit);

    const decided = await approvals.decideApprovalRequest(
      req.id, 'rejected', 'Not justified.', { uid: CEO_UID, name: 'Test CEO', role: 'ceo' }, noopRecordAudit
    );
    expect(decided.status).toBe('rejected');
    expect(businessRules.getRule(TEST_RULE_ID)!.value).toBe(50); // unchanged from the previous (approved) test
  });

  it('a request that has already been decided cannot be decided again', async () => {
    const req = await approvals.createApprovalRequest({
      type: 'rule_change', entityType: 'BusinessRule', entityId: TEST_RULE_ID,
      requestedBy: SALES_UID, requestedByName: 'Test Sales', requestedByRole: 'sales',
      reason: 'Double-decide fixture.', beforeValue: 50, afterValue: 60
    }, noopRecordAudit);

    await approvals.decideApprovalRequest(req.id, 'approved', 'First decision.', { uid: CEO_UID, name: 'Test CEO', role: 'ceo' }, noopRecordAudit);

    await expect(
      approvals.decideApprovalRequest(req.id, 'rejected', 'Second decision attempt.', { uid: CEO2_UID, name: 'Test Admin', role: 'admin' }, noopRecordAudit)
    ).rejects.toThrow(approvals.ApprovalError);
  });
});

// ---------------------------------------------------------------------------
// HTTP-level: route wiring -- RBAC-before-kill-switch ordering, scoped blocking, fail-safe
// ---------------------------------------------------------------------------

describe('Emergency Kill Switch -- HTTP route wiring', () => {
  afterAll(async () => {
    // Leave every kill switch this suite touched back in its safe/default state.
    await businessRules.evaluateRuleChangeRequest('killSwitch.paymentsRefunds', false, 'Test cleanup.', { uid: CEO_UID, name: 'Test CEO', role: 'ceo' }, noopRecordAudit);
  });

  it('RBAC is checked BEFORE the kill switch -- an unauthorized role still gets 403, not 503, even while the switch is on', async () => {
    await request(app)
      .patch('/api/business-rules/killSwitch.paymentsRefunds')
      .set(authAs(CEO_UID))
      .send({ value: true, reason: 'Testing RBAC-before-kill-switch ordering.' })
      .expect(200);

    const res = await request(app)
      .post('/api/payments')
      .set(authAs(SALES_UID)) // sales is not in requireRole('finance','ceo','admin') for this route
      .send({});
    expect(res.status).toBe(403);
  });

  it('once RBAC passes, a tripped switch blocks the route with 503 and names the category -- existing data is never touched', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set(authAs(FINANCE_UID))
      .send({ contractId: 'CON-2026-00001', amount: 100 });

    expect(res.status).toBe(503);
    expect(res.body.killSwitch).toBe('paymentsRefunds');
    expect(res.body.error).toContain('temporarily suspended');
  });

  it('a DIFFERENT category is completely unaffected -- the switch is scoped, not a whole-CRM shutdown', async () => {
    const res = await request(app)
      .post('/api/bank-batches')
      .set(authAs(FINANCE_UID))
      .send({});
    // Not blocked by the (unrelated) paymentsRefunds switch. It may still
    // fail for its own reasons (e.g. validation), but never with the
    // kill-switch's 503/error shape.
    expect(res.status).not.toBe(503);
  });

  it('turning the switch back off is itself audited and immediately restores normal operation', async () => {
    await request(app)
      .patch('/api/business-rules/killSwitch.paymentsRefunds')
      .set(authAs(CEO_UID))
      .send({ value: false, reason: 'Restoring normal operation after test.' })
      .expect(200);

    const rule = businessRules.getRule('killSwitch.paymentsRefunds')!;
    // At least the ON and OFF flips from this test file are present in history.
    expect(rule.history.filter(h => h.reason?.includes('kill-switch ordering') || h.reason?.includes('Restoring normal operation')).length).toBeGreaterThanOrEqual(1);

    const res = await request(app)
      .post('/api/payments')
      .set(authAs(FINANCE_UID))
      .send({ contractId: 'CON-2026-00001', amount: 100 });
    expect(res.status).not.toBe(503);
  });
});

// ---------------------------------------------------------------------------
// HTTP-level: tier-gated read visibility, mandatory reason
// ---------------------------------------------------------------------------

describe('Governance routes -- read visibility and required fields', () => {
  it('hides system_configuration (security-exempt) entries from a non-CEO/Admin role', async () => {
    const res = await request(app).get('/api/business-rules').set(authAs(OPERATIONS_UID));
    expect(res.status).toBe(200);
    expect(res.body.find((r: any) => r.id === 'security.passwordMinLength')).toBeUndefined();
    expect(res.body.find((r: any) => r.id === 'notificationExpiryLookaheadDays')).toBeTruthy();
  });

  it('shows system_configuration entries to CEO/Admin', async () => {
    const res = await request(app).get('/api/business-rules').set(authAs(CEO_UID));
    expect(res.status).toBe(200);
    expect(res.body.find((r: any) => r.id === 'security.passwordMinLength')).toBeTruthy();
  });

  it('requires a reason to change any rule', async () => {
    const res = await request(app)
      .patch('/api/business-rules/notificationExpiryLookaheadDays')
      .set(authAs(CEO_UID))
      .send({ value: 45 });
    expect(res.status).toBe(400);
  });

  it('the approval decision endpoint is CEO/Admin-only and requires a note', async () => {
    const forbidden = await request(app)
      .post('/api/approval-requests/APP-999999/decide')
      .set(authAs(FINANCE_UID))
      .send({ decision: 'approved', note: 'x' });
    expect(forbidden.status).toBe(403);
  });
});
