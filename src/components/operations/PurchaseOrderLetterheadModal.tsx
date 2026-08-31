import React, { useState } from 'react';
import { 
  Printer, ShieldCheck, Download, 
  Building2, Calendar, DollarSign, FileText, RefreshCw, MessageCircle, Truck, Award, Car, Clock, Mail, Send, CheckCircle2
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { formatDate } from '../../lib/dateFormat';
import { downloadElementAsPdf, printElementDirectly } from '../../lib/pdfDownloader';
import { Modal } from '../common/Modal';
import { OfficialLetterheadLayout } from '../common/OfficialLetterheadLayout';

export interface PurchaseOrderItem {
  id: string;
  itemCode?: string;
  description: string;
  vehicleType?: string; // e.g. 'BMW X5'
  modelYear?: string; // e.g. '2023'
  plateNumber?: string; // e.g. 'X 88074'
  quantity: number;
  unit: string; // e.g. 'Days / أيام', 'Pcs', 'Set', 'Hours', 'Car'
  unitPrice: number; // e.g. 400 AED
  durationText?: string; // e.g. '2 Days'
  discount?: number;
  vatRate: number; // usually 0.05
  vatAmount: number;
  total: number;
}

export interface B2BPurchaseOrder {
  id: string; // e.g. 'LPO 5158'
  poNumber: string;
  orderType?: 'car_booking' | 'parts_and_services'; // Distinction between external car sourcing and general procurement
  date: string;
  deliveryDate: string; // booking start or delivery
  returnDate?: string; // booking end date
  startTime?: string; // e.g. '5:00 PM'
  endTime?: string; // e.g. '5:00 PM'
  status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'fulfilled' | 'cancelled';
  
  // Vendor / Supplier details
  supplierName: string; // e.g. 'Alayham for Car Rental L.L.C'
  supplierTrn?: string;
  supplierContact?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  supplierAddress?: string;
  
  // Issuer details
  department: string;
  requestedBy: string;
  approvedBy?: string;
  
  // Project / Vehicle Reference
  projectRef?: string;
  vehicleRef?: string;
  deliveryLocation: string;
  
  // Specific Car Supply Terms from Reference Document
  splendorTrn?: string; // 104391520400003
  signerName?: string; // e.g. 'Ahmed Morsy'
  signerTitle?: string; // e.g. 'Operations Manager'
  liabilityNote?: string; // "We are responsible for any fines and Salik during the validity of the LPO."
  
  // Items & Financials
  items: PurchaseOrderItem[];
  subtotal: number;
  discountTotal?: number;
  vatTotal: number;
  grandTotal: number;
  
  // Terms
  paymentTerms: string;
  warrantyTerms?: string;
  notes?: string;
  termsAndConditions?: string[];
}

interface PurchaseOrderLetterheadModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: B2BPurchaseOrder;
  onStatusUpdate?: (poId: string, status: B2BPurchaseOrder['status']) => void;
}

export const PurchaseOrderLetterheadModal: React.FC<PurchaseOrderLetterheadModalProps> = ({
  isOpen,
  onClose,
  purchaseOrder,
  onStatusUpdate
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useCRM();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [displayStyle, setDisplayStyle] = useState<'b2b_car_booking' | 'standard_procurement'>(
    purchaseOrder.orderType === 'car_booking' || purchaseOrder.items.some(i => i.vehicleType || i.plateNumber)
      ? 'b2b_car_booking'
      : 'standard_procurement'
  );

  const handlePrint = () => {
    printElementDirectly('official-purchase-order-document', `أمر توريد سيارة LPO #${purchaseOrder.poNumber}`);
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      await downloadElementAsPdf('official-purchase-order-document', `Splendor-LPO-${purchaseOrder.poNumber}.pdf`);
      showToast(
        isAr ? 'تم حفظ ملف PDF بنجاح' : 'PDF Saved Successfully',
        isAr ? `تم حفظ أمر التوريد #${purchaseOrder.poNumber} كملف PDF على جهازك.` : `Purchase Order #${purchaseOrder.poNumber} saved as PDF.`
      );
    } catch (err: any) {
      showToast(isAr ? 'فشل تصدير PDF' : 'PDF Export Failed', err.message || 'Error exporting PDF', 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleSendWhatsApp = () => {
    const phone = purchaseOrder.supplierPhone?.replace(/[^0-9]/g, '');
    if (!phone) {
      showToast(isAr ? 'تنبيه' : 'Notice', isAr ? 'رقم هاتف الشركة الموردة غير مسجل. يرجى تعديل الأمر وإضافة الهاتف.' : 'Supplier phone number is missing.', 'error');
      return;
    }

    const firstItem = purchaseOrder.items[0];
    const carDetails = firstItem?.vehicleType 
      ? `\n🚘 تفاصيل السيارة المطلوبة:\n- النوع: ${firstItem.vehicleType} (موديل ${firstItem.modelYear || '—'})\n- اللوحة: ${firstItem.plateNumber || '—'}\n- المدة: من ${formatDate(purchaseOrder.deliveryDate)} ${purchaseOrder.startTime || ''} إلى ${formatDate(purchaseOrder.returnDate || purchaseOrder.deliveryDate)} ${purchaseOrder.endTime || ''}\n- السعر اليومي: ${firstItem.unitPrice} درهم (شامل الضريبة)`
      : `\n- الإجمالي النهائي: ${purchaseOrder.grandTotal.toLocaleString()} درهم`;

    const message = `السادة المحترمون في شركة / ${purchaseOrder.supplierName}،\n\nتحية طيبة وبعد،،\n\nنرسل لكم أمر التوريد والحجز الصادر من شركة سبلندر لتأجير السيارات (${purchaseOrder.poNumber}) لتوريد وحجز السيارة الموضحة أدناه:${carDetails}\n\nنؤكد التزامنا بدفع رسوم سالك والمخالفات المرورية المترتبة خلال فترة هذا الـ LPO، وإصدار الفاتورة الضريبية على الرقم الضريبي لشركة سبلندر (TRN: 104391520400003).\n\nشاكرين حسن تعاونكم.\nشركة سبلندر لتأجير السيارات ش.ذ.م.م\n${purchaseOrder.signerName || 'Ahmed Morsy'}`;
    
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    if (onStatusUpdate && purchaseOrder.status !== 'sent' && purchaseOrder.status !== 'fulfilled') {
      onStatusUpdate(purchaseOrder.id, 'sent');
    }
  };

  const handleSendEmail = () => {
    const email = purchaseOrder.supplierEmail || '';
    const firstItem = purchaseOrder.items[0];
    const carText = firstItem?.vehicleType 
      ? `Vehicle: ${firstItem.vehicleType} ${firstItem.modelYear || ''} (Plate: ${firstItem.plateNumber || '—'}) | Duration: ${formatDate(purchaseOrder.deliveryDate)} to ${formatDate(purchaseOrder.returnDate || purchaseOrder.deliveryDate)} | Rate: ${firstItem.unitPrice} AED/Day`
      : `Total: ${purchaseOrder.grandTotal} AED`;

    const subject = encodeURIComponent(`Purchase Order / LPO ${purchaseOrder.poNumber} - Splendor Car Rental LLC`);
    const body = encodeURIComponent(`Dear ${purchaseOrder.supplierName},\n\nPlease find the official Vehicle Purchase Order (${purchaseOrder.poNumber}) issued by Splendor Car Rental LLC.\n\n${carText}\n\nWe confirm our responsibility for fines and Salik during the LPO period. Kindly issue the tax invoice to Splendor TRN: 104391520400003.\n\nBest Regards,\nSplendor Car Rental LLC\n${purchaseOrder.signerName || 'Ahmed Morsy'}`);

    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    if (onStatusUpdate && purchaseOrder.status !== 'sent' && purchaseOrder.status !== 'fulfilled') {
      onStatusUpdate(purchaseOrder.id, 'sent');
    }
  };

  const defaultTerms = purchaseOrder.termsAndConditions || [
    'We are responsible for any fines and Salik during the validity of the LPO.',
    'Kindly issue a tax invoice under VAT Registration Number (104391520400003) covering all related details and requirements.',
    'We appreciate your continuous support and confirm our commitment to return the vehicle on time and in the same condition received.',
    'Kindly proceed with the arrangement and provide the vehicle as per the agreed terms.'
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? `أمر توريد وحجز سيارة رسمي #${purchaseOrder.poNumber}` : `Official B2B Vehicle LPO #${purchaseOrder.poNumber}`}
      subtitle={isAr ? 'نموذج أمر توريد سيارات صادر للشركات (B2B Car Rental Supply Order)' : 'Official Outgoing Corporate Vehicle Supply Order — Splendor Car Rental'}
      maxWidth="4xl"
    >
      <div className="space-y-6 text-zinc-300 font-arabic">
        
        {/* Action Header Bar with Separate Print & Direct PDF Buttons & Template Switcher */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-950 border border-zinc-800 no-print flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setDisplayStyle('b2b_car_booking')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                  displayStyle === 'b2b_car_booking'
                    ? 'bg-[#1e3a8a] text-white shadow-md shadow-blue-900/40 border border-blue-500/50'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Car className="w-3.5 h-3.5" />
                <span>نموذج توريد وحجز سيارة (LPO Car Booking)</span>
              </button>
              <button
                type="button"
                onClick={() => setDisplayStyle('standard_procurement')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                  displayStyle === 'standard_procurement'
                    ? 'bg-[#1e3a8a] text-white shadow-md shadow-blue-900/40 border border-blue-500/50'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>نموذج التوريد والمشتريات العامة</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* WhatsApp Send Button */}
            <button
              onClick={handleSendWhatsApp}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow active:scale-95 transition-all"
              title={isAr ? 'إرسال أمر التوريد عبر واتساب للمورد' : 'Send via WhatsApp'}
            >
              <MessageCircle className="w-4 h-4" />
              <span>{isAr ? 'إرسال واتساب' : 'WhatsApp'}</span>
            </button>

            {/* Email Send Button */}
            <button
              onClick={handleSendEmail}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white font-bold text-xs shadow-md shadow-blue-950 border border-blue-600/40 active:scale-95 transition-all"
              title={isAr ? 'إرسال أمر التوريد عبر البريد الإلكتروني' : 'Send via Email'}
            >
              <Mail className="w-4 h-4" />
              <span>{isAr ? 'إرسال إيميل' : 'Email'}</span>
            </button>

            {/* Dedicated PDF Download Button */}
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-bold text-xs shadow active:scale-95 transition-all disabled:opacity-50"
              title={isAr ? 'تنزيل وحفظ ملف PDF على جهازك مباشرة' : 'Download PDF to device'}
            >
              {isDownloadingPdf ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#60a5fa]" />
                  <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#60a5fa]" />
                  <span>{isAr ? 'حفظ PDF' : 'Save PDF'}</span>
                </>
              )}
            </button>

            {/* Dedicated Print Button with Real OS Dialog */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-black text-xs shadow hover:brightness-110 active:scale-95 transition-all"
              title={isAr ? 'فتح نافذة الطباعة لاختيار الطابعة أو اختيار مجلد الحفظ على جهازك (Save As)' : 'Open print dialog to select printer or save to specific folder'}
            >
              <Printer className="w-4 h-4" />
              <span>{isAr ? 'طباعة / حفظ بمكان مخصص' : 'Print / Save As'}</span>
            </button>
          </div>
        </div>

        {/* Printable Document on Official Letterhead */}
        <OfficialLetterheadLayout id="official-purchase-order-document">
          
          {/* ===================== FORMAT A: B2B CAR BOOKING LPO (EXACT REFERENCE DESIGN) ===================== */}
          {displayStyle === 'b2b_car_booking' ? (
            <div className="flex flex-col justify-between h-full space-y-3 pt-1 text-zinc-900 font-arabic">
              
              {/* Date on Right and LPO Heading Centered */}
              <div className="flex items-center justify-between border-b border-zinc-200 pb-1">
                <div className="text-[11px] font-bold text-zinc-600 font-sans tracking-wide">
                  REF: <span className="font-mono font-bold text-zinc-900">{purchaseOrder.poNumber}</span>
                </div>
                <div className="text-xs font-bold text-zinc-800 font-sans tracking-wide">
                  DATE: <span className="font-mono font-bold">{formatDate(purchaseOrder.date)}</span>
                </div>
              </div>

              {/* LPO Title Center */}
              <div className="text-center my-0.5">
                <h1 className="text-2xl sm:text-3xl font-black text-[#991b1b] tracking-wider uppercase font-sans">
                  {purchaseOrder.poNumber.startsWith('LPO') ? purchaseOrder.poNumber : `LPO ${purchaseOrder.poNumber}`}
                </h1>
                <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-widest font-sans mt-0.5">
                  VEHICLE SUPPLY & BOOKING ORDER
                </p>
              </div>

              {/* Booking Official English Text (Exact from reference document) */}
              <div className="text-justify leading-relaxed text-zinc-900 font-sans text-xs sm:text-sm font-medium p-2.5 bg-zinc-50 rounded-lg border border-zinc-200">
                <p>
                  We are <strong className="text-[#991b1b] font-bold">Splendor Car Rental L.L.C</strong>. We book the following car from{' '}
                  <strong className="text-zinc-950 font-bold font-mono">
                    {formatDate(purchaseOrder.deliveryDate)} at {purchaseOrder.startTime || '5pm'}
                  </strong>{' '}
                  till{' '}
                  <strong className="text-zinc-950 font-bold font-mono">
                    {formatDate(purchaseOrder.returnDate || purchaseOrder.deliveryDate)} at {purchaseOrder.endTime || '5pm'}
                  </strong>{' '}
                  from <strong className="text-zinc-950 font-bold">{purchaseOrder.supplierName || 'Alayham for Car Rental L.L.C'}</strong>. We are responsible for any fines and Salik during the validity of the LPO.
                </p>
              </div>

              {/* Vehicle Specifications & Rate Table (Matching Reference Document Matrix) */}
              <div className="border-2 border-zinc-900 rounded-lg overflow-hidden my-1">
                <table className="w-full text-center border-collapse font-sans text-xs">
                  <thead>
                    <tr className="bg-zinc-100 text-zinc-950 font-bold border-b-2 border-zinc-900 text-[11px]">
                      <th className="py-2 px-2.5 border-r border-zinc-900">Vehicle Type</th>
                      <th className="py-2 px-2.5 border-r border-zinc-900">Model</th>
                      <th className="py-2 px-2.5 border-r border-zinc-900">Plate Number</th>
                      <th className="py-2 px-2.5 border-r border-zinc-900">Per Day Including VAT</th>
                      <th className="py-2 px-2.5">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-zinc-900 text-zinc-900 font-bold">
                    {purchaseOrder.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-zinc-50">
                        <td className="py-2.5 px-2.5 border-r border-zinc-900 text-xs font-black text-zinc-950">
                          {item.vehicleType || item.description}
                        </td>
                        <td className="py-2.5 px-2.5 border-r border-zinc-900 font-mono text-xs">
                          {item.modelYear || '2023'}
                        </td>
                        <td className="py-2.5 px-2.5 border-r border-zinc-900 font-mono text-xs tracking-wider">
                          {item.plateNumber || '—'}
                        </td>
                        <td className="py-2.5 px-2.5 border-r border-zinc-900 font-mono text-xs text-[#991b1b]">
                          {item.unitPrice ? `${item.unitPrice} AED` : `${item.total} AED`}
                        </td>
                        <td className="py-2.5 px-2.5 font-mono text-xs">
                          {item.durationText || `${item.quantity} ${item.unit || 'Days'}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mandatory Legal & Tax Directives (Exact from Reference Document) */}
              <div className="space-y-1.5 font-sans text-xs text-zinc-900 leading-relaxed font-medium pt-1">
                <p>
                  • Kindly issue a tax invoice under VAT Registration Number{' '}
                  <strong className="text-[#991b1b] font-bold font-mono tracking-wide">
                    ({purchaseOrder.splendorTrn || '104391520400003'})
                  </strong>{' '}
                  covering all related details and requirements.
                </p>

                <p>
                  • We appreciate your continuous support and confirm our commitment to return the vehicle on time and in the same condition received.
                </p>

                <p>
                  • Kindly proceed with the arrangement and provide the vehicle as per the agreed terms.
                </p>
              </div>

              {/* Signatures & Official Stamp (Exact from Reference Document) */}
              <div className="pt-2 border-t border-zinc-300 flex flex-row items-center justify-between">
                <div className="space-y-0.5 font-sans text-left">
                  <p className="text-xs font-black text-zinc-950 uppercase">
                    Splendor Car Rental LLC
                  </p>
                  <p className="text-sm font-bold text-[#991b1b]">
                    {purchaseOrder.signerName || 'Ahmed Morsy'}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-semibold">
                    {purchaseOrder.signerTitle || 'Operations Management'}
                  </p>
                </div>

                {/* Splendor Official Stamp Visual */}
                <div className="relative flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-[#1e3a8a] flex flex-col items-center justify-center p-1 text-center text-[7.5px] text-[#1e3a8a] font-bold uppercase tracking-tighter opacity-90 rotate-[-6deg]">
                    <span className="font-arabic text-[8.5px] text-[#1e3a8a]">سبلندر لتأجير السيارات</span>
                    <span className="my-0.5 text-[6.5px] font-mono">★ SPLENDOR CARS ★</span>
                    <span className="text-[6.5px]">CAR RENTAL L.L.C</span>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            
            /* ===================== FORMAT B: MULTI-ITEM GENERAL PROCUREMENT ===================== */
            <div className="space-y-5 text-zinc-900">
              {/* Header Title Box */}
              <div className="flex flex-col sm:flex-row items-center justify-between border-b-2 border-[#991b1b] pb-3 gap-3">
                <div className="text-center sm:text-right">
                  <h2 className="text-xl sm:text-2xl font-black text-[#991b1b]">
                    أمر توريد محلي ومشتريات
                  </h2>
                  <p className="text-xs font-bold text-zinc-600 uppercase font-sans tracking-widest">
                    OFFICIAL LOCAL PURCHASE ORDER (LPO)
                  </p>
                </div>

                <div className="text-center sm:text-left bg-zinc-100 p-2.5 rounded-xl border border-zinc-300">
                  <div className="font-mono text-base font-black text-[#991b1b]">
                    LPO #{purchaseOrder.poNumber}
                  </div>
                  <p className="text-[11px] text-zinc-700 font-bold mt-0.5">
                    تاريخ الإصدار: {formatDate(purchaseOrder.date)}
                  </p>
                  <p className="text-[11px] text-[#991b1b] font-bold">
                    تاريخ الاستحقاق: {formatDate(purchaseOrder.deliveryDate)}
                  </p>
                </div>
              </div>

              {/* Supplier Info & Internal Department Meta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Vendor Details */}
                <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-300 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-[#991b1b] font-bold border-b border-zinc-200 pb-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'السادة / الشركة الموردة (VENDOR / SUPPLIER)' : 'SUPPLIER DETAILS'}</span>
                  </div>
                  <p className="font-black text-zinc-950 text-sm">{purchaseOrder.supplierName}</p>
                  {purchaseOrder.supplierTrn && (
                    <p className="text-zinc-700 text-[11px]">
                      الرقم الضريبي (TRN): <strong className="font-mono text-zinc-950" dir="ltr">{purchaseOrder.supplierTrn}</strong>
                    </p>
                  )}
                  {purchaseOrder.supplierContact && (
                    <p className="text-zinc-700 text-[11px]">
                      المسؤول: <span className="text-zinc-950 font-semibold">{purchaseOrder.supplierContact}</span>
                    </p>
                  )}
                  <p className="text-zinc-700 text-[11px]">
                    الهاتف: <strong className="font-mono text-zinc-950" dir="ltr">{purchaseOrder.supplierPhone || '—'}</strong>
                    {purchaseOrder.supplierEmail && <span className="mr-2"> | {purchaseOrder.supplierEmail}</span>}
                  </p>
                  {purchaseOrder.supplierAddress && (
                    <p className="text-zinc-700 text-[11px]">
                      العنوان: <span className="text-zinc-950">{purchaseOrder.supplierAddress}</span>
                    </p>
                  )}
                </div>

                {/* Delivery & Project Meta */}
                <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-300 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-[#991b1b] font-bold border-b border-zinc-200 pb-1.5">
                    <Truck className="w-3.5 h-3.5" />
                    <span>{isAr ? 'بيانات القسم وموقع التسليم (DELIVERY & LOGISTICS)' : 'DELIVERY & PROJECT'}</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-zinc-700">
                    <p><strong>القسم الطالب:</strong> <span className="font-bold text-zinc-950">{purchaseOrder.department}</span></p>
                    <p><strong>موقع التسليم:</strong> <span className="font-semibold text-zinc-950">{purchaseOrder.deliveryLocation}</span></p>
                    {purchaseOrder.vehicleRef && (
                      <p><strong>المركبة المعنية:</strong> <span className="font-bold text-[#991b1b]">{purchaseOrder.vehicleRef}</span></p>
                    )}
                    {purchaseOrder.projectRef && (
                      <p><strong>المشروع / الغرض:</strong> <span className="font-semibold text-zinc-950">{purchaseOrder.projectRef}</span></p>
                    )}
                    <p><strong>شروط السداد:</strong> <span className="font-bold text-[#991b1b]">{purchaseOrder.paymentTerms}</span></p>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="border border-zinc-400 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="bg-[#6b141a] text-white font-bold">
                      <th className="p-2.5 text-center w-12">#</th>
                      <th className="p-2.5 text-right pr-4">بيان الصنف والخدمة والمواصفات / Description</th>
                      <th className="p-2.5 w-16">الكمية</th>
                      <th className="p-2.5 w-16">الوحدة</th>
                      <th className="p-2.5 w-24">سعر الوحدة (AED)</th>
                      <th className="p-2.5 w-24">الضريبة 5%</th>
                      <th className="p-2.5 text-left pl-4 w-28">الإجمالي (AED)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-300 text-zinc-900">
                    {purchaseOrder.items.map((item, idx) => {
                      const lineAmount = item.quantity * item.unitPrice;
                      const vat = item.vatAmount || (lineAmount * 0.05);
                      const total = item.total || (lineAmount + vat);
                      return (
                        <tr key={idx} className="hover:bg-zinc-50">
                          <td className="p-2.5 font-mono text-zinc-600">{idx + 1}</td>
                          <td className="p-2.5 text-right pr-4">
                            <span className="font-bold text-zinc-950">{item.description}</span>
                            {item.itemCode && (
                              <span className="block font-mono text-[10px] text-zinc-500">Code: {item.itemCode}</span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono font-bold">{item.quantity}</td>
                          <td className="p-2.5 text-zinc-700 text-[11px]">{item.unit}</td>
                          <td className="p-2.5 font-mono font-semibold">{item.unitPrice.toLocaleString()}</td>
                          <td className="p-2.5 font-mono text-zinc-700">{vat.toLocaleString()}</td>
                          <td className="p-2.5 text-left pl-4 font-mono font-black text-zinc-950">{total.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals & Terms & Conditions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Terms & Conditions Box */}
                <div className="border border-zinc-400 rounded-lg p-3 text-xs bg-zinc-50 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[#991b1b] font-bold">
                    <Award className="w-4 h-4" />
                    <span>الشروط والأحكام الخاصة بالتوريد (Terms & Conditions):</span>
                  </div>
                  <ul className="text-[10px] space-y-1 text-zinc-700 list-disc list-inside leading-relaxed">
                    {defaultTerms.map((term, i) => (
                      <li key={i}>{term}</li>
                    ))}
                  </ul>
                </div>

                {/* Totals Table */}
                <div className="border border-zinc-400 rounded-lg overflow-hidden text-xs">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr className="border-b border-zinc-300">
                        <td className="p-2 bg-zinc-100 font-bold w-3/5 text-zinc-800">المجموع قبل الضريبة (Subtotal)</td>
                        <td className="p-2 text-center font-mono font-bold text-zinc-900">{purchaseOrder.subtotal.toLocaleString()} AED</td>
                      </tr>
                      {purchaseOrder.discountTotal ? (
                        <tr className="border-b border-zinc-300 text-emerald-800">
                          <td className="p-2 bg-zinc-100 font-bold">الخصم الممنوح (Discount)</td>
                          <td className="p-2 text-center font-mono font-bold">-{purchaseOrder.discountTotal.toLocaleString()} AED</td>
                        </tr>
                      ) : null}
                      <tr className="border-b border-zinc-300">
                        <td className="p-2 bg-zinc-100 font-bold text-zinc-800">ضريبة القيمة المضافة (5% VAT)</td>
                        <td className="p-2 text-center font-mono font-bold text-zinc-900">{purchaseOrder.vatTotal.toLocaleString()} AED</td>
                      </tr>
                      <tr className="bg-[#6b141a] text-white font-bold">
                        <td className="p-2.5">الإجمالي النهائي الصافي (Net Total)</td>
                        <td className="p-2.5 text-center font-mono text-sm font-black">{purchaseOrder.grandTotal.toLocaleString()} AED</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Authorization & 3-Tier Official Signatures */}
              <div className="grid grid-cols-3 gap-4 pt-3 border-t border-zinc-300">
                <div className="space-y-2 text-center">
                  <p className="font-bold text-zinc-900 text-xs">مسؤول المشتريات / Prepared By</p>
                  <div className="h-10 flex items-end justify-center border-b-2 border-dashed border-zinc-400">
                    <span className="text-[10px] text-zinc-600 font-semibold">{purchaseOrder.requestedBy || 'Procurement Officer'}</span>
                  </div>
                </div>

                <div className="space-y-2 text-center">
                  <p className="font-bold text-zinc-900 text-xs">مدير العمليات / Operations Head</p>
                  <div className="h-10 flex items-end justify-center border-b-2 border-dashed border-zinc-400">
                    <span className="text-[10px] text-zinc-600 font-semibold">Approved - Ops Dept</span>
                  </div>
                </div>

                <div className="space-y-2 text-center">
                  <p className="font-bold text-[#991b1b] text-xs">اعتماد المدير العام والختم / Managing Director</p>
                  <div className="h-10 flex items-end justify-center border-b-2 border-dashed border-zinc-400">
                    <span className="text-[10px] text-[#991b1b] font-bold">شركة سبلندر لتأجير السيارات ش.ذ.م.م</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </OfficialLetterheadLayout>

      </div>
    </Modal>
  );
};
