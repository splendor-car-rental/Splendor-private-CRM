/**
 * Legacy .xls (BIFF8/OLE2) reader regression suite.
 *
 * Salik's own portal export can still be a genuine legacy .xls file, which
 * read-excel-file (the library tollFileParsers.ts uses for everything else)
 * cannot read at all -- it only understands modern .xlsx (OOXML). Rather
 * than pull in `xlsx`/SheetJS to fill that gap (its last npm-published
 * version carries unpatched Prototype Pollution and ReDoS advisories --
 * see the comment at the top of tollFileParsers.ts and legacyXlsReader.ts),
 * legacyXlsReader.ts implements a narrow, dependency-free BIFF8 reader.
 *
 * `xlsx` is used here ONLY as a devDependency to BUILD trusted legacy .xls
 * test fixtures (bookType: 'biff8') -- the same safe-use pattern already
 * established in tollFileParsers.test.ts for building .xlsx fixtures. This
 * file never uses `xlsx` to parse anything.
 */

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readLegacyXlsGrid, LegacyXlsError } from '../src/server/legacyXlsReader';
import { parseSalikExcel } from '../src/server/tollFileParsers';

function legacyXlsFromAoa(aoa: any[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }) as Buffer;
}

describe('readLegacyXlsGrid -- narrow, dependency-free BIFF8 reader', () => {
  it('reads plain text and numeric cells from a real legacy .xls buffer', () => {
    const buf = legacyXlsFromAoa([
      ['Transaction ID', 'Toll Gate', 'Total Amount'],
      ['TXN001', 'Al Garhoud Bridge', 4],
      ['TXN002', 'Al Maktoum Bridge', 4.5]
    ]);
    const grid = readLegacyXlsGrid(buf);
    expect(grid[0]).toEqual(['Transaction ID', 'Toll Gate', 'Total Amount']);
    expect(grid[1][0]).toBe('TXN001');
    expect(grid[1][1]).toBe('Al Garhoud Bridge');
    expect(Number(grid[1][2])).toBe(4);
    expect(Number(grid[2][2])).toBe(4.5);
  });

  it('correctly decodes non-Latin (Arabic) text via the uncompressed-unicode SST path', () => {
    const buf = legacyXlsFromAoa([
      ['Toll Gate', 'Amount'],
      ['بوابة الجرهود', 4],
      ['جسر مكتوم', 5]
    ]);
    const grid = readLegacyXlsGrid(buf);
    expect(grid[1][0]).toBe('بوابة الجرهود');
    expect(grid[2][0]).toBe('جسر مكتوم');
  });

  it('handles many repeated and unique strings (SST large enough to matter)', () => {
    const header = ['Transaction ID', 'Toll Gate', 'Total Amount'];
    const rows = Array.from({ length: 300 }, (_, i) => [`TXN${i}`, `Gate ${i % 7}`, 4]);
    const buf = legacyXlsFromAoa([header, ...rows]);
    const grid = readLegacyXlsGrid(buf);
    expect(grid).toHaveLength(301);
    expect(grid[1][0]).toBe('TXN0');
    expect(grid[300][0]).toBe('TXN299');
    expect(grid[300][1]).toBe('Gate ' + (299 % 7));
  });

  it('rejects a buffer that is not a real OLE2 container', () => {
    expect(() => readLegacyXlsGrid(Buffer.from('not a real xls file at all'))).toThrow(LegacyXlsError);
  });

  it('rejects a truncated/corrupt OLE2 header rather than returning wrong data', () => {
    const buf = legacyXlsFromAoa([['a', 'b']]);
    const truncated = buf.subarray(0, 300);
    expect(() => readLegacyXlsGrid(truncated)).toThrow();
  });

  it('feeds correctly into parseSalikExcel end-to-end for a genuine legacy .xls upload', async () => {
    const aoa = [
      ['Salik Trips Report'],
      ['Account No: 654321'],
      ['Trip(s) From 01-01-2026 To 02-01-2026'],
      ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount'],
      ['TXN100', '01-Jan-2026', '10:00:00 AM', 'Al Garhoud Bridge', 'Dubai', 'TAG100', 'A 99999', '4']
    ];
    const buf = legacyXlsFromAoa(aoa);
    const result = await parseSalikExcel(buf);
    expect(result.meta.accountNumber).toBe('654321');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      date: '2026-01-01',
      locationName: 'Al Garhoud Bridge',
      plateNumber: 'A 99999',
      actualCompanyCost: 4
    });
  });
});
