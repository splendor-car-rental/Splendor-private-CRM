import React, { useState } from 'react';
import { 
  Printer, ShieldCheck, Download, Check, 
  User, Calendar, DollarSign, X, FileText, Building2, RefreshCw, Landmark, MessageCircle
} from 'lucide-react';
import { Quotation } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { formatDate } from '../../lib/dateFormat';
import { downloadElementAsPdf, printElementDirectly } from '../../lib/pdfDownloader';
import { Modal } from '../common/Modal';
import { OfficialLetterheadLayout } from '../common/OfficialLetterheadLayout';
import { CorporateStampMark } from '../common/CorporateStampMark';

interface OfficialQuotationPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotation: Quotation;
}

export const OfficialQuotationPrintModal: React.FC<OfficialQuotationPrintModalProps> = ({
  isOpen,
  onClose,
  quotation
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useCRM();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);

  const handlePrint = () => {
    printElementDirectly('official-quotation-proposal-document', `عرض سعر تأجير سيارات رسمي #${quotation.id}`);
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      await downloadElementAsPdf('official-quotation-proposal-document', `Splendor-Quotation-${quotation.id}.pdf`);
      showToast(
        isAr ? 'تم حفظ ملف PDF بنجاح' : 'PDF Saved Successfully',
        isAr ? `تم حفظ عرض السعر الرسمي #${quotation.id} كملف PDF على جهازك.` : `Quotation #${quotation.id} saved as PDF.`
      );
    } catch (err: any) {
      showToast(isAr ? 'فشل تصدير PDF' : 'PDF Export Failed', err.message || 'Error exporting PDF', 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleSendWhatsApp = () => {
    const phone = quotation.customerPhone?.replace(/[^0-9]/g, '');
    if (!phone) {
      showToast(isAr ? 'خطأ' : 'Error', isAr ? 'رقم هاتف العميل غير متوفر.' : 'No phone number available.', 'error');
      return;
    }

    const message = `مرحباً ${quotation.customerName}،\n\nيسر شركة سبلندر لتأجير السيارات أن تقدم لكم عرض السعر المعتمد رقم (${quotation.id}) لاستئجار مركبة (${quotation.vehicleName}).\n\n📄 تفاصيل العرض:\n- المدة: ${quotation.durationDays} يوم (من ${formatDate(quotation.startDate)} إلى ${formatDate(quotation.endDate)})\n- السعر اليومي: ${(quotation.dailyRate || 0).toLocaleString()} درهم\n- الإجمالي مع الضريبة 5%: ${(quotation.grandTotal || 0).toLocaleString()} درهم\n- التأمين المسترد: ${(quotation.securityDeposit || 0).toLocaleString()} درهم\n\nيسعدنا خدمتكم في أي وقت.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
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
      title={isAr ? `عرض سعر تأجير سيارات رسمي #${quotation.id}` : `Official Car Rental Quotation #${quotation.id}`}
      subtitle={isAr ? 'عرض أسعار فاخر صادر عن شركة سبلندر لتأجير السيارات' : 'Official Luxury Rental Quotation — Splendor Car Rental'}
      maxWidth="4xl"
    >
      <div className="space-y-6 text-zinc-300 font-arabic">
        
        {/* Action Header Bar with Separate Print & Direct PDF Buttons */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-950 border border-zinc-800 no-print">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-4 h-4 text-[#f5d97f]" />
            <span className="font-semibold text-zinc-200">
              {isAr ? 'عرض أسعار رسمي على الترويسة المعتمدة' : 'Official Quotation on Letterhead Template'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* WhatsApp Send Button */}
            <button
              onClick={handleSendWhatsApp}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow active:scale-95 transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{isAr ? 'إرسال واتساب' : 'WhatsApp'}</span>
            </button>

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
              <span>{isAr ? 'طباعة العرض' : 'Print Quotation'}</span>
            </button>
          </div>
        </div>

        {/* Printable Document on Official Letterhead */}
        <OfficialLetterheadLayout id="official-quotation-proposal-document">
          
          {/* Header Title Box */}
          <div className="flex flex-col sm:flex-row items-center justify-between border-b border-zinc-300 pb-3 gap-3">
            <div className="text-center sm:text-right">
              <h2 className="text-xl sm:text-2xl font-black text-[#991b1b]">
                عرض سعر تأجير سيارات رسمي
              </h2>
              <p className="text-xs font-bold text-zinc-600 uppercase font-sans tracking-widest">
                OFFICIAL CAR RENTAL QUOTATION
              </p>
            </div>

            <div className="text-center sm:text-left bg-zinc-100 p-2.5 rounded-xl border border-zinc-300">
              <div className="font-mono text-sm font-black text-zinc-950">
                REF #{quotation.id}
              </div>
              <p className="text-[11px] text-zinc-600 font-bold mt-0.5">
                تاريخ العرض: {formatDate(quotation.createdAt)}
              </p>
            </div>
          </div>

          {/* Customer Meta & Vehicle Meta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-300 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-[#991b1b] font-bold border-b border-zinc-200 pb-1.5">
                <User className="w-3.5 h-3.5" />
                <span>{isAr ? 'مقدم إلى العميل المحترم' : 'PREPARED FOR'}</span>
              </div>
              <p className="font-black text-zinc-950 text-sm">{quotation.customerName}</p>
              <p className="text-zinc-700 text-[11px]">
                الهاتف: <strong className="font-mono text-zinc-950" dir="ltr">{quotation.customerPhone}</strong>
              </p>
              <p className="text-zinc-700 text-[11px]">
                البريد الإلكتروني: <span className="text-zinc-950">{quotation.customerEmail}</span>
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-300 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-[#991b1b] font-bold border-b border-zinc-200 pb-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>{isAr ? 'فترة الحجز وصلاحية العرض' : 'SCHEDULE & VALIDITY'}</span>
              </div>
              <div className="space-y-1 text-[11px] text-zinc-700">
                <p><strong>المركبة المطلوبة:</strong> <span className="font-bold text-zinc-950">{quotation.vehicleName}</span></p>
                <p><strong>الفترة:</strong> من {formatDate(quotation.startDate)} إلى {formatDate(quotation.endDate)} ({quotation.durationDays} يوم)</p>
                <p className="text-[#991b1b]"><strong>صالح حتى:</strong> {formatDate(quotation.validUntil)}</p>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-zinc-400 rounded-lg overflow-hidden text-xs">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="bg-[#6b141a] text-white font-bold">
                  <th className="p-2.5 text-right pr-4 w-1/2">بيان الخدمة / Description</th>
                  <th className="p-2.5">المدة / الكمية</th>
                  <th className="p-2.5">السعر اليومي (AED)</th>
                  <th className="p-2.5 text-left pl-4">المجموع قبل الضريبة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-300 text-zinc-900">
                <tr className="hover:bg-zinc-50">
                  <td className="p-3 text-right pr-4 font-bold">
                    إيجار سيارة فاخرة: {quotation.vehicleName} (يشمل 250 كم/يوم وتأمين شامل VIP)
                  </td>
                  <td className="p-3 font-mono">{quotation.durationDays} يوم</td>
                  <td className="p-3 font-mono">{(quotation.dailyRate || 0).toLocaleString()} AED</td>
                  <td className="p-3 text-left pl-4 font-mono font-bold">{(quotation.baseTotal || 0).toLocaleString()} AED</td>
                </tr>
                {(quotation.extraServices || []).map((svc, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50">
                    <td className="p-2.5 text-right pr-4">{svc.name}</td>
                    <td className="p-2.5 font-mono">1</td>
                    <td className="p-2.5 font-mono">{svc.price} AED</td>
                    <td className="p-2.5 text-left pl-4 font-mono font-bold">{svc.price} AED</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Totals & Official Bank Box */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bank Info */}
            <div className="border border-zinc-400 rounded-lg p-3 text-xs bg-zinc-50 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#991b1b] font-bold">
                <Landmark className="w-4 h-4" />
                <span>الحساب المصرفي المعتمد لشركة سبلندر:</span>
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
                    <td className="p-2 bg-zinc-100 font-bold w-3/5 text-zinc-800">المجموع الأساسي قبل الضريبة</td>
                    <td className="p-2 text-center font-mono font-bold text-zinc-900">{((quotation.baseTotal || 0) + (quotation.extraServicesTotal || 0)).toLocaleString()} AED</td>
                  </tr>
                  <tr className="border-b border-zinc-300">
                    <td className="p-2 bg-zinc-100 font-bold text-zinc-800">ضريبة القيمة المضافة (5% VAT)</td>
                    <td className="p-2 text-center font-mono font-bold text-zinc-900">{(quotation.vatAmount || 0).toLocaleString()} AED</td>
                  </tr>
                  <tr className="bg-[#6b141a] text-white font-bold">
                    <td className="p-2.5">الإجمالي الكلي النهائي</td>
                    <td className="p-2.5 text-center font-mono text-sm font-black">{(quotation.grandTotal || 0).toLocaleString()} AED</td>
                  </tr>
                  <tr className="bg-blue-50 text-blue-900 font-bold">
                    <td className="p-2">مبلغ التأمين المسترد (Deposit)</td>
                    <td className="p-2 text-center font-mono font-bold">{(quotation.securityDeposit || 0).toLocaleString()} AED</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Terms & Conditions -- payment, supply, and extension terms as
              entered for this specific quotation, never a fixed default the
              customer never sees. */}
          {(quotation.termsAndConditions || quotation.notes) && (
            <div className="border border-zinc-400 rounded-lg p-3.5 text-xs bg-zinc-50 space-y-2">
              <div className="flex items-center gap-1.5 text-[#991b1b] font-bold border-b border-zinc-200 pb-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>الشروط والأحكام / TERMS &amp; CONDITIONS</span>
              </div>
              {quotation.termsAndConditions && (
                <p className="text-zinc-800 whitespace-pre-wrap leading-relaxed">{quotation.termsAndConditions}</p>
              )}
              {quotation.notes && (
                <p className="text-zinc-600 whitespace-pre-wrap leading-relaxed pt-1 border-t border-zinc-200">{quotation.notes}</p>
              )}
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-3 border-t border-zinc-300">
            <div className="space-y-2">
              <p className="font-bold text-zinc-900 text-xs">مسؤول المبيعات والحجوزات</p>
              <div className="h-10 flex items-end justify-center border-b-2 border-dashed border-zinc-400">
                <span className="text-[10px] text-zinc-500 font-mono">Splendor VIP Reservations Desk</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-bold text-zinc-900 text-xs">ختم واعتماد شركة سبلندر</p>
              <div className="h-10 flex items-end justify-center gap-2 border-b-2 border-dashed border-zinc-400">
                <CorporateStampMark className="w-8 h-8 shrink-0" />
                <span className="text-[10px] text-[#991b1b] font-bold">شركة سبلندر لتأجير السيارات ش.ذ.م.م</span>
              </div>
            </div>
          </div>

        </OfficialLetterheadLayout>

      </div>
    </Modal>
  );
};
