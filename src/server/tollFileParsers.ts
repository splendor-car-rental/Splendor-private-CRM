// Server-side parsers for Salik/Darb toll statement files. Pure functions
// (buffer/text in, structured rows out) so they're easy to unit-test and
// keep out of anything the client bundle needs to load.
//
// Two real Salik export formats are supported precisely, based on actual
// sample files from the business owner's account:
//  1. The Excel "Trips Report" export (Salik portal -> Reports -> Trips),
//     one row per crossing with a separate VAT breakdown.
//  2. The PDF "Monthly Statements" export, one row per crossing grouped by
//     tag/plate, plus an account-level payment/top-up summary.
// A generic column-header-detection fallback (parseGenericTollExcel) covers
// Darb or any other Excel/CSV layout until a real Darb sample is available
// to build a precise parser for it the same way.
//
// IMPORTANT: every parser here is best-effort. The import endpoint always
// returns a preview for the admin to confirm before anything is written to
// the database -- financial data should never be silently trusted from an
// auto-parse, especially for a PDF, where text-extraction order can vary
// between PDF libraries.

// @ts-ignore -- optional dependency, added to package.json; not present in
// every environment this repo's TypeScript is checked in (e.g. `tsc --noEmit`
// without `npm install` run), so it's isolated behind a dynamic import in
// the endpoint. Typed loosely on purpose.
import * as XLSX from 'xlsx';

export interface ParsedTollRow {
  date: string; // ISO yyyy-mm-dd
  time?: string;
  locationName: string;
  direction?: string;
  tagNumber?: string;
  plateNumber?: string;
  transactionRef?: string;
  /** The real cost as shown on the statement. For Darb this is informational only -- the fixed base cost always wins (see tollCalculations.ts). */
  actualCompanyCost: number;
}

export interface ParsedTollFile {
  rows: ParsedTollRow[];
  meta: {
    accountNumber?: string;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    /** Total account top-ups/payments for the period, read from the statement's own summary, if present. */
    totalTopUps?: number;
  };
  warnings: string[];
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/** Parses "26 Aug 2026" or "31-Aug-2025" into ISO yyyy-mm-dd. Falls back to Date parsing for anything else. */
function normalizeDate(raw: string): string {
  const cleaned = raw.trim().replace(/,/g, '');
  const m = cleaned.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${day}`;
  }
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return cleaned; // leave as-is; the review screen will surface it as unusual
}

/**
 * Parses the Salik "Trips Report" Excel export. Column positions are
 * confirmed against a real export, but resolved by header name (not fixed
 * index) so a minor layout shuffle by Salik doesn't silently break it.
 */
export function parseSalikExcel(buffer: Buffer): ParsedTollFile {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  let accountNumber: string | undefined;
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  let headerRowIndex = -1;

  for (let i = 0; i < grid.length; i++) {
    const rowText = (grid[i] || []).join(' ');
    const acctMatch = rowText.match(/Account No:?\s*(\d+)/i);
    if (acctMatch) accountNumber = acctMatch[1];
    const periodMatch = rowText.match(/Trip\(s\)\s*From\s*([\d-]+)\s*To\s*([\d-]+)/i);
    if (periodMatch) {
      periodStart = normalizeDate(periodMatch[1].split('-').reverse().join(' '));
      periodEnd = normalizeDate(periodMatch[2].split('-').reverse().join(' '));
    }
    const cellsJoined = (grid[i] || []).map(c => String(c ?? '').replace(/\n/g, ' ')).join('|');
    if (/Transaction ID/i.test(cellsJoined) && /Trip Date/i.test(cellsJoined)) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Could not find the transaction table header row -- this does not look like a Salik "Trips Report" export.');
  }

  const headerRow = grid[headerRowIndex].map(c => String(c ?? '').replace(/\n/g, ' ').trim().toLowerCase());
  const colIndex = (needle: string) => headerRow.findIndex(h => h.includes(needle));

  const idxTxnId = colIndex('transaction id');
  const idxTripDate = colIndex('trip date');
  const idxTripTime = colIndex('trip time');
  const idxGate = colIndex('toll gate');
  const idxDirection = colIndex('direction');
  const idxTag = colIndex('tag number');
  const idxPlate = headerRow.findIndex(h => h === 'plate' || h.includes('plate'));
  const idxTotal = headerRow.findIndex(h => h.includes('total amount'));
  const idxAmount = headerRow.findIndex(h => h.startsWith('amount'));

  const warnings: string[] = [];
  if (idxTotal === -1 && idxAmount === -1) warnings.push('Could not find an Amount column -- costs will default to 0, please review.');

  const rows: ParsedTollRow[] = [];
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every((c: any) => c === '' || c === undefined || c === null)) continue;
    const tripDateRaw = String(r[idxTripDate] ?? '').trim();
    if (!tripDateRaw) continue;

    const costIdx = idxTotal !== -1 ? idxTotal : idxAmount;
    const actualCompanyCost = costIdx !== -1 ? parseFloat(String(r[costIdx] ?? '0')) || 0 : 0;
    const directionRaw = idxDirection !== -1 ? String(r[idxDirection] ?? '').trim() : '';

    rows.push({
      date: normalizeDate(tripDateRaw),
      time: idxTripTime !== -1 ? String(r[idxTripTime] ?? '').trim() || undefined : undefined,
      locationName: idxGate !== -1 ? String(r[idxGate] ?? '').trim() || 'Unknown Gate' : 'Unknown Gate',
      direction: directionRaw ? `To ${directionRaw}` : undefined,
      tagNumber: idxTag !== -1 ? String(r[idxTag] ?? '').trim() || undefined : undefined,
      plateNumber: idxPlate !== -1 ? String(r[idxPlate] ?? '').trim() || undefined : undefined,
      transactionRef: idxTxnId !== -1 ? String(r[idxTxnId] ?? '').trim() || undefined : undefined,
      actualCompanyCost
    });
  }

  if (rows.length === 0) warnings.push('No transaction rows were found under the detected header.');

  return { rows, meta: { accountNumber, periodStart, periodEnd }, warnings };
}

const SALIK_PDF_ROW_REGEX =
  /^\s*(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\d{1,2}:\d{2}:\d{2}\s*[AP]M)\s+(\S+)\s+(\S+)\s+(.+?)\s{2,}(To\s+.+?)\s+([\d.]+)\s*$/;

const SALIK_PDF_IGNORE_REGEX =
  /^(Monthly Statements|Statement (Date|Filter)|Account #|Total transactions|Run Date|Page \d|Transaction Date\/Time|Transactions for Tag|Name|Email|Statements generated)/i;

/**
 * Parses text already extracted from a Salik "Monthly Statements" PDF (see
 * the pdf-parse call at the endpoint). Text-extraction order for PDFs isn't
 * guaranteed to be pixel-identical across libraries, so this is
 * intentionally tolerant of extra/variable whitespace, and any line it
 * can't confidently parse is counted in `warnings` rather than guessed at.
 */
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

    const acctMatch = trimmed.match(/Account #\s*(\d+)/i);
    if (acctMatch) accountNumber = acctMatch[1];

    const filterMatch = trimmed.match(/Year:\s*([A-Za-z]+),\s*(\d{4})/i);
    if (filterMatch) periodLabel = `${filterMatch[1]} ${filterMatch[2]}`;

    const topUpMatch = trimmed.match(/Total Payments Amount\s*\(AED\)\s+([\d,.]+)/i);
    if (topUpMatch) totalTopUps = parseFloat(topUpMatch[1].replace(/,/g, ''));

    const m = line.match(SALIK_PDF_ROW_REGEX);
    if (m) {
      const [, dateStr, timeStr, plate, tag, location, direction, amountStr] = m;
      const row: ParsedTollRow = {
        date: normalizeDate(dateStr),
        time: timeStr.trim(),
        locationName: location.trim(),
        direction: direction.trim(),
        tagNumber: tag,
        plateNumber: plate,
        actualCompanyCost: parseFloat(amountStr) || 0
      };
      rows.push(row);
      lastRow = row;
      continue;
    }

    // A short, letters-only line right after a row is almost always a
    // wrapped continuation of that row's Location cell (e.g. "Bridge" on
    // its own line, from "Al Garhoud New Bridge").
    if (lastRow && /^[A-Za-z][A-Za-z\s]*$/.test(trimmed) && trimmed.length < 40) {
      lastRow.locationName = `${lastRow.locationName} ${trimmed}`.trim();
      continue;
    }

    if (SALIK_PDF_IGNORE_REGEX.test(trimmed) || /^Total transactions for/i.test(trimmed)) {
      continue;
    }

    unparsedCount++;
  }

  const warnings: string[] = [];
  if (rows.length === 0) warnings.push('No transaction rows could be parsed from this PDF -- an Excel export from the Salik portal is more reliable.');
  if (unparsedCount > 5) warnings.push(`${unparsedCount} lines in the PDF could not be matched to a transaction row and were skipped.`);

  return { rows, meta: { accountNumber, periodLabel, totalTopUps }, warnings };
}

/**
 * Generic fallback for any Excel/CSV toll file whose exact layout isn't
 * known yet (used for Darb until a real sample is available). Detects the
 * header row by looking for Date/Amount columns, then best-effort matches
 * Plate/Location/Tag by keyword. Always flags what it couldn't find rather
 * than guessing silently.
 */
export function parseGenericTollExcel(buffer: Buffer): ParsedTollFile {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = (grid[i] || []).map(c => String(c ?? '').toLowerCase());
    if (cells.some(c => c.includes('date')) && cells.some(c => c.includes('amount'))) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) {
    throw new Error('Could not detect a header row with Date and Amount columns in this file.');
  }

  const header = grid[headerRowIndex].map(c => String(c ?? '').toLowerCase().trim());
  const findCol = (...keywords: string[]) => header.findIndex(h => keywords.some(k => h.includes(k)));
  const idxDate = findCol('date');
  const idxAmount = findCol('amount', 'total');
  const idxPlate = findCol('plate', 'vehicle');
  const idxLocation = findCol('location', 'gate', 'toll', 'zone');
  const idxTag = findCol('tag');

  const warnings: string[] = [];
  if (idxPlate === -1) warnings.push('No plate/vehicle column detected -- rows will need manual customer assignment.');
  if (idxLocation === -1) warnings.push('No location/gate column detected.');

  const rows: ParsedTollRow[] = [];
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every((c: any) => c === '' || c === undefined || c === null)) continue;
    const dateRaw = String(r[idxDate] ?? '').trim();
    if (!dateRaw) continue;

    rows.push({
      date: normalizeDate(dateRaw),
      locationName: idxLocation !== -1 ? String(r[idxLocation] ?? '').trim() || 'Unknown' : 'Unknown',
      plateNumber: idxPlate !== -1 ? String(r[idxPlate] ?? '').trim() || undefined : undefined,
      tagNumber: idxTag !== -1 ? String(r[idxTag] ?? '').trim() || undefined : undefined,
      actualCompanyCost: idxAmount !== -1 ? parseFloat(String(r[idxAmount] ?? '0')) || 0 : 0
    });
  }

  if (rows.length === 0) warnings.push('No transaction rows were found under the detected header.');

  return { rows, meta: {}, warnings };
}
