/**
 * Firestore Security Rules — Authorization Test Suite (S1–S10)
 * ==============================================================
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * This file implements the exact S1–S10 authorization scenarios required by
 * the "SPLENDOR PRIVATE CRM — FINAL PRODUCTION HARDENING" directive, Part C.
 *
 * It could NOT be executed inside the sandbox this hardening pass was done
 * in: `registry.npmjs.org` is blocked network-wide for that sandbox
 * (confirmed via `bun add -g firebase-tools`, `bun add -g
 * @firebase/rules-unit-testing`, and a control package `lodash` — all three
 * returned HTTP 403 with header `x-deny-reason: host_not_allowed`; a raw
 * `curl -sI https://registry.npmjs.org/lodash` reproduced the same 403
 * directly). Without registry access, `firebase-tools` (for the Firestore
 * emulator) and `@firebase/rules-unit-testing` (this file's test harness)
 * cannot be installed, so these tests could not actually be RUN, only
 * WRITTEN, in that environment.
 *
 * Run this for real, authoritative pass/fail evidence in any environment
 * with normal npm access:
 *
 *   npm install --save-dev @firebase/rules-unit-testing firebase vitest
 *   npm install -g firebase-tools          # provides the emulator binary
 *   firebase emulators:exec --only firestore "npx vitest run tests/firestore.rules.test.ts"
 *
 * (Or point `FIRESTORE_EMULATOR_HOST` at an already-running
 * `firebase emulators:start --only firestore` and just run vitest/jest
 * directly — either way, this test file talks ONLY to the local emulator,
 * never to the real production Firestore project. No real data is read or
 * written by running this file.)
 *
 * WHAT EACH SCENARIO PROVES
 * --------------------------
 * S1  CEO read succeeds               -> authorized staff can read
 * S2  CEO write succeeds              -> authorized staff can write
 * S3  Authenticated, no role, read    -> denied (bootstrap/own-profile aside)
 * S4  Authenticated, no role, write   -> denied
 * S5  Unauthenticated read            -> denied
 * S6  Unauthenticated write           -> denied
 * S7  "Public website" identity       -> denied direct Firestore access
 *     (simulated as an unauthenticated client, since the real public
 *     website never even attempts direct Firestore access — see
 *     splendorConnectEngine.ts / server.ts's /api/public/* routes, which
 *     use the Admin SDK server-side and are not subject to these rules at
 *     all; S7 exists to additionally prove the client SDK path is denied
 *     in case anything were ever pointed at Firestore directly by mistake)
 * S8  Toll transactions readable      -> real-time subscription works for
 *     by an authorized (finance) role   an authorized user (mirrors
 *                                        CRMContext.tsx's onSnapshot usage)
 * S9  Toll import batch writable      -> toll import works for an
 *     by an authorized (finance) role   authorized user
 * S10 An unrelated CRM collection     -> legitimate access to a random
 *     (customers) still works for       non-toll collection is unaffected
 *     a legitimate operations role      by the toll-specific tightening
 */

import { readFileSync } from 'fs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const PROJECT_ID = 'splendor-crm-rules-test';

// The six roles the app already uses (src/config/permissions.ts ALL_ROLES).
// This test does not invent any new role — it exercises the same six.
const CEO_UID = 'test-ceo-uid';
const FINANCE_UID = 'test-finance-uid';
const OPERATIONS_UID = 'test-ops-uid';
const NO_ROLE_UID = 'test-unprovisioned-uid'; // signed in, but no users/{uid} doc

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  // Seed the users/{uid} profile documents these tests rely on, using
  // admin (rules-bypassing) context — mirrors how the real app's
  // server-side /api/admin/users endpoint provisions staff via the Admin
  // SDK, which is likewise not subject to these client-facing rules.
  await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
    const db = adminCtx.firestore();
    await setDoc(doc(db, 'users', CEO_UID), { role: 'ceo', name: 'Test CEO' });
    await setDoc(doc(db, 'users', FINANCE_UID), { role: 'finance', name: 'Test Finance' });
    await setDoc(doc(db, 'users', OPERATIONS_UID), { role: 'operations', name: 'Test Ops' });
    // Deliberately NOT creating a users/{NO_ROLE_UID} doc: this simulates a
    // Firebase Auth account that exists but was never provisioned as CRM
    // staff, exactly like the app's own "Access Pending" screen handles.

    await setDoc(doc(db, 'customers', 'CUS-SEED-01'), { name: 'Seed Customer' });
    await setDoc(doc(db, 'toll_transactions', 'TOLL-SEED-01'), { amount: 4, plate: 'DXB TEST 1' });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('S1 — CEO read succeeds', () => {
  test('CEO can read an arbitrary CRM collection (customers)', async () => {
    const ceoDb = testEnv.authenticatedContext(CEO_UID, {}).firestore();
    await assertSucceeds(getDoc(doc(ceoDb, 'customers', 'CUS-SEED-01')));
  });
});

describe('S2 — CEO write succeeds', () => {
  test('CEO can write to an arbitrary CRM collection (customers)', async () => {
    const ceoDb = testEnv.authenticatedContext(CEO_UID, {}).firestore();
    await assertSucceeds(setDoc(doc(ceoDb, 'customers', 'CUS-TEST-CEO-WRITE'), { name: 'CEO Write Test' }));
  });
});

describe('S3 — authenticated, no CRM role, read is denied', () => {
  test('an authenticated-but-unprovisioned account cannot read customers', async () => {
    const noRoleDb = testEnv.authenticatedContext(NO_ROLE_UID, {}).firestore();
    await assertFails(getDoc(doc(noRoleDb, 'customers', 'CUS-SEED-01')));
  });

  test('an authenticated-but-unprovisioned account CAN read only its own users/{uid} doc (bootstrap exception)', async () => {
    const noRoleDb = testEnv.authenticatedContext(NO_ROLE_UID, {}).firestore();
    // This one must succeed -- it's the deliberate first-login bootstrap
    // carve-out in AuthContext.tsx, not a gap in the rule.
    await assertSucceeds(getDoc(doc(noRoleDb, 'users', NO_ROLE_UID)));
    // But it still cannot read a DIFFERENT staff member's profile.
    await assertFails(getDoc(doc(noRoleDb, 'users', CEO_UID)));
  });
});

describe('S4 — authenticated, no CRM role, write is denied', () => {
  test('an authenticated-but-unprovisioned account cannot write customers', async () => {
    const noRoleDb = testEnv.authenticatedContext(NO_ROLE_UID, {}).firestore();
    await assertFails(setDoc(doc(noRoleDb, 'customers', 'CUS-TEST-NOROLE-WRITE'), { name: 'Should Fail' }));
  });

  test('an authenticated-but-unprovisioned account cannot write audit_logs even though write:false applies to everyone', async () => {
    const noRoleDb = testEnv.authenticatedContext(NO_ROLE_UID, {}).firestore();
    await assertFails(setDoc(doc(noRoleDb, 'audit_logs', 'AUD-TEST-1'), { action: 'should fail' }));
  });
});

describe('S5 — unauthenticated read is denied', () => {
  test('an anonymous (no auth) client cannot read customers', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'customers', 'CUS-SEED-01')));
  });

  test('an anonymous client cannot read any users/{uid} profile', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'users', CEO_UID)));
  });
});

describe('S6 — unauthenticated write is denied', () => {
  test('an anonymous client cannot write customers', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonDb, 'customers', 'CUS-TEST-ANON-WRITE'), { name: 'Should Fail' }));
  });
});

describe('S7 — simulated "public website" direct Firestore access is denied', () => {
  // The real public website never attempts direct Firestore access at all
  // -- it only calls the Express server's /api/public/* REST endpoints,
  // which use the Admin SDK server-side (see splendorConnectEngine.ts /
  // server.ts) and are therefore not subject to these client rules in the
  // first place. This scenario proves that IF a client SDK call were ever
  // pointed at Firestore directly (e.g. by a future regression), it would
  // still be denied -- confidential collections are never reachable by an
  // unauthenticated client under any circumstance.
  test('unauthenticated access to confidential collections is denied', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'toll_transactions', 'TOLL-SEED-01')));
    await assertFails(getDoc(doc(anonDb, 'contracts', 'CON-ANY')));
    await assertFails(getDoc(doc(anonDb, 'payments', 'PAY-ANY')));
    await assertFails(getDoc(doc(anonDb, 'audit_logs', 'AUD-ANY')));
  });
});

describe('S8 — toll_transactions real-time read works for an authorized user', () => {
  test('a provisioned finance-role user can list toll_transactions (mirrors onSnapshot usage)', async () => {
    const financeDb = testEnv.authenticatedContext(FINANCE_UID, {}).firestore();
    await assertSucceeds(getDocs(collection(financeDb, 'toll_transactions')));
  });

  test('a provisioned operations-role user can also read toll_transactions (all staff can read tolls)', async () => {
    const opsDb = testEnv.authenticatedContext(OPERATIONS_UID, {}).firestore();
    await assertSucceeds(getDocs(collection(opsDb, 'toll_transactions')));
  });
});

describe('S9 — toll import works for an authorized user', () => {
  test('a provisioned finance-role user can create a toll_import_batches doc', async () => {
    const financeDb = testEnv.authenticatedContext(FINANCE_UID, {}).firestore();
    await assertSucceeds(
      setDoc(doc(financeDb, 'toll_import_batches', 'BATCH-TEST-1'), { source: 'salik', rowCount: 10 })
    );
  });

  test('but only ceo/admin/finance can DELETE a toll_transactions doc (least-privilege on delete)', async () => {
    const opsDb = testEnv.authenticatedContext(OPERATIONS_UID, {}).firestore();
    const financeDb = testEnv.authenticatedContext(FINANCE_UID, {}).firestore();
    await assertFails(deleteDoc(doc(opsDb, 'toll_transactions', 'TOLL-SEED-01')));
    await assertSucceeds(deleteDoc(doc(financeDb, 'toll_transactions', 'TOLL-SEED-01')));
  });
});

describe('S10 — an unrelated CRM collection still functions for legitimate access', () => {
  test('a provisioned operations-role user can read and write reservations, unaffected by toll tightening', async () => {
    const opsDb = testEnv.authenticatedContext(OPERATIONS_UID, {}).firestore();
    await assertSucceeds(
      setDoc(doc(opsDb, 'reservations', 'RES-TEST-1'), { customerId: 'CUS-SEED-01', status: 'confirmed' })
    );
    await assertSucceeds(getDoc(doc(opsDb, 'reservations', 'RES-TEST-1')));
  });
});
