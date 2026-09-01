import React, { useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';

const REPOSITORY_RAW_ROOT = 'https://raw.githubusercontent.com/splendor-car-rental/Splendor-private-CRM/main/docs/approved-forms/';

const APPROVED_FORMS = [
  'BILL BOOK A4 rental.pdf',
  'SPLENDOR_Letter-head.pdf',
  'إشعار مخالفات ورسوم.pdf',
  'إشعار مدين.pdf',
  'إنذار بالسداد.pdf',
  'بطاقة مركبة.pdf',
  'تصريح خروج مركبة.pdf',
  'جدول تجديد وثائق الأسطول.pdf',
  'خطاب رسمي.pdf',
  'سند قبض.pdf',
  'فاتورة ضريبية مبسطة.pdf',
  'فاتورة ضريبية.pdf',
  'كشف حساب ..pdf',
  'كشف حساب ٢٠٢٦٢٠.pdf',
  'مطالبة أضرار.pdf',
  'ملحق تمديد عقد.pdf',
] as const;

const displayName = (fileName: string) => fileName.replace(/\.pdf$/i, '');

export const ApprovedFormsLibrary: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const forms = useMemo(
    () => APPROVED_FORMS.map((name) => ({
      name,
      url: `${REPOSITORY_RAW_ROOT}${encodeURIComponent(name)}`,
    })),
    [],
  );

  const selectedForm = forms.find((form) => form.name === selected) ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-[70] inline-flex items-center gap-2 rounded-2xl border border-sky-400/30 bg-slate-950/95 px-4 py-3 text-xs font-black text-sky-200 shadow-[0_12px_40px_-14px_rgba(0,174,239,.65)] backdrop-blur-xl transition hover:border-sky-300/60 hover:bg-sky-950/80"
        aria-label="فتح النماذج المعتمدة"
      >
        <FileText className="h-4 w-4 text-sky-400" />
        <span>النماذج المعتمدة</span>
        <span className="rounded-full bg-sky-400/10 px-1.5 py-0.5 text-[10px] text-sky-300">16</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-md">
          <div className="flex h-[min(92vh,900px)] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-3xl border border-sky-400/20 bg-zinc-950 shadow-2xl shadow-sky-950/30">
            <div className="flex items-center justify-between gap-3 border-b border-sky-400/10 bg-zinc-950/95 px-5 py-4">
              <div>
                <div className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-sky-400">Splendor Official Library</div>
                <h2 className="text-lg font-black text-white">النماذج المعتمدة</h2>
                <p className="text-xs text-zinc-400">16 نموذجًا رسميًا محفوظًا كمرجع معتمد للطباعة والمطابقة.</p>
              </div>
              <button
                type="button"
                onClick={() => { setOpen(false); setSelected(null); }}
                className="rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-zinc-300 transition hover:border-sky-400/40 hover:text-sky-300"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[330px_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto border-b border-sky-400/10 p-3 md:border-b-0 md:border-l md:border-sky-400/10">
                <div className="space-y-2">
                  {forms.map((form, index) => (
                    <button
                      key={form.name}
                      type="button"
                      onClick={() => setSelected(form.name)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-right transition ${selected === form.name ? 'border-sky-400/40 bg-sky-400/10 text-sky-100' : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-sky-400/25 hover:bg-sky-400/5'}`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 text-[10px] font-black text-sky-300">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-bold">{displayName(form.name)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 bg-zinc-900/40 p-3 md:p-5">
                {selectedForm ? (
                  <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-400/10 bg-zinc-950/80 p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-white">{displayName(selectedForm.name)}</div>
                        <div className="text-[10px] text-zinc-500">النموذج الرسمي المعتمد</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <a href={selectedForm.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-black text-sky-200 hover:bg-sky-400/20">
                          <ExternalLink className="h-4 w-4" /> فتح
                        </a>
                        <a href={selectedForm.url} download={selectedForm.name} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-black text-slate-950 hover:bg-sky-400">
                          <Download className="h-4 w-4" /> حفظ
                        </a>
                      </div>
                    </div>
                    <iframe
                      title={displayName(selectedForm.name)}
                      src={selectedForm.url}
                      className="min-h-0 w-full flex-1 rounded-2xl border border-zinc-800 bg-white"
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-sky-400/15 bg-zinc-950/40 text-center">
                    <div>
                      <FileText className="mx-auto mb-3 h-10 w-10 text-sky-400/50" />
                      <div className="text-sm font-black text-zinc-200">اختر نموذجًا لعرضه</div>
                      <div className="mt-1 text-xs text-zinc-500">النماذج الـ16 محفوظة في المستودع كمرجع رسمي.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
