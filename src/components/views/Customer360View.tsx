import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Search, Filter, Phone, Mail, MapPin, 
  Car, Shield, FileText, Landmark, Clock, CheckCircle2, 
  AlertTriangle, Sparkles, ChevronRight, X, Edit3, Merge, 
  Printer, ArrowUpRight, DollarSign, Calendar
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Customer } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { AiConfidenceBadge } from '../common/AiConfidenceBadge';

export const Customer360View: React.FC = () => {
  const { language, t } = useLanguage();
  const { 
    customers, contracts, invoices, deposits, 
    payments, communications, documents,
    selectedCustomerId, setSelectedCustomerId,
    addCustomer, updateCustomer, mergeCustomers, checkDuplicateCustomer,
    setActiveView, setSelectedContractId
  } = useCRM();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterVIP, setFilterVIP] = useState<boolean | null>(null);

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [targetMergeId, setTargetMergeId] = useState('');

  // AI Brief
  const [aiBriefLoading, setAiBriefLoading] = useState(false);
  const [aiBrief, setAiBrief] = useState<string | null>(null);

  // New customer form state
  const [newCustForm, setNewCustForm] = useState({
    fullName: '',
    companyName: '',
    email: '',
    phone: '',
    whatsapp: '',
    type: 'individual' as 'individual' | 'corporate' | 'vip' | 'diplomat',
    address: 'Dubai Marina, Dubai',
    city: 'Dubai',
    country: 'United Arab Emirates',
    nationality: 'United Arab Emirates',
    idType: 'emirates_id' as 'emirates_id' | 'passport' | 'gcc_id',
    idNumber: '',
    idExpiryDate: '2028-12-31',
    licenseNumber: '',
    licenseCountry: 'United Arab Emirates',
    licenseExpiryDate: '2028-12-31',
    source: 'showroom' as any,
    isVIP: false,
    tags: ['New Client'],
    notes: ''
  });

  const [duplicateWarning, setDuplicateWarning] = useState<Customer[] | null>(null);

  // Active Selected Customer
  const activeCustomer = customers.find(c => c.id === selectedCustomerId) || customers[0];

  // 360 Tab selection
  const [activeTab, setActiveTab] = useState<'overview' | 'rentals' | 'statement' | 'comms' | 'docs'>('overview');

  // Filtered customer list
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = 
      c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.email.toLowerCase().includes(searchTerm) ||
      c.id.toLowerCase().includes(searchTerm);

    const matchesType = filterType === 'all' || c.type === filterType;
    const matchesVIP = filterVIP === null || c.isVIP === filterVIP;

    return matchesSearch && matchesType && matchesVIP;
  });

  const handlePhoneOrEmailChange = async (email: string, phone: string, lic?: string, idNum?: string) => {
    if (email.length > 4 || phone.length > 5) {
      const res = await checkDuplicateCustomer(email, phone, lic, idNum);
      if (res.hasDuplicate) {
        setDuplicateWarning(res.matches);
      } else {
        setDuplicateWarning(null);
      }
    }
  };

  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addCustomer(newCustForm);
    setAddModalOpen(false);
    setNewCustForm({
      fullName: '',
      companyName: '',
      email: '',
      phone: '',
      whatsapp: '',
      type: 'individual',
      address: 'Dubai Marina, Dubai',
      city: 'Dubai',
      country: 'United Arab Emirates',
      nationality: 'United Arab Emirates',
      idType: 'emirates_id',
      idNumber: '',
      idExpiryDate: '2028-12-31',
      licenseNumber: '',
      licenseCountry: 'United Arab Emirates',
      licenseExpiryDate: '2028-12-31',
      source: 'showroom',
      isVIP: false,
      tags: ['New Client'],
      notes: ''
    });
    setDuplicateWarning(null);
  };

  const fetchCustomerAiBrief = async (customerId: string) => {
    setAiBriefLoading(true);
    try {
      const res = await fetch('/api/ai/customer-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, language })
      });
      const data = await res.json();
      setAiBrief(data.summary);
    } catch (e) {
      console.error(e);
    } finally {
      setAiBriefLoading(false);
    }
  };

  // Associated 360 records for active customer
  const customerContracts = activeCustomer ? contracts.filter(c => c.customerId === activeCustomer.id) : [];
  const customerInvoices = activeCustomer ? invoices.filter(i => i.customerId === activeCustomer.id) : [];
  const customerDeposits = activeCustomer ? deposits.filter(d => d.customerId === activeCustomer.id) : [];
  const customerPayments = activeCustomer ? payments.filter(p => p.customerId === activeCustomer.id) : [];
  const customerComms = activeCustomer ? communications.filter(cm => cm.relatedEntityId === activeCustomer.id) : [];
  const customerDocs = activeCustomer ? documents.filter(d => d.relatedEntityId === activeCustomer.id) : [];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'ملف العميل 360 ودليل الشخصيات البارزة' : 'Customer 360 & VIP Directory'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'رؤية مركزية متكاملة لبيانات العملاء، الحجوزات، الودائع، وكشوف الحسابات' : 'Single source of truth for high-net-worth clients, rental history, security deposits & ledger'}
          </p>
        </div>

        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>{t('newCustomer')}</span>
        </button>
      </div>

      {/* Main Grid: Left Directory & Right 360 Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Customer Directory (4 cols on lg, 3 cols on xl/2xl) */}
        <div className="lg:col-span-4 xl:col-span-3 2xl:col-span-3 p-4 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-3">
          {/* Search and Filters */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={language === 'ar' ? 'بحث بالاسم، الهاتف، أو الهوية...' : 'Search by name, phone, or ID...'}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50"
            />
          </div>

          {/* Quick Filter chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setFilterVIP(null)}
              className={`px-2.5 py-1 rounded-lg border transition-all ${
                filterVIP === null ? 'bg-[#D4AF37]/20 border-[#D4AF37]/40 text-[#f5d97f]' : 'border-zinc-800 text-zinc-400'
              }`}
            >
              All ({customers.length})
            </button>
            <button
              onClick={() => setFilterVIP(true)}
              className={`px-2.5 py-1 rounded-lg border transition-all ${
                filterVIP === true ? 'bg-[#D4AF37]/20 border-[#D4AF37]/40 text-[#f5d97f]' : 'border-zinc-800 text-zinc-400'
              }`}
            >
              VIP Tier 1
            </button>
          </div>

          {/* List */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
            {filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">No customers found.</div>
            ) : (
              filteredCustomers.map(customer => {
                const isSelected = activeCustomer?.id === customer.id;
                return (
                  <div
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      setAiBrief(null);
                    }}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40 shadow-sm shadow-[#D4AF37]/10'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-zinc-200 truncate">{customer.fullName}</h4>
                          {customer.isVIP && <Badge variant="gold" size="sm">VIP</Badge>}
                        </div>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">{customer.phone}</p>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">{customer.id}</span>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-zinc-800/50 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>LTV: <strong className="text-zinc-200">{customer.lifetimeValue.toLocaleString()} AED</strong></span>
                      <span>{customer.totalRentals} Rentals</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: 360 Deep Profile */}
        {activeCustomer ? (
          <div className="lg:col-span-8 xl:col-span-9 2xl:col-span-9 p-4 sm:p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-6">
            {/* VIP Customer Profile Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-950 border border-zinc-800">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#997d26] p-0.5 shadow-lg shadow-[#D4AF37]/20 flex items-center justify-center">
                  <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center font-display text-xl font-bold text-[#f5d97f]">
                    {activeCustomer.fullName.charAt(0)}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-lg font-bold text-zinc-100 font-display">{activeCustomer.fullName}</h3>
                    {activeCustomer.isVIP && <Badge variant="gold" size="sm">VIP GUEST</Badge>}
                    <Badge variant={activeCustomer.status === 'active' ? 'emerald' : 'zinc'} size="sm">
                      {(activeCustomer.status || '').toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 flex items-center gap-3">
                    <span>{activeCustomer.id}</span>
                    <span>•</span>
                    <span>{activeCustomer.nationality}</span>
                    {activeCustomer.companyName && (
                      <>
                        <span>•</span>
                        <span>{activeCustomer.companyName}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchCustomerAiBrief(activeCustomer.id)}
                  disabled={aiBriefLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D4AF37]/40 text-[#f5d97f] text-xs font-semibold hover:bg-[#D4AF37]/10 transition-all"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${aiBriefLoading ? 'animate-spin' : ''}`} />
                  <span>{language === 'ar' ? 'موجز AI' : 'VIP AI Brief'}</span>
                </button>
                <button
                  onClick={() => setMergeModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-800 transition-all"
                  title="Merge duplicate records into this account"
                >
                  <Merge className="w-3.5 h-3.5 text-sky-400" />
                  <span>{language === 'ar' ? 'دمج' : 'Merge'}</span>
                </button>
              </div>
            </div>

            {/* AI Brief box if available */}
            {aiBrief && (
              <div className="p-4 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/35 shadow-inner space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#f5d97f]">
                    <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Executive VIP Briefing</span>
                  </div>
                  <AiConfidenceBadge type="ai_suggestion" confidence={98} />
                </div>
                <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">{aiBrief}</p>
              </div>
            )}

            {/* Financial & Rental Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
                <p className="text-[10px] uppercase font-medium text-zinc-400 tracking-wider">Lifetime Value</p>
                <p className="text-base font-bold text-zinc-100 mt-1">{activeCustomer.lifetimeValue.toLocaleString()} AED</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
                <p className="text-[10px] uppercase font-medium text-zinc-400 tracking-wider">Total Rentals</p>
                <p className="text-base font-bold text-zinc-100 mt-1">{activeCustomer.totalRentals}</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
                <p className="text-[10px] uppercase font-medium text-zinc-400 tracking-wider">Deposits Held</p>
                <p className="text-base font-bold text-[#f5d97f] mt-1">{activeCustomer.securityDepositsHeld.toLocaleString()} AED</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
                <p className="text-[10px] uppercase font-medium text-zinc-400 tracking-wider">Balance Due</p>
                <p className={`text-base font-bold mt-1 ${activeCustomer.outstandingBalance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {activeCustomer.outstandingBalance.toLocaleString()} AED
                </p>
              </div>
            </div>

            {/* 360 Tab Navigation */}
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 overflow-x-auto custom-scrollbar">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap transition-all ${
                  activeTab === 'overview' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'الملف والوثائق' : 'Profile & Identity'}
              </button>
              <button
                onClick={() => setActiveTab('rentals')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap transition-all ${
                  activeTab === 'rentals' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'سجل الإيجارات' : 'Rental History'} ({customerContracts.length})
              </button>
              <button
                onClick={() => setActiveTab('statement')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap transition-all ${
                  activeTab === 'statement' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'كشف الحساب المالي' : 'Account Statement'}
              </button>
              <button
                onClick={() => setActiveTab('comms')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap transition-all ${
                  activeTab === 'comms' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'سجل التواصل' : 'Activity & Comms'} ({customerComms.length})
              </button>
              <button
                onClick={() => setActiveTab('docs')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap transition-all ${
                  activeTab === 'docs' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'المستندات' : 'Documents'} ({customerDocs.length})
              </button>
            </div>

            {/* TAB CONTENT: Profile & Identity */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-2.5">
                    <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">Contact Coordinates</h4>
                    <div className="text-xs text-zinc-300 space-y-1.5">
                      <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-[#D4AF37]" /> {activeCustomer.phone}</p>
                      <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-[#D4AF37]" /> {activeCustomer.email}</p>
                      <p className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-[#D4AF37]" /> {activeCustomer.address}, {activeCustomer.city}, {activeCustomer.country}</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-2.5">
                    <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">Identification & Licensing</h4>
                    <div className="text-xs text-zinc-300 space-y-1.5">
                      <p><strong>{(activeCustomer.idType || 'ID').toUpperCase()}:</strong> {activeCustomer.idNumber} (Exp: {activeCustomer.idExpiryDate})</p>
                      <p><strong>Driver License:</strong> {activeCustomer.licenseNumber} ({activeCustomer.licenseCountry}, Exp: {activeCustomer.licenseExpiryDate})</p>
                      <p><strong>Acquisition Source:</strong> {(activeCustomer.source || 'Direct').toUpperCase()}</p>
                    </div>
                  </div>
                </div>

                {/* VIP Preferences & Tags */}
                <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-2">
                  <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">VIP Concierge Notes & Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {activeCustomer.tags.map((tag, idx) => (
                      <Badge key={idx} variant="gold" size="sm">{tag}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-300 italic mt-2 leading-relaxed bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                    "{activeCustomer.notes || 'No custom notes recorded.'}"
                  </p>
                </div>
              </div>
            )}

            {/* TAB CONTENT: Rentals History */}
            {activeTab === 'rentals' && (
              <div className="space-y-3">
                {customerContracts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">No rental history for this client.</div>
                ) : (
                  customerContracts.map(contract => (
                    <div
                      key={contract.id}
                      onClick={() => {
                        setSelectedContractId(contract.id);
                        setActiveView('contracts');
                      }}
                      className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 hover:border-[#D4AF37]/40 transition-all flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-zinc-200">{contract.vehicleName}</h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                            {contract.vehiclePlate}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">
                          {contract.contractNumber} • {new Date(contract.startDateTime).toLocaleDateString()} to {new Date(contract.endDateTime).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-sm font-bold text-zinc-100">{contract.grandTotal.toLocaleString()} AED</p>
                        <Badge variant={contract.status === 'active' ? 'emerald' : 'zinc'} size="sm">
                          {(contract.status || '').toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: Financial Statement */}
            {activeTab === 'statement' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200">Customer Account Statement</h4>
                    <p className="text-xs text-zinc-400">Statement period: All historical transactions to date</p>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-800 transition-all"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{language === 'ar' ? 'طباعة الكشف' : 'Print Statement'}</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400">
                        <th className="pb-3 text-start font-medium">Type</th>
                        <th className="pb-3 text-start font-medium">Ref / Number</th>
                        <th className="pb-3 text-start font-medium">Date</th>
                        <th className="pb-3 text-end font-medium">Invoiced (AED)</th>
                        <th className="pb-3 text-end font-medium">Paid (AED)</th>
                        <th className="pb-3 text-end font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {customerInvoices.map(inv => (
                        <tr key={inv.id} className="text-zinc-300">
                          <td className="py-3 font-semibold text-[#f5d97f]">Invoice</td>
                          <td className="py-3 font-mono">{inv.invoiceNumber}</td>
                          <td className="py-3">{new Date(inv.issuedDate).toLocaleDateString()}</td>
                          <td className="py-3 text-end font-medium">{inv.totalAmount.toLocaleString()}</td>
                          <td className="py-3 text-end text-emerald-400 font-medium">{inv.paidAmount.toLocaleString()}</td>
                          <td className="py-3 text-end">
                            <Badge variant={inv.status === 'paid' ? 'emerald' : 'rose'} size="sm">
                              {(inv.status || '').toUpperCase()}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT: Activity & Comms */}
            {activeTab === 'comms' && (
              <div className="space-y-3">
                {customerComms.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">No communication logs recorded.</div>
                ) : (
                  customerComms.map(comm => (
                    <div key={comm.id} className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-200 uppercase">{comm.channel} • {comm.direction}</span>
                        <span className="text-zinc-500">{new Date(comm.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-zinc-300">{comm.summary}</p>
                      <p className="text-[10px] text-zinc-400">Logged by {comm.actorName}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: Documents */}
            {activeTab === 'docs' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customerDocs.length === 0 ? (
                  <div className="col-span-2 p-8 text-center text-xs text-zinc-500">No digital documents attached.</div>
                ) : (
                  customerDocs.map(doc => (
                    <div key={doc.id} className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[#D4AF37]">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-zinc-200">{doc.title}</h4>
                          <p className="text-[10px] text-zinc-400">{(doc.type || 'DOC').toUpperCase()} • {doc.fileSizeMb} MB</p>
                        </div>
                      </div>
                      <Badge variant="emerald" size="sm">{doc.verificationStatus}</Badge>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Add Customer Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={language === 'ar' ? 'تسجيل عميل جديد' : 'Onboard New VIP Customer'}
        subtitle={language === 'ar' ? 'تسجيل بيانات العميل مع الفحص الفوري لمنع تكرار السجلات' : 'Register customer profile with real-time duplicate checking'}
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateCustomerSubmit} className="space-y-4 text-xs">
          {/* Real-time duplicate alert */}
          {duplicateWarning && (
            <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/50 space-y-1.5 animate-fade-in">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                <AlertTriangle className="w-4 h-4" />
                <span>Duplicate Records Detected</span>
              </div>
              <p className="text-zinc-300">
                Found {duplicateWarning.length} existing customer(s) matching this phone or email:
              </p>
              {duplicateWarning.map(d => (
                <div key={d.id} className="p-2 rounded-lg bg-zinc-900/80 flex items-center justify-between">
                  <span>{d.fullName} ({d.id}) - {d.phone}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId(d.id);
                      setAddModalOpen(false);
                    }}
                    className="text-[#f5d97f] font-semibold hover:underline"
                  >
                    View Record →
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Full Legal Name *</label>
              <input
                type="text"
                required
                value={newCustForm.fullName}
                onChange={(e) => setNewCustForm({ ...newCustForm, fullName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
                placeholder="e.g. H.E. Sheikh Tariq Al Nahyan"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Company / Entity (Optional)</label>
              <input
                type="text"
                value={newCustForm.companyName}
                onChange={(e) => setNewCustForm({ ...newCustForm, companyName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
                placeholder="e.g. Al Nahyan Holding Group"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={newCustForm.email}
                onChange={(e) => {
                  setNewCustForm({ ...newCustForm, email: e.target.value });
                  handlePhoneOrEmailChange(e.target.value, newCustForm.phone);
                }}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
                placeholder="client@vip.ae"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Phone Number (with Country Code) *</label>
              <input
                type="text"
                required
                value={newCustForm.phone}
                onChange={(e) => {
                  setNewCustForm({ ...newCustForm, phone: e.target.value });
                  handlePhoneOrEmailChange(newCustForm.email, e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
                placeholder="+971 50 123 4567"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Customer Category</label>
              <select
                value={newCustForm.type}
                onChange={(e) => setNewCustForm({ ...newCustForm, type: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
              >
                <option value="vip">VIP Tier 1</option>
                <option value="individual">Individual</option>
                <option value="corporate">Corporate</option>
                <option value="diplomat">Diplomat</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Nationality</label>
              <input
                type="text"
                value={newCustForm.nationality}
                onChange={(e) => setNewCustForm({ ...newCustForm, nationality: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Emirates ID / Passport No.</label>
              <input
                type="text"
                value={newCustForm.idNumber}
                onChange={(e) => setNewCustForm({ ...newCustForm, idNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
                placeholder="784-1985-XXXXXXX-1"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:bg-zinc-800"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold shadow-md"
            >
              Register Customer
            </button>
          </div>
        </form>
      </Modal>

      {/* Merge Modal */}
      <Modal
        isOpen={mergeModalOpen}
        onClose={() => setMergeModalOpen(false)}
        title={language === 'ar' ? 'دمج السجلات المكررة' : 'Consolidate Duplicate Customer Records'}
        subtitle={language === 'ar' ? 'نقل كافة العقود والودائع والفواتير إلى هذا الحساب الرئيسي' : 'Safely re-link all contracts, deposits, and financial ledgers into this master profile'}
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-zinc-300 leading-relaxed">
            Select the duplicate source customer account to merge into <strong>{activeCustomer?.fullName} ({activeCustomer?.id})</strong>:
          </p>

          <select
            value={targetMergeId}
            onChange={(e) => setTargetMergeId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
          >
            <option value="">Select duplicate customer...</option>
            {customers.filter(c => c.id !== activeCustomer?.id).map(c => (
              <option key={c.id} value={c.id}>
                {c.fullName} ({c.id}) - {c.phone}
              </option>
            ))}
          </select>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setMergeModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:bg-zinc-800"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={!targetMergeId}
              onClick={async () => {
                if (targetMergeId && activeCustomer) {
                  await mergeCustomers(targetMergeId, activeCustomer.id);
                  setMergeModalOpen(false);
                }
              }}
              className="px-5 py-2 rounded-xl bg-sky-500 text-zinc-950 font-semibold shadow-md disabled:opacity-50"
            >
              {language === 'ar' ? 'تأكيد الدمج' : 'Confirm Merge'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
