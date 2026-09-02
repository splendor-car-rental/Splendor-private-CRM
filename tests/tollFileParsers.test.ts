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

describe('parseSalikExcel', () => {
  it('preserves the precise official Trips Report mapping', async () => {
    const result = await parseSalikExcel(bufferFromAoa(VALID_SALIK_AOA));
    expect(result.meta.accountNumber).toBe('123456');
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
    expect(result.warnings).toHaveLength(0);
  });

  it('parses D-Mon-YYYY, long-month and genuine Excel Date cells', async () => {
    const aoa = [
      ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount'],
      ['TXN010', '5-Mar-2026', '09:00:00 AM', 'Gate A', 'Dubai', 'TAG010', 'C 11111', '5'],
      ['TXN011', '15 March 2026', '09:00:00 AM', 'Gate A', 'Dubai', 'TAG011', 'C 22222', '5'],
      ['TXN012', new Date(Date.UTC(2026, 5, 20)), '09:00:00 AM', 'Gate B', 'Dubai', 'TAG012', 'D 33333', '6']
    ];
    const result = await parseSalikExcel(bufferFromAoa(aoa));
    expect(result.rows.map(row => row.date)).toEqual(['2026-03-05', '2026-03-15', '2026-06-20']);
  });

  it('parses common UAE dd/mm/yyyy without swapping day and month', async () => {
    const aoa = [
      ['Transaction ID', 'Trip Date', 'Toll Gate', 'Plate', 'Total Amount'],
      ['TXN013', '31/08/2026', 'Gate C', 'E 44444', '4']
    ];
    const result = await parseSalikExcel(bufferFromAoa(aoa));
    expect(result.rows[0].date).toBe('2026-08-31');
  });

  it('accepts a valid Salik workbook with a non-Trips-Report column layout', async () => {
    const aoa = [
      ['Salik Statement'],
      ['Transaction Date', 'Transaction Time', 'Gate', 'Plate Number', 'Tag', 'Amount', 'Reference'],
      ['31/08/2026', '08:15 AM', 'Al Safa North', 'J 48175', 'TAG-77', 'AED 4.00', 'REF-1'],
      ['01/09/2026', '09:00 AM', 'Al Barsha', 'J 48175', 'TAG-77', '4.00', 'REF-2']
    ];
    const result = await parseSalikExcel(bufferFromAoa(aoa));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      date: '2026-08-31',
      locationName: 'Al Safa North',
      plateNumber: 'J 48175',
      transactionRef: 'REF-1',
      actualCompanyCost: 4
    });
    expect(result.warnings.some(w => /flexible column detection/i.test(w))).toBe(true);
  });

  it('accepts Arabic Date/Amount/Plate/Gate headers in flexible layouts', async () => {
    const aoa = [
      ['تاريخ المعاملة', 'الموقع', 'رقم اللوحة', 'المبلغ'],
      ['31/08/2026', 'بوابة الصفا', 'J 48175', '4']
    ];
    const result = await parseSalikExcel(bufferFromAoa(aoa));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ date: '2026-08-31', locationName: 'بوابة الصفا', plateNumber: 'J 48175', actualCompanyCost: 4 });
  });

  it('handles large valid files and skips blank rows', async () => {
    const header = ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount'];
    const rows = Array.from({ length: 500 }, (_, i) => [`TXN${String(i).padStart(4, '0')}`, '10-Feb-2026', '08:00:00 AM', 'Gate X', 'Dubai', `TAG${i}`, `E ${10000 + i}`, '4']);
    rows.splice(200, 0, ['', '', '', '', '', '', '', '']);
    const result = await parseSalikExcel(bufferFromAoa([header, ...rows]));
    expect(result.rows).toHaveLength(500);
    expect(result.rows[499].transactionRef).toBe('TXN0499');
  });

  it('warns but still previews a precise Trips Report whose amount column is missing', async () => {
    const aoa = [
      ['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate'],
      ['TXN040', '01-Jan-2026', '10:00:00 AM', 'Gate D', 'Dubai', 'TAG040', 'G 66666']
    ];
    const result = await parseSalikExcel(bufferFromAoa(aoa));
    expect(result.rows[0].actualCompanyCost).toBe(0);
    expect(result.warnings.some(w => /Amount/i.test(w))).toBe(true);
  });

  it('rejects arbitrary workbooks that contain no credible Date+Amount transaction table', async () => {
    const aoa = [['This', 'Is', 'Not', 'A', 'Toll', 'Export'], ['foo', 'bar', 'baz', 1, 2, 3]];
    await expect(parseSalikExcel(bufferFromAoa(aoa))).rejects.toThrow(/Could not detect a transaction table/i);
  });

  it('rejects a transaction header with zero valid data rows instead of pretending the import succeeded', async () => {
    const aoa = [['Transaction ID', 'Trip Date', 'Trip Time', 'Toll Gate', 'Direction', 'Tag Number', 'Plate', 'Total Amount']];
    await expect(parseSalikExcel(bufferFromAoa(aoa))).rejects.toThrow(/no valid transaction rows/i);
  });

  it('throws a controlled error on an empty workbook', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    await expect(parseSalikExcel(buf)).rejects.toThrow();
  });
});

describe('parseGenericTollExcel', () => {
  it('parses generic Date/Amount column layouts', async () => {
    const aoa = [['Date', 'Location', 'Plate', 'Tag', 'Amount'], ['15-Feb-2026', 'Sheikh Zayed Road Gate', 'H 77777', 'DTAG001', '5']];
    const result = await parseGenericTollExcel(bufferFromAoa(aoa));
    expect(result.rows[0]).toMatchObject({ date: '2026-02-15', locationName: 'Sheikh Zayed Road Gate', plateNumber: 'H 77777', tagNumber: 'DTAG001', actualCompanyCost: 5 });
  });

  it('parses bounded CSV text through the same hardened fallback', async () => {
    const csv = Buffer.from('Transaction Date,Gate,Plate Number,Amount\n31/08/2026,Al Safa,J 48175,4\n', 'utf8');
    const result = await parseGenericTollExcel(csv);
    expect(result.rows[0]).toMatchObject({ date: '2026-08-31', locationName: 'Al Safa', plateNumber: 'J 48175', actualCompanyCost: 4 });
  });

  it('warns when plate/location columns are absent', async () => {
    const result = await parseGenericTollExcel(bufferFromAoa([['Date', 'Amount'], ['15-Feb-2026', '5']]));
    expect(result.warnings.some(w => /plate/i.test(w))).toBe(true);
    expect(result.warnings.some(w => /location/i.test(w))).toBe(true);
  });

  it('rejects a sheet with no Date+Amount header', async () => {
    await expect(parseGenericTollExcel(bufferFromAoa([['Foo', 'Bar', 'Baz'], [1, 2, 3]]))).rejects.toThrow(/Could not detect a transaction table/i);
  });
});
