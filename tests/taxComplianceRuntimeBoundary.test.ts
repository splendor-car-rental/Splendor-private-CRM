import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const api = readFileSync(new URL('../api/tax-compliance.ts', import.meta.url), 'utf8');
const safeApi = readFileSync(new URL('../api/tax-compliance-safe.ts', import.meta.url), 'utf8');
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../src/config/permissions.ts', import.meta.url), 'utf8');
const taxPermissions = readFileSync(new URL('../src/config/taxCompliance.ts', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/components/views/TaxComplianceView.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');

describe('Tax Compliance runtime boundary', () => {
  it('routes tax requests to an isolated fail-closed serverless function before the catch-all', () => {
    expect(vercel).toContain('"source": "/api/tax-compliance", "destination": "/api/tax-compliance-safe"');
    expect(safeApi).toContain('FIREBASE_SERVICE_ACCOUNT_KEY');
    expect(safeApi).toContain('ignoreUndefinedProperties: true');
    expect(safeApi).toContain("import('./tax-compliance.js')");
  });

  it('requires authentication, independent permissions, atomic audit evidence, and has no delete path', () => {
    expect(api).toContain('verifyIdToken');
    expect(api).toContain("requirePermission(actor, 'tax.view'");
    expect(api).toContain('tax_audit_events');
    expect(api).toContain('runTransaction');
    expect(api).toContain('writeAuditInTransaction');
    expect(api).not.toMatch(/method\s*===\s*['"]DELETE['"]/);
  });

  it('preserves immutable versions instead of overwriting tax history', () => {
    expect(api).toContain('tax_master_profile_versions');
    expect(api).toContain('This tax rule code/version already exists. Create a new version instead of overwriting history.');
    expect(api).toContain("action === 'record-professional-validation'");
    expect(api).toContain("action === 'accept'");
  });

  it('exposes the dedicated workspace only to the intended broad roles while keeping tax actions narrower', () => {
    expect(permissions).toContain("'tax-compliance'");
    expect(permissions).toMatch(/finance:\s*\[[^\]]*'tax-compliance'/s);
    expect(permissions).not.toMatch(/operations:\s*\[[^\]]*'tax-compliance'/s);
    expect(permissions).not.toMatch(/sales:\s*\[[^\]]*'tax-compliance'/s);
    expect(permissions).not.toMatch(/fleet:\s*\[[^\]]*'tax-compliance'/s);
    expect(taxPermissions).toContain("finance: ['tax.view', 'tax.prepare', 'tax.evidence.manage']");
  });

  it('renders a separate workspace that cannot represent itself as filing-ready', () => {
    expect(app).toMatch(/case\s+['"]tax-compliance['"]:\s*(?:case\s+['"]tax['"]:\s*)?return\s+<TaxComplianceView\s*\/>/s);
    expect(sidebar).toContain("id: 'tax-compliance'");
    expect(view).toContain('NOT READY FOR FILING');
    expect(view).toContain('Professional validation');
    expect(view).not.toMatch(/>\s*(Submit|File)\s+(VAT|Corporate Tax|Tax)\s+Return\s*</i);
  });
});
