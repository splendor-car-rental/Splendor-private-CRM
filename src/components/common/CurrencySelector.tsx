import React from 'react';
import { DollarSign } from 'lucide-react';
import { SUPPORTED_CURRENCIES, CurrencyOption } from '../../lib/currency';

interface CurrencySelectorProps {
  selectedCurrency: string;
  onCurrencyChange: (currencyCode: string) => void;
  label?: string;
  className?: string;
  isAr?: boolean;
  size?: 'sm' | 'md';
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  selectedCurrency,
  onCurrencyChange,
  label,
  className = '',
  isAr = false,
  size = 'md'
}) => {
  const current = SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrency) || SUPPORTED_CURRENCIES[0];

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-zinc-300 flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>{label}</span>
        </label>
      )}
      <div className="relative">
        <select
          value={selectedCurrency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className={`w-full ${
            size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-2 text-xs'
          } rounded-xl bg-zinc-900 border border-zinc-800 text-[#f5d97f] font-semibold focus:outline-none focus:border-[#D4AF37]/60 cursor-pointer`}
        >
          {SUPPORTED_CURRENCIES.map((curr) => (
            <option key={curr.code} value={curr.code} className="bg-zinc-900 text-zinc-100">
              {curr.flag} {curr.code} - {isAr ? curr.nameAr : curr.nameEn} ({curr.symbol}) {curr.code !== 'AED' ? `[1 ${curr.code} ≈ ${curr.rateToAED} AED]` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
