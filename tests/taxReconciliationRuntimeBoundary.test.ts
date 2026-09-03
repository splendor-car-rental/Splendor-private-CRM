import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const safeApi = readFileSync(new URL('../api/tax-compliance-safe.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/server/taxReconciliationApi.ts', import.meta.url), 'utf8');
const evidenceRuntime = readFileSync(new URL('../src/server/taxReconciliationEvidence.ts', import.meta.url), 'utf8');
const exceptionPolicy = readFileSync(new URL('../src/server/taxExceptionPolicy.ts', import.meta.url), 'utf8');
const periodPolicy = readFileSync(new URL('../src/server/taxPeriodPolicy.ts', import.meta.url), 'utf8');
const periodRuntime = readFileSync(new URL('../src/server/taxPeriodApi.ts', import.meta.url), 'utf8');

describe('Tax Reconciliation runtime boundary', () => {
  it('routes through the existing isolated Tax Compliance API and authenticates independently', () => {
    expect(safeApi).toContain("resource === 'reconciliations'");
    expect(safeApi).toContain("import('../src/server/taxReconciliationApi.js')");
    expect(runtime).toContain('verifyIdToken');
    expect(runtime).toContain("String(data?.status || '') !== 'active'");
    expect(runtime).not.toContain("String(data?.status || 'active')");
    expect(runtime).toContain("requirePermission(actor, 'tax.view'");
  });

  it('captures immutable evidence only from authoritative accounting journals and source records', () => {
    expect(evidenceRuntime).toContain("TAX_RECONCILIATION_JOURNAL_COLLECTION = 'accounting_journals'");
    expect(evidenceRuntime).toContain("journal.status === 'posted'");
    expect(evidenceRuntime).toContain('postedPeriodJournals');
    expect(evidenceRuntime).toContain("tx.get(firestore.collection('invoices'))");
    expect(evidenceRuntime).toContain("tx.get(firestore.collection('payments'))");
    expect(evidenceRuntime).toContain("tx.get(firestore.collection('supplier_invoices'))");
    expect(runtime).toContain("ledgerEvidenceHashAlgorithm: 'SHA-256'");
    expect(runtime).toContain("technicalScope: 'POSTED_ACCOUNTING_LEDGER_AND_POSTING_GAPS'");
    expect(runtime).not.toContain('buildVatSummary');
    expect(evidenceRuntime).not.toContain('buildVatSummary');
  });

  it('opens a managed blocker for unresolved posting gaps and prevents generic bypass', () => {
    expect(runtime).toContain("managedBy: 'TAX_RECONCILIATION'");
    expect(runtime).toContain("managedKey: 'POSTING_GAPS'");
    expect(runtime).toContain("category: 'POSTING_GAP'");
    expect(exceptionPolicy).toContain('can only be resolved through the authoritative Tax Reconciliation workflow');
  });

  it('requires a current zero-gap reconciliation snapshot before tax-period advancement', () => {
    expect(periodPolicy).toContain('A server-captured Tax Reconciliation evidence snapshot is required before this Tax Period can advance.');
    expect(periodPolicy).toContain('Tax Reconciliation posting gaps must be zero before this Tax Period can advance.');
    expect(periodPolicy).toContain('latestReconciliationLedgerEvidenceHash');
    expect(periodRuntime).toContain('validateAuthoritativeReconciliationFreshness');
    expect(periodRuntime).toContain('authoritative posted accounting journals changed after the latest snapshot was captured');
    expect(periodRuntime).toContain('authoritative posting gaps changed after the latest snapshot was captured');
    expect(periodRuntime).toContain('blocking exception count is inconsistent with authoritative open exceptions');
  });

  it('uses Four-Eyes review to resolve managed posting gaps and exposes no filing/delete path', () => {
    expect(runtime).toContain("requirePermission(actor, 'tax.review'");
    expect(runtime).toContain('validateResolveReconciliationPostingGap');
    expect(runtime).toContain("evidence.postingGaps, 'reviewed_clean', now");
    expect(runtime).not.toMatch(/method\s*===\s*['"]DELETE['"]/);
    expect(runtime).not.toMatch(/action\s*===\s*['"](?:file|filing|submit-return|submit-filing)['"]/i);
    expect(runtime).toContain("'NOT_READY_FOR_FILING'");
  });
});
