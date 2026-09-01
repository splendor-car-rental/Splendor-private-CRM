import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LTO_LETTERHEAD_FOOTER_PNG_BASE64,
  LTO_LETTERHEAD_HEADER_PNG_BASE64
} from '../src/server/assets/ltoLetterheadAsset';

function pngDetails(base64: string) {
  const bytes = Buffer.from(base64, 'base64');
  return {
    bytes,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

describe('approved corporate letterhead raster assets', () => {
  it('keeps the exact approved header crop instead of a transparent placeholder', () => {
    const header = pngDetails(LTO_LETTERHEAD_HEADER_PNG_BASE64);

    expect(header.bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect({ width: header.width, height: header.height }).toEqual({ width: 1654, height: 300 });
    expect(header.sha256).toBe('1e315d503b75de28f889646a05fc86b5a54aa7555443bd413a8d1eab181a7c45');
  });

  it('keeps the exact approved footer crop instead of a transparent placeholder', () => {
    const footer = pngDetails(LTO_LETTERHEAD_FOOTER_PNG_BASE64);

    expect(footer.bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect({ width: footer.width, height: footer.height }).toEqual({ width: 1654, height: 85 });
    expect(footer.sha256).toBe('5dad7bfaf2bd9e326e783146253bc3cefc881d065d39844884d418dfb347463e');
  });
});
