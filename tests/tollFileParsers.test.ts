/**
 * Toll File Parser Regression Suite (Phase 11)
 * =============================================
 *
 * Written BEFORE migrating src/server/tollFileParsers.ts off the
 * vulnerable `xlsx`@0.18.5 package (Prototype Pollution + ReDoS, no fixed
 * version published to npm -- see that migration's commit for the full
 * writeup), specifically so it can prove behavioral equivalence: every
 * case here passes against the CURRENT xlsx-based implementation
 * (establishing the baseline) and must keep passing, byte-for-byte
 * identically, against the new read-excel-file-based implementation.
 *
 * `xlsx` itself is kept as a devDependency purely to BUILD these test
 * fixtures (constructing trusted .xlsx byte buffers is a legitimate,
 * safe use of the library -- the vulnerabilities are in PARSING
 * untrusted input, which this file never does with it). It is removed
 * from production `dependencies` entirely; parseSalikExcel/
 * parseGenericTollExcel -- the functions that parse a file a staff member
 * uploads -- no longer import it at all.
 */

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSalikExcel, parseGenericTollExcel } from '../src/server/tollFileParsers';

function bufferFromAoa(aoa: any[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const VALID_SALIK_AOA = [
  ['Salik Trips Report'],
  ['Account No: 123456'],
  ['Trip(s) From 01-01-2026 To 02-01-2026'],
  ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount'],
  ['TXN001', '01-Jan-2026', '10:00:00 AM', 'Al Garhoud Bridge', 'Dubai', 'TAG001', 'A 12345', '4'],
  ['TXN002', '02-Jan-2026', '11:00:00 AM', 'Al Maktoum Bridge', 'Sharjah', 'TAG002', 'B 67890', '4']
];

describe('parseSalikExcel -- valid Salik "Trips Report" export', () => {
  it('parses account number and period from the header block', async () => {
    const result = await parseSalikExcel(bufferFromAoa(VALID_SALIK_AOA));
    expect(result.meta.accountNumber).toBe('123456');
  });

  it('parses every transaction row with the correct field mapping', async () => {
    const result = await parseSalikExcel(bufferFromAoa(VALID_SALIK_AOA));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      date: '2026-01-01',
      time: '10:00:00 AM',
      locationName: 'Al Garhoud Bridge',
      direction: 'To Dubai',
      tagNumber: 'TAG001',
      plateNumber: 'A 12345',
      transactionRef: 'TXN001',
      actualCompanyCost: 4
    });
    expect(result.rows[1]).toMatchObject({
      date: '2026-01-02',
      plateNumber: 'B 67890',
      actualCompanyCost: 4
    });
    expect(result.warnings).toHaveLength(0);
  });

  it('parses dates in "D-Mon-YYYY" and "DD Mon YYYY" forms identically', async () => {
    const aoa = [
      ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount'],
      ['TXN010', '5-Mar-2026', '09:00:00 AM', 'Gate A', 'Dubai', 'TAG010', 'C 11111', '5'],
      ['TXN011', '15 March 2026', '09:00:00 AM', 'Gate A', 'Dubai', 'TAG011', 'C 22222', '5']
    ];
    const result = await parseSalikExcel(bufferFromAoa(aoa));
    expect(result.rows[0].date).toBe('2026-03-05');
    expect(result.rows[1].date).toBe('2026-03-15');
  });

  it('reads a genuine Excel date-formatted cell (JS Date, not a string) the same as a text date', async () => {
    // Simulates a Trip Date column formatted as an actual Excel date type
    // (which XLSX.utils.sheet_to_json({raw:false}) renders as a locale
    // date string, and read-excel-file returns as a JS Date object) --
    // the two libraries expose this differently, so this is the case most
    // at risk of silently changing behavior across the migration.
    const aoa = [
      ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount'],
      ['TXN020', new Date(Date.UTC(2026, 5, 20)), '09:00:00 AM', 'Gate B', 'Dubai', 'TAG020', 'D 33333', '6']
    ];
    const result = await parseSalikExcel(bufferFromAoa(aoa));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].date).toBe('2026-06-20');
  });

  it('handles a large-but-valid file (500 rows) without error', async () => {
    const header = ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount'];
    const rows = Array.from({ length: 500 }, (_, i) => [
      `TXN${String(i).padStart(4, '0')}`, '10-Feb-2026', '08:00:00 AM', 'Gate X', 'Dubai', `TAG${i}`, `E ${10000 + i}`, '4'
    ]);
    const result = await parseSalikExcel(bufferFromAoa([header, ...rows]));
    expect(result.rows).toHaveLength(500);
    expect(result.rows[499].transactionRef).toBe('TXN0499');
  });

  it('skips blank rows between transaction rows', async () => {
    const aoa = [
      ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount'],
      ['TXN030', '01-Jan-2026', '10:00:00 AM', 'Gate C', 'Dubai', 'TAG030', 'F 44444', '4'],
      ['', '', '', '', '', '', '', ''],
      ['TXN031', '02-Jan-2026', '10:00:00 AM', 'Gate C', 'Dubai', 'TAG031', 'F 55555', '4']
    ];
    const result = await parseSalikExcel(bufferFromAoa(aoa));
    expect(result.rows).toHaveLength(2);
  });

  it('warns but does not throw when the Amount column is missing', async () => {
    const aoa = [
      ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate'],
      ['TXN040', '01-Jan-2026', '10:00:00 AM', 'Gate D', 'Dubai', 'TAG040', 'G 66666']
    ];
    const result = await parseSalikExcel(bufferFromAoa(aoa));
    expect(result.rows[0].actualCompanyCost).toBe(0);
    expect(result.warnings.some(w => /Amount/i.test(w))).toBe(true);
  });

  it('throws a controlled error when the file is not a Salik "Trips Report" export', async () => {
    const aoa = [['This', 'Is', 'Not', 'A', 'Salik', 'Export'], ['foo', 'bar', 'baz', 1, 2, 3]];
    await expect(parseSalikExcel(bufferFromAoa(aoa))).rejects.toThrow(/does not look like a Salik/i);
  });

  it('throws a controlled error on a header-only file with zero data rows under a valid header', async () => {
    const aoa = [['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount']];
    const result = await parseSalikExcel(bufferFromAoa(aoa));
    expect(result.rows).toHaveLength(0);
    expect(result.warnings.some(w => /No transaction rows/i.test(w))).toBe(true);
  });

  it('throws (rather than crashing uncontrolled) on a genuinely empty workbook', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    await expect(parseSalikExcel(buf)).rejects.toThrow();
  });
});

describe('parseGenericTollExcel -- generic Date/Amount column detection (Darb fallback)', () => {
  it('parses rows using best-effort header keyword matching', async () => {
    const aoa = [
      ['Date', 'Location', 'Plate', 'Tag', 'Amount'],
      ['15-Feb-2026', 'Sheikh Zayed Road Gate', 'H 77777', 'DTAG001', '5']
    ];
    const result = await parseGenericTollExcel(bufferFromAoa(aoa));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      date: '2026-02-15',
      locationName: 'Sheikh Zayed Road Gate',
      plateNumber: 'H 77777',
      tagNumber: 'DTAG001',
      actualCompanyCost: 5
    });
  });

  it('warns when plate/location columns are absent but still returns the rows it could parse', async () => {
    const aoa = [
      ['Date', 'Amount'],
      ['15-Feb-2026', '5']
    ];
    const result = await parseGenericTollExcel(bufferFromAoa(aoa));
    expect(result.rows).toHaveLength(1);
    expect(result.warnings.some(w => /plate/i.test(w))).toBe(true);
    expect(result.warnings.some(w => /location/i.test(w))).toBe(true);
  });

  it('throws a controlled error when no Date+Amount header can be detected', async () => {
    const aoa = [['Foo', 'Bar', 'Baz'], [1, 2, 3]];
    await expect(parseGenericTollExcel(bufferFromAoa(aoa))).rejects.toThrow(/Could not detect a header row/i);
  });
});
