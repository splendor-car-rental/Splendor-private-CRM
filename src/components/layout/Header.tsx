import React, { useState } from 'react';
import { 
  Search, Bell, Plus, Sparkles, Shield, UserPlus, 
  Car, FileSignature, Landmark, RefreshCw, Globe, ChevronDown,
  FileText, CalendarCheck, CheckCircle2
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
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewCustomer,
  onOpenNewReservation,
  onOpenNewQuotation,
  onOpenRecordPayment
}) => {
  const { language, setLanguage, t } = useLanguage();
  const { 
    globalSearchOpen, setGlobalSearchOpen, 
    notifications, fetchData, loading, firebaseSyncState 
  } = useCRM();
  
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  // Modal states for Quick Operations
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addContractOpen, setAddContractOpen] = useState(false);

  const unreadNotifCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <header className="h-16 px-4 sm:px-6 bg-zinc-950/90 border-b border-zinc-800/80 backdrop-blur-md flex items-center justify-between gap-3 sm:gap-4 sticky top-0 z-20">
        {/* Global Search trigger bar */}
        <div className="flex-1 max-w-xl">
          <button
            onClick={() => setGlobalSearchOpen(true)}
            className="w-full flex items-center justify-between px-3 sm:px-4 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-[#D4AF37]/50 text-zinc-400 hover:text-zinc-200 transition-all text-xs lg:text-sm group shadow-inner shadow-black/40"
          >
            <div className="flex items-center gap-2.5 truncate">
              <Search className="w-4 h-4 text-zinc-400 group-hover:text-[#D4AF37] transition-colors shrink-0" />
              <span className="truncate">{t('searchPlaceholder')}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 border border-zinc-700 font-mono">⌘</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 border border-zinc-700 font-mono">K</kbd>
            </div>
          </button>
        </div>

        {/* Right action group */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Real-time Firebase status badge */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[#f5d97f] font-mono font-medium">Firestore Live</span>
          </div>

          {/* Luxury Language Switcher */}
          <div className="flex items-center bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 shadow-inner">
            <button
              onClick={() => setLanguage('ar')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                language === 'ar'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 shadow-sm shadow-[#D4AF37]/20 scale-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="التحويل للغة العربية (RTL)"
            >
              <span>العربية</span>
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                language === 'en'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 shadow-sm shadow-[#D4AF37]/20 scale-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Switch to English (LTR)"
            >
              <span>EN</span>
            </button>
          </div>

          {/* Refresh sync button */}
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-[#f5d97f] hover:border-[#D4AF37]/40 hover:bg-zinc-900 transition-all"
            title={language === 'ar' ? 'تحديث ومزامنة البيانات' : 'Refresh and Synchronize'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#D4AF37]' : ''}`} />
          </button>

          {/* Quick Action Menu with Direct Modals */}
          <div className="relative">
            <button
              onClick={() => setQuickMenuOpen(!quickMenuOpen)}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/25 hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'ar' ? 'إجراء سريع' : 'Quick Action'}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>

            {quickMenuOpen && (
              <div 
                className="absolute end-0 mt-2 w-64 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-2 z-50 animate-fade-in"
                onClick={() => setQuickMenuOpen(false)}
              >
                <div className="p-2 text-[10px] uppercase font-bold text-[#f5d97f] tracking-wider border-b border-zinc-900 flex items-center justify-between">
                  <span>{language === 'ar' ? 'العمليات الحية (Firestore)' : 'Live Interactive Modals'}</span>
                  <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                </div>

                {/* 1. Add Vehicle to Fleet */}
                <button
                  onClick={() => setAddVehicleOpen(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-zinc-200 hover:text-white hover:bg-zinc-900 text-start transition-all group"
                >
                  <Car className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <div>
                    <div className="font-semibold">{language === 'ar' ? 'إضافة سيارة للأسطول' : 'Add Vehicle to Fleet'}</div>
                    <div className="text-[10px] text-zinc-400">{language === 'ar' ? 'سوبركارز وفحص التوفر' : 'Fleet & availability engine'}</div>
                  </div>
                </button>

                {/* 2. Register VIP Customer */}
                <button
                  onClick={() => setAddCustomerOpen(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-zinc-200 hover:text-white hover:bg-zinc-900 text-start transition-all group"
                >
                  <UserPlus className="w-4 h-4 text-[#D4AF37] group-hover:scale-110 transition-transform" />
                  <div>
                    <div className="font-semibold">{language === 'ar' ? 'تسجيل عميل VIP جديد' : 'Register VIP Customer'}</div>
                    <div className="text-[10px] text-zinc-400">{language === 'ar' ? 'ملف 360 ومنع التكرار' : 'Customer 360 & KYC'}</div>
                  </div>
                </button>

                {/* 3. Issue Instant Rental Contract */}
                <button
                  onClick={() => setAddContractOpen(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-zinc-200 hover:text-white hover:bg-zinc-900 text-start transition-all group"
                >
                  <FileSignature className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
                  <div>
                    <div className="font-semibold">{language === 'ar' ? 'إصدار عقد إيجار لحظي' : 'Issue Instant Contract'}</div>
                    <div className="text-[10px] text-zinc-400">{language === 'ar' ? 'تحديث فوري للإيرادات' : 'Live revenue & status update'}</div>
                  </div>
                </button>
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

      {/* Live Interactive Modals */}
      <AddVehicleModal
        isOpen={addVehicleOpen}
        onClose={() => setAddVehicleOpen(false)}
      />

      <AddCustomerModal
        isOpen={addCustomerOpen}
        onClose={() => setAddCustomerOpen(false)}
      />

      <AddContractModal
        isOpen={addContractOpen}
        onClose={() => setAddContractOpen(false)}
      />
    </>
  );
};
