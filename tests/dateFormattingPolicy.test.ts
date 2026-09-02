import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDate, formatDateLocalized } from '../src/lib/dateFormat';

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

describe('human-facing date formatting policy', () => {
  it('formats date-only values as DD/MM/YYYY without timezone shifting', () => {
    expect(formatDate('2026-09-03')).toBe('03/09/2026');
    expect(formatDate('2024-02-29')).toBe('29/02/2024');
    expect(formatDate('2026-02-29')).toBe('');
    expect(formatDateLocalized('2026-09-03', true)).toBe('03 سبتمبر 2026');
  });

  it('keeps direct locale-dependent date rendering out of UI components', () => {
    const root = join(process.cwd(), 'src', 'components');
    const violations: string[] = [];
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, 'utf8');
      if (/\.toLocaleDateString\s*\(/.test(source)) violations.push(`${relative(process.cwd(), file)}: toLocaleDateString`);
      if (/Intl\.DateTimeFormat\s*\(/.test(source)) violations.push(`${relative(process.cwd(), file)}: Intl.DateTimeFormat`);
      if (/\.toDateString\s*\(/.test(source)) violations.push(`${relative(process.cwd(), file)}: toDateString`);
    }
    expect(violations, `Use src/lib/dateFormat.ts for human-facing dates:\n${violations.join('\n')}`).toEqual([]);
  });
});
