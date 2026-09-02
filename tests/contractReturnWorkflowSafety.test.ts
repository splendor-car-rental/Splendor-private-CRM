import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = readFileSync(new URL('../src/server/contractReturnWorkflow.ts', import.meta.url), 'utf8');
const handler = readFileSync(new URL('../api/handler.ts', import.meta.url), 'utf8');

describe('contract return workflow safety', () => {
  it('does not free the vehicle at physical return intake', () => {
    expect(service).toContain("inspection.type !== 'return' || inspection.status !== 'completed'");
    expect(service).toContain("status: 'settlement_pending'");
    expect(service).toContain("status: 'unavailable'");
    expect(service).toContain('Return odometer cannot be below the handover odometer.');
    expect(service).toContain("damage?.liabilityStatus === 'pending_review'");
  });

  it('requires authoritative financial closure before marking completed/available', () => {
    expect(service).toContain("firestore.collection('invoices').where('contractId', '==', contract.id)");
    expect(service).toContain("firestore.collection('charges').where('relatedContractId', '==', contract.id)");
    expect(service).toContain('Contract cannot be closed until a final invoice exists.');
    expect(service).toContain('still has an outstanding balance.');
    expect(service).toContain('Approved charges still require settlement confirmation');
    expect(service).toContain("status: 'completed'");
    expect(service).toContain("status: 'available'");
  });

  it('requires an explicit finance settlement reference instead of trusting browser totals', () => {
    expect(service).toContain('A settlementReference is required to close the contract.');
    expect(service).not.toContain('totalAdditionalCharges');
    expect(service).not.toContain('finalSettlementBalance');
  });

  it('intercepts both return phases at the production API boundary before legacy Express delegation', () => {
    const settleRoute = handler.indexOf("const returnSettlementMatch = req.path.match(/^\\/api\\/contracts\\/([^/]+)\\/return\\/settle$/)");
    const returnRoute = handler.indexOf("const returnMatch = req.path.match(/^\\/api\\/contracts\\/([^/]+)\\/return$/)");
    const legacyDelegate = handler.lastIndexOf('return app(req, res)');

    expect(settleRoute).toBeGreaterThan(-1);
    expect(returnRoute).toBeGreaterThan(settleRoute);
    expect(legacyDelegate).toBeGreaterThan(returnRoute);
    expect(handler).toContain('beginContractReturn(contractId, inspectionId, actor)');
    expect(handler).toContain('settleContractReturn(contractId, {');
    expect(handler).toContain("const RETURN_SETTLEMENT_ROLES = ['ceo', 'admin', 'finance']");
  });
});
