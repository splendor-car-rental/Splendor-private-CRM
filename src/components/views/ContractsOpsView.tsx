import React, { useState } from 'react';
import { 
  FileSignature, Search, Printer, CheckCircle2, 
  Car, User, ShieldAlert, Key, Fuel, Gauge, 
  DollarSign, ArrowRight, ShieldCheck, AlertTriangle,
  Radio, Sparkles, RefreshCw, Eye
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Contract, VehicleDamageMarker } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { DigitalSignaturePad } from '../operations/DigitalSignaturePad';
import { VehicleInspectionDamageHotspots } from '../operations/VehicleInspectionDamageHotspots';
import { ContractDocumentPrintModal } from '../operations/ContractDocumentPrintModal';

export const ContractsOpsView: React.FC = () => {
  const { language, t, getStatusLabel } = useLanguage();
  const isAr = language === 'ar';
  const { 
    contracts, vehicles, customers, processHandover, processReturn,
    selectedContractId, setSelectedContractId, setSelectedCustomerId, setActiveView 
  } = useCRM();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [contractPrintOpen, setContractPrintOpen] = useState(false);
  const [contractToOperate, setContractToOperate] = useState<Contract | null>(null);

  // Signatures
  const [clientSignature, setClientSignature] = useState<string>('');
  const [officerSignature, setOfficerSignature] = useState<string>('');

  // Damages
  const [handoverDamages, setHandoverDamages] = useState<VehicleDamageMarker[]>([]);
  const [returnDamages, setReturnDamages] = useState<VehicleDamageMarker[]>([]);

  // Telematics Live Check state
  const [isSyncingGps, setIsSyncingGps] = useState(false);
  const [gpsSyncSuccess, setGpsSyncSuccess] = useState(false);

  // Handover form
  const [handoverForm, setHandoverForm] = useState({
    startMileage: 4500,
    fuelLevelPercent: 100,
    cleanliness: 'pristine' as const,
    accessories: {
      vipKeyFob: true,
      manualAndDocs: true,
      scentKit: true,
      highEndCharger: true,
      firstAidKit: true,
      safetyTriangle: true
    },
    employeeName: 'Ahmed Morsy',
    notes: 'Pristine showroom condition. Customer verified all surfaces.'
  });

  // Return form
  const [returnForm, setReturnForm] = useState({
    endMileage: 4950,
    fuelLevelPercent: 100,
    cleanliness: 'pristine' as const,
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
    employeeName: 'Ahmed Morsy',
    notes: 'Return inspection clear. 120 AED Salik deducted from held deposit.'
  });

  const activeContract = contracts.find(c => c.id === selectedContractId) || contracts[0];
  const activeVehicle = vehicles.find(v => v.id === activeContract?.vehicleId);
  const activeCustomer = customers.find(c => c.id === activeContract?.customerId);

  const handleOpenHandover = (c: Contract) => {
    setContractToOperate(c);
    const v = vehicles.find(veh => veh.id === c.vehicleId);
    setHandoverForm(prev => ({
      ...prev,
      startMileage: v ? v.mileage : 4500
    }));
    setHandoverDamages(c.handover?.damages || []);
    setClientSignature(c.handover?.customerSignatureUrl || '');
    setOfficerSignature(c.handover?.employeeSignatureUrl || '');
    setGpsSyncSuccess(false);
    setHandoverModalOpen(true);
  };

  const handleOpenReturn = (c: Contract) => {
    setContractToOperate(c);
    const startKm = c.handover?.startMileage || 4500;
    const estimatedEnd = startKm + 450;
    const days = Math.max(1, Math.ceil((new Date(c.endDateTime).getTime() - new Date(c.startDateTime).getTime()) / (1000 * 60 * 60 * 24)));
    const allowed = (c.mileageAllowancePerDay || 250) * days;
    const extra = Math.max(0, 450 - allowed);
    const ratePerKm = c.extraKmRate || 2;
    const extraCharge = extra * ratePerKm;
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
      employeeName: 'Ahmed Morsy',
      notes: 'Vehicle returned in showroom condition.'
    });
    setReturnDamages(c.returnDetails?.newDamages || []);
    setClientSignature(c.returnDetails?.customerSignatureUrl || '');
    setOfficerSignature(c.returnDetails?.employeeSignatureUrl || '');
    setGpsSyncSuccess(false);
    setReturnModalOpen(true);
  };

  const handleSyncGpsTelematics = () => {
    setIsSyncingGps(true);
    setTimeout(() => {
      setIsSyncingGps(false);
      setGpsSyncSuccess(true);
    }, 600);
  };

  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractToOperate) return;
    await processHandover(contractToOperate.id, {
      ...handoverForm,
      handoverDateTime: new Date().toISOString(),
      employeeId: 'USR-001',
      damages: handoverDamages,
      customerSignatureUrl: clientSignature || 'data:sig_captured_customer',
      employeeSignatureUrl: officerSignature || 'data:sig_captured_officer'
    });
    setHandoverModalOpen(false);
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractToOperate) return;
    await processReturn(contractToOperate.id, {
      ...returnForm,
      returnDateTime: new Date().toISOString(),
      employeeId: 'USR-001',
      lateReturnCharge: 0,
      trafficFinesCharge: 0,
      newDamages: returnDamages,
      customerSignatureUrl: clientSignature || 'data:sig_captured_customer',
      employeeSignatureUrl: officerSignature || 'data:sig_captured_officer',
      finalSettlementBalance: returnForm.totalAdditionalCharges - contractToOperate.depositAmount
    });
    setReturnModalOpen(false);
  };

  const filteredContracts = contracts.filter(c => {
    const s = (searchTerm || '').toLowerCase();
    const matchesSearch = 
      (c.contractNumber || '').toLowerCase().includes(s) ||
      (c.customerName || '').toLowerCase().includes(s) ||
      (c.vehicleName || '').toLowerCase().includes(s);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'عقود التأجير وعمليات التسليم والاسترجاع' : 'Rental Contracts & Fleet Operations'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'الفحص الرقمي للتسليم، توثيق الكيلومترات والوقود، وتسوية الاسترجاع والسالك' : 'Digital handover inspection, mileage/fuel auditing & automated return deposit settlements'}
          </p>
        </div>
      </div>

      {/* Grid: Contracts List & Detailed Operations View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Contracts List (4 cols) */}
        <div className="lg:col-span-4 p-4 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={language === 'ar' ? 'بحث برقم العقد، العميل، أو السيارة...' : 'Search contract, client, car...'}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50"
            />
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
            {filteredContracts.map(contract => {
              const isSelected = activeContract?.id === contract.id;
              return (
                <div
                  key={contract.id}
                  onClick={() => setSelectedContractId(contract.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40 shadow-sm'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200">{contract.customerName}</h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{contract.vehicleName}</p>
                    </div>
                    <Badge variant={contract.status === 'active' ? 'emerald' : contract.status === 'completed' ? 'sky' : 'zinc'} size="sm">
                      {getStatusLabel(contract.status)}
                    </Badge>
                  </div>

                  <div className="mt-2 pt-2 border-t border-zinc-800/50 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-mono text-zinc-500">{contract.contractNumber}</span>
                    <span className="font-bold text-zinc-200">{(contract.grandTotal || 0).toLocaleString()} {language === 'ar' ? 'د.إ' : 'AED'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Detailed Contract Operations & Inspection Card (8 cols) */}
        {activeContract ? (
          <div className="lg:col-span-8 p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-2xl space-y-6">
            {/* Top Overview Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-950 border border-zinc-800">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-lg font-bold text-zinc-100 font-display">
                    {language === 'ar' ? `عقد تأجير ${activeContract.contractNumber}` : `Contract ${activeContract.contractNumber}`}
                  </h3>
                  <Badge variant={activeContract.status === 'active' ? 'emerald' : activeContract.status === 'completed' ? 'sky' : 'zinc'} size="sm">
                    {getStatusLabel(activeContract.status)}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {activeContract.customerName} • {activeContract.vehicleName} ({activeContract.vehiclePlate})
                </p>
              </div>

              {/* Handover & Return Trigger Buttons & Master PDF Print */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setContractPrintOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-semibold hover:border-[#D4AF37] hover:text-[#f5d97f] transition-all"
                >
                  <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{isAr ? 'عقد التأجير الرسمي (RTA Print)' : 'Print Master Contract'}</span>
                </button>

                {activeContract.status === 'draft' || activeContract.status === 'approved' ? (
                  <button
                    onClick={() => handleOpenHandover(activeContract)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
                  >
                    <Key className="w-4 h-4" />
                    <span>{isAr ? 'إجراء فحص التسليم والتوقيع' : 'Complete Handover & Sign'}</span>
                  </button>
                ) : activeContract.status === 'active' ? (
                  <button
                    onClick={() => handleOpenReturn(activeContract)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAr ? 'فحص الاسترجاع والتسوية' : 'Process Vehicle Return'}</span>
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-sky-400 bg-sky-950/40 px-3 py-1.5 rounded-xl border border-sky-500/30">
                    {isAr ? 'تم اكتمال الإيجار وتسوية الوديعة' : 'Rental Completed & Settled'}
                  </span>
                )}
              </div>
            </div>

            {/* Handover & Return Details if available */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Handover Box */}
              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" /> {isAr ? 'فحص التسليم للعميل' : 'Handover Inspection'}
                  </span>
                  <Badge variant={activeContract.handover ? 'emerald' : 'zinc'} size="sm">
                    {activeContract.handover ? (isAr ? 'مكتمل وموقع' : 'Signed & Executed') : (isAr ? 'قيد الانتظار' : 'Pending')}
                  </Badge>
                </div>
                {activeContract.handover ? (
                  <div className="space-y-1.5 text-zinc-300">
                    <p><strong>{isAr ? 'عداد البدء:' : 'Odometer:'}</strong> {activeContract.handover.startMileage} {isAr ? 'كم' : 'km'}</p>
                    <p><strong>{isAr ? 'مستوى الوقود:' : 'Fuel Level:'}</strong> {activeContract.handover.fuelLevelPercent}%</p>
                    <p><strong>{isAr ? 'حالة النظافة:' : 'Cleanliness:'}</strong> {(activeContract.handover.cleanliness || '').toUpperCase()}</p>
                    <p><strong>{isAr ? 'الموظف المسؤول:' : 'Officer:'}</strong> {activeContract.handover.employeeName}</p>
                    <p><strong>{isAr ? 'الملاحظات المسجلة:' : 'Damages Logged:'}</strong> {activeContract.handover.damages?.length || 0} {isAr ? 'ملاحظة' : 'items'}</p>
                  </div>
                ) : (
                  <p className="text-zinc-500 py-4 text-center">{isAr ? 'لم يتم تنفيذ إجراء التسليم بعد.' : 'Handover checklist not yet executed.'}</p>
                )}
              </div>

              {/* Return Box */}
              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="font-bold text-[#f5d97f] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {isAr ? 'تدقيق الاسترجاع والتسوية' : 'Return Settlement Audit'}
                  </span>
                  <Badge variant={activeContract.returnDetails ? 'sky' : 'zinc'} size="sm">
                    {activeContract.returnDetails ? (isAr ? 'تمت التسوية' : 'Finalized') : (isAr ? 'بانتظار الاسترجاع' : 'Pending Return')}
                  </Badge>
                </div>
                {activeContract.returnDetails ? (
                  <div className="space-y-1.5 text-zinc-300">
                    <p><strong>{isAr ? 'عداد النهاية:' : 'Ending Odometer:'}</strong> {activeContract.returnDetails.endMileage} {isAr ? 'كم' : 'km'}</p>
                    <p><strong>{isAr ? 'رسوم الكيلومتر الإضافي:' : 'Excess Mileage Charge:'}</strong> {activeContract.returnDetails.extraKmCharge || 0} {isAr ? 'د.إ' : 'AED'}</p>
                    <p><strong>{isAr ? 'بوابات سالك / درب:' : 'Salik Tolls:'}</strong> {activeContract.returnDetails.salikTollCharge || 0} {isAr ? 'د.إ' : 'AED'}</p>
                    <p className="text-[#f5d97f] font-bold">
                      {isAr ? 'صافي مسترد التأمين:' : 'Net Deposit Refund:'} {Math.abs(activeContract.returnDetails.finalSettlementBalance || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}
                    </p>
                  </div>
                ) : (
                  <p className="text-zinc-500 py-4 text-center">{isAr ? 'بانتظار استلام السيارة وإجراء الفحص الفني.' : 'Return audit pending vehicle return.'}</p>
                )}
              </div>
            </div>

            {/* Financial Terms Summary */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2 text-xs">
              <h4 className="font-bold text-zinc-300 uppercase tracking-wider text-[11px]">
                {isAr ? 'الهيكل المالي للعقد والوديعة المحتجزة' : 'Lease Financial Structure & Security Hold'}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-zinc-400 pt-2">
                <div>
                  <span>{isAr ? 'السعر اليومي:' : 'Daily Rate:'}</span>
                  <p className="font-bold text-zinc-200">{(activeContract.dailyRate || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</p>
                </div>
                <div>
                  <span>{isAr ? 'إجمالي التأجير (مع الضريبة):' : 'Rental Total (Inc VAT):'}</span>
                  <p className="font-bold text-zinc-200">{(activeContract.grandTotal || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</p>
                </div>
                <div>
                  <span>{isAr ? 'مبلغ التأمين المحجوز:' : 'Security Deposit:'}</span>
                  <p className="font-bold text-[#f5d97f]">{(activeContract.depositAmount || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</p>
                </div>
                <div>
                  <span>{isAr ? 'حالة السداد:' : 'Payment Status:'}</span>
                  <Badge variant={activeContract.paymentStatus === 'paid' ? 'emerald' : 'amber'} size="sm">
                    {getStatusLabel(activeContract.paymentStatus || 'unpaid')}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Handover Modal */}
      <Modal
        isOpen={handoverModalOpen}
        onClose={() => setHandoverModalOpen(false)}
        title={isAr ? 'إجراء الفحص الرقمي للتسليم والتوقيع' : 'Execute Digital Handover Inspection & Signature'}
        subtitle={isAr ? `تسليم المركبة للعقد ${contractToOperate?.contractNumber}` : `Vehicle Handover for Contract ${contractToOperate?.contractNumber}`}
        maxWidth="4xl"
      >
        <form onSubmit={handleHandoverSubmit} className="space-y-5 text-xs max-h-[80vh] overflow-y-auto custom-scrollbar pr-1">
          {/* Telematics Auto-Audit Banner */}
          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <div>
                <span className="font-bold text-zinc-200">{isAr ? 'المطابقة الحية مع جهاز التتبع GPS OBD-II' : 'Live GPS & OBD-II Telematics Sync'}</span>
                <p className="text-[11px] text-zinc-400">{isAr ? 'قراءة عداد السرعة وموقع السيارة الحالي تلقائياً من جهاز التتبع' : 'Fetch instant live odometer telemetry directly from onboard tracker'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSyncGpsTelematics}
              disabled={isSyncingGps}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/40 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGps ? 'animate-spin' : ''}`} />
              <span>{gpsSyncSuccess ? (isAr ? 'تمت المطابقة بنجاح' : 'Telemetry Verified') : (isAr ? 'مزامنة العداد' : 'Sync Live KM')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">
                {isAr ? 'عداد المسافات عند البدء (كم) *' : 'Starting Odometer (KM) *'}
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
              <label className="block text-zinc-400 font-medium mb-1">
                {isAr ? 'مستوى الوقود (%) *' : 'Fuel Level (%) *'}
              </label>
              <input
                type="number"
                max="100"
                min="0"
                required
                value={handoverForm.fuelLevelPercent}
                onChange={(e) => setHandoverForm({ ...handoverForm, fuelLevelPercent: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          {/* Vehicle Condition Hotspots */}
          <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
            <VehicleInspectionDamageHotspots
              damages={handoverDamages}
              onChange={setHandoverDamages}
            />
          </div>

          {/* VIP Accessories */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
            <span className="font-bold text-zinc-300">
              {isAr ? 'التحقق من ملحقات ومحتويات VIP:' : 'VIP Accessories Verification:'}
            </span>
            <div className="grid grid-cols-2 gap-2 text-zinc-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.vipKeyFob} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, vipKeyFob: e.target.checked } })} />
                <span>{isAr ? 'المفتاح الرئيسي والاحتياطي' : 'Primary & Spare Key Fobs'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.scentKit} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, scentKit: e.target.checked } })} />
                <span>{isAr ? 'باقة عطور سبلندر الفاخرة' : 'Splendor Scent Kit'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.manualAndDocs} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, manualAndDocs: e.target.checked } })} />
                <span>{isAr ? 'الملكية ووثيقة التأمين الشامل' : 'Registration & Insurance Card'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.highEndCharger} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, highEndCharger: e.target.checked } })} />
                <span>{isAr ? 'شاحن وكابلات الأجهزة VIP' : 'VIP Device Cables'}</span>
              </label>
            </div>
          </div>

          {/* Digital Signatures Canvas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DigitalSignaturePad
              label={isAr ? 'توقيع العميل المستلم' : 'Lessee Digital Signature'}
              sublabel={isAr ? 'إقرار باستلام المركبة سليمة' : 'Confirms receiving asset in noted condition'}
              initialDataUrl={clientSignature}
              onSave={setClientSignature}
            />
            <DigitalSignaturePad
              label={isAr ? 'توقيع مسؤول التسليم (الكونسيرج)' : 'Concierge Officer Signature'}
              sublabel={isAr ? 'اعتماد موظف سبلندر المرخص' : 'Authorized operations officer signature'}
              initialDataUrl={officerSignature}
              onSave={setOfficerSignature}
            />
          </div>

          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setHandoverModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 text-xs hover:bg-zinc-800"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-500 text-zinc-950 font-bold text-xs shadow-lg hover:brightness-110 active:scale-95 transition-all"
            >
              {isAr ? 'اعتماد التسليم وتفعيل العقد رسمياً' : 'Authorize & Activate Rental Contract'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Return Modal */}
      <Modal
        isOpen={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        title={isAr ? 'فحص الاسترجاع والتسوية المالية' : 'Execute Vehicle Return & Final Settlement'}
        subtitle={isAr ? `فحص الاسترجاع ومطابقة التأمين للعقد ${contractToOperate?.contractNumber}` : `Return Inspection & Deposit Reconciliation for ${contractToOperate?.contractNumber}`}
        maxWidth="4xl"
      >
        <form onSubmit={handleReturnSubmit} className="space-y-5 text-xs max-h-[80vh] overflow-y-auto custom-scrollbar pr-1">
          {/* Mileage Allowance & Excess Rate Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-[11px]">
            <div>
              <span className="text-zinc-400">{isAr ? 'المسافة اليومية المسموحة:' : 'Daily Allowed KM:'}</span>
              <p className="font-bold text-zinc-100 font-mono">{contractToOperate?.mileageAllowancePerDay || 250} km/day</p>
            </div>
            <div>
              <span className="text-zinc-400">{isAr ? 'المسافة الشهرية المسموحة:' : 'Monthly Allowed KM:'}</span>
              <p className="font-bold text-sky-400 font-mono">{contractToOperate?.monthlyMileageAllowance || ((contractToOperate?.mileageAllowancePerDay || 250) * 18)} km/month</p>
            </div>
            <div>
              <span className="text-zinc-400">{isAr ? 'رسوم تجاوز الكيلومتر:' : 'Excess Rate:'}</span>
              <p className="font-bold text-amber-400 font-mono">{contractToOperate?.extraKmRate || 2} AED/km</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">
                {isAr ? 'عداد المسافات عند الاسترجاع (كم) *' : 'Ending Odometer (KM) *'}
              </label>
              <input
                type="number"
                required
                value={returnForm.endMileage}
                onChange={(e) => {
                  const end = Number(e.target.value);
                  const start = contractToOperate?.handover?.startMileage || 4500;
                  const days = contractToOperate ? Math.max(1, Math.ceil((new Date(contractToOperate.endDateTime).getTime() - new Date(contractToOperate.startDateTime).getTime()) / (1000 * 60 * 60 * 24))) : 2;
                  const allowed = (days * (contractToOperate?.mileageAllowancePerDay || 250));
                  const extra = Math.max(0, (end - start) - allowed);
                  const rate = contractToOperate?.extraKmRate || 2;
                  const extraChg = extra * rate;
                  setReturnForm({
                    ...returnForm,
                    endMileage: end,
                    extraKms: extra,
                    extraKmCharge: extraChg,
                    totalAdditionalCharges: extraChg + returnForm.salikTollCharge + returnForm.damageCharge
                  });
                }}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">
                {isAr ? 'رسوم سالك / درب المسجلة (د.إ)' : 'Salik Tolls Recorded (AED)'}
              </label>
              <input
                type="number"
                value={returnForm.salikTollCharge}
                onChange={(e) => {
                  const salik = Number(e.target.value);
                  setReturnForm({
                    ...returnForm,
                    salikTollCharge: salik,
                    totalAdditionalCharges: salik + returnForm.extraKmCharge + returnForm.damageCharge
                  });
                }}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
              />
            </div>
          </div>

          {/* New Damages on Return */}
          <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
            <VehicleInspectionDamageHotspots
              damages={returnDamages}
              onChange={(dmgs) => {
                setReturnDamages(dmgs);
                const dmgChg = dmgs.length * 500;
                setReturnForm(prev => ({
                  ...prev,
                  damageCharge: dmgChg,
                  totalAdditionalCharges: prev.salikTollCharge + prev.extraKmCharge + dmgChg
                }));
              }}
            />
          </div>

          {/* Settlement Summary Breakdown */}
          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
            <h4 className="font-bold text-[#f5d97f]">
              {isAr ? 'ملخص التسوية المالية لحساب الوديعة:' : 'Security Deposit Settlement Audit:'}
            </h4>
            <div className="flex justify-between text-zinc-400">
              <span>{isAr ? 'مبلغ التأمين المحجوز أصلاً:' : 'Security Deposit Held:'}</span>
              <span className="font-mono text-zinc-200">{(contractToOperate?.depositAmount || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>{isAr ? 'إجمالي الخصومات (سالك + كم إضافي + أضرار):' : 'Total Deductions (Salik + Extra KM + Damages):'}</span>
              <span className="font-mono text-rose-400">-{(returnForm.totalAdditionalCharges || 0).toLocaleString()} {isAr ? 'د.إ' : 'AED'}</span>
            </div>
            <div className="flex justify-between font-bold text-zinc-100 pt-2 border-t border-zinc-800 text-sm">
              <span>{isAr ? 'صافي المبلغ المسترد للعميل:' : 'Net Refund Due to Client:'}</span>
              <span className="font-mono text-emerald-400">
                {Math.max(0, (contractToOperate?.depositAmount || 0) - (returnForm.totalAdditionalCharges || 0)).toLocaleString()} {isAr ? 'د.إ' : 'AED'}
              </span>
            </div>
          </div>

          {/* Return Signatures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DigitalSignaturePad
              label={isAr ? 'توقيع العميل على إخلاء الطرف' : 'Lessee Return Signature'}
              sublabel={isAr ? 'الموافقة على خصومات سالك والتسوية' : 'Acknowledges toll & excess deductions'}
              initialDataUrl={clientSignature}
              onSave={setClientSignature}
            />
            <DigitalSignaturePad
              label={isAr ? 'توقيع مسؤول الاستلام' : 'Receiving Officer Signature'}
              sublabel={isAr ? 'إغلاق الفحص الفني' : 'Finalizes inspection audit'}
              initialDataUrl={officerSignature}
              onSave={setOfficerSignature}
            />
          </div>

          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setReturnModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 text-xs hover:bg-zinc-800"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow-lg hover:brightness-110 active:scale-95 transition-all"
            >
              {isAr ? 'إنهاء الاسترجاع وإقفال التأمين' : 'Finalize Return & Release Balance'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Official Master Lease Agreement Print / PDF Modal */}
      {activeContract && (
        <ContractDocumentPrintModal
          isOpen={contractPrintOpen}
          onClose={() => setContractPrintOpen(false)}
          contract={activeContract}
          vehicle={activeVehicle}
          customer={activeCustomer}
        />
      )}
    </div>
  );
};

