import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('owner-approved business policy regressions', () => {
  it('does not invent Silver/Gold/Platinum spend tiers or automatic customer discounts', () => {
    const source = read('src/components/views/VipTierManagementView.tsx');
    expect(source).toContain("'STANDARD'");
    expect(source).toContain("'VIP'");
    expect(source).toContain("'CORPORATE'");
    expect(source).toContain("'BLOCKED'");
    expect(source).not.toMatch(/minSpend\s*:/);
    expect(source).not.toMatch(/discountPercent\s*:/);
    expect(source).not.toMatch(/SILVER|GOLD|PLATINUM|DIAMOND|BLACK/);
  });

  it('keeps corporate customer onboarding explicitly no-credit and removes invented branch addresses', () => {
    const directory = read('src/components/views/CorporateAccountsDirectoryView.tsx');
    const api = read('api/corporate-accounts-safe.ts');
    const app = read('src/App.tsx');

    expect(directory).toContain("creditLimitAed: 0");
    expect(directory).toContain("paymentTermsDays: 0");
    expect(directory).toContain("branchId: 'COMPANY_WIDE'");
    expect(directory).not.toContain('Sheikh Zayed Road');
    expect(directory).not.toContain('Dubai Design District');
    expect(directory).not.toContain('Al Maryah Island');
    expect(directory.match(/trnVatNumber/g)?.length || 0).toBeGreaterThan(0);

    expect(api).toContain('creditLimitAed: 0');
    expect(api).toContain('usedExposureAed: 0');
    expect(api).toContain('paymentTermsDays: 0');
    expect(api).toContain("status: 'active'");
    expect(app).toContain('<CorporateAccountsDirectoryView />');
    expect(app).not.toContain('<CorporateBranchPortalView />');
  });

  it('routes corporate account writes through the authoritative no-credit Vercel function', () => {
    const vercel = read('vercel.json');
    expect(vercel).toContain('/api/corporate-accounts-safe?accountId=:accountId');
    expect(vercel).toContain('/api/corporate-accounts-safe');
  });

  it('contains no simulated GPS locations in the live fleet screen and fails closed until Etqan is configured', () => {
    const view = read('src/components/views/LiveFleetTelematicsMapView.tsx');
    const provider = read('api/telematics-provider.ts');

    expect(view).toContain("apiFetch('/api/telematics/live'");
    expect(view).not.toMatch(/Burj Khalifa|Palm Jumeirah|Dubai Marina|JBR|Business Bay/);
    expect(view).not.toMatch(/Math\.random\(\)/);
    expect(provider).toContain('ETQAN_API_BASE_URL');
    expect(provider).toContain('ETQAN_API_TOKEN');
    expect(provider).toContain('missingConfiguration');
    expect(provider).toContain("res.status(503)");
    expect(provider).not.toMatch(/VITE_ETQAN/);
  });

  it('keeps contract actions inside the viewport across compact layouts', () => {
    const css = read('src/index.css');
    expect(css).toContain('main[data-active-view="contracts"]');
    expect(css).toContain('flex-wrap: wrap !important');
    expect(css).toContain('overflow-wrap: anywhere');
  });

  it('keeps shared date rendering day-first', () => {
    const dateFormatter = read('src/lib/dateFormat.ts');
    expect(dateFormatter).toContain('`${day}/${month}/${year}`');
  });
});
