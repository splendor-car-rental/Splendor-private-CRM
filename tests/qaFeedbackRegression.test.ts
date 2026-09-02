import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const blocklist = readFileSync(new URL('../src/server/blocklist.ts', import.meta.url), 'utf8');
const blocklistUi = readFileSync(new URL('../src/components/views/SecurityBlocklistView.tsx', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../src/components/auth/AuthScreens.tsx', import.meta.url), 'utf8');
const tollParser = readFileSync(new URL('../src/server/tollFileParsers.ts', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

describe('operator QA regressions', () => {
  it('blocklist persists security state even when secondary audit needs recovery', () => {
    expect(blocklist).toContain("const AUDIT_RECOVERY_COLLECTION = 'security_audit_recovery'");
    expect(blocklist).toContain('entry committed but audit recovery persistence failed');
    expect(blocklist).toContain('A committed security block must never be reported');
  });

  it('supports people, companies and multiple reliable identifiers without fuzzy name matching', () => {
    for (const identifier of [
      'passport', 'emirates_id', 'driving_license', 'international_driving_permit',
      'trade_license', 'company_registration', 'tax_registration', 'phone', 'email'
    ]) expect(blocklist).toContain(`'${identifier}'`);
    expect(blocklist).toContain("export type BlocklistSubjectType = 'individual' | 'company'");
    expect(blocklist).toContain('identifiers.some(candidate');
    expect(blocklist).not.toContain('customerName ===');

    expect(blocklistUi).toContain('Individual / Tourist');
    expect(blocklistUi).toContain('Legal company name');
    expect(blocklistUi).toContain('Add identifier');
  });

  it('routes exact blocklist reads/writes to the hardened Vercel endpoint before the catch-all', () => {
    const routes = vercel.rewrites.map((route: any) => route.source);
    expect(routes.indexOf('/api/blocklist')).toBeGreaterThanOrEqual(0);
    expect(routes.indexOf('/api/blocklist')).toBeLessThan(routes.indexOf('/api/:path*'));
  });

  it('closes the blocklist form only after a successful API response and provides explicit confirmation', () => {
    const successIndex = blocklistUi.indexOf('if (!res.ok) throw new Error');
    const closeIndex = blocklistUi.indexOf('await onCreated();', successIndex);
    const toastIndex = blocklistUi.indexOf('Saved successfully', successIndex);
    expect(successIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeGreaterThan(successIndex);
    expect(toastIndex).toBeGreaterThan(closeIndex);
  });

  it('makes the login viewport wheel/touch-scrollable on short screens', () => {
    expect(auth).toContain('data-testid="login-scroll-viewport"');
    expect(auth).toContain('h-[100dvh] min-h-[100dvh] overflow-y-auto overscroll-y-contain');
    expect(auth).toContain('items-start sm:items-center');
  });

  it('uses flexible Salik column detection instead of requiring one exact Trips Report layout', () => {
    expect(tollParser).toContain('statement layout was parsed by flexible column detection');
    expect(tollParser).toContain("'transaction date'");
    expect(tollParser).toContain("'رقم اللوحة'");
    expect(tollParser).toContain("'المبلغ'");
    expect(tollParser).toContain('parseGenericGrid(grid, \'Salik\')');
  });

  it('fails legacy XLS safely with actionable guidance rather than parsing it with vulnerable SheetJS', () => {
    expect(tollParser).toContain('Legacy .xls format is not supported by the hardened importer');
    expect(tollParser).toContain('export the Salik statement as .xlsx');
    expect(tollParser).not.toContain("from 'xlsx'");
  });
});
