import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const apiHandler = readFileSync(new URL('../src/server/vercelAppHandler.ts', import.meta.url), 'utf8');

describe('immutable issued-document archive access', () => {
  it('intercepts issued-document reads before the generic upload proxy', () => {
    expect(apiHandler).toContain("const ISSUED_DOCUMENT_PREFIX = 'issued-documents/'");
    expect(apiHandler).toContain("req.path === '/api/documents/file'");
    expect(apiHandler).toContain('startsWith(ISSUED_DOCUMENT_PREFIX)');
    expect(apiHandler).toContain('return handleIssuedDocumentFile(req, res)');
  });

  it('requires an issued archive record and document-kind RBAC before Storage download', () => {
    expect(apiHandler).toContain(".collection('issued_documents')");
    expect(apiHandler).toContain(".where('storagePath', '==', storagePath)");
    expect(apiHandler).toContain("data.status !== 'issued'");
    expect(apiHandler).toContain('CORPORATE_DOCUMENT_ROLES[kind].includes(actor.role)');
    expect(apiHandler).toContain('admin.storage().bucket().file(storagePath).download()');
  });

  it('rejects traversal and never exposes a signed Storage URL', () => {
    expect(apiHandler).toContain("storagePath.includes('..')");
    expect(apiHandler).toContain("'Cache-Control', 'private, no-store'");
    expect(apiHandler).not.toContain('getSignedUrl(');
  });
});
