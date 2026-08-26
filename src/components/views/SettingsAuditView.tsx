import React, { useState } from 'react';
import {
  Settings, Shield, Users, History,
  Check, Sparkles, Building, UserPlus2
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { AddStaffModal } from '../auth/AddStaffModal';

const ROLE_BADGE_VARIANT: Record<string, 'gold' | 'purple' | 'emerald' | 'sky' | 'zinc'> = {
  ceo: 'gold',
  admin: 'gold',
  sales: 'purple',
  fleet: 'sky',
  finance: 'emerald',
  operations: 'zinc'
};

export const SettingsAuditView: React.FC = () => {
  const { language, t } = useLanguage();
  const { currentUser, staffDirectory } = useAuth();
  const { auditLogs, showToast } = useCRM();

  const [activeTab, setActiveTab] = useState<'general' | 'roles' | 'audit'>('general');
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const isAdmin = currentUser.role === 'ceo' || currentUser.role === 'admin';

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

        {isAdmin && (
          <button
            onClick={() => setAddStaffOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 text-xs font-bold shadow-md shadow-[#D4AF37]/25 hover:brightness-110 transition-all"
          >
            <UserPlus2 className="w-3.5 h-3.5" />
            <span>{t('addStaffButton')}</span>
          </button>
        )}
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
          {t('staffDirectory')}
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

      {/* Tab 2: Staff Directory (read-only) */}
      {activeTab === 'roles' && (
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-6 text-xs">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">{t('staffDirectory')}</h3>
            <p className="text-zinc-400 text-xs mt-0.5">{t('staffDirectorySubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {staffDirectory.map(usr => {
              const isSelf = currentUser.id === usr.id;
              return (
                <div
                  key={usr.id}
                  className={`p-4 rounded-2xl border space-y-2 ${
                    isSelf
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37]/60 shadow-lg'
                      : 'bg-zinc-950/60 border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant={ROLE_BADGE_VARIANT[usr.role] || 'zinc'} size="sm">
                      {(usr.role || '').toUpperCase()}
                    </Badge>
                    {isSelf && <Check className="w-4 h-4 text-[#f5d97f]" />}
                  </div>

                  <div>
                    <h4 className="font-bold text-zinc-100 text-sm">
                      {language === 'ar' && usr.nameAr ? usr.nameAr : usr.name}
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{usr.email}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{usr.branch}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {!isAdmin && (
            <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-400">
              {t('adminOnlyStaffNotice')}
            </div>
          )}
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

      <AddStaffModal
        isOpen={addStaffOpen}
        onClose={() => setAddStaffOpen(false)}
        onCreated={() => showToast(t('addStaffButton'), t('staffCreatedSuccess'), 'success')}
      />
    </div>
  );
};
