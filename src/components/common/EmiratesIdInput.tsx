import React from 'react';

export interface EmiratesIdInputProps {
  value: string;
  onChange: (formatted: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  isAr?: boolean;
  className?: string;
  id?: string;
}

/** 784-YYYY-XXXXXXX-X: 3 + 4 + 7 + 1 = 15 digits total. */
function maskEmiratesId(digits: string): string {
  const d = digits.slice(0, 15);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 7);
  const p3 = d.slice(7, 14);
  const p4 = d.slice(14, 15);
  return [p1, p2, p3, p4].filter(Boolean).join('-');
}

/**
 * Live-formatting Emirates ID input (784-YYYY-XXXXXXX-X). Strips any
 * non-digit character as it's typed or pasted (no garbage input can ever
 * reach the stored value) and is always forced left-to-right/monospace
 * regardless of the active UI language, since the ID is a fixed numeric
 * layout, not translatable text.
 */
export const EmiratesIdInput: React.FC<EmiratesIdInputProps> = ({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  isAr = true,
  className = '',
  id
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 15);
    onChange(maskEmiratesId(digits));
  };

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-[11px] text-zinc-400 mb-1">
          {label}
          {required && <span className="text-rose-400 font-bold ml-0.5">*</span>}
        </label>
      )}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        value={value}
        onChange={handleChange}
        dir="ltr"
        placeholder="784-YYYY-XXXXXXX-X"
        className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono tracking-wide"
        style={{ direction: 'ltr' }}
      />
    </div>
  );
};
