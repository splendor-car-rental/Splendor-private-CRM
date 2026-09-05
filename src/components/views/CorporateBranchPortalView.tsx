import React, { useState, useMemo } from 'react';
import { 
  Building2, MapPin, Users, DollarSign, ShieldCheck, 
  CreditCard, FileText, CheckCircle2, AlertTriangle, ArrowUpRight,
  Search, Filter, Plus, ChevronRight, Sparkles, Phone, Mail, Award,
  Trash2, Edit3, X, Check, ShieldAlert
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { PhoneText } from '../common/PhoneText';
import { formatAED } from '../../lib/currency';
import { formatDate } from '../../lib/dateFormat';
import { SOVEREIGN_BRANCHES } from '../../config/branches';
import { AddCorporateAccountModal } from '../modals/AddCorporateAccountModal';
import { CorporateAccount } from '../../types';

export const CorporateBranchPortalView: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const {
    corporateAccounts,
    updateCorporateAccount,
    deleteCorporateAccount
  } = useCRM();

  const isManagement = currentUser?.role === 'ceo' || currentUser?.role === 'admin';

  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCorpId, setSelectedCorpId] = useState<string | null>(null);

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<CorporateAccount | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    legalName: '',
    legalNameAr: '',
    tradeLicenseNumber: '',
    trnVatNumber: '',
    licenseExpiry: '',
    branchId: 'DXB_BB',
    primaryContact: {
      name: '',
      email: '',
      phone: '',
      designation: ''
    },
    creditLimitAed: 100000,
    paymentTermsDays: 30,
    status: 'active' as 'active' | 'under_review' | 'credit_hold',
    notes: ''
  });

  const filteredCorporates = useMemo(() => {
    return (corporateAccounts || []).filter(corp => {
      const matchSearch = (corp.legalName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (corp.tradeLicenseNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (corp.id || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchBranch = selectedBranch === 'ALL' || corp.branchId === selectedBranch;
      return matchSearch && matchBranch;
    });
  }, [corporateAccounts, searchQuery, selectedBranch]);

  const selectedCorp = useMemo(() => {
    if (selectedCorpId) {
      return (corporateAccounts || []).find(c => c.id === selectedCorpId) || null;
    }
    return filteredCorporates.length > 0 ? filteredCorporates[0] : null;
  }, [selectedCorpId, corporateAccounts, filteredCorporates]);

  // Dynamic Aggregate Metrics
  const totalCreditAllocated = useMemo(() => {
    return (corporateAccounts || []).reduce((s, c) => s + (Number(c.creditLimitAed) || 0), 0);
  }, [corporateAccounts]);

  const totalExposureUsed = useMemo(() => {
    return (corporateAccounts || []).reduce((s, c) => s + (Number(c.usedExposureAed) || 0), 0);
  }, [corporateAccounts]);

  const totalAvailableCredit = Math.max(0, totalCreditAllocated - totalExposureUsed);

  const handleOpenEdit = (corp: CorporateAccount) => {
    setFormData({
      legalName: corp.legalName || '',
      legalNameAr: corp.legalNameAr || '',
      tradeLicenseNumber: corp.tradeLicenseNumber || '',
      trnVatNumber: corp.trnVatNumber || '',
      licenseExpiry: corp.licenseExpiry || '',
      branchId: corp.branchId || 'DXB_BB',
      primaryContact: {
        name: corp.primaryContact?.name || '',
        email: corp.primaryContact?.email || '',
        phone: corp.primaryContact?.phone || '',
        designation: corp.primaryContact?.designation || ''
      },
      creditLimitAed: corp.creditLimitAed || 0,
      paymentTermsDays: corp.paymentTermsDays || 30,
      status: corp.status || 'active',
      notes: corp.notes || ''
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCorp) return;
    try {
      await updateCorporateAccount(selectedCorp.id, {
        ...formData,
        creditLimitAed: Number(formData.creditLimitAed) || 0,
        paymentTermsDays: Number(formData.paymentTermsDays) || 30
      });
      setIsEditModalOpen(false);
    } catch (err: any) {
      // toast shown in context
    }
  };

  const handleConfirmDelete = async () => {
    if (!accountToDelete) return;
    try {
      setIsDeleting(true);
      await deleteCorporateAccount(accountToDelete.id, deleteReason);
      if (selectedCorpId === accountToDelete.id) {
        setSelectedCorpId(null);
      }
      setAccountToDelete(null);
      setDeleteReason('');
    } catch (err: any) {
      // error handled in context
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-[#071328] via-zinc-950 to-[#0B1E3B] p-6 rounded-3xl border border-blue-900/40 shadow-2xl shadow-blue-950/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-mono uppercase tracking-widest flex items-center gap-1.5">
              <Building2 className="w-3 h-3 text-blue-400" />
              {language === 'ar' ? 'بوابة الحسابات المؤسسية الحقيقية وشبكة الفروع' : 'ENTERPRISE B2B CORPORATE PORTAL'}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Splendor OS 2.0 Real Data Core</span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-display font-bold text-zinc-100 flex items-center gap-3">
            <span>{language === 'ar' ? 'إدارة حسابات الشركات والحدود الائتمانية' : 'Corporate Accounts & Credit Exposure'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
            {language === 'ar'
              ? 'إدارة حسابات الشركات الحقيقية، متابعة السقوف الائتمانية والتعريض الفعلي، مع صلاحية الحذف والإدارة الدقيقة للإدارة فقط.'
              : 'Production B2B Portfolio: Real corporate accounts, dynamic credit lines, trade license validation, and granular management deletion control.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'ar' ? 'تسجيل شركة جديدة' : 'Register Corporate Account'}</span>
          </button>
        </div>
      </div>

      {/* Sovereign Branch Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {SOVEREIGN_BRANCHES.map(branch => {
          const isSelected = selectedBranch === branch.id;
          const branchCorps = (corporateAccounts || []).filter(c => c.branchId === branch.id);
          
          return (
            <div
              key={branch.id}
              onClick={() => setSelectedBranch(isSelected ? 'ALL' : branch.id)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                isSelected 
                  ? 'bg-gradient-to-b from-blue-950/90 to-zinc-950 border-blue-500 ring-2 ring-blue-500/30 shadow-xl' 
                  : 'bg-zinc-950 hover:bg-zinc-900 border-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-blue-400 font-bold">{branch.code}</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  {branchCorps.length} {language === 'ar' ? 'شركات' : 'Clients'}
                </span>
              </div>
              <div className="font-bold text-zinc-100 text-xs mt-2 truncate">
                {language === 'ar' ? branch.nameAr : branch.nameEn}
              </div>
              <div className="mt-3 flex items-baseline justify-between text-xs border-t border-zinc-800/80 pt-2">
                <span className="text-zinc-500 text-[10px]">{language === 'ar' ? 'سقف الائتمان' : 'Branch Limit'}</span>
                <span className="font-mono font-bold text-blue-300">
                  {formatAED(branchCorps.reduce((s, c) => s + (Number(c.creditLimitAed) || 0), 0))}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Credit Control Overview Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{language === 'ar' ? 'إجمالي السقوف الائتمانية المعتمدة' : 'Total Approved Credit Line'}</span>
            <CreditCard className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-blue-300 mt-2">{formatAED(totalCreditAllocated)}</div>
          <div className="text-[10px] text-zinc-500 mt-1">{(corporateAccounts || []).length} {language === 'ar' ? 'حسابات شركات مسجلة' : 'active corporate entities'}</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{language === 'ar' ? 'الائتمان المستهلك فعلياً' : 'Current Utilized Exposure'}</span>
            <ArrowUpRight className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-2">{formatAED(totalExposureUsed)}</div>
          <div className="text-[10px] text-zinc-500 mt-1">
            {totalCreditAllocated > 0 ? Math.round((totalExposureUsed / totalCreditAllocated) * 100) : 0}% {language === 'ar' ? 'نسبة الاستهلاك الكلي' : 'credit line utilization'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{language === 'ar' ? 'الائتمان المتاح للعقود الجديدة' : 'Available Unused Exposure'}</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-2">{formatAED(totalAvailableCredit)}</div>
          <div className="text-[10px] text-emerald-500 mt-1">{language === 'ar' ? 'متاح للتعاقد الفوري' : 'Safe for instant contract booking'}</div>
        </div>
      </div>

      {/* Main Corporate Accounts Directory & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Table List (7 cols) */}
        <div className="lg:col-span-7 rounded-3xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl space-y-3">
          
          <div className="p-4 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 text-zinc-500 absolute start-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={language === 'ar' ? 'بحث بالاسم، الرخصة، أو الكود...' : 'Search corporate legal name, license...'}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl ps-9 pe-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            {selectedBranch !== 'ALL' && (
              <button
                onClick={() => setSelectedBranch('ALL')}
                className="text-xs text-blue-400 hover:underline ms-2 shrink-0 cursor-pointer"
              >
                {language === 'ar' ? 'عرض كل الفروع' : 'Clear Filter'}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            {filteredCorporates.length === 0 ? (
              <div className="p-12 text-center text-zinc-500 space-y-3">
                <Building2 className="w-12 h-12 text-zinc-700 mx-auto" />
                <div className="text-sm font-semibold text-zinc-400">
                  {language === 'ar' ? 'لا توجد حسابات شركات مسجلة حتى الآن' : 'No corporate accounts found'}
                </div>
                <p className="text-xs text-zinc-600 max-w-md mx-auto">
                  {language === 'ar' 
                    ? 'تم إفراغ البيانات التجريبية بناءً على طلبك. يمكنك الآن تسجيل بيانات الشركات الحقيقية لشركتك.' 
                    : 'Sample data has been removed. Use the button above to register your actual corporate clients.'}
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  {language === 'ar' ? 'إضافة شركة الآن' : 'Add First Corporate Account'}
                </button>
              </div>
            ) : (
              <table className="w-full text-start text-xs">
                <thead className="bg-zinc-900/40 text-zinc-400 font-semibold border-b border-zinc-800">
                  <tr>
                    <th className="p-3 text-start">{language === 'ar' ? 'اسم الشركة' : 'Legal Entity'}</th>
                    <th className="p-3 text-start">{language === 'ar' ? 'الرخصة والضريبة' : 'Trade License'}</th>
                    <th className="p-3 text-start">{language === 'ar' ? 'الائتمان' : 'Exposure / Limit'}</th>
                    <th className="p-3 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="p-3 text-end">{language === 'ar' ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {filteredCorporates.map(corp => {
                    const isSelected = selectedCorp?.id === corp.id;
                    const limit = Number(corp.creditLimitAed) || 1;
                    const percentUsed = Math.round(((Number(corp.usedExposureAed) || 0) / limit) * 100);

                    return (
                      <tr
                        key={corp.id}
                        onClick={() => setSelectedCorpId(corp.id)}
                        className={`hover:bg-zinc-900/60 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-950/20' : ''
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-semibold text-zinc-100">{corp.legalName}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{corp.id} • {corp.branchId}</div>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-zinc-300">
                          <div>{corp.tradeLicenseNumber || '—'}</div>
                          <div className="text-[10px] text-zinc-500">Exp: {corp.licenseExpiry || '—'}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-mono font-semibold text-zinc-200">
                            {formatAED(corp.usedExposureAed || 0)} / {formatAED(corp.creditLimitAed || 0)}
                          </div>
                          <div className="w-full bg-zinc-800 rounded-full h-1 mt-1 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${percentUsed > 85 ? 'bg-rose-500' : percentUsed > 60 ? 'bg-amber-400' : 'bg-blue-400'}`}
                              style={{ width: `${Math.min(100, Math.max(0, percentUsed))}%` }}
                            />
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant={corp.status === 'active' ? 'emerald' : corp.status === 'credit_hold' ? 'rose' : 'amber'}>
                            {corp.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="p-3 text-end">
                          <div className="flex items-center justify-end gap-1.5">
                            {isManagement && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAccountToDelete(corp);
                                }}
                                title={language === 'ar' ? 'حذف الحساب (للإدارة فقط)' : 'Delete Account (Management Only)'}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <ChevronRight className="w-4 h-4 text-zinc-400" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Corporate Profile Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {selectedCorp ? (
            <div className="p-5 rounded-3xl bg-zinc-950 border border-blue-900/40 shadow-2xl space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-blue-300 bg-blue-950/60 px-2.5 py-1 rounded-full border border-blue-800">
                  {selectedCorp.id}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedCorp.status === 'active' ? 'emerald' : selectedCorp.status === 'credit_hold' ? 'rose' : 'amber'}>
                    {selectedCorp.status === 'active' ? 'APPROVED B2B' : selectedCorp.status.toUpperCase()}
                  </Badge>
                  <button
                    onClick={() => handleOpenEdit(selectedCorp)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-blue-950/40 transition-colors cursor-pointer"
                    title={language === 'ar' ? 'تعديل البيانات' : 'Edit Details'}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {isManagement && (
                    <button
                      onClick={() => setAccountToDelete(selectedCorp)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title={language === 'ar' ? 'حذف الحساب' : 'Delete Account'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-display font-bold text-zinc-100">
                  {selectedCorp.legalName}
                </h3>
                {selectedCorp.legalNameAr && (
                  <div className="text-xs text-zinc-400 font-arabic">{selectedCorp.legalNameAr}</div>
                )}
                <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                  TRN: {selectedCorp.trnVatNumber || '—'}
                </p>
              </div>

              {/* Exposure Detail Box */}
              <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">{language === 'ar' ? 'سقف الائتمان الكلي' : 'Approved Credit Ceiling'}</span>
                  <span className="font-mono font-bold text-blue-300">{formatAED(selectedCorp.creditLimitAed || 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">{language === 'ar' ? 'المبلغ المستهلك حالياً' : 'Utilized Balance'}</span>
                  <span className="font-mono font-bold text-amber-400">{formatAED(selectedCorp.usedExposureAed || 0)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <span className="text-zinc-200 font-semibold">{language === 'ar' ? 'الرصيد المتبقي المتاح' : 'Remaining Available'}</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatAED(Math.max(0, (Number(selectedCorp.creditLimitAed) || 0) - (Number(selectedCorp.usedExposureAed) || 0)))}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500">
                  {language === 'ar' ? `فترة السداد المعتمدة: ${selectedCorp.paymentTermsDays || 30} يوماً` : `Approved Payment Terms: Net ${selectedCorp.paymentTermsDays || 30} Days`}
                </div>
              </div>

              {/* Primary Contact Details */}
              {selectedCorp.primaryContact && (
                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2 text-xs">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                    {language === 'ar' ? 'الشخص المخوّل بالتوقيع' : 'Authorized Signatory'}
                  </div>
                  <div className="font-semibold text-zinc-200">{selectedCorp.primaryContact.name || '—'}</div>
                  <div className="text-zinc-400 text-[11px]">{selectedCorp.primaryContact.designation || 'Contact Person'}</div>
                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-400 pt-1 font-mono">
                    {selectedCorp.primaryContact.phone && (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-blue-400" /> <PhoneText value={selectedCorp.primaryContact.phone} /></span>
                    )}
                    {selectedCorp.primaryContact.email && (
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-blue-400" /> {selectedCorp.primaryContact.email}</span>
                    )}
                  </div>
                  {(selectedCorp.primaryContact.authorizationType || selectedCorp.primaryContact.authorizationRef) && (
                    <div className="pt-2 mt-1 border-t border-zinc-800/80 text-[11px] text-zinc-400 space-y-0.5">
                      {selectedCorp.primaryContact.authorizationType && (
                        <div>{language === 'ar' ? 'نوع التفويض: ' : 'Authorization: '}<span className="text-zinc-300">{selectedCorp.primaryContact.authorizationType.replace(/_/g, ' ')}</span></div>
                      )}
                      {selectedCorp.primaryContact.authorizationRef && (
                        <div className="font-mono">{language === 'ar' ? 'المرجع: ' : 'Ref: '}{selectedCorp.primaryContact.authorizationRef}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Client's Own Branch Network */}
              {selectedCorp.branches && selectedCorp.branches.length > 0 && (
                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2 text-xs">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-blue-400" />
                    {language === 'ar' ? 'فروع الشركة (مكاتب العميل)' : "Client's Own Branch Network"}
                  </div>
                  <div className="space-y-1.5">
                    {selectedCorp.branches.map(branch => (
                      <div key={branch.id} className="flex items-center justify-between text-[11px] text-zinc-300 p-1.5 rounded-lg bg-zinc-950/60">
                        <span>
                          {branch.branchName || '—'}
                          {branch.isHeadOffice && <span className="ms-1.5 text-[9px] text-blue-400 font-mono">HQ</span>}
                        </span>
                        <span className="text-zinc-500">{branch.emirate}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-center">
                  <div className="text-lg font-bold font-mono text-zinc-100">{selectedCorp.activeContractsCount || 0}</div>
                  <div className="text-[10px] text-zinc-400">{language === 'ar' ? 'عقود نشطة حالياً' : 'Active Contracts'}</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-center">
                  <div className="text-lg font-bold font-mono text-blue-300">{selectedCorp.authorizedDriversCount || 0}</div>
                  <div className="text-[10px] text-zinc-400">{language === 'ar' ? 'سائقون معتمدون' : 'Authorized Drivers'}</div>
                </div>
              </div>

              {selectedCorp.notes && (
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 text-[11px] text-zinc-400">
                  <div className="font-semibold text-zinc-300 mb-0.5">{language === 'ar' ? 'ملاحظات' : 'Notes'}</div>
                  {selectedCorp.notes}
                </div>
              )}

            </div>
          ) : (
            <div className="p-8 rounded-3xl bg-zinc-950 border border-zinc-800 text-center text-zinc-500 text-xs">
              {language === 'ar' ? 'اختر حساباً مؤسسياً لمعاينة تفاصيل الائتمان والعقود' : 'Select a corporate account to inspect details'}
            </div>
          )}
        </div>

      </div>

      {/* CREATE CORPORATE ACCOUNT MODAL -- shared with the "Add Customer" corporate track (AddCorporateAccountModal), so there is one registration form instead of two diverging ones */}
      <AddCorporateAccountModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(created) => {
          setSelectedCorpId(created.id);
          setIsCreateModalOpen(false);
        }}
      />

      {/* EDIT CORPORATE ACCOUNT MODAL */}
      {isEditModalOpen && selectedCorp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-950 border border-blue-900/50 rounded-3xl p-6 w-full max-w-2xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-zinc-100">
                  {language === 'ar' ? `تعديل بيانات الشركة (${selectedCorp.id})` : `Edit Corporate Account (${selectedCorp.id})`}
                </h3>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'اسم الشركة الرسمي (English) *' : 'Legal Company Name (EN) *'}</label>
                  <input
                    type="text"
                    required
                    value={formData.legalName}
                    onChange={e => setFormData({ ...formData, legalName: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'اسم الشركة بالعربي' : 'Company Name (AR)'}</label>
                  <input
                    type="text"
                    value={formData.legalNameAr}
                    onChange={e => setFormData({ ...formData, legalNameAr: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'سقف الائتمان (AED)' : 'Credit Limit (AED)'}</label>
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={formData.creditLimitAed}
                    onChange={e => setFormData({ ...formData, creditLimitAed: Number(e.target.value) })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'فترة السداد (أيام)' : 'Payment Terms (Days)'}</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.paymentTermsDays}
                    onChange={e => setFormData({ ...formData, paymentTermsDays: Number(e.target.value) })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'الحالة الائتمانية' : 'Account Status'}</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="active">ACTIVE (Approved)</option>
                    <option value="under_review">UNDER REVIEW</option>
                    <option value="credit_hold">CREDIT HOLD (Blocked)</option>
                  </select>
                </div>
              </div>

              {/* Primary Contact Section */}
              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                <div className="font-semibold text-zinc-300">{language === 'ar' ? 'بيانات جهة الاتصال المعتمدة' : 'Primary Authorized Contact'}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'الاسم الكامل' : 'Contact Person Name'}</label>
                    <input
                      type="text"
                      value={formData.primaryContact.name}
                      onChange={e => setFormData({
                        ...formData,
                        primaryContact: { ...formData.primaryContact, name: e.target.value }
                      })}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'المسمى الوظيفي' : 'Designation / Title'}</label>
                    <input
                      type="text"
                      value={formData.primaryContact.designation}
                      onChange={e => setFormData({
                        ...formData,
                        primaryContact: { ...formData.primaryContact, designation: e.target.value }
                      })}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}</label>
                    <input
                      type="text"
                      value={formData.primaryContact.phone}
                      onChange={e => setFormData({
                        ...formData,
                        primaryContact: { ...formData.primaryContact, phone: e.target.value }
                      })}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}</label>
                    <input
                      type="email"
                      value={formData.primaryContact.email}
                      onChange={e => setFormData({
                        ...formData,
                        primaryContact: { ...formData.primaryContact, email: e.target.value }
                      })}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">{language === 'ar' ? 'ملاحظات' : 'Notes'}</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold cursor-pointer"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 cursor-pointer"
                >
                  {language === 'ar' ? 'تحديث البيانات' : 'Update Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GRANULAR MANAGEMENT DELETE CONFIRMATION MODAL */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in">
          <div className="bg-zinc-950 border border-rose-900/60 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-2xl">
                <ShieldAlert className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-100">
                  {language === 'ar' ? 'حذف حساب شركة محدد (للإدارة فقط)' : 'Delete Specific Corporate Entity'}
                </h3>
                <p className="text-[11px] text-zinc-400 font-mono">
                  {accountToDelete.id} • {accountToDelete.legalName}
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300">
              {language === 'ar'
                ? 'هل أنت متأكد من حذف هذا الحساب المؤسسي بشكل دائم؟ سيتم تسجيل عملية الحذف في سجل التدقيق الإداري دون التأثير على بقية بيانات النظام.'
                : 'Are you sure you want to permanently delete this specific corporate account? This granular action will be recorded in the audit trail without wiping other records.'}
            </p>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                {language === 'ar' ? 'سبب الحذف (اختياري لسجل التدقيق)' : 'Reason for Deletion (Optional for Audit)'}
              </label>
              <input
                type="text"
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="e.g. Duplicate registration / Terminated contract..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setAccountToDelete(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? (language === 'ar' ? 'جاري الحذف...' : 'Deleting...') : (language === 'ar' ? 'تأكيد الحذف' : 'Confirm Delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
