import React, { useMemo, useState } from 'react';
import { ALL_COUNTRIES } from '../../lib/customerData';

export interface PhoneNumberInputProps {
  value: string;
  onChange: (fullPhone: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  isAr?: boolean;
  className?: string;
  id?: string;
  defaultCountryIso?: string;
}

function groupNationalNumber(digits: string): string {
  if (!digits) return '';
  const head = digits.slice(0, 2);
  const rest = digits.slice(2);
  const groups: string[] = [head];
  for (let i = 0; i < rest.length; i += 3) {
    groups.push(rest.slice(i, i + 3));
  }
  if (groups.length > 2 && groups[groups.length - 1].length === 1) {
    const last = groups.pop() as string;
    groups[groups.length - 1] += last;
  }
  return groups.filter(Boolean).join(' ');
}

function splitFullPhone(value: string): { code: string; nationalDigits: string } {
  const trimmed = (value || '').trim();
  if (!trimmed) return { code: '+971', nationalDigits: '' };
  const byCodeLength = [...ALL_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  const match = byCodeLength.find(c => trimmed.startsWith(c.code));
  if (!match) {
    return { code: '+971', nationalDigits: trimmed.replace(/[^\d]/g, '') };
  }
  const rest = trimmed.slice(match.code.length).replace(/[^\d]/g, '');
  return { code: match.code, nationalDigits: rest };
}

/**
 * Country-code + mobile-number input producing the single unified system
 * format ("+971 50 123 4567" -- see formatPhoneNumber in lib/dateFormat.ts)
 * instead of asking the user to type the "+" and country code by hand.
 */
export const PhoneNumberInput: React.FC<PhoneNumberInputProps> = ({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  isAr = true,
  className = '',
  id,
  defaultCountryIso = 'AE'
}) => {
  const initial = useMemo(() => splitFullPhone(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [code, setCode] = useState<string>(initial.code || (ALL_COUNTRIES.find(c => c.iso === defaultCountryIso)?.code ?? '+971'));
  const [nationalDigits, setNationalDigits] = useState<string>(initial.nationalDigits);

  const selectedCountry = ALL_COUNTRIES.find(c => c.code === code) || ALL_COUNTRIES.find(c => c.iso === 'AE')!;

  const emit = (nextCode: string, nextDigits: string) => {
    const combined = nextDigits ? `${nextCode} ${groupNationalNumber(nextDigits)}` : nextCode;
    onChange(combined);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextCode = e.target.value;
    setCode(nextCode);
    emit(nextCode, nationalDigits);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 12);
    setNationalDigits(digits);
    emit(code, digits);
  };

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-zinc-300 mb-1.5">
          {label}
          {required && <span className="text-rose-400 font-bold ml-0.5">*</span>}
        </label>
      )}
      <div className="flex gap-2" dir="ltr">
        <select
          value={code}
          onChange={handleCodeChange}
          disabled={disabled}
          aria-label={isAr ? 'كود الدولة' : 'Country code'}
          className="w-[6.5rem] shrink-0 px-2 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
        >
          {ALL_COUNTRIES.map(c => (
            <option key={c.iso} value={c.code}>{c.flag} {c.code}</option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          required={required}
          disabled={disabled}
          value={nationalDigits}
          onChange={handleNumberChange}
          dir="ltr"
          placeholder={selectedCountry.placeholder}
          className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
        />
      </div>
    </div>
  );
};
