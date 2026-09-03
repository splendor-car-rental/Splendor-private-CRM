import React, { useState } from 'react';
import { 
  Printer, ShieldCheck, Download, Check, 
  Car, User, Calendar, DollarSign, X, FileText, QrCode, RefreshCw 
} from 'lucide-react';
import { Contract, Vehicle, Customer } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { formatDate, formatDateTime, formatPhoneNumber } from '../../lib/dateFormat';
import { downloadElementAsPdf, printElementDirectly } from '../../lib/pdfDownloader';
import { Modal } from '../common/Modal';
import { OfficialLetterheadLayout } from '../common/OfficialLetterheadLayout';
import { CorporateStampMark } from '../common/CorporateStampMark';

interface ContractDocumentPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: Contract;
  vehicle?: Vehicle;
  customer?: Customer;
}

export const ContractDocumentPrintModal: React.FC<ContractDocumentPrintModalProps> = ({
  isOpen,
  onClose,
  contract,
  vehicle,
  customer
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useCRM();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);

  const handlePrint = () => {
    printElementDirectly('master-contract-document', `عقد إيجار مركبة #${contract.contractNumber}`);
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      await downloadElementAsPdf('master-contract-document', `Splendor-Contract-${contract.contractNumber}.pdf`);
      showToast(
        isAr ? 'تم حفظ ملف PDF بنجاح' : 'PDF Saved Successfully',
        isAr ? `تم حفظ العقد الرسمي رقم ${contract.contractNumber} كملف PDF عالي الدقة.` : `Contract #${contract.contractNumber} saved as PDF.`
      );
    } catch (err: any) {
      showToast(isAr ? 'فشل تصدير PDF' : 'PDF Export Failed', err.message || 'Error exporting PDF', 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? `عقد تأجير رسمي موثق #${contract.contractNumber}` : `Official Master Lease Agreement #${contract.contractNumber}`}
      subtitle={isAr ? 'عقد تأجير سيارات فارهة معتمد — شركة سبلندر لتأجير السيارات' : 'UAE RTA Compliant Luxury Vehicle Rental Contract — Splendor Car Rental'}
      maxWidth="4xl"
    >
      <div className="space-y-6 text-zinc-300 font-arabic">
        
        {/* Action Header Bar with Separate Print & Direct PDF Buttons */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-950 border border-zinc-800 no-print">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-4 h-4 text-[#f5d97f]" />
            <span className="font-semibold text-zinc-200">
              {isAr ? 'عقد ملزم قانونياً وموثق على الترويسة المعتمدة' : 'Legally Binding UAE Digital Master Contract on Letterhead'}
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
                  <span>{isAr ? 'جاري تصدير PDF...' : 'Exporting PDF...'}</span>
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
              <span>{isAr ? 'طباعة العقد فوراً' : 'Print Contract'}</span>
            </button>
          </div>
        </div>

        {/* Printable Contract Body Built inside the Official Letterhead Template */}
        <OfficialLetterheadLayout id="master-contract-document">
          
          {/* Header Title Box */}
          <div className="flex flex-col sm:flex-row items-center justify-between border-b border-zinc-300 pb-3 gap-3">
            <div className="text-center sm:text-right">
              <h2 className="text-xl sm:text-2xl font-black text-[#991b1b]">
                عقد تأجير مركبة فارهة
              </h2>
              <p className="text-xs font-bold text-zinc-600 uppercase font-sans tracking-widest">
                MASTER LUXURY VEHICLE LEASE AGREEMENT
              </p>
            </div>

            <div className="text-center sm:text-left bg-zinc-100 p-2.5 rounded-xl border border-zinc-300">
              <div className="font-mono text-sm font-black text-zinc-950">
                CONTRACT #{contract.contractNumber}
              </div>
              <p className="text-[11px] text-zinc-600 font-bold mt-0.5">
                تاريخ الإصدار: {formatDate(contract.startDateTime)}
              </p>
            </div>
          </div>

          {/* Parties Grid (Customer & Fleet Asset) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer Box */}
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-300 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-[#991b1b] font-bold border-b border-zinc-200 pb-1.5">
                <User className="w-3.5 h-3.5" />
                <span>{isAr ? 'الطرف الثاني (المستأجر)' : 'LESSEE / VIP CLIENT'}</span>
              </div>
              <p className="font-black text-zinc-950 text-sm">{contract.customerName}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-700">
                <div>
                  <span className="text-zinc-500">{isAr ? 'الهاتف:' : 'Phone:'}</span>{' '}
                  <strong className="font-mono text-zinc-950" dir="ltr">{contract.customerPhone}</strong>
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'الجنسية:' : 'Nationality:'}</span>{' '}
                  <strong className="text-zinc-950">{customer?.nationality || 'International'}</strong>
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'رقم الإثبات:' : 'ID / Passport:'}</span>{' '}
                  <strong className="font-mono text-zinc-950">{customer?.idNumber || 'VERIFIED-KYC'}</strong>
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'رقم الرخصة:' : 'Driving License:'}</span>{' '}
                  <strong className="font-mono text-zinc-950">{customer?.licenseNumber || 'VERIFIED'}</strong>
                </div>
              </div>
            </div>

            {/* Vehicle Box */}
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-300 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-[#991b1b] font-bold border-b border-zinc-200 pb-1.5">
                <Car className="w-3.5 h-3.5" />
                <span>{isAr ? 'بيانات المركبة الفارهة' : 'LEASED FLEET ASSET'}</span>
              </div>
              <p className="font-black text-zinc-950 text-sm">{contract.vehicleName}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-700">
                <div>
                  <span className="text-zinc-500">{isAr ? 'رقم اللوحة:' : 'Plate:'}</span>{' '}
                  <strong className="font-mono text-zinc-950">{contract.vehiclePlate}</strong>
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'رقم الهيكل:' : 'VIN:'}</span>{' '}
                  <span className="font-mono text-zinc-950 text-[10px]">{contract.vehicleVin}</span>
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'اللون:' : 'Color:'}</span>{' '}
                  <strong className="text-zinc-950">{vehicle?.exteriorColor || 'Bespoke'}</strong>
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'فئة المركبة:' : 'Category:'}</span>{' '}
                  <strong className="text-zinc-950">{(vehicle?.category || 'Luxury').toUpperCase()}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Rental Duration & Financials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-300 space-y-2 text-xs">
              <span className="font-bold text-zinc-900 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#991b1b]" />
                <span>{isAr ? 'فترة التأجير والكيلومترات (يوم/شهر/سنة)' : 'Rental Term & Allowances (DD/MM/YYYY)'}</span>
              </span>
              <div className="space-y-1 text-[11px] text-zinc-700 pt-1">
                <p><strong>{isAr ? 'بداية الإيجار:' : 'Start:'}</strong> {formatDate(contract.startDateTime)}</p>
                <p><strong>{isAr ? 'نهاية الإيجار:' : 'Return:'}</strong> {formatDate(contract.endDateTime)}</p>
                <p><strong>{isAr ? 'المدة الإجمالية:' : 'Duration:'}</strong> {Math.max(1, Math.ceil((new Date(contract.endDateTime).getTime() - new Date(contract.startDateTime).getTime()) / (1000 * 60 * 60 * 24)))} {isAr ? 'أيام' : 'Days'}</p>
                <p><strong>{isAr ? 'المسافة اليومية القياسية:' : 'Daily Allowance:'}</strong> {contract.mileageAllowancePerDay || 250} كم/يوم</p>
                <p className="text-[#991b1b]"><strong>{isAr ? 'رسوم تجاوز الكيلومتر:' : 'Excess Rate:'}</strong> {contract.extraKmRate || 2} درهم/كم</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-300 space-y-2 text-xs">
              <span className="font-bold text-zinc-900 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-[#991b1b]" />
                <span>{isAr ? 'الرسوم المالية والوديعة (AED)' : 'Financial Statement (AED)'}</span>
              </span>
              <div className="space-y-1 text-[11px] text-zinc-700 pt-1 divide-y divide-zinc-200">
                <div className="flex justify-between py-1">
                  <span>{isAr ? 'أجرة الإيجار الأساسية:' : 'Base Rental Subtotal:'}</span>
                  <span className="font-mono font-bold text-zinc-950">{(contract.rentalTotal || 0).toLocaleString()} AED</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>{isAr ? 'ضريبة القيمة المضافة (5% VAT):' : 'UAE VAT (5%):'}</span>
                  <span className="font-mono font-bold text-zinc-950">{(contract.vatAmount || 0).toLocaleString()} AED</span>
                </div>
                <div className="flex justify-between py-1 font-black text-[#991b1b] text-xs">
                  <span>{isAr ? 'الإجمالي العام المستحق:' : 'Grand Total:'}</span>
                  <span className="font-mono text-sm">
                    {(contract.grandTotal || 0).toLocaleString()} AED
                  </span>
                </div>
                <div className="flex justify-between py-1 text-blue-700 font-bold">
                  <span>{isAr ? 'تأمين الحوادث والمخالفات المحتجز:' : 'Held Security Deposit:'}</span>
                  <span className="font-mono">{(contract.depositAmount || 0).toLocaleString()} AED</span>
                </div>
              </div>
            </div>
          </div>

          {/* Standard Terms & Disclaimers */}
          <div className="p-3 rounded-xl bg-zinc-100 border border-zinc-300 text-[10px] text-zinc-800 space-y-1">
            <h5 className="font-bold text-[#991b1b] uppercase">
              {isAr ? 'شروط وأحكام التأجير الأساسية (معتمدة وفق القوانين واللوائح في دولة الإمارات):' : 'Key Lease Terms & Conditions:'}
            </h5>
            <ol className="list-decimal list-inside space-y-0.5 leading-relaxed">
              <li>{isAr ? 'يقر المستأجر باستلام المركبة في حالة فنية ممتازة وخالية من أي عيوب عدا المذكورة في تقرير الفحص.' : 'The Lessee acknowledges receiving the supercar in showroom pristine condition, fully inspected.'}</li>
              <li>{isAr ? 'تطبق غرامة قدرها 5,000 درهم في حال قيادة المركبة على الكثبان الرملية أو المضامير غير المعبدة.' : 'Strict prohibition of off-road desert dune bashing or track racing.'}</li>
              <li>{isAr ? 'يتم حجز مبلغ التأمين لمدة 14 يوماً بعد تسليم السيارة لاستيفاء رسوم سالك ومخالفات شرطة دبي.' : 'Security deposit remains in 14-day hold post-return to clear Salik/Darb tolls & Dubai Police traffic fines.'}</li>
            </ol>
          </div>

          {/* Digital Signatures Box */}
          <div className="grid grid-cols-2 gap-8 pt-2 border-t border-zinc-300">
            {/* Client Signature */}
            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-300 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900">{isAr ? 'توقيع المستأجر (Client Signature)' : 'Lessee Digital Signature'}</span>
                <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" /> VERIFIED
                </span>
              </div>
              <div className="h-14 border border-dashed border-zinc-400 rounded-lg flex items-center justify-center bg-white p-2">
                <span className="font-serif italic text-sm text-zinc-800">{contract.customerName}</span>
              </div>
              <p className="text-[10px] text-zinc-600">{contract.customerName} • {formatDate(contract.startDateTime)}</p>
            </div>

            {/* Officer Signature */}
            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-300 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900">{isAr ? 'توقيع وختم شركة سبلندر' : 'Splendor Authorized Officer'}</span>
                <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" /> AUTHORIZED
                </span>
              </div>
              <div className="h-14 border border-dashed border-zinc-400 rounded-lg flex items-center justify-center gap-2 bg-white p-2">
                <CorporateStampMark className="w-11 h-11 shrink-0" />
                <span className="font-bold text-sm text-[#991b1b]">شركة سبلندر لتأجير السيارات ش.ذ.م.م</span>
              </div>
              <p className="text-[10px] text-zinc-600">SPLENDOR CAR RENTAL LLC • DUBAI</p>
            </div>
          </div>

        </OfficialLetterheadLayout>
      </div>
    </Modal>
  );
};
