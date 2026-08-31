import React, { useMemo, useState } from 'react';
import { FileText, LockKeyhole, Printer, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import type { CorporateDocumentKind } from '../../server/corporateDocumentEngine';

const DOCUMENTS: Array<{ kind: CorporateDocumentKind; ar: string; en: string }> = [
  { kind: 'lpo', ar: 'أمر شراء / أمر توريد', en: 'LPO / Purchase Order' },
  { kind: 'credit_note', ar: 'إشعار دائن', en: 'Credit Note' },
  { kind: 'fines_notice', ar: 'إشعار مخالفات ورسوم', en: 'Fines & Charges Notice' },
  { kind: 'debit_note', ar: 'إشعار مدين', en: 'Debit Note' },
  { kind: 'contract_extension', ar: 'ملحق تمديد عقد إيجار', en: 'Contract Extension Addendum' },
  { kind: 'payment_receipt', ar: 'سند قبض', en: 'Payment Receipt' },
  { kind: 'tax_invoice', ar: 'فاتورة ضريبية', en: 'Tax Invoice' },
  { kind: 'simplified_tax_invoice', ar: 'فاتورة ضريبية مبسطة', en: 'Simplified Tax Invoice' },
  { kind: 'official_letter', ar: 'مكاتبة رسمية', en: 'Official Letter' },
  { kind: 'vehicle_record_card', ar: 'بطاقة مركبة', en: 'Vehicle Record Card' },
  { kind: 'vehicle_exit_permit', ar: 'تصريح خروج مركبة خارج الدولة', en: 'Vehicle Exit Permit' }
];

export const CorporateDocumentsView: React.FC = () => {
  const [kind, setKind] = useState<CorporateDocumentKind>('tax_invoice');
  const [customerName, setCustomerName] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [total, setTotal] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = useMemo(() => DOCUMENTS.find(d => d.kind === kind)!, [kind]);

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/corporate-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          customer: { name: customerName },
          vehicle: { name: vehicleName, plateNumber },
          fields: { contractNumber, total },
          body
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Document generation failed.');
      }
      const serial = response.headers.get('X-Document-Serial') || '';
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (!serial) return;
    } catch (err: any) {
      setError(err?.message || 'Document generation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6" dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#D4AF37] text-xs font-mono tracking-[0.2em] uppercase">
            <ShieldCheck className="w-4 h-4" /> Corporate Document Engine
          </div>
          <h1 className="mt-2 text-3xl font-serif-luxury text-zinc-100">مولّد المكاتبات الرسمية</h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-3xl">
            توليد PDF احترافي باستخدام الـLetterhead المعتمد كأصل ثابت غير قابل للتعديل. الرقم التسلسلي يصدر من الخادم ولا يقبل من الواجهة.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-4 py-3 text-xs text-zinc-300">
          <LockKeyhole className="w-4 h-4 text-[#D4AF37]" />
          Header / Footer Immutable
        </div>
      </div>

      <section className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-5">
          <div>
            <label className="block text-xs text-zinc-500 mb-2">نوع المستند</label>
            <select value={kind} onChange={e => setKind(e.target.value as CorporateDocumentKind)} className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3 text-sm text-zinc-200 outline-none focus:border-[#D4AF37]/50">
              {DOCUMENTS.map(d => <option key={d.kind} value={d.kind}>{d.ar} — {d.en}</option>)}
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="اسم العميل" className="input" />
            <input value={vehicleName} onChange={e => setVehicleName(e.target.value)} placeholder="نوع السيارة" className="input" />
            <input value={contractNumber} onChange={e => setContractNumber(e.target.value)} placeholder="رقم العقد" className="input" />
            <input value={plateNumber} onChange={e => setPlateNumber(e.target.value)} placeholder="رقم اللوحة" className="input" />
            <input value={total} onChange={e => setTotal(e.target.value)} placeholder="الإجمالي" className="input" />
          </div>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="النص / الملاحظات الخاصة بالمستند" rows={6} className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3 text-sm text-zinc-200 outline-none focus:border-[#D4AF37]/50 resize-y" />
          {error && <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">{error}</div>}
          <button disabled={busy} onClick={generate} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#8e1118] hover:bg-[#a90f18] disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white transition-colors">
            <Printer className="w-4 h-4" />
            {busy ? 'جاري إنشاء المستند…' : `إنشاء ${selected.ar}`}
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 min-h-[420px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-widest">Preview Contract</div>
              <h2 className="text-lg text-zinc-100 font-semibold">{selected.ar}</h2>
            </div>
            <FileText className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div className="h-[350px] rounded-xl border border-zinc-800 bg-white/5 flex items-center justify-center text-center p-8">
            <div className="space-y-3 max-w-md">
              <LockKeyhole className="w-8 h-8 mx-auto text-[#D4AF37]" />
              <p className="text-sm text-zinc-300">المعاينة النهائية يتم إنتاجها بواسطة Chromium على الخادم فوق الـLetterhead الثابت.</p>
              <p className="text-xs text-zinc-500">لا يتم إعادة رسم أو إعادة كتابة الهيدر أو الفوتر داخل هذا الموديول.</p>
            </div>
          </div>
        </div>
      </section>

      <style>{`.input{width:100%;border-radius:.75rem;background:#09090b;border:1px solid #27272a;padding:.75rem .75rem;color:#e4e4e7;font-size:.875rem;outline:none}.input:focus{border-color:rgba(212,175,55,.5)}`}</style>
    </div>
  );
};
