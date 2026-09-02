import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const rail = readFileSync(new URL('../src/components/documents/ProcurementLpoRail.tsx', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../src/components/documents/WorkflowDocumentPreviewButton.tsx', import.meta.url), 'utf8');

describe('Procurement LPO workflow UI', () => {
  it('renders the LPO workflow only in procurement views', () => {
    expect(app).toContain("new Set(['procurement', 'purchase-orders', 'lpo', 'supply-orders'])");
    expect(app).toContain('PROCUREMENT_VIEWS.has(activeView) && <ProcurementLpoRail />');
  });

  it('binds preview/issue to a persisted purchase-order id rather than browser document values', () => {
    expect(rail).toContain("apiFetch('/api/purchase-orders')");
    expect(rail).toContain("source={{ type: 'purchase_order', id: selected.id }}");
    expect(rail).toContain('kind="lpo"');
  });

  it('keeps issue unavailable in the UI until the PO has server approval evidence', () => {
    expect(rail).toContain('ISSUABLE_STATUSES.has(selected.status)');
    expect(rail).toContain('selected.approvedBy && selected.approvedAt');
    expect(rail).toContain('canIssue={canIssue}');
    expect(preview).toContain('!issued && canIssue');
  });
});
