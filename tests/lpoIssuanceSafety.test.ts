import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = readFileSync(new URL('../src/server/contextualDocumentService.ts', import.meta.url), 'utf8');
const numbering = readFileSync(new URL('../src/server/idGenerator.ts', import.meta.url), 'utf8');
const apiHandler = readFileSync(new URL('../api/handler.ts', import.meta.url), 'utf8');

describe('official LPO issuance safety', () => {
  it('uses only the durable authoritative purchase_orders collection', () => {
    expect(service).toContain("requiredDoc('purchase_orders', source.id)");
    expect(service).not.toContain("['purchase_orders', 'purchaseOrders', 'lpo']");
    expect(service).toContain('po.lineItems');
  });

  it('never consumes the official LPO sequence during preview', () => {
    expect(service).toContain("const serial = 'PREVIEW-LPO'");
    expect(service).toContain("['account_statement', 'payment_demand', 'lpo']");
    expect(service).toContain("if (kind === 'lpo') return issueNextNumber('LPO')");
    expect(numbering).toContain("lpo: { prefix: 'LPO-SCR-', digits: 6 }");
  });

  it('requires recorded server-side PO approval inside the same transaction that acquires the issue lock', () => {
    expect(service).toContain('LPO_ISSUABLE_PO_STATUSES');
    expect(service).toContain('!po?.approvedBy || !po?.approvedAt');
    const approvalRead = service.indexOf("const poSnap = await tx.get(poRef)");
    const approvalGuard = service.indexOf('assertPurchaseOrderIssuableAsLpo(lpoPurchaseOrder)', approvalRead);
    const lockWrite = service.indexOf('tx.set(ref, {', approvalGuard);
    expect(approvalRead).toBeGreaterThan(-1);
    expect(approvalGuard).toBeGreaterThan(approvalRead);
    expect(lockWrite).toBeGreaterThan(approvalGuard);
  });

  it('archives from the exact PO snapshot captured by the issuance-lock transaction', () => {
    expect(service).toContain('reservation.lpoPurchaseOrder');
    expect(service).toContain('hydratePurchaseOrderRecord(reservation.lpoPurchaseOrder)');
    expect(service).toContain('sourceSnapshot: { purchaseOrder: po }');
  });

  it('blocks the legacy browser-supplied generic LPO issuance path', () => {
    expect(apiHandler).toContain("if (body.kind === 'lpo')");
    expect(apiHandler).toContain('LPO cannot be issued from browser-supplied document values');
  });

  it('preserves Purchase Order numbering separately from official LPO numbering', () => {
    expect(numbering).toContain("purchaseorder: { prefix: 'PO-SCR-', digits: 3, startAt: 100 }");
    expect(numbering).toContain("lpo: { prefix: 'LPO-SCR-', digits: 6 }");
  });
});
