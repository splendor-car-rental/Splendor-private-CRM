import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = readFileSync(new URL('../src/server/issuedDocumentWhatsApp.ts', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../api/document-whatsapp.ts', import.meta.url), 'utf8');
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

describe('issued document WhatsApp delivery safety', () => {
  it('resolves archive, customer and phone server-side without accepting a browser phone or storage path', () => {
    expect(service).toContain("collection('issued_documents').doc(id).get()");
    expect(service).toContain("collection('customers').doc(customerId).get()");
    expect(service).toContain("customer.whatsapp || customer.phone");
    expect(service).toContain("startsWith('issued-documents/')");
    expect(service).toContain("admin.storage().bucket().file(String(archive.storagePath)).download()");
    expect(service).not.toContain('input.phone');
    expect(service).not.toContain('input.storagePath');
  });

  it('honors the global WhatsApp emergency kill switch and only sends immutable issued archives', () => {
    expect(service).toContain("getRuleValue('killSwitch.whatsappOutbound', false)");
    expect(service).toContain("archive.status !== 'issued'");
    expect(service).toContain('sendWhatsAppPdfBuffer(phone, pdf, fileName, caption)');
    expect(service).toContain("collection('whatsapp_message_log').doc(id).set(record)");
  });

  it('authorizes from the immutable archive kind and exposes an isolated Vercel route before the catch-all', () => {
    expect(endpoint).toContain("collection('issued_documents').doc(archiveId).get()");
    expect(endpoint).toContain('const kind = archive?.kind as CorporateDocumentKind');
    expect(endpoint).toContain('const allowedRoles = DOCUMENT_SEND_ROLES[kind]');
    expect(endpoint).not.toContain('req.body.phone');

    const config = JSON.parse(vercel);
    const routes = config.rewrites.map((r: any) => r.source);
    const documentRoute = routes.indexOf('/api/issued-documents/:archiveId/whatsapp');
    const catchAll = routes.indexOf('/api/:path*');
    expect(documentRoute).toBeGreaterThan(-1);
    expect(catchAll).toBeGreaterThan(documentRoute);
  });
});
