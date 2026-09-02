import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const authContext = readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

describe('browser authentication boundary', () => {
  it('never provisions staff roles or user documents from the browser', () => {
    expect(authContext).not.toContain('SEED_STAFF');
    expect(authContext).not.toContain('setDoc(');
    expect(authContext).toContain('Provisioning is server-authoritative');
    expect(rules).toContain('allow create: if false;');
  });

  it('does not render the CRM or expose staff-directory reads for inactive/missing profiles', () => {
    expect(authContext).toContain("profile?.status !== 'active'");
    expect(authContext).toContain("if (!profile || profile.status !== 'active')");
    expect(authContext).toContain("if (!profile || profile.status !== 'active') return false;");
  });
});
