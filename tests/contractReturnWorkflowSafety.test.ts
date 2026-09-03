import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = readFileSync(new URL('../src/server/contractReturnWorkflow.ts', import.meta.url), 'utf8');
const handler = readFileSync(new URL('../src/server/vercelAppHandler.ts', import.meta.url), 'utf8');

describe('contract return workflow safety', () => {
  it('does not free the vehicle at physical return intake', () => {
    expect(service).toContain("inspection.type !== 'return' || inspection.status !== 'completed'");
    expect(service).toContain("status: 'settlement_pending'");
    expect(service).toContain("status: 'unavailable'");
    expect(service).toContain('Return odometer cannot be below the handover odometer.');
    expect(service).toContain("damage?.liabilityStatus === 'pending_review'");
  });

  it('reconstructs invoice settlement from posted accounting evidence instead of trusting balanceDue', () => {
    expect(service).toContain("deterministicJournalId('Invoice', invoice.id, 'issue')");
    expect(service).toContain("sourceType: 'Invoice', sourceId: invoice.id, sourceAction: 'issue'");
    expect(service).toContain("payment.verificationStatus !== 'verified' && !trustedGateway");
    expect(service).toContain("payment.accountingPostingStatus !== 'posted'");
    expect(service).toContain("sourceType: 'Payment', sourceId: payment.id, sourceAction: 'receive'");
    expect(service).toContain('Payment ${payment.id} allocations exceed its posted AR credit');
    expect(service).toContain('according to posted accounting evidence');
    expect(service).not.toContain('Number(invoice.balanceDue || 0) > 0.001');
  });

  it('does not accept browser-selected charge ids as financial proof', () => {
    expect(service).toContain('Charge ids supplied by the browser are not settlement evidence.');
    expect(service).not.toContain('explicitlySettled.has');
    expect(service).not.toContain("settledAt: now,\n        settledBy: actor.uid,\n        settledByName: actor.name,\n        settlementReference");
  });

  it('requires fully journal-backed deposit settlement for approved charges', () => {
    expect(service).toContain("charge.accountingPostingStatus !== 'posted'");
    expect(service).toContain('depositAppliedAmount');
    expect(service).toContain('depositAllocations');
    expect(service).toContain('!charge.deductedFromDepositId');
    expect(service).toContain("sourceType: 'AdditionalCharge', sourceId: charge.id, sourceAction: 'approve'");
    expect(service).toContain("sourceType: 'Deposit', sourceId: deposit.id, sourceAction: 'receive'");
    expect(service).toContain('sourceActionPrefix: `apply:${charge.id}:`');
    expect(service).toContain('does not support its recorded amount');
  });

  it('requires an explicit closure reference only as a memo, never as payment evidence', () => {
    expect(service).toContain('A settlementReference is required to close the contract.');
    expect(service).toContain("policy: 'ledger_backed_v1'");
    expect(service).not.toContain('totalAdditionalCharges');
    expect(service).not.toContain('finalSettlementBalance');
  });

  it('releases vehicle only after all ledger validation and never shadow-settles charges in cache', () => {
    const validationMarker = service.indexOf('// All reads and evidence validation are complete. Only now may the');
    const availableWrite = service.indexOf("status: 'available'", validationMarker);
    expect(validationMarker).toBeGreaterThan(-1);
    expect(availableWrite).toBeGreaterThan(validationMarker);
    expect(service).toContain("status: 'completed'");
    expect(handler).not.toContain('Object.assign(charge as any');
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
