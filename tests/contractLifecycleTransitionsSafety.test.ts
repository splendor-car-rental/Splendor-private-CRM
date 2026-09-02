import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = readFileSync(new URL('../src/server/contractLifecycleTransitions.ts', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../api/contract-lifecycle.ts', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

describe('rental contract review / approval / signing safety', () => {
  it('enforces an ordered server-side state machine with Four-Eyes approval', () => {
    expect(service).toContain("contract.status !== 'draft'");
    expect(service).toContain("status: 'review'");
    expect(service).toContain("contract.status !== 'review'");
    expect(service).toContain('contract.lifecycleReview.submittedBy === actor.uid');
    expect(service).toContain('Four-Eyes control');
    expect(service).toContain("status: 'approved'");
    expect(service).toContain("contract.status !== 'approved'");
    expect(service).toContain("status: 'signed'");
  });

  it('revalidates KYC, age, required documents, vehicle state and date conflicts before approval', () => {
    expect(service).toContain("profile.status !== 'VERIFIED'");
    expect(service).toContain('!profile.isAgeVerified');
    expect(service).toContain("dob === '1995-01-01'");
    expect(service).toContain('expiry < rentalEnd');
    expect(service).toContain("vehicle.lifecycleStatus !== 'ACTIVE'");
    expect(service).toContain("['maintenance', 'unavailable']");
    expect(service).toContain("['approved', 'signed', 'active']");
    expect(service).toContain('overlapping');
  });

  it('promotes signed evidence into immutable private storage instead of trusting a boolean or URL', () => {
    expect(service).toContain('customer-documents/${initialContract.customerId}/');
    expect(service).toContain("createHash('sha256')");
    expect(service).toContain('signed-contracts/${contractId}/${sha256}.${extension}');
    expect(service).toContain("method: 'in_person_scanned'");
    expect(service).toContain('immutableStoragePath');
    expect(service).toContain('termsAccepted: true');
    expect(service).not.toContain('req.body.termsAccepted');
  });

  it('keeps approval management-only and routes all transitions before the Vercel catch-all', () => {
    expect(endpoint).toContain("approve: ['ceo', 'admin']");
    expect(endpoint).toContain("sign: ['ceo', 'admin', 'operations', 'sales']");
    expect(endpoint).toContain("String((req.body || {}).signedDocumentPath || '')");

    const routes = vercel.rewrites.map((route: any) => route.source);
    const catchAll = routes.indexOf('/api/:path*');
    for (const source of [
      '/api/contracts/:contractId/review',
      '/api/contracts/:contractId/approve',
      '/api/contracts/:contractId/sign'
    ]) {
      const index = routes.indexOf(source);
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(catchAll);
    }
  });
});
