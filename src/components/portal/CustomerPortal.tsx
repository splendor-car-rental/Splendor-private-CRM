import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, Headphones, LogIn, ShieldCheck, WalletCards } from 'lucide-react';

const SUPPORT_WHATSAPP = 'https://wa.me/971505110410';

type Language = 'en' | 'ar';

export const CustomerPortal: React.FC = () => {
  const [language, setLanguage] = useState<Language>('en');
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const ar = language === 'ar';

  const supportMessage = useMemo(() => {
    const greeting = ar ? 'مرحباً سبلندر، أحتاج الوصول إلى بوابة العملاء.' : 'Hello Splendor, I need access to the customer portal.';
    const details = [name && `${ar ? 'الاسم' : 'Name'}: ${name}`, reference && `${ar ? 'المرجع' : 'Reference'}: ${reference}`].filter(Boolean);
    return encodeURIComponent([greeting, ...details].join('\n'));
  }, [ar, name, reference]);

  const requestAccess = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    window.open(`${SUPPORT_WHATSAPP}?text=${supportMessage}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div dir={ar ? 'rtl' : 'ltr'} className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-cyan-300/20 selection:text-cyan-200">
      <header className="border-b border-zinc-800/70 bg-zinc-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-zinc-950 ring-2 ring-cyan-300/70 shadow-[0_0_15px_rgba(34,211,238,0.55)]">
              <img src="/splendor-logo.png" alt="Splendor" className="h-9 w-9 rounded-full object-contain" />
            </div>
            <div>
              <div className="font-display text-sm font-bold tracking-[0.12em] text-white">SPLENDOR</div>
              <div className="text-[9px] uppercase tracking-[0.24em] text-zinc-500">Customer Portal</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLanguage(ar ? 'en' : 'ar')}
            className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-cyan-300/30 hover:text-cyan-200"
          >
            {ar ? 'English' : 'العربية'}
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-16">
        <section>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            {ar ? 'بوابة عملاء آمنة' : 'Secure customer access'}
          </div>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            {ar ? 'كل ما يخص إيجارك، في مكان واحد.' : 'Everything for your rental, in one place.'}
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
            {ar
              ? 'بوابة مبسطة للعملاء للوصول إلى المستندات، تفاصيل الإيجار، المدفوعات والدعم بعد إصدار صلاحية آمنة من سبلندر.'
              : 'A streamlined customer portal for rental documents, rental details, payments and support after secure access is issued by Splendor.'}
          </p>

          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {[
              { icon: FileText, en: 'Documents', ar: 'المستندات' },
              { icon: WalletCards, en: 'Payments', ar: 'المدفوعات' },
              { icon: Headphones, en: 'Support', ar: 'الدعم' }
            ].map(({ icon: Icon, en, ar: labelAr }) => (
              <div key={en} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/45 p-4">
                <Icon className="h-4 w-4 text-cyan-300" />
                <div className="mt-3 text-xs font-semibold text-zinc-200">{ar ? labelAr : en}</div>
                <div className="mt-1 text-[10px] text-zinc-500">{ar ? 'متاح بعد الدخول الآمن' : 'Available after secure access'}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/55 p-5 shadow-2xl shadow-black/30 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">{ar ? 'Customer Access' : 'Customer Access'}</div>
              <h2 className="mt-2 text-xl font-bold text-white">{ar ? 'طلب الوصول' : 'Request access'}</h2>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200">
              <LogIn className="h-4 w-4" />
            </div>
          </div>

          {submitted ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <h3 className="mt-3 text-sm font-bold text-zinc-100">{ar ? 'تم إرسال طلبك عبر واتساب.' : 'Your request was sent via WhatsApp.'}</h3>
              <p className="mt-2 text-xs leading-6 text-zinc-500">
                {ar ? 'سيتم تزويدك بطريقة الدخول الآمنة بعد التحقق من بياناتك.' : 'You will receive the secure access method after your details are verified.'}
              </p>
              <button type="button" onClick={() => setSubmitted(false)} className="mt-4 text-xs font-semibold text-cyan-200 hover:text-white">
                {ar ? 'إرسال طلب آخر' : 'Send another request'}
              </button>
            </div>
          ) : (
            <form onSubmit={requestAccess} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">{ar ? 'الاسم' : 'Name'}</span>
                <input value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50" placeholder={ar ? 'الاسم الكامل' : 'Full name'} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">{ar ? 'رقم العقد أو المرجع (اختياري)' : 'Contract or reference (optional)'}</span>
                <input value={reference} onChange={e => setReference(e.target.value)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50" placeholder="e.g. SCR-000123" />
              </label>
              <button type="submit" className="group flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-extrabold text-zinc-950 transition hover:bg-cyan-200 active:scale-[0.99]">
                <span>{ar ? 'طلب الوصول الآمن' : 'Request secure access'}</span>
                <ArrowRight className={`h-3.5 w-3.5 transition group-hover:translate-x-0.5 ${ar ? 'rotate-180' : ''}`} />
              </button>
              <p className="text-center text-[10px] leading-5 text-zinc-600">
                {ar ? 'لن يتم عرض بيانات الإيجار في البوابة قبل التحقق من هوية العميل.' : 'Rental data is not exposed until customer identity and access are verified.'}
              </p>
            </form>
          )}
        </section>
      </main>

      <footer className="border-t border-zinc-900 px-5 py-6 text-center text-[10px] text-zinc-600">
        {ar ? 'سبلندر لتأجير السيارات — بوابة العملاء' : 'Splendor Car Rental — Customer Portal'}
      </footer>
    </div>
  );
};
