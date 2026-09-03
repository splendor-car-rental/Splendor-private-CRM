import React, { useState, useEffect, useRef } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import { formatDate, formatDateLocalized, parseDayMonthYearToIso } from '../../lib/dateFormat';

export interface DayMonthYearDateInputProps {
  value: string; // Stored in YYYY-MM-DD
  onChange: (isoDate: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  isExpired?: boolean;
  isExpiringSoon?: boolean;
  isAr?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}

/**
 * Splendor Day/Month/Year Date Input Component.
 *
 * Strict Mandate:
 * All dates must strictly display and accept Day/Month/Year (يوم/شهر/سنة - DD/MM/YYYY),
 * never Month/Day/Year (MM/DD/YYYY) -- a native <input type="date"> renders
 * in the browser's own locale, which is not guaranteed to be DD/MM/YYYY.
 *
 * Provides:
 * 1. An explicit Day/Month/Year text field with auto-slashing (DD/MM/YYYY).
 * 2. A calendar picker button allowing easy point-and-click date selection.
 * 3. Clear format indicator and localized date preview underneath.
 */
export const DayMonthYearDateInput: React.FC<DayMonthYearDateInputProps> = ({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  min,
  max,
  isExpired = false,
  isExpiringSoon = false,
  isAr = true,
  className = '',
  placeholder = 'DD/MM/YYYY',
  id
}) => {
  // Display text in DD/MM/YYYY
  const [displayText, setDisplayText] = useState<string>(() => {
    return value ? formatDate(value) : '';
  });
  const [inputError, setInputError] = useState<string | null>(null);
  const hiddenDateInputRef = useRef<HTMLInputElement>(null);

  // Synchronize when value changes externally (e.g., presets or resets)
  useEffect(() => {
    if (!value) {
      setDisplayText('');
      setInputError(null);
    } else {
      const formatted = formatDate(value);
      setDisplayText(formatted);
      setInputError(null);
    }
  }, [value]);

  // Handle direct text typing by user
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // Auto-insert slash after 2 digits and 4 digits if typing numbers sequentially
    // But allow backspace/deletion without getting stuck
    const numbersOnly = raw.replace(/[^\d]/g, '');
    let formatted = raw;

    if (!raw.includes('/') && !raw.includes('-') && numbersOnly.length > 2) {
      if (numbersOnly.length <= 4) {
        formatted = `${numbersOnly.slice(0, 2)}/${numbersOnly.slice(2)}`;
      } else {
        formatted = `${numbersOnly.slice(0, 2)}/${numbersOnly.slice(2, 4)}/${numbersOnly.slice(4, 8)}`;
      }
    }

    setDisplayText(formatted);

    // If empty and not required
    if (!formatted.trim()) {
      setInputError(null);
      onChange('');
      return;
    }

    // Try parsing as DD/MM/YYYY
    const parsedIso = parseDayMonthYearToIso(formatted);
    if (parsedIso) {
      setInputError(null);
      onChange(parsedIso);
    } else if (numbersOnly.length === 8) {
      setInputError(isAr ? 'صيغة التاريخ غير صالحة. المطلوب: يوم/شهر/سنة' : 'Invalid date. Required: DD/MM/YYYY');
    }
  };

  const handleBlur = () => {
    if (!displayText.trim()) {
      if (required) {
        setInputError(isAr ? 'حقل التاريخ مطلوب' : 'Date is required');
      }
      return;
    }

    const parsedIso = parseDayMonthYearToIso(displayText);
    if (parsedIso) {
      setInputError(null);
      onChange(parsedIso);
      setDisplayText(formatDate(parsedIso));
    } else {
      setInputError(isAr ? 'تاريخ غير صالح (المطلوب: يوم/شهر/سنة مثال 15/01/2028)' : 'Invalid date (Required: DD/MM/YYYY e.g. 15/01/2028)');
    }
  };

  // Open the native date picker popover
  const triggerCalendarPicker = () => {
    if (disabled) return;
    if (hiddenDateInputRef.current) {
      try {
        if ('showPicker' in HTMLInputElement.prototype) {
          hiddenDateInputRef.current.showPicker();
        } else {
          hiddenDateInputRef.current.focus();
        }
      } catch {
        hiddenDateInputRef.current.focus();
      }
    }
  };

  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pickedIso = e.target.value; // In YYYY-MM-DD format
    if (pickedIso) {
      onChange(pickedIso);
      setDisplayText(formatDate(pickedIso));
      setInputError(null);
    }
  };

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Label with mandatory Day/Month/Year badge */}
      {label && (
        <div className="flex items-center justify-between gap-2 mb-1">
          <label htmlFor={id} className="block text-[11px] font-medium text-zinc-300">
            {label}
            {required && <span className="text-rose-400 font-bold ml-0.5">*</span>}
            <span className="text-[10px] text-zinc-400 ml-1.5 font-normal">
              {isAr ? '(يوم/شهر/سنة)' : '(DD/MM/YYYY)'}
            </span>
          </label>

          {isExpired && (
            <span className="text-[10px] font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-500/40">
              {isAr ? 'منتهية الصلاحية' : 'Expired'}
            </span>
          )}
          {!isExpired && isExpiringSoon && (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40">
              {isAr ? 'تنتهي قريباً' : 'Expiring Soon'}
            </span>
          )}
        </div>
      )}

      {/* Date Input Field with Calendar Trigger */}
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          value={displayText}
          onChange={handleTextChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder || (isAr ? 'يوم / شهر / سنة (DD/MM/YYYY)' : 'DD/MM/YYYY')}
          dir="ltr"
          className={`w-full px-3 py-2 pr-10 rounded-xl bg-zinc-900 border text-zinc-100 font-mono text-xs focus:outline-none transition-all ${
            isExpired
              ? 'border-rose-500 bg-rose-950/20 text-rose-200'
              : inputError
              ? 'border-rose-500/80 bg-rose-950/10'
              : 'border-zinc-800 focus:border-[#D4AF37]/60'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />

        {/* Hidden native date picker to keep UI strictly in DD/MM/YYYY while leveraging OS calendar */}
        <input
          ref={hiddenDateInputRef}
          type="date"
          value={value || ''}
          min={min}
          max={max}
          onChange={handleNativeDateChange}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute right-2 opacity-0 pointer-events-none w-1 h-1"
        />

        {/* Calendar Picker Trigger Button */}
        <button
          type="button"
          onClick={triggerCalendarPicker}
          disabled={disabled}
          title={isAr ? 'اختيار التاريخ من التقويم' : 'Pick date from calendar'}
          className="absolute right-2 p-1.5 rounded-lg text-zinc-400 hover:text-[#f5d97f] hover:bg-zinc-800 active:scale-95 transition-all"
        >
          <Calendar className="w-4 h-4 text-[#D4AF37]" />
        </button>
      </div>

      {/* Validation error or selected preview confirmation */}
      {inputError ? (
        <div className="flex items-center gap-1 text-[10px] text-rose-400 font-medium">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{inputError}</span>
        </div>
      ) : value ? (
        <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
          <span>
            {isAr ? 'المحدد: ' : 'Selected: '}
            <strong className="text-[#f5d97f] font-mono font-semibold">
              {formatDate(value)}
            </strong>
            <span className="text-zinc-500 ml-1">
              ({formatDateLocalized(value, isAr)})
            </span>
          </span>
          <span className="text-[9px] font-mono text-zinc-500">
            {isAr ? 'يوم / شهر / سنة' : 'DD/MM/YYYY'}
          </span>
        </div>
      ) : (
        <div className="text-[10px] text-zinc-500">
          {isAr ? 'الصيغة المعتمدة: يوم / شهر / سنة (مثال: 15/01/2028)' : 'Format: DD/MM/YYYY (e.g. 15/01/2028)'}
        </div>
      )}
    </div>
  );
};
