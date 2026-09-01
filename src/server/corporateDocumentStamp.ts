import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const OFFICIAL_SEAL_RELATIVE_PATH = join('assets', 'approved', 'splendor-official-seal.svg');
let cachedSealDataUri: string | null = null;

function validateApprovedSealSvg(bytes: Buffer): void {
  const svg = bytes.toString('utf8').trim();
  if (!svg.startsWith('<svg') || !svg.includes('</svg>')) {
    throw new Error('Approved Splendor corporate seal asset is not a valid standalone SVG document.');
  }

  const normalized = svg.toLowerCase();
  if (
    normalized.includes('<script') ||
    normalized.includes('javascript:') ||
    normalized.includes('<foreignobject') ||
    /\b(?:href|xlink:href)\s*=\s*["']https?:/i.test(svg)
  ) {
    throw new Error('Approved Splendor corporate seal contains disallowed active or external content.');
  }

  if (!svg.includes('SPLENDOR CAR RENTAL L.L.C.') || !svg.includes('سبلندر لتأجير السيارات')) {
    throw new Error('Approved Splendor corporate seal does not contain the expected company identity.');
  }
}

export function officialSealDataUri(): string {
  if (cachedSealDataUri) return cachedSealDataUri;

  const candidates = [
    join(process.cwd(), 'dist', OFFICIAL_SEAL_RELATIVE_PATH),
    join(process.cwd(), 'public', OFFICIAL_SEAL_RELATIVE_PATH),
  ];

  for (const filePath of candidates) {
    try {
      const bytes = readFileSync(filePath);
      if (!bytes.length) continue;
      validateApprovedSealSvg(bytes);
      cachedSealDataUri = `data:image/svg+xml;base64,${bytes.toString('base64')}`;
      return cachedSealDataUri;
    } catch (error) {
      // A malformed candidate must not silently become an unofficial fallback.
      // Try the next legitimate deployment/dev copy; if none validate, fail closed.
      if (error instanceof Error && !/ENOENT/.test(String((error as NodeJS.ErrnoException).code || ''))) {
        // Keep searching because dist/public may momentarily differ during a build,
        // but never manufacture or redraw a replacement here.
      }
    }
  }

  throw new Error(
    'Approved Splendor corporate seal asset is missing or invalid. Refusing to render a generated or substitute seal.'
  );
}

export function corporateStampHtml(label = 'ختم وتوقيع سبلندر لتأجير السيارات'): string {
  return `<span class="corporate-stamp-anchor" aria-label="${label}"><img src="${officialSealDataUri()}" alt="Splendor approved corporate seal" /></span>`;
}

/**
 * Applies the approved company seal at the existing company
 * approval/signature anchor without changing the immutable stationery.
 */
export function applyCorporateStamp(body: string): string {
  let stamped = body;

  stamped = stamped.replace(
    /ختم وتوقيع سبلندر لتأجير السيارات: ____________________/g,
    corporateStampHtml()
  );

  stamped = stamped.replace(
    /التوقيع والختم: ____________________/g,
    corporateStampHtml('التوقيع والختم')
  );

  stamped = stamped.replace(
    /اعتماد الإدارة: ____________________/g,
    corporateStampHtml('اعتماد الإدارة')
  );

  // Vehicle record cards and account statements currently have no explicit
  // company-signature anchor, so add one controlled approval mark at the end.
  if (
    !stamped.includes('corporate-stamp-anchor') &&
    (stamped.includes('بطاقة مركبة') || stamped.includes('كشف حساب'))
  ) {
    stamped += `<div class="corporate-approval-block">${corporateStampHtml('اعتماد سبلندر')}</div>`;
  }

  return stamped;
}
