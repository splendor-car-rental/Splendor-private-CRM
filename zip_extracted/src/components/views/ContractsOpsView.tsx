import React, { useState } from 'react';
import { 
  FileSignature, Search, Printer, CheckCircle2, 
  Car, User, ShieldAlert, Key, Fuel, Gauge, 
  DollarSign, ArrowRight, ShieldCheck, AlertTriangle
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Contract } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';

export const ContractsOpsView: React.FC = () => {
  const { language, t } = useLanguage();
  const { 
    contracts, vehicles, processHandover, processReturn,
    selectedContractId, setSelectedContractId, setSelectedCustomerId, setActiveView 
  } = useCRM();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals
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
    employeeName: 'Ahmed Morsy',
    notes: 'Pristine showroom condition. Customer verified all surfaces.'
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
    employeeName: 'Ahmed Morsy',
    notes: 'Return inspection clear. 120 AED Salik deducted from held deposit.'
  });

  const activeContract = contracts.find(c => c.id === selectedContractId) || contracts[0];

  const handleOpenHandover = (c: Contract) => {
    setContractToOperate(c);
    const v = vehicles.find(veh => veh.id === c.vehicleId);
    setHandoverForm(prev => ({
      ...prev,
      startMileage: v ? v.mileage : 4500
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
      employeeName: 'Ahmed Morsy',
      notes: 'Vehicle returned in showroom condition.'
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

  const filteredContracts = contracts.filter(c => {
    const matchesSearch = 
      c.contractNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.vehicleName.toLowerCase().includes(searchTerm.toLowerCase());
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
              placeholder="Search contract, client, car..."
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
                      {contract.status.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="mt-2 pt-2 border-t border-zinc-800/50 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-mono text-zinc-500">{contract.contractNumber}</span>
                    <span className="font-bold text-zinc-200">{contract.grandTotal.toLocaleString()} AED</span>
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
                    Contract {activeContract.contractNumber}
                  </h3>
                  <Badge variant={activeContract.status === 'active' ? 'emerald' : activeContract.status === 'completed' ? 'sky' : 'zinc'} size="sm">
                    {activeContract.status.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {activeContract.customerName} • {activeContract.vehicleName} ({activeContract.vehiclePlate})
                </p>
              </div>

              {/* Handover & Return Trigger Buttons */}
              <div className="flex items-center gap-2">
                {activeContract.status === 'draft' || activeContract.status === 'approved' ? (
                  <button
                    onClick={() => handleOpenHandover(activeContract)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
                  >
                    <Key className="w-4 h-4" />
                    <span>{language === 'ar' ? 'إجراء فحص التسليم' : 'Complete Handover'}</span>
                  </button>
                ) : activeContract.status === 'active' ? (
                  <button
                    onClick={() => handleOpenReturn(activeContract)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{language === 'ar' ? 'فحص الاسترجاع والتسوية' : 'Process Vehicle Return'}</span>
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-sky-400 bg-sky-950/40 px-3 py-1.5 rounded-xl border border-sky-500/30">
                    Rental Completed & Settled
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
                    <Key className="w-3.5 h-3.5" /> Handover Inspection
                  </span>
                  <Badge variant={activeContract.handover ? 'emerald' : 'zinc'} size="sm">
                    {activeContract.handover ? 'Completed' : 'Pending'}
                  </Badge>
                </div>
                {activeContract.handover ? (
                  <div className="space-y-1.5 text-zinc-300">
                    <p><strong>Odometer:</strong> {activeContract.handover.startMileage} km</p>
                    <p><strong>Fuel Level:</strong> {activeContract.handover.fuelLevelPercent}% Tank</p>
                    <p><strong>Cleanliness:</strong> {activeContract.handover.cleanliness.toUpperCase()}</p>
                    <p><strong>Officer:</strong> {activeContract.handover.employeeName}</p>
                  </div>
                ) : (
                  <p className="text-zinc-500 py-4 text-center">Handover checklist not yet executed.</p>
                )}
              </div>

              {/* Return Box */}
              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="font-bold text-[#f5d97f] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Return Settlement Audit
                  </span>
                  <Badge variant={activeContract.returnDetails ? 'sky' : 'zinc'} size="sm">
                    {activeContract.returnDetails ? 'Finalized' : 'Pending Return'}
                  </Badge>
                </div>
                {activeContract.returnDetails ? (
                  <div className="space-y-1.5 text-zinc-300">
                    <p><strong>Ending Odometer:</strong> {activeContract.returnDetails.endMileage} km</p>
                    <p><strong>Excess Mileage Charge:</strong> {activeContract.returnDetails.extraKmCharge || 0} AED</p>
                    <p><strong>Salik Tolls:</strong> {activeContract.returnDetails.salikTollCharge || 0} AED</p>
                    <p className="text-[#f5d97f] font-bold">
                      Net Deposit Refund: {Math.abs(activeContract.returnDetails.finalSettlementBalance || 0).toLocaleString()} AED
                    </p>
                  </div>
                ) : (
                  <p className="text-zinc-500 py-4 text-center">Return audit pending vehicle return.</p>
                )}
              </div>
            </div>

            {/* Financial Terms Summary */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2 text-xs">
              <h4 className="font-bold text-zinc-300 uppercase tracking-wider text-[11px]">Lease Financial Structure</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-zinc-400 pt-2">
                <div>
                  <span>Daily Rate:</span>
                  <p className="font-bold text-zinc-200">{activeContract.dailyRate.toLocaleString()} AED</p>
                </div>
                <div>
                  <span>Rental Total (Inc VAT):</span>
                  <p className="font-bold text-zinc-200">{activeContract.grandTotal.toLocaleString()} AED</p>
                </div>
                <div>
                  <span>Security Deposit:</span>
                  <p className="font-bold text-[#f5d97f]">{activeContract.depositAmount.toLocaleString()} AED</p>
                </div>
                <div>
                  <span>Payment Status:</span>
                  <Badge variant={activeContract.paymentStatus === 'paid' ? 'emerald' : 'amber'} size="sm">
                    {activeContract.paymentStatus.toUpperCase()}
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
        title="Execute Digital Handover Inspection"
        subtitle={`Vehicle Handover for Contract ${contractToOperate?.contractNumber}`}
        maxWidth="lg"
      >
        <form onSubmit={handleHandoverSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Starting Odometer (KM) *</label>
              <input
                type="number"
                required
                value={handoverForm.startMileage}
                onChange={(e) => setHandoverForm({ ...handoverForm, startMileage: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Fuel Level (%) *</label>
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

          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
            <span className="font-bold text-zinc-300">VIP Accessories Verification:</span>
            <div className="grid grid-cols-2 gap-2 text-zinc-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.vipKeyFob} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, vipKeyFob: e.target.checked } })} />
                <span>Primary & Spare Key Fobs</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.scentKit} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, scentKit: e.target.checked } })} />
                <span>Splendor Scent Kit</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.manualAndDocs} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, manualAndDocs: e.target.checked } })} />
                <span>Registration & Insurance Card</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={handoverForm.accessories.highEndCharger} onChange={(e) => setHandoverForm({ ...handoverForm, accessories: { ...handoverForm.accessories, highEndCharger: e.target.checked } })} />
                <span>VIP Device Cables</span>
              </label>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setHandoverModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-semibold"
            >
              Authorize & Activate Rental
            </button>
          </div>
        </form>
      </Modal>

      {/* Return Modal */}
      <Modal
        isOpen={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        title="Execute Vehicle Return & Final Settlement"
        subtitle={`Return Inspection & Deposit Reconciliation for ${contractToOperate?.contractNumber}`}
        maxWidth="lg"
      >
        <form onSubmit={handleReturnSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Ending Odometer (KM) *</label>
              <input
                type="number"
                required
                value={returnForm.endMileage}
                onChange={(e) => setReturnForm({ ...returnForm, endMileage: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Salik Tolls Recorded (AED)</label>
              <input
                type="number"
                value={returnForm.salikTollCharge}
                onChange={(e) => setReturnForm({ ...returnForm, salikTollCharge: Number(e.target.value), totalAdditionalCharges: Number(e.target.value) + returnForm.extraKmCharge })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
            <h4 className="font-bold text-[#f5d97f]">Settlement Summary:</h4>
            <div className="flex justify-between text-zinc-400">
              <span>Security Deposit Held:</span>
              <span className="font-mono text-zinc-200">{contractToOperate?.depositAmount.toLocaleString()} AED</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Total Deductions (Salik + Extra KM):</span>
              <span className="font-mono text-rose-400">-{returnForm.totalAdditionalCharges.toLocaleString()} AED</span>
            </div>
            <div className="flex justify-between font-bold text-zinc-100 pt-2 border-t border-zinc-800">
              <span>Net Refund Due to Client:</span>
              <span className="font-mono text-emerald-400">
                {Math.max(0, (contractToOperate?.depositAmount || 0) - returnForm.totalAdditionalCharges).toLocaleString()} AED
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setReturnModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold"
            >
              Finalize Return & Settle Deposit
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
