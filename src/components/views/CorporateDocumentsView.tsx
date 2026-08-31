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
  { kind: 'vehicle_exit_permit', ar: 'تصريح خروج مركبة خارج الدولة', en: 'Vehicle Exit Permit' },
  { kind: 'account_statement', ar: 'كشف حساب', en: 'Account Statement' },
  { kind: 'quotation', ar: 'عرض سعر', en: 'Quotation' }
];

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = props => <input {...props} className="input" />;

export const CorporateDocumentsView: React.FC = () => {
  const [kind, setKind] = useState<CorporateDocumentKind>('tax_invoice');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [date, setDate] = useState('');
  const [asOfDate, setAsOfDate] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [totalDue, setTotalDue] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [baseTotal, setBaseTotal] = useState('');
  const [extraServicesTotal, setExtraServicesTotal] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [grandTotal, setGrandTotal] = useState('');
  const [securityDeposit, setSecurityDeposit] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = useMemo(() => DOCUMENTS.find(d => d.kind === kind)!, [kind]);
  const isStatement = kind === 'account_statement';
  const isQuotation = kind === 'quotation';

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const rows = isStatement
        ? [{ no: 1, date: date || '—', description: body || 'حركة على حساب العميل', debit: totalDue || '0', credit: '0', balance: totalDue || '0' }]
        : isQuotation
          ? [{ no: 1, description: vehicleName || 'Rental Vehicle', quantity: durationDays || '1', unitPrice: baseTotal || '0', total: subtotal || baseTotal || '0' }]
          : [];

      const response = await apiFetch('/api/corporate-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          date,
          customer: { name: customerName, phone: customerPhone, email: customerEmail },
          vehicle: { name: vehicleName, plateNumber },
          fields: {
            contractNumber,
            asOfDate,
            contractDate,
            startDate,
            endDate,
            durationDays,
            validUntil,
            totalDue,
            receiptNumber,
            baseTotal,
            extraServicesTotal,
            discountAmount,
            subtotal,
            vatAmount,
            grandTotal,
            securityDeposit,
            total: grandTotal || totalDue || subtotal
          },
          rows,
          body: isStatement ? '' : body
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Document generation failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
            مستندات PDF رسمية فوق الـLetterhead المعتمد. تم اعتماد كشف الحساب وعرض السعر بنفس منطق الجداول والهوية الأصلية، مع بقاء الهيدر والفوتر أصلًا ثابتًا غير قابل للتعديل.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-4 py-3 text-xs text-zinc-300">
          <LockKeyhole className="w-4 h-4 text-[#D4AF37]" /> Header / Footer Immutable
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
            <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="اسم العميل" />
            {(isQuotation) && <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="رقم الهاتف" />}
            {(isQuotation) && <Input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="البريد الإلكتروني" />}
            <Input value={vehicleName} onChange={e => setVehicleName(e.target.value)} placeholder="نوع السيارة" />
            <Input value={plateNumber} onChange={e => setPlateNumber(e.target.value)} placeholder="رقم اللوحة" />
            <Input value={contractNumber} onChange={e => setContractNumber(e.target.value)} placeholder="رقم العقد" />

            {isStatement && <>
              <Input value={contractDate} onChange={e => setContractDate(e.target.value)} placeholder="تاريخ العقد" />
              <Input value={asOfDate} onChange={e => setAsOfDate(e.target.value)} placeholder="حتى تاريخ" />
              <Input value={totalDue} onChange={e => setTotalDue(e.target.value)} placeholder="إجمالي المبلغ المستحق" />
              <Input value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="رقم إيصال" />
              <Input value={date} onChange={e => setDate(e.target.value)} placeholder="تاريخ الحركة" />
            </>}

            {isQuotation && <>
              <Input value={startDate} onChange={e => setStartDate(e.target.value)} placeholder="تاريخ ووقت الاستلام" />
              <Input value={endDate} onChange={e => setEndDate(e.target.value)} placeholder="تاريخ ووقت التسليم" />
              <Input value={durationDays} onChange={e => setDurationDays(e.target.value)} placeholder="مدة الإيجار بالأيام" />
              <Input value={validUntil} onChange={e => setValidUntil(e.target.value)} placeholder="صلاحية العرض حتى" />
              <Input value={baseTotal} onChange={e => setBaseTotal(e.target.value)} placeholder="قيمة الإيجار الأساسية" />
              <Input value={extraServicesTotal} onChange={e => setExtraServicesTotal(e.target.value)} placeholder="الخدمات الإضافية" />
              <Input value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} placeholder="الخصم" />
              <Input value={subtotal} onChange={e => setSubtotal(e.target.value)} placeholder="الإجمالي قبل الضريبة" />
              <Input value={vatAmount} onChange={e => setVatAmount(e.target.value)} placeholder="ضريبة القيمة المضافة 5%" />
              <Input value={grandTotal} onChange={e => setGrandTotal(e.target.value)} placeholder="الإجمالي النهائي" />
              <Input value={securityDeposit} onChange={e => setSecurityDeposit(e.target.value)} placeholder="مبلغ التأمين" />
              <Input value={date} onChange={e => setDate(e.target.value)} placeholder="تاريخ العرض" />
            </>}

            {!isStatement && !isQuotation && <Input value={grandTotal} onChange={e => setGrandTotal(e.target.value)} placeholder="الإجمالي" />}
          </div>

          {isStatement && <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="وصف حركة كشف الحساب / البيان" rows={4} className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3 text-sm text-zinc-200 outline-none focus:border-[#D4AF37]/50 resize-y" />}
          {isQuotation && <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="الشروط والملاحظات الخاصة بعرض السعر" rows={5} className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3 text-sm text-zinc-200 outline-none focus:border-[#D4AF37]/50 resize-y" />}
          {!isStatement && !isQuotation && <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="النص / الملاحظات الخاصة بالمستند" rows={6} className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3 text-sm text-zinc-200 outline-none focus:border-[#D4AF37]/50 resize-y" />}

          {error && <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">{error}</div>}
          <button disabled={busy} onClick={generate} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#8e1118] hover:bg-[#a90f18] disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white transition-colors">
            <Printer className="w-4 h-4" />
            {busy ? 'جاري إنشاء المستند…' : `إنشاء ${selected.ar}`}
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 min-h-[420px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-widest">Preview</div>
              <h2 className="text-lg text-zinc-100 font-semibold">{selected.ar}</h2>
            </div>
            <FileText className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div className="h-[350px] rounded-xl border border-zinc-800 bg-white/5 flex items-center justify-center text-center p-8">
            <div className="space-y-3 max-w-md">
              <LockKeyhole className="w-8 h-8 mx-auto text-[#D4AF37]" />
              <p className="text-sm text-zinc-300">المعاينة النهائية يتم إنتاجها بواسطة Chromium على الخادم فوق الـLetterhead الثابت.</p>
              <p className="text-xs text-zinc-500">كشف الحساب يحافظ على جدول: التاريخ، البيان، مستحق (مدين)، مدفوع (دائن)، الرصيد، مع صندوق إجمالي المبلغ المستحق والملاحظات.</p>
              <p className="text-xs text-zinc-500">عرض السعر يحافظ على منطق بيانات العميل والمركبة، تفاصيل التسعير، الخصم، VAT 5%، التأمين، والإجمالي النهائي.</p>
            </div>
          </div>
        </div>
      </section>

      <style>{`.input{width:100%;border-radius:.75rem;background:#09090b;border:1px solid #27272a;padding:.75rem;color:#e4e4e7;font-size:.875rem;outline:none}.input:focus{border-color:rgba(212,175,55,.5)}`}</style>
    </div>
  );
};
