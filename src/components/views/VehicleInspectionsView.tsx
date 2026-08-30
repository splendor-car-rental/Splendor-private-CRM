import React, { useCallback, useEffect, useState } from 'react';
import {
  ClipboardCheck, Plus, Camera, AlertTriangle, CheckCircle2, XCircle,
  Loader2, ShieldCheck, Ban, Upload
} from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { uploadFile } from '../../lib/upload';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { AuthenticatedImage } from '../common/AuthenticatedImage';
import type {
  VehicleInspection, InspectionType, InspectionPhotoCategory, InspectionDamageMarker
} from '../../types';

/**
 * Vehicle Inspection & Photo Evidence (Splendor Master Rule Set, Module 08).
 * Standalone from the older Contract.handover/returnDetails checklist
 * (still used by ContractsOpsView's own Handover/Return buttons) -- see
 * src/server/vehicleInspections.ts for why this is additive, not a
 * replacement. Covers pre_delivery / handover / in_rental / return /
 * post_return, all through one workspace: capture evidence, mark damage,
 * obtain acknowledgement where required, then complete.
 */

const PHOTO_CATEGORY_LABELS: Record<InspectionPhotoCategory, { en: string; ar: string }> = {
  front: { en: 'Front', ar: 'الأمام' },
  rear: { en: 'Rear', ar: 'الخلف' },
  left: { en: 'Left Side', ar: 'الجانب الأيسر' },
  right: { en: 'Right Side', ar: 'الجانب الأيمن' },
  interior: { en: 'Interior', ar: 'الداخلية' },
  dashboard_odometer: { en: 'Dashboard / Odometer', ar: 'لوحة القيادة / العداد' },
  fuel_gauge: { en: 'Fuel Gauge', ar: 'مؤشر الوقود' },
  damage: { en: 'Damage', ar: 'الضرر' },
  other: { en: 'Other', ar: 'أخرى' }
};

const INSPECTION_TYPE_LABELS: Record<InspectionType, { en: string; ar: string }> = {
  pre_delivery: { en: 'Pre-Delivery', ar: 'قبل التسليم' },
  handover: { en: 'Customer Handover', ar: 'تسليم للعميل' },
  in_rental: { en: 'Active Rental Spot-Check', ar: 'فحص أثناء الإيجار' },
  return: { en: 'Vehicle Return', ar: 'استرجاع المركبة' },
  post_return: { en: 'Post-Return Review', ar: 'مراجعة ما بعد الاسترجاع' }
};

const VEHICLE_PARTS: InspectionDamageMarker['part'][] = ['front_bumper', 'rear_bumper', 'hood', 'roof', 'left_door', 'right_door', 'left_fender', 'right_fender', 'windshield', 'rims', 'interior'];
const DAMAGE_SEVERITIES: InspectionDamageMarker['severity'][] = ['minor_scratch', 'deep_scratch', 'dent', 'paint_chip', 'curb_rash'];

export const VehicleInspectionsView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { currentUser } = useAuth();
  const { vehicles, contracts, showToast } = useCRM();
  const canManage = ['ceo', 'admin', 'operations', 'fleet'].includes(currentUser.role);
  const isDecider = ['ceo', 'admin', 'operations'].includes(currentUser.role);
  const canVoid = ['ceo', 'admin'].includes(currentUser.role);

  const [inspections, setInspections] = useState<VehicleInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'completed' | 'voided'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/inspections');
      if (res.ok) {
        const data: VehicleInspection[] = await res.json();
        setInspections(data);
        if (!selectedId && data.length > 0) setSelectedId(data[0].id);
      }
    } catch (e) {
      console.error('Failed to load inspections:', e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshOne = (updated: VehicleInspection) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
  };

  const active = inspections.find(i => i.id === selectedId) || null;
  const compareTarget = active?.compareAgainstInspectionId
    ? inspections.find(i => i.id === active.compareAgainstInspectionId) || null
    : null;

  const filtered = inspections.filter(i => statusFilter === 'all' || i.status === statusFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {isAr ? 'جارِ التحميل...' : 'Loading...'}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12 text-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {isAr ? 'فحص المركبة والأدلة المصورة' : 'Vehicle Inspection & Photo Evidence'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {isAr
              ? 'قبل التسليم، عند التسليم، أثناء الإيجار، عند الاسترجاع، ومراجعة ما بعد الاسترجاع -- سجل واحد موثّق ومُدقّق لكل مرحلة.'
              : 'Pre-delivery, handover, active-rental spot-checks, return, and post-return review -- one documented, audited record per stage.'}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setNewModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            {isAr ? 'فحص جديد' : 'New Inspection'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'draft', 'completed', 'voided'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${statusFilter === s ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 border border-transparent hover:bg-zinc-900'}`}
              >
                {s === 'all' ? (isAr ? 'الكل' : 'All') : s === 'draft' ? (isAr ? 'مسودة' : 'Draft') : s === 'completed' ? (isAr ? 'مكتمل' : 'Completed') : (isAr ? 'ملغي' : 'Voided')}
              </button>
            ))}
          </div>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {filtered.map(inspection => (
              <button
                key={inspection.id}
                onClick={() => setSelectedId(inspection.id)}
                className={`w-full text-start p-3 rounded-xl border transition-all ${selectedId === inspection.id ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40' : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-zinc-100">{inspection.vehicleName}</p>
                  <Badge variant={inspection.status === 'completed' ? 'emerald' : inspection.status === 'voided' ? 'zinc' : 'amber'} size="sm">
                    {inspection.status === 'completed' ? (isAr ? 'مكتمل' : 'Completed') : inspection.status === 'voided' ? (isAr ? 'ملغي' : 'Voided') : (isAr ? 'مسودة' : 'Draft')}
                  </Badge>
                </div>
                <p className="text-zinc-400 mt-0.5">{isAr ? INSPECTION_TYPE_LABELS[inspection.type].ar : INSPECTION_TYPE_LABELS[inspection.type].en}{inspection.contractNumber ? ` · ${inspection.contractNumber}` : ''}</p>
                <p className="text-zinc-600 text-[10px] mt-1 font-mono">{inspection.id} · {new Date(inspection.startedAt).toLocaleString()}</p>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-zinc-500 py-6 text-center">{isAr ? 'لا توجد سجلات فحص.' : 'No inspection records.'}</p>}
          </div>
        </div>

        {/* Detail workspace */}
        <div className="lg:col-span-8">
          {active ? (
            <InspectionWorkspace
              inspection={active}
              compareTarget={compareTarget}
              canManage={canManage}
              isDecider={isDecider}
              canVoid={canVoid}
              onUpdated={refreshOne}
              showToast={showToast}
              isAr={isAr}
            />
          ) : (
            <div className="p-10 text-center text-zinc-500 rounded-2xl border border-dashed border-zinc-800">
              {isAr ? 'اختر سجل فحص من القائمة، أو أنشئ فحصاً جديداً.' : 'Select an inspection from the list, or start a new one.'}
            </div>
          )}
        </div>
      </div>

      <NewInspectionModal
        isOpen={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        vehicles={vehicles}
        contracts={contracts}
        isAr={isAr}
        onCreated={async (inspection) => {
          setNewModalOpen(false);
          setInspections(prev => [inspection, ...prev]);
          setSelectedId(inspection.id);
        }}
      />
    </div>
  );
};

const NewInspectionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  vehicles: { id: string; make: string; model: string }[];
  contracts: { id: string; vehicleId: string; contractNumber: string; status: string }[];
  isAr: boolean;
  onCreated: (inspection: VehicleInspection) => void;
}> = ({ isOpen, onClose, vehicles, contracts, isAr, onCreated }) => {
  const [vehicleId, setVehicleId] = useState('');
  const [type, setType] = useState<InspectionType>('pre_delivery');
  const [contractId, setContractId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVehicleId(vehicles[0]?.id || '');
      setType('pre_delivery');
      setContractId('');
    }
  }, [isOpen, vehicles]);

  const relevantContracts = contracts.filter(c => c.vehicleId === vehicleId);
  const requiresContract = type === 'handover' || type === 'return';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || (requiresContract && !contractId)) return;
    setSubmitting(true);
    try {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      const contract = contracts.find(c => c.id === contractId);
      const res = await apiFetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `insp-${vehicleId}-${type}-${Date.now()}` },
        body: JSON.stringify({
          vehicleId,
          vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}` : vehicleId,
          type,
          contractId: contractId || undefined,
          contractNumber: contract?.contractNumber
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to start inspection.');
      onCreated(data);
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert(err?.message || 'Failed to start inspection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isAr ? 'فحص جديد' : 'New Inspection'} maxWidth="sm">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'المركبة *' : 'Vehicle *'}</label>
          <select required value={vehicleId} onChange={e => { setVehicleId(e.target.value); setContractId(''); }} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} ({v.id})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'نوع الفحص *' : 'Inspection Type *'}</label>
          <select value={type} onChange={e => setType(e.target.value as InspectionType)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
            {(Object.keys(INSPECTION_TYPE_LABELS) as InspectionType[]).map(t => (
              <option key={t} value={t}>{isAr ? INSPECTION_TYPE_LABELS[t].ar : INSPECTION_TYPE_LABELS[t].en}</option>
            ))}
          </select>
        </div>
        {(requiresContract || relevantContracts.length > 0) && (
          <div>
            <label className="block text-zinc-400 font-medium mb-1">
              {isAr ? 'العقد' : 'Contract'} {requiresContract && '*'}
            </label>
            <select required={requiresContract} value={contractId} onChange={e => setContractId(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
              <option value="">{isAr ? '-- بدون عقد --' : '-- No contract --'}</option>
              {relevantContracts.map(c => <option key={c.id} value={c.id}>{c.contractNumber} ({c.status})</option>)}
            </select>
            {requiresContract && relevantContracts.length === 0 && (
              <p className="text-[10px] text-rose-400 mt-1">{isAr ? 'لا يوجد عقد لهذه المركبة بعد.' : 'This vehicle has no contract yet.'}</p>
            )}
          </div>
        )}
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={submitting || !vehicleId || (requiresContract && !contractId)} className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold disabled:opacity-50">
            {isAr ? 'بدء الفحص' : 'Start Inspection'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const InspectionWorkspace: React.FC<{
  inspection: VehicleInspection;
  compareTarget: VehicleInspection | null;
  canManage: boolean;
  isDecider: boolean;
  canVoid: boolean;
  onUpdated: (i: VehicleInspection) => void;
  showToast: (title: string, message?: string, variant?: 'success' | 'error') => void;
  isAr: boolean;
}> = ({ inspection, compareTarget, canManage, isDecider, canVoid, onUpdated, showToast, isAr }) => {
  const isDraft = inspection.status === 'draft';
  const [mileage, setMileage] = useState(inspection.mileage ?? '');
  const [fuel, setFuel] = useState(inspection.fuelLevelPercent ?? '');
  const [exterior, setExterior] = useState(inspection.exteriorCondition || '');
  const [interior, setInterior] = useState(inspection.interiorCondition || '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState<InspectionPhotoCategory | null>(null);
  const [damageModalOpen, setDamageModalOpen] = useState(false);
  const [reviewingDamage, setReviewingDamage] = useState<InspectionDamageMarker | null>(null);
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    setMileage(inspection.mileage ?? '');
    setFuel(inspection.fuelLevelPercent ?? '');
    setExterior(inspection.exteriorCondition || '');
    setInterior(inspection.interiorCondition || '');
  }, [inspection.id, inspection.mileage, inspection.fuelLevelPercent, inspection.exteriorCondition, inspection.interiorCondition]);

  const saveDetails = async () => {
    setSavingDetails(true);
    try {
      const res = await apiFetch(`/api/inspections/${inspection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mileage: mileage === '' ? undefined : Number(mileage),
          fuelLevelPercent: fuel === '' ? undefined : Number(fuel),
          exteriorCondition: exterior || undefined,
          interiorCondition: interior || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save.');
      onUpdated(data);
      showToast(isAr ? 'تم الحفظ' : 'Saved', inspection.id);
    } catch (e: any) {
      showToast(isAr ? 'فشل الحفظ' : 'Save failed', e?.message || '', 'error');
    } finally {
      setSavingDetails(false);
    }
  };

  const handlePhotoUpload = async (category: InspectionPhotoCategory, file: File) => {
    setUploadingCategory(category);
    try {
      const uploaded = await uploadFile(file, 'vehicle-inspections', { inspectionId: inspection.id });
      const res = await apiFetch(`/api/inspections/${inspection.id}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, documentPath: uploaded.path, fileUrl: uploaded.url })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to attach photo.');
      onUpdated(data);
    } catch (e: any) {
      showToast(isAr ? 'فشل رفع الصورة' : 'Photo upload failed', e?.message || '', 'error');
    } finally {
      setUploadingCategory(null);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await apiFetch(`/api/inspections/${inspection.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `complete-${inspection.id}` },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Cannot complete this inspection yet.');
      onUpdated(data);
      showToast(isAr ? 'اكتمل الفحص' : 'Inspection Completed', inspection.id);
    } catch (e: any) {
      showToast(isAr ? 'تعذر الإكمال' : 'Cannot Complete', e?.message || '', 'error');
    } finally {
      setCompleting(false);
    }
  };

  const missingPhotoCategories = inspection.requiredPhotoCategories.filter(
    cat => !inspection.photos.some(p => p.category === cat)
  );
  const pendingDamageReview = inspection.damages.filter(d => d.liabilityStatus === 'pending_review');
  const needsAck = (inspection.type === 'handover' || inspection.type === 'return') && !inspection.customerAcknowledgement;
  const readyToComplete = missingPhotoCategories.length === 0 && pendingDamageReview.length === 0 && !needsAck;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-bold text-zinc-100">{inspection.vehicleName}</h3>
            <p className="text-zinc-400 mt-0.5">
              {isAr ? INSPECTION_TYPE_LABELS[inspection.type].ar : INSPECTION_TYPE_LABELS[inspection.type].en}
              {inspection.contractNumber ? ` · ${inspection.contractNumber}` : ''} · {inspection.inspectorName}
            </p>
          </div>
          <Badge variant={inspection.status === 'completed' ? 'emerald' : inspection.status === 'voided' ? 'zinc' : 'amber'} size="md">
            {inspection.status === 'completed' ? (isAr ? 'مكتمل' : 'Completed') : inspection.status === 'voided' ? (isAr ? 'ملغي' : 'Voided') : (isAr ? 'مسودة' : 'Draft')}
          </Badge>
        </div>
        {inspection.status === 'voided' && (
          <p className="mt-2 text-rose-400 text-[11px]">{isAr ? 'سبب الإلغاء:' : 'Void reason:'} {inspection.voidReason}</p>
        )}
      </div>

      {/* Mileage / fuel / condition */}
      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
        <h4 className="font-bold text-zinc-200 uppercase tracking-wide text-[11px]">{isAr ? 'العداد والوقود والحالة' : 'Mileage, Fuel & Condition'}</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-zinc-500 mb-1">{isAr ? 'العداد (كم)' : 'Mileage (km)'}</label>
            <input type="number" disabled={!isDraft || !canManage} value={mileage} onChange={e => setMileage(e.target.value === '' ? '' : Number(e.target.value))} className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-zinc-500 mb-1">{isAr ? 'الوقود %' : 'Fuel %'}</label>
            <input type="number" min={0} max={100} disabled={!isDraft || !canManage} value={fuel} onChange={e => setFuel(e.target.value === '' ? '' : Number(e.target.value))} className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-zinc-500 mb-1">{isAr ? 'الحالة الخارجية' : 'Exterior'}</label>
            <select disabled={!isDraft || !canManage} value={exterior} onChange={e => setExterior(e.target.value as any)} className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 disabled:opacity-50">
              <option value="">--</option>
              <option value="pristine">Pristine</option>
              <option value="clean">Clean</option>
              <option value="fair">Fair</option>
              <option value="needs_detailing">Needs Detailing</option>
            </select>
          </div>
          <div>
            <label className="block text-zinc-500 mb-1">{isAr ? 'الحالة الداخلية' : 'Interior'}</label>
            <select disabled={!isDraft || !canManage} value={interior} onChange={e => setInterior(e.target.value as any)} className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 disabled:opacity-50">
              <option value="">--</option>
              <option value="pristine">Pristine</option>
              <option value="clean">Clean</option>
              <option value="fair">Fair</option>
              <option value="needs_detailing">Needs Detailing</option>
            </select>
          </div>
        </div>
        {isDraft && canManage && (
          <button onClick={saveDetails} disabled={savingDetails} className="text-sky-400 hover:text-sky-300 font-medium disabled:opacity-50">
            {savingDetails ? (isAr ? 'جارِ الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
          </button>
        )}
      </div>

      {/* Photo evidence */}
      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-zinc-200 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" /> {isAr ? 'الأدلة المصورة' : 'Photo Evidence'}
          </h4>
          {missingPhotoCategories.length > 0 && (
            <span className="text-amber-400 text-[10px] flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {isAr ? `${missingPhotoCategories.length} فئة مطلوبة ناقصة` : `${missingPhotoCategories.length} required categories missing`}</span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {inspection.requiredPhotoCategories.map(category => {
            const photos = inspection.photos.filter(p => p.category === category);
            return (
              <div key={category} className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300 font-medium">{isAr ? PHOTO_CATEGORY_LABELS[category].ar : PHOTO_CATEGORY_LABELS[category].en}</span>
                  {photos.length > 0 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {photos.map(p => (
                    <AuthenticatedImage key={p.id} src={p.fileUrl} fallbackSrc="" alt={category} className="w-12 h-12 rounded-lg object-cover border border-zinc-800" />
                  ))}
                </div>
                {isDraft && canManage && (
                  <label className="flex items-center justify-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer py-1 border border-dashed border-zinc-700 rounded-lg">
                    {uploadingCategory === category ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {isAr ? 'رفع صورة' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingCategory !== null} onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(category, f); e.target.value = ''; }} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Damage */}
      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-zinc-200 uppercase tracking-wide text-[11px]">{isAr ? 'سجل الأضرار' : 'Damage Records'}</h4>
          {isDraft && canManage && (
            <button onClick={() => setDamageModalOpen(true)} className="text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> {isAr ? 'إضافة ضرر' : 'Add Damage'}</button>
          )}
        </div>
        <div className="space-y-2">
          {inspection.damages.map(d => (
            <div key={d.id} className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800">
              <div className="flex items-center justify-between flex-wrap gap-1.5">
                <p className="text-zinc-200 font-medium">{d.part.replace(/_/g, ' ')} -- {d.severity.replace(/_/g, ' ')}</p>
                <div className="flex items-center gap-1.5">
                  <Badge variant={d.classification === 'pre_existing' ? 'zinc' : d.classification === 'new' ? 'rose' : 'amber'} size="sm">{d.classification.replace('_', ' ')}</Badge>
                  {d.liabilityStatus !== 'not_applicable' && (
                    <Badge variant={d.liabilityStatus === 'pending_review' ? 'amber' : d.liabilityStatus === 'customer_liable' ? 'rose' : 'emerald'} size="sm">{d.liabilityStatus.replace(/_/g, ' ')}</Badge>
                  )}
                </div>
              </div>
              <p className="text-zinc-400 mt-1">{d.description}</p>
              <p className="text-zinc-600 text-[10px] mt-1">{d.recordedByName} · {new Date(d.recordedAt).toLocaleString()}</p>
              {d.reviewNotes && <p className="text-zinc-500 text-[10px] mt-0.5">{isAr ? 'ملاحظة المراجعة:' : 'Review note:'} {d.reviewNotes}</p>}
              {isDraft && isDecider && d.liabilityStatus === 'pending_review' && (
                <button onClick={() => setReviewingDamage(d)} className="mt-1.5 text-sky-400 hover:text-sky-300 font-medium">{isAr ? 'مراجعة المسؤولية' : 'Review liability'}</button>
              )}
            </div>
          ))}
          {inspection.damages.length === 0 && <p className="text-zinc-500">{isAr ? 'لا يوجد ضرر مسجل.' : 'No damage recorded.'}</p>}
        </div>
      </div>

      {/* Comparison (manual, side-by-side -- never automated) */}
      {compareTarget && (
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-sky-500/30 space-y-2">
          <h4 className="font-bold text-zinc-200 uppercase tracking-wide text-[11px]">{isAr ? 'مقارنة مع الفحص السابق' : `Comparison against ${compareTarget.id}`}</h4>
          <p className="text-zinc-500 text-[10px]">{isAr ? 'مطابقة يدوية للصور والأضرار -- لا يوجد كشف تلقائي.' : 'Manual side-by-side comparison -- no automated detection.'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-zinc-400 font-medium mb-1">{compareTarget.id} ({isAr ? INSPECTION_TYPE_LABELS[compareTarget.type].ar : INSPECTION_TYPE_LABELS[compareTarget.type].en})</p>
              <p className="text-zinc-500">{compareTarget.damages.length} {isAr ? 'ضرر مسجل' : 'damage record(s)'}</p>
            </div>
            <div>
              <p className="text-zinc-400 font-medium mb-1">{inspection.id} ({isAr ? INSPECTION_TYPE_LABELS[inspection.type].ar : INSPECTION_TYPE_LABELS[inspection.type].en})</p>
              <p className="text-zinc-500">{inspection.damages.length} {isAr ? 'ضرر مسجل' : 'damage record(s)'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Acknowledgement */}
      {(inspection.type === 'handover' || inspection.type === 'return') && (
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
          <h4 className="font-bold text-zinc-200 uppercase tracking-wide text-[11px] flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> {isAr ? 'إقرار العميل' : 'Customer Acknowledgement'}</h4>
          {inspection.customerAcknowledgement ? (
            <p className="text-emerald-400">{isAr ? 'أقرّ' : 'Acknowledged by'} {inspection.customerAcknowledgement.acknowledgedByName} -- {isAr ? 'بشهادة' : 'witnessed by'} {inspection.customerAcknowledgement.witnessedByName}, {new Date(inspection.customerAcknowledgement.acknowledgedAt).toLocaleString()}</p>
          ) : (
            <>
              <p className="text-amber-400">{isAr ? 'لم يتم تسجيل إقرار العميل بعد.' : 'No customer acknowledgement recorded yet.'}</p>
              {isDraft && canManage && (
                <button onClick={() => setAckModalOpen(true)} className="text-sky-400 hover:text-sky-300 font-medium">{isAr ? 'تسجيل الإقرار' : 'Record Acknowledgement'}</button>
              )}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      {isDraft && canManage && (
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between flex-wrap gap-3">
          <div className="text-[11px]">
            {!readyToComplete && (
              <p className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {isAr ? 'غير جاهز للإكمال بعد' : 'Not ready to complete yet'}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canVoid && (
              <button onClick={() => setVoidModalOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 font-medium">
                <Ban className="w-3.5 h-3.5" /> {isAr ? 'إلغاء الفحص' : 'Void Inspection'}
              </button>
            )}
            <button
              onClick={handleComplete}
              disabled={!readyToComplete || completing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            >
              {completing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {isAr ? 'إكمال الفحص' : 'Complete Inspection'}
            </button>
          </div>
        </div>
      )}

      <AddDamageModal isOpen={damageModalOpen} onClose={() => setDamageModalOpen(false)} inspectionId={inspection.id} isAr={isAr} onCreated={(u) => { setDamageModalOpen(false); onUpdated(u); }} showToast={showToast} />
      <ReviewDamageModal damage={reviewingDamage} inspectionId={inspection.id} isAr={isAr} onClose={() => setReviewingDamage(null)} onCreated={(u) => { setReviewingDamage(null); onUpdated(u); }} showToast={showToast} />
      <AcknowledgeModal isOpen={ackModalOpen} onClose={() => setAckModalOpen(false)} inspectionId={inspection.id} isAr={isAr} onCreated={(u) => { setAckModalOpen(false); onUpdated(u); }} showToast={showToast} />
      <VoidInspectionModal isOpen={voidModalOpen} onClose={() => setVoidModalOpen(false)} inspectionId={inspection.id} isAr={isAr} onCreated={(u) => { setVoidModalOpen(false); onUpdated(u); }} showToast={showToast} />
    </div>
  );
};

const AddDamageModal: React.FC<{ isOpen: boolean; onClose: () => void; inspectionId: string; isAr: boolean; onCreated: (i: VehicleInspection) => void; showToast: any }> = ({ isOpen, onClose, inspectionId, isAr, onCreated, showToast }) => {
  const [part, setPart] = useState<InspectionDamageMarker['part']>('front_bumper');
  const [severity, setSeverity] = useState<InspectionDamageMarker['severity']>('minor_scratch');
  const [classification, setClassification] = useState<'pre_existing' | 'new' | 'uncertain'>('pre_existing');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (isOpen) { setPart('front_bumper'); setSeverity('minor_scratch'); setClassification('pre_existing'); setDescription(''); } }, [isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/inspections/${inspectionId}/damage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part, severity, classification, description: description.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to add damage.');
      onCreated(data);
    } catch (err: any) {
      showToast(isAr ? 'فشل' : 'Failed', err?.message || '', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isAr ? 'إضافة ضرر' : 'Add Damage Record'} maxWidth="sm">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'الجزء' : 'Part'}</label>
            <select value={part} onChange={e => setPart(e.target.value as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
              {VEHICLE_PARTS.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'الشدة' : 'Severity'}</label>
            <select value={severity} onChange={e => setSeverity(e.target.value as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
              {DAMAGE_SEVERITIES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'التصنيف *' : 'Classification *'}</label>
          <select value={classification} onChange={e => setClassification(e.target.value as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
            <option value="pre_existing">{isAr ? 'موجود مسبقاً' : 'Pre-existing'}</option>
            <option value="new">{isAr ? 'جديد' : 'New'}</option>
            <option value="uncertain">{isAr ? 'غير مؤكد -- يحتاج مراجعة' : 'Uncertain -- needs review'}</option>
          </select>
          {classification !== 'pre_existing' && (
            <p className="text-[10px] text-amber-400 mt-1">{isAr ? 'سيتطلب هذا مراجعة مسؤولية من مدير قبل إكمال الفحص. لا يتم إنشاء أي رسوم تلقائياً.' : 'This will require a manager liability review before the inspection can complete. No charge is ever created automatically.'}</p>
          )}
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'الوصف *' : 'Description *'}</label>
          <textarea required rows={2} value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={submitting || !description.trim()} className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold disabled:opacity-50">{isAr ? 'إضافة' : 'Add'}</button>
        </div>
      </form>
    </Modal>
  );
};

const ReviewDamageModal: React.FC<{ damage: InspectionDamageMarker | null; inspectionId: string; isAr: boolean; onClose: () => void; onCreated: (i: VehicleInspection) => void; showToast: any }> = ({ damage, inspectionId, isAr, onClose, onCreated, showToast }) => {
  const [liabilityStatus, setLiabilityStatus] = useState<'customer_liable' | 'not_customer_liable'>('customer_liable');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (damage) { setLiabilityStatus('customer_liable'); setReviewNotes(''); } }, [damage]);
  if (!damage) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewNotes.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/inspections/${inspectionId}/damage/${damage.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liabilityStatus, reviewNotes: reviewNotes.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to review this damage.');
      onCreated(data);
    } catch (err: any) {
      showToast(isAr ? 'فشل' : 'Failed', err?.message || '', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={!!damage} onClose={onClose} title={isAr ? 'مراجعة المسؤولية عن الضرر' : 'Review Damage Liability'} subtitle={`${damage.part.replace(/_/g, ' ')} -- ${damage.description}`} maxWidth="sm">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-[11px]">
          {isAr ? 'هذا قرار تصنيف فقط. لن يتم إنشاء أي رسوم على العميل هنا -- يتم ذلك عبر نظام الديون الحالي إذا لزم الأمر.' : 'This is a classification decision only. No customer charge is created here -- use the existing Debt/Charge module for that if warranted.'}
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'القرار *' : 'Decision *'}</label>
          <select value={liabilityStatus} onChange={e => setLiabilityStatus(e.target.value as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100">
            <option value="customer_liable">{isAr ? 'العميل مسؤول' : 'Customer liable'}</option>
            <option value="not_customer_liable">{isAr ? 'العميل غير مسؤول' : 'Not customer liable'}</option>
          </select>
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'ملاحظة المراجعة *' : 'Review Note *'}</label>
          <textarea required rows={2} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={submitting || !reviewNotes.trim()} className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold disabled:opacity-50">{isAr ? 'حفظ القرار' : 'Save Decision'}</button>
        </div>
      </form>
    </Modal>
  );
};

const AcknowledgeModal: React.FC<{ isOpen: boolean; onClose: () => void; inspectionId: string; isAr: boolean; onCreated: (i: VehicleInspection) => void; showToast: any }> = ({ isOpen, onClose, inspectionId, isAr, onCreated, showToast }) => {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (isOpen) { setName(''); setNotes(''); } }, [isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/inspections/${inspectionId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgedByName: name.trim(), notes: notes.trim() || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to record acknowledgement.');
      onCreated(data);
    } catch (err: any) {
      showToast(isAr ? 'فشل' : 'Failed', err?.message || '', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isAr ? 'تسجيل إقرار العميل' : 'Record Customer Acknowledgement'} subtitle={isAr ? 'يُسجَّل من قبل الموظف بصفته شاهداً -- ليس نظام توقيع رقمي.' : 'Recorded by the staff member as a witness -- not a digital signature system.' } maxWidth="sm">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'اسم العميل *' : "Customer's name *"}</label>
          <input required value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'ملاحظات' : 'Notes'}</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" />
        </div>
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={submitting || !name.trim()} className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold disabled:opacity-50">{isAr ? 'تسجيل' : 'Record'}</button>
        </div>
      </form>
    </Modal>
  );
};

const VoidInspectionModal: React.FC<{ isOpen: boolean; onClose: () => void; inspectionId: string; isAr: boolean; onCreated: (i: VehicleInspection) => void; showToast: any }> = ({ isOpen, onClose, inspectionId, isAr, onCreated, showToast }) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (isOpen) setReason(''); }, [isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/inspections/${inspectionId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to void this inspection.');
      onCreated(data);
    } catch (err: any) {
      showToast(isAr ? 'فشل' : 'Failed', err?.message || '', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isAr ? 'إلغاء الفحص' : 'Void Inspection'} subtitle={isAr ? 'لا يمكن التراجع عن هذا. يمكن فقط إلغاء فحص لا يزال مسودة.' : 'This cannot be undone. Only a draft inspection can be voided.'} maxWidth="sm">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div>
          <label className="block text-zinc-400 font-medium mb-1">{isAr ? 'السبب *' : 'Reason *'}</label>
          <textarea required rows={2} value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100" placeholder="e.g. Started on the wrong vehicle" />
        </div>
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={submitting || !reason.trim()} className="px-5 py-2 rounded-xl bg-rose-500 text-zinc-950 font-semibold disabled:opacity-50">{isAr ? 'تأكيد الإلغاء' : 'Confirm Void'}</button>
        </div>
      </form>
    </Modal>
  );
};
