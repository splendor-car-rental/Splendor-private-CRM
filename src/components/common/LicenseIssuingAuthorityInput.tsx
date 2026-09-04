import React from 'react';
import { DRIVING_LICENSE_ISSUING_AUTHORITIES } from '../../lib/customerData';

export interface LicenseIssuingAuthorityInputProps {
  value: string;
  onChange: (value: string) => void;
  licenseCountry: string;
  label?: string;
  disabled?: boolean;
  isAr?: boolean;
  className?: string;
  id?: string;
}

/** The first 7 entries are exactly the 7 Emirates' traffic/licensing authorities. */
const UAE_LICENSE_AUTHORITIES = DRIVING_LICENSE_ISSUING_AUTHORITIES.slice(0, 7);

/**
 * For a UAE-issued driving license, shows a dropdown of all 7 Emirates'
 * issuing authorities (previously the field silently defaulted to
 * "RTA Dubai" as free text with no other Emirate ever selectable). For any
 * other license country, falls back to free text -- there is no way to
 * enumerate every foreign traffic authority.
 */
export const LicenseIssuingAuthorityInput: React.FC<LicenseIssuingAuthorityInputProps> = ({
  value,
  onChange,
  licenseCountry,
  label,
  disabled = false,
  isAr = true,
  className = '',
  id
}) => {
  const isUae = licenseCountry === 'United Arab Emirates';

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-[11px] text-zinc-400 mb-1">{label}</label>
      )}
      {isUae ? (
        <select
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
        >
          {!UAE_LICENSE_AUTHORITIES.some(a => a.nameEn === value) && value && (
            <option value={value}>{value}</option>
          )}
          {UAE_LICENSE_AUTHORITIES.map(a => (
            <option key={a.id} value={a.nameEn}>{isAr ? a.nameAr : a.nameEn}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder={isAr ? 'جهة إصدار الرخصة' : 'License issuing authority'}
          className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
        />
      )}
    </div>
  );
};
