import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const intake = readFileSync(new URL('../src/components/customers/CustomerIntakePortal.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/dashboard/DashboardPersonalizationGuard.tsx', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../src/components/documents/ContextualDocumentActions.tsx', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../src/components/documents/WorkflowDocumentPreviewButton.tsx', import.meta.url), 'utf8');
const finance = readFileSync(new URL('../src/components/views/FinanceLedgerView.tsx', import.meta.url), 'utf8');
const countries = readFileSync(new URL('../src/config/countryOptions.ts', import.meta.url), 'utf8');
const customerCss = readFileSync(new URL('../src/customer-sapphire.css', import.meta.url), 'utf8');

describe('contextual document workflow', () => {
  it('removes the floating approved-forms library from the application shell', () => {
    expect(app).not.toContain('ApprovedFormsLibrary');
    expect(app).toContain('<ContextualDocumentActions />');
  });

  it('keeps global record documents contextual to an explicitly selected persisted entity', () => {
    expect(docs).toContain("activeView === 'contracts'");
    expect(docs).toContain("activeView === 'customers'");
    expect(docs).toContain("activeView === 'fleet'");
    expect(docs).toContain('selectedContractId');
    expect(docs).toContain('selectedCustomerId');
    expect(docs).toContain('selectedVehicleId');
    expect(docs).toContain('kind="rental_contract"');
    expect(docs).toContain('kind="contract_extension"');
    expect(docs).toContain('kind="account_statement"');
    expect(docs).toContain('kind="payment_demand"');
    expect(docs).toContain('kind="vehicle_record_card"');
  });

  it('binds finance invoice and receipt documents to the exact persisted row', () => {
    expect(finance).toContain('WorkflowDocumentPreviewButton');
    expect(finance).toContain('kind="tax_invoice"');
    expect(finance).toContain("source={{ type: 'invoice', id: inv.id }}");
    expect(finance).toContain('kind="payment_receipt"');
    expect(finance).toContain("source={{ type: 'payment', id: pay.id }}");
    expect(finance).not.toContain('TaxInvoicePrintModal');
    expect(finance).not.toContain('setInvoiceToPrint');
  });

  it('uses the server-bound preview then approve/issue/archive API and only exposes print/save after issue', () => {
    expect(workflow).toContain('/api/corporate-documents/${mode}');
    expect(workflow).toContain("mode: 'preview' | 'issue'");
    expect(workflow).toContain('JSON.stringify({ kind, source })');
    expect(workflow).toContain("response.headers.get('X-Document-Serial')");
    expect(workflow).toContain("response.headers.get('X-Document-Archived')");
    expect(workflow).toContain("response.headers.get('X-Document-Archive-Id')");
    expect(workflow).toContain('{issued && <a');
    expect(workflow).toContain('{issued && <button');
  });
});

describe('structured customer intake', () => {
  it('supports individual and corporate onboarding with requested identity fields', () => {
    for (const token of [
      "mode: 'individual'", "'corporate'", 'idIssueDate', 'idExpiryDate', 'idIssuedBy',
      'licenseType', 'licenseIssueDate', 'licenseExpiryDate', 'licenseCountry',
      'tradeLicenseNumber', 'tradeLicenseIssueDate', 'tradeLicenseExpiryDate',
      'companyOwnerName', 'responsibleManagerName', 'companyTrn', 'companyEmail'
    ]) expect(intake).toContain(token);
  });

  it('keeps the calling code on the left inside the same phone control', () => {
    expect(intake).toContain('dir="ltr"');
    expect(intake).toContain('phoneCountry');
    expect(intake).toContain('phoneLocal');
    expect(intake).toContain('border-r');
  });

  it('ships country and dialing-code choices including UAE', () => {
    expect(countries).toContain('["AE","+971"]');
    expect(countries).toContain('Intl.DisplayNames');
  });

  it('applies Sapphire interaction styling to the customer workspace', () => {
    expect(app).toContain('data-active-view={activeView}');
    expect(customerCss).toContain('main[data-active-view="customers"]');
    expect(customerCss).toContain('#0ea5e9');
  });
});

describe('dashboard personalization', () => {
  it('replaces cloud wording with the signed-in employee greeting and removes latency', () => {
    expect(dashboard).toContain('سحابة بيانات سبلندر المباشرة');
    expect(dashboard).toContain('مرحباً ${employeeName}');
    expect(dashboard).toContain('إجمالي السجلات:');
    expect(dashboard).toContain('زمن الاستجابة:');
    expect(dashboard).toContain("span.style.display = 'none'");
  });
});
