import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entry = readFileSync(new URL('../api/index.ts', import.meta.url), 'utf8');

describe('serverless authentication and cold-start boundary', () => {
  it('uses the canonical active-staff verifier for sensitive serverless intercepts', () => {
    expect(entry).toContain("import { getVerifiedActiveStaff }");
    expect(entry).toContain('return getVerifiedActiveStaff(req, res, roles)');
    expect(entry).not.toContain('async function getVerifiedStaff(');
  });

  it('does not import the Express/Firebase runtime eagerly at module load', () => {
    expect(entry).not.toMatch(/import\s+app\s+from\s+['"]\.\.\/server/);
    expect(entry).toContain("import('../server.js')");
    expect(entry).toContain('async function getExpressApp()');
  });

  it('keeps money-moving boundaries behind role-scoped active staff checks', () => {
    expect(entry).toContain("['ceo', 'admin', 'finance']");
    expect(entry).toContain("['ceo', 'admin', 'finance', 'operations', 'sales']");
    expect(entry).toContain("['ceo', 'admin', 'fleet']");
  });
});
