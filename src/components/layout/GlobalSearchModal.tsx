import React, { useState, useEffect, useMemo } from 'react';
import { Search, User, Car, FileSignature, FileText, X, ArrowRight } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const { 
    customers, vehicles, contracts, quotations, leads,
    setSelectedCustomerId, setSelectedVehicleId, 
    setSelectedContractId, setSelectedQuotationId,
    setActiveView 
  } = useCRM();

  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();

    const matches: Array<{
      id: string;
      title: string;
      subtitle: string;
      type: 'customer' | 'vehicle' | 'contract' | 'quotation' | 'lead';
      badge?: string;
      onClick: () => void;
    }> = [];

    // Customers
    customers.forEach(c => {
      if (
        (c.fullName || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.id || '').toLowerCase().includes(q) ||
        (c.companyName && c.companyName.toLowerCase().includes(q))
      ) {
        matches.push({
          id: c.id,
          title: c.fullName,
          subtitle: `${c.id} • ${c.phone || ''} • LTV: ${(c.lifetimeValue || 0).toLocaleString()} AED`,
          type: 'customer',
          badge: c.isVIP ? 'VIP' : undefined,
          onClick: () => {
            setSelectedCustomerId(c.id);
            setActiveView('customers');
            onClose();
          }
        });
      }
    });

    // Vehicles
    vehicles.forEach(v => {
      if (
        `${v.make || ''} ${v.model || ''}`.toLowerCase().includes(q) ||
        (v.plateNumber || '').toLowerCase().includes(q) ||
        (v.vin || '').toLowerCase().includes(q) ||
        (v.id || '').toLowerCase().includes(q)
      ) {
        matches.push({
          id: v.id,
          title: `${v.make || ''} ${v.model || ''} (${v.year || ''})`,
          subtitle: `${v.plateCity || ''} ${v.plateNumber || ''} • ${(v.status || '').toUpperCase()} • ${v.dailyRate || 0} AED/day`,
          type: 'vehicle',
          badge: v.status,
          onClick: () => {
            setSelectedVehicleId(v.id);
            setActiveView('fleet');
            onClose();
          }
        });
      }
    });

    // Contracts
    contracts.forEach(cnt => {
      if (
        (cnt.contractNumber || '').toLowerCase().includes(q) ||
        (cnt.customerName || '').toLowerCase().includes(q) ||
        (cnt.vehicleName || '').toLowerCase().includes(q)
      ) {
        matches.push({
          id: cnt.id,
          title: `Contract ${cnt.contractNumber || ''}`,
          subtitle: `${cnt.customerName || ''} • ${cnt.vehicleName || ''} • ${(cnt.grandTotal || 0).toLocaleString()} AED`,
          type: 'contract',
          badge: cnt.status,
          onClick: () => {
            setSelectedContractId(cnt.id);
            setActiveView('contracts');
            onClose();
          }
        });
      }
    });

    // Quotations
    quotations.forEach(quo => {
      if (
        (quo.id || '').toLowerCase().includes(q) ||
        (quo.customerName || '').toLowerCase().includes(q) ||
        (quo.vehicleName || '').toLowerCase().includes(q)
      ) {
        matches.push({
          id: quo.id,
          title: `Quotation ${quo.id || ''}`,
          subtitle: `${quo.customerName || ''} • ${quo.vehicleName || ''} • ${(quo.grandTotal || 0).toLocaleString()} AED`,
          type: 'quotation',
          badge: quo.status,
          onClick: () => {
            setSelectedQuotationId(quo.id);
            setActiveView('quotations');
            onClose();
          }
        });
      }
    });

    return matches.slice(0, 10);
  }, [query, customers, vehicles, contracts, quotations, setActiveView, setSelectedCustomerId, setSelectedVehicleId, setSelectedContractId, setSelectedQuotationId, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-10 animate-fade-in">
        {/* Search input header */}
        <div className="flex items-center px-4 py-3.5 border-b border-zinc-800 bg-zinc-900/60">
          <Search className="w-5 h-5 text-[#D4AF37] me-3 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={language === 'ar' ? 'ابحث عن عميل، لوحة سيارة، رقم عقد، أو عرض سعر...' : 'Search customers, plates, contracts, VINs, quotations...'}
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="shrink-0 w-9 h-9 flex items-center justify-center text-zinc-500 hover:text-zinc-300" aria-label={language === 'ar' ? 'مسح البحث' : 'Clear search'}>
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="shrink-0 ms-1 w-11 h-11 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 active:bg-zinc-800 transition-colors"
            aria-label={language === 'ar' ? 'إغلاق البحث' : 'Close search'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-2 custom-scrollbar">
          {query.trim() === '' ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              {language === 'ar' ? 'ابدأ بالكتابة للبحث الشامل في كافة سجلات النظام' : 'Type to search seamlessly across the entire Splendor ecosystem'}
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              {language === 'ar' ? 'لم يتم العثور على نتائج تطابق هذا البحث' : 'No records found matching your query'}
            </div>
          ) : (
            <div className="space-y-1">
              {searchResults.map(result => {
                const icon = {
                  customer: <User className="w-4 h-4 text-[#D4AF37]" />,
                  vehicle: <Car className="w-4 h-4 text-emerald-400" />,
                  contract: <FileSignature className="w-4 h-4 text-sky-400" />,
                  quotation: <FileText className="w-4 h-4 text-amber-400" />,
                  lead: <User className="w-4 h-4 text-purple-400" />
                }[result.type];

                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={result.onClick}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-all text-start group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-zinc-700 shrink-0">
                        {icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-200 truncate group-hover:text-[#f5d97f]">
                            {result.title}
                          </span>
                          {result.badge && (
                            <Badge variant="gold" size="sm">
                              {result.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">{result.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts -- keyboard-only, hidden on touch/mobile since there's no physical keyboard to use them with */}
        <div className="hidden sm:flex px-4 py-2 bg-zinc-900/40 border-t border-zinc-800/80 items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-2">
            <span>Navigation:</span>
            <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">↑↓</span>
            <span>Select:</span>
            <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">↵</span>
          </div>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
};
