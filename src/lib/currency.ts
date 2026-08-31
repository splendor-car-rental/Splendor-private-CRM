export interface CurrencyOption {
  code: string;
  symbol: string;
  nameEn: string;
  nameAr: string;
  rateToAED: number; // 1 Unit of Currency = X AED (e.g., 1 USD = 3.6725 AED)
  flag: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'AED', symbol: 'د.إ', nameEn: 'UAE Dirham', nameAr: 'درهم إماراتي', rateToAED: 1.0, flag: '🇦🇪' },
  { code: 'USD', symbol: '$', nameEn: 'US Dollar', nameAr: 'دولار أمريكي', rateToAED: 3.6725, flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', nameEn: 'Euro', nameAr: 'يورو أوروبي', rateToAED: 3.98, flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', nameEn: 'British Pound', nameAr: 'جنيه إسترليني', rateToAED: 4.68, flag: '🇬🇧' },
  { code: 'SAR', symbol: 'ر.س', nameEn: 'Saudi Riyal', nameAr: 'ريال سعودي', rateToAED: 0.979, flag: '🇸🇦' },
  { code: 'QAR', symbol: 'ر.ق', nameEn: 'Qatari Riyal', nameAr: 'ريال قطري', rateToAED: 1.009, flag: '🇶🇦' },
  { code: 'KWD', symbol: 'د.ك', nameEn: 'Kuwaiti Dinar', nameAr: 'دينار كويتي', rateToAED: 11.98, flag: '🇰🇼' },
  { code: 'OMR', symbol: 'ر.ع', nameEn: 'Omani Rial', nameAr: 'ريال عماني', rateToAED: 9.54, flag: '🇴🇲' },
  { code: 'BHD', symbol: 'د.ب', nameEn: 'Bahraini Dinar', nameAr: 'دينار بحريني', rateToAED: 9.74, flag: '🇧🇭' },
  { code: 'RUB', symbol: '₽', nameEn: 'Russian Ruble', nameAr: 'روبل روسي', rateToAED: 0.041, flag: '🇷🇺' },
  { code: 'CHF', symbol: 'CHF', nameEn: 'Swiss Franc', nameAr: 'فرنك سويسري', rateToAED: 4.18, flag: '🇨🇭' },
  { code: 'CNY', symbol: '¥', nameEn: 'Chinese Yuan', nameAr: 'يوان صيني', rateToAED: 0.51, flag: '🇨🇳' }
];

export function convertAEDToCurrency(amountInAED: number, currencyCode: string = 'AED'): number {
  const curr = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode) || SUPPORTED_CURRENCIES[0];
  if (curr.code === 'AED' || curr.rateToAED <= 0) return amountInAED;
  return Number((amountInAED / curr.rateToAED).toFixed(2));
}

export function convertCurrencyToAED(amountInForeign: number, currencyCode: string = 'AED'): number {
  const curr = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode) || SUPPORTED_CURRENCIES[0];
  if (curr.code === 'AED') return amountInForeign;
  return Number((amountInForeign * curr.rateToAED).toFixed(2));
}

export function formatAED(amount: number, isAr: boolean = false): string {
  return `${(amount || 0).toLocaleString()} ${isAr ? 'د.إ' : 'AED'}`;
}

export function formatPriceWithCurrency(
  amountInAED: number,
  currencyCode: string = 'AED',
  isAr: boolean = false
): string {
  const curr = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode) || SUPPORTED_CURRENCIES[0];
  const converted = convertAEDToCurrency(amountInAED, curr.code);
  
  if (curr.code === 'AED') {
    return `${converted.toLocaleString()} ${isAr ? 'د.إ' : 'AED'}`;
  }

  const symbol = curr.symbol;
  return `${symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr.code} (${amountInAED.toLocaleString()} ${isAr ? 'د.إ' : 'AED'})`;
}
