import { readFileSync } from 'fs';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'splendor-sensitive-rbac-test';
const CEO = 'rbac-ceo';
const FINANCE = 'rbac-finance';
const SALES = 'rbac-sales';
const OPS = 'rbac-ops';
const INACTIVE = 'rbac-inactive';
const STATUSLESS = 'rbac-statusless';
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', CEO), { role: 'ceo', status: 'active', name: 'CEO' });
    await setDoc(doc(db, 'users', FINANCE), { role: 'finance', status: 'active', name: 'Finance' });
    await setDoc(doc(db, 'users', SALES), { role: 'sales', status: 'active', name: 'Sales' });
    await setDoc(doc(db, 'users', OPS), { role: 'operations', status: 'active', name: 'Operations' });
    await setDoc(doc(db, 'users', INACTIVE), { role: 'finance', status: 'inactive', name: 'Inactive' });
    await setDoc(doc(db, 'users', STATUSLESS), { role: 'finance', name: 'Legacy statusless' });
    await setDoc(doc(db, 'customers', 'CUS-1'), { name: 'Customer' });
    await setDoc(doc(db, 'audit_logs', 'AUD-1'), { action: 'test' });
    await setDoc(doc(db, 'bank_transactions', 'BANK-1'), { amount: 100 });
    await setDoc(doc(db, 'company_bank_accounts', 'ACC-1'), { bankName: 'Test' });
    await setDoc(doc(db, 'corporate_accounts', 'CORP-1'), { legalName: 'Test Corp' });
    await setDoc(doc(db, 'toll_transactions', 'TOLL-1'), { amount: 4 });
  });
});

afterAll(async () => env.cleanup());

function dbFor(uid: string) {
  return env.authenticatedContext(uid, {}).firestore();
}

describe('Firestore sensitive read RBAC', () => {
  test('missing or inactive staff status fails closed for normal CRM data', async () => {
    await assertFails(getDoc(doc(dbFor(INACTIVE), 'customers', 'CUS-1')));
    await assertFails(getDoc(doc(dbFor(STATUSLESS), 'customers', 'CUS-1')));
  });

  test('finance can read banking data but operations and sales cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(FINANCE), 'bank_transactions', 'BANK-1')));
    await assertSucceeds(getDoc(doc(dbFor(FINANCE), 'company_bank_accounts', 'ACC-1')));
    await assertFails(getDoc(doc(dbFor(OPS), 'bank_transactions', 'BANK-1')));
    await assertFails(getDoc(doc(dbFor(SALES), 'company_bank_accounts', 'ACC-1')));
  });

  test('audit history is management-only', async () => {
    await assertSucceeds(getDoc(doc(dbFor(CEO), 'audit_logs', 'AUD-1')));
    await assertFails(getDoc(doc(dbFor(FINANCE), 'audit_logs', 'AUD-1')));
    await assertFails(getDoc(doc(dbFor(OPS), 'audit_logs', 'AUD-1')));
  });

  test('corporate account reads are limited to management, sales and finance', async () => {
    await assertSucceeds(getDoc(doc(dbFor(SALES), 'corporate_accounts', 'CORP-1')));
    await assertSucceeds(getDoc(doc(dbFor(FINANCE), 'corporate_accounts', 'CORP-1')));
    await assertFails(getDoc(doc(dbFor(OPS), 'corporate_accounts', 'CORP-1')));
  });

  test('toll operations remain readable to active operational staff but never writable from the browser', async () => {
    await assertSucceeds(getDoc(doc(dbFor(OPS), 'toll_transactions', 'TOLL-1')));
    await assertFails(setDoc(doc(dbFor(FINANCE), 'toll_transactions', 'TOLL-NEW'), { amount: 5 }));
  });
});
