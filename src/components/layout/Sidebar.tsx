import React from 'react';
import { 
  LayoutDashboard, Users, UserPlus, Car, FileSpreadsheet, 
  CalendarCheck, FileSignature, Receipt, Landmark, CheckSquare, 
  Sparkles, ShieldCheck, Settings, ChevronRight, LogOut, Globe
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useCRM } from '../../context/CRMContext';
import { Badge } from '../common/Badge';
import { SplendorLogo } from '../common/SplendorLogo';

export const Sidebar: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();
  const { currentUser, switchRole } = useAuth();
  const { 
    activeView, setActiveView,
    leads, vehicles, contracts, bankTransactions, tasks 
  } = useCRM();

  const unreconciledCount = bankTransactions.filter(t => !t.reconciled).length;
  const activeRentalsCount = contracts.filter(c => c.status === 'active').length;
  const pendingTasksCount = tasks.filter(t => t.status === 'pending').length;
  const newLeadsCount = leads.filter(l => l.status === 'new' || l.status === 'contacted').length;

  const navItems = [
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
      badge: `${vehicles.filter(v => v.status === 'available').length} Avail`,
      badgeVariant: 'emerald' as const
    },
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
      id: 'tasks',
      label: t('tasks'),
      icon: <CheckSquare className="w-4 h-4" />,
      badge: pendingTasksCount > 0 ? String(pendingTasksCount) : undefined,
      badgeVariant: 'zinc' as const
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
      badge: '11/11 Passed',
      badgeVariant: 'emerald' as const
    },
    {
      id: 'settings',
      label: t('settings'),
      icon: <Settings className="w-4 h-4" />
    }
  ];

  return (
    <aside className="w-64 lg:w-72 bg-zinc-950/95 border-r border-zinc-800/80 flex flex-col h-screen shrink-0 z-30 select-none">
      {/* Brand Crest */}
      <div className="p-4 sm:p-5 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <SplendorLogo size={46} className="shrink-0 hover:scale-105 transition-transform cursor-pointer" />
          <div className="min-w-0">
            <h1 className="font-serif text-sm lg:text-[15px] tracking-wide text-[#f5d97f] uppercase font-bold leading-tight truncate">
              {language === 'ar' ? 'سبلندر لتأجير السيارات' : 'SPLENDOR CAR RENTAL'}
            </h1>
            <p className="text-[10px] tracking-wider text-zinc-400 font-medium mt-0.5 truncate">
              {language === 'ar' ? 'هيبة بلا حدود • دبي' : 'Prestige Beyond Limits • Dubai'}
            </p>
          </div>
        </div>
      </div>

      {/* Nav list */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
        {navItems.map(item => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/35 shadow-sm shadow-[#D4AF37]/10'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={isActive ? 'text-[#D4AF37]' : 'text-zinc-500 group-hover:text-zinc-300'}>
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

      {/* User & Role Switcher */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/40">
        <div className="flex items-center gap-3 mb-3">
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            className="w-9 h-9 rounded-xl object-cover border border-[#D4AF37]/40 shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-zinc-200 truncate">
              {language === 'ar' && currentUser.nameAr ? currentUser.nameAr : currentUser.name}
            </p>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider truncate">
              {currentUser.role.toUpperCase()} • {currentUser.branch.split(' ')[0]}
            </p>
          </div>
        </div>

        {/* Quick Role Simulator dropdown */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 bg-zinc-950/80 px-2.5 py-1.5 rounded-lg border border-zinc-800">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400">Perspective:</span>
          <select
            value={currentUser.role}
            onChange={(e) => switchRole(e.target.value as any)}
            className="bg-transparent text-[#f5d97f] font-medium text-xs focus:outline-none cursor-pointer"
          >
            <option value="ceo" className="bg-zinc-900 text-zinc-100">CEO / Partner</option>
            <option value="operations" className="bg-zinc-900 text-zinc-100">Operations Lead</option>
            <option value="sales" className="bg-zinc-900 text-zinc-100">Sales Executive</option>
            <option value="finance" className="bg-zinc-900 text-zinc-100">Finance Manager</option>
            <option value="fleet" className="bg-zinc-900 text-zinc-100">Fleet Director</option>
          </select>
        </div>
      </div>
    </aside>
  );
};
