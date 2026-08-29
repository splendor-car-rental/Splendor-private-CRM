import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  translations,
  getStatusLabel,
  getRoleLabel,
  getCategoryLabel,
  getPaymentMethodLabel,
  getKycStatusLabel,
  getDocCategoryLabel,
  getPriorityLabel,
  formatCurrency
} from '../i18n/translations';
import { Language } from '../types';

interface LanguageContextType {
  language: Language;
  direction: 'ltr' | 'rtl';
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations.en | string) => string;
  getStatusLabel: (status: string | undefined | null) => string;
  getRoleLabel: (role: string | undefined | null) => string;
  getCategoryLabel: (category: string | undefined | null) => string;
  getPaymentMethodLabel: (method: string | undefined | null) => string;
  getKycStatusLabel: (status: string | undefined | null) => string;
  getDocCategoryLabel: (category: string | undefined | null) => string;
  getPriorityLabel: (priority: string | undefined | null) => string;
  formatCurrency: (amount: number | string | undefined | null) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('splendor_lang') as Language) || 'en';
  });

  const direction = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    localStorage.setItem('splendor_lang', language);
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
  }, [language, direction]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: keyof typeof translations.en | string): string => {
    const dict = (translations as any)[language] || translations.en;
    if (dict && dict[key]) {
      return dict[key];
    }
    if ((translations.en as any)[key]) {
      return (translations.en as any)[key];
    }
    return String(key);
  };

  return (
    <LanguageContext.Provider value={{
      language,
      direction,
      setLanguage,
      t,
      getStatusLabel: (status) => getStatusLabel(status, language),
      getRoleLabel: (role) => getRoleLabel(role, language),
      getCategoryLabel: (cat) => getCategoryLabel(cat, language),
      getPaymentMethodLabel: (method) => getPaymentMethodLabel(method, language),
      getKycStatusLabel: (status) => getKycStatusLabel(status, language),
      getDocCategoryLabel: (cat) => getDocCategoryLabel(cat, language),
      getPriorityLabel: (priority) => getPriorityLabel(priority, language),
      formatCurrency: (amount) => formatCurrency(amount, language)
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};
