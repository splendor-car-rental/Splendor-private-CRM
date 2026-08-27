import React, { useState, useEffect, useRef } from 'react';
import {
  Users, UserPlus, Search, Filter, Phone, Mail, MapPin,
  Car, Shield, FileText, Landmark, Clock, CheckCircle2,
  AlertTriangle, Sparkles, ChevronRight, X, Edit3, Merge,
  Printer, ArrowUpRight, DollarSign, Calendar, UploadCloud, Plus
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Customer, CRMDocument } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { AiConfidenceBadge } from '../common/AiConfidenceBadge';
import { uploadFile, formatFileSize } from '../../lib/upload';
import { formatDate, formatDateTime } from '../../lib/dateFormat';
import { apiFetch } from '../../lib/apiFetch';

const DOCUMENT_CATEGORIES: CRMDocument['category'][] = ['customer_id', 'driving_license', 'contract', 'invoice', 'receipt', 'other'];

export const Customer360View: React.FC = () => {
  const { language, t } = useLanguage();
  const { currentUser } = useAuth();
  const {
    customers, contracts, invoices, deposits,
    payments, communications, documents,
    selectedCustomerId, setSelectedCustomerId,
    addCustomer, updateCustomer, mergeCustomers, checkDuplicateCustomer,
    setActiveView, setSelectedContractId, addDocument, showToast
  } = useCRM();

  const [docUploading, setDocUploading] = useState(false);
  const [docCategory, setDocCategory] = useState<CRMDocument['category']>('customer_id');
  const docFileInputRef = useRef<HTMLInputElement>(null);

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
    type: 'individual' as 'individual' | 'corporate' | 'vip',
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
    const s = (searchTerm || '').toLowerCase();
    const matchesSearch = 
      (c.fullName || '').toLowerCase().includes(s) ||
      (c.phone || '').includes(searchTerm || '') ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.id || '').toLowerCase().includes(s);

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
      const res = await apiFetch('/api/ai/customer-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, language })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setAiBrief(data.summary);
    } catch (e: any) {
      console.error(e);
      showToast('AI Summary Failed', e?.message || 'Could not generate the customer summary. Please try again.', 'error');
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

  const handleDocPick = () => docFileInputRef.current?.click();

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeCustomer) return;
    setDocUploading(true);
    try {
      const { url } = await uploadFile(file, 'customer-documents', { customerId: activeCustomer.id });
      await addDocument({
        title: file.name,
        category: docCategory,
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        fileType: file.type,
        fileUrl: url,
        relatedEntityType: 'customer',
        relatedEntityId: activeCustomer.id,
        relatedEntityName: activeCustomer.fullName,
        version: 1,
        uploadedBy: currentUser.name
      });
      showToast(
        language === 'ar' ? 'تم رفع المستند' : 'Document Uploaded',
        language === 'ar' ? 'تم إرفاق المستند بملف العميل بنجاح.' : 'The document was attached to the customer profile.',
        'success'
      );
    } catch (err: any) {
      showToast(
        language === 'ar' ? 'فشل رفع المستند' : 'Upload Failed',
        err?.message || (language === 'ar' ? 'حدث خطأ أثناء رفع المستند.' : 'Something went wrong uploading the document.'),
        'error'
      );
    } finally {
      setDocUploading(false);
    }
  };

  const docCategoryLabel = (cat: CRMDocument['category']) => {
    const labels: Record<string, { en: string; ar: string }> = {
      customer_id: { en: 'Emirates ID / Passport', ar: 'هوية إماراتية / جواز سفر' },
      driving_license: { en: 'Driving License', ar: 'رخصة القيادة' },
      contract: { en: 'Contract', ar: 'عقد' },
      invoice: { en: 'Invoice', ar: 'فاتورة' },
      receipt: { en: 'Receipt', ar: 'إيصال' },
      vehicle_reg: { en: 'Vehicle Registration', ar: 'رخصة مركبة' },
      vehicle_insurance: { en: 'Vehicle Insurance', ar: 'تأمين مركبة' },
      inspection_sheet: { en: 'Inspection Sheet', ar: 'كشف فحص' },
      statement: { en: 'Statement', ar: 'كشف حساب' },
      other: { en: 'Other', ar: 'أخرى' }
    };
    if (!cat) return '';
    return labels[cat] ? (language === 'ar' ? labels[cat].ar : labels[cat].en) : (cat ? String(cat).toUpperCase() : '');
  };

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
        {/* Left Column: Customer Directory (4 cols) */}
        <div className="lg:col-span-4 p-4 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-3">
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
                      <span>LTV: <strong className="text-zinc-200">{(customer.lifetimeValue || 0).toLocaleString()} AED</strong></span>
                      <span>{customer.totalRentals || 0} Rentals</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: 360 Deep Profile (8 cols) */}
        {activeCustomer ? (
          <div className="lg:col-span-8 p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-6">
            {/* VIP Customer Profile Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-950 border border-zinc-800">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#997d26] p-0.5 shadow-lg shadow-[#D4AF37]/20 flex items-center justify-center">
                  <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center font-display text-xl font-bold text-[#f5d97f]">
                    {(activeCustomer.fullName || 'V').charAt(0)}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-lg font-bold text-zinc-100 font-display">{activeCustomer.fullName || 'Unnamed Client'}</h3>
                    {activeCustomer.isVIP && <Badge variant="gold" size="sm">VIP GUEST</Badge>}
                    <Badge variant={activeCustomer.status === 'active' ? 'emerald' : 'zinc'} size="sm">
                      {(activeCustomer.status || 'ACTIVE').toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 flex items-center gap-3">
                    <span>{activeCustomer.id}</span>
                    <span>•</span>
                    <span>{activeCustomer.nationality || 'UAE'}</span>
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
                <p className="text-base font-bold text-zinc-100 mt-1">{(activeCustomer.lifetimeValue || 0).toLocaleString()} AED</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
                <p className="text-[10px] uppercase font-medium text-zinc-400 tracking-wider">Total Rentals</p>
                <p className="text-base font-bold text-zinc-100 mt-1">{activeCustomer.totalRentals || 0}</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
                <p className="text-[10px] uppercase font-medium text-zinc-400 tracking-wider">Deposits Held</p>
                <p className="text-base font-bold text-[#f5d97f] mt-1">{(activeCustomer.securityDepositsHeld || 0).toLocaleString()} AED</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
                <p className="text-[10px] uppercase font-medium text-zinc-400 tracking-wider">Balance Due</p>
                <p className={`text-base font-bold mt-1 ${(activeCustomer.outstandingBalance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {(activeCustomer.outstandingBalance || 0).toLocaleString()} AED
                </p>
              </div>
            </div>

            {/* 360 Tab Navigation */}
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'overview' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'الملف والوثائق' : 'Profile & Identity'}
              </button>
              <button
                onClick={() => setActiveTab('rentals')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'rentals' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'سجل الإيجارات' : 'Rental History'} ({customerContracts.length})
              </button>
              <button
                onClick={() => setActiveTab('statement')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'statement' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'كشف الحساب المالي' : 'Account Statement'}
              </button>
              <button
                onClick={() => setActiveTab('comms')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'comms' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'سجل التواصل' : 'Activity & Comms'} ({customerComms.length})
              </button>
              <button
                onClick={() => setActiveTab('docs')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
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
                      <p><strong>{(activeCustomer.idType || 'ID').toUpperCase()}:</strong> {activeCustomer.idNumber || 'N/A'} (Exp: {activeCustomer.idExpiryDate || 'N/A'})</p>
                      <p><strong>Driver License:</strong> {activeCustomer.licenseNumber || 'N/A'} ({activeCustomer.licenseCountry || 'UAE'}, Exp: {activeCustomer.licenseExpiryDate || 'N/A'})</p>
                      <p><strong>Acquisition Source:</strong> {(activeCustomer.source || 'Direct').toUpperCase()}</p>
                    </div>
                  </div>
                </div>

                {/* VIP Preferences & Tags */}
                <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-2">
                  <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">VIP Concierge Notes & Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(activeCustomer.tags || []).map((tag, idx) => (
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
                          {contract.contractNumber} • {contract.startDateTime ? formatDate(contract.startDateTime) : 'N/A'} to {contract.endDateTime ? formatDate(contract.endDateTime) : 'N/A'}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-sm font-bold text-zinc-100">{(contract.grandTotal || 0).toLocaleString()} AED</p>
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
                          <td className="py-3 font-mono">{inv.id}</td>
                          <td className="py-3">{inv.issueDate ? formatDate(inv.issueDate) : 'N/A'}</td>
                          <td className="py-3 text-end font-medium">{(inv.totalAmount || 0).toLocaleString()}</td>
                          <td className="py-3 text-end text-emerald-400 font-medium">{(inv.paidAmount || 0).toLocaleString()}</td>
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
                        <span className="text-zinc-500">{comm.timestamp ? formatDateTime(comm.timestamp) : 'N/A'}</span>
                      </div>
                      <p className="text-xs text-zinc-300">{comm.content}</p>
                      <p className="text-[10px] text-zinc-400">Logged by {comm.createdByName}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: Documents */}
            {activeTab === 'docs' && (
              <div className="space-y-4">
                {/* Upload bar -- ID/license photos and any other customer document */}
                <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex flex-wrap items-center gap-3">
                  <select
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value as CRMDocument['category'])}
                    className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/50"
                  >
                    {DOCUMENT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{docCategoryLabel(cat)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleDocPick}
                    disabled={docUploading || !activeCustomer}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold text-xs shadow-md hover:brightness-110 disabled:opacity-60 transition-all"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>
                      {docUploading
                        ? (language === 'ar' ? 'جارِ الرفع...' : 'Uploading...')
                        : (language === 'ar' ? 'رفع مستند / صورة' : 'Upload Document / Photo')}
                    </span>
                  </button>
                  <input
                    ref={docFileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleDocUpload}
                  />
                  <span className="text-[10px] text-zinc-500">
                    {language === 'ar' ? 'صور الهوية والرخصة وأي مستند آخر يخص العميل' : 'ID photos, license scans, or any other customer document'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {customerDocs.length === 0 ? (
                    <div className="col-span-2 p-8 text-center text-xs text-zinc-500">
                      {language === 'ar' ? 'لا توجد مستندات رقمية مرفقة بعد.' : 'No digital documents attached yet.'}
                    </div>
                  ) : (
                    customerDocs.map(doc => (
                      <a
                        key={doc.id}
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-between hover:border-[#D4AF37]/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[#D4AF37] shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-zinc-200 truncate">{doc.title}</h4>
                            <p className="text-[10px] text-zinc-400">{docCategoryLabel(doc.category)} • {doc.fileSize}</p>
                          </div>
                        </div>
                        <Badge variant="emerald" size="sm">{`v${doc.version}`}</Badge>
                      </a>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="lg:col-span-8 p-12 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl flex flex-col items-center justify-center text-center space-y-4 min-h-[420px]">
            <div className="w-16 h-16 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-[#D4AF37] shadow-inner">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100 font-display">
                {language === 'ar' ? 'لم يتم تحديد عميل' : 'No Customer Selected'}
              </h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                {language === 'ar'
                  ? 'يرجى اختيار عميل من القائمة الجانبية أو تسجيل عميل جديد لاستعراض ملف العميل الشامل 360.'
                  : 'Please select a customer from the left list or register a new VIP client to view the 360 profile.'}
              </p>
            </div>
            <button
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{t('newCustomer')}</span>
            </button>
          </div>
        )}
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
