import React from 'react';
import splendorLogoImage from '../../assets/splendor-logo.png';

interface SplendorLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  showText?: boolean;
}

/**
 * Renders the official Splendor Car Rental crest (provided brand asset).
 * Previously this was a hand-drawn SVG approximation of the logo; it now
 * renders the real artwork supplied by the business.
 */
export const SplendorLogo: React.FC<SplendorLogoProps> = ({ size = 'md', className = '' }) => {
  let dimension = 48;
  if (typeof size === 'number') {
    dimension = size;
  } else {
    switch (size) {
      case 'xs':
        dimension = 28;
        break;
      case 'sm':
        dimension = 36;
        break;
      case 'md':
        dimension = 48;
        break;
      case 'lg':
        dimension = 72;
        break;
      case 'xl':
        dimension = 120;
        break;
    }
  }

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <img
        src={splendorLogoImage}
        alt="Splendor Car Rental"
        width={dimension}
        height={dimension}
        style={{ width: dimension, height: dimension }}
        referrerPolicy="no-referrer"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = '/splendor-logo.png';
        }}
        className="rounded-full object-cover border border-[#D4AF37]/50 drop-shadow-[0_4px_12px_rgba(212,175,55,0.35)] select-none"
      />
    </div>
  );
};
