import { describe, expect, it } from 'vitest';
import { buildCorporateDocumentHtml, getCorporateDocumentMeta } from '../src/server/corporateDocumentEngine';

describe('corporate document engine', () => {
  it('uses the approved document metadata without allowing the serial to alter the template', () => {
    expect(getCorporateDocumentMeta('tax_invoice').en).toBe('TAX INVOICE');
    const html = buildCorporateDocumentHtml({
      kind: 'tax_invoice',
      customer: { name: '<script>alert(1)</script>' },
      fields: { total: 100 }
    }, 'INV-000001');

    expect(html).toContain('INV-000001');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('keeps the header/footer outside the editable document body contract', () => {
    const html = buildCorporateDocumentHtml({ kind: 'official_letter', body: 'Body content only.' }, 'DOC-000001');
    expect(html).toContain('Body content only.');
    expect(html).not.toContain('SPLENDOR CAR RENTAL');
    expect(html).not.toContain('Prestige Beyond Limits');
  });
});
