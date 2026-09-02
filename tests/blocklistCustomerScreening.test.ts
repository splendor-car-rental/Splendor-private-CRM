import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const guard = readFileSync(new URL('../api/customers-guard.ts', import.meta.url), 'utf8');
const blocklist = readFileSync(new URL('../src/server/blocklist.ts', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

describe('customer blocklist screening gate', () => {
  it('screens every reliable identifier carried by customer onboarding', () => {
    for (const expected of [
      "'emirates_id'", "'passport'", "'gcc_id'", "'national_id'",
      "'driving_license'", "'international_driving_permit'", "'email'", "'phone'",
      "'trade_license'", "'company_registration'", "'tax_registration'"
    ]) expect(guard).toContain(expected);
    expect(guard).toContain('custom.identityIssuedBy');
    expect(guard).toContain('custom.tradeLicenseNumber');
    expect(guard).toContain('custom.taxRegistrationNumber');
  });

  it('never uses the customer name as an automatic security match key', () => {
    expect(guard).toContain('Name is intentionally absent');
    expect(guard).not.toContain("addCandidate(candidates, 'name'");
    expect(blocklist).not.toContain('customerName ===');
  });

  it('fails closed for both full and conditional active blocks', () => {
    expect(guard).toContain("match.tier === 'full'");
    expect(guard).toContain('res.status(403)');
    expect(guard).toContain('res.status(409)');
    expect(guard).toContain('Security screening could not be completed. Customer was not created.');
  });

  it('delegates to the existing authoritative customer creator only after screening', () => {
    const screeningIndex = guard.indexOf('const candidates = blocklistCandidatesFromCustomerPayload');
    const delegationIndex = guard.indexOf('return delegateToAuthoritativeCustomersRoute(req, res);', screeningIndex);
    expect(screeningIndex).toBeGreaterThan(-1);
    expect(delegationIndex).toBeGreaterThan(screeningIndex);
    expect(guard).toContain("req.url = '/api/customers'");
  });

  it('routes the exact customer collection endpoint through the guard before the API catch-all', () => {
    const routes = vercel.rewrites.map((route: any) => route.source);
    const guarded = routes.indexOf('/api/customers');
    const catchAll = routes.indexOf('/api/:path*');
    expect(guarded).toBeGreaterThan(-1);
    expect(guarded).toBeLessThan(catchAll);
  });
});
