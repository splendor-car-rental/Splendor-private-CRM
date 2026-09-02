import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const safeApi = readFileSync(new URL('../api/tax-compliance-safe.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/server/taxExceptionApi.ts', import.meta.url), 'utf8');
const periodPolicy = readFileSync(new URL('../src/server/taxPeriodPolicy.ts', import.meta.url), 'utf8');

describe('Tax Blocking Exception runtime boundary', () => {
  it('keeps exceptions behind the existing isolated Tax Compliance API', () => {
    expect(safeApi).toContain("resource === 'exceptions'");
    expect(safeApi).toContain("import('../src/server/taxExceptionApi.js')");
    expect(runtime).toContain('verifyIdToken');
    expect(runtime).toContain("requirePermission(actor, 'tax.view'");
  });

  it('updates the authoritative period blocker count atomically from stored open exceptions', () => {
    expect(runtime).toContain("const EXCEPTION_COLLECTION = 'tax_period_exceptions'");
    expect(runtime).toContain('runTransaction');
    expect(runtime).toContain("where('periodId', '==', periodId)");
    expect(runtime).toContain("status === 'open'");
    expect(runtime).toContain('applyBlockingExceptionToPeriod(period, openCount + 1, now)');
    expect(runtime).toContain('blockingExceptionCount: Math.max(0, openCount - 1)');
    expect(runtime).toContain("entityType: 'TaxBlockingException'");
    expect(runtime).toContain("entityType: 'TaxPeriod'");
  });

  it('invalidates completed internal-review readiness when a new blocker appears', () => {
    expect(runtime).toContain('applyBlockingExceptionToPeriod');
    expect(runtime).toContain('Any completed internal-review readiness is invalidated until independent review passes again.');
  });

  it('requires Four-Eyes resolution evidence and blocks downstream validation/close while blockers remain', () => {
    expect(runtime).toContain("requirePermission(actor, 'tax.review'");
    expect(runtime).toContain('validateResolveBlockingException');
    expect(periodPolicy).toContain('Blocking exceptions must be resolved before professional validation can be recorded.');
    expect(periodPolicy).toContain('Blocking exceptions must be resolved before a tax period can be closed.');
  });

  it('has no delete, waiver, filing, or submission action', () => {
    expect(runtime).not.toMatch(/method\s*===\s*['"]DELETE['"]/);
    expect(runtime).not.toMatch(/action\s*===\s*['"](?:waive|file|filing|submit-return|submit-filing)['"]/i);
    expect(runtime).toContain("'NOT_READY_FOR_FILING'");
    expect(runtime).toContain("res.setHeader('Allow', 'GET, POST')");
  });
});
