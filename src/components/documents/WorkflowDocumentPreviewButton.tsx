import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Eye, Loader2, Printer, ShieldCheck, X } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useLanguage } from '../../context/LanguageContext';
import type { CorporateDocumentKind } from '../../server/corporateDocumentEngine';
import type { ContextualDocumentSource } from '../../server/contextualDocumentService';

type Props = {
  kind: CorporateDocumentKind;
  source: ContextualDocumentSource;
  labelAr: string;
  labelEn?: string;
  className?: string;
  disabled?: boolean;
};

export const WorkflowDocumentPreviewButton: React.FC<Props> = ({ kind, source, labelAr, labelEn, className, disabled }) => {
  const { language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('document.pdf');
  const [serial, setSerial] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [issued, setIssued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const replaceBlob = async (response: Response) => {
    const nextSerial = response.headers.get('X-Document-Serial') || kind;
    const nextArchive = response.headers.get('X-Document-Archive-Id');
    const blob = await response.blob();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSerial(nextSerial);
    setArchiveId(nextArchive);
    setFileName(`Splendor-${nextSerial}.pdf`);
    setPreviewUrl(URL.createObjectURL(blob));
  };

  const requestPdf = async (mode: 'preview' | 'issue') => {
    const response = await apiFetch(`/api/corporate-documents/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, source })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || `Document ${mode} failed (${response.status}).`);
    }
    await replaceBlob(response);
    return response;
  };

  const preview = async () => {
    setBusy(true);
    setError(null);
    setIssued(false);
    setArchiveId(null);
    try {
      await requestPdf('preview');
    } catch (cause: any) {
      setError(cause?.message || 'تعذر إنشاء المعاينة من بيانات السجل الفعلية.');
    } finally {
      setBusy(false);
    }
  };

  const issue = async () => {
    setIssuing(true);
    setError(null);
    try {
      const response = await requestPdf('issue');
      setIssued(response.headers.get('X-Document-Archived') === 'true');
    } catch (cause: any) {
      setError(cause?.message || 'تعذر اعتماد وأرشفة المستند. لم يتم اعتباره صادراً.');
    } finally {
      setIssuing(false);
    }
  };

  const close = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSerial(null);
    setArchiveId(null);
    setIssued(false);
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void preview()}
        disabled={disabled || busy}
        className={className || 'inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-50'}
        title={language === 'ar' ? 'معاينة النموذج الرسمي من بيانات السجل الفعلية دون إصدار رقم جديد' : 'Preview the official master from authoritative record data without issuing a new serial'}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
        <span>{language === 'ar' ? labelAr : (labelEn || labelAr)}</span>
      </button>

      {error && <div role="alert" className="fixed bottom-6 left-1/2 z-[170] max-w-[90vw] -translate-x-1/2 rounded-2xl border border-rose-500/40 bg-zinc-950 px-4 py-3 text-xs font-semibold text-rose-300 shadow-2xl">{error}</div>}

      {previewUrl && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/88 p-3 backdrop-blur-md">
          <div className="flex h-[95vh] w-[min(1120px,98vw)] flex-col overflow-hidden rounded-3xl border border-sky-500/30 bg-zinc-950 shadow-2xl shadow-sky-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-500/20 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-white">
                  {issued ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <ShieldCheck className="h-4 w-4 text-sky-400" />}
                  {issued
                    ? (language === 'ar' ? 'النسخة الرسمية الصادرة والمؤرشفة' : 'Issued & Archived Official Document')
                    : (language === 'ar' ? 'معاينة قبل الاعتماد والإصدار' : 'Preview Before Approval & Issue')}
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">
                  {serial ? `${language === 'ar' ? 'الرقم المرجعي' : 'Reference'}: ${serial}` : ''}
                  {archiveId ? ` • ${language === 'ar' ? 'معرّف الأرشيف' : 'Archive'}: ${archiveId.slice(0, 12)}…` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!issued && (
                  <button type="button" disabled={issuing} onClick={() => void issue()} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-emerald-950 disabled:opacity-50">
                    {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {language === 'ar' ? 'اعتماد وإصدار وأرشفة' : 'Approve, Issue & Archive'}
                  </button>
                )}
                {issued && <a href={previewUrl} download={fileName} className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-200"><Download className="h-4 w-4" />{language === 'ar' ? 'حفظ PDF' : 'Save PDF'}</a>}
                {issued && <button type="button" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-black text-slate-950"><Printer className="h-4 w-4" />{language === 'ar' ? 'فتح للطباعة' : 'Print'}</button>}
                <button type="button" onClick={close} className="rounded-xl border border-zinc-700 p-2 text-zinc-300"><X className="h-4 w-4" /></button>
              </div>
            </div>
            {!issued && <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-[11px] font-semibold text-amber-300">{language === 'ar' ? 'هذه معاينة فقط. لا يمكن الحفظ أو الطباعة كنسخة رسمية قبل الضغط على «اعتماد وإصدار وأرشفة».' : 'Preview only. Save/print is enabled only after the immutable issued copy is archived.'}</div>}
            <iframe title="Approved document preview" src={previewUrl} className="min-h-0 flex-1 bg-white" />
          </div>
        </div>
      )}
    </>
  );
};
