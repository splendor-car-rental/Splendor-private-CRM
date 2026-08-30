/**
 * Firestore Security Rules — Authorization Test Suite (S1–S10)
 * ==============================================================
 *
 * These tests verify the browser/client Firestore boundary. The production
 * architecture is server-authoritative: authenticated staff may read CRM
 * data, while business mutations are performed by the Express API through
 * Firebase Admin SDK and therefore bypass these client-facing rules.
 */

import { readFileSync } from 'fs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, deleteDoc, collection, getDocs, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'splendor-crm-rules-test';
const CEO_UID = 'test-ceo-uid';
const FINANCE_UID = 'test-finance-uid';
const OPERATIONS_UID = 'test-ops-uid';
const NO_ROLE_UID = 'test-unprovisioned-uid';

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

  await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
    const db = adminCtx.firestore();
    await setDoc(doc(db, 'users', CEO_UID), { role: 'ceo', name: 'Test CEO' });
    await setDoc(doc(db, 'users', FINANCE_UID), { role: 'finance', name: 'Test Finance' });
    await setDoc(doc(db, 'users', OPERATIONS_UID), { role: 'operations', name: 'Test Ops' });
    await setDoc(doc(db, 'customers', 'CUS-SEED-01'), { name: 'Seed Customer' });
    await setDoc(doc(db, 'toll_transactions', 'TOLL-SEED-01'), { amount: 4, plate: 'DXB TEST 1' });
    await setDoc(doc(db, 'reservations', 'RES-SEED-01'), { vehicleId: 'VEH-SEED-01' });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('S1 — authorized staff read succeeds', () => {
  test('CEO can read an arbitrary CRM collection (customers)', async () => {
    const ceoDb = testEnv.authenticatedContext(CEO_UID, {}).firestore();
    await assertSucceeds(getDoc(doc(ceoDb, 'customers', 'CUS-SEED-01')));
  });
});

describe('S2 — browser writes are server-authoritative', () => {
  test('CEO cannot write CRM data directly through the client SDK', async () => {
    const ceoDb = testEnv.authenticatedContext(CEO_UID, {}).firestore();
    await assertFails(setDoc(doc(ceoDb, 'customers', 'CUS-TEST-CEO-WRITE'), { name: 'Direct write must fail' }));
  });
});

describe('S3 — authenticated, no CRM role, read is denied', () => {
  test('an authenticated-but-unprovisioned account cannot read customers', async () => {
    const noRoleDb = testEnv.authenticatedContext(NO_ROLE_UID, {}).firestore();
    await assertFails(getDoc(doc(noRoleDb, 'customers', 'CUS-SEED-01')));
  });

  test('an authenticated-but-unprovisioned account CAN read only its own users/{uid} doc (bootstrap exception)', async () => {
    const noRoleDb = testEnv.authenticatedContext(NO_ROLE_UID, {}).firestore();
    await assertSucceeds(getDoc(doc(noRoleDb, 'users', NO_ROLE_UID)));
    await assertFails(getDoc(doc(noRoleDb, 'users', CEO_UID)));
  });
});

describe('S4 — authenticated, no CRM role, write is denied', () => {
  test('an authenticated-but-unprovisioned account cannot write customers', async () => {
    const noRoleDb = testEnv.authenticatedContext(NO_ROLE_UID, {}).firestore();
    await assertFails(setDoc(doc(noRoleDb, 'customers', 'CUS-TEST-NOROLE-WRITE'), { name: 'Should Fail' }));
  });

  test('an authenticated-but-unprovisioned account cannot write audit_logs', async () => {
    const noRoleDb = testEnv.authenticatedContext(NO_ROLE_UID, {}).firestore();
    await assertFails(setDoc(doc(noRoleDb, 'audit_logs', 'AUD-TEST-1'), { action: 'should fail' }));
  });
});

describe('S5 — unauthenticated read is denied', () => {
  test('an anonymous client cannot read customers', async () => {
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

describe('S7 — simulated public website direct Firestore access is denied', () => {
  test('unauthenticated access to confidential collections is denied', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'toll_transactions', 'TOLL-SEED-01')));
    await assertFails(getDoc(doc(anonDb, 'contracts', 'CON-ANY')));
    await assertFails(getDoc(doc(anonDb, 'payments', 'PAY-ANY')));
    await assertFails(getDoc(doc(anonDb, 'audit_logs', 'AUD-ANY')));
  });
});

describe('S8 — authorized staff real-time reads work', () => {
  test('finance can list toll_transactions', async () => {
    const financeDb = testEnv.authenticatedContext(FINANCE_UID, {}).firestore();
    await assertSucceeds(getDocs(collection(financeDb, 'toll_transactions')));
  });

  test('operations can also read toll_transactions', async () => {
    const opsDb = testEnv.authenticatedContext(OPERATIONS_UID, {}).firestore();
    await assertSucceeds(getDocs(collection(opsDb, 'toll_transactions')));
  });
});

describe('S9 — toll mutations are server-authoritative', () => {
  test('finance cannot create a toll_import_batches document directly through the client SDK', async () => {
    const financeDb = testEnv.authenticatedContext(FINANCE_UID, {}).firestore();
    await assertFails(setDoc(doc(financeDb, 'toll_import_batches', 'BATCH-TEST-1'), { source: 'salik', rowCount: 10 }));
  });

  test('even finance cannot delete toll_transactions directly; the API/Admin SDK owns mutations', async () => {
    const financeDb = testEnv.authenticatedContext(FINANCE_UID, {}).firestore();
    await assertFails(deleteDoc(doc(financeDb, 'toll_transactions', 'TOLL-SEED-01')));
  });
});

describe('S10 — unrelated CRM collections remain readable while writes stay server-authoritative', () => {
  test('operations can read reservations but cannot mutate them through the browser SDK', async () => {
    const opsDb = testEnv.authenticatedContext(OPERATIONS_UID, {}).firestore();
    await assertSucceeds(getDoc(doc(opsDb, 'reservations', 'RES-SEED-01')));
    await assertFails(setDoc(doc(opsDb, 'reservations', 'RES-TEST-DIRECT-WRITE'), { vehicleId: 'VEH-TEST' }));
  });
});
