import React, { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiFetch';
import { uploadFile } from '../../lib/upload';
import { User, UserRole } from '../../types';
import { assignableRoles } from '../../config/permissions';

interface EditStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  staffMember: User | null;
}

/**
 * Admin/CEO-only: edits an existing staff member's profile, including
 * their photo and role, via the server's /api/admin/users/:id endpoint
 * (firebase-admin, so it works even though Firestore rules only let a
 * user write their own profile doc directly).
 */
export const EditStaffModal: React.FC<EditStaffModalProps> = ({ isOpen, onClose, onUpdated, staffMember }) => {
  const { language, t } = useLanguage();
  const { currentUser } = useAuth();
  const ROLES: UserRole[] = assignableRoles(currentUser.role);

  const [name, setName] = useState(staffMember?.name || '');
  const [nameAr, setNameAr] = useState(staffMember?.nameAr || '');
  const [phone, setPhone] = useState(staffMember?.phone || '');
  const [branch, setBranch] = useState(staffMember?.branch || '');
  const [role, setRole] = useState<UserRole>(staffMember?.role || 'sales');
  const [avatar, setAvatar] = useState(staffMember?.avatar || '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-seed local form state whenever a different staff member is opened.
  const lastLoadedId = useRef<string | null>(null);
  if (staffMember && lastLoadedId.current !== staffMember.id) {
    lastLoadedId.current = staffMember.id;
    setName(staffMember.name);
    setNameAr(staffMember.nameAr || '');
    setPhone(staffMember.phone);
    setBranch(staffMember.branch);
    setRole(staffMember.role);
    setAvatar(staffMember.avatar);
  }

  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !staffMember) return;
    setAvatarUploading(true);
    setError(null);
    try {
      const { url } = await uploadFile(file, 'avatars', { targetUserId: staffMember.id });
      setAvatar(url);
    } catch (err: any) {
      setError(err?.message || (language === 'ar' ? 'فشل رفع الصورة.' : 'Failed to upload photo.'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffMember) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/admin/users/${staffMember.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, nameAr, phone, branch, role, avatar })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || (language === 'ar' ? 'تعذر تحديث بيانات الموظف.' : 'Failed to update staff account.'));
      }
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err?.message || (language === 'ar' ? 'تعذر تحديث بيانات الموظف.' : 'Failed to update staff account.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!staffMember) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'ar' ? 'تعديل بيانات الموظف' : 'Edit Staff Member'}
      subtitle={staffMember.email}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleAvatarPick}
            disabled={avatarUploading}
            className="relative w-16 h-16 rounded-2xl shrink-0 group/avatar"
          >
            <img
              src={avatar || '/splendor-logo.jpg'}
              alt={name}
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/splendor-logo.jpg';
              }}
              className="w-16 h-16 rounded-2xl object-cover border border-[#D4AF37]/40"
            />
            <span className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <p className="text-[11px] text-zinc-500">
            {language === 'ar' ? 'اضغط على الصورة لتغييرها' : 'Click the photo to change it'}
            {avatarUploading && ` — ${language === 'ar' ? 'جارِ الرفع...' : 'uploading...'}`}
          </p>
        </div>

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
            {ROLES.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
          </select>
          <p className="text-[11px] text-zinc-500 mt-1">
            {language === 'ar' ? 'يمكنك فقط منح صلاحيات مساوية لصلاحياتك أو أقل.' : 'You can only grant a role at your own level or below.'}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-800/60 transition-colors">
            {t('cancel')}
          </button>
          <button type="submit" disabled={submitting || avatarUploading}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow-md shadow-[#D4AF37]/25 hover:brightness-110 disabled:opacity-60 transition-all">
            {submitting ? (language === 'ar' ? 'جارِ الحفظ...' : 'Saving...') : (language === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
          </button>
        </div>
      </form>
    </Modal>
  );
};
