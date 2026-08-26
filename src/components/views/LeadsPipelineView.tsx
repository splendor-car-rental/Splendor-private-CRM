import React, { useState } from 'react';
import { 
  UserPlus, Search, Phone, Mail, DollarSign, 
  ArrowRight, CheckCircle2, XCircle, Clock, 
  Sparkles, Filter, ChevronRight, UserCheck
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Lead, LeadStatus } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';

export const LeadsPipelineView: React.FC = () => {
  const { language, t } = useLanguage();
  const { leads, addLead, updateLead, convertLeadToCustomer, setSelectedCustomerId, setActiveView } = useCRM();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    source: 'website' as any,
    preferredCategory: 'supercar' as any,
    estimatedValue: 15000,
    ownerName: 'Elena Rostova',
    notes: ''
  });

  const stages: Array<{ id: LeadStatus; label: string; labelAr: string; color: 'zinc' | 'sky' | 'purple' | 'amber' | 'emerald' | 'rose' }> = [
    { id: 'new', label: 'New Inquiry', labelAr: 'استفسار جديد', color: 'sky' },
    { id: 'contacted', label: 'Contacted', labelAr: 'تم التواصل', color: 'purple' },
    { id: 'qualified', label: 'VIP Qualified', labelAr: 'مؤهل VIP', color: 'amber' },
    { id: 'proposal_sent', label: 'Quotation Sent', labelAr: 'عرض سعر مرسل', color: 'zinc' },
    { id: 'won', label: 'Converted (Won)', labelAr: 'تم التحويل والتعاقد', color: 'emerald' },
    { id: 'lost', label: 'Closed / Lost', labelAr: 'مغلق', color: 'rose' }
  ];

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addLead(form);
    setAddModalOpen(false);
    setForm({
      fullName: '',
      email: '',
      phone: '',
      companyName: '',
      source: 'website',
      preferredCategory: 'supercar',
      estimatedValue: 15000,
      ownerName: 'Elena Rostova',
      notes: ''
    });
  };

  const handleStageChange = async (leadId: string, newStatus: LeadStatus) => {
    await updateLead(leadId, { status: newStatus });
  };

  const handleConvert = async (lead: Lead) => {
    const cust = await convertLeadToCustomer(lead.id);
    setSelectedCustomerId(cust.id);
    setActiveView('customers');
  };

  const filteredLeads = leads.filter(l => 
    l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.phone.includes(searchTerm) ||
    l.email.toLowerCase().includes(searchTerm)
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'مسار المبيعات وتأهيل الفرص' : 'Leads & VIP Sales Pipeline'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'تتبع استفسارات العملاء المحتملين من كافة القنوات مع التحويل الفوري بنقرة واحدة' : 'Track inbound luxury rental inquiries with 1-click customer & quote conversion'}
          </p>
        </div>

        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>{language === 'ar' ? 'تسجيل استفسار جديد' : 'New Inbound Lead'}</span>
        </button>
      </div>

      {/* Kanban Pipeline Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3.5 items-start">
        {stages.map(stage => {
          const stageLeads = filteredLeads.filter(l => l.status === stage.id);
          const totalStageValue = stageLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0);

          return (
            <div key={stage.id} className="p-3 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 space-y-3 min-h-[500px] flex flex-col">
              {/* Stage Header */}
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                <div className="flex items-center gap-1.5">
                  <Badge variant={stage.color} size="sm">
                    {stageLeads.length}
                  </Badge>
                  <span className="text-xs font-bold text-zinc-200 truncate">
                    {language === 'ar' ? stage.labelAr : stage.label}
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                {totalStageValue.toLocaleString()} AED
              </div>

              {/* Cards */}
              <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
                {stageLeads.map(lead => (
                  <div
                    key={lead.id}
                    className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-[#D4AF37]/40 transition-all space-y-2 group shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-[#f5d97f] truncate">
                        {lead.fullName}
                      </h4>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400">
                        {lead.source}
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-400 space-y-1">
                      <p className="truncate flex items-center gap-1"><Phone className="w-3 h-3 text-zinc-500" /> {lead.phone}</p>
                      <p className="truncate font-semibold text-zinc-300">{lead.estimatedValue.toLocaleString()} AED</p>
                    </div>

                    {lead.notes && (
                      <p className="text-[10px] text-zinc-400 line-clamp-2 italic bg-zinc-900/50 p-1.5 rounded">
                        "{lead.notes}"
                      </p>
                    )}

                    {/* Stage quick actions */}
                    <div className="pt-2 border-t border-zinc-900 flex items-center justify-between">
                      {lead.status !== 'won' ? (
                        <button
                          onClick={() => handleConvert(lead)}
                          className="text-[11px] font-semibold text-[#f5d97f] hover:underline flex items-center gap-1"
                        >
                          <UserCheck className="w-3 h-3" />
                          <span>Convert</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Converted
                        </span>
                      )}

                      {/* Move to next stage button */}
                      {lead.status === 'new' && (
                        <button
                          onClick={() => handleStageChange(lead.id, 'contacted')}
                          className="text-[10px] text-zinc-400 hover:text-zinc-200"
                        >
                          → Contacted
                        </button>
                      )}
                      {lead.status === 'contacted' && (
                        <button
                          onClick={() => handleStageChange(lead.id, 'qualified')}
                          className="text-[10px] text-zinc-400 hover:text-zinc-200"
                        >
                          → Qualify
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Lead Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={language === 'ar' ? 'تسجيل استفسار فاخر جديد' : 'Log New Luxury Rental Inquiry'}
        subtitle="Capture inbound interest and assign to sales executive"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Prospect Name *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
                placeholder="e.g. Lord Alistair Vance"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Company (Optional)</label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Phone Number *</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
                placeholder="+971 50 000 0000"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
                placeholder="prospect@luxury.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Lead Source</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
              >
                <option value="website">Website Direct</option>
                <option value="concierge">Hotel Concierge</option>
                <option value="instagram">Instagram VIP</option>
                <option value="referral">VIP Referral</option>
                <option value="whatsapp">WhatsApp Hotline</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Desired Fleet Tier</label>
              <select
                value={form.preferredCategory}
                onChange={(e) => setForm({ ...form, preferredCategory: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
              >
                <option value="supercar">Supercar Tier</option>
                <option value="ultra_luxury">Ultra-Luxury (Rolls/Maybach)</option>
                <option value="luxury_suv">Luxury SUV (Cullinan/G63)</option>
                <option value="convertible">Convertible</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Estimated Value (AED)</label>
              <input
                type="number"
                value={form.estimatedValue}
                onChange={(e) => setForm({ ...form, estimatedValue: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1">Requirements & Client Request Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-[#D4AF37]/50"
              placeholder="Inquiring for Formula 1 weekend in Abu Dhabi..."
            />
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:bg-zinc-800"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold shadow-md"
            >
              Save Inbound Lead
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
