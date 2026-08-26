import React, { useState } from 'react';
import { 
  CalendarCheck, Plus, Search, Car, User, 
  FileSignature, CheckCircle2, Clock, MapPin, 
  AlertTriangle, DollarSign, ArrowRight
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Reservation } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';

export const ReservationsView: React.FC = () => {
  const { language, t } = useLanguage();
  const { 
    reservations, customers, vehicles, createReservation, 
    createContractFromReservation, setActiveView, setSelectedContractId 
  } = useCRM();

  const [searchTerm, setSearchTerm] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);

  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    customerPhone: '',
    vehicleId: '',
    vehicleName: '',
    vehiclePlate: '',
    pickupDateTime: new Date().toISOString().split('T')[0] + 'T10:00:00Z',
    returnDateTime: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0] + 'T10:00:00Z',
    durationDays: 3,
    pickupLocation: 'Dubai Flagship Showroom',
    returnLocation: 'Dubai Flagship Showroom',
    dailyRate: 7500,
    totalAmount: 23625,
    depositAmount: 15000,
    depositStatus: 'pending' as const,
    status: 'confirmed' as const,
    notes: 'Direct reservation booking.'
  });

  const handleCustomerSelect = (custId: string) => {
    const cust = customers.find(c => c.id === custId);
    if (cust) {
      setForm(prev => ({
        ...prev,
        customerId: cust.id,
        customerName: cust.fullName,
        customerPhone: cust.phone
      }));
    }
  };

  const handleVehicleSelect = (vehId: string) => {
    const veh = vehicles.find(v => v.id === vehId);
    if (veh) {
      const days = form.durationDays || 3;
      const total = veh.dailyRate * days * 1.05; // 5% VAT
      setForm(prev => ({
        ...prev,
        vehicleId: veh.id,
        vehicleName: `${veh.make} ${veh.model}`,
        vehiclePlate: `${veh.plateCity} ${veh.plateNumber}`,
        dailyRate: veh.dailyRate,
        totalAmount: total,
        depositAmount: veh.securityDeposit
      }));
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createReservation(form);
    setAddModalOpen(false);
  };

  const handleConvertToContract = async (resId: string) => {
    const contract = await createContractFromReservation(resId);
    setSelectedContractId(contract.id);
    setActiveView('contracts');
  };

  const filteredReservations = reservations.filter(r =>
    r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.vehicleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'الحجوزات وجدول تسليم الأسطول' : 'Reservations & Fleet Booking Ledger'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'متابعة حجوزات العملاء المعتمدة والتحويل الفوري إلى عقود تأجير رقمية' : 'Manage confirmed bookings, pickup/return logistics & convert to active lease contracts'}
          </p>
        </div>

        <button
          onClick={() => {
            if (customers.length > 0) handleCustomerSelect(customers[0].id);
            if (vehicles.length > 0) handleVehicleSelect(vehicles[0].id);
            setAddModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{t('newReservation')}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reservation, customer, car..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50"
          />
        </div>
      </div>

      {/* Reservations Table */}
      <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                <th className="p-4 text-start font-medium">Reservation ID</th>
                <th className="p-4 text-start font-medium">VIP Client</th>
                <th className="p-4 text-start font-medium">Vehicle / Plate</th>
                <th className="p-4 text-start font-medium">Pickup & Return</th>
                <th className="p-4 text-end font-medium">Total Amount</th>
                <th className="p-4 text-center font-medium">Status</th>
                <th className="p-4 text-end font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredReservations.map(res => (
                <tr key={res.id} className="hover:bg-zinc-900/40 transition-colors text-zinc-300">
                  <td className="p-4 font-mono font-bold text-[#f5d97f]">
                    {res.id}
                  </td>
                  <td className="p-4">
                    <p className="font-semibold text-zinc-100">{res.customerName}</p>
                    <p className="text-[11px] text-zinc-400">{res.customerPhone}</p>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-200">{res.vehicleName}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                        {res.vehiclePlate}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 space-y-0.5">
                    <p className="text-zinc-200">
                      {new Date(res.pickupDateTime).toLocaleDateString()} → {new Date(res.returnDateTime).toLocaleDateString()}
                    </p>
                    <p className="text-[11px] text-zinc-500">{res.durationDays} Days Duration</p>
                  </td>
                  <td className="p-4 text-end">
                    <p className="font-bold text-zinc-100">{res.totalAmount.toLocaleString()} AED</p>
                    <p className="text-[10px] text-zinc-400">Deposit: {res.depositAmount.toLocaleString()} AED</p>
                  </td>
                  <td className="p-4 text-center">
                    <Badge variant={res.status === 'confirmed' ? 'sky' : res.status === 'active' ? 'emerald' : 'zinc'} size="sm">
                      {(res.status || '').toUpperCase()}
                    </Badge>
                  </td>
                  <td className="p-4 text-end">
                    {!res.contractId ? (
                      <button
                        onClick={() => handleConvertToContract(res.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#f5d97f] border border-[#D4AF37]/40 font-semibold transition-all shadow-sm"
                      >
                        <FileSignature className="w-3.5 h-3.5" />
                        <span>Generate Contract</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                        Contract {res.contractId}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Reservation Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Create Direct Reservation"
        subtitle="Reserve a vehicle with live conflict validation"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Customer *</label>
              <select
                required
                value={form.customerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.fullName} ({c.id})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Vehicle *</label>
              <select
                required
                value={form.vehicleId}
                onChange={(e) => handleVehicleSelect(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.make} {v.model} ({v.plateNumber})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Pickup Date & Time</label>
              <input
                type="datetime-local"
                value={form.pickupDateTime.slice(0, 16)}
                onChange={(e) => setForm({ ...form, pickupDateTime: new Date(e.target.value).toISOString() })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Return Date & Time</label>
              <input
                type="datetime-local"
                value={form.returnDateTime.slice(0, 16)}
                onChange={(e) => setForm({ ...form, returnDateTime: new Date(e.target.value).toISOString() })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold"
            >
              Confirm Reservation
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
