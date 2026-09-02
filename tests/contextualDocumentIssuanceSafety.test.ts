import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = readFileSync(new URL('../src/server/contextualDocumentService.ts', import.meta.url), 'utf8');
const numbering = readFileSync(new URL('../src/server/idGenerator.ts', import.meta.url), 'utf8');

describe('contextual document issuance safety', () => {
  it('uses a Firestore ownership lock so concurrent serverless requests cannot both issue', () => {
    expect(service).toContain('randomUUID');
    expect(service).toContain('reserveIssueLock');
    expect(service).toContain('runTransaction');
    expect(service).toContain("status: 'issuing'");
    expect(service).toContain('lockExpiresAt');
    expect(service).toContain('DocumentIssuanceInProgressError');
    expect(service).toContain('finalizeIssuedRecord');
  });

  it('replays an already issued immutable PDF before hydrating mutable source data', () => {
    const existingRead = service.indexOf('const existing = await ref.get()');
    const hydrateRead = service.indexOf('const hydrated = await hydrateContextualDocument(kind, source)', existingRead);
    expect(existingRead).toBeGreaterThan(-1);
    expect(hydrateRead).toBeGreaterThan(existingRead);
    expect(service).toContain('return readIssuedResult(kind, archiveId, existing.data())');
  });

  it('consumes official numbering for derived customer documents only on issue and extends that issue-time rule to LPO', () => {
    expect(service).toContain("['account_statement', 'payment_demand', 'lpo']");
    expect(service).toContain("'PREVIEW-STATEMENT'");
    expect(service).toContain("'PREVIEW-DEMAND'");
    expect(service).toContain("'PREVIEW-LPO'");
    expect(service).toContain("if (kind === 'lpo') return issueNextNumber('LPO')");
    expect(service).toContain('issueNextNumber(getCorporateDocumentMeta(kind).numbering)');
    expect(numbering).toContain("accountstatement: { prefix: 'STMT-', digits: 6 }");
    expect(numbering).toContain("lpo: { prefix: 'LPO-SCR-', digits: 6 }");
  });

  it('retains a reserved serial across a failed attempt instead of minting another on retry', () => {
    expect(service).toContain('serial: data?.serial || null');
    expect(service).toContain('previouslyReserved');
    expect(service).toContain('if (previouslyReserved) return previouslyReserved');
    expect(service).toContain("status: 'failed'");
  });
});
