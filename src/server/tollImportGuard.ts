// Pre-parse hardening for the Salik/Darb toll statement import endpoint
// (POST /api/tolls/import in server.ts). Pure, dependency-free functions so
// they're safe to unit-test in isolation without importing server.ts (which
// has module-load side effects -- starting a dev server / hydrating from
// Firestore). Deliberately does NOT touch src/server/tollFileParsers.ts or
// the xlsx library itself -- this only decides whether a decoded upload is
// even worth handing to that parser.

/**
 * 10MB matches the existing ceiling already used elsewhere in this app (see
 * the 10MB check in POST /api/upload). A real Salik "Trips Report" export
 * is a simple tabular spreadsheet, orders of magnitude smaller than this in
 * practice -- this is a conservative-but-generous cap, not a tight fit to
 * real file sizes, chosen for consistency with the app's existing
 * precedent rather than a new arbitrary number.
 */
export const TOLL_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;

export type TollImportFileKind = 'pdf' | 'excel';

/**
 * Classifies a DECODED upload buffer by its own magic bytes -- never by the
 * client-supplied fileName or any other request metadata, both of which are
 * trivially spoofable. Returns null for anything that isn't a real PDF,
 * OOXML (.xlsx, a ZIP container), or legacy OLE2 (.xls) file, so the caller
 * can reject it before ever calling XLSX.read()/pdf-parse on it.
 */
export function detectTollImportFileKind(buffer: Buffer): TollImportFileKind | null {
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
  return null;
}
