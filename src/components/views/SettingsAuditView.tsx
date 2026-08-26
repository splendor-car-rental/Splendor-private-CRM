import React, { useState } from 'react';
import { 
  Settings, Shield, Users, History, 
  RotateCcw, Check, Sparkles, Building, Lock
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';

export const SettingsAuditView: React.FC = () => {
  const { language, t } = useLanguage();
  const { currentUser, switchUserRole } = useAuth();
  const { auditLogs, resetToDemoData, addToast } = useCRM();

  const [activeTab, setActiveTab] = useState<'general' | 'roles' | 'audit'>('general');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const handleResetData = async () => {
    await resetToDemoData();
    setResetConfirmOpen(false);
    addToast('Demo database successfully restored to pristine state', 'success');
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'إعدادات النظام وسجل التدقيق الأمني' : 'System Configuration & Security Audit'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'إدارة الصلاحيات، سجل التغييرات غير القابل للتعديل، وبيانات الشركة الضريبية' : 'Manage corporate tax entities, role-based access control & immutable operational audit logs'}
          </p>
        </div>

        <button
          onClick={() => setResetConfirmOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-300 text-xs font-semibold hover:bg-rose-950/60 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{language === 'ar' ? 'إعادة ضبط البيانات التجريبية' : 'Reset Demo Data'}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'general' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Company & VAT Configuration
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'roles' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          User Roles & RBAC Simulation
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'audit' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Security Audit Trail ({auditLogs.length})
        </button>
      </div>

      {/* Tab 1: Company Configuration */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm">
              <Building className="w-4 h-4 text-[#D4AF37]" />
              <span>Legal Entity & Tax Information</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1">Company Legal Name (English)</label>
                <input
                  type="text"
                  readOnly
                  value="SPLENDOR CAR RENTAL LLC"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-medium"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Company Legal Name (Arabic)</label>
                <input
                  type="text"
                  readOnly
                  dir="rtl"
                  value="شركة سبليندور لتأجير السيارات ذ.م.م"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Federal Tax Number (TRN)</label>
                  <input
                    type="text"
                    readOnly
                    value="100482910300003"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">UAE Standard VAT Rate</label>
                  <input
                    type="text"
                    readOnly
                    value="5.0% (Automated)"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Headquarters & Flagship Location</label>
                <input
                  type="text"
                  readOnly
                  value="Downtown Luxury District, Sheikh Mohammed bin Rashid Blvd, Dubai, UAE"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200"
                />
              </div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm">
              <Settings className="w-4 h-4 text-[#D4AF37]" />
              <span>Rental Operation Defaults</span>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Standard Daily Mileage</label>
                  <input
                    type="text"
                    readOnly
                    value="250 KM / Day"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Excess KM Standard Charge</label>
                  <input
                    type="text"
                    readOnly
                    value="15 - 25 AED / KM"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Operating Currency</label>
                  <input
                    type="text"
                    readOnly
                    value="AED (United Arab Emirates Dirham)"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-[#f5d97f] font-bold"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Deposit Release SLA</label>
                  <input
                    type="text"
                    readOnly
                    value="14 Days (Post-Traffic Fine Audit)"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-400">
                All rate calculations and invoice VAT breakdowns adhere to UAE Federal Tax Authority (FTA) regulatory compliance.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: User Roles & RBAC Simulation */}
      {activeTab === 'roles' && (
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-6 text-xs">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">Live RBAC Switcher</h3>
            <p className="text-zinc-400 text-xs mt-0.5">Switch active user identity to test role-based permissions and interface boundaries</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { id: 'usr-admin-1', name: 'Khalid Al Mansoori', role: 'admin' as const, title: 'Managing Director & Super Admin' },
              { id: 'usr-sales-1', name: 'Elena Rostova', role: 'sales_executive' as const, title: 'VIP Client Relationship Manager' },
              { id: 'usr-ops-1', name: 'Ahmed Morsy', role: 'fleet_operations' as const, title: 'Fleet Logistics & Inspection Lead' },
              { id: 'usr-fin-1', name: 'Siddharth Rao', role: 'accountant' as const, title: 'Head of Financial Controller' }
            ].map(usr => {
              const isActive = currentUser.id === usr.id;
              return (
                <div
                  key={usr.id}
                  onClick={() => switchUserRole(usr.role, usr.name, usr.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                    isActive
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37]/60 shadow-lg'
                      : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant={usr.role === 'admin' ? 'gold' : usr.role === 'sales_executive' ? 'purple' : usr.role === 'accountant' ? 'emerald' : 'sky'} size="sm">
                      {usr.role.toUpperCase()}
                    </Badge>
                    {isActive && <Check className="w-4 h-4 text-[#f5d97f]" />}
                  </div>

                  <div>
                    <h4 className="font-bold text-zinc-100 text-sm">{usr.name}</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{usr.title}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Security Audit Trail */}
      {activeTab === 'audit' && (
        <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl overflow-hidden text-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-start">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400">
                  <th className="p-4 text-start font-medium">Timestamp</th>
                  <th className="p-4 text-start font-medium">Officer</th>
                  <th className="p-4 text-start font-medium">Action</th>
                  <th className="p-4 text-start font-medium">Entity Reference</th>
                  <th className="p-4 text-start font-medium">Audit Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-4 font-mono text-zinc-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4 font-semibold text-zinc-200">{log.userName}</td>
                    <td className="p-4 font-mono text-[11px] uppercase text-[#f5d97f]">{log.action}</td>
                    <td className="p-4 font-mono text-zinc-400">{log.entityType} ({log.entityId})</td>
                    <td className="p-4 text-zinc-300">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      {resetConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="p-6 rounded-3xl bg-zinc-950 border border-zinc-800 max-w-md w-full space-y-4 shadow-2xl animate-fade-in text-xs">
            <div className="flex items-center gap-3 text-rose-400">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-base font-bold font-display text-zinc-100">Reset Demo State?</h3>
            </div>
            <p className="text-zinc-400">
              This will restore all Customer 360 dossiers, luxury supercars, quotations, lease contracts, and Emirates NBD bank reconciliation items to their original pristine state.
            </p>
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setResetConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={handleResetData}
                className="px-4 py-2 rounded-xl bg-rose-500 text-zinc-950 font-bold hover:bg-rose-400"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
