# Document Letterhead

Every official document this system generates — LTO contracts
(`leaseToOwnContractDocument.ts`) and everything in
`corporateDocumentEngine.ts` (LPOs, tax invoices, payment receipts,
account statements, official letters, contract extension addenda,
quotations, credit/debit notes, fines notices, vehicle record/exit
documents) — shares one pair of real letterhead assets:
`src/server/assets/ltoLetterheadAsset.ts`
(`LTO_LETTERHEAD_HEADER_JPEG_BASE64`, `LTO_LETTERHEAD_FOOTER_PNG_BASE64`).

## History

From the system's inception through 2026-09-03, both constants held a
1x1 transparent-green placeholder pixel instead of real artwork — every
document generated in that window rendered with a solid green bar where
the approved Splendor header (Dubai skyline banner) and footer (contact
info bar) should have been. This was not caught by code review, since
the base64 string looked like valid image data at a glance; it was only
found by actually rendering a sample PDF and looking at it.

The user supplied the real letterhead (master blank template plus
several real filled document samples, all sharing the same approved
header/footer) on 2026-09-03. The assets now embedded were extracted
from the master template at 600 DPI, cropped to the header/footer bands,
and downsampled: header saved as JPEG (a photographic background
compresses far smaller than PNG at equivalent quality), footer saved as
PNG (a flat-color bar with sharp text/icons, where PNG is both smaller
and artifact-free).

## Sizing: header/footer margins must match the image aspect ratio

Both `page.pdf()` call sites use `displayHeaderFooter: true` with a
`headerTemplate`/`footerTemplate` containing `<img style="width:100%">`.
Chromium renders that template into a fixed-height box equal to the
`margin.top` (header) / `margin.bottom` (footer) passed to `page.pdf()`
— it does **not** scale the box to fit the image; content taller than
the box is simply clipped. Because the placeholder was a 1x1 pixel, its
aspect ratio never mattered and any margin worked. With a real image,
the margin must be sized to match how tall the image renders when
stretched to the full A4 printable width (no left/right margin):

- Header image: 1240x350px (aspect 3.543). At A4's ~793.7px printable
  width, it renders ~224px (~59.3mm) tall.
- Footer image: 1240x93px (aspect 13.333). At the same width, it
  renders ~59.5px (~15.75mm) tall.

Current settings (rounded up slightly from the exact figures, to avoid
clipping from sub-pixel rounding):

| File | top margin | bottom margin |
|---|---|---|
| `leaseToOwnContractDocument.ts` (`renderLtoContractPdf`, px units) | `226px` | `60px` |
| `corporateDocumentEngine.ts` (`issueAndRenderCorporateDocument`, mm units) | `60mm` | `16mm` |

If the letterhead artwork is ever replaced again, recompute these two
numbers from the new image's pixel dimensions before shipping — do not
reuse the old margins, and do not trust that the placeholder-era numbers
were ever meaningful.

## Verifying a change

There is no automated visual regression test for PDF rendering. To
verify a letterhead or margin change, render a real sample through
Puppeteer (`puppeteer-core` with `executablePath:
'/opt/pw-browsers/chromium'` works in this environment) and inspect the
output PDF's first page directly — reading the code or the base64
string is not sufficient, since that is exactly how the original
placeholder bug went unnoticed.
