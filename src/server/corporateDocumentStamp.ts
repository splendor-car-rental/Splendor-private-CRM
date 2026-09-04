import { SPLENDOR_RED_STAMP_SVG } from './assets/splendorStampAsset.js';

const STAMP_DATA_URI =
  `data:image/svg+xml;base64,${Buffer.from(SPLENDOR_RED_STAMP_SVG, 'utf8').toString('base64')}`;

export function corporateStampHtml(label = 'ختم وتوقيع سبلندر لتأجير السيارات'): string {
  return `<span class="corporate-stamp-anchor" aria-label="${label}"><img src="${STAMP_DATA_URI}" alt="Splendor corporate stamp" /></span>`;
}

/**
 * Applies the approved red company stamp at the existing company
 * approval/signature anchor without changing the immutable letterhead.
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
