// Pre-parse hardening for the Salik/Darb toll statement import endpoint.
// Classification is based on decoded content, never the client filename.
export const TOLL_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export type TollImportFileKind = 'pdf' | 'excel';

function looksLikeDelimitedText(buffer: Buffer): boolean {
  if (buffer.length === 0 || buffer.length > TOLL_IMPORT_MAX_FILE_BYTES) return false;
  // CSV/TSV must be text. Null/control-heavy input is treated as binary and
  // never handed to the delimited parser.
  const sample = buffer.subarray(0, Math.min(buffer.length, 64 * 1024));
  if (sample.includes(0)) return false;
  let suspiciousControls = 0;
  for (const byte of sample) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspiciousControls += 1;
  }
  if (suspiciousControls > Math.max(2, Math.floor(sample.length * 0.002))) return false;

  const text = sample.toString('utf8').replace(/^\uFEFF/, '');
  if (!text.includes('\n') && !text.includes('\r')) return false;
  const lines = text.split(/\r?\n/).filter(line => line.trim()).slice(0, 8);
  if (lines.length < 2) return false;

  const delimiters = [',', ';', '\t'];
  return delimiters.some(delimiter => {
    const counts = lines.map(line => line.split(delimiter).length - 1);
    const positive = counts.filter(count => count > 0);
    if (positive.length < 2) return false;
    // Require roughly consistent tabular structure; this prevents arbitrary
    // prose containing a comma from being classified as a spreadsheet.
    const min = Math.min(...positive);
    const max = Math.max(...positive);
    return min > 0 && max - min <= 2;
  });
}

/**
 * Returns `excel` for hardened spreadsheet-like input: OOXML/XLSX, legacy
 * OLE/XLS (which the parser later rejects with actionable conversion advice),
 * or bounded CSV/TSV/semicolon-delimited text. PDF remains separate.
 */
export function detectTollImportFileKind(buffer: Buffer): TollImportFileKind | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 && buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  ) return 'excel';

  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1
  ) return 'excel';

  return looksLikeDelimitedText(buffer) ? 'excel' : null;
}
