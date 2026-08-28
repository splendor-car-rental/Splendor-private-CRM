import React, { useState } from 'react';
import { FileSignature, Shield, Car, User, Calendar, DollarSign, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Modal } from '../common/Modal';
import { vatPortion } from '../../config/tax';

interface AddContractModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddContractModal: React.FC<AddContractModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const { customers, vehicles, createContract, checkVehicleAvailability, firebaseSyncState } = useCRM();
  const [submitting, setSubmitting] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const availableVehicles = vehicles.filter(v => v.status === 'available' || v.status === 'reserved');
  const activeCustomers = customers.filter(c => c.status !== 'blocklisted');

  const now = new Date();
  const threeDaysLater = new Date(Date.now() + 86400000 * 3);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(activeCustomers[0]?.id || '');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(availableVehicles[0]?.id || '');
  const [startDate, setStartDate] = useState<string>(now.toISOString().split('T')[0] + 'T10:00');
  const [endDate, setEndDate] = useState<string>(threeDaysLater.toISOString().split('T')[0] + 'T18:00');
  const [pickupLocation, setPickupLocation] = useState<string>('Dubai Flagship Showroom');
  const [returnLocation, setReturnLocation] = useState<string>('Dubai Flagship Showroom');
  const [mileageAllowance, setMileageAllowance] = useState<number>(200);
  const [extraKmRate, setExtraKmRate] = useState<number>(15);
  const [depositReleaseDays, setDepositReleaseDays] = useState<number>(21);
  const [notes, setNotes] = useState<string>('Instant Executive Rental Agreement created from Command Center.');

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || customers[0];

  // Calculate rental duration in days
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const diffDays = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)));
  const dailyRate = selectedVehicle?.dailyRate || 3500;
  const rentalTotal = dailyRate * diffDays;
  const vatAmount = vatPortion(rentalTotal);
  const grandTotal = rentalTotal + vatAmount;
  const depositAmount = selectedVehicle?.minDeposit || 10000;

  const handleVehicleChange = async (vehId: string) => {
    setSelectedVehicleId(vehId);
    setConflictWarning(null);
    if (vehId && startDate && endDate) {
      const avail = await checkVehicleAvailability(vehId, new Date(startDate).toISOString(), new Date(endDate).toISOString());
      if (!avail.available) {
        setConflictWarning(language === 'ar' ? 'تنبيه: توجد حجوزات أو عقود أخرى لهذه المركبة في التواريخ المحددة.' : 'Warning: Scheduling conflict exists for this vehicle.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || !selectedCustomer) return;

    setSubmitting(true);
    try {
      await createContract({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.fullName,
        customerPhone: selectedCustomer.phone,
        customerAddress: selectedCustomer.address,
        vehicleId: selectedVehicle.id,
        vehicleName: `${selectedVehicle.make} ${selectedVehicle.model}`,
        vehiclePlate: `${selectedVehicle.plateCity} ${selectedVehicle.plateNumber}`,
        vehicleVin: selectedVehicle.vin,
        startDateTime: new Date(startDate).toISOString(),
        endDateTime: new Date(endDate).toISOString(),
        pickupLocation,
        returnLocation,
        dailyRate,
        rentalTotal,
        vatAmount,
        grandTotal,
        depositAmount,
        mileageAllowancePerDay: mileageAllowance,
        extraKmRate,
        depositReleaseDays,
        status: 'active',
        paymentStatus: 'unpaid',
        depositStatus: 'held',
        notes
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'ar' ? 'إصدار عقد إيجار لحظي فوري' : 'Issue Instant Rental Contract'}
      subtitle={language === 'ar' ? 'توليد العقد المعتمد وربطه مباشرة بسحابة سبلندر وتحديث أرقام لوحة القيادة فوراً' : 'Instant binding contract creation with zero-reload Splendor Cloud sync'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Live sync indicator */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-xs text-[#f5d97f]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold">
              {language === 'ar' ? 'تحديث فوري للوحة القيادة:' : 'Instant Dashboard Broadcast:'}
            </span>
            <span className="text-zinc-300 font-mono text-[11px]">
              {firebaseSyncState.projectId}
            </span>
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">
            {language === 'ar' ? 'تزامن مباشر في العقود والإيرادات' : 'Live Firestore Telemetry'}
          </span>
        </div>

        {/* Conflict Warning */}
        {conflictWarning && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{conflictWarning}</span>
          </div>
        )}

        {/* Customer and Vehicle selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#D4AF37]" />
              {language === 'ar' ? 'اختر العميل المعتمد' : 'Select Customer / VIP Client'} *
            </label>
            <select
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
            >
              {activeCustomers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({(c.type || '').toUpperCase()} • {c.phone})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-[#D4AF37]" />
              {language === 'ar' ? 'اختر المركبة من الأسطول' : 'Select Fleet Vehicle'} *
            </label>
            <select
              value={selectedVehicleId}
              onChange={e => handleVehicleChange(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} ({v.plateNumber} • {v.dailyRate} AED/day • {(v.status || '').toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Schedule & Timing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              {language === 'ar' ? 'تاريخ ووقت بدء الإيجار والتسليم' : 'Pickup Date & Time'} *
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              {language === 'ar' ? 'تاريخ ووقت إرجاع المركبة' : 'Return Date & Time'} *
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* Locations & Mileage */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'موقع التسليم' : 'Pickup Location'}
            </label>
            <input
              type="text"
              value={pickupLocation}
              onChange={e => setPickupLocation(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'موقع الاستلام' : 'Return Location'}
            </label>
            <input
              type="text"
              value={returnLocation}
              onChange={e => setReturnLocation(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'الكيلومترات المسموحة / يوم' : 'Daily KM Allowance'}
            </label>
            <input
              type="number"
              value={mileageAllowance}
              onChange={e => setMileageAllowance(Number(e.target.value))}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {language === 'ar' ? 'مدة استرداد التأمين (أيام)' : 'Deposit Release (Days)'}
            </label>
            <input
              type="number"
              value={depositReleaseDays}
              onChange={e => setDepositReleaseDays(Number(e.target.value))}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>
        </div>

        {/* Financial Calculation Box */}
        <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
              {language === 'ar' ? 'ملخص الحساب المالي الرسمي للعقد:' : 'Contract Financial Settlement Summary:'}
            </span>
            <span className="text-xs text-[#f5d97f] font-semibold">
              {diffDays} {language === 'ar' ? 'أيام إيجار' : 'Days Duration'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-400">{language === 'ar' ? 'السعر اليومي:' : 'Daily Rate:'}</div>
              <div className="text-sm font-bold text-zinc-200 mt-0.5 font-mono">{(dailyRate || 0).toLocaleString()} AED</div>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-400">{language === 'ar' ? 'المجموع قبل الضريبة:' : 'Subtotal:'}</div>
              <div className="text-sm font-bold text-zinc-200 mt-0.5 font-mono">{(rentalTotal || 0).toLocaleString()} AED</div>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-400">{language === 'ar' ? 'ضريبة القيمة المضافة (5%):' : 'UAE VAT (5%):'}</div>
              <div className="text-sm font-bold text-zinc-300 mt-0.5 font-mono">{(vatAmount || 0).toLocaleString()} AED</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40">
              <div className="text-[10px] text-[#f5d97f] font-semibold">{language === 'ar' ? 'الإجمالي النهائي:' : 'Grand Total:'}</div>
              <div className="text-sm font-black text-[#f5d97f] mt-0.5 font-mono">{(grandTotal || 0).toLocaleString()} AED</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-amber-300 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
            <span>{language === 'ar' ? 'مبلغ التأمين المحتجز في العقد:' : 'Held Security Deposit Amount:'}</span>
            <span className="font-bold font-mono">{(depositAmount || 0).toLocaleString()} AED</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold transition-all"
          >
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs lg:text-sm shadow-lg shadow-[#D4AF37]/25 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
          >
            <FileSignature className="w-4 h-4" />
            <span>{submitting ? (language === 'ar' ? 'جاري إصدار وتوثيق العقد في Firestore...' : 'Generating & Broadcasting to Firestore...') : (language === 'ar' ? 'إصدار العقد وتفعيله فوراً' : 'Issue & Activate Contract Instantly')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
