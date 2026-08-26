import React, { useState } from 'react';
import { 
  Search, Bell, Plus, Sparkles, Shield, UserPlus, 
  Car, FileText, Landmark, RefreshCw, Layers 
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { NotificationsDrawer } from './NotificationsDrawer';
import { GlobalSearchModal } from './GlobalSearchModal';

interface HeaderProps {
  onOpenNewCustomer?: () => void;
  onOpenNewReservation?: () => void;
  onOpenNewQuotation?: () => void;
  onOpenRecordPayment?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewCustomer,
  onOpenNewReservation,
  onOpenNewQuotation,
  onOpenRecordPayment
}) => {
  const { language, t } = useLanguage();
  const { 
    globalSearchOpen, setGlobalSearchOpen, 
    notifications, fetchData, loading 
  } = useCRM();
  
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  const unreadNotifCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <header className="h-16 px-6 bg-zinc-950/90 border-b border-zinc-800/80 backdrop-blur-md flex items-center justify-between gap-4 sticky top-0 z-20">
        {/* Global Search trigger bar */}
        <div className="flex-1 max-w-xl">
          <button
            onClick={() => setGlobalSearchOpen(true)}
            className="w-full flex items-center justify-between px-4 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-[#D4AF37]/50 text-zinc-400 hover:text-zinc-200 transition-all text-xs lg:text-sm group shadow-inner shadow-black/40"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-zinc-400 group-hover:text-[#D4AF37] transition-colors" />
              <span>{t('searchPlaceholder')}</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 border border-zinc-700 font-mono">⌘</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 border border-zinc-700 font-mono">K</kbd>
            </div>
          </button>
        </div>

        {/* Right action group */}
        <div className="flex items-center gap-3">
          {/* Refresh sync button */}
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-[#f5d97f] hover:border-[#D4AF37]/40 hover:bg-zinc-900 transition-all"
            title="Refresh All Records"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#D4AF37]' : ''}`} />
          </button>

          {/* Quick Action Menu */}
          <div className="relative">
            <button
              onClick={() => setQuickMenuOpen(!quickMenuOpen)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'ar' ? 'إجراء سريع' : 'Quick Action'}</span>
            </button>

            {quickMenuOpen && (
              <div 
                className="absolute right-0 mt-2 w-56 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-2 z-50 animate-fade-in"
                onClick={() => setQuickMenuOpen(false)}
              >
                <div className="p-2 text-[10px] uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-900">
                  {language === 'ar' ? 'إنشاء فوري' : 'Create Instantly'}
                </div>
                {onOpenNewCustomer && (
                  <button
                    onClick={onOpenNewCustomer}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-900 text-start"
                  >
                    <UserPlus className="w-4 h-4 text-[#D4AF37]" />
                    <span>{t('newCustomer')}</span>
                  </button>
                )}
                {onOpenNewQuotation && (
                  <button
                    onClick={onOpenNewQuotation}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-900 text-start"
                  >
                    <FileText className="w-4 h-4 text-sky-400" />
                    <span>{t('newQuotation')}</span>
                  </button>
                )}
                {onOpenNewReservation && (
                  <button
                    onClick={onOpenNewReservation}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-900 text-start"
                  >
                    <Car className="w-4 h-4 text-emerald-400" />
                    <span>{t('newReservation')}</span>
                  </button>
                )}
                {onOpenRecordPayment && (
                  <button
                    onClick={onOpenRecordPayment}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-900 text-start"
                  >
                    <Landmark className="w-4 h-4 text-amber-400" />
                    <span>{t('recordPayment')}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Notifications bell */}
          <button
            onClick={() => setNotifDrawerOpen(true)}
            className="relative p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 hover:border-zinc-700 transition-all"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-zinc-950 animate-pulse">
                {unreadNotifCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
      />

      {/* Notifications Drawer */}
      <NotificationsDrawer
        isOpen={notifDrawerOpen}
        onClose={() => setNotifDrawerOpen(false)}
      />
    </>
  );
};
