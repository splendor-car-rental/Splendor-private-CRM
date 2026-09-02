import React, { useState } from 'react';
import { Lock, Mail, AlertCircle, LogOut, Loader2, Check } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { SplendorLogo } from '../common/SplendorLogo';
import splendorLogoImage from '../../assets/splendor-logo.png';

export const AuthLoadingScreen: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-400">
      <SplendorLogo size="lg" />
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
        <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
        <span>{t('authLoadingMessage')}</span>
      </div>
    </div>
  );
};

interface LoginScreenProps {
  onLogin: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  errorKey: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, errorKey }) => {
  const { t, language, direction } = useLanguage();
  const [email, setEmail] = useState(() => localStorage.getItem('splendor_login_email') || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('splendor_remember_device') !== 'false');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || submitting) return;
    setSubmitting(true);
    try {
      if (rememberMe) {
        localStorage.setItem('splendor_login_email', email.trim());
        localStorage.setItem('splendor_remember_device', 'true');
      } else {
        localStorage.removeItem('splendor_login_email');
        localStorage.setItem('splendor_remember_device', 'false');
      }
      await onLogin(email.trim(), password, rememberMe);
    } finally {
      setSubmitting(false);
    }
  };

  const rememberLabel = language === 'ar' ? 'تذكرني على هذا الجهاز' : 'Remember me on this device';
  const securityHint = language === 'ar' ? 'لا يتم حفظ كلمة المرور داخل التطبيق.' : 'Your password is never stored by the CRM.';

  return (
    <div
      dir={direction}
      data-testid="login-scroll-viewport"
      className={`h-[100dvh] min-h-[100dvh] overflow-y-auto overscroll-y-contain bg-zinc-950 ${language === 'ar' ? 'font-arabic' : ''}`}
    >
      {/* Separate scroll viewport from the centering shell: on short screens
          the form starts at the top and remains reachable by wheel/touch;
          on normal screens it is still vertically centered. */}
      <div className="min-h-full w-full flex items-start sm:items-center justify-center p-4 py-6 sm:py-8">
        <div className="w-full max-w-md my-auto">
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <img
              src={splendorLogoImage}
              alt="Splendor Car Rental"
              referrerPolicy="no-referrer"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/splendor-logo.png'; }}
              className="w-full max-w-[240px] drop-shadow-[0_8px_24px_rgba(212,175,55,0.25)] select-none"
            />
          </div>

          <form onSubmit={handleSubmit} className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
            <div>
              <h2 className="text-sm font-bold text-zinc-100">{t('authTitle')}</h2>
              <p className="text-xs text-zinc-400 mt-1">{t('authSubtitle')}</p>
            </div>

            {errorKey && <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{t(errorKey as any)}</span></div>}

            <div>
              <label htmlFor="splendor-login-email" className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('authEmailLabel')}</label>
              <div className="relative"><Mail className="w-4 h-4 text-zinc-500 absolute top-1/2 -translate-y-1/2 start-3" /><input id="splendor-login-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('authEmailPlaceholder')} className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60 focus:ring-1 focus:ring-[#D4AF37]/40" /></div>
            </div>

            <div>
              <label htmlFor="splendor-login-password" className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{t('authPasswordLabel')}</label>
              <div className="relative"><Lock className="w-4 h-4 text-zinc-500 absolute top-1/2 -translate-y-1/2 start-3" /><input id="splendor-login-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('authPasswordPlaceholder')} className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-[#D4AF37]/60 focus:ring-1 focus:ring-[#D4AF37]/40" /></div>
            </div>

            <div className="flex items-start justify-between gap-3 pt-0.5">
              <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="sr-only" />
                <span aria-hidden="true" className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center ${rememberMe ? 'bg-[#D4AF37] border-[#D4AF37] text-zinc-950' : 'bg-zinc-950 border-zinc-700 text-transparent'}`}><Check className="w-3 h-3" strokeWidth={3} /></span>
                <span className="text-xs text-zinc-300 leading-5">{rememberLabel}</span>
              </label>
              <span className="text-[10px] text-zinc-500 text-end leading-4 max-w-[150px]">{securityHint}</span>
            </div>

            <button type="submit" disabled={submitting} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-sm shadow-md shadow-[#D4AF37]/25 hover:brightness-110 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}<span>{submitting ? t('authSigningIn') : t('authSignInButton')}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

interface AccessPendingScreenProps { email: string | null; onSignOut: () => void; }

export const AccessPendingScreen: React.FC<AccessPendingScreenProps> = ({ email, onSignOut }) => {
  const { t, language, direction } = useLanguage();
  return (
    <div dir={direction} className={`h-[100dvh] min-h-[100dvh] overflow-y-auto bg-zinc-950 ${language === 'ar' ? 'font-arabic' : ''}`}>
      <div className="min-h-full flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-md bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto"><AlertCircle className="w-6 h-6 text-amber-400" /></div>
          <h2 className="text-sm font-bold text-zinc-100">{t('authPendingTitle')}</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">{t('authPendingMessage')}</p>
          {email && <p className="text-[11px] text-zinc-500">{t('authPendingSignedInAs')}: <span className="text-zinc-300 font-mono">{email}</span></p>}
          <button onClick={onSignOut} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-800/60"><LogOut className="w-3.5 h-3.5" />{t('authPendingSignOut')}</button>
        </div>
      </div>
    </div>
  );
};
