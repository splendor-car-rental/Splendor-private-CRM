import React, { useMemo, useState } from 'react';
import { CalendarCheck, Plus, Search, FileSignature, UserPlus, Users } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate } from '../../lib/dateFormat';
import { applyVat } from '../../config/tax';
import { getCountryOptions } from '../../config/countryOptions';

const inputClass = 'w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50';

type CustomerMode = 'existing' | 'new';

function localDateTimeValue(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function rentalDays(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

export const ReservationsView: React.FC = () => {
  const { language, t } = useLanguage();
  const {
    reservations, customers, vehicles, createReservation, addCustomer,
    createContractFromReservation, setActiveView, setSelectedContractId
  } = useCRM();

  const [searchTerm, setSearchTerm] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing');
  const [saving, setSaving] = useState(false);
  const countries = useMemo(() => getCountryOptions(language === 'ar' ? 'ar' : 'en'), [language]);

  const [newCustomer, setNewCustomer] = useState({
    fullName: '', fullNameAr: '', email: '', phone: '', nationality: 'AE',
    idType: 'passport' as 'passport' | 'emirates_id' | 'gcc_id', idNumber: '', idExpiryDate: '',
    licenseNumber: '', licenseCountry: 'AE', licenseExpiryDate: ''
  });

  const initialPickup = new Date();
  initialPickup.setHours(10, 0, 0, 0);
  const initialReturn = new Date(initialPickup.getTime() + 86_400_000 * 3);

  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    customerPhone: '',
    vehicleId: '',
    vehicleName: '',
    vehiclePlate: '',
    pickupDateTime: initialPickup.toISOString(),
    returnDateTime: initialReturn.toISOString(),
    durationDays: 3,
    pickupLocation: 'Dubai Flagship Showroom',
    returnLocation: 'Dubai Flagship Showroom',
    dailyRate: 0,
    totalAmount: 0,
    depositAmount: 0,
    depositStatus: 'pending' as const,
    status: 'confirmed' as const,
    notes: 'Direct reservation booking.'
  });

  const selectedVehicle = vehicles.find(v => v.id === form.vehicleId);

  const resetCreateForm = () => {
    const pickup = new Date();
    pickup.setHours(10, 0, 0, 0);
    const returned = new Date(pickup.getTime() + 86_400_000 * 3);
    setForm({
      customerId: '', customerName: '', customerPhone: '', vehicleId: '', vehicleName: '', vehiclePlate: '',
      pickupDateTime: pickup.toISOString(), returnDateTime: returned.toISOString(), durationDays: 3,
      pickupLocation: 'Dubai Flagship Showroom', returnLocation: 'Dubai Flagship Showroom', dailyRate: 0,
      totalAmount: 0, depositAmount: 0, depositStatus: 'pending', status: 'confirmed', notes: 'Direct reservation booking.'
    });
    setNewCustomer({
      fullName: '', fullNameAr: '', email: '', phone: '', nationality: 'AE', idType: 'passport', idNumber: '', idExpiryDate: '',
      licenseNumber: '', licenseCountry: 'AE', licenseExpiryDate: ''
    });
    setCustomerMode(customers.length ? 'existing' : 'new');
  };

  const openCreate = () => {
    resetCreateForm();
    if (customers.length > 0) {
      const cust = customers[0];
      setForm(prev => ({ ...prev, customerId: cust.id, customerName: cust.fullName, customerPhone: cust.phone }));
    }
    if (vehicles.length > 0) {
      const veh = vehicles[0];
      const days = 3;
      setForm(prev => ({
        ...prev,
        vehicleId: veh.id,
        vehicleName: `${veh.make} ${veh.model}`,
        vehiclePlate: `${veh.plateCity} ${veh.plateNumber}`,
        dailyRate: veh.dailyRate,
        totalAmount: applyVat(veh.dailyRate * days)
      }));
    }
    setAddModalOpen(true);
  };

  const handleCustomerSelect = (custId: string) => {
    const cust = customers.find(c => c.id === custId);
    if (!cust) return;
    setForm(prev => ({ ...prev, customerId: cust.id, customerName: cust.fullName, customerPhone: cust.phone }));
  };

  const handleVehicleSelect = (vehId: string) => {
    const veh = vehicles.find(v => v.id === vehId);
    if (!veh) return;
    const days = rentalDays(form.pickupDateTime, form.returnDateTime);
    setForm(prev => ({
      ...prev,
      vehicleId: veh.id,
      vehicleName: `${veh.make} ${veh.model}`,
      vehiclePlate: `${veh.plateCity} ${veh.plateNumber}`,
      dailyRate: veh.dailyRate,
      durationDays: days,
      totalAmount: applyVat(veh.dailyRate * days)
      // Security deposit deliberately remains untouched. It is a manual
      // reservation requirement and may validly be zero or any approved value.
    }));
  };

  const updateRentalWindow = (field: 'pickupDateTime' | 'returnDateTime', localValue: string) => {
    const iso = new Date(localValue).toISOString();
    setForm(prev => {
      const next = { ...prev, [field]: iso };
      const days = rentalDays(next.pickupDateTime, next.returnDateTime);
      return {
        ...next,
        durationDays: days,
        totalAmount: applyVat((next.dailyRate || 0) * days)
      };
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicleId) return;
    setSaving(true);
    try {
      let customerId = form.customerId;
      let customerName = form.customerName;
      let customerPhone = form.customerPhone;

      if (customerMode === 'new') {
        const country = countries.find(c => c.code === newCustomer.nationality)?.label || newCustomer.nationality;
        const licenceCountry = countries.find(c => c.code === newCustomer.licenseCountry)?.label || newCustomer.licenseCountry;
        const created = await addCustomer({
          type: 'individual',
          fullName: newCustomer.fullName.trim(),
          fullNameAr: newCustomer.fullNameAr.trim(),
          email: newCustomer.email.trim(),
          phone: newCustomer.phone.trim(),
          whatsapp: newCustomer.phone.trim(),
          address: '', city: 'Dubai', country, nationality: country,
          idType: newCustomer.idType,
          idNumber: newCustomer.idNumber.trim(),
          idExpiryDate: newCustomer.idExpiryDate,
          licenseNumber: newCustomer.licenseNumber.trim(),
          licenseCountry: licenceCountry,
          licenseExpiryDate: newCustomer.licenseExpiryDate,
          source: 'reservation_inline', isVIP: false, tags: [], notes: '',
          customFields: { createdFromReservationFlow: true }
        });
        customerId = created.id;
        customerName = created.fullName;
        customerPhone = created.phone;
        // If reservation validation later fails, keep the newly-created
        // customer selected so retrying does not create a duplicate customer.
        setCustomerMode('existing');
        setForm(prev => ({ ...prev, customerId, customerName, customerPhone }));
      }

      if (!customerId) throw new Error(language === 'ar' ? 'اختر عميلاً أو سجل عميلاً جديداً.' : 'Select or create a customer.');
      await createReservation({ ...form, customerId, customerName, customerPhone, depositAmount: Math.max(0, Number(form.depositAmount) || 0) });
      setAddModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToContract = async (resId: string) => {
    const contract = await createContractFromReservation(resId);
    setSelectedContractId(contract.id);
    setActiveView('contracts');
  };

  const filteredReservations = reservations.filter(r => {
    const s = (searchTerm || '').toLowerCase();
    return (r.id || '').toLowerCase().includes(s)
      || (r.customerName || '').toLowerCase().includes(s)
      || (r.vehicleName || '').toLowerCase().includes(s)
      || (r.vehiclePlate || '').toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">{language === 'ar' ? 'الحجوزات وجدول تسليم الأسطول' : 'Reservations & Fleet Booking Ledger'}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{language === 'ar' ? 'إنشاء حجز سريع مع إمكانية تسجيل العميل في نفس الخطوة' : 'Fast bookings with inline customer registration and live fleet validation'}</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all">
          <Plus className="w-4 h-4" /><span>{t('newReservation')}</span>
        </button>
      </div>

      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search reservation, customer, car..." className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50" />
        </div>
      </div>

      <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead><tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
              <th className="p-4 text-start font-medium">Reservation ID</th><th className="p-4 text-start font-medium">VIP Client</th><th className="p-4 text-start font-medium">Vehicle / Plate</th><th className="p-4 text-start font-medium">Pickup & Return</th><th className="p-4 text-end font-medium">Total Amount</th><th className="p-4 text-center font-medium">Status</th><th className="p-4 text-end font-medium">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredReservations.map(res => (
                <tr key={res.id} className="hover:bg-zinc-900/40 transition-colors text-zinc-300">
                  <td className="p-4 font-mono font-bold text-[#f5d97f]">{res.id}</td>
                  <td className="p-4"><p className="font-semibold text-zinc-100">{res.customerName}</p><p className="text-[11px] text-zinc-400 font-mono" dir="ltr">{res.customerPhone}</p></td>
                  <td className="p-4"><span className="font-semibold text-zinc-200">{res.vehicleName}</span><span className="ms-2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">{res.vehiclePlate}</span></td>
                  <td className="p-4"><p className="text-zinc-200">{formatDate(res.pickupDateTime)} → {formatDate(res.returnDateTime)}</p><p className="text-[11px] text-zinc-500">{res.durationDays} Days</p></td>
                  <td className="p-4 text-end"><p className="font-bold text-zinc-100">{(res.totalAmount || 0).toLocaleString()} AED</p><p className="text-[10px] text-zinc-400">Deposit: {(res.depositAmount || 0).toLocaleString()} AED</p></td>
                  <td className="p-4 text-center"><Badge variant={res.status === 'confirmed' ? 'sky' : res.status === 'active' ? 'emerald' : 'zinc'} size="sm">{(res.status || '').toUpperCase()}</Badge></td>
                  <td className="p-4 text-end">{!res.contractId ? <button onClick={() => handleConvertToContract(res.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#f5d97f] border border-[#D4AF37]/40 font-semibold"><FileSignature className="w-3.5 h-3.5" />Generate Contract</button> : <span className="text-[11px] font-mono text-emerald-400 font-semibold">Contract {res.contractId}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title={language === 'ar' ? 'إنشاء حجز جديد' : 'Create Direct Reservation'} subtitle={language === 'ar' ? 'العميل والسيارة والتأمين في خطوة واحدة' : 'Customer, vehicle and deposit in one workflow'} maxWidth="3xl">
        <form onSubmit={handleCreateSubmit} className="space-y-5 text-xs">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-950 p-1 border border-zinc-800">
            <button type="button" onClick={() => setCustomerMode('existing')} className={`rounded-lg px-3 py-2 font-semibold flex items-center justify-center gap-2 ${customerMode === 'existing' ? 'bg-[#D4AF37] text-zinc-950' : 'text-zinc-400'}`}><Users className="w-4 h-4" />{language === 'ar' ? 'عميل موجود' : 'Existing Customer'}</button>
            <button type="button" onClick={() => setCustomerMode('new')} className={`rounded-lg px-3 py-2 font-semibold flex items-center justify-center gap-2 ${customerMode === 'new' ? 'bg-[#D4AF37] text-zinc-950' : 'text-zinc-400'}`}><UserPlus className="w-4 h-4" />{language === 'ar' ? 'تسجيل عميل جديد' : 'Create New Customer'}</button>
          </div>

          {customerMode === 'existing' ? (
            <div><label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'العميل *' : 'Customer *'}</label><select required value={form.customerId} onChange={(e) => handleCustomerSelect(e.target.value)} className={inputClass}><option value="">—</option>{customers.map(c => <option key={c.id} value={c.id}>{c.fullName} ({c.id})</option>)}</select></div>
          ) : (
            <div className="rounded-2xl border border-[#D4AF37]/20 bg-zinc-950/50 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'الاسم بالإنجليزية *' : 'Name in English *'}</label><input required dir="ltr" value={newCustomer.fullName} onChange={e => setNewCustomer({ ...newCustomer, fullName: e.target.value })} className={inputClass} /></div>
                <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'الاسم بالعربية *' : 'Name in Arabic *'}</label><input required dir="rtl" value={newCustomer.fullNameAr} onChange={e => setNewCustomer({ ...newCustomer, fullNameAr: e.target.value })} className={inputClass} /></div>
                <div><label className="block text-zinc-400 mb-1">Email *</label><input required type="email" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} className={inputClass} /></div>
                <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'الهاتف *' : 'Phone *'}</label><input required dir="ltr" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={inputClass} placeholder="+971..." /></div>
                <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'الجنسية' : 'Nationality'}</label><select value={newCustomer.nationality} onChange={e => setNewCustomer({ ...newCustomer, nationality: e.target.value })} className={inputClass}>{countries.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'نوع الهوية' : 'ID type'}</label><select value={newCustomer.idType} onChange={e => setNewCustomer({ ...newCustomer, idType: e.target.value as typeof newCustomer.idType })} className={inputClass}><option value="passport">Passport</option><option value="emirates_id">Emirates ID</option><option value="gcc_id">GCC ID</option></select></div>
                <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'رقم الهوية/الجواز *' : 'ID / passport number *'}</label><input required value={newCustomer.idNumber} onChange={e => setNewCustomer({ ...newCustomer, idNumber: e.target.value })} className={inputClass} /></div>
                <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'انتهاء الهوية — يوم/شهر/سنة *' : 'ID expiry — DD/MM/YYYY *'}</label><input required type="date" value={newCustomer.idExpiryDate} onChange={e => setNewCustomer({ ...newCustomer, idExpiryDate: e.target.value })} className={inputClass} /></div>
                <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'رقم رخصة القيادة *' : 'Driving licence number *'}</label><input required value={newCustomer.licenseNumber} onChange={e => setNewCustomer({ ...newCustomer, licenseNumber: e.target.value })} className={inputClass} /></div>
                <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'دولة الرخصة' : 'Licence country'}</label><select value={newCustomer.licenseCountry} onChange={e => setNewCustomer({ ...newCustomer, licenseCountry: e.target.value })} className={inputClass}>{countries.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                <div><label className="block text-zinc-400 mb-1">{language === 'ar' ? 'انتهاء الرخصة — يوم/شهر/سنة *' : 'Licence expiry — DD/MM/YYYY *'}</label><input required type="date" value={newCustomer.licenseExpiryDate} onChange={e => setNewCustomer({ ...newCustomer, licenseExpiryDate: e.target.value })} className={inputClass} /></div>
              </div>
              <p className="text-[11px] text-zinc-500">{language === 'ar' ? 'سيتم إنشاء ملف العميل الحقيقي أولاً ثم ربطه بالحجز. إذا فشل الحجز بعد حفظ العميل سيظل العميل محدداً لإعادة المحاولة دون إنشاء نسخة مكررة.' : 'The real customer profile is saved first, then bound to the reservation. A failed booking retry reuses the same customer instead of creating a duplicate.'}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-zinc-400 font-medium mb-1">Vehicle *</label><select required value={form.vehicleId} onChange={(e) => handleVehicleSelect(e.target.value)} className={inputClass}><option value="">—</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} ({v.plateNumber})</option>)}</select></div>
            <div><label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'التأمين / مبلغ الضمان (AED)' : 'Security Deposit (AED)'}</label><input type="number" min="0" step="0.01" value={form.depositAmount} onChange={e => setForm({ ...form, depositAmount: Math.max(0, Number(e.target.value) || 0) })} className={inputClass} /><p className="mt-1 text-[10px] text-zinc-500">{language === 'ar' ? `قيمة حرة: صفر أو أي مبلغ معتمد. ${selectedVehicle?.minDeposit ? `المرجع المقترح للسيارة ${selectedVehicle.minDeposit.toLocaleString()} درهم فقط، غير إلزامي.` : ''}` : `Manual value: zero or any approved amount. ${selectedVehicle?.minDeposit ? `Vehicle reference ${selectedVehicle.minDeposit.toLocaleString()} AED is advisory only.` : ''}`}</p></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'الاستلام — يوم/شهر/سنة' : 'Pickup — DD/MM/YYYY'}</label><input type="datetime-local" value={localDateTimeValue(form.pickupDateTime)} onChange={(e) => updateRentalWindow('pickupDateTime', e.target.value)} className={inputClass} /></div>
            <div><label className="block text-zinc-400 font-medium mb-1">{language === 'ar' ? 'الإرجاع — يوم/شهر/سنة' : 'Return — DD/MM/YYYY'}</label><input type="datetime-local" value={localDateTimeValue(form.returnDateTime)} onChange={(e) => updateRentalWindow('returnDateTime', e.target.value)} className={inputClass} /></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <div><span className="text-zinc-500">{language === 'ar' ? 'المدة' : 'Duration'}</span><p className="font-bold text-zinc-100">{form.durationDays} {language === 'ar' ? 'يوم' : 'days'}</p></div>
            <div><span className="text-zinc-500">{language === 'ar' ? 'اليومي' : 'Daily rate'}</span><p className="font-bold text-zinc-100">{form.dailyRate.toLocaleString()} AED</p></div>
            <div><span className="text-zinc-500">{language === 'ar' ? 'الإجمالي شامل الضريبة' : 'Total incl. VAT'}</span><p className="font-bold text-[#f5d97f]">{form.totalAmount.toLocaleString()} AED</p></div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400">{t('cancel')}</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold disabled:opacity-50">{saving ? (language === 'ar' ? 'جارِ الحفظ…' : 'Saving…') : (language === 'ar' ? 'تأكيد الحجز' : 'Confirm Reservation')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
