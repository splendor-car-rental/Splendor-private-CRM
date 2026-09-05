import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, Clock, DollarSign, FileText, CheckCircle2, 
  Send, Printer, Sparkles, MessageCircle, AlertCircle, 
  ArrowRight, ShieldCheck, Car, User, Hash, CreditCard, 
  Building2, ChevronRight, Download, RefreshCw, X, FileSignature,
  Search, ChevronDown, Phone, MapPin, Check
} from 'lucide-react';
import { Contract, Vehicle, Customer, ContractExtensionAddendum } from '../../types';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatDate, formatDateTime, formatPhoneNumber } from '../../lib/dateFormat';
import { downloadElementAsPdf, printElementDirectly } from '../../lib/pdfDownloader';
import { OfficialLetterheadLayout } from '../common/OfficialLetterheadLayout';
import { CorporateStampMark } from '../common/CorporateStampMark';
import { DayMonthYearDateInput } from '../common/DayMonthYearDateInput';

interface ContractExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract?: Contract | null;
  vehicle?: Vehicle;
  customer?: Customer;
}

export const ContractExtensionModal: React.FC<ContractExtensionModalProps> = ({
  isOpen,
  onClose,
  contract: propContract,
  vehicle: propVehicle,
  customer: propCustomer
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { contracts, vehicles, customers, extendContract, showToast } = useCRM();

  // Filter available contracts (prefer active & approved contracts)
  const activeContracts = useMemo(() => {
    return contracts.filter(c => c.status === 'active' || c.status === 'approved' || c.status === 'draft');
  }, [contracts]);

  // Selected contract state
  const [selectedContractId, setSelectedContractId] = useState<string>(
    propContract?.id || activeContracts[0]?.id || ''
  );

  // Sync if propContract changes
  useEffect(() => {
    if (propContract?.id) {
      setSelectedContractId(propContract.id);
    } else if (activeContracts.length > 0 && !selectedContractId) {
      setSelectedContractId(activeContracts[0].id);
    }
  }, [propContract, activeContracts]);

  const currentContract = useMemo(() => {
    return contracts.find(c => c.id === selectedContractId) || propContract || contracts[0];
  }, [contracts, selectedContractId, propContract]);

  const currentVehicle = useMemo(() => {
    if (!currentContract) return propVehicle;
    return vehicles.find(v => v.id === currentContract.vehicleId) || propVehicle;
  }, [vehicles, currentContract, propVehicle]);

  // Active Wizard Tab
  const [activeTab, setActiveTab] = useState<'details' | 'financials' | 'preview'>('details');

  // Extension Form Inputs
  const currentEnd = useMemo(() => {
    if (!currentContract?.endDateTime) return new Date();
    return new Date(currentContract.endDateTime);
  }, [currentContract?.endDateTime]);
  
  // Default new end date = current end + 7 days
  const defaultNewEndStr = useMemo(() => {
    const d = new Date(currentEnd);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }, [currentEnd]);

  const [newEndDate, setNewEndDate] = useState<string>(defaultNewEndStr);
  const [newEndTime, setNewEndTime] = useState<string>('18:00');
  const [customDailyRate, setCustomDailyRate] = useState<number>(currentContract?.dailyRate || 350);
  const [currentOdometer, setCurrentOdometer] = useState<number>(
    currentContract?.handover?.startMileage || currentVehicle?.mileage || 25000
  );
  const [paymentMethod, setPaymentMethod] = useState<ContractExtensionAddendum['paymentMethod']>('credit_card');
  const [extensionReason, setExtensionReason] = useState<string>('تمديد إيجار رسمي بناءً على طلب العميل وموافقة الشركة');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [generatedAddendum, setGeneratedAddendum] = useState<ContractExtensionAddendum | null>(null);

  // Update rates & mileage when contract changes
  useEffect(() => {
    if (currentContract) {
      setCustomDailyRate(currentContract.dailyRate || 350);
      setCurrentOdometer(currentContract.handover?.startMileage || currentVehicle?.mileage || 25000);
      const d = new Date(currentContract.endDateTime || new Date());
      d.setDate(d.getDate() + 7);
      setNewEndDate(d.toISOString().split('T')[0]);
    }
  }, [currentContract, currentVehicle]);

  // Auto-calculated sequential Addendum Number
  const autoAddendumNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const count = (currentContract?.extensions?.length || 0) + 1;
    return `EXT-${year}-${count.toString().padStart(4, '0')}`;
  }, [currentContract]);

  // Bank Info from official template
  const bankDetails = {
    bankName: 'بنك الإمارات دبي الوطني',
    bankNameEn: 'Emirates NBD',
    accountNumber: '1015963340001',
    iban: 'AE220260001015963340001'
  };

  // Calculations
  const calculatedMetrics = useMemo(() => {
    const currentMs = currentEnd.getTime();
    const newEndMs = new Date(`${newEndDate}T${newEndTime}:00`).getTime();
    
    let durationDays = 0;
    if (!isNaN(newEndMs) && newEndMs > currentMs) {
      const diffMs = newEndMs - currentMs;
      durationDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    const daily = Number(customDailyRate) || 0;
    const periodRentalAmount = daily * durationDays;
    const vatRatePercent = 5;
    const vatAmount = Math.round((periodRentalAmount * 0.05) * 100) / 100;
    const totalExtensionAmount = periodRentalAmount + vatAmount;

    return {
      durationDays,
      dailyRate: daily,
      periodRentalAmount,
      vatRatePercent,
      vatAmount,
      totalExtensionAmount,
      isValid: durationDays > 0
    };
  }, [currentEnd, newEndDate, newEndTime, customDailyRate]);

  if (!isOpen) return null;

  const handleQuickAddDays = (days: number) => {
    const d = new Date(currentEnd);
    d.setDate(d.getDate() + days);
    setNewEndDate(d.toISOString().split('T')[0]);
  };

  const handleExecuteExtension = async () => {
    if (!currentContract) {
      showToast(isAr ? 'خطأ' : 'Error', isAr ? 'يرجى اختيار العقد المراد تمديده.' : 'Please select a contract.', 'error');
      return;
    }

    if (!calculatedMetrics.isValid) {
      showToast(
        isAr ? 'خطأ في تاريخ التمديد' : 'Invalid Date', 
        isAr ? 'يجب أن يكون تاريخ نهاية التمديد بعد تاريخ انتهاء العقد الحالي.' : 'Extension end date must be strictly after current contract end date.', 
        'error'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const fullEndIso = new Date(`${newEndDate}T${newEndTime}:00`).toISOString();
      const res = await extendContract(currentContract.id, {
        newEndDateTime: fullEndIso,
        dailyRate: calculatedMetrics.dailyRate,
        currentOdometerKm: Number(currentOdometer),
        paymentMethod,
        paymentMethodLabel: paymentMethod === 'credit_card' ? 'بطاقة ائتمان' : paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : paymentMethod === 'cash' ? 'نقدي' : 'أخرى',
        issueDate: new Date().toISOString().split('T')[0],
        notes: extensionReason
      });

      if (res.addendum) {
        setGeneratedAddendum(res.addendum);
      } else {
        setGeneratedAddendum({
          id: `EXT-${Date.now()}`,
          addendumNumber: autoAddendumNumber,
          contractId: currentContract.id,
          contractNumber: currentContract.contractNumber || currentContract.id,
          issueDate: new Date().toISOString().split('T')[0],
          customerName: currentContract.customerName,
          customerPhone: currentContract.customerPhone,
          plateNumber: currentContract.vehiclePlate,
          vehicleName: currentContract.vehicleName,
          currentEndDateTime: currentContract.endDateTime,
          newEndDateTime: fullEndIso,
          extensionDurationDays: calculatedMetrics.durationDays,
          currentOdometerKm: Number(currentOdometer),
          dailyRate: calculatedMetrics.dailyRate,
          periodRentalAmount: calculatedMetrics.periodRentalAmount,
          vatRatePercent: 5,
          vatAmount: calculatedMetrics.vatAmount,
          totalExtensionAmount: calculatedMetrics.totalExtensionAmount,
          paymentMethod,
          bankDetails: {
            bankName: bankDetails.bankName,
            accountNumber: bankDetails.accountNumber,
            iban: bankDetails.iban
          },
          notes: extensionReason,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      setActiveTab('preview');
      showToast(
        isAr ? 'تم تمديد العقد بنجاح' : 'Contract Extended',
        isAr ? `تم تمديد العقد #${currentContract.contractNumber} لمدة ${calculatedMetrics.durationDays} يوم بنجاح وتوثيق الملحق الرسمي.` : `Contract #${currentContract.contractNumber} extended for ${calculatedMetrics.durationDays} days.`
      );
    } catch (err: any) {
      showToast(isAr ? 'فشل التمديد' : 'Extension Failed', err.message || 'Error executing contract extension', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    printElementDirectly('extension-addendum-document', `ملحق تمديد العقد #${generatedAddendum?.addendumNumber || autoAddendumNumber}`);
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      const addendumNo = generatedAddendum?.addendumNumber || autoAddendumNumber;
      await downloadElementAsPdf('extension-addendum-document', `Splendor-Extension-${addendumNo}.pdf`);
      showToast(
        isAr ? 'تم حفظ ملف PDF بنجاح' : 'PDF Saved Successfully',
        isAr ? `تم تنزيل ملحق التمديد ${addendumNo} كملف PDF عالي الجودة على جهازك.` : `Extension Addendum ${addendumNo} saved as PDF.`
      );
    } catch (err: any) {
      showToast(isAr ? 'فشل تصدير PDF' : 'PDF Export Failed', err.message || 'Error downloading PDF', 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!currentContract) return;
    const phone = currentContract.customerPhone?.replace(/[^0-9]/g, '');
    if (!phone) {
      showToast(
        isAr ? 'رقم الهاتف غير متوفر' : 'No Phone Number', 
        isAr ? 'لا يوجد رقم هاتف مسجل لهذا العميل لإرسال الواتساب.' : 'Customer has no registered phone number.', 
        'error'
      );
      return;
    }

    const addendumNo = generatedAddendum?.addendumNumber || autoAddendumNumber;
    const days = calculatedMetrics.durationDays;
    const amount = calculatedMetrics.totalExtensionAmount.toLocaleString();
    const formattedEnd = formatDate(newEndDate);

    const message = `مرحباً ${currentContract.customerName}،\n\nنود إعلامكم بأنه تم إصدار ملحق تمديد العقد رقم (${addendumNo}) الخاص بمركبتكم (${currentContract.vehicleName} - لوحة ${currentContract.vehiclePlate}).\n\n📄 تفاصيل التمديد المعتمد:\n- رقم العقد الأصلي: ${currentContract.contractNumber}\n- مدة التمديد: ${days} يوم\n- تاريخ الانتهاء الجديد: ${formattedEnd}\n- إجمالي رسوم التمديد: ${amount} درهم إماراتي (شامل الضريبة 5%)\n\n🏦 الحساب البنكي المعتمد لشركة سبلندر:\n- البنك: ${bankDetails.bankName}\n- رقم الحساب: ${bankDetails.accountNumber}\n- الآيبان (IBAN): ${bankDetails.iban}\n\nشكراً لاختياركم سبلندر لتأجير السيارات.`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    showToast(isAr ? 'تم فتح واتساب' : 'WhatsApp Opened', isAr ? 'تم تجهيز رسالة التمديد الرسمية للعميل.' : 'Extension message opened for WhatsApp.');
  };

  const getPaymentMethodArabic = (method: string) => {
    switch (method) {
      case 'credit_card': return 'بطاقة ائتمان (Credit Card)';
      case 'bank_transfer': return 'تحويل بنكي (Bank Transfer)';
      case 'cash': return 'نقدي (Cash)';
      case 'pos_terminal': return 'جهاز نقاط البيع (POS)';
      case 'crypto': return 'عملات رقمية (Crypto)';
      case 'cheque': return 'شيك مصرفي (Cheque)';
      default: return method;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in font-arabic">
      <div className="relative w-full max-w-5xl my-4 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Modal Top System Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-zinc-950 via-[#071328] to-zinc-950 border-b border-zinc-800 flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#8a701e] flex items-center justify-center text-zinc-950 shadow-lg shadow-[#D4AF37]/20">
              <FileSignature className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30 text-[11px] font-bold">
                  {isAr ? 'ملحق تمديد عقد إيجار رسمي' : 'OFFICIAL CONTRACT EXTENSION ADDENDUM'}
                </span>
                <span className="text-xs text-zinc-400 font-mono">#{autoAddendumNumber}</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 mt-0.5">
                {isAr ? 'تمديد فترة الإيجار وإصدار الملحق المعتمد — سبلندر' : 'Lease Extension & Addendum Issuance — Splendor'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Tabs */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-zinc-950/90 border-b border-zinc-800 text-xs font-semibold no-print overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'details'
                ? 'bg-[#D4AF37] text-zinc-950 shadow-md font-bold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>{isAr ? '١. اختيار العقد وتاريخ التمديد' : '1. Select Contract & Dates'}</span>
          </button>

          <button
            onClick={() => setActiveTab('financials')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'financials'
                ? 'bg-[#D4AF37] text-zinc-950 shadow-md font-bold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>{isAr ? '٢. التسوية المالية والبنك' : '2. Financial Settlement & Bank'}</span>
          </button>

          <button
            onClick={() => {
              if (calculatedMetrics.isValid) setActiveTab('preview');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'preview'
                ? 'bg-[#D4AF37] text-zinc-950 shadow-md font-bold'
                : !calculatedMetrics.isValid
                ? 'text-zinc-600 cursor-not-allowed'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{isAr ? '٣. النموذج المعتمد والطباعة والـ PDF' : '3. Official Document & PDF/Print'}</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar">
          
          {/* TAB 1: SELECT CONTRACT & DATES */}
          {activeTab === 'details' && (
            <div className="space-y-5 animate-fade-in">
              
              {/* Active Contract Selector Dropdown */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-200 flex items-center gap-2">
                    <FileSignature className="w-4 h-4 text-[#f5d97f]" />
                    <span>{isAr ? 'اختر العقد الفعال المراد تمديده:' : 'Select Active Contract to Extend:'}</span>
                  </label>
                  <span className="text-[11px] text-zinc-400">
                    {isAr ? `إجمالي العقود المتاحة: ${activeContracts.length}` : `Available contracts: ${activeContracts.length}`}
                  </span>
                </div>

                <div className="relative">
                  <select
                    value={selectedContractId}
                    onChange={(e) => setSelectedContractId(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-3 focus:outline-none focus:border-[#D4AF37] appearance-none pr-10 cursor-pointer font-bold"
                  >
                    {activeContracts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.contractNumber} • {c.customerName} • {c.vehicleName} (لوحة: {c.vehiclePlate}) • ينتهي: {formatDate(c.endDateTime)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-5 h-5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Selected Contract Info Cards */}
              {currentContract && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-gradient-to-r from-zinc-950 via-zinc-900/60 to-zinc-950 border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500 font-medium">{isAr ? 'المستأجر والهاتف' : 'Client'}</p>
                      <p className="text-sm font-bold text-zinc-100">{currentContract.customerName}</p>
                      <p className="text-xs text-blue-400 font-mono font-semibold" dir="ltr">
                        {currentContract.customerPhone || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                      <Car className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500 font-medium">{isAr ? 'المركبة ورقم اللوحة' : 'Vehicle & Plate'}</p>
                      <p className="text-sm font-bold text-zinc-100">{currentContract.vehicleName}</p>
                      <p className="text-xs text-emerald-400 font-mono font-bold">لوحة: {currentContract.vehiclePlate}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500 font-medium">{isAr ? 'تاريخ انتهاء العقد الحالي' : 'Current Expiry'}</p>
                      <p className="text-sm font-bold text-amber-300 font-mono">{formatDate(currentContract.endDateTime)}</p>
                      <p className="text-[11px] text-zinc-400">رقم العقد: #{currentContract.contractNumber}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Extension Parameters Section */}
              <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                  <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#f5d97f]" />
                    <span>{isAr ? 'تحديد فترة ونهاية العقد الجديد' : 'Set New Expiry & Extension Duration'}</span>
                  </h3>
                  
                  {/* Quick Extension Add Days */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-zinc-500">{isAr ? 'تمديد سريع:' : 'Quick Add:'}</span>
                    {[3, 7, 14, 30].map(days => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => handleQuickAddDays(days)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-300 hover:bg-[#D4AF37] hover:text-zinc-950 transition-colors"
                      >
                        +{days} {isAr ? (days <= 10 ? 'أيام' : 'يوم') : 'Days'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <DayMonthYearDateInput
                      label={isAr ? 'تاريخ نهاية العقد الجديد' : 'New End Date'}
                      required
                      value={newEndDate}
                      min={currentContract?.endDateTime ? currentContract.endDateTime.split('T')[0] : undefined}
                      onChange={setNewEndDate}
                      isAr={isAr}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      {isAr ? 'وقت الإرجاع المتوقع' : 'Return Time'}
                    </label>
                    <input
                      type="time"
                      value={newEndTime}
                      onChange={e => setNewEndTime(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-3 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      {isAr ? 'قراءة العداد الحالية (كم)' : 'Current Odometer (KM)'}
                    </label>
                    <input
                      type="number"
                      value={currentOdometer}
                      onChange={e => setCurrentOdometer(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-3 focus:outline-none focus:border-[#D4AF37] font-mono"
                    />
                  </div>
                </div>

                {/* Duration & Date Preview Box */}
                <div className="p-4 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-[#D4AF37] text-zinc-950 font-extrabold text-xl">
                      {calculatedMetrics.durationDays}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-100">
                        {isAr ? `إجمالي مدة التمديد: ${calculatedMetrics.durationDays} يوم` : `Extension Duration: ${calculatedMetrics.durationDays} Days`}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {isAr ? `من تاريخ ${formatDate(currentContract?.endDateTime)} حتى ${formatDate(newEndDate)}` : `From ${formatDate(currentContract?.endDateTime)} to ${formatDate(newEndDate)}`}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('financials')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold text-xs shadow-lg hover:brightness-110 active:scale-95 transition-all"
                  >
                    <span>{isAr ? 'المتابعة للتسوية المالية' : 'Continue to Financials'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: FINANCIALS & BANK SETTLEMENT */}
          {activeTab === 'financials' && (
            <div className="space-y-5 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Left: Financial Calculations */}
                <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
                  <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 border-b border-zinc-800 pb-3">
                    <DollarSign className="w-4 h-4 text-[#f5d97f]" />
                    <span>{isAr ? 'احتساب قيمة الإيجار والضريبة' : 'Extension Pricing & Tax'}</span>
                  </h3>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      {isAr ? 'سعر الإيجار اليومي المعتمد للتمديد (درهم إماراتي)' : 'Approved Daily Rate (AED)'}
                    </label>
                    <input
                      type="number"
                      value={customDailyRate}
                      onChange={e => setCustomDailyRate(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-3 focus:outline-none focus:border-[#D4AF37] font-bold"
                    />
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {isAr ? 'تم جلب السعر اليومي تلقائياً من العقد الأصلي مع إمكانية التعديل.' : 'Pre-filled from original contract with edit capability.'}
                    </p>
                  </div>

                  <div className="space-y-2.5 pt-2 text-xs border-t border-zinc-800">
                    <div className="flex justify-between py-1 text-zinc-400">
                      <span>{isAr ? `قيمة التمديد قبل الضريبة (${calculatedMetrics.durationDays} يوم × ${calculatedMetrics.dailyRate} درهم):` : `Subtotal (${calculatedMetrics.durationDays} days × ${calculatedMetrics.dailyRate} AED):`}</span>
                      <span className="font-mono font-bold text-zinc-200">{calculatedMetrics.periodRentalAmount.toLocaleString()} AED</span>
                    </div>

                    <div className="flex justify-between py-1 text-zinc-400">
                      <span>{isAr ? 'ضريبة القيمة المضافة (5% VAT):' : 'VAT (5%):'}</span>
                      <span className="font-mono font-bold text-zinc-200">{calculatedMetrics.vatAmount.toLocaleString()} AED</span>
                    </div>

                    <div className="flex justify-between py-2 text-sm font-bold text-[#f5d97f] border-t border-zinc-800">
                      <span>{isAr ? 'إجمالي قيمة التمديد المستحقة:' : 'Total Extension Due:'}</span>
                      <span className="font-mono text-base">{calculatedMetrics.totalExtensionAmount.toLocaleString()} AED</span>
                    </div>
                  </div>
                </div>

                {/* Right: Payment Method & Official Bank Details */}
                <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
                  <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 border-b border-zinc-800 pb-3">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <span>{isAr ? 'طريقة الدفع والحساب البنكي المعتمد' : 'Payment Method & Bank Account'}</span>
                  </h3>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      {isAr ? 'طريقة الدفع' : 'Payment Method'}
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value as any)}
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-3 focus:outline-none focus:border-[#D4AF37]"
                    >
                      <option value="credit_card">{isAr ? 'بطاقة ائتمان' : 'Credit Card'}</option>
                      <option value="bank_transfer">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                      <option value="cash">{isAr ? 'نقدي' : 'Cash'}</option>
                      <option value="pos_terminal">{isAr ? 'جهاز نقاط البيع' : 'POS Terminal'}</option>
                      <option value="crypto">{isAr ? 'عملات رقمية' : 'Crypto'}</option>
                      <option value="cheque">{isAr ? 'شيك بنكي' : 'Cheque'}</option>
                    </select>
                  </div>

                  {/* Official Bank Box from Template */}
                  <div className="p-4 rounded-xl bg-zinc-900 border border-blue-900/40 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
                      <Building2 className="w-4 h-4" />
                      <span>{isAr ? 'بيانات الحساب البنكي المعتمد بالنموذج' : 'Designated Official Bank Account'}</span>
                    </div>
                    <div className="text-xs space-y-1.5 text-zinc-300">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">{isAr ? 'اسم البنك:' : 'Bank:'}</span>
                        <span className="font-bold text-zinc-100">{bankDetails.bankName}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">{isAr ? 'رقم الحساب:' : 'Account No:'}</span>
                        <span className="font-mono text-zinc-100 font-bold" dir="ltr">{bankDetails.accountNumber}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">الآيبان (IBAN):</span>
                        <span className="font-mono text-blue-300 font-bold text-[11px]" dir="ltr">{bankDetails.iban}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      {isAr ? 'ملاحظات إضافية' : 'Notes'}
                    </label>
                    <input
                      type="text"
                      value={extensionReason}
                      onChange={e => setExtensionReason(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs rounded-xl p-2.5 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  {isAr ? '← الرجوع لاختيار العقد والتواريخ' : '← Back to Dates'}
                </button>

                <button
                  type="button"
                  onClick={handleExecuteExtension}
                  disabled={isSubmitting || !calculatedMetrics.isValid}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-sm shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{isAr ? 'جاري إصدار الملحق وتوثيق العقد...' : 'Issuing Official Addendum...'}</span>
                    </>
                  ) : (
                    <>
                      <FileSignature className="w-4 h-4" />
                      <span>{isAr ? 'إصدار وتوثيق ملحق التمديد الجديد' : 'Authorize & Issue Addendum'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: OFFICIAL EXACT PDF PREVIEW (ON OFFICIAL SPLENDOR LETTERHEAD) */}
          {activeTab === 'preview' && (
            <div className="space-y-5 animate-fade-in">
              {/* Action Bar for WhatsApp, Print & Direct PDF Download */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-950 border border-zinc-800 no-print">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-emerald-400">
                    {isAr ? 'تم استخراج وتوثيق ملحق التمديد بنجاح على الترويسة المعتمدة' : 'Official Extension Addendum ready on letterhead.'}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* WhatsApp Direct Send Button */}
                  <button
                    onClick={handleSendWhatsApp}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow active:scale-95 transition-all"
                    title={isAr ? 'إرسال ملحق التمديد للعميل عبر الواتساب' : 'Send Addendum via WhatsApp'}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{isAr ? 'إرسال واتساب' : 'WhatsApp'}</span>
                  </button>

                  {/* Dedicated PDF Download Button (Direct Save) */}
                  <button
                    onClick={handleDownloadPdf}
                    disabled={isDownloadingPdf}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-bold text-xs shadow active:scale-95 transition-all disabled:opacity-50"
                    title={isAr ? 'حفظ ملف PDF مباشرة في مجلد التنزيلات بالجهاز' : 'Save PDF directly to Downloads folder'}
                  >
                    {isDownloadingPdf ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-[#f5d97f]" />
                        <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 text-[#f5d97f]" />
                        <span>{isAr ? 'حفظ كـ PDF على الجهاز' : 'Save PDF to Device'}</span>
                      </>
                    )}
                  </button>

                  {/* Dedicated Direct Print & Save As Dialog Button */}
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow hover:brightness-110 active:scale-95 transition-all"
                    title={isAr ? 'فتح نافذة الطباعة لاختيار الطابعة أو اختيار مجلد الحفظ على جهازك (Save As)' : 'Open print dialog to select printer or save to specific folder'}
                  >
                    <Printer className="w-4 h-4" />
                    <span>{isAr ? 'طباعة / حفظ بمكان مخصص' : 'Print / Save As'}</span>
                  </button>
                </div>
              </div>

              {/* 
                ============================================================
                OFFICIAL LUXURY LETTERHEAD DOCUMENT
                EXACT COMPLIANCE WITH USER'S BRANDING & LEGAL LETTERHEAD
                STRICTLY CONSTRAINED TO SINGLE-PAGE A4 GEOMETRY
                ============================================================
              */}
              <OfficialLetterheadLayout id="extension-addendum-document">
                <div className="flex flex-col justify-between h-full space-y-1.5 text-zinc-900 font-arabic">
                  
                  {/* Document Title */}
                  <div className="text-center my-0.5">
                    <h2 className="text-lg sm:text-xl font-black text-[#991b1b] underline decoration-[#991b1b] decoration-2 underline-offset-4 tracking-wide">
                      ملحق تمديد عقد إيجار
                    </h2>
                    <p className="text-[9px] tracking-[0.2em] text-zinc-600 uppercase font-semibold mt-0.5 font-sans">
                      CONTRACT EXTENSION ADDENDUM
                    </p>
                  </div>

                  {/* Document Identification Table (رقم الملحق / التاريخ / رقم العقد الأصلي / اسم العميل / رقم اللوحة) */}
                  <div className="border border-zinc-400 rounded-md overflow-hidden text-[11px]">
                    <table className="w-full text-center border-collapse">
                      <tbody>
                        <tr className="border-b border-zinc-300 bg-zinc-100 font-bold text-zinc-800 text-[10px]">
                          <td className="py-1 px-2 border-r border-zinc-300 w-1/3">رقم الملحق / Addendum No</td>
                          <td className="py-1 px-2 border-r border-zinc-300 w-1/3">التاريخ / Date</td>
                          <td className="py-1 px-2 w-1/3">رقم العقد الأصلي / Original Contract</td>
                        </tr>
                        <tr className="border-b border-zinc-400 font-mono text-zinc-900">
                          <td className="py-1 px-2 border-r border-zinc-300 font-bold text-xs text-[#991b1b]">
                            {generatedAddendum?.addendumNumber || autoAddendumNumber}
                          </td>
                          <td className="py-1 px-2 border-r border-zinc-300 font-bold text-[11px]">
                            {formatDate(generatedAddendum?.issueDate || new Date())}
                          </td>
                          <td className="py-1 px-2 font-bold text-zinc-950 text-xs">
                            {currentContract?.contractNumber || '—'}
                          </td>
                        </tr>
                        <tr className="border-b border-zinc-300 bg-zinc-100 font-bold text-zinc-800 text-[10px]">
                          <td className="py-1 px-2 border-r border-zinc-300" colSpan={2}>
                            اسم العميل ورقم الهاتف / Customer Details
                          </td>
                          <td className="py-1 px-2">المركبة ورقم اللوحة / Vehicle</td>
                        </tr>
                        <tr className="text-zinc-900">
                          <td className="py-1 px-2 border-r border-zinc-300 font-bold" colSpan={2}>
                            <div className="flex flex-row items-center justify-center gap-2">
                              <span>{currentContract?.customerName}</span>
                              {currentContract?.customerPhone && (
                                <span className="text-[10px] text-zinc-600 font-mono font-semibold" dir="ltr">
                                  ({currentContract.customerPhone})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-1 px-2 font-bold text-zinc-950">
                            {currentContract?.vehicleName} (لوحة: <span className="font-mono">{currentContract?.vehiclePlate}</span>)
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Section: تفاصيل التمديد */}
                  <div className="rounded-md overflow-hidden border border-zinc-400">
                    <div className="bg-[#6b141a] text-white text-center py-0.5 font-bold text-[10px] tracking-wider">
                      تفاصيل التمديد / EXTENSION DETAILS
                    </div>
                    <table className="w-full text-[11px] text-center border-collapse">
                      <tbody>
                        <tr className="bg-zinc-100 font-bold border-b border-zinc-300 text-zinc-800 text-[10px]">
                          <td className="py-1 px-2 border-r border-zinc-300 w-1/3">تاريخ انتهاء المدة الحالية</td>
                          <td className="py-1 px-2 border-r border-zinc-300 w-1/3">تاريخ الانتهاء الجديد</td>
                          <td className="py-1 px-2 w-1/3">مدة التمديد</td>
                        </tr>
                        <tr className="border-b border-zinc-400 font-mono text-zinc-900">
                          <td className="py-1 px-2 border-r border-zinc-300 font-bold text-[11px]">
                            {formatDate(currentContract?.endDateTime)}
                          </td>
                          <td className="py-1 px-2 border-r border-zinc-300 font-bold text-zinc-950 text-xs">
                            {formatDate(newEndDate)}
                          </td>
                          <td className="py-1 px-2 font-bold text-[#991b1b] text-xs">
                            {calculatedMetrics.durationDays} يوم / Days
                          </td>
                        </tr>
                        <tr className="bg-zinc-100 font-bold border-b border-zinc-300 text-zinc-800 text-[10px]">
                          <td className="py-1 px-2 border-r border-zinc-300">قراءة العداد الحالية</td>
                          <td className="py-1 px-2 border-r border-zinc-300">قيمة الإيجار للفترة</td>
                          <td className="py-1 px-2">طريقة الدفع المعتمدة</td>
                        </tr>
                        <tr className="text-zinc-900 font-mono">
                          <td className="py-1 px-2 border-r border-zinc-300 text-[11px]">
                            {currentOdometer.toLocaleString()} KM
                          </td>
                          <td className="py-1 px-2 border-r border-zinc-300 font-bold text-zinc-950 text-xs">
                            {calculatedMetrics.periodRentalAmount.toLocaleString()} AED
                          </td>
                          <td className="py-1 px-2 font-sans font-bold text-[11px]">
                            {getPaymentMethodArabic(paymentMethod)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Section: أثر التمديد */}
                  <div className="rounded-md overflow-hidden border border-zinc-400">
                    <div className="bg-[#6b141a] text-white text-center py-0.5 font-bold text-[10px] tracking-wider">
                      أثر التمديد القانوني / EXTENSION LEGAL EFFECT
                    </div>
                    <div className="p-2 text-[10px] leading-snug text-zinc-800 bg-zinc-50 text-justify">
                      اتفق الطرفان على تمديد مدة عقد الإيجار المشار إليه أعلاه للفترة المحددة في هذا الملحق، وتظل جميع شروط وأحكام العقد الأصلي والشروط والأحكام العامة المرفقة به سارية المفعول دون أي تغيير، ويُعد هذا الملحق جزءاً لا يتجزأ منه، ولا يُعتد بأي تمديد شفهي أو غير موقع من الطرفين.
                    </div>
                  </div>

                  {/* Section: Financial & Notes Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    
                    {/* Financial Settlement Table */}
                    <div className="border border-zinc-400 rounded-md overflow-hidden text-[10.5px]">
                      <table className="w-full border-collapse">
                        <tbody>
                          <tr className="border-b border-zinc-300">
                            <td className="py-1 px-2 bg-zinc-100 font-bold w-3/5 text-zinc-800">قيمة التمديد قبل الضريبة</td>
                            <td className="py-1 px-2 text-center font-mono font-bold text-zinc-900">{calculatedMetrics.periodRentalAmount.toLocaleString()} AED</td>
                          </tr>
                          <tr className="border-b border-zinc-300">
                            <td className="py-1 px-2 bg-zinc-100 font-bold text-zinc-800">ضريبة القيمة المضافة (٥٪ VAT)</td>
                            <td className="py-1 px-2 text-center font-mono font-bold text-zinc-900">{calculatedMetrics.vatAmount.toLocaleString()} AED</td>
                          </tr>
                          <tr className="bg-[#6b141a] text-white font-bold">
                            <td className="py-1 px-2">إجمالي قيمة التمديد المستحقة</td>
                            <td className="py-1 px-2 text-center font-mono text-xs font-black">{calculatedMetrics.totalExtensionAmount.toLocaleString()} AED</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Notes Box */}
                    <div className="border border-zinc-400 rounded-md p-1.5 text-[9px] text-zinc-800 space-y-0.5 bg-zinc-50 flex flex-col justify-center">
                      <div className="font-bold text-[#991b1b] text-[9.5px]">ملاحظات والتزامات:</div>
                      <p>• يجب الحصول على موافقة الشركة قبل التمديد وفقاً للشروط العامة.</p>
                      <p>• التأخر عن التسليم دون موافقة يُحتسب بالسعر اليومي المحدد بالعقد.</p>
                      <p className="font-bold text-zinc-950">• جميع المبالغ بالدرهم الإماراتي (AED).</p>
                    </div>
                  </div>

                  {/* Section: Official Bank Account Box */}
                  <div className="border border-zinc-400 rounded-md overflow-hidden text-[10.5px]">
                    <table className="w-full text-center border-collapse">
                      <tbody>
                        <tr className="bg-zinc-100 font-bold border-b border-zinc-300 text-zinc-800 text-[9.5px]">
                          <td className="py-0.5 px-2 border-r border-zinc-300 w-1/3">اسم البنك المعتمد</td>
                          <td className="py-0.5 px-2 border-r border-zinc-300 w-1/3">رقم الحساب</td>
                          <td className="py-0.5 px-2 w-1/3">الآيبان (IBAN)</td>
                        </tr>
                        <tr className="text-zinc-900 font-mono font-bold text-[10px]">
                          <td className="py-1 px-2 border-r border-zinc-300 font-sans font-bold">{bankDetails.bankName}</td>
                          <td className="py-1 px-2 border-r border-zinc-300 text-zinc-950" dir="ltr">{bankDetails.accountNumber}</td>
                          <td className="py-1 px-2 text-[#991b1b] font-bold" dir="ltr">{bankDetails.iban}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Signatures */}
                  <div className="grid grid-cols-2 gap-6 pt-1 border-t border-zinc-300">
                    <div className="space-y-1">
                      <p className="font-bold text-zinc-900 text-[10px]">توقيع المستأجر (Hirer Signature)</p>
                      <div className="h-8 flex items-end justify-center border-b-2 border-dashed border-zinc-400">
                        <span className="text-[9px] text-zinc-500 font-mono">Digital Signature Verified</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="font-bold text-zinc-900 text-[10px]">ختم وتوقيع سبلندر (Splendor Signature)</p>
                      <div className="h-8 flex items-end justify-center gap-1.5 border-b-2 border-dashed border-zinc-400">
                        <CorporateStampMark className="w-6 h-6 shrink-0" />
                        <span className="text-[9px] text-[#991b1b] font-bold">شركة سبلندر لتأجير السيارات ش.ذ.م.م</span>
                      </div>
                    </div>
                  </div>

                </div>
              </OfficialLetterheadLayout>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
