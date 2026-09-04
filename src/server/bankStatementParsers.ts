// Server-side parsers for weekly bank statement imports (Bank Reconciliation
// Engine). Mirrors src/server/tollFileParsers.ts's architecture exactly:
// pure functions (buffer in, structured rows out), unit-testable in
// isolation, kept out of the client bundle.
//
// CSV/Excel are supported first, per the mission's explicit requirement.
// The extension point for PDF later is `parseGridToBankRows()`: every
// format-specific parser below (Excel, CSV, and a future PDF one) only has
// to turn its own input into the same plain string[][] grid and hand it to
// this one shared function -- the column-detection/matching logic, and
// everything downstream in bankReconciliation.ts, never changes. This is
// the same "one shared grid-to-rows function, several format-specific
// front-ends" shape tollFileParsers.ts already uses for
// parseGenericTollExcel().
//
// IMPORTANT: every parser here is best-effort against whichever real
// column headers a given bank export happens to use. It never guesses a
// missing Date/Amount -- a row without one is dropped and counted in
// `warnings`, and the caller (POST /api/bank-batches) always returns a
// preview for a human to confirm before anything is written.

import { readSheet } from 'read-excel-file/node';
import type { Row } from 'read-excel-file/node';
import { readLegacyXlsGrid } from './legacyXlsReader.js';

/** OLE2/BIFF8 compound-file signature -- see bankImportGuard.ts's detectBankImportFileKind, which classifies both this and OOXML as kind 'excel'; this is the finer-grained check parseBankStatementExcel needs to route to the right reader. Many UAE bank portals still export account statements in this legacy format. */
function isLegacyXlsBuffer(buffer: Buffer): boolean {
  return buffer.length >= 8
    && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0
    && buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1;
}

export interface ParsedBankStatementRow {
  date: string; // ISO yyyy-mm-dd
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance?: number;
}

export interface ParsedBankStatementFile {
  rows: ParsedBankStatementRow[];
  meta: {
    accountNumber?: string;
    bankName?: string;
    periodStart?: string;
    periodEnd?: string;
  };
  warnings: string[];
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/** Parses "26 Aug 2026", "31-Aug-2025", "31/08/2025", or an ISO string into ISO yyyy-mm-dd. Falls back to Date parsing; leaves the raw text as-is (flagged downstream by an empty resulting date) if nothing works. */
function normalizeDate(raw: string): string {
  const cleaned = raw.trim().replace(/,/g, '');
  const monthNameMatch = cleaned.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{4})$/);
  if (monthNameMatch) {
    const day = monthNameMatch[1].padStart(2, '0');
    const mon = MONTHS[monthNameMatch[2].slice(0, 3).toLowerCase()];
    if (mon) return `${monthNameMatch[3]}-${mon}-${day}`;
  }
  // dd/mm/yyyy or dd-mm-yyyy -- the near-universal bank-statement convention outside the US.
  const slashMatch = cleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

function parseAmount(raw: string): number {
  const cleaned = String(raw ?? '').replace(/[,\s]/g, '').replace(/^\((.+)\)$/, '-$1'); // "(123.45)" accounting-negative -> "-123.45"
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Same cell-normalization concern as tollFileParsers.ts's cellToString: read-excel-file returns typed Date/number/string values directly. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  return String(value);
}

/**
 * Turns any plain string grid (from Excel or CSV alike) into normalized
 * bank statement rows. Detects the header row by keyword (never a fixed
 * row index -- a bank's own export layout, or which of the leading rows
 * carry an account-summary banner, varies) and resolves each column by
 * name so a minor header wording difference doesn't silently break it.
 */
export function parseGridToBankRows(grid: string[][]): ParsedBankStatementFile {
  const warnings: string[] = [];
  let accountNumber: string | undefined;
  let bankName: string | undefined;
  let headerRowIndex = -1;

  const DATE_KEYWORDS = ['date', 'value date', 'transaction date', 'posting date'];
  const DEBIT_KEYWORDS = ['debit', 'withdrawal', 'dr amount', 'dr.'];
  const CREDIT_KEYWORDS = ['credit', 'deposit', 'cr amount', 'cr.'];

  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const row = grid[i] || [];
    const rowText = row.join(' ');
    const acctMatch = rowText.match(/(?:Account\s*(?:No\.?|Number)?|IBAN)\s*:?\s*([A-Z0-9\s]{6,34})/i);
    if (acctMatch && !accountNumber) accountNumber = acctMatch[1].trim();
    const bankMatch = rowText.match(/(?:Bank\s*Name)\s*:?\s*([A-Za-z\s]{3,40})/i);
    if (bankMatch && !bankName) bankName = bankMatch[1].trim();

    const cellsLower = row.map(c => String(c ?? '').trim().toLowerCase());
    const hasDate = cellsLower.some(c => DATE_KEYWORDS.some(k => c === k || c.includes(k)));
    const hasAmountCol = cellsLower.some(c => DEBIT_KEYWORDS.some(k => c.includes(k)) || CREDIT_KEYWORDS.some(k => c.includes(k)) || c.includes('amount'));
    if (hasDate && hasAmountCol) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Could not detect a header row with a Date column and a Debit/Credit/Amount column in this file.');
  }

  const header = grid[headerRowIndex].map(c => String(c ?? '').trim().toLowerCase());
  const findCol = (...keywords: string[]) => header.findIndex(h => keywords.some(k => h === k || h.includes(k)));

  const idxDate = findCol(...DATE_KEYWORDS);
  const idxDescription = findCol('description', 'narration', 'details', 'particulars', 'remarks', 'transaction details');
  const idxReference = findCol('reference', 'ref no', 'ref.', 'cheque no', 'transaction ref', 'txn ref', 'chq/ref no');
  let idxDebit = findCol(...DEBIT_KEYWORDS);
  let idxCredit = findCol(...CREDIT_KEYWORDS);
  const idxAmount = findCol('amount'); // single-amount-column layout (sign or a separate dr/cr indicator decides direction)
  const idxDrCrIndicator = findCol('dr/cr', 'type', 'indicator');
  const idxBalance = findCol('balance', 'running balance', 'closing balance');

  if (idxDescription === -1) warnings.push('No description/narration column detected -- descriptions will be blank.');
  if (idxReference === -1) warnings.push('No reference/cheque number column detected -- matching will rely on amount, date, and description only.');
  if (idxDebit === -1 && idxCredit === -1 && idxAmount === -1) warnings.push('No Debit/Credit/Amount column detected -- amounts will default to 0, please review.');

  const rows: ParsedBankStatementRow[] = [];
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every(c => c === '' || c === undefined || c === null)) continue;
    const dateRaw = String(r[idxDate] ?? '').trim();
    if (!dateRaw) continue;
    const date = normalizeDate(dateRaw);
    if (!date) {
      warnings.push(`Row ${i + 1}: could not parse date "${dateRaw}" -- skipped.`);
      continue;
    }

    let debit = idxDebit !== -1 ? parseAmount(String(r[idxDebit] ?? '0')) : 0;
    let credit = idxCredit !== -1 ? parseAmount(String(r[idxCredit] ?? '0')) : 0;
    if (idxDebit === -1 && idxCredit === -1 && idxAmount !== -1) {
      const amount = parseAmount(String(r[idxAmount] ?? '0'));
      const indicator = idxDrCrIndicator !== -1 ? String(r[idxDrCrIndicator] ?? '').trim().toLowerCase() : '';
      const isDebit = amount < 0 || indicator.startsWith('d');
      if (isDebit) debit = Math.abs(amount); else credit = Math.abs(amount);
    }

    rows.push({
      date,
      description: idxDescription !== -1 ? String(r[idxDescription] ?? '').trim() : '',
      reference: idxReference !== -1 ? String(r[idxReference] ?? '').trim() : '',
      debit,
      credit,
      balance: idxBalance !== -1 ? parseAmount(String(r[idxBalance] ?? '')) : undefined
    });
  }

  if (rows.length === 0) warnings.push('No transaction rows were found under the detected header.');

  return { rows, meta: { accountNumber, bankName }, warnings };
}

/**
 * Reads the first sheet of an uploaded Excel workbook as a plain string
 * grid. Legacy .xls (OLE2/BIFF8 -- still common from older UAE bank export
 * tools) is routed to legacyXlsReader.ts's dependency-free reader instead
 * of read-excel-file, which only understands modern .xlsx (OOXML). See
 * tollFileParsers.ts's identical fix for the equivalent Salik import bug
 * and legacyXlsReader.ts's module doc for why this doesn't just use
 * xlsx/SheetJS.
 */
export async function parseBankStatementExcel(buffer: Buffer): Promise<ParsedBankStatementFile> {
  if (isLegacyXlsBuffer(buffer)) {
    return parseGridToBankRows(readLegacyXlsGrid(buffer));
  }
  const sheetRows: Row[] = await readSheet(buffer);
  const grid = sheetRows.map(row => row.map(cellToString));
  return parseGridToBankRows(grid);
}

/**
 * Minimal, dependency-free, quote-aware CSV parser -- a bank export is a
 * simple flat table, not general-purpose CSV with embedded newlines inside
 * quoted fields, so this deliberately stays small rather than pulling in a
 * full CSV library for a single narrow use.
 */
function parseCsvText(text: string): string[][] {
  const grid: string[][] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (const line of lines) {
    if (line.trim() === '') { grid.push([]); continue; }
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = false; }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';') {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    grid.push(cells.map(c => c.trim()));
  }
  return grid;
}

export async function parseBankStatementCsv(buffer: Buffer): Promise<ParsedBankStatementFile> {
  const text = buffer.toString('utf8');
  const grid = parseCsvText(text);
  return parseGridToBankRows(grid);
}
