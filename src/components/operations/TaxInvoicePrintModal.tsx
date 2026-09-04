import React, { useState } from 'react';
import { 
  Printer, ShieldCheck, Download, Check, 
  User, Calendar, DollarSign, X, FileText, Building2, RefreshCw, Landmark
} from 'lucide-react';
import { Invoice } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { formatDate } from '../../lib/dateFormat';
import { downloadElementAsPdf, printElementDirectly } from '../../lib/pdfDownloader';
import { Modal } from '../common/Modal';
import { OfficialLetterheadLayout } from '../common/OfficialLetterheadLayout';
import { CorporateStampMark } from '../common/CorporateStampMark';

interface TaxInvoicePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
}

export const TaxInvoicePrintModal: React.FC<TaxInvoicePrintModalProps> = ({
  isOpen,
  onClose,
  invoice
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useCRM();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);

  const handlePrint = () => {
    printElementDirectly('official-tax-invoice-document', `فاتورة ضريبية رسمية #${invoice.id}`);
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      await downloadElementAsPdf('official-tax-invoice-document', `Splendor-Tax-Invoice-${invoice.id}.pdf`);
      showToast(
        isAr ? 'تم حفظ ملف PDF بنجاح' : 'PDF Saved Successfully',
        isAr ? `تم حفظ الفاتورة الضريبية #${invoice.id} كملف PDF على جهازك.` : `Tax Invoice #${invoice.id} saved as PDF.`
      );
    } catch (err: any) {
      showToast(isAr ? 'فشل تصدير PDF' : 'PDF Export Failed', err.message || 'Error exporting PDF', 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const bankDetails = {
    bankName: 'بنك الإمارات دبي الوطني (Emirates NBD)',
    accountNumber: '1015963340001',
    iban: 'AE220260001015963340001'
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? `فاتورة ضريبية رسمية #${invoice.id}` : `Official Tax Invoice #${invoice.id}`}
      subtitle={isAr ? 'فاتورة ضريبية معتمدة ومتوافقة مع الهيئة الاتحادية للضرائب (FTA UAE)' : 'FTA UAE Compliant Tax Invoice — Splendor Car Rental LLC'}
      maxWidth="4xl"
    >
      <div className="space-y-6 text-zinc-300 font-arabic">
        
        {/* Action Header Bar with Separate Print & Direct PDF Buttons */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-950 border border-zinc-800 no-print">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-4 h-4 text-[#f5d97f]" />
            <span className="font-semibold text-zinc-200">
              {isAr ? 'فاتورة ضريبية رسمية مبنية فوق الترويسة المعتمدة' : 'Official Tax Invoice built on official letterhead'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Dedicated PDF Download Button */}
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-bold text-xs shadow active:scale-95 transition-all disabled:opacity-50"
            >
              {isDownloadingPdf ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#f5d97f]" />
                  <span>{isAr ? 'جاري التصدير...' : 'Exporting...'}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#f5d97f]" />
                  <span>{isAr ? 'حفظ كـ PDF على الجهاز' : 'Save PDF to Device'}</span>
                </>
              )}
            </button>

            {/* Dedicated Print Button */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow hover:brightness-110 active:scale-95 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>{isAr ? 'طباعة الفاتورة' : 'Print Invoice'}</span>
            </button>
          </div>
        </div>

        {/* Printable Document on Official Letterhead */}
        <OfficialLetterheadLayout id="official-tax-invoice-document">
          
          {/* Header Title Box */}
          <div className="flex flex-col sm:flex-row items-center justify-between border-b border-zinc-300 pb-3 gap-3">
            <div className="text-center sm:text-right">
              <h2 className="text-xl sm:text-2xl font-black text-[#991b1b]">
                فاتورة ضريبية / TAX INVOICE
              </h2>
              <p className="text-xs font-bold text-zinc-600 uppercase font-sans tracking-widest">
                FTA COMPLIANT TAX INVOICE
              </p>
            </div>

            <div className="text-center sm:text-left bg-zinc-100 p-2.5 rounded-xl border border-zinc-300">
              <div className="font-mono text-sm font-black text-zinc-950">
                INVOICE #{invoice.id}
              </div>
              <p className="text-[11px] text-zinc-600 font-bold mt-0.5">
                تاريخ الإصدار: {formatDate(invoice.issueDate)}
              </p>
            </div>
          </div>

          {/* Customer Meta & Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-300 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-[#991b1b] font-bold border-b border-zinc-200 pb-1.5">
                <User className="w-3.5 h-3.5" />
                <span>{isAr ? 'العميل المستفيد (Billed To)' : 'BILLED TO (CLIENT)'}</span>
              </div>
              <p className="font-black text-zinc-950 text-sm">{invoice.customerName || 'VIP Client'}</p>
              <p className="text-zinc-600 text-[11px]">
                رقم العقد المرتبط: <strong className="font-mono text-zinc-950">{invoice.contractId || 'Master-Contract'}</strong>
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-300 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-[#991b1b] font-bold border-b border-zinc-200 pb-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>{isAr ? 'حالة السداد والاستحقاق' : 'PAYMENT STATUS'}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-500">تاريخ الاستحقاق:</span>
                <span className="font-bold text-zinc-950">{formatDate(invoice.dueDate || invoice.issueDate)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-500">حالة الفاتورة:</span>
                <span className="font-bold text-emerald-700 uppercase">{invoice.status || 'PAID'}</span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-zinc-400 rounded-lg overflow-hidden text-xs">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="bg-[#6b141a] text-white font-bold">
                  <th className="p-2.5 text-right pr-4 w-1/2">بيان الخدمة / Description</th>
                  <th className="p-2.5">الكمية</th>
                  <th className="p-2.5">السعر قبل الضريبة</th>
                  <th className="p-2.5">ضريبة القيمة المضافة 5%</th>
                  <th className="p-2.5 text-left pl-4">الإجمالي (AED)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-300 text-zinc-900">
                {(invoice.items && invoice.items.length > 0) ? (
                  invoice.items.map((item, idx) => {
                    const itemAmount = item.amount || (item.quantity * item.unitPrice) || 0;
                    const itemVat = Math.round((itemAmount * 0.05) * 100) / 100;
                    const itemTotal = itemAmount + itemVat;
                    return (
                      <tr key={idx} className="hover:bg-zinc-50">
                        <td className="p-3 text-right pr-4 font-bold">{item.description}</td>
                        <td className="p-3 font-mono">{item.quantity}</td>
                        <td className="p-3 font-mono">{(item.unitPrice || 0).toLocaleString()} AED</td>
                        <td className="p-3 font-mono">{itemVat.toLocaleString()} AED</td>
                        <td className="p-3 text-left pl-4 font-mono font-bold">{itemTotal.toLocaleString()} AED</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr className="hover:bg-zinc-50">
                    <td className="p-3 text-right pr-4 font-bold">خدمات تأجير سيارات فارهة وفق العقد المعتمد</td>
                    <td className="p-3 font-mono">1</td>
                    <td className="p-3 font-mono">{(invoice.subtotal || 0).toLocaleString()} AED</td>
                    <td className="p-3 font-mono">{(invoice.vatAmount || 0).toLocaleString()} AED</td>
                    <td className="p-3 text-left pl-4 font-mono font-bold">{(invoice.totalAmount || 0).toLocaleString()} AED</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Financial Totals & Bank Box */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bank Info */}
            <div className="border border-zinc-400 rounded-lg p-3.5 text-xs bg-zinc-50 space-y-2">
              <div className="flex items-center gap-1.5 text-[#991b1b] font-bold">
                <Landmark className="w-4 h-4" />
                <span>بيانات الحساب المصرفي للتحويل:</span>
              </div>
              <div className="text-[11px] space-y-1 text-zinc-700">
                <p><strong>البنك:</strong> {bankDetails.bankName}</p>
                <p><strong>رقم الحساب:</strong> <span className="font-mono font-bold text-zinc-950" dir="ltr">{bankDetails.accountNumber}</span></p>
                <p><strong>الآيبان:</strong> <span className="font-mono font-bold text-[#991b1b]" dir="ltr">{bankDetails.iban}</span></p>
              </div>
            </div>

            {/* Totals Box */}
            <div className="border border-zinc-400 rounded-lg overflow-hidden text-xs">
              <table className="w-full border-collapse">
                <tbody>
                  <tr className="border-b border-zinc-300">
                    <td className="p-2.5 bg-zinc-100 font-bold w-3/5 text-zinc-800">المجموع قبل الضريبة (Subtotal)</td>
                    <td className="p-2.5 text-center font-mono font-bold text-zinc-900">{(invoice.subtotal || 0).toLocaleString()} AED</td>
                  </tr>
                  <tr className="border-b border-zinc-300">
                    <td className="p-2.5 bg-zinc-100 font-bold text-zinc-800">ضريبة القيمة المضافة (5% VAT)</td>
                    <td className="p-2.5 text-center font-mono font-bold text-zinc-900">{(invoice.vatAmount || 0).toLocaleString()} AED</td>
                  </tr>
                  <tr className="bg-[#6b141a] text-white font-bold">
                    <td className="p-2.5">الإجمالي الكلي المستحق (Total Amount)</td>
                    <td className="p-2.5 text-center font-mono text-sm font-black">{(invoice.totalAmount || 0).toLocaleString()} AED</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-zinc-300">
            <div className="space-y-3">
              <p className="font-bold text-zinc-900 text-xs">توقيع المحاسب المعتمد</p>
              <div className="h-12 flex items-end justify-center border-b-2 border-dashed border-zinc-400">
                <span className="text-[10px] text-zinc-500 font-mono">Authorized Accounts Dept.</span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-bold text-zinc-900 text-xs">ختم الشركة المالي</p>
              <div className="h-12 flex items-end justify-center gap-2 border-b-2 border-dashed border-zinc-400">
                <CorporateStampMark className="w-9 h-9 shrink-0" />
                <span className="text-[10px] text-[#991b1b] font-bold">شركة سبلندر لتأجير السيارات ش.ذ.م.م</span>
              </div>
            </div>
          </div>

        </OfficialLetterheadLayout>

      </div>
    </Modal>
  );
};
