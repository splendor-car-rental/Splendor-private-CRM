import React, { useState } from 'react';
import { updatePassword } from 'firebase/auth';
import { Modal } from '../common/Modal';
import { useLanguage } from '../../context/LanguageContext';
import { auth } from '../../firebase/config';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Lets the signed-in user set their own new password -- needed because
 * admin-created accounts start with a temporary password (see
 * AddStaffModal) that employees should change after their first login.
 */
export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleClose = () => {
    setNewPassword(''); setConfirmPassword(''); setError(null); setSuccess(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      if (!auth.currentUser) throw new Error('Not signed in.');
      await updatePassword(auth.currentUser, newPassword);
      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      if (err?.code === 'auth/requires-recent-login') {
        setError(t('passwordChangeReauthError'));
      } else {
        setError(err?.message || t('passwordChangeReauthError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('changePasswordTitle')} subtitle={t('changePasswordSubtitle')} maxWidth="sm">
      {success ? (
        <div className="text-center space-y-4 py-4">
          <p className="text-sm text-emerald-300">{t('passwordChangedSuccess')}</p>
          <button onClick={handleClose}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs">
            {t('ok')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('newPasswordLabel')}</label>
            <input required type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('confirmPasswordLabel')}</label>
            <input required type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60" />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-800/60 transition-colors">
              {t('cancel')}
            </button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow-md shadow-[#D4AF37]/25 hover:brightness-110 disabled:opacity-60 transition-all">
              {submitting ? t('savingPassword') : t('savePassword')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
