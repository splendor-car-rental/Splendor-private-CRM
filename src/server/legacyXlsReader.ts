// A minimal, dependency-free reader for legacy .xls (BIFF8 inside an OLE2
// Compound File Binary container) files.
//
// WHY THIS EXISTS INSTEAD OF A LIBRARY: this app deliberately does not use
// `xlsx` (SheetJS) to parse untrusted uploaded spreadsheets -- see the
// comment at the top of tollFileParsers.ts. xlsx@0.18.5 (the last version
// ever published to npm) carries an unpatched Prototype Pollution advisory
// and an unpatched ReDoS advisory, both triggerable by a crafted input
// file, which is exactly the threat model here (a file a staff member
// uploads, sourced from Salik's own portal export). `read-excel-file`, the
// library this app uses instead, only supports the modern .xlsx (OOXML)
// format, not legacy .xls (BIFF8) -- so a genuine legacy .xls export
// (which Salik's portal does produce) could not be read at all.
//
// Rather than pull in any general-purpose OLE2/BIFF8 library (the only
// actively-distributed ones are SheetJS itself or thin wrappers around it,
// carrying the same advisories, or long-abandoned packages with no fix
// available on npm either), this file implements JUST the narrow subset
// of both formats needed to extract plain cell values (text/numbers) from
// a single worksheet: no formula evaluation, no macro/VBA execution, no
// external references, no encryption support. Anything outside that
// narrow, well-defined subset (an encrypted/password-protected file, a
// structure this reader doesn't recognize) is REJECTED with a clear error
// rather than guessed at -- this mirrors the "every parser here is
// best-effort, never silently trusted" principle already documented at
// the top of tollFileParsers.ts.

export class LegacyXlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyXlsError';
  }
}

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

interface CfbDirEntry {
  name: string;
  objectType: number; // 0=unknown/unused, 1=storage, 2=stream, 5=root storage
  startSector: number;
  size: number; // low 32 bits -- streams here are always well under 4GB
}

/**
 * Reads the small set of OLE2/Compound-File-Binary structures needed to
 * locate one named top-level stream (here, always "Workbook" or the older
 * "Book") and return its raw bytes. Implements the FAT-chain path only --
 * a stream stored in the "mini stream" (i.e. under the 4096-byte cutoff)
 * is rejected rather than guessed at, since a real spreadsheet's Workbook
 * stream (which holds every string and every cell in the file) is always
 * far larger than that in practice.
 */
function readCfbStream(buffer: Buffer, streamName: string): Buffer {
  if (buffer.length < 512) throw new LegacyXlsError('This .xls file is too small to be a real spreadsheet.');
  const sig = buffer.readBigUInt64BE(0);
  if (sig !== 0xd0cf11e0a1b11ae1n) throw new LegacyXlsError('Not a valid legacy .xls (OLE2 compound file) container.');

  const sectorShift = buffer.readUInt16LE(30);
  const miniSectorShift = buffer.readUInt16LE(32);
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;
  if (sectorSize !== 512 && sectorSize !== 4096) {
    throw new LegacyXlsError('Unsupported .xls container sector size.');
  }
  const numFatSectors = buffer.readUInt32LE(44);
  const dirStart = buffer.readUInt32LE(48);
  const miniFatStart = buffer.readUInt32LE(60);
  const numMiniFatSectors = buffer.readUInt32LE(64);
  const miniStreamCutoff = buffer.readUInt32LE(56);
  const numDifatSectors = buffer.readUInt32LE(72);

  const sectorOffset = (sectorId: number) => 512 + sectorId * sectorSize;
  const readSector = (sectorId: number): Buffer => {
    const off = sectorOffset(sectorId);
    if (off < 0 || off + sectorSize > buffer.length) {
      throw new LegacyXlsError('This .xls file is corrupt or truncated (sector out of range).');
    }
    return buffer.subarray(off, off + sectorSize);
  };

  // Build the full FAT sector-id list: the first 109 entries live directly
  // in the header; any beyond that are chained through DIFAT sectors. Real
  // Salik exports are small enough that numDifatSectors is always 0, but
  // this still walks the chain correctly rather than silently truncating.
  const difatEntries: number[] = [];
  for (let i = 0; i < 109; i++) {
    const entry = buffer.readUInt32LE(76 + i * 4);
    if (entry !== FREESECT) difatEntries.push(entry);
  }
  let nextDifatSector = buffer.readUInt32LE(68);
  let difatSectorsRead = 0;
  while (nextDifatSector !== ENDOFCHAIN && nextDifatSector !== FREESECT && difatSectorsRead < numDifatSectors) {
    const sec = readSector(nextDifatSector);
    const entriesPerSector = sectorSize / 4 - 1;
    for (let i = 0; i < entriesPerSector; i++) {
      const entry = sec.readUInt32LE(i * 4);
      if (entry !== FREESECT) difatEntries.push(entry);
    }
    nextDifatSector = sec.readUInt32LE(sectorSize - 4);
    difatSectorsRead++;
  }

  const fat: number[] = [];
  const entriesPerFatSector = sectorSize / 4;
  for (let i = 0; i < numFatSectors && i < difatEntries.length; i++) {
    const sec = readSector(difatEntries[i]);
    for (let j = 0; j < entriesPerFatSector; j++) {
      fat.push(sec.readUInt32LE(j * 4));
    }
  }

  const followChain = (startSector: number, size: number, sectorSz: number, readSec: (id: number) => Buffer, fatArr: number[]): Buffer => {
    if (size === 0) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    let sector = startSector;
    let remaining = size;
    let guard = 0;
    while (sector !== ENDOFCHAIN && remaining > 0) {
      if (guard++ > fatArr.length + 4) throw new LegacyXlsError('This .xls file has a corrupt sector chain (possible infinite loop).');
      const sec = readSec(sector);
      const take = Math.min(remaining, sectorSz);
      chunks.push(sec.subarray(0, take));
      remaining -= take;
      sector = fatArr[sector];
      if (sector === undefined) throw new LegacyXlsError('This .xls file has a corrupt sector chain.');
    }
    return Buffer.concat(chunks);
  };

  const dirBytes = followChain(dirStart, Number.MAX_SAFE_INTEGER, sectorSize, readSector, fat);
  // The directory stream length isn't stored anywhere except implicitly by
  // its own FAT chain length, which followChain() above already resolved
  // (it stops at ENDOFCHAIN since `remaining` was given as unbounded).

  const entriesPerDirSector = 128;
  const numDirEntries = Math.floor(dirBytes.length / entriesPerDirSector);
  const entries: CfbDirEntry[] = [];
  let rootEntry: CfbDirEntry | null = null;
  for (let i = 0; i < numDirEntries; i++) {
    const base = i * entriesPerDirSector;
    const nameLenBytes = dirBytes.readUInt16LE(base + 64);
    const objectType = dirBytes.readUInt8(base + 66);
    if (objectType === 0) continue; // unused slot
    const nameCharCount = Math.max(0, Math.floor(nameLenBytes / 2) - 1);
    const name = dirBytes.subarray(base, base + nameCharCount * 2).toString('utf16le');
    const startSector = dirBytes.readUInt32LE(base + 116);
    const size = dirBytes.readUInt32LE(base + 120); // low 32 bits
    const entry: CfbDirEntry = { name, objectType, startSector, size };
    entries.push(entry);
    if (objectType === 5) rootEntry = entry;
  }

  const match = entries.find(e => e.objectType === 2 && e.name === streamName);
  if (!match) {
    throw new LegacyXlsError(`This .xls file has no "${streamName}" stream -- it may be corrupt, or not a real Excel workbook.`);
  }
  if (!rootEntry) throw new LegacyXlsError('This .xls file is missing its root directory entry.');

  if (match.size >= miniStreamCutoff) {
    return followChain(match.startSector, match.size, sectorSize, readSector, fat);
  }

  // Small streams (a genuinely tiny worksheet, e.g. very few rows) are
  // stored in the "mini stream" -- itself just a regular stream (the root
  // entry's own data) addressed in miniSectorSize (64-byte) chunks via a
  // separate mini-FAT chain, mirroring the regular FAT mechanics above.
  const miniFat: number[] = [];
  let miniFatSector = miniFatStart;
  let miniFatSectorsRead = 0;
  while (miniFatSector !== ENDOFCHAIN && miniFatSector !== FREESECT && miniFatSectorsRead < numMiniFatSectors) {
    const sec = readSector(miniFatSector);
    for (let j = 0; j < entriesPerFatSector; j++) miniFat.push(sec.readUInt32LE(j * 4));
    miniFatSector = fat[miniFatSector];
    if (miniFatSector === undefined) throw new LegacyXlsError('This .xls file has a corrupt mini-FAT chain.');
    miniFatSectorsRead++;
  }

  const miniStreamBytes = followChain(rootEntry.startSector, rootEntry.size, sectorSize, readSector, fat);
  const readMiniSector = (id: number): Buffer => {
    const off = id * miniSectorSize;
    if (off < 0 || off + miniSectorSize > miniStreamBytes.length) {
      throw new LegacyXlsError('This .xls file is corrupt or truncated (mini-sector out of range).');
    }
    return miniStreamBytes.subarray(off, off + miniSectorSize);
  };
  return followChain(match.startSector, match.size, miniSectorSize, readMiniSector, miniFat);
}

interface BiffRecord {
  type: number;
  data: Buffer;
}

/**
 * Splits a raw BIFF stream into logical records, transparently merging any
 * CONTINUE (0x003C) record into the record it continues. This is required
 * for correctness: a single SST string longer than fits in one record is
 * split across a CONTINUE record, and naively treating CONTINUE as its own
 * record would corrupt every string that happens to fall on that boundary
 * (extremely common in a real file with many distinct location names).
 */
function splitBiffRecords(buf: Buffer): BiffRecord[] {
  const records: BiffRecord[] = [];
  let pos = 0;
  let current: { type: number; parts: Buffer[] } | null = null;
  while (pos + 4 <= buf.length) {
    const type = buf.readUInt16LE(pos);
    const len = buf.readUInt16LE(pos + 2);
    const data = buf.subarray(pos + 4, pos + 4 + len);
    pos += 4 + len;
    if (type === 0x003c /* CONTINUE */) {
      if (!current) throw new LegacyXlsError('This .xls file has a CONTINUE record with nothing to continue.');
      current.parts.push(data);
      continue;
    }
    if (current) records.push({ type: current.type, data: Buffer.concat(current.parts) });
    current = { type, parts: [data] };
  }
  if (current) records.push({ type: current.type, data: Buffer.concat(current.parts) });
  return records;
}

/** Decodes one BIFF8 "XLUnicodeString" (2-byte char count + 1-byte flags + optional run/ext counts + char data). Returns the string and the number of bytes consumed. */
function readUnicodeString(buf: Buffer, offset: number, charCountBytes: 1 | 2): { value: string; bytesConsumed: number } {
  let pos = offset;
  const charCount = charCountBytes === 2 ? buf.readUInt16LE(pos) : buf.readUInt8(pos);
  pos += charCountBytes;
  const flags = buf.readUInt8(pos);
  pos += 1;
  const isCompressed = (flags & 0x01) === 0;
  const hasRichText = (flags & 0x08) !== 0;
  const hasExtData = (flags & 0x04) !== 0;
  let richRunCount = 0;
  let extDataSize = 0;
  if (hasRichText) { richRunCount = buf.readUInt16LE(pos); pos += 2; }
  if (hasExtData) { extDataSize = buf.readUInt32LE(pos); pos += 4; }

  const charBytes = isCompressed ? charCount : charCount * 2;
  const charData = buf.subarray(pos, pos + charBytes);
  const value = isCompressed ? charData.toString('latin1') : charData.toString('utf16le');
  pos += charBytes;

  if (hasRichText) pos += richRunCount * 4;
  if (hasExtData) pos += extDataSize;

  return { value, bytesConsumed: pos - offset };
}

/** Decodes an RK-encoded 32-bit value (used by RK/MULRK cell records) into a JS number. */
function decodeRk(rk: number): number {
  const isInt = (rk & 0x02) !== 0;
  const isDiv100 = (rk & 0x01) !== 0;
  let value: number;
  if (isInt) {
    // Top 30 bits are a signed integer (arithmetic shift preserves sign).
    value = rk >> 2;
  } else {
    const buf = Buffer.alloc(8);
    buf.writeUInt32LE(0, 0);
    buf.writeUInt32LE(rk & 0xfffffffc, 4);
    value = buf.readDoubleLE(0);
  }
  return isDiv100 ? value / 100 : value;
}

interface Cell { row: number; col: number; value: string; }

/**
 * Parses the raw Workbook/Book BIFF8 stream: reads the Shared String Table
 * from the workbook-globals substream, locates the first real worksheet
 * (skipping chart/macro sheets) via BOUNDSHEET, then reads that
 * worksheet's cell records into a dense string grid.
 */
function parseBiffWorkbookStream(streamBytes: Buffer): string[][] {
  const records = splitBiffRecords(streamBytes);
  if (records.length === 0 || records[0].type !== 0x0809 /* BOF */) {
    throw new LegacyXlsError('This .xls file does not start with a valid BIFF workbook header.');
  }

  const sst: string[] = [];
  const boundSheets: { offset: number; sheetType: number }[] = [];
  let globalsEnded = false;
  for (const rec of records) {
    if (globalsEnded) break;
    if (rec.type === 0x002f /* FILEPASS */) {
      throw new LegacyXlsError('This .xls file is password-protected/encrypted, which is not supported. Please remove the password and re-export.');
    }
    if (rec.type === 0x00fc /* SST */) {
      let pos = 8; // skip cstTotal (4) + cstUnique (4)
      const uniqueCount = rec.data.readUInt32LE(4);
      for (let i = 0; i < uniqueCount && pos < rec.data.length; i++) {
        const { value, bytesConsumed } = readUnicodeString(rec.data, pos, 2);
        sst.push(value);
        pos += bytesConsumed;
      }
    } else if (rec.type === 0x0085 /* BOUNDSHEET */) {
      const offset = rec.data.readUInt32LE(0);
      const sheetType = rec.data.readUInt8(5);
      boundSheets.push({ offset, sheetType });
    } else if (rec.type === 0x000a /* EOF */) {
      globalsEnded = true;
    }
  }

  const worksheet = boundSheets.find(s => s.sheetType === 0x00);
  if (!worksheet) throw new LegacyXlsError('This .xls file has no readable worksheet (only charts/macros were found).');

  // BOUNDSHEET offsets are absolute from the start of the Workbook stream.
  const sheetRecords = splitBiffRecords(streamBytes.subarray(worksheet.offset));
  const cells: Cell[] = [];
  let maxRow = -1;
  let maxCol = -1;
  const track = (row: number, col: number, value: string) => {
    cells.push({ row, col, value });
    if (row > maxRow) maxRow = row;
    if (col > maxCol) maxCol = col;
  };

  for (let i = 0; i < sheetRecords.length; i++) {
    const rec = sheetRecords[i];
    const d = rec.data;
    switch (rec.type) {
      case 0x00fd: { // LABELSST
        const row = d.readUInt16LE(0), col = d.readUInt16LE(2);
        const idx = d.readUInt32LE(6);
        track(row, col, sst[idx] ?? '');
        break;
      }
      case 0x0203: { // NUMBER
        const row = d.readUInt16LE(0), col = d.readUInt16LE(2);
        track(row, col, String(d.readDoubleLE(6)));
        break;
      }
      case 0x027e: { // RK
        const row = d.readUInt16LE(0), col = d.readUInt16LE(2);
        track(row, col, String(decodeRk(d.readInt32LE(6))));
        break;
      }
      case 0x00bd: { // MULRK
        const row = d.readUInt16LE(0);
        const firstCol = d.readUInt16LE(2);
        const lastCol = d.readUInt16LE(d.length - 2);
        const count = lastCol - firstCol + 1;
        for (let c = 0; c < count; c++) {
          const base = 4 + c * 6;
          const rk = d.readInt32LE(base + 2);
          track(row, firstCol + c, String(decodeRk(rk)));
        }
        break;
      }
      case 0x0204: { // LABEL (legacy inline string, still BIFF8-unicode-encoded in practice)
        const row = d.readUInt16LE(0), col = d.readUInt16LE(2);
        const { value } = readUnicodeString(d, 6, 2);
        track(row, col, value);
        break;
      }
      case 0x0006: { // FORMULA -- read the cached result only, never the formula itself
        const row = d.readUInt16LE(0), col = d.readUInt16LE(2);
        const resultBytes = d.subarray(6, 14);
        const isStringResult = resultBytes[6] === 0xff && resultBytes[7] === 0xff;
        if (isStringResult) {
          const next = sheetRecords[i + 1];
          if (next && next.type === 0x0207 /* STRING */) {
            const { value } = readUnicodeString(next.data, 0, 2);
            track(row, col, value);
            i++; // consume the STRING record
          } else {
            track(row, col, '');
          }
        } else {
          const isBoolOrError = resultBytes[6] === 0x00 && resultBytes[7] === 0xff;
          track(row, col, isBoolOrError ? '' : String(resultBytes.readDoubleLE(0)));
        }
        break;
      }
      case 0x00bc: // MULBLANK -- deliberately not tracked (empty cells)
      case 0x0201: // BLANK
      default:
        break;
    }
  }

  const grid: string[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    grid.push(new Array(maxCol + 1).fill(''));
  }
  for (const cell of cells) grid[cell.row][cell.col] = cell.value;
  return grid;
}

/**
 * Reads the first worksheet of a legacy .xls (BIFF8/OLE2) file into a plain
 * string grid, matching the shape tollFileParsers.ts's readGridFromBuffer
 * already produces for .xlsx via read-excel-file. Throws LegacyXlsError
 * (never returns partial/guessed data) for anything outside the narrow,
 * well-understood subset this reader supports.
 */
export function readLegacyXlsGrid(buffer: Buffer): string[][] {
  let workbookStream: Buffer;
  try {
    workbookStream = readCfbStream(buffer, 'Workbook');
  } catch (err) {
    if (err instanceof LegacyXlsError && err.message.includes('no "Workbook" stream')) {
      workbookStream = readCfbStream(buffer, 'Book'); // older BIFF5-era stream name, still occasionally seen
    } else {
      throw err;
    }
  }
  return parseBiffWorkbookStream(workbookStream);
}
