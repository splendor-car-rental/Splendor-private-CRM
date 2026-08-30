import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contract-level guard for the Firestore security boundary.
 *
 * The application deliberately uses Firebase Admin SDK for business writes.
 * These tests make the intended rule shape executable in CI so a future
 * refactor cannot silently reopen broad client write access.
 */
describe('Firestore security policy', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  it('has no recursive catch-all grant', () => {
    expect(rules).not.toMatch(/match\s*\/\{document=\*\*\}/);
    expect(rules).not.toMatch(/allow\s+(read\s*,\s*write|write\s*,\s*read)\s*:\s*if\s+true/);
  });

  it('makes critical business collections server-authoritative', () => {
    const collections = [
      'vehicles', 'customers', 'leads', 'opportunities', 'quotations',
      'reservations', 'contracts', 'charges', 'deposits', 'payments',
      'invoices', 'bank_batches', 'bank_transactions', 'documents',
      'numbering_configs', 'settings', 'lto_applications',
      'lto_installments', 'lto_settlement_requests'
    ];

    for (const collection of collections) {
      const block = rules.match(new RegExp(`match \/${collection}\\/\\{id\\} \\{([\\s\\S]*?)\\}`));
      expect(block, `${collection} rule must exist`).not.toBeNull();
      expect(block?.[1]).toMatch(/allow write:\s*if false/);
    }
  });

  it('does not permit client creation or deletion of user profiles', () => {
    const userBlock = rules.match(/match \/users\/\{uid\} \{([\s\S]*?)\n    \}/);
    expect(userBlock).not.toBeNull();
    expect(userBlock?.[1]).toMatch(/allow create:\s*if false/);
    expect(userBlock?.[1]).toMatch(/allow delete:\s*if false/);
  });

  it('restricts self-profile updates to non-security fields', () => {
    const userBlock = rules.match(/match \/users\/\{uid\} \{([\s\S]*?)\n    \}/);
    expect(userBlock?.[1]).toMatch(/affectedKeys\(\)\s*\n?\s*\.hasOnly\(\['name', 'nameAr', 'phone', 'avatar'\]\)/);
    expect(userBlock?.[1]).not.toMatch(/allow write:\s*if\s+isSignedIn\(\)/);
  });

  it('keeps audit logs client-write protected', () => {
    const auditBlock = rules.match(/match \/audit_logs\/\{logId\} \{([\s\S]*?)\n    \}/);
    expect(auditBlock?.[1]).toMatch(/allow write:\s*if false/);
  });
});
