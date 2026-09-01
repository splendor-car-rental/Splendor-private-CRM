import React from 'react';
import { FileText } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { WorkflowDocumentPreviewButton } from './WorkflowDocumentPreviewButton';

/**
 * Contextual document rail. Official documents are generated only from the
 * explicitly selected persisted record. The browser sends source IDs, never
 * official business values or serial numbers.
 */
export const ContextualDocumentActions: React.FC = () => {
  const { language } = useLanguage();
  const { activeView, selectedContractId, selectedCustomerId, selectedVehicleId, contracts, customers, vehicles } = useCRM();

  const contract = selectedContractId ? contracts.find(c => c.id === selectedContractId) : undefined;
  const customer = selectedCustomerId ? customers.find(c => c.id === selectedCustomerId) : undefined;
  const vehicle = selectedVehicleId ? vehicles.find(v => v.id === selectedVehicleId) : undefined;
  const hasContext = Boolean(
    (activeView === 'contracts' && contract) ||
    (activeView === 'customers' && customer) ||
    ((activeView === 'fleet' || activeView === 'live-radar') && vehicle)
  );
  if (!hasContext) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/20 bg-gradient-to-r from-sky-950/45 via-zinc-950 to-zinc-950 px-4 py-3 shadow-lg shadow-sky-950/10">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-2 text-sky-300"><FileText className="h-4 w-4" /></div>
        <div>
          <div className="text-xs font-black text-sky-200">{language === 'ar' ? 'مستندات السجل الحالي' : 'Current Record Documents'}</div>
          <div className="text-[10px] text-zinc-500">{language === 'ar' ? 'المعاينة تُبنى من بيانات السجل المحفوظة على الخادم، ثم تُعتمد وتُؤرشف كنسخة ثابتة قبل الطباعة أو الحفظ.' : 'Preview is hydrated from server-side record data, then issued and archived immutably before print/save.'}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {activeView === 'contracts' && contract && <>
          <WorkflowDocumentPreviewButton kind="rental_contract" source={{ type: 'contract', id: contract.id }} labelAr="معاينة عقد الإيجار" labelEn="Preview Rental Agreement" />
          {(contract.extensions || []).length > 0 && <WorkflowDocumentPreviewButton kind="contract_extension" source={{ type: 'contract_extension', id: contract.id }} labelAr="معاينة ملحق التمديد" labelEn="Preview Extension Addendum" />}
        </>}

        {activeView === 'customers' && customer && <>
          <WorkflowDocumentPreviewButton kind="account_statement" source={{ type: 'customer', id: customer.id }} labelAr="معاينة كشف الحساب" labelEn="Preview Account Statement" />
          {(customer.outstandingBalance || 0) > 0 && <WorkflowDocumentPreviewButton kind="payment_demand" source={{ type: 'customer', id: customer.id }} labelAr="معاينة إنذار بالسداد" labelEn="Preview Payment Demand" />}
        </>}

        {(activeView === 'fleet' || activeView === 'live-radar') && vehicle && <>
          <WorkflowDocumentPreviewButton kind="vehicle_record_card" source={{ type: 'vehicle', id: vehicle.id }} labelAr="معاينة بطاقة المركبة" labelEn="Preview Vehicle Card" />
          <WorkflowDocumentPreviewButton kind="vehicle_exit_permit" source={{ type: 'vehicle', id: vehicle.id }} labelAr="معاينة تصريح خروج المركبة" labelEn="Preview Vehicle Exit Permit" />
        </>}
      </div>
    </div>
  );
};
