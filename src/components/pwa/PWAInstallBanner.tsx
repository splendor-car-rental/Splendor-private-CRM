import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'splendor:pwa-install-dismissed:v1';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export const PWAInstallBanner: React.FC = () => {
  const { language } = useLanguage();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
    if (dismissed) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const handleInstalled = () => {
      window.localStorage.removeItem(DISMISS_KEY);
      setInstallEvent(null);
      setVisible(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
    setInstallEvent(null);
  };

  const install = async () => {
    if (!installEvent || busy) return;
    setBusy(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        window.localStorage.removeItem(DISMISS_KEY);
        setVisible(false);
      }
    } finally {
      setInstallEvent(null);
      setBusy(false);
    }
  };

  if (!visible || !installEvent) return null;

  const isArabic = language === 'ar';

  return (
    <div
      role="region"
      aria-label={isArabic ? 'تثبيت تطبيق سبلندر' : 'Install Splendor app'}
      className="relative z-[45] w-full border-b border-cyan-300/15 bg-zinc-950/95 backdrop-blur-xl shadow-[0_8px_35px_rgba(0,0,0,0.32)]"
    >
      <div className="mx-auto flex min-h-14 w-full items-center gap-3 px-3 py-2.5 sm:px-6 lg:px-8">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-950 ring-2 ring-cyan-300/70 shadow-[0_0_12px_rgba(34,211,238,0.65),0_0_28px_rgba(34,211,238,0.25)]"
          aria-hidden="true"
        >
          <img
            src="/splendor-logo.png"
            alt=""
            className="h-8 w-8 rounded-full object-contain"
            draggable={false}
          />
        </div>

        <div className={`min-w-0 flex-1 ${isArabic ? 'text-right' : 'text-left'}`}>
          <div className="flex items-center gap-2">
            <Smartphone className="hidden h-3.5 w-3.5 shrink-0 text-cyan-300 sm:block" />
            <p className="truncate text-xs font-semibold text-zinc-100 sm:text-sm">
              {isArabic ? 'ثبّت تطبيق سبلندر على جهازك' : 'Install Splendor on your device'}
            </p>
          </div>
          <p className="mt-0.5 hidden text-[10px] leading-4 text-zinc-500 sm:block">
            {isArabic
              ? 'وصول أسرع وتجربة مستقلة بدون فتح المتصفح كل مرة.'
              : 'Faster access with an app-like experience without reopening the browser.'}
          </p>
        </div>

        <button
          type="button"
          onClick={install}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[11px] font-bold text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.14)] transition hover:border-cyan-200/60 hover:bg-cyan-300/15 hover:text-white disabled:cursor-wait disabled:opacity-60 sm:px-3.5"
        >
          <Download className="h-3.5 w-3.5" />
          <span>{isArabic ? (busy ? 'جارٍ التثبيت…' : 'تثبيت التطبيق') : (busy ? 'Installing…' : 'Install App')}</span>
        </button>

        <button
          type="button"
          onClick={dismiss}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
          aria-label={isArabic ? 'إغلاق' : 'Dismiss'}
          title={isArabic ? 'إغلاق' : 'Dismiss'}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
