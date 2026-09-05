import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Loader2, KeyRound, Copy, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useLanguage } from '../../context/LanguageContext';

async function callApi<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `فشل الطلب (${res.status}).`);
  return data as T;
}

/**
 * Self-service TOTP 2FA enrollment for the currently signed-in ceo/admin
 * account -- see src/server/mfa.ts. There is deliberately no way here to
 * manage another user's 2FA: enabling/disabling always operates on the
 * caller's own account (the server routes derive the actor from the
 * Authorization token, never from a request body).
 */
export const MfaSettingsPanel: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setup flow state
  const [setupData, setSetupData] = useState<{ otpauthUrl: string; qrCodeDataUrl: string; secret: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Disable flow state
  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [disableModalOpen, setDisableModalOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const status = await callApi<{ enabled: boolean }>('/api/mfa/status', 'GET');
      setEnabled(status.enabled);
    } catch (e: any) {
      setError(e?.message || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const startSetup = async () => {
    setError(null);
    try {
      const data = await callApi<{ otpauthUrl: string; qrCodeDataUrl: string; secret: string }>('/api/mfa/setup', 'POST');
      setSetupData(data);
    } catch (e: any) {
      setError(e?.message || (isAr ? 'تعذر بدء الإعداد.' : 'Could not start setup.'));
    }
  };

  const confirmSetup = async () => {
    if (!confirmCode.trim()) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await callApi<{ recoveryCodes: string[] }>('/api/mfa/confirm', 'POST', { code: confirmCode.trim() });
      setRecoveryCodes(result.recoveryCodes);
      setSetupData(null);
      setConfirmCode('');
      setEnabled(true);
    } catch (e: any) {
      setError(e?.message || (isAr ? 'رمز غير صحيح.' : 'Invalid code.'));
    } finally {
      setConfirming(false);
    }
  };

  const disable = async () => {
    if (!disableCode.trim()) return;
    setDisabling(true);
    setError(null);
    try {
      await callApi('/api/mfa/disable', 'POST', { code: disableCode.trim() });
      setEnabled(false);
      setDisableModalOpen(false);
      setDisableCode('');
    } catch (e: any) {
      setError(e?.message || (isAr ? 'تعذر إلغاء التفعيل.' : 'Could not disable.'));
    } finally {
      setDisabling(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-zinc-500 text-xs py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> {isAr ? 'جارِ التحميل...' : 'Loading...'}</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
      <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
        <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm">
          <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
          <span>{isAr ? 'المصادقة الثنائية (2FA)' : 'Two-Factor Authentication (2FA)'}</span>
        </div>
        <p className="text-zinc-400 leading-relaxed">
          {isAr
            ? 'طبقة حماية إضافية لحسابك الشخصي: بعد كلمة المرور، يُطلب منك رمز مؤقت من تطبيق مصادقة (مثل Google Authenticator) عند تسجيل الدخول.'
            : 'An extra layer of protection for your own account: after your password, you\'ll be asked for a one-time code from an authenticator app (e.g. Google Authenticator) at sign-in.'}
        </p>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {enabled && !setupData && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300">
            <span className="font-semibold">{isAr ? 'مفعّلة على حسابك' : 'Enabled on your account'}</span>
            <button
              onClick={() => setDisableModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 transition-colors font-semibold"
            >
              <ShieldOff className="w-3.5 h-3.5" /> {isAr ? 'إلغاء التفعيل' : 'Disable'}
            </button>
          </div>
        )}

        {!enabled && !setupData && (
          <button
            onClick={startSetup}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold shadow-md shadow-[#D4AF37]/25 hover:brightness-110 transition-all"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> {isAr ? 'تفعيل المصادقة الثنائية' : 'Enable 2FA'}
          </button>
        )}

        {setupData && (
          <div className="space-y-3">
            <p className="text-zinc-400">{isAr ? '1. امسح هذا الرمز بتطبيق المصادقة:' : '1. Scan this code with your authenticator app:'}</p>
            <img src={setupData.qrCodeDataUrl} alt="QR" className="w-40 h-40 rounded-xl border border-zinc-800 mx-auto" />
            <div className="flex items-center gap-2 justify-center">
              <code dir="ltr" className="text-[11px] text-zinc-400 font-mono">{setupData.secret}</code>
              <button onClick={() => navigator.clipboard.writeText(setupData.secret)} className="text-zinc-500 hover:text-zinc-300">
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <p className="text-zinc-400">{isAr ? '2. أدخل الرمز المكوّن من 6 أرقام للتأكيد:' : '2. Enter the 6-digit code to confirm:'}</p>
            <div className="flex items-center gap-2">
              <input
                type="text" dir="ltr" inputMode="numeric" value={confirmCode}
                onChange={e => setConfirmCode(e.target.value)}
                placeholder="123456"
                className="flex-1 text-center tracking-[0.3em] px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:border-[#D4AF37]/60"
              />
              <button
                onClick={confirmSetup}
                disabled={confirming}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold disabled:opacity-50"
              >
                {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (isAr ? 'تأكيد' : 'Confirm')}
              </button>
            </div>
            <button onClick={() => setSetupData(null)} className="text-zinc-500 hover:text-zinc-300 text-[11px]">{isAr ? 'إلغاء' : 'Cancel'}</button>
          </div>
        )}
      </div>

      {recoveryCodes && (
        <div className="p-6 rounded-3xl bg-amber-950/20 border border-amber-500/30 space-y-3">
          <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
            <KeyRound className="w-4 h-4" />
            <span>{isAr ? 'رموز الاسترداد -- احفظها الآن' : 'Recovery Codes -- Save Them Now'}</span>
          </div>
          <p className="text-amber-200/80 leading-relaxed">
            {isAr
              ? 'هذه الرموز تظهر مرة واحدة فقط. احفظها في مكان آمن -- كل رمز يُستخدم مرة واحدة لتسجيل الدخول إذا فقدت جهاز المصادقة.'
              : 'These codes are shown only once. Save them somewhere safe -- each one can be used once to sign in if you lose your authenticator device.'}
          </p>
          <div dir="ltr" className="grid grid-cols-2 gap-2 font-mono text-zinc-200">
            {recoveryCodes.map(code => (
              <div key={code} className="px-3 py-2 rounded-lg bg-zinc-950/60 border border-zinc-800 text-center">{code}</div>
            ))}
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(recoveryCodes.join('\n'))}
            className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 text-[11px]"
          >
            <Copy className="w-3 h-3" /> {isAr ? 'نسخ الكل' : 'Copy all'}
          </button>
          <button
            onClick={() => setRecoveryCodes(null)}
            className="w-full py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 font-semibold hover:bg-amber-500/30 transition-colors"
          >
            {isAr ? 'حفظتها -- إغلاق' : 'I\'ve saved them -- Close'}
          </button>
        </div>
      )}

      {disableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDisableModalOpen(false)}>
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-zinc-100 font-bold text-sm">{isAr ? 'إلغاء تفعيل المصادقة الثنائية' : 'Disable Two-Factor Authentication'}</h3>
            <p className="text-zinc-400">{isAr ? 'أدخل رمزاً حالياً من تطبيق المصادقة أو رمز استرداد للتأكيد.' : 'Enter a current code from your authenticator app, or a recovery code, to confirm.'}</p>
            <input
              type="text" dir="ltr" value={disableCode} onChange={e => setDisableCode(e.target.value)}
              placeholder="123456"
              className="w-full text-center tracking-[0.3em] px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:border-rose-500/60"
            />
            <div className="flex gap-2">
              <button onClick={() => setDisableModalOpen(false)} className="flex-1 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:bg-zinc-800/60">{isAr ? 'إلغاء' : 'Cancel'}</button>
              <button onClick={disable} disabled={disabling} className="flex-1 py-2 rounded-xl bg-rose-600 text-white font-semibold disabled:opacity-50">
                {disabling ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : (isAr ? 'إلغاء التفعيل' : 'Disable')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
