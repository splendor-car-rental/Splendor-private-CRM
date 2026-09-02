import React, { useMemo, useState } from 'react';
import { Building2, Crown, Search, ShieldAlert, UserRound, ChevronRight } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import type { Customer } from '../../types';

/**
 * Customer classification is deliberately operational, not financial.
 * Splendor has not approved spend/rental thresholds, automatic discounts,
 * deposit waivers, or loyalty entitlements.  The previous Silver/Gold/
 * Platinum/Diamond/Black engine invented those commercial policies in UI.
 * That is unsafe: a presentation component must never create a discount or
 * credit policy simply because a customer has spent a certain amount.
 *
 * Current source-of-truth classification:
 *   - BLOCKED: authoritative customer/blocklist status.
 *   - CORPORATE: the customer master explicitly says corporate.
 *   - VIP: an explicit, stored VIP flag set through an authorized workflow.
 *   - STANDARD: everyone else.
 *
 * Future loyalty tiers can be reintroduced only as a versioned business rule
 * with explicit owner-approved thresholds and benefits.
 */
export type CustomerOperationalClass = 'STANDARD' | 'VIP' | 'CORPORATE' | 'BLOCKED';

export function classifyCustomer(customer: Customer): CustomerOperationalClass {
  if (customer.status === 'blocklisted') return 'BLOCKED';
  if (customer.type === 'corporate') return 'CORPORATE';
  if (customer.isVIP === true || customer.status === 'vip') return 'VIP';
  return 'STANDARD';
}

const CLASS_META: Record<CustomerOperationalClass, { en: string; ar: string; className: string }> = {
  STANDARD: { en: 'Standard', ar: 'عميل عادي', className: 'border-zinc-700 bg-zinc-900 text-zinc-300' },
  VIP: { en: 'VIP', ar: 'VIP', className: 'border-[#D4AF37]/45 bg-[#D4AF37]/10 text-[#f5d97f]' },
  CORPORATE: { en: 'Corporate', ar: 'شركة', className: 'border-sky-500/35 bg-sky-950/30 text-sky-300' },
  BLOCKED: { en: 'Blocked', ar: 'محظور', className: 'border-rose-500/35 bg-rose-950/30 text-rose-300' }
};

export const VipTierManagementView: React.FC = () => {
  const { language } = useLanguage();
  const { customers, setSelectedCustomerId, setActiveView } = useCRM();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | CustomerOperationalClass>('ALL');

  const rows = useMemo(() => customers.map(customer => ({ customer, classification: classifyCustomer(customer) })), [customers]);
  const counts = useMemo(() => rows.reduce<Record<CustomerOperationalClass, number>>((acc, row) => {
    acc[row.classification] += 1;
    return acc;
  }, { STANDARD: 0, VIP: 0, CORPORATE: 0, BLOCKED: 0 }), [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(({ customer, classification }) => {
      if (filter !== 'ALL' && classification !== filter) return false;
      if (!query) return true;
      return [customer.fullName, customer.fullNameAr, customer.companyName, customer.phone, customer.id]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query));
    });
  }, [rows, filter, search]);

  return (
    <div className="space-y-5 pb-12 animate-fade-in min-w-0">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-zinc-100 flex flex-wrap items-center gap-2">
              <Crown className="h-5 w-5 text-[#f5d97f]" />
              {language === 'ar' ? 'تصنيف العملاء التشغيلي' : 'Customer Operational Classification'}
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-zinc-400">
              {language === 'ar'
                ? 'لا توجد حالياً فئات فضي أو ذهبي أو بلاتيني ولا خصومات تلقائية مرتبطة بالإنفاق. التصنيف هنا يعكس فقط حالة العميل الفعلية: عادي، VIP معتمد، شركة، أو محظور. أي برنامج ولاء مستقبلي يحتاج سياسة أعمال معتمدة قبل تفعيله.'
                : 'There are currently no Silver, Gold or Platinum spend tiers and no automatic discounts. This view reflects only authoritative operational state: Standard, explicitly approved VIP, Corporate, or Blocked. Any future loyalty scheme requires an approved business policy first.'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(CLASS_META) as CustomerOperationalClass[]).map(key => {
          const meta = CLASS_META[key];
          const selected = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(selected ? 'ALL' : key)}
              className={`min-w-0 rounded-2xl border p-4 text-start transition ${meta.className} ${selected ? 'ring-1 ring-[#D4AF37]/50' : ''}`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wide">{language === 'ar' ? meta.ar : meta.en}</div>
              <div className="mt-2 text-2xl font-black text-zinc-100">{counts[key]}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={language === 'ar' ? 'بحث بالاسم أو الهاتف أو رقم العميل' : 'Search name, phone or customer ID'}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 ps-9 pe-3 text-xs text-zinc-100 outline-none focus:border-[#D4AF37]/60"
          />
        </div>
        <button type="button" onClick={() => setFilter('ALL')} className="rounded-xl border border-zinc-700 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800">
          {language === 'ar' ? `عرض الكل (${filtered.length})` : `Show all (${filtered.length})`}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="p-3 text-start">{language === 'ar' ? 'العميل' : 'Customer'}</th>
                <th className="p-3 text-start">{language === 'ar' ? 'التصنيف' : 'Class'}</th>
                <th className="p-3 text-start">{language === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="p-3 text-start">{language === 'ar' ? 'الهاتف' : 'Phone'}</th>
                <th className="p-3 text-end">{language === 'ar' ? 'الملف' : 'Profile'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map(({ customer, classification }) => {
                const meta = CLASS_META[classification];
                const Icon = classification === 'CORPORATE' ? Building2 : classification === 'BLOCKED' ? ShieldAlert : classification === 'VIP' ? Crown : UserRound;
                return (
                  <tr key={customer.id} className="hover:bg-zinc-900/50">
                    <td className="p-3">
                      <div className="font-semibold text-zinc-100">{customer.fullName}</div>
                      <div className="text-[10px] text-zinc-500">{customer.id}</div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${meta.className}`}>
                        <Icon className="h-3 w-3" /> {language === 'ar' ? meta.ar : meta.en}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-300">{customer.type}</td>
                    <td className="p-3 font-mono text-zinc-300">{customer.phone}</td>
                    <td className="p-3 text-end">
                      <button
                        type="button"
                        onClick={() => { setSelectedCustomerId(customer.id); setActiveView('customers'); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800"
                      >
                        {language === 'ar' ? 'فتح 360' : 'Open 360'} <ChevronRight className="h-3 w-3" />
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
