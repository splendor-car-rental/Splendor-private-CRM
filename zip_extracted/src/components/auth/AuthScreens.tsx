import React, { useState } from 'react';
import { Lock, Mail, AlertCircle, LogOut, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { SplendorLogo } from '../common/SplendorLogo';

/**
 * Full-screen splash shown while Firebase Auth is resolving the current session.
 */
export const AuthLoadingScreen: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-400">
      <SplendorLogo size="lg" />
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
        <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
        <span>{t('authLoadingMessage')}</span>
      </div>
    </div>
  );
};

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  errorKey: string | null;
}

/**
 * Real email/password sign-in screen backed by Firebase Authentication.
 * Replaces the previous no-auth "default user" flow.
 */
export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, errorKey }) => {
  const { t, language, direction } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || submitting) return;
    setSubmitting(true);
    try {
      await onLogin(email.trim(), password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir={direction} className={`min-h-screen bg-zinc-950 flex items-center justify-center p-4 ${language === 'ar' ? 'font-arabic' : ''}`}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <SplendorLogo size="lg" className="mb-4" />
          <h1 className="font-serif text-lg tracking-wide text-[#f5d97f] uppercase font-bold text-center">
            {t('brandName')}
          </h1>
          <p className="text-[11px] text-zinc-500 tracking-wider mt-1 text-center">{t('brandSub')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5"
        >
          <div>
            <h2 className="text-sm font-bold text-zinc-100">{t('authTitle')}</h2>
            <p className="text-xs text-zinc-400 mt-1">{t('authSubtitle')}</p>
          </div>

          {errorKey && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t(errorKey as any)}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              {t('authEmailLabel')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('authEmailPlaceholder')}
                className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60 focus:ring-1 focus:ring-[#D4AF37]/40 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              {t('authPasswordLabel')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('authPasswordPlaceholder')}
                className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60 focus:ring-1 focus:ring-[#D4AF37]/40 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-sm shadow-md shadow-[#D4AF37]/25 hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{submitting ? t('authSigningIn') : t('authSignInButton')}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

interface AccessPendingScreenProps {
  email: string | null;
  onSignOut: () => void;
}

/**
 * Shown when Firebase Auth succeeded but no Firestore user profile exists
 * for this account (i.e. an administrator has not provisioned it yet).
 * Prevents unknown authenticated accounts from silently getting default access.
 */
export const AccessPendingScreen: React.FC<AccessPendingScreenProps> = ({ email, onSignOut }) => {
  const { t, language, direction } = useLanguage();
  return (
    <div dir={direction} className={`min-h-screen bg-zinc-950 flex items-center justify-center p-4 ${language === 'ar' ? 'font-arabic' : ''}`}>
      <div className="w-full max-w-md bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="text-sm font-bold text-zinc-100">{t('authPendingTitle')}</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">{t('authPendingMessage')}</p>
        {email && (
          <p className="text-[11px] text-zinc-500">
            {t('authPendingSignedInAs')}: <span className="text-zinc-300 font-mono">{email}</span>
          </p>
        )}
        <button
          onClick={onSignOut}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-800/60 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          {t('authPendingSignOut')}
        </button>
      </div>
    </div>
  );
};
