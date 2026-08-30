// Pre-parse hardening for the bank statement import endpoint
// (POST /api/bank-batches in server.ts) -- mirrors src/server/
// tollImportGuard.ts exactly (same file-size ceiling, same
// "classify by the file's own bytes, never the client-supplied fileName"
// discipline). Pure, dependency-free functions, safe to unit-test without
// importing server.ts.
//
// Unlike the toll importer (Excel/PDF only), this accepts CSV as a first-
// class format per the mission's explicit requirement ("CSV/Excel أولًا")
// -- CSV has no magic bytes, so it is the fallback once PDF/Excel are both
// ruled out AND the buffer decodes as plausible delimited text. A future
// PDF bank-statement parser plugs into the SAME 'pdf' branch this already
// recognizes, with zero changes to this detection logic or to
// bankReconciliation.ts (see bankStatementParsers.ts's module doc for the
// full explanation of that extension point).

export const BANK_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024; // matches TOLL_IMPORT_MAX_FILE_BYTES / the app's existing 10MB upload precedent

export type BankImportFileKind = 'excel' | 'csv' | 'pdf';

/**
 * Classifies a DECODED upload buffer by its own magic bytes/content shape
 * -- never by the client-supplied fileName, which is trivially spoofable.
 * Returns null for anything that isn't a real PDF, OOXML (.xlsx), legacy
 * OLE2 (.xls), or plausible delimited text (.csv).
 */
export function detectBankImportFileKind(buffer: Buffer): BankImportFileKind | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return 'pdf';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 && buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  ) {
    return 'excel'; // .xlsx: OOXML is a ZIP container (PK local file header)
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1
  ) {
    return 'excel'; // legacy .xls: OLE2/BIFF8 compound file signature
  }
  return looksLikeDelimitedText(buffer) ? 'csv' : null;
}

/**
 * A CSV has no magic bytes, so this is a content heuristic, not a format
 * signature: the buffer must decode as valid UTF-8/ASCII text (no NUL
 * bytes, no runs of high-bit-set bytes typical of a binary format this
 * function doesn't otherwise recognize), and at least one of its first few
 * non-empty lines must contain a comma or semicolon -- the two delimiters
 * every bank export this app has seen actually uses.
 */
function looksLikeDelimitedText(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.includes(0)) return false; // a NUL byte never appears in real delimited text

  let text: string;
  try {
    text = sample.toString('utf8');
  } catch {
    return false;
  }
  // A garbled decode reintroduces the Unicode replacement character;
  // genuine UTF-8/ASCII text never does.
  if (text.includes('�')) return false;

  const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean).slice(0, 5);
  if (lines.length === 0) return false;
  return lines.some(l => l.includes(',') || l.includes(';'));
}
