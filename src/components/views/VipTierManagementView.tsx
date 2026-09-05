import React, { useState, useMemo } from 'react';
import { 
  Crown, Award, Sparkles, TrendingUp, DollarSign, 
  Car, ShieldCheck, ChevronRight, Gift, Check, Search, Filter,
  Star, HeartHandshake, Zap, ArrowUpRight
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { PhoneText } from '../common/PhoneText';
import { formatAED } from '../../lib/currency';
import { Customer } from '../../types';

export type VipTier = 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'BLACK';

interface VipTierConfig {
  tier: VipTier;
  minSpendAed: number;
  minRentals: number;
  discountPercent: number;
  priorityDispatch: boolean;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  descriptionEn: string;
  descriptionAr: string;
}

export const VIP_TIER_CONFIGS: Record<VipTier, VipTierConfig> = {
  SILVER: {
    tier: 'SILVER',
    minSpendAed: 0,
    minRentals: 0,
    discountPercent: 0,
    priorityDispatch: false,
    color: 'text-zinc-400',
    badgeBg: 'bg-zinc-800',
    badgeBorder: 'border-zinc-700',
    descriptionEn: 'Standard luxury customer with base privileges.',
    descriptionAr: 'عميل فاخر قياسي بالمزايا الأساسية.'
  },
  GOLD: {
    tier: 'GOLD',
    minSpendAed: 25000,
    minRentals: 2,
    discountPercent: 5,
    priorityDispatch: true,
    color: 'text-amber-400',
    badgeBg: 'bg-amber-950/40',
    badgeBorder: 'border-amber-500/40',
    descriptionEn: 'Recurring guest: 5% bespoke discount & priority booking.',
    descriptionAr: 'عميل متكرر: خصم 5% وأولوية في تثبيت الحجوزات.'
  },
  PLATINUM: {
    tier: 'PLATINUM',
    minSpendAed: 75000,
    minRentals: 5,
    discountPercent: 10,
    priorityDispatch: true,
    color: 'text-cyan-300',
    badgeBg: 'bg-cyan-950/40',
    badgeBorder: 'border-cyan-500/40',
    descriptionEn: 'High-Value VIP: 10% bespoke discount & free airport concierge.',
    descriptionAr: 'عميل بلاتيني: خصم 10% وتوصيل مجاني في المطار.'
  },
  DIAMOND: {
    tier: 'DIAMOND',
    minSpendAed: 150000,
    minRentals: 8,
    discountPercent: 15,
    priorityDispatch: true,
    color: 'text-sky-400',
    badgeBg: 'bg-sky-950/40',
    badgeBorder: 'border-sky-500/40',
    descriptionEn: 'Ultra VIP: 15% discount, zero security deposit guarantee, instant supercar unlock.',
    descriptionAr: 'عميل ماسي: خصم 15% وتسهيل ضمان بدون وديعة نقدية وسيارات حصرية.'
  },
  BLACK: {
    tier: 'BLACK',
    minSpendAed: 300000,
    minRentals: 12,
    discountPercent: 20,
    priorityDispatch: true,
    color: 'text-[#f5d97f]',
    badgeBg: 'bg-gradient-to-r from-amber-950/80 to-zinc-950',
    badgeBorder: 'border-[#D4AF37]',
    descriptionEn: 'Royal Black Tier: Dedicated 24/7 Concierge, First Rights to Hypercars (Bugatti/Spectre), 20% discount.',
    descriptionAr: 'الفئة الملكية السوداء: مدير علاقات خاص 24/7 وأولوية مطلقة للسيارات الفائقة وخصم 20%.'
  }
};

export function calculateCustomerVipTier(customer: Customer): VipTier {
  const ltv = customer.lifetimeValue || 0;
  const rentals = customer.totalRentals || 0;

  if (ltv >= 300000 || rentals >= 12) return 'BLACK';
  if (ltv >= 150000 || rentals >= 8) return 'DIAMOND';
  if (ltv >= 75000 || rentals >= 5) return 'PLATINUM';
  if (ltv >= 25000 || rentals >= 2) return 'GOLD';
  return 'SILVER';
}

export const VipTierManagementView: React.FC = () => {
  const { language } = useLanguage();
  const { customers, contracts, setSelectedCustomerId, setActiveView } = useCRM();

  const [search, setSearch] = useState('');
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>('ALL');

  // Compute VIP Tier for every customer
  const enrichedCustomers = useMemo(() => {
    return customers.map(c => {
      const calculatedTier = calculateCustomerVipTier(c);
      return {
        ...c,
        calculatedTier,
        tierConfig: VIP_TIER_CONFIGS[calculatedTier]
      };
    });
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    return enrichedCustomers.filter(c => {
      const matchQuery = 
        c.fullName.toLowerCase().includes(search.toLowerCase()) ||
        (c.fullNameAr && c.fullNameAr.includes(search)) ||
        c.phone.includes(search) ||
        c.id.toLowerCase().includes(search.toLowerCase());
      
      const matchTier = selectedTierFilter === 'ALL' || c.calculatedTier === selectedTierFilter;
      return matchQuery && matchTier;
    });
  }, [enrichedCustomers, search, selectedTierFilter]);

  const tierCounts = useMemo(() => {
    const counts: Record<VipTier, number> = { SILVER: 0, GOLD: 0, PLATINUM: 0, DIAMOND: 0, BLACK: 0 };
    enrichedCustomers.forEach(c => {
      counts[c.calculatedTier]++;
    });
    return counts;
  }, [enrichedCustomers]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100 flex items-center gap-2.5">
            <Crown className="w-6 h-6 text-[#f5d97f]" />
            <span>{language === 'ar' ? 'محرك تصنيف عملاء النخبة (VIP Management Engine)' : 'VIP Tier & Loyalty Classification Engine'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {language === 'ar' 
              ? 'تصنيف آلي متقدم (Silver ➔ Black) واحتساب الخصومات الحصرية وترقية الامتيازات حسب إجمالي الإنفاق وتاريخ التأجير' 
              : 'Automated Tier Progression (Silver to Royal Black), dynamic VIP discounts, and bespoke concierge dispatching'}
          </p>
        </div>
      </div>

      {/* Tier Overview Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {(Object.keys(VIP_TIER_CONFIGS) as VipTier[]).map(tierKey => {
          const cfg = VIP_TIER_CONFIGS[tierKey];
          const count = tierCounts[tierKey];
          const isSelected = selectedTierFilter === tierKey;

          return (
            <div
              key={tierKey}
              onClick={() => setSelectedTierFilter(isSelected ? 'ALL' : tierKey)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                isSelected 
                  ? 'bg-zinc-900 border-[#D4AF37] ring-2 ring-[#D4AF37]/30 shadow-xl' 
                  : 'bg-zinc-950 hover:bg-zinc-900 border-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>
                  {tierKey}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800">
                  {count} {language === 'ar' ? 'عميل' : 'clients'}
                </span>
              </div>
              <div className="mt-3">
                <span className="text-xs text-zinc-400">{language === 'ar' ? 'الحد الأدنى' : 'Min Spend'}: </span>
                <span className="text-xs font-bold text-zinc-200 font-mono">{formatAED(cfg.minSpendAed)}</span>
              </div>
              <div className="text-[11px] text-emerald-400 font-semibold mt-1">
                {cfg.discountPercent}% {language === 'ar' ? 'خصم مخصص' : 'Bespoke Discount'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute start-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={language === 'ar' ? 'ابحث عن عميل بالاسم أو الهاتف أو الـ ID...' : 'Search by name, phone, or customer ID...'}
            className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl ps-9 pe-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]"
          />
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <span className="text-xs text-zinc-400">
            {language === 'ar' ? `المعروض: ${filteredCustomers.length} عميل` : `Showing: ${filteredCustomers.length} customers`}
          </span>
          {selectedTierFilter !== 'ALL' && (
            <button
              onClick={() => setSelectedTierFilter('ALL')}
              className="text-xs text-[#f5d97f] hover:underline px-2 py-1 bg-zinc-950 rounded-lg border border-zinc-800"
            >
              {language === 'ar' ? 'إلغاء التصفية' : 'Reset Filter'}
            </button>
          )}
        </div>
      </div>

      {/* Customer VIP Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs min-w-[900px]">
            <thead className="bg-zinc-900/80 text-zinc-400 uppercase tracking-wider font-semibold border-b border-zinc-800">
              <tr>
                <th className="p-3.5 text-start">{language === 'ar' ? 'العميل' : 'Customer'}</th>
                <th className="p-3.5 text-start">{language === 'ar' ? 'فئة الـ VIP' : 'VIP Tier'}</th>
                <th className="p-3.5 text-start">{language === 'ar' ? 'إجمالي الإنفاق (LTV)' : 'Lifetime Value (LTV)'}</th>
                <th className="p-3.5 text-start">{language === 'ar' ? 'عدد الإيجارات' : 'Total Rentals'}</th>
                <th className="p-3.5 text-start">{language === 'ar' ? 'الخصم المستحق' : 'Entitled Discount'}</th>
                <th className="p-3.5 text-start">{language === 'ar' ? 'الحالة والامتيازات' : 'Privileges'}</th>
                <th className="p-3.5 text-end">{language === 'ar' ? 'الإجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {filteredCustomers.map(customer => {
                const tier = customer.tierConfig;
                return (
                  <tr key={customer.id} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="p-3.5">
                      <div className="font-semibold text-zinc-100">{customer.fullName}</div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5"><PhoneText value={customer.phone} /> • {customer.id}</div>
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider border ${tier.badgeBg} ${tier.badgeBorder} ${tier.color}`}>
                        <Crown className="w-3 h-3" />
                        {customer.calculatedTier}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-zinc-200">
                      {formatAED(customer.lifetimeValue || 0)}
                    </td>
                    <td className="p-3.5 font-mono text-zinc-300">
                      {customer.totalRentals || 0} {language === 'ar' ? 'عقد' : 'contracts'}
                    </td>
                    <td className="p-3.5">
                      <span className="font-bold text-emerald-400 font-mono">
                        {tier.discountPercent > 0 ? `${tier.discountPercent}% VIP OFF` : 'Standard'}
                      </span>
                    </td>
                    <td className="p-3.5 text-[11px] text-zinc-400 max-w-xs truncate">
                      {language === 'ar' ? tier.descriptionAr : tier.descriptionEn}
                    </td>
                    <td className="p-3.5 text-end">
                      <button
                        onClick={() => {
                          setSelectedCustomerId(customer.id);
                          setActiveView('customers');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-[#f5d97f] font-semibold text-xs transition-all inline-flex items-center gap-1"
                      >
                        <span>{language === 'ar' ? 'الملف 360' : 'Profile 360'}</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
