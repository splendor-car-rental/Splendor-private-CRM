import React, { useState } from 'react';
import {
  Search, Bell, Plus, Sparkles, Shield, UserPlus,
  Car, FileSignature, Landmark, RefreshCw, Globe, ChevronDown,
  FileText, CalendarCheck, CheckCircle2, Menu
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { NotificationsDrawer } from './NotificationsDrawer';
import { GlobalSearchModal } from './GlobalSearchModal';
import { AddVehicleModal } from '../modals/AddVehicleModal';
import { AddCustomerModal } from '../modals/AddCustomerModal';
import { AddContractModal } from '../modals/AddContractModal';

interface HeaderProps {
  onOpenNewCustomer?: () => void;
  onOpenNewReservation?: () => void;
  onOpenNewQuotation?: () => void;
  onOpenRecordPayment?: () => void;
  onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewCustomer,
  onOpenNewReservation,
  onOpenNewQuotation,
  onOpenRecordPayment,
  onMenuClick
}) => {
  const { language, setLanguage, t } = useLanguage();
  const {
    globalSearchOpen, setGlobalSearchOpen,
    notifications, fetchData, loading
  } = useCRM();

  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addContractOpen, setAddContractOpen] = useState(false);

  const unreadNotifCount = notifications.filter(n => !n.read).length;

  const chooseLanguage = (nextLanguage: 'ar' | 'en') => {
    setLanguage(nextLanguage);
    setLanguageMenuOpen(false);
  };

  return (
    <>
      <header className="h-16 px-3 sm:px-6 bg-zinc-950/90 border-b border-zinc-800/80 backdrop-blur-md flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-20">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 -ms-1 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex-1 max-w-xl min-w-0">
          <button
            onClick={() => setGlobalSearchOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-[#D4AF37]/40 text-zinc-400 hover:text-zinc-200 transition-all text-xs lg:text-sm group"
          >
            <div className="flex items-center gap-2.5 truncate">
              <Search className="w-3.5 h-3.5 text-zinc-500 group-hover:text-[#D4AF37] transition-colors shrink-0" />
              <span className="truncate">{t('searchPlaceholder')}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-[10px] text-zinc-400 border border-zinc-700/60 font-mono">⌘</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-[10px] text-zinc-400 border border-zinc-700/60 font-mono">K</kbd>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-zinc-300 font-mono text-[10px] uppercase tracking-wider">Cloud Live</span>
          </div>

          {/* Desktop language switcher */}
          <div className="hidden sm:flex items-center bg-zinc-900/70 p-0.5 rounded-xl border border-zinc-800">
            <button
              onClick={() => chooseLanguage('ar')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${language === 'ar' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/35 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="التحويل للغة العربية"
              aria-label="العربية"
            >
              <span>العربية</span>
            </button>
            <button
              onClick={() => chooseLanguage('en')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${language === 'en' ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/35 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Switch to English"
              aria-label="English"
            >
              <span>EN</span>
            </button>
          </div>

          {/* Compact mobile language control */}
          <div className="relative sm:hidden">
            <button
              onClick={() => setLanguageMenuOpen(value => !value)}
              className="w-9 h-9 rounded-xl border border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:text-[#f5d97f] hover:border-[#D4AF37]/35 flex items-center justify-center transition-all"
              aria-label={language === 'ar' ? 'تغيير اللغة' : 'Change language'}
              aria-expanded={languageMenuOpen}
            >
              <Globe className="w-4 h-4" />
            </button>
            {languageMenuOpen && (
              <div className="absolute end-0 mt-2 w-32 rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl p-1.5 z-50">
                <button
                  onClick={() => chooseLanguage('ar')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${language === 'ar' ? 'bg-[#D4AF37]/15 text-[#f5d97f]' : 'text-zinc-300 hover:bg-zinc-900'}`}
                >
                  <span>العربية</span>
                  {language === 'ar' && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => chooseLanguage('en')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${language === 'en' ? 'bg-[#D4AF37]/15 text-[#f5d97f]' : 'text-zinc-300 hover:bg-zinc-900'}`}
                >
                  <span>English</span>
                  {language === 'en' && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-[#f5d97f] hover:border-[#D4AF37]/30 hover:bg-zinc-900/60 transition-all"
            title={language === 'ar' ? 'تحديث ومزامنة البيانات' : 'Refresh and Synchronize'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#D4AF37]' : ''}`} />
          </button>

          <div className="relative">
            <button
              onClick={() => setQuickMenuOpen(!quickMenuOpen)}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-[#D4AF37] hover:bg-[#c5a030] text-zinc-950 font-semibold text-xs transition-all shadow-sm active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{language === 'ar' ? 'إجراء سريع' : 'Quick Action'}</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {quickMenuOpen && (
              <div
                className="absolute end-0 mt-2 w-64 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-2 z-50 animate-fade-in"
                onClick={() => setQuickMenuOpen(false)}
              >
                <div className="p-2 text-[10px] font-mono tracking-widest text-[#f5d97f] uppercase border-b border-zinc-800/60 flex items-center justify-between">
                  <span>{language === 'ar' ? 'العمليات السريعة' : 'Direct Actions'}</span>
                  <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                </div>
                <button onClick={() => setAddVehicleOpen(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:text-white hover:bg-zinc-900 text-start transition-all group">
                  <Car className="w-4 h-4 text-emerald-400 group-hover:scale-105 transition-transform" />
                  <div><div className="font-medium">{language === 'ar' ? 'إضافة سيارة للأسطول' : 'Add Vehicle to Fleet'}</div><div className="text-[10px] text-zinc-500">{language === 'ar' ? 'سوبركارز وفحص التوفر' : 'Fleet inventory'}</div></div>
                </button>
                <button onClick={() => setAddCustomerOpen(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:text-white hover:bg-zinc-900 text-start transition-all group">
                  <UserPlus className="w-4 h-4 text-[#D4AF37] group-hover:scale-105 transition-transform" />
                  <div><div className="font-medium">{language === 'ar' ? 'تسجيل عميل VIP جديد' : 'Register VIP Customer'}</div><div className="text-[10px] text-zinc-500">{language === 'ar' ? 'ملف 360 ومنع التكرار' : 'Customer KYC profile'}</div></div>
                </button>
                <button onClick={() => setAddContractOpen(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:text-white hover:bg-zinc-900 text-start transition-all group">
                  <FileSignature className="w-4 h-4 text-sky-400 group-hover:scale-105 transition-transform" />
                  <div><div className="font-medium">{language === 'ar' ? 'إصدار عقد إيجار لحظي' : 'Issue Instant Contract'}</div><div className="text-[10px] text-zinc-500">{language === 'ar' ? 'تحديث فوري للإيرادات' : 'Live rental contract'}</div></div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setNotifDrawerOpen(true)}
            className="relative p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 hover:border-zinc-700 transition-all"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center border-2 border-zinc-950">
                {unreadNotifCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <GlobalSearchModal isOpen={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      <NotificationsDrawer isOpen={notifDrawerOpen} onClose={() => setNotifDrawerOpen(false)} />
      <AddVehicleModal isOpen={addVehicleOpen} onClose={() => setAddVehicleOpen(false)} />
      <AddCustomerModal isOpen={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} />
      <AddContractModal isOpen={addContractOpen} onClose={() => setAddContractOpen(false)} />
    </>
  );
};