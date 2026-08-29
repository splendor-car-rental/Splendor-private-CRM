import React from 'react';
import { 
  Printer, ShieldCheck, Download, Check, 
  Car, User, Calendar, DollarSign, X, FileText, QrCode 
} from 'lucide-react';
import { Contract, Vehicle, Customer } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { formatDate, formatDateTime } from '../../lib/dateFormat';
import { Modal } from '../common/Modal';

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

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? `عقد تأجير رسمي موثق #${contract.contractNumber}` : `Official Master Lease Agreement #${contract.contractNumber}`}
      subtitle={isAr ? 'عقد تأجير سيارات فارهة متوافق مع هيئة الطرق والمواصلات بدبي (RTA)' : 'UAE RTA Compliant Luxury Vehicle Rental Contract & Master Lease Agreement'}
      maxWidth="4xl"
    >
      <div className="space-y-6 text-zinc-300">
        {/* Action Header Bar */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-950 border border-zinc-800 no-print">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-4 h-4 text-[#f5d97f]" />
            <span className="font-semibold text-zinc-200">
              {isAr ? 'عقد ملزم قانونياً وموقع رقمياً' : 'Legally Binding UAE Digital Master Contract'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow hover:brightness-110 active:scale-95 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>{isAr ? 'طباعة العقد / حفظ كـ PDF' : 'Print / Export PDF'}</span>
            </button>
          </div>
        </div>

        {/* Printable Contract Body */}
        <div className="p-8 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-200 space-y-6 shadow-2xl printable-document">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-zinc-800 pb-6">
            <div>
              <h1 className="text-xl font-display font-bold tracking-widest text-[#f5d97f] uppercase">
                SPLENDOR PRIVATE MOBILITY
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Luxury Car Rental & VIP Chauffeur Concierge L.L.C
              </p>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">
                TRN: 100488920100003 • RTA License: 994210 • Dubai, UAE
              </p>
            </div>

            <div className="text-end">
              <div className="inline-block px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-700 font-mono text-xs font-bold text-zinc-100">
                CONTRACT #{contract.contractNumber}
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">
                Issued: {formatDateTime(contract.startDateTime)}
              </p>
            </div>
          </div>

          {/* Parties Grid (Customer & Fleet Asset) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer Box */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-[#f5d97f] font-bold border-b border-zinc-800 pb-1.5">
                <User className="w-3.5 h-3.5" />
                <span>{isAr ? 'الطرف الثاني (المستأجر)' : 'LESSEE / VIP CLIENT'}</span>
              </div>
              <p className="font-bold text-zinc-100 text-sm">{contract.customerName}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                <div>
                  <span className="text-zinc-500">{isAr ? 'الهاتف:' : 'Phone:'}</span> {contract.customerPhone}
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'الجنسية:' : 'Nationality:'}</span> {customer?.nationality || 'International'}
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'رقم الإثبات:' : 'ID / Passport:'}</span> {customer?.idNumber || 'VERIFIED-KYC'}
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'رقم الرخصة:' : 'Driving License:'}</span> {customer?.licenseNumber || 'VERIFIED'}
                </div>
              </div>
            </div>

            {/* Vehicle Box */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold border-b border-zinc-800 pb-1.5">
                <Car className="w-3.5 h-3.5" />
                <span>{isAr ? 'بيانات المركبة الفارهة' : 'LEASED FLEET ASSET'}</span>
              </div>
              <p className="font-bold text-zinc-100 text-sm">{contract.vehicleName}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                <div>
                  <span className="text-zinc-500">{isAr ? 'رقم اللوحة:' : 'Plate:'}</span> {contract.vehiclePlate}
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'رقم الهيكل:' : 'VIN:'}</span> <span className="font-mono">{contract.vehicleVin}</span>
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'اللون:' : 'Color:'}</span> {vehicle?.exteriorColor || 'Bespoke'}
                </div>
                <div>
                  <span className="text-zinc-500">{isAr ? 'فئة المركبة:' : 'Category:'}</span> {(vehicle?.category || 'Supercar').toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* Rental Duration & Financials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2 text-xs">
              <span className="font-bold text-zinc-300 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{isAr ? 'فترة التأجير والكيلومترات' : 'Rental Term & Allowances'}</span>
              </span>
              <div className="space-y-1 text-[11px] text-zinc-400 pt-1">
                <p><strong>{isAr ? 'بداية الإيجار:' : 'Start:'}</strong> {formatDateTime(contract.startDateTime)}</p>
                <p><strong>{isAr ? 'نهاية الإيجار:' : 'Return:'}</strong> {formatDateTime(contract.endDateTime)}</p>
                <p><strong>{isAr ? 'المدة الإجمالية:' : 'Duration:'}</strong> {Math.max(1, Math.ceil((new Date(contract.endDateTime).getTime() - new Date(contract.startDateTime).getTime()) / (1000 * 60 * 60 * 24)))} {isAr ? 'أيام' : 'Days'}</p>
                <p><strong>{isAr ? 'المسافة اليومية القياسية:' : 'Daily Allowance:'}</strong> {contract.mileageAllowancePerDay || 250} km/day</p>
                <p><strong>{isAr ? 'المسافة الشهرية القياسية:' : 'Monthly Allowance:'}</strong> {contract.monthlyMileageAllowance || ((contract.mileageAllowancePerDay || 250) * 18)} km/month</p>
                <p className="text-amber-300"><strong>{isAr ? 'رسوم تجاوز الكيلومتر القياسية:' : 'Excess Rate:'}</strong> AED {contract.extraKmRate || 2}/km</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2 text-xs">
              <span className="font-bold text-zinc-300 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{isAr ? 'الرسوم المالية والوديعة' : 'Financial Statement'} {contract.currency && contract.currency !== 'AED' ? `(${contract.currency} / AED)` : '(AED)'}</span>
              </span>
              <div className="space-y-1 text-[11px] text-zinc-400 pt-1 divide-y divide-zinc-800/60">
                <div className="flex justify-between py-0.5">
                  <span>{isAr ? 'أجرة الإيجار الأساسية:' : 'Base Rental Subtotal:'}</span>
                  <span className="font-mono text-zinc-200">{(contract.rentalTotal || 0).toLocaleString()} AED</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span>{isAr ? 'ضريبة القيمة المضافة (5% VAT):' : 'UAE VAT (5%):'}</span>
                  <span className="font-mono text-zinc-200">{(contract.vatAmount || 0).toLocaleString()} AED</span>
                </div>
                <div className="flex justify-between py-0.5 font-bold text-zinc-100">
                  <span>{isAr ? 'الإجمالي العام المستحق:' : 'Grand Total:'}</span>
                  <span className="font-mono text-[#f5d97f]">
                    {(contract.grandTotal || 0).toLocaleString()} AED
                    {contract.currency && contract.currency !== 'AED' && contract.exchangeRate && (
                      <span className="text-xs text-sky-400 font-normal ml-1">
                        (≈ {((contract.grandTotal || 0) / contract.exchangeRate).toFixed(2)} {contract.currency})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 text-sky-400">
                  <span>{isAr ? 'تأمين الحوادث والمخالفات المحتجز:' : 'Held Security Deposit:'}</span>
                  <span className="font-mono">{(contract.depositAmount || 0).toLocaleString()} AED</span>
                </div>
              </div>
            </div>
          </div>

          {/* Standard Terms & Disclaimers */}
          <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-800 text-[10px] text-zinc-400 space-y-1.5">
            <h5 className="font-bold text-zinc-300 uppercase">
              {isAr ? 'شروط وأحكام التأجير الأساسية (RTA & Dubai Police Compliance):' : 'Key Lease Terms & Conditions:'}
            </h5>
            <ol className="list-decimal list-inside space-y-1 leading-relaxed">
              <li>{isAr ? 'يقر المستأجر باستلام المركبة في حالة فنية ممتازة وخالية من أي عيوب عدا المذكورة في تقرير الفحص.' : 'The Lessee acknowledges receiving the supercar in showroom pristine condition, fully inspected.'}</li>
              <li>{isAr ? 'تطبق غرامة قدرها 5,000 درهم في حال قيادة المركبة على الكثبان الرملية أو المضامير غير المعبدة.' : 'Strict prohibition of off-road desert dune bashing or track racing. Penalty: AED 5,000 + repair liabilities.'}</li>
              <li>{isAr ? 'يتم حجز مبلغ التأمين لمدة 14 يوماً بعد تسليم السيارة لاستيفاء رسوم سالك ومخالفات شرطة دبي.' : 'Security deposit remains in 14-day hold post-return to clear Salik/Darb tolls & Dubai Police traffic fines.'}</li>
              <li>{isAr ? 'السرعة القصوى المحددة للمركبة 200 كم/س ويتم تسجيل التجاوزات آلياً عبر نظام التتبع المعتمد.' : 'Vehicle telemetry is actively monitored. Overspeed above 200 km/h triggers immediate concierge alert.'}</li>
            </ol>
          </div>

          {/* Digital Signatures Box */}
          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-zinc-800">
            {/* Client Signature */}
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300">{isAr ? 'توقيع المستأجر (Client Signature)' : 'Lessee Digital Signature'}</span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> VERIFIED
                </span>
              </div>
              <div className="h-20 border border-dashed border-zinc-700 rounded-lg flex items-center justify-center bg-zinc-950 p-2">
                {contract.handover?.customerSignatureUrl ? (
                  <img src={contract.handover.customerSignatureUrl} alt="Client Signature" className="max-h-full object-contain filter invert opacity-90" />
                ) : (
                  <span className="font-serif italic text-sm text-[#f5d97f]">{contract.customerName}</span>
                )}
              </div>
              <p className="text-[10px] text-zinc-500">{contract.customerName} • Signed on {formatDate(contract.startDateTime)}</p>
            </div>

            {/* Officer Signature */}
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300">{isAr ? 'توقيع ممثل الشركة (Authorized Officer)' : 'Splendor Authorized Officer'}</span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> AUTHORIZED
                </span>
              </div>
              <div className="h-20 border border-dashed border-zinc-700 rounded-lg flex items-center justify-center bg-zinc-950 p-2">
                {contract.handover?.employeeSignatureUrl ? (
                  <img src={contract.handover.employeeSignatureUrl} alt="Officer Signature" className="max-h-full object-contain filter invert opacity-90" />
                ) : (
                  <span className="font-serif italic text-sm text-[#D4AF37]">{contract.handover?.employeeName || 'Ahmed Morsy (Operations Lead)'}</span>
                )}
              </div>
              <p className="text-[10px] text-zinc-500">{contract.handover?.employeeName || 'Operations Lead'} • SPLENDOR CONCIERGE</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
