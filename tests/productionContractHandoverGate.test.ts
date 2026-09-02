import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const handler = readFileSync(new URL('../api/handler.ts', import.meta.url), 'utf8');
const contractOps = readFileSync(new URL('../src/server/contractOps.ts', import.meta.url), 'utf8');
const reservationDraft = readFileSync(new URL('../src/server/reservationContractDraft.ts', import.meta.url), 'utf8');
const kycEngine = readFileSync(new URL('../src/server/kycEngine.ts', import.meta.url), 'utf8');

describe('production rental lifecycle safety invariants', () => {
  it('creates contracts as non-operative drafts regardless of caller-supplied status', () => {
    expect(contractOps).toContain("status: 'draft'");
    expect(contractOps).toContain("depositStatus: 'pending'");
    expect(contractOps).toContain('termsAccepted: false');
    expect(contractOps).toContain('const vehicleUpdate: Record<string, never> = {}');
    expect(contractOps).toContain('const customerUpdate: Record<string, never> = {}');
    expect(contractOps).not.toContain("const status = (input.status || 'active')");
  });

  it('uses handover as the one authoritative totalRentals increment across both contract entry paths', () => {
    expect(contractOps).not.toMatch(/totalRentals\s*:/);
    expect(reservationDraft).not.toMatch(/totalRentals\s*:/);
    const increments = handler.match(/totalRentals:\s*Number\(customer\.totalRentals\s*\|\|\s*0\)\s*\+\s*1/g) || [];
    expect(increments).toHaveLength(1);
    expect(handler).toContain("if (contract.status !== 'signed')");
    expect(handler).toContain("status: 'active', handover: handoverDetails");
  });

  it('does not manufacture a date of birth or mark unknown age as verified', () => {
    expect(kycEngine).toContain("const verifiedDob = customer.dateOfBirth ? String(customer.dateOfBirth) : ''");
    expect(kycEngine).toContain('isAgeVerified: Boolean(verifiedDob)');
    expect(kycEngine).toContain("reasons.push('Customer date of birth has not been verified. Age eligibility cannot be established.')");
    expect(kycEngine).not.toContain("customer.dateOfBirth || '1995-01-01'");
  });

  it('intercepts production handover before the legacy Express route and enforces all critical gates atomically', () => {
    const matchIndex = handler.indexOf("const handoverMatch = req.path.match(/^\\/api\\/contracts\\/([^/]+)\\/handover$/)");
    const delegateIndex = handler.lastIndexOf('return app(req, res)');
    expect(matchIndex).toBeGreaterThan(-1);
    expect(delegateIndex).toBeGreaterThan(matchIndex);

    expect(handler).toContain('await firestore.runTransaction(async tx =>');
    expect(handler).toContain("contract.status !== 'signed'");
    expect(handler).toContain('contract.termsAccepted !== true');
    expect(handler).toContain("profile.status !== 'VERIFIED'");
    expect(handler).toContain('!profile.isAgeVerified');
    expect(handler).toContain("dob === '1995-01-01'");
    expect(handler).toContain("firestore.collection('deposits').where('customerId', '==', contract.customerId)");
    expect(handler).toContain('deposit.contractId && deposit.contractId !== contract.id');
    expect(handler).toContain('heldDeposit + 0.005 < requiredDeposit');
    expect(handler).toContain('customerSignatureUrl');
    expect(handler).toContain('employeeSignatureUrl');
    expect(handler).toContain("firestore.collection('contracts').where('vehicleId', '==', contract.vehicleId)");
    expect(handler).toContain("status: 'rented'");
    expect(handler).toContain("status: 'active'");
  });
});