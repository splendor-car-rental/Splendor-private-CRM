import React, { useState, useEffect, useRef } from 'react';
import {
  Users, UserPlus, Search, Filter, Phone, Mail, MapPin,
  Car, Shield, FileText, Landmark, Clock, CheckCircle2,
  Sparkles, ChevronRight, X, Edit3, Merge,
  Printer, ArrowUpRight, DollarSign, Calendar, UploadCloud, Plus
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { CRMDocument } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { PhoneText } from '../common/PhoneText';
import { AiConfidenceBadge } from '../common/AiConfidenceBadge';
import { KycManagerCard } from '../common/KycManagerCard';
import { AddCustomerModal } from '../modals/AddCustomerModal';
import { uploadFile, formatFileSize } from '../../lib/upload';
import { formatDate, formatDateTime } from '../../lib/dateFormat';
import { apiFetch } from '../../lib/apiFetch';

const DOCUMENT_CATEGORIES: CRMDocument['category'][] = ['customer_id', 'driving_license', 'contract', 'invoice', 'receipt', 'other'];

export const Customer360View: React.FC = () => {
  const { language, t } = useLanguage();
  const { currentUser } = useAuth();
  const {
    customers, contracts, deposits,
    payments, communications, documents,
    selectedCustomerId, setSelectedCustomerId,
    mergeCustomers,
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

  // Real accounting-ledger-based statement (invoices + payments + credit/debit
  // notes + running totals) -- the actual posted evidence, not just a raw
  // invoice list built from the local customers/invoices context arrays.
  const [accountingStatement, setAccountingStatement] = useState<{
    totalInvoiced: number; totalPaid: number; totalCreditNotes: number; totalDebitNotes: number; outstanding: number;
    invoices: Array<{ id: string; issueDate: string; totalAmount: number; paidAmount: number; status: string }>;
    payments: Array<{ id: string; receivedAt: string; amount: number; method: string; referenceNumber?: string }>;
    notes: Array<{ id: string; type: 'credit_note' | 'debit_note'; issueDate: string; totalAmount: number; reason: string }>;
  } | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // Active Selected Customer
  const activeCustomer = customers.find(c => c.id === selectedCustomerId) || customers[0];

  // 360 Tab selection
  const [activeTab, setActiveTab] = useState<'overview' | 'rentals' | 'lto' | 'statement' | 'comms' | 'docs' | 'kyc'>('overview');

  useEffect(() => {
    if (activeTab !== 'statement' || !activeCustomer?.id) return;
    let cancelled = false;
    setStatementLoading(true);
    apiFetch(`/api/accounting/customers/${encodeURIComponent(activeCustomer.id)}/statement`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error(data?.error || 'Failed to load statement');
        setAccountingStatement(data);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load accounting statement', err);
        showToast(language === 'ar' ? 'تعذر تحميل كشف الحساب المحاسبي' : 'Failed to load accounting statement', err?.message || '', 'error');
      })
      .finally(() => { if (!cancelled) setStatementLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, activeCustomer?.id, showToast, language]);

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
  const customerLtoContracts = activeCustomer ? contracts.filter(c => c.customerId === activeCustomer.id && c.contractType === 'lease_to_own' && c.lto) : [];
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

  // Documents uploaded after the customer-document security fix get a
  // fileUrl pointing at the authenticated GET /api/documents/file proxy
  // (a relative path), which requires the Bearer auth header apiFetch
  // attaches -- a plain <a href> navigation can't send that header, so
  // this fetches the file as a blob and opens THAT instead. Documents
  // uploaded before the fix still carry an absolute Firebase Storage
  // signed URL and keep working exactly as before (no auth header
  // needed, and none is sent for an absolute URL).
  const handleOpenDocument = async (e: React.MouseEvent, doc: CRMDocument) => {
    e.preventDefault();
    if (/^https?:\/\//i.test(doc.fileUrl)) {
      window.open(doc.fileUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const res = await apiFetch(doc.fileUrl);
      if (!res.ok) throw new Error(`Failed to load document (${res.status}).`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (err: any) {
      showToast(
        language === 'ar' ? 'تعذر فتح المستند' : 'Could Not Open Document',
        err?.message || (language === 'ar' ? 'حدث خطأ أثناء تحميل المستند.' : 'Something went wrong loading the document.'),
        'error'
      );
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
                        <p className="text-xs text-zinc-400 truncate mt-0.5"><PhoneText value={customer.phone} /></p>
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
                  {activeCustomer.fullNameEn && (
                    <p className="text-xs text-zinc-500 mt-0.5" dir="ltr">{activeCustomer.fullNameEn}</p>
                  )}
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
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'overview' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'الملف والوثائق' : 'Profile & Identity'}
              </button>
              <button
                onClick={() => setActiveTab('rentals')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'rentals' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'سجل الإيجارات' : 'Rental History'} ({customerContracts.length})
              </button>
              {customerLtoContracts.length > 0 && (
                <button
                  onClick={() => setActiveTab('lto')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                    activeTab === 'lto' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {language === 'ar' ? 'الإيجار المنتهي بالتملك' : 'Lease-to-Own'} ({customerLtoContracts.length})
                </button>
              )}
              <button
                onClick={() => setActiveTab('statement')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'statement' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'كشف الحساب المالي' : 'Account Statement'}
              </button>
              <button
                onClick={() => setActiveTab('comms')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'comms' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'سجل التواصل' : 'Activity & Comms'} ({customerComms.length})
              </button>
              <button
                onClick={() => setActiveTab('docs')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'docs' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'المستندات' : 'Documents'} ({customerDocs.length})
              </button>
              <button
                onClick={() => setActiveTab('kyc')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  activeTab === 'kyc' ? 'bg-zinc-800 text-[#f5d97f] border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {language === 'ar' ? 'التحقق من الهوية (KYC)' : 'KYC Verification'}
              </button>
            </div>

            {/* TAB CONTENT: Profile & Identity */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-2.5">
                    <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">Contact Coordinates</h4>
                    <div className="text-xs text-zinc-300 space-y-1.5">
                      <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-[#D4AF37]" /> <PhoneText value={activeCustomer.phone} /></p>
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

            {/* TAB CONTENT: Lease-to-Own */}
            {activeTab === 'lto' && (
              <div className="space-y-3">
                {customerLtoContracts.map(contract => {
                  const lto = contract.lto!;
                  return (
                    <div
                      key={contract.id}
                      onClick={() => setActiveView('lease-to-own')}
                      className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 hover:border-[#D4AF37]/40 transition-all cursor-pointer space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-200">{contract.vehicleName}</h4>
                          <p className="text-xs text-zinc-400 mt-0.5">{contract.id}</p>
                        </div>
                        <Badge variant={lto.ltoStatus === 'active' ? 'emerald' : lto.ltoStatus === 'default' || lto.ltoStatus === 'terminated' ? 'rose' : 'gold'} size="sm">
                          {lto.ltoStatus.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-zinc-500">{language === 'ar' ? 'القسط الشهري' : 'Monthly Payment'}</p>
                          <p className="text-zinc-200 font-semibold">{lto.monthlyInstallment.toLocaleString()} AED</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">{language === 'ar' ? 'المسدد' : 'Paid'}</p>
                          <p className="text-zinc-200 font-semibold">{lto.paidAmount.toLocaleString()} AED</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">{language === 'ar' ? 'المتبقي' : 'Outstanding'}</p>
                          <p className="text-zinc-200 font-semibold">{lto.outstandingAmount.toLocaleString()} AED</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">{language === 'ar' ? 'المدة (أشهر)' : 'Term (months)'}</p>
                          <p className="text-zinc-200 font-semibold">{lto.termMonths}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB CONTENT: Financial Statement */}
            {activeTab === 'statement' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200">{language === 'ar' ? 'كشف حساب العميل (محاسبي)' : 'Customer Account Statement (Accounting)'}</h4>
                    <p className="text-xs text-zinc-400">{language === 'ar' ? 'مبني على الفواتير والدفعات والإشعارات الفعلية المسجلة' : 'Built from the actual recorded invoices, payments, and notes'}</p>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-800 transition-all"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{language === 'ar' ? 'طباعة الكشف' : 'Print Statement'}</span>
                  </button>
                </div>

                {statementLoading ? (
                  <div className="p-8 text-center text-xs text-zinc-500">{language === 'ar' ? 'جارِ التحميل...' : 'Loading...'}</div>
                ) : !accountingStatement ? (
                  <div className="p-8 text-center text-xs text-zinc-500">{language === 'ar' ? 'تعذر تحميل الكشف.' : 'Could not load the statement.'}</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <StatementMini label={language === 'ar' ? 'إجمالي الفواتير' : 'Total Invoiced'} value={accountingStatement.totalInvoiced} />
                      <StatementMini label={language === 'ar' ? 'إجمالي المدفوع' : 'Total Paid'} value={accountingStatement.totalPaid} accent="emerald" />
                      <StatementMini label={language === 'ar' ? 'إشعارات دائنة' : 'Credit Notes'} value={accountingStatement.totalCreditNotes} />
                      <StatementMini label={language === 'ar' ? 'إشعارات مدينة' : 'Debit Notes'} value={accountingStatement.totalDebitNotes} />
                      <StatementMini label={language === 'ar' ? 'الرصيد المستحق' : 'Outstanding'} value={accountingStatement.outstanding} accent={accountingStatement.outstanding > 0 ? 'rose' : 'emerald'} />
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-start min-w-[640px]">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400">
                            <th className="pb-3 text-start font-medium">{language === 'ar' ? 'النوع' : 'Type'}</th>
                            <th className="pb-3 text-start font-medium">{language === 'ar' ? 'المرجع' : 'Ref / Number'}</th>
                            <th className="pb-3 text-start font-medium">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                            <th className="pb-3 text-end font-medium">{language === 'ar' ? 'المبلغ (درهم)' : 'Amount (AED)'}</th>
                            <th className="pb-3 text-end font-medium">{language === 'ar' ? 'الحالة/التفاصيل' : 'Status / Details'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {[
                            ...accountingStatement.invoices.map(inv => ({ kind: 'invoice' as const, date: inv.issueDate, ref: inv.id, amount: inv.totalAmount, detail: `${(inv.status || '').toUpperCase()} — ${language === 'ar' ? 'مدفوع' : 'paid'} ${(inv.paidAmount || 0).toLocaleString()}` })),
                            ...accountingStatement.payments.map(p => ({ kind: 'payment' as const, date: p.receivedAt, ref: p.id, amount: p.amount, detail: `${p.method}${p.referenceNumber ? ` — ${p.referenceNumber}` : ''}` })),
                            ...accountingStatement.notes.map(n => ({ kind: n.type, date: n.issueDate, ref: n.id, amount: n.totalAmount, detail: n.reason }))
                          ]
                            .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                            .map(row => (
                              <tr key={`${row.kind}-${row.ref}`} className="text-zinc-300">
                                <td className="py-3 font-semibold">
                                  {row.kind === 'invoice' && <span className="text-[#f5d97f]">{language === 'ar' ? 'فاتورة' : 'Invoice'}</span>}
                                  {row.kind === 'payment' && <span className="text-emerald-400">{language === 'ar' ? 'دفعة' : 'Payment'}</span>}
                                  {row.kind === 'credit_note' && <span className="text-sky-400">{language === 'ar' ? 'إشعار دائن' : 'Credit Note'}</span>}
                                  {row.kind === 'debit_note' && <span className="text-amber-400">{language === 'ar' ? 'إشعار مدين' : 'Debit Note'}</span>}
                                </td>
                                <td className="py-3 font-mono">{row.ref}</td>
                                <td className="py-3">{row.date ? formatDate(row.date) : 'N/A'}</td>
                                <td className="py-3 text-end font-medium">{(row.amount || 0).toLocaleString()}</td>
                                <td className="py-3 text-end text-zinc-400">{row.detail}</td>
                              </tr>
                            ))}
                          {accountingStatement.invoices.length === 0 && accountingStatement.payments.length === 0 && accountingStatement.notes.length === 0 && (
                            <tr><td colSpan={5} className="py-8 text-center text-zinc-500">{language === 'ar' ? 'لا توجد معاملات مسجلة لهذا العميل.' : 'No transactions recorded for this customer.'}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
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
                        onClick={(e) => handleOpenDocument(e, doc)}
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

            {/* TAB CONTENT: KYC Verification */}
            {activeTab === 'kyc' && activeCustomer && (
              <KycManagerCard
                customer={activeCustomer}
                currentUserId={currentUser.id}
                currentUserRole={currentUser.role}
                currentUserName={currentUser.name}
                showToast={showToast}
              />
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

      {/* Add Customer Modal -- the shared AddCustomerModal (also used from the
          global "+ New Customer" action) so individual vs. corporate always
          goes through the same, fully-localized, KYC-aware registration
          flow instead of a second, divergent form. */}
      <AddCustomerModal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} />

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

const StatementMini: React.FC<{ label: string; value: number; accent?: 'emerald' | 'rose' }> = ({ label, value, accent }) => (
  <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
    <p className="text-[10px] text-zinc-500">{label}</p>
    <p className={`text-sm font-bold mt-1 ${accent === 'emerald' ? 'text-emerald-400' : accent === 'rose' ? 'text-rose-400' : 'text-zinc-100'}`}>{(value || 0).toLocaleString()} AED</p>
  </div>
);
