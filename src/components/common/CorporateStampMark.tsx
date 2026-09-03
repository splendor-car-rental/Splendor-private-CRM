import React from 'react';
import { SPLENDOR_RED_STAMP_SVG } from '../../server/assets/splendorStampAsset';

/**
 * The approved red corporate stamp, for the company approval/signature
 * anchor on a browser-rendered document (the server-side PDF generators
 * place the same asset via corporateDocumentStamp.ts's applyCorporateStamp).
 * Never redrawn or substituted -- this renders the one approved SVG asset
 * verbatim.
 */
export const CorporateStampMark: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <span
    className={`inline-block ${className}`}
    role="img"
    aria-label="Splendor Car Rental -- Official Corporate Stamp"
    dangerouslySetInnerHTML={{ __html: SPLENDOR_RED_STAMP_SVG }}
  />
);
