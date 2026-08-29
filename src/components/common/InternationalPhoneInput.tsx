import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, Phone } from 'lucide-react';
import { ALL_COUNTRIES } from '../../lib/customerData';

export interface CountryDialCode {
  iso: string;
  name: string;
  nameAr: string;
  code: string; // e.g. "+971"
  flag: string;
  placeholder: string;
}

export const COUNTRY_DIAL_CODES: CountryDialCode[] = ALL_COUNTRIES.map(c => ({
  iso: c.iso,
  name: c.name,
  nameAr: c.nameAr,
  code: c.code,
  flag: c.flag,
  placeholder: c.placeholder
}));

interface InternationalPhoneInputProps {
  value: string;
  onChange: (fullPhoneNumber: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  isAr?: boolean;
  id?: string;
}

export const InternationalPhoneInput: React.FC<InternationalPhoneInputProps> = ({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  placeholder,
  className = '',
  isAr = false,
  id
}) => {
  // Parse incoming value to determine matching country dial code & local number
  const parsed = useMemo(() => {
    const clean = (value || '').trim();
    if (!clean) return { dialCode: '+971', localNumber: '' };

    for (const c of COUNTRY_DIAL_CODES) {
      if (clean.startsWith(c.code)) {
        const local = clean.slice(c.code.length).trim();
        return { dialCode: c.code, localNumber: local };
      }
    }

    if (clean.startsWith('+')) {
      // Custom dial code not in our list
      const parts = clean.split(' ');
      return { dialCode: parts[0], localNumber: parts.slice(1).join(' ') };
    }

    // Default to UAE +971
    return { dialCode: '+971', localNumber: clean };
  }, [value]);

  const [selectedDialCode, setSelectedDialCode] = useState<string>(parsed.dialCode);
  const [localNumber, setLocalNumber] = useState<string>(parsed.localNumber);

  useEffect(() => {
    setSelectedDialCode(parsed.dialCode);
    setLocalNumber(parsed.localNumber);
  }, [parsed.dialCode, parsed.localNumber]);

  const selectedCountry = useMemo(() => {
    return COUNTRY_DIAL_CODES.find(c => c.code === selectedDialCode) || COUNTRY_DIAL_CODES[0];
  }, [selectedDialCode]);

  const handleDialCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCode = e.target.value;
    setSelectedDialCode(newCode);
    const combined = localNumber ? `${newCode} ${localNumber}` : newCode;
    onChange(combined);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLocal = e.target.value;
    setLocalNumber(newLocal);
    const combined = newLocal.trim() ? `${selectedDialCode} ${newLocal.trim()}` : '';
    onChange(combined);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-zinc-300 flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>{label}</span> {required && <span className="text-rose-400">*</span>}
        </label>
      )}

      {/* Container with strict LTR direction so +971 is on the left */}
      <div 
        dir="ltr" 
        className="flex items-center rounded-xl bg-zinc-900 border border-zinc-800 focus-within:border-[#D4AF37]/60 focus-within:ring-1 focus-within:ring-[#D4AF37]/30 transition-all overflow-hidden"
      >
        {/* Country Selector Dropdown */}
        <div className="relative flex items-center shrink-0 border-r border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
          <span className="text-base mr-1.5 select-none">{selectedCountry.flag}</span>
          <span className="text-xs font-mono font-bold text-[#f5d97f] mr-1">{selectedCountry.code}</span>
          <ChevronDown className="w-3 h-3 text-zinc-400 pointer-events-none" />
          
          <select
            value={selectedCountry.code}
            onChange={handleDialCodeChange}
            disabled={disabled}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            title={isAr ? 'اختر الدولة ورمز الاتصال الدولي' : 'Select Country & Dial Code'}
          >
            {COUNTRY_DIAL_CODES.map((c) => (
              <option key={c.code + c.iso} value={c.code} className="bg-zinc-900 text-zinc-100 py-1">
                {c.flag} {c.code} ({isAr ? c.nameAr : c.name})
              </option>
            ))}
          </select>
        </div>

        {/* Local Number Input (LTR) */}
        <input
          id={id}
          type="tel"
          dir="ltr"
          required={required}
          disabled={disabled}
          value={localNumber}
          onChange={handleNumberChange}
          placeholder={placeholder || selectedCountry.placeholder}
          className="w-full px-3 py-2 bg-transparent text-zinc-100 text-xs font-mono focus:outline-none placeholder:text-zinc-600"
        />
      </div>
    </div>
  );
};
