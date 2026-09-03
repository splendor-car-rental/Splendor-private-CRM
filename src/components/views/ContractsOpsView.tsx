import React, { useState, useMemo } from 'react';
import { 
  FileSignature, Search, Printer, CheckCircle2, 
  Car, User, ShieldAlert, Key, Fuel, Gauge, 
  DollarSign, ArrowRight, ShieldCheck, AlertTriangle,
  CalendarPlus, MessageCircle, FileText, History, Plus,
  Clock, Shield, Sparkles, Filter, Check, X
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Contract } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { ContractExtensionModal } from '../operations/ContractExtensionModal';
import { ContractDocumentPrintModal } from '../operations/ContractDocumentPrintModal';
import { AddContractModal } from '../modals/AddContractModal';
import { formatDate, formatDateTime } from '../../lib/dateFormat';

export const ContractsOpsView: React.FC = () => {
  const { language, t } = useLanguage();
  const isAr = language === 'ar';
  const {
    contracts, vehicles, processHandover, processReturn, closeContract,
    selectedContractId, setSelectedContractId
  } = useCRM();
  const [isClosing, setIsClosing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals state
  const [addContractModalOpen, setAddContractModalOpen] = useState(false);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [contractPrintModalOpen, setContractPrintModalOpen] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [contractToOperate, setContractToOperate] = useState<Contract | null>(null);

  // Handover form
  const [handoverForm, setHandoverForm] = useState({
    startMileage: 4500,
    fuelLevelPercent: 100,
    cleanliness: 'pristine',
    accessories: {
      vipKeyFob: true,
      manualAndDocs: true,
      scentKit: true,
      highEndCharger: true,
      firstAidKit: true,
      safetyTriangle: true
    },
    employeeName: 'أحمد مرسي',
    notes: 'تم فحص السيارة بالكامل وتسليمها بحالة الوكالة الممتازة للعميل.'
  });

  // Return form
  const [returnForm, setReturnForm] = useState({
    endMileage: 4950,
    fuelLevelPercent: 100,
    cleanliness: 'pristine',
    accessoriesReturned: {
      vipKeyFob: true,
      manualAndDocs: true,
      scentKit: true,
      highEndCharger: true,
      firstAidKit: true,
      safetyTriangle: true
    },
    extraKms: 0,
    extraKmCharge: 0,
    fuelDifferenceCharge: 0,
    damageCharge: 0,
    salikTollCharge: 120,
    totalAdditionalCharges: 120,
    employeeName: 'أحمد مرسي',
    notes: 'تم فحص الاسترجاع واستلام كافة الملحقات وخصم رسوم سالك من مبلغ التأمين.'
  });

  const activeContract = useMemo(() => {
    return contracts.find(c => c.id === selectedContractId) || contracts[0];
  }, [contracts, selectedContractId]);

  const handleOpenHandover = (c: Contract) => {
    setContractToOperate(c);
    const v = vehicles.find(veh => veh.id === c.vehicleId);
    setHandoverForm(prev => ({
      ...prev,
      startMileage: v ? v.mileage : (c.handover?.startMileage || 4500)
    }));
    setHandoverModalOpen(true);
  };

  const handleOpenReturn = (c: Contract) => {
    setContractToOperate(c);
    const startKm = c.handover?.startMileage || 4500;
    const estimatedEnd = startKm + 450;
    const allowed = (c.mileageAllowancePerDay || 250) * 2;
    const extra = Math.max(0, 450 - allowed);
    const extraCharge = extra * (c.extraKmRate || 15);
    const salik = 160;

    setReturnForm({
      endMileage: estimatedEnd,
      fuelLevelPercent: 100,
      cleanliness: 'pristine',
      accessoriesReturned: {
        vipKeyFob: true,
        manualAndDocs: true,
        scentKit: true,
        highEndCharger: true,
        firstAidKit: true,
        safetyTriangle: true
      },
      extraKms: extra,
      extraKmCharge: extraCharge,
      fuelDifferenceCharge: 0,
      damageCharge: 0,
      salikTollCharge: salik,
      totalAdditionalCharges: extraCharge + salik,
      employeeName: 'أحمد مرسي',
      notes: 'تم استلام المركبة بحالة الوكالة الممتازة بدون أضرار.'
    });
    setReturnModalOpen(true);
  };

  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractToOperate) return;
    await processHandover(contractToOperate.id, {
      ...handoverForm,
      handoverDateTime: new Date().toISOString(),
      customerSignatureUrl: 'data:sig_customer',
      employeeSignatureUrl: 'data:sig_officer'
    });
    setHandoverModalOpen(false);
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractToOperate) return;
    await processReturn(contractToOperate.id, {
      ...returnForm,
      returnDateTime: new Date().toISOString(),
      finalSettlementBalance: returnForm.totalAdditionalCharges - contractToOperate.depositAmount
    });
    setReturnModalOpen(false);
  };

  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      const s = (searchTerm || '').toLowerCase();
      const matchesSearch = 
        (c.contractNumber || '').toLowerCase().includes(s) ||
        (c.customerName || '').toLowerCase().includes(s) ||
        (c.customerPhone || '').toLowerCase().includes(s) ||
        (c.vehicleName || '').toLowerCase().includes(s) ||
        (c.vehiclePlate || '').toLowerCase().includes(s);
      
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contracts, searchTerm, statusFilter]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return { text: isAr ? 'عقد فعال' : 'Active', variant: 'emerald' as const };
      case 'completed':
        return { text: isAr ? 'عقد مكتمل' : 'Completed', variant: 'sky' as const };
      case 'approved':
        return { text: isAr ? 'معتمد جاهز للتسليم' : 'Approved', variant: 'amber' as const };
      case 'draft':
        return { text: isAr ? 'مسودة عقد' : 'Draft', variant: 'zinc' as const };
      case 'cancelled':
        return { text: isAr ? 'ملغي' : 'Cancelled', variant: 'rose' as const };
      default:
        return { text: status, variant: 'zinc' as const };
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12 font-arabic">
      
      {/* Top Header & Main Action Buttons Bar */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30 text-[11px] font-bold">
              {isAr ? 'إدارة العمليات والعقود الرسمية' : 'OPERATIONS & CONTRACTS'}
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              {contracts.length} {isAr ? 'عقد مسجل' : 'Contracts'}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-zinc-100 font-display">
            {isAr ? 'عقود التأجير وعمليات التسليم والاسترجاع' : 'Rental Contracts & Fleet Operations'}
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {isAr ? 'إصدار العقود الجديدة، ملاحق تمديد الإيجار الرسمية، فحص التسليم الرقمي، وتدقيق الاسترجاع وتسوية التأمين والسالك' : 'Issue agreements, official extension addendums, digital handovers, and return settlements.'}
          </p>
        </div>

        {/* The Two Primary Action Buttons */}
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap sm:flex-nowrap">
          {/* Button 1: Create New Contract */}
          <button
            onClick={() => setAddContractModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-extrabold text-sm shadow-xl shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
            <span>{isAr ? 'إنشاء عقد إيجار جديد' : 'New Rental Agreement'}</span>
          </button>

          {/* Button 2: Extend Contract (Official Addendum) */}
          <button
            onClick={() => {
              setContractToOperate(activeContract || null);
              setExtensionModalOpen(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-extrabold text-sm shadow-xl shadow-blue-600/20 active:scale-95 transition-all border border-blue-400/30"
          >
            <CalendarPlus className="w-5 h-5" />
            <span>{isAr ? 'تمديد عقد (ملحق رسمي)' : 'Extend Contract (Addendum)'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Contracts List (Left) + Selected Contract Detailed View (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Contracts Filter & List (4 Cols) */}
        <div className="lg:col-span-4 p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-4">
          
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث برقم العقد، اسم العميل، المركبة، اللوحة...' : 'Search contract, client, car, plate...'}
              className="w-full pr-9 pl-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {[
              { id: 'all', label: isAr ? 'الكل' : 'All' },
              { id: 'active', label: isAr ? 'الفعالة' : 'Active' },
              { id: 'draft', label: isAr ? 'المسودات' : 'Drafts' },
              { id: 'completed', label: isAr ? 'المكتملة' : 'Completed' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1 rounded-lg transition-all font-semibold whitespace-nowrap text-[11px] ${
                  statusFilter === f.id
                    ? 'bg-[#D4AF37] text-zinc-950 font-bold shadow'
                    : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Contracts Scrollable List */}
          <div className="space-y-2.5 max-h-[640px] overflow-y-auto custom-scrollbar">
            {filteredContracts.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs space-y-2">
                <FileText className="w-8 h-8 mx-auto text-zinc-600 opacity-60" />
                <p>{isAr ? 'لا توجد عقود مطابقة لخيارات البحث' : 'No contracts found.'}</p>
              </div>
            ) : (
              filteredContracts.map(contract => {
                const isSelected = activeContract?.id === contract.id;
                const statusMeta = getStatusLabel(contract.status);

                return (
                  <div
                    key={contract.id}
                    onClick={() => setSelectedContractId(contract.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#D4AF37]/10 border-[#D4AF37] shadow-lg shadow-[#D4AF37]/5'
                        : 'bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-950'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{contract.customerName}</span>
                        </h4>
                        <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
                          <Car className="w-3 h-3 text-[#D4AF37]" />
                          <span>{contract.vehicleName}</span>
                          <span className="text-zinc-600">•</span>
                          <span className="font-mono text-zinc-300 font-bold">{contract.vehiclePlate}</span>
                        </p>
                      </div>
                      <Badge variant={statusMeta.variant} size="sm">
                        {statusMeta.text}
                      </Badge>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-[11px]">
                      <span className="font-mono text-zinc-400 font-bold">#{contract.contractNumber}</span>
                      <span className="font-bold text-[#f5d97f]">
                        {(contract.grandTotal || 0).toLocaleString()} <span className="text-[10px] text-zinc-500 font-normal">درهم</span>
                      </span>
                    </div>

                    {/* Expiry date preview */}
                    <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
                      <span>{isAr ? 'ينتهي في:' : 'Expires:'} {formatDate(contract.endDateTime)}</span>
                      {contract.extensions && contract.extensions.length > 0 && (
                        <span className="text-blue-400 font-bold">
                          +{contract.extensions.length} {isAr ? 'تمديد' : 'ext'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detailed Contract Operations & Inspection Card (8 Cols) */}
        {activeContract ? (
          <div className="lg:col-span-8 p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-2xl space-y-6">
            
            {/* Top Overview & Action Buttons for this specific contract */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-950 border border-zinc-800">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-xl font-bold text-zinc-100 font-display">
                    {isAr ? `العقد رقم #${activeContract.contractNumber}` : `Contract #${activeContract.contractNumber}`}
                  </h3>
                  <Badge variant={getStatusLabel(activeContract.status).variant} size="sm">
                    {getStatusLabel(activeContract.status).text}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {activeContract.customerName} • {activeContract.vehicleName} (لوحة: {activeContract.vehiclePlate}) • ينتهي: <span className="text-amber-300 font-mono">{formatDate(activeContract.endDateTime)}</span>
                </p>
              </div>

              {/* Contextual Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Print Master Contract on Official Letterhead Button */}
                <button
                  onClick={() => {
                    setContractToOperate(activeContract);
                    setContractPrintModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-[#D4AF37] hover:text-zinc-950 text-zinc-200 text-xs font-bold transition-all border border-zinc-700 shadow-md"
                  title={isAr ? 'عرض وطباعة العقد الرسمي على الهيد ليتر الأصلي وحفظه كـ PDF' : 'View & Print Contract on Official Letterhead'}
                >
                  <Printer className="w-4 h-4 text-[#D4AF37]" />
                  <span>{isAr ? 'الهيد ليتر الرسمي / PDF' : 'Letterhead / PDF'}</span>
                </button>

                {/* Contract Extension Trigger */}
                {activeContract.status === 'active' && (
                  <button
                    onClick={() => {
                      setContractToOperate(activeContract);
                      setExtensionModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md active:scale-95 transition-all"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    <span>{isAr ? 'تمديد الإيجار (ملحق رسمي)' : 'Extend Contract'}</span>
                  </button>
                )}

                {activeContract.status === 'draft' || activeContract.status === 'approved' ? (
                  <button
                    onClick={() => handleOpenHandover(activeContract)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-extrabold shadow-md active:scale-95 transition-all"
                  >
                    <Key className="w-4 h-4" />
                    <span>{isAr ? 'إجراء فحص التسليم' : 'Complete Handover'}</span>
                  </button>
                ) : activeContract.status === 'active' ? (
                  <button
                    onClick={() => handleOpenReturn(activeContract)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 text-xs font-extrabold shadow-md hover:brightness-110 active:scale-95 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAr ? 'فحص الاسترجاع والتسوية' : 'Process Return'}</span>
                  </button>
                ) : activeContract.status === 'settlement_pending' ? (
                  <button
                    onClick={async () => {
                      setIsClosing(true);
                      try { await closeContract(activeContract.id); } finally { setIsClosing(false); }
                    }}
                    disabled={isClosing}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-zinc-950 text-xs font-extrabold shadow-md active:scale-95 transition-all disabled:opacity-50"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>{isClosing ? (isAr ? 'جارٍ الإغلاق...' : 'Closing...') : (isAr ? 'إغلاق مالي نهائي' : 'Close & Recognize Revenue')}</span>
                  </button>
                ) : (
                  <span className="text-xs font-bold text-sky-400 bg-sky-950/40 px-3 py-1.5 rounded-xl border border-sky-500/30">
                    {isAr ? 'تم اكتمال العقد وتسوية التأمين' : 'Rental Completed'}
                  </span>
                )}
              </div>
            </div>

            {/* Handover & Return Details Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Handover Inspection Box */}
              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" />
                    <span>{isAr ? 'فحص تسليم المركبة' : 'Handover Inspection'}</span>
                  </span>
                  <Badge variant={activeContract.handover ? 'emerald' : 'zinc'} size="sm">
                    {activeContract.handover ? (isAr ? 'تم التسليم' : 'Completed') : (isAr ? 'قيد الانتظار' : 'Pending')}
                  </Badge>
                </div>
                {activeContract.handover ? (
                  <div className="space-y-1.5 text-zinc-300">
                    <p><strong className="text-zinc-500">{isAr ? 'قراءة العداد عند البدء:' : 'Odometer:'}</strong> <span className="font-mono font-bold text-zinc-100">{activeContract.handover.startMileage?.toLocaleString()} كم</span></p>
                    <p><strong className="text-zinc-500">{isAr ? 'مستوى الوقود:' : 'Fuel:'}</strong> <span className="font-mono text-emerald-400">{activeContract.handover.fuelLevelPercent}%</span></p>
                    <p><strong className="text-zinc-500">{isAr ? 'حالة النظافة:' : 'Cleanliness:'}</strong> <span className="text-zinc-200">{isAr ? 'حالة وكالة ممتازة' : activeContract.handover.cleanliness}</span></p>
                    <p><strong className="text-zinc-500">{isAr ? 'المسؤول عن التسليم:' : 'Officer:'}</strong> <span className="text-zinc-200">{activeContract.handover.employeeName}</span></p>
                  </div>
                ) : (
                  <p className="text-zinc-500 py-4 text-center">
                    {isAr ? 'لم يتم إجراء فحص تسليم المركبة بعد.' : 'Handover checklist not yet executed.'}
                  </p>
                )}
              </div>

              {/* Return Settlement Box */}
              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="font-bold text-[#f5d97f] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تدقيق الاسترجاع وتسوية الوديعة' : 'Return Settlement Audit'}</span>
                  </span>
                  <Badge variant={activeContract.returnDetails ? 'sky' : 'zinc'} size="sm">
                    {activeContract.returnDetails ? (isAr ? 'تمت التسوية' : 'Finalized') : (isAr ? 'بانتظار الاسترجاع' : 'Pending')}
                  </Badge>
                </div>
                {activeContract.returnDetails ? (
                  <div className="space-y-1.5 text-zinc-300">
                    <p><strong className="text-zinc-500">{isAr ? 'عداد النهاية:' : 'End Odometer:'}</strong> <span className="font-mono font-bold text-zinc-100">{activeContract.returnDetails.endMileage?.toLocaleString()} كم</span></p>
                    <p><strong className="text-zinc-500">{isAr ? 'رسوم الكيلومترات الإضافية:' : 'Excess KM:'}</strong> <span className="font-mono text-zinc-200">{activeContract.returnDetails.extraKmCharge || 0} درهم</span></p>
                    <p><strong className="text-zinc-500">{isAr ? 'رسوم بوابات سالك:' : 'Salik Tolls:'}</strong> <span className="font-mono text-zinc-200">{activeContract.returnDetails.salikTollCharge || 0} درهم</span></p>
                    <p className="text-[#f5d97f] font-bold pt-1 border-t border-zinc-800/80">
                      {isAr ? 'صافي الوديعة المستردة للعميل:' : 'Net Deposit Refund:'} {Math.abs(activeContract.returnDetails.finalSettlementBalance || 0).toLocaleString()} درهم
                    </p>
                  </div>
                ) : (
                  <p className="text-zinc-500 py-4 text-center">
                    {isAr ? 'بانتظار إرجاع المركبة لإجراء الفحص النهائي وتسوية الوديعة.' : 'Return audit pending vehicle return.'}
                  </p>
                )}
              </div>
            </div>

            {/* Official Extensions Addendums History */}
            <div className="p-5 rounded-2xl bg-zinc-950 border border-blue-900/40 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="font-bold text-blue-400 flex items-center gap-2 text-sm">
                  <History className="w-4 h-4" />
                  <span>{isAr ? 'سجل ملاحق تمديد العقد الرسمية' : 'Official Extension Addendums History'}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono text-[11px] font-bold">
                    {activeContract.extensions?.length || 0} {isAr ? 'ملحق معتمد' : 'Addendum(s)'}
                  </span>
                  {activeContract.status === 'active' && (
                    <button
                      onClick={() => {
                        setContractToOperate(activeContract);
                        setExtensionModalOpen(true);
                      }}
                      className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] transition-colors"
                    >
                      + {isAr ? 'تمديد جديد' : 'New Extension'}
                    </button>
                  )}
                </div>
              </div>

              {activeContract.extensions && activeContract.extensions.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {activeContract.extensions.map((ext, idx) => (
                    <div key={ext.id || idx} className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#f5d97f]">#{ext.addendumNumber}</span>
                          <span className="text-zinc-500">•</span>
                          <span className="text-zinc-200 font-bold">{ext.extensionDurationDays} {isAr ? 'أيام تمديد' : 'Days Extended'}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">
                          {isAr ? 'تاريخ الانتهاء الجديد:' : 'New Expiry:'} <span className="text-zinc-100 font-mono font-bold">{formatDate(ext.newEndDateTime)}</span> • {ext.totalExtensionAmount?.toLocaleString()} درهم (شامل الضريبة)
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setContractToOperate(activeContract);
                          setExtensionModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        <span>{isAr ? 'عرض وطباعة النموذج' : 'View Addendum'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-zinc-500">
                  <p>{isAr ? 'لم يتم إصدار ملاحق تمديد لهذا العقد حتى الآن.' : 'No extension addendums issued yet.'}</p>
                </div>
              )}
            </div>

            {/* Financial Terms Summary Box */}
            <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3 text-xs">
              <h4 className="font-bold text-zinc-200 uppercase tracking-wider text-xs">
                {isAr ? 'الهيكل المالي والبنود التعاقدية' : 'Lease Financial Structure'}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-zinc-400 pt-2 border-t border-zinc-800">
                <div>
                  <span className="text-[11px] text-zinc-500">{isAr ? 'سعر الإيجار اليومي:' : 'Daily Rate:'}</span>
                  <p className="font-bold text-zinc-100 font-mono text-sm">{(activeContract.dailyRate || 0).toLocaleString()} درهم</p>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500">{isAr ? 'إجمالي العقد (شامل الضريبة):' : 'Total (Inc VAT):'}</span>
                  <p className="font-bold text-zinc-100 font-mono text-sm">{(activeContract.grandTotal || 0).toLocaleString()} درهم</p>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500">{isAr ? 'الوديعة والتأمين المحتجز:' : 'Security Deposit:'}</span>
                  <p className="font-bold text-[#f5d97f] font-mono text-sm">{(activeContract.depositAmount || 0).toLocaleString()} درهم</p>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500">{isAr ? 'حالة السداد:' : 'Payment Status:'}</span>
                  <div className="mt-0.5">
                    <Badge variant={activeContract.paymentStatus === 'paid' ? 'emerald' : 'amber'} size="sm">
                      {activeContract.paymentStatus === 'paid' ? (isAr ? 'مسدد بالكامل' : 'Paid') : (isAr ? 'معلق / جزئي' : 'Pending')}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

          </div>
        ) : null}
      </div>

      {/* Add New Contract Modal */}
      <AddContractModal
        isOpen={addContractModalOpen}
        onClose={() => setAddContractModalOpen(false)}
      />

      {/* Contract Extension Modal */}
      <ContractExtensionModal
        isOpen={extensionModalOpen}
        onClose={() => setExtensionModalOpen(false)}
        contract={contractToOperate || activeContract}
        vehicle={vehicles.find(v => v.id === (contractToOperate || activeContract)?.vehicleId)}
      />

      {/* Handover Modal */}
      <Modal
        isOpen={handoverModalOpen}
        onClose={() => setHandoverModalOpen(false)}
        title={isAr ? 'إجراء وتوثيق فحص تسليم المركبة' : 'Digital Handover Inspection'}
        subtitle={isAr ? `فحص تسليم المركبة للعقد #${contractToOperate?.contractNumber}` : `Vehicle Handover for Contract #${contractToOperate?.contractNumber}`}
        maxWidth="lg"
      >
        <form onSubmit={handleHandoverSubmit} className="space-y-4 text-xs font-arabic">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-bold mb-1">
                {isAr ? 'قراءة العداد عند البدء (كم) *' : 'Starting Odometer (KM) *'}
              </label>
              <input
                type="number"
                required
                value={handoverForm.startMileage}
                onChange={(e) => setHandoverForm({ ...handoverForm, startMileage: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-bold mb-1">
                {isAr ? 'مستوى الوقود (%) *' : 'Fuel Level (%) *'}
              </label>
              <input
                type="number"
                max="100"
                min="0"
                required
                value={handoverForm.fuelLevelPercent}
                onChange={(e) => setHandoverForm({ ...handoverForm, fuelLevelPercent: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
            <span className="font-bold text-zinc-300">
              {isAr ? 'التحقق من ملحقات واكسسوارات المركبة:' : 'Accessories Verification:'}
            </span>
            <div className="grid grid-cols-2 gap-2 text-zinc-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.vipKeyFob} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, vipKeyFob: e.target.checked } })} />
                <span>{isAr ? 'المفتاح الأصلي والاحتياطي' : 'Primary & Spare Keys'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.scentKit} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, scentKit: e.target.checked } })} />
                <span>{isAr ? 'باقة عطور سبلندر' : 'Splendor Scent Kit'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.manualAndDocs} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, manualAndDocs: e.target.checked } })} />
                <span>{isAr ? 'بطاقة الملكية والتأمين' : 'Registration & Insurance'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.highEndCharger} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, highEndCharger: e.target.checked } })} />
                <span>{isAr ? 'شواحن وكابلات الهواتف' : 'VIP Charging Kit'}</span>
              </label>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setHandoverModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 font-bold"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-extrabold shadow-lg"
            >
              {isAr ? 'اعتماد التسليم وتفعيل العقد' : 'Authorize Handover'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Return Modal */}
      <Modal
        isOpen={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        title={isAr ? 'إجراء وتدقيق فحص استرجاع المركبة' : 'Vehicle Return & Settlement'}
        subtitle={isAr ? `فحص الاسترجاع وتسوية الوديعة للعقد #${contractToOperate?.contractNumber}` : `Return Inspection for Contract #${contractToOperate?.contractNumber}`}
        maxWidth="lg"
      >
        <form onSubmit={handleReturnSubmit} className="space-y-4 text-xs font-arabic">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-bold mb-1">
                {isAr ? 'قراءة العداد عند الإرجاع (كم) *' : 'Ending Odometer (KM) *'}
              </label>
              <input
                type="number"
                required
                value={returnForm.endMileage}
                onChange={(e) => setReturnForm({ ...returnForm, endMileage: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-bold mb-1">
                {isAr ? 'رسوم بوابات سالك المسجلة (درهم)' : 'Salik Tolls Recorded (AED)'}
              </label>
              <input
                type="number"
                value={returnForm.salikTollCharge}
                onChange={(e) => setReturnForm({ ...returnForm, salikTollCharge: Number(e.target.value), totalAdditionalCharges: Number(e.target.value) + returnForm.extraKmCharge })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
            <h4 className="font-bold text-[#f5d97f]">
              {isAr ? 'ملخص التسوية المالية للوديعة:' : 'Settlement Summary:'}
            </h4>
            <div className="flex justify-between text-zinc-400">
              <span>{isAr ? 'مبلغ التأمين / الوديعة المحتجز:' : 'Deposit Held:'}</span>
              <span className="font-mono text-zinc-200 font-bold">{(contractToOperate?.depositAmount || 0).toLocaleString()} درهم</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>{isAr ? 'إجمالي الخصومات (سالك + كيلومتر زائد):' : 'Total Deductions:'}</span>
              <span className="font-mono text-rose-400 font-bold">-{(returnForm.totalAdditionalCharges || 0).toLocaleString()} درهم</span>
            </div>
            <div className="flex justify-between font-bold text-zinc-100 pt-2 border-t border-zinc-800 text-sm">
              <span>{isAr ? 'صافي الوديعة المستردة للعميل:' : 'Net Refund Due to Client:'}</span>
              <span className="font-mono text-emerald-400 text-base">
                {Math.max(0, (contractToOperate?.depositAmount || 0) - (returnForm.totalAdditionalCharges || 0)).toLocaleString()} درهم
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setReturnModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 font-bold"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-extrabold shadow-lg"
            >
              {isAr ? 'اعتماد الاسترجاع وتسوية الوديعة' : 'Finalize Return'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Official Master Contract Print/PDF Modal on Letterhead */}
      {contractPrintModalOpen && contractToOperate && (
        <ContractDocumentPrintModal
          isOpen={contractPrintModalOpen}
          onClose={() => setContractPrintModalOpen(false)}
          contract={contractToOperate}
        />
      )}

    </div>
  );
};
