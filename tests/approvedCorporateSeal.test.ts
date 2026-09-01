import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stampSource = readFileSync(new URL('../src/server/corporateDocumentStamp.ts', import.meta.url), 'utf8');
const sealSource = readFileSync(new URL('../public/assets/approved/splendor-official-seal.svg', import.meta.url), 'utf8');

describe('approved Splendor corporate seal', () => {
  it('ships a standalone static company-seal asset with the expected identity and no active/external payloads', () => {
    expect(sealSource.trim().startsWith('<svg')).toBe(true);
    expect(sealSource).toContain('SPLENDOR CAR RENTAL L.L.C.');
    expect(sealSource).toContain('سبلندر لتأجير السيارات');
    expect(sealSource).toContain('PRESTIGE BEYOND LIMITS');
    expect(sealSource).toContain('DUBAI');
    expect(sealSource).not.toMatch(/<script/i);
    expect(sealSource).not.toMatch(/<foreignObject/i);
    expect(sealSource).not.toMatch(/javascript:/i);
    expect(sealSource).not.toMatch(/(?:href|xlink:href)=["']https?:/i);

    expect(stampSource).toContain("splendor-official-seal.svg");
    expect(stampSource).toContain('data:image/svg+xml;base64');
    expect(stampSource).toContain('validateApprovedSealSvg');
    expect(stampSource).not.toContain('SPLENDOR_RED_STAMP_SVG');
  });

  it('fails closed if the approved seal is unavailable or invalid', () => {
    expect(stampSource).toContain('Refusing to render a generated or substitute seal.');
    expect(stampSource).toContain("join(process.cwd(), 'dist'");
    expect(stampSource).toContain("join(process.cwd(), 'public'");
    expect(stampSource).toContain('disallowed active or external content');
    expect(stampSource).toContain('expected company identity');
  });
});
