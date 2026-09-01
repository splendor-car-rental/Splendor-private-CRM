import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { APPROVED_DOCUMENT_TEMPLATE } from '../src/server/approvedDocumentComposer';

const approvedDir = join(process.cwd(), 'docs', 'approved-forms');

const requiredWorkflowMasters = {
  rental_contract: 'BILL BOOK A4 rental.pdf',
  fines_notice: 'إشعار مخالفات ورسوم.pdf',
  debit_note: 'إشعار مدين.pdf',
  payment_demand: 'إنذار بالسداد.pdf',
  vehicle_record_card: 'بطاقة مركبة.pdf',
  vehicle_exit_permit: 'تصريح خروج مركبة.pdf',
  fleet_document_renewal_schedule: 'جدول تجديد وثائق الأسطول.pdf',
  official_letter: 'خطاب رسمي.pdf',
  payment_receipt: 'سند قبض.pdf',
  simplified_tax_invoice: 'فاتورة ضريبية مبسطة.pdf',
  tax_invoice: 'فاتورة ضريبية.pdf',
  account_statement: 'كشف حساب ..pdf',
  damage_claim: 'مطالبة أضرار.pdf',
  contract_extension: 'ملحق تمديد عقد.pdf'
} as const;

describe('approved corporate document source art', () => {
  it('maps every approved operational workflow to the exact committed PDF master', () => {
    for (const [kind, file] of Object.entries(requiredWorkflowMasters)) {
      expect(APPROVED_DOCUMENT_TEMPLATE[kind as keyof typeof APPROVED_DOCUMENT_TEMPLATE]).toBe(file);
      expect(existsSync(join(approvedDir, file)), `${kind} master missing`).toBe(true);
    }
  });

  it('keeps the complete approved form library at exactly 16 PDF masters', async () => {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(approvedDir).filter(name => name.toLowerCase().endsWith('.pdf'));
    expect(files).toHaveLength(16);
  });

  it('keeps the approved rental agreement terms page intact as a two-page master', async () => {
    const bytes = readFileSync(join(approvedDir, requiredWorkflowMasters.rental_contract));
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(2);
  });

  it('uses approved letterhead only for workflows without a dedicated committed master', () => {
    expect(APPROVED_DOCUMENT_TEMPLATE.lpo).toBe('SPLENDOR_Letter-head.pdf');
    expect(APPROVED_DOCUMENT_TEMPLATE.credit_note).toBe('SPLENDOR_Letter-head.pdf');
    expect(APPROVED_DOCUMENT_TEMPLATE.quotation).toBe('SPLENDOR_Letter-head.pdf');
  });

  it('routes the document engine through the source-art composer rather than the legacy HTML PDF path', () => {
    const engine = readFileSync(join(process.cwd(), 'src', 'server', 'corporateDocumentEngine.ts'), 'utf8');
    expect(engine).toContain("composeApprovedCorporateDocument({ ...input, serial }, serial)");
    const renderFunction = engine.slice(engine.indexOf('export async function issueAndRenderCorporateDocument'));
    expect(renderFunction).not.toContain('page.pdf({');
  });
});
