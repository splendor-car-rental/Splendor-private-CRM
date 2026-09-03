import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const safeApi = readFileSync(new URL('../api/tax-compliance-safe.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/server/taxPeriodApi.ts', import.meta.url), 'utf8');

describe('Tax Period runtime boundary', () => {
  it('keeps Tax Periods behind the existing isolated Tax Compliance route', () => {
    expect(safeApi).toContain("resource === 'periods'");
    expect(safeApi).toContain("import('../src/server/taxPeriodApi.js')");
    expect(safeApi).toContain("import('../src/server/taxComplianceMasterApi.js')");
  });

  it('requires authentication and server-owned lifecycle permissions before state transitions', () => {
    expect(runtime).toContain('verifyIdToken');
    expect(runtime).toContain("requirePermission(actor, 'tax.view'");
    expect(runtime).toContain("requirePermission(actor, 'tax.prepare'");
    expect(runtime).toContain('resolveTaxPeriodLifecycleAction');
    expect(runtime).toContain("return { action: 'complete-review', permission: 'tax.review' }");
    expect(runtime).toContain("return { action: 'record-professional-validation', permission: 'tax.approve' }");
    expect(runtime).toContain("return { action: 'close', permission: 'tax.approve' }");
    expect(runtime).toContain('requirePermission(actor, authorizedTransition.permission, res)');

    const transitionStart = runtime.indexOf('async function transitionTaxPeriod');
    const handlerStart = runtime.indexOf('export default async function taxPeriodHandler');
    expect(transitionStart).toBeGreaterThan(-1);
    expect(handlerStart).toBeGreaterThan(transitionStart);
    expect(runtime.slice(transitionStart, handlerStart)).not.toContain('requirePermission(');
  });

  it('creates evidence-bound immutable periods inside Firestore transactions', () => {
    expect(runtime).toContain("const PERIOD_COLLECTION = 'tax_periods'");
    expect(runtime).toContain('runTransaction');
    expect(runtime).toContain('validateTaxPeriodDraft');
    expect(runtime).toContain('deadlineSourceVersionUpdatedAt');
    expect(runtime).toContain('ruleVersionUpdatedAtById');
    expect(runtime).toContain('ruleSourceVersionUpdatedAtById');
    expect(runtime).toContain('taxProfileVersionUpdatedAt');
    expect(runtime).toContain('periodsOverlap');
    expect(runtime).toContain('Only accepted immutable tax rule versions may be bound to a tax period.');
    expect(runtime).toContain("entityType: 'TaxPeriod'");
  });

  it('exposes only the non-filing lifecycle requested by governance', () => {
    for (const action of ['open', 'submit-review', 'complete-review', 'record-professional-validation', 'close']) {
      expect(runtime).toContain(`case '${action}'`);
      expect(runtime).toContain(`action === '${action}'`);
    }
    expect(runtime).toContain("status: 'ready_for_professional_review'");
    expect(runtime).toContain("status: 'professionally_validated'");
    expect(runtime).toContain("status: 'closed'");
    expect(runtime).not.toMatch(/status:\s*['"]filed/);
    expect(runtime).not.toContain("'READY_FOR_FILING'");
  });

  it('has no delete or filing/submission action surface', () => {
    expect(runtime).not.toMatch(/method\s*===\s*['"]DELETE['"]/);
    expect(runtime).not.toMatch(/case\s*['"](?:file|filing|submit-return|submit-filing)['"]/);
    expect(runtime).not.toMatch(/action\s*===\s*['"](?:file|filing|submit-return|submit-filing)['"]/);
    expect(runtime).toContain("res.setHeader('Allow', 'GET, POST')");
    expect(runtime).toContain("'NOT_READY_FOR_FILING'");
  });
});
