import React, { useState, useRef } from 'react';
import {
  LayoutDashboard, Users, UserPlus, Car, FileSpreadsheet,
  CalendarCheck, FileSignature, Receipt, Landmark, CheckSquare,
  Sparkles, ShieldCheck, ShieldAlert, Settings, ChevronRight, LogOut, Globe, KeyRound, X, Camera,
  TicketCheck, BellRing, Truck, ClipboardCheck, MessageCircle, KeySquare, FileText
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useCRM } from '../../context/CRMContext';
import { Badge } from '../common/Badge';
import { SplendorLogo } from '../common/SplendorLogo';
import { AuthenticatedImage } from '../common/AuthenticatedImage';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';
import { canAccessView } from '../../config/permissions';
import { uploadFile } from '../../lib/upload';

interface SidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onMobileClose }) => {
  const { language, setLanguage, t } = useLanguage();
  const { currentUser, logout, updateMyProfile } = useAuth();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const {
    activeView, setActiveView,
    leads, vehicles, contracts, bankTransactions, tollTransactions, tasks, showToast
  } = useCRM();

  const handleAvatarPick = () => avatarInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    try {
      const { url } = await uploadFile(file, 'avatars');
      await updateMyProfile({ avatar: url });
      showToast(
        language === 'ar' ? 'تم تحديث الصورة' : 'Photo Updated',
        language === 'ar' ? 'تم تحديث صورتك الشخصية بنجاح.' : 'Your profile photo was updated successfully.'
      );
    } catch (err: any) {
      showToast(
        language === 'ar' ? 'فشل رفع الصورة' : 'Photo Upload Failed',
        err?.message || (language === 'ar' ? 'حدث خطأ أثناء رفع الصورة.' : 'Something went wrong uploading the photo.')
      );
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleNavClick = (viewId: string) => {
    setActiveView(viewId);
    onMobileClose();
  };

  const unreconciledCount = bankTransactions.filter(t => !t.reconciled).length;
  const unmatchedTollsCount = tollTransactions.filter(t => !t.contractId && !t.customerId).length;
  const activeRentalsCount = contracts.filter(c => c.status === 'active').length;
  const activeLtoCount = contracts.filter(c => c.contractType === 'lease_to_own' && c.lto?.ltoStatus === 'active').length;
  const pendingTasksCount = tasks.filter(t => t.status === 'pending').length;
  const newLeadsCount = leads.filter(l => l.status === 'new' || l.status === 'contacted').length;
  const availableFleetCount = vehicles.filter(v => v.status === 'available').length;

  const sections = [
    {
      title: language === 'ar' ? 'العمليات التنفيذية' : 'OPERATIONS',
      items: [
        {
          id: 'dashboard',
          label: t('dashboard'),
          icon: <LayoutDashboard className="w-4 h-4" />
        },
        {
          id: 'customers',
          label: t('customers'),
          icon: <Users className="w-4 h-4" />
        },
        {
          id: 'leads',
          label: t('leads'),
          icon: <UserPlus className="w-4 h-4" />,
          badge: newLeadsCount > 0 ? String(newLeadsCount) : undefined,
          badgeVariant: 'amber' as const
        },
        {
          id: 'fleet',
          label: t('fleet'),
          icon: <Car className="w-4 h-4" />,
          badge: `${availableFleetCount} Avail`,
          badgeVariant: 'emerald' as const
        }
      ]
    },
    {
      title: language === 'ar' ? 'الحجوزات والعقود' : 'RENTALS & DISPATCH',
      items: [
        {
          id: 'quotations',
          label: t('quotations'),
          icon: <FileSpreadsheet className="w-4 h-4" />
        },
        {
          id: 'reservations',
          label: t('reservations'),
          icon: <CalendarCheck className="w-4 h-4" />
        },
        {
          id: 'contracts',
          label: t('contracts'),
          icon: <FileSignature className="w-4 h-4" />,
          badge: activeRentalsCount > 0 ? `${activeRentalsCount} Active` : undefined,
          badgeVariant: 'gold' as const
        },
        {
          id: 'lease-to-own',
          label: language === 'ar' ? 'الإيجار المنتهي بالتملك' : 'Lease-to-Own',
          icon: <KeySquare className="w-4 h-4" />,
          badge: activeLtoCount > 0 ? `${activeLtoCount} Active` : undefined,
          badgeVariant: 'gold' as const
        },
        {
          id: 'inspections',
          label: language === 'ar' ? 'فحص المركبة والأدلة المصورة' : 'Vehicle Inspections',
          icon: <ClipboardCheck className="w-4 h-4" />
        },
        {
          id: 'whatsapp-inbox',
          label: language === 'ar' ? 'صندوق واتساب الموحد' : 'WhatsApp Inbox',
          icon: <MessageCircle className="w-4 h-4" />
        }
      ]
    },
    {
      title: language === 'ar' ? 'الإدارة المالية' : 'FINANCIAL CONTROL',
      items: [
        {
          id: 'finance',
          label: t('finance'),
          icon: <Receipt className="w-4 h-4" />
        },
        {
          id: 'reconciliation',
          label: t('reconciliation'),
          icon: <Landmark className="w-4 h-4" />,
          badge: unreconciledCount > 0 ? `${unreconciledCount} Review` : undefined,
          badgeVariant: 'rose' as const
        },
        {
          id: 'tolls',
          label: t('tolls'),
          icon: <TicketCheck className="w-4 h-4" />,
          badge: unmatchedTollsCount > 0 ? `${unmatchedTollsCount} Unmatched` : undefined,
          badgeVariant: 'rose' as const
        },
        {
          id: 'tasks',
          label: t('tasks'),
          icon: <CheckSquare className="w-4 h-4" />,
          badge: pendingTasksCount > 0 ? String(pendingTasksCount) : undefined,
          badgeVariant: 'zinc' as const
        },
        {
          id: 'procurement',
          label: language === 'ar' ? 'المشتريات والموردون' : 'Procurement & Suppliers',
          icon: <Truck className="w-4 h-4" />
        },
        {
          id: 'security',
          label: language === 'ar' ? 'الأمن والقائمة المحظورة' : 'Security & Blocklist',
          icon: <ShieldAlert className="w-4 h-4" />
        }
      ]
    },
    {
      title: language === 'ar' ? 'المستندات والسجلات' : 'DOCUMENTS & RECORDS',
      items: [
        {
          id: 'corporate-documents',
          label: language === 'ar' ? 'مولّد المكاتبات الرسمية' : 'Corporate Documents',
          icon: <FileText className="w-4 h-4 text-[#D4AF37]" />,
          badge: 'PDF',
          badgeVariant: 'gold' as const
        }
      ]
    },
    {
      title: language === 'ar' ? 'الذكاء والتحكم' : 'INTELLIGENCE & SYSTEM',
      items: [
        {
          id: 'notification-center',
          label: language === 'ar' ? 'مركز الإشعارات وواتساب' : 'Notification & WhatsApp Center',
          icon: <BellRing className="w-4 h-4 text-[#D4AF37]" />
        },
        {
          id: 'ai-studio',
          label: language === 'ar' ? 'استوديو الذكاء الاصطناعي' : 'AI Intelligence',
          icon: <Sparkles className="w-4 h-4 text-[#D4AF37]" />,
          badge: 'Gemini 3.7',
          badgeVariant: 'gold' as const
        },
        {
          id: 'test-suite',
          label: language === 'ar' ? 'مختبر الفحص الآلي' : 'Test Suite Runner',
          icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
          badge: '12/12 Passed',
          badgeVariant: 'emerald' as const
        },
        {
          id: 'settings',
          label: t('settings'),
          icon: <Settings className="w-4 h-4" />
        }
      ]
    }
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 start-0 z-50 w-72 bg-zinc-950 border-e border-zinc-800/80 flex flex-col h-screen shrink-0 select-none
          transition-transform duration-200 ease-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'}
          md:sticky md:top-0 md:h-screen md:translate-x-0 md:rtl:translate-x-0 md:transform-none md:z-30 md:w-64 lg:w-72`}
      >
        {/* Brand Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-3 min-w-0">
            <SplendorLogo size={42} className="shrink-0 hover:opacity-90 transition-opacity cursor-pointer" />
            <div className="min-w-0">
              <h1 className="font-serif-luxury text-sm tracking-wide text-[#f5d97f] uppercase font-bold leading-tight truncate">
                {language === 'ar' ? 'سبلندر لتأجير السيارات' : 'SPLENDOR CAR RENTAL'}
              </h1>
              <p className="text-[10px] tracking-wider text-zinc-500 font-medium mt-0.5 truncate">
                {language === 'ar' ? 'هيبة بلا حدود • دبي' : 'Prestige Beyond Limits • Dubai'}
              </p>
            </div>
          </div>
          <button
            onClick={onMobileClose}
            className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors shrink-0"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav list grouped with subtle titles */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
          {sections.map((section, sIdx) => {
            const visibleItems = section.items.filter(item => canAccessView(currentUser.role, item.id));
            if (visibleItems.length === 0) return null;

            return (
              <div key={sIdx} className="space-y-1">
                <div className="px-3 pb-1 text-[10px] font-mono tracking-widest text-zinc-500 uppercase">
                  {section.title}
                </div>
                {visibleItems.map(item => {
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all group ${
                        isActive
                          ? 'bg-[#D4AF37]/10 text-[#f5d97f] border border-[#D4AF37]/30 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`shrink-0 ${isActive ? 'text-[#D4AF37]' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <Badge variant={item.badgeVariant} size="sm">
                          {item.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* User & Role Switcher */}
        <div className="p-3.5 border-t border-zinc-800/80 bg-zinc-900/30">
          <div className="flex items-center gap-2.5 mb-2.5">
            <button
              type="button"
              onClick={handleAvatarPick}
              disabled={avatarUploading}
              title={language === 'ar' ? 'تغيير الصورة الشخصية' : 'Change profile photo'}
              className="relative w-8 h-8 rounded-lg shrink-0 group/avatar overflow-hidden"
            >
              <AuthenticatedImage
                src={currentUser.avatar}
                fallbackSrc="/splendor-logo.png"
                alt={currentUser.name}
                className="w-8 h-8 rounded-lg object-cover border border-zinc-700"
              />
              <span className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity">
                <Camera className="w-3 h-3 text-white" />
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-200 truncate">
                {language === 'ar' && currentUser.nameAr ? currentUser.nameAr : (currentUser.name || currentUser.email || 'User')}
              </p>
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider truncate">
                {(currentUser.role || '').toUpperCase()} • {(currentUser.branch || '').split(' ')[0] || ''}
              </p>
            </div>
          </div>

          {/* Change password / Sign out */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setChangePasswordOpen(true)}
              className="flex items-center justify-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-[#f5d97f] bg-zinc-950 hover:bg-zinc-900 px-2 py-1.5 rounded-lg border border-zinc-800/80 hover:border-[#D4AF37]/30 transition-colors"
            >
              <KeyRound className="w-3 h-3" />
              <span className="truncate">{t('changePassword')}</span>
            </button>
            <button
              onClick={() => logout()}
              className="flex items-center justify-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-rose-300 bg-zinc-950 hover:bg-rose-950/30 px-2 py-1.5 rounded-lg border border-zinc-800/80 hover:border-rose-500/30 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              <span>{t('logout')}</span>
            </button>
          </div>
        </div>

        <ChangePasswordModal isOpen={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
      </aside>
    </>
  );
};
