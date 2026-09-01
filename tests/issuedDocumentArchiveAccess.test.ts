import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const api = readFileSync(new URL('../api/index.ts', import.meta.url), 'utf8');

describe('immutable issued-document archive access', () => {
  it('intercepts issued-document reads before the generic upload proxy', () => {
    expect(api).toContain("const ISSUED_DOCUMENT_PREFIX = 'issued-documents/'");
    expect(api).toContain("req.path === '/api/documents/file'");
    expect(api).toContain('startsWith(ISSUED_DOCUMENT_PREFIX)');
    expect(api).toContain('return handleIssuedDocumentFile(req, res)');
  });

  it('requires an issued archive record and document-kind RBAC before Storage download', () => {
    expect(api).toContain(".collection('issued_documents')");
    expect(api).toContain(".where('storagePath', '==', storagePath)");
    expect(api).toContain("data.status !== 'issued'");
    expect(api).toContain('CORPORATE_DOCUMENT_ROLES[kind].includes(actor.role)');
    expect(api).toContain('admin.storage().bucket().file(storagePath).download()');
  });

  it('rejects traversal and never exposes a signed Storage URL', () => {
    expect(api).toContain("storagePath.includes('..')");
    expect(api).toContain("'Cache-Control', 'private, no-store'");
    expect(api).not.toContain('getSignedUrl(');
  });
});
