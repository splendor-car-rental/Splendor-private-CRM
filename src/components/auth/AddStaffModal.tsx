import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { useLanguage } from '../../context/LanguageContext';
import { apiFetch } from '../../lib/apiFetch';
import { UserRole } from '../../types';

interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ROLES: UserRole[] = ['ceo', 'admin', 'operations', 'sales', 'finance', 'fleet'];

/**
 * Admin/CEO-only: creates a real staff login (Firebase Authentication +
 * Firestore profile) via the server's /api/admin/users endpoint. Replaces
 * the previous approach where new staff could only be added by editing
 * source code.
 */
export const AddStaffModal: React.FC<AddStaffModalProps> = ({ isOpen, onClose, onCreated }) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName(''); setNameAr(''); setEmail(''); setPhone(''); setBranch('');
    setRole('sales'); setPassword(''); setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, nameAr, email, phone, branch, role, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || t('staffCreateError'));
      }
      onCreated();
      handleClose();
    } catch (err: any) {
      setError(err?.message || t('staffCreateError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('addStaffTitle')} subtitle={t('addStaffSubtitle')} maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('staffFieldName')}</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('staffFieldNameAr')}</label>
            <input value={nameAr} onChange={e => setNameAr(e.target.value)} dir="rtl"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60" />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('staffFieldEmail')}</label>
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('staffFieldPhone')}</label>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('staffFieldBranch')}</label>
            <input value={branch} onChange={e => setBranch(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60" />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('staffFieldRole')}</label>
          <select value={role} onChange={e => setRole(e.target.value as UserRole)}
            className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60">
            {ROLES.map(r => <option key={r} value={r}>{(r || '').toUpperCase()}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('staffFieldTempPassword')}</label>
          <input required type="text" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm font-mono focus:outline-none focus:border-[#D4AF37]/60" />
          <p className="text-[11px] text-zinc-500 mt-1">{t('staffFieldTempPasswordHint')}</p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={handleClose}
            className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-800/60 transition-colors">
            {t('cancel')}
          </button>
          <button type="submit" disabled={submitting}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow-md shadow-[#D4AF37]/25 hover:brightness-110 disabled:opacity-60 transition-all">
            {submitting ? t('creatingAccount') : t('createAccount')}
          </button>
        </div>
      </form>
    </Modal>
  );
};
