// Server-side parsers for Salik/Darb toll statement files.
// Uploaded data is always previewed before persistence. Production parsing
// intentionally uses read-excel-file for OOXML rather than the vulnerable
// npm SheetJS release; CSV/TSV text is parsed by a small bounded parser here.
import { readSheet } from 'read-excel-file/node';
import type { Row } from 'read-excel-file/node';

export interface ParsedTollRow {
  date: string;
  time?: string;
  locationName: string;
  direction?: string;
  tagNumber?: string;
  plateNumber?: string;
  transactionRef?: string;
  actualCompanyCost: number;
}

export interface ParsedTollFile {
  rows: ParsedTollRow[];
  meta: { accountNumber?: string; periodStart?: string; periodEnd?: string; periodLabel?: string; totalTopUps?: number };
  warnings: string[];
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

function normalizeDate(raw: string): string {
  const cleaned = raw.trim().replace(/,/g, '');
  const m = cleaned.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`;
  }
  // Common UAE exports may use dd/mm/yyyy or dd-mm-yyyy. Do not rely on
  // implementation-specific US date parsing for an ambiguous day/month.
  const numeric = cleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return `${numeric[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(cleaned);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return cleaned;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  return String(value);
}

function isZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2]) && [0x04, 0x06, 0x08].includes(buffer[3]);
}

function isLegacyOleXls(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      cells.push(value.trim()); value = '';
    } else value += ch;
  }
  cells.push(value.trim());
  return cells;
}

function parseDelimitedGrid(buffer: Buffer): string[][] {
  if (buffer.includes(0)) throw new Error('This text statement contains binary/null bytes and cannot be parsed safely.');
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(line => line.trim()).slice(0, 200000);
  if (!lines.length) throw new Error('The uploaded statement is empty.');
  const sample = lines.slice(0, 8).join('\n');
  const candidates = [',', ';', '\t'];
  const delimiter = candidates
    .map(char => ({ char, count: sample.split(char).length - 1 }))
    .sort((a, b) => b.count - a.count)[0];
  if (!delimiter || delimiter.count === 0) throw new Error('Could not detect spreadsheet/CSV columns in this statement.');
  return lines.map(line => parseDelimitedLine(line, delimiter.char));
}

async function readGridFromBuffer(buffer: Buffer): Promise<string[][]> {
  if (isLegacyOleXls(buffer)) {
    // read-excel-file intentionally does not parse legacy OLE/BIFF .xls.
    // Do not silently reintroduce the vulnerable SheetJS npm package just
    // to claim support. Give the operator an exact conversion instruction.
    throw new Error('Legacy .xls format is not supported by the hardened importer. Open/export the Salik statement as .xlsx (Excel Workbook) and upload it again.');
  }
  if (isZip(buffer)) {
    const rows: Row[] = await readSheet(buffer);
    return rows.map(row => row.map(cellToString));
  }
  return parseDelimitedGrid(buffer);
}

function parseMoney(value: unknown): number {
  const cleaned = String(value ?? '').replace(/AED/gi, '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

const normalizeHeader = (value: unknown) => String(value ?? '').replace(/\n/g, ' ').trim().toLowerCase();
const hasAny = (header: string, words: string[]) => words.some(word => header.includes(word));

function parseGenericGrid(grid: string[][], sourceLabel: string): ParsedTollFile {
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(grid.length, 60); i += 1) {
    const cells = (grid[i] || []).map(normalizeHeader);
    const hasDate = cells.some(c => hasAny(c, ['date', 'trip date', 'transaction date', 'تاريخ']));
    const hasAmount = cells.some(c => hasAny(c, ['amount', 'total', 'toll fee', 'charge', 'المبلغ', 'القيمة', 'رسوم']));
    if (hasDate && hasAmount) { headerRowIndex = i; break; }
  }
  if (headerRowIndex === -1) throw new Error('Could not detect a transaction table containing Date and Amount columns in this statement.');

  const header = grid[headerRowIndex].map(normalizeHeader);
  const findCol = (...keywords: string[]) => header.findIndex(h => hasAny(h, keywords));
  const idxDate = findCol('trip date', 'transaction date', 'date', 'تاريخ');
  const idxTime = findCol('trip time', 'transaction time', 'time', 'وقت');
  const idxAmount = findCol('total amount', 'toll amount', 'trip amount', 'amount', 'total', 'charge', 'المبلغ', 'القيمة', 'رسوم');
  const idxPlate = findCol('plate number', 'plate', 'vehicle plate', 'vehicle', 'رقم اللوحة', 'لوحة', 'مركبة');
  const idxLocation = findCol('toll gate', 'gate', 'location', 'toll point', 'zone', 'بوابة', 'الموقع', 'موقع');
  const idxTag = findCol('tag number', 'tag', 'رقم التاج', 'وسم');
  const idxTxn = findCol('transaction id', 'transaction ref', 'reference', 'trip id', 'رقم المعاملة', 'مرجع');
  const idxDirection = findCol('direction', 'اتجاه');

  const warnings: string[] = [`${sourceLabel}: statement layout was parsed by flexible column detection; review the preview before confirming.`];
  if (idxPlate === -1) warnings.push('No plate/vehicle column detected — rows will require manual assignment.');
  if (idxLocation === -1) warnings.push('No toll-gate/location column detected.');

  const rows: ParsedTollRow[] = [];
  for (let i = headerRowIndex + 1; i < grid.length; i += 1) {
    const r = grid[i];
    if (!r || r.every(c => !String(c ?? '').trim())) continue;
    const dateRaw = String(r[idxDate] ?? '').trim();
    if (!dateRaw) continue;
    const normalized = normalizeDate(dateRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) continue; // skip totals/footers safely
    rows.push({
      date: normalized,
      time: idxTime !== -1 ? String(r[idxTime] ?? '').trim() || undefined : undefined,
      locationName: idxLocation !== -1 ? String(r[idxLocation] ?? '').trim() || 'Unknown Gate' : 'Unknown Gate',
      direction: idxDirection !== -1 ? String(r[idxDirection] ?? '').trim() || undefined : undefined,
      tagNumber: idxTag !== -1 ? String(r[idxTag] ?? '').trim() || undefined : undefined,
      plateNumber: idxPlate !== -1 ? String(r[idxPlate] ?? '').trim() || undefined : undefined,
      transactionRef: idxTxn !== -1 ? String(r[idxTxn] ?? '').trim() || undefined : undefined,
      actualCompanyCost: parseMoney(r[idxAmount])
    });
  }
  if (!rows.length) throw new Error('A transaction table was detected, but no valid dated transaction rows could be parsed.');
  return { rows, meta: {}, warnings };
}

export async function parseSalikExcel(buffer: Buffer): Promise<ParsedTollFile> {
  const grid = await readGridFromBuffer(buffer);
  let accountNumber: string | undefined;
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  let headerRowIndex = -1;

  for (let i = 0; i < grid.length; i += 1) {
    const rowText = (grid[i] || []).join(' ');
    const acctMatch = rowText.match(/Account (?:No|#):?\s*(\d+)/i);
    if (acctMatch) accountNumber = acctMatch[1];
    const periodMatch = rowText.match(/Trip\(s\)\s*From\s*([\d-]+)\s*To\s*([\d-]+)/i);
    if (periodMatch) {
      periodStart = normalizeDate(periodMatch[1].split('-').reverse().join(' '));
      periodEnd = normalizeDate(periodMatch[2].split('-').reverse().join(' '));
    }
    const cells = (grid[i] || []).map(normalizeHeader);
    if (cells.some(c => c.includes('transaction id')) && cells.some(c => c.includes('trip date'))) { headerRowIndex = i; break; }
  }

  // Salik offers/exported more than one spreadsheet layout. The previous
  // importer rejected every valid workbook that was not exactly the Trips
  // Report. Preserve the precise parser where possible, but fall back to a
  // date/amount/plate/gate header detector instead of rejecting the file.
  if (headerRowIndex === -1) {
    const flexible = parseGenericGrid(grid, 'Salik');
    return { ...flexible, meta: { ...flexible.meta, accountNumber, periodStart, periodEnd } };
  }

  const header = grid[headerRowIndex].map(normalizeHeader);
  const find = (...words: string[]) => header.findIndex(h => hasAny(h, words));
  const idxTxn = find('transaction id');
  const idxDate = find('trip date');
  const idxTime = find('trip time');
  const idxGate = find('toll gate', 'gate');
  const idxDirection = find('direction');
  const idxTag = find('tag number', 'tag');
  const idxPlate = find('plate');
  const idxAmount = find('total amount', 'amount');
  const warnings: string[] = [];
  if (idxAmount === -1) warnings.push('Could not find an Amount column — costs default to 0; review before confirming.');

  const rows: ParsedTollRow[] = [];
  for (let i = headerRowIndex + 1; i < grid.length; i += 1) {
    const r = grid[i];
    if (!r || r.every(c => !String(c ?? '').trim())) continue;
    const rawDate = String(r[idxDate] ?? '').trim();
    if (!rawDate) continue;
    const date = normalizeDate(rawDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const direction = idxDirection !== -1 ? String(r[idxDirection] ?? '').trim() : '';
    rows.push({
      date,
      time: idxTime !== -1 ? String(r[idxTime] ?? '').trim() || undefined : undefined,
      locationName: idxGate !== -1 ? String(r[idxGate] ?? '').trim() || 'Unknown Gate' : 'Unknown Gate',
      direction: direction ? (direction.toLowerCase().startsWith('to ') ? direction : `To ${direction}`) : undefined,
      tagNumber: idxTag !== -1 ? String(r[idxTag] ?? '').trim() || undefined : undefined,
      plateNumber: idxPlate !== -1 ? String(r[idxPlate] ?? '').trim() || undefined : undefined,
      transactionRef: idxTxn !== -1 ? String(r[idxTxn] ?? '').trim() || undefined : undefined,
      actualCompanyCost: idxAmount !== -1 ? parseMoney(r[idxAmount]) : 0
    });
  }
  if (!rows.length) throw new Error('Salik transaction headers were found, but no valid transaction rows were parsed.');
  return { rows, meta: { accountNumber, periodStart, periodEnd }, warnings };
}

const SALIK_PDF_ROW_REGEX = /^\s*(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\d{1,2}:\d{2}:\d{2}\s*[AP]M)\s+(\S+)\s+(\S+)\s+(.+?)\s{2,}(To\s+.+?)\s+([\d.]+)\s*$/;
const SALIK_PDF_IGNORE_REGEX = /^(Monthly Statements|Statement (Date|Filter)|Account #|Total transactions|Run Date|Page \d|Transaction Date\/Time|Transactions for Tag|Name|Email|Statements generated)/i;

export function parseSalikPdfText(text: string): ParsedTollFile {
  const lines = text.split('\n');
  let accountNumber: string | undefined;
  let periodLabel: string | undefined;
  let totalTopUps: number | undefined;
  const rows: ParsedTollRow[] = [];
  let lastRow: ParsedTollRow | null = null;
  let unparsedCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, '');
    const trimmed = line.trim();
    if (!trimmed) continue;
    const acctMatch = trimmed.match(/Account #\s*(\d+)/i); if (acctMatch) accountNumber = acctMatch[1];
    const filterMatch = trimmed.match(/Year:\s*([A-Za-z]+),\s*(\d{4})/i); if (filterMatch) periodLabel = `${filterMatch[1]} ${filterMatch[2]}`;
    const topUpMatch = trimmed.match(/Total Payments Amount\s*\(AED\)\s+([\d,.]+)/i); if (topUpMatch) totalTopUps = parseMoney(topUpMatch[1]);
    const m = line.match(SALIK_PDF_ROW_REGEX);
    if (m) {
      const [, dateStr, timeStr, plate, tag, location, direction, amountStr] = m;
      const row: ParsedTollRow = { date: normalizeDate(dateStr), time: timeStr.trim(), locationName: location.trim(), direction: direction.trim(), tagNumber: tag, plateNumber: plate, actualCompanyCost: parseMoney(amountStr) };
      rows.push(row); lastRow = row; continue;
    }
    if (lastRow && /^[A-Za-z][A-Za-z\s]*$/.test(trimmed) && trimmed.length < 40) { lastRow.locationName = `${lastRow.locationName} ${trimmed}`.trim(); continue; }
    if (SALIK_PDF_IGNORE_REGEX.test(trimmed) || /^Total transactions for/i.test(trimmed)) continue;
    unparsedCount += 1;
  }
  const warnings: string[] = [];
  if (!rows.length) warnings.push('No transaction rows could be parsed from this PDF — an XLSX export is more reliable.');
  if (unparsedCount > 5) warnings.push(`${unparsedCount} PDF lines could not be confidently matched and were skipped.`);
  return { rows, meta: { accountNumber, periodLabel, totalTopUps }, warnings };
}

export async function parseGenericTollExcel(buffer: Buffer): Promise<ParsedTollFile> {
  return parseGenericGrid(await readGridFromBuffer(buffer), 'Toll');
}
