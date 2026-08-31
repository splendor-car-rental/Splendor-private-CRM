import React, { useState, useMemo } from 'react';
import { 
  ClipboardList, Plus, Search, Filter, Printer, Download, Eye, 
  Trash2, Edit, CheckCircle, Clock, AlertCircle, Building2, Truck, 
  DollarSign, FileSpreadsheet, Send, MessageCircle, RefreshCw, X, ShieldCheck, ChevronRight, Car, Calendar
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate } from '../../lib/dateFormat';
import { 
  PurchaseOrderLetterheadModal, 
  B2BPurchaseOrder, 
  PurchaseOrderItem 
} from '../operations/PurchaseOrderLetterheadModal';

// Preloaded reference order exactly matching user prompt image & sample high-value fleet orders
const INITIAL_PURCHASE_ORDERS: B2BPurchaseOrder[] = [
  {
    id: 'LPO-5158',
    poNumber: 'LPO 5158',
    orderType: 'car_booking',
    date: '2026-02-06T17:00:00.000Z',
    deliveryDate: '2026-01-06T17:00:00.000Z',
    returnDate: '2026-02-08T17:00:00.000Z',
    startTime: '5pm',
    endTime: '5pm',
    status: 'approved',
    supplierName: 'Alayham for Car Rental L.L.C',
    supplierTrn: '100492817300003',
    supplierContact: 'مدير العمليات / Operations Dept',
    supplierPhone: '+971505110410',
    supplierEmail: 'booking@alayhamcar.ae',
    supplierAddress: 'دبي، الإمارات العربية المتحدة',
    department: 'إدارة تشغيل وتوريد أسطول السيارات (B2B Fleet)',
    requestedBy: 'Ahmed Morsy',
    approvedBy: 'Splendor Car Rental LLC - Management',
    projectRef: 'حجز وتوريد سيارة دفع رباعي فارهة للعملاء المميزين',
    vehicleRef: 'BMW X5 2023 (Plate: X 88074)',
    deliveryLocation: 'دبي - تسليم واستلام رسمي',
    splendorTrn: '104391520400003',
    signerName: 'Ahmed Morsy',
    signerTitle: 'Splendor Car Rental LLC',
    liabilityNote: 'We are responsible for any fines and Salik during the validity of the LPO.',
    items: [
      {
        id: '1',
        itemCode: 'CAR-BMW-X5',
        description: 'BMW X5 2023 Luxury SUV Booking',
        vehicleType: 'BMW X5',
        modelYear: '2023',
        plateNumber: 'X 88074',
        quantity: 2,
        unit: 'Days',
        durationText: '2 Days',
        unitPrice: 400,
        vatRate: 0.05,
        vatAmount: 40,
        total: 800
      }
    ],
    subtotal: 760,
    vatTotal: 40,
    grandTotal: 800,
    paymentTerms: 'Kindly issue a tax invoice under VAT Registration Number (104391520400003)',
    notes: 'We appreciate your continuous support and confirm our commitment to return the vehicle on time and in the same condition received.'
  },
  {
    id: 'LPO-5159',
    poNumber: 'LPO 5159',
    orderType: 'car_booking',
    date: new Date().toISOString(),
    deliveryDate: new Date().toISOString().split('T')[0],
    returnDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    startTime: '3pm',
    endTime: '3pm',
    status: 'approved',
    supplierName: 'مؤسسة إيليت درايف لتأجير السيارات الفارهة (Elite Luxury Cars)',
    supplierTrn: '100883719200003',
    supplierContact: 'أ. طارق الهاشمي',
    supplierPhone: '+971556633211',
    supplierEmail: 'info@elitedrive.ae',
    supplierAddress: 'دبي، الخليج التجاري',
    department: 'قسم السيارات السوبر والفاخرة',
    requestedBy: 'Ahmed Morsy',
    approvedBy: 'Splendor Car Rental LLC',
    vehicleRef: 'Mercedes-Benz G63 AMG (Dubai K 9901)',
    deliveryLocation: 'مقر شركة سبلندر - برج سيلفر تاور، الخليج التجاري، دبي',
    splendorTrn: '104391520400003',
    signerName: 'Ahmed Morsy',
    signerTitle: 'Splendor Car Rental LLC',
    liabilityNote: 'We are responsible for any fines and Salik during the validity of the LPO.',
    items: [
      {
        id: '1',
        description: 'Mercedes-Benz G63 AMG 2024 Black Edition',
        vehicleType: 'Mercedes-Benz G63 AMG',
        modelYear: '2024',
        plateNumber: 'K 9901',
        quantity: 3,
        unit: 'Days',
        durationText: '3 Days',
        unitPrice: 2200,
        vatRate: 0.05,
        vatAmount: 330,
        total: 6600
      }
    ],
    subtotal: 6270,
    vatTotal: 330,
    grandTotal: 6600,
    paymentTerms: 'سداد بموجب فاتورة ضريبية معتمدة على رقم TRN 104391520400003',
    notes: 'السيارة بحالة الوكالة ومغطاة بتأمين شامل.'
  },
  {
    id: 'LPO-2026-0092',
    poNumber: 'LPO-2026-0092',
    orderType: 'parts_and_services',
    date: new Date(Date.now() - 3 * 86400000).toISOString(),
    deliveryDate: new Date(Date.now() + 4 * 86400000).toISOString(),
    status: 'sent',
    supplierName: 'مؤسسة الغاندي للسيارات (Al Ghandi Auto LLC)',
    supplierTrn: '100239485200003',
    supplierContact: 'م. سامر الخالدي',
    supplierPhone: '+971508821900',
    supplierEmail: 'procurement@alghandi.com',
    supplierAddress: 'دبي، شارع الاتحاد، ديرة',
    department: 'إدارة العمليات والصيانة الدورية',
    requestedBy: 'أحمد مرسي - مدير العمليات',
    approvedBy: 'الإدارة التنفيذية - سبلندر',
    vehicleRef: 'Rolls-Royce Cullinan (Dubai 77899)',
    deliveryLocation: 'مركز خدمة سبلندر - القوز الصناعية 3، دبي',
    items: [
      {
        id: '1',
        itemCode: 'RR-BRK-990',
        description: 'طقم وسادات فرامل أمامية وخلفية أصلية سيراميك Rolls-Royce Cullinan',
        quantity: 2,
        unit: 'طقم / Set',
        unitPrice: 4800,
        vatRate: 0.05,
        vatAmount: 480,
        total: 10080
      },
      {
        id: '2',
        itemCode: 'MOT-OIL-05W40',
        description: 'زيت محرك تخليقي عالي الأداء معتمد VIP Synthetic Engine Oil (برميل 60 لتر)',
        quantity: 3,
        unit: 'برميل / Drum',
        unitPrice: 2200,
        vatRate: 0.05,
        vatAmount: 330,
        total: 6930
      }
    ],
    subtotal: 16200,
    vatTotal: 810,
    grandTotal: 17010,
    paymentTerms: 'سداد آجل 30 يوم من استلام الفاتورة وسند الإدخال',
    notes: 'يرجى الالتزام بتوريد قطع أصلية 100% مع شهادة الضمان المصنعي المعتمدة.'
  }
];

export const PurchaseOrdersManagementView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast, vehicles } = useCRM();
  const { currentUser } = useAuth();

  const [orders, setOrders] = useState<B2BPurchaseOrder[]>(() => {
    const saved = localStorage.getItem('splendor_purchase_orders_list');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_PURCHASE_ORDERS;
      }
    }
    return INITIAL_PURCHASE_ORDERS;
  });

  const saveOrders = (newOrders: B2BPurchaseOrder[]) => {
    setOrders(newOrders);
    localStorage.setItem('splendor_purchase_orders_list', JSON.stringify(newOrders));
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  // Modals state
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<B2BPurchaseOrder | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalTab, setCreateModalTab] = useState<'type_and_vendor' | 'vehicle_and_booking' | 'terms_and_signatures'>('type_and_vendor');

  // Form State for new LPO
  const [formData, setFormData] = useState<{
    poNumber: string;
    orderType: 'car_booking' | 'parts_and_services';
    supplierName: string;
    supplierTrn: string;
    supplierContact: string;
    supplierPhone: string;
    supplierEmail: string;
    supplierAddress: string;
    department: string;
    date: string;
    deliveryDate: string; // From Date
    returnDate: string; // Till Date
    startTime: string;
    endTime: string;
    deliveryLocation: string;
    projectRef: string;
    vehicleRef: string;
    splendorTrn: string;
    signerName: string;
    signerTitle: string;
    paymentTerms: string;
    notes: string;
    
    // Quick vehicle booking fields
    vehicleType: string;
    modelYear: string;
    plateNumber: string;
    dailyRateIncludingVat: number;
    durationDays: number;
    
    // General items array
    items: PurchaseOrderItem[];
  }>({
    poNumber: `LPO 515${orders.length + 9}`,
    orderType: 'car_booking',
    supplierName: 'Alayham for Car Rental L.L.C',
    supplierTrn: '100492817300003',
    supplierContact: 'مدير الحجوزات',
    supplierPhone: '+971505110410',
    supplierEmail: 'info@suppliercar.ae',
    supplierAddress: 'دبي، الإمارات العربية المتحدة',
    department: 'إدارة تشغيل وتوريد السيارات (B2B Car Supply)',
    date: new Date().toISOString().split('T')[0],
    deliveryDate: new Date().toISOString().split('T')[0],
    returnDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    startTime: '5pm',
    endTime: '5pm',
    deliveryLocation: 'دبي - تسليم فوري',
    projectRef: 'توريد وحجز سيارة لعميل VIP',
    vehicleRef: 'BMW X5 2023',
    splendorTrn: '104391520400003',
    signerName: 'Ahmed Morsy',
    signerTitle: 'Splendor Car Rental LLC',
    paymentTerms: 'Kindly issue a tax invoice under VAT Registration Number (104391520400003)',
    notes: 'We appreciate your continuous support and confirm our commitment to return the vehicle on time and in the same condition received.',
    
    vehicleType: 'BMW X5',
    modelYear: '2023',
    plateNumber: 'X 88074',
    dailyRateIncludingVat: 400,
    durationDays: 2,
    
    items: [
      {
        id: '1',
        itemCode: 'CAR-BMW-X5',
        description: 'BMW X5 2023 Luxury SUV',
        vehicleType: 'BMW X5',
        modelYear: '2023',
        plateNumber: 'X 88074',
        quantity: 2,
        unit: 'Days',
        durationText: '2 Days',
        unitPrice: 400,
        vatRate: 0.05,
        vatAmount: 40,
        total: 800
      }
    ]
  });

  // Calculate live item and totals in form
  const formMetrics = useMemo(() => {
    if (formData.orderType === 'car_booking') {
      const grandTotal = (formData.durationDays || 1) * (formData.dailyRateIncludingVat || 0);
      const subtotal = Math.round((grandTotal / 1.05) * 100) / 100;
      const vatTotal = Math.round((grandTotal - subtotal) * 100) / 100;
      return { subtotal, vatTotal, grandTotal };
    } else {
      const subtotal = formData.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0);
      const vatTotal = Math.round((subtotal * 0.05) * 100) / 100;
      const grandTotal = subtotal + vatTotal;
      return { subtotal, vatTotal, grandTotal };
    }
  }, [formData]);

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: String(Date.now()),
          itemCode: '',
          description: '',
          vehicleType: '',
          modelYear: '2024',
          plateNumber: '',
          quantity: 1,
          unit: 'Days',
          durationText: '1 Day',
          unitPrice: 0,
          vatRate: 0.05,
          vatAmount: 0,
          total: 0
        }
      ]
    }));
  };

  const handleRemoveItem = (index: number) => {
    if (formData.items.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleItemChange = (index: number, field: keyof PurchaseOrderItem, value: any) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      const item = { ...newItems[index], [field]: value };
      
      const qty = field === 'quantity' ? Number(value) : item.quantity;
      const price = field === 'unitPrice' ? Number(value) : item.unitPrice;
      const lineSub = (qty || 0) * (price || 0);
      const vat = Math.round((lineSub * 0.05) * 100) / 100;
      
      item.vatAmount = vat;
      item.total = lineSub + vat;
      
      newItems[index] = item;
      return { ...prev, items: newItems };
    });
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplierName.trim()) {
      showToast(isAr ? 'بيانات ناقصة' : 'Missing Info', isAr ? 'يرجى إدخال اسم الشركة المطلوب التوريد منها.' : 'Please provide supplier name.', 'error');
      setCreateModalTab('type_and_vendor');
      return;
    }

    const itemsToSave: PurchaseOrderItem[] = formData.orderType === 'car_booking'
      ? [
          {
            id: '1',
            itemCode: `CAR-${formData.vehicleType.replace(/\s+/g, '-').toUpperCase()}`,
            description: `${formData.vehicleType} ${formData.modelYear} Booking`,
            vehicleType: formData.vehicleType,
            modelYear: formData.modelYear,
            plateNumber: formData.plateNumber,
            quantity: formData.durationDays,
            unit: 'Days',
            durationText: `${formData.durationDays} Days`,
            unitPrice: formData.dailyRateIncludingVat,
            vatRate: 0.05,
            vatAmount: formMetrics.vatTotal,
            total: formMetrics.grandTotal
          }
        ]
      : formData.items;

    const newPO: B2BPurchaseOrder = {
      id: formData.poNumber,
      poNumber: formData.poNumber,
      orderType: formData.orderType,
      date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString(),
      deliveryDate: formData.deliveryDate,
      returnDate: formData.returnDate,
      startTime: formData.startTime,
      endTime: formData.endTime,
      status: 'approved',
      supplierName: formData.supplierName,
      supplierTrn: formData.supplierTrn,
      supplierContact: formData.supplierContact,
      supplierPhone: formData.supplierPhone,
      supplierEmail: formData.supplierEmail,
      supplierAddress: formData.supplierAddress,
      department: formData.department,
      requestedBy: formData.signerName || currentUser.name || 'Ahmed Morsy',
      approvedBy: 'Splendor Car Rental LLC',
      projectRef: formData.projectRef,
      vehicleRef: formData.orderType === 'car_booking' ? `${formData.vehicleType} ${formData.modelYear} (${formData.plateNumber})` : formData.vehicleRef,
      deliveryLocation: formData.deliveryLocation,
      splendorTrn: formData.splendorTrn || '104391520400003',
      signerName: formData.signerName || 'Ahmed Morsy',
      signerTitle: formData.signerTitle || 'Splendor Car Rental LLC',
      liabilityNote: 'We are responsible for any fines and Salik during the validity of the LPO.',
      items: itemsToSave,
      subtotal: formMetrics.subtotal,
      vatTotal: formMetrics.vatTotal,
      grandTotal: formMetrics.grandTotal,
      paymentTerms: formData.paymentTerms,
      notes: formData.notes
    };

    saveOrders([newPO, ...orders]);
    setCreateModalOpen(false);
    showToast(
      isAr ? 'تم إنشاء أمر التوريد بنجاح' : 'Purchase Order Created',
      isAr ? `تم تسجيل أمر توريد السيارات رقم ${newPO.poNumber} بنجاح.` : `LPO #${newPO.poNumber} created successfully.`
    );
    setSelectedOrderForPrint(newPO);
  };

  const handleUpdateStatus = (poId: string, newStatus: B2BPurchaseOrder['status']) => {
    const updated = orders.map(o => o.id === poId ? { ...o, status: newStatus } : o);
    saveOrders(updated);
    showToast(
      isAr ? 'تم تحديث حالة أمر التوريد' : 'Status Updated',
      isAr ? `أصبح أمر التوريد في حالة: ${newStatus}` : `PO status changed to ${newStatus}`
    );
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesSearch = 
        o.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.vehicleRef && o.vehicleRef.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (o.department && o.department.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchesType = typeFilter === 'all' || o.orderType === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [orders, searchTerm, statusFilter, typeFilter]);

  const summaryStats = useMemo(() => {
    const totalCount = orders.length;
    const totalAmount = orders.reduce((sum, o) => sum + o.grandTotal, 0);
    const carBookingCount = orders.filter(o => o.orderType === 'car_booking' || !o.orderType).length;
    const approvedCount = orders.filter(o => o.status === 'approved' || o.status === 'sent').length;
    return { totalCount, totalAmount, carBookingCount, approvedCount };
  }, [orders]);

  const getStatusBadge = (status: B2BPurchaseOrder['status']) => {
    switch (status) {
      case 'approved': return <Badge variant="emerald" size="sm">{isAr ? 'معتمد رسمي' : 'Approved'}</Badge>;
      case 'sent': return <Badge variant="sky" size="sm">{isAr ? 'مرسل للمورد' : 'Sent'}</Badge>;
      case 'fulfilled': return <Badge variant="emerald" size="sm">{isAr ? 'تم الاستلام والإغلاق' : 'Fulfilled'}</Badge>;
      case 'pending_approval': return <Badge variant="amber" size="sm">{isAr ? 'بانتظار الاعتماد' : 'Pending'}</Badge>;
      case 'cancelled': return <Badge variant="rose" size="sm">{isAr ? 'ملغى' : 'Cancelled'}</Badge>;
      default: return <Badge variant="zinc" size="sm">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 font-arabic animate-fade-in pb-12">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30 text-xs font-bold flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5" />
              <span>{isAr ? 'نظام أوامر توريد السيارات للشركات (B2B LPO)' : 'B2B VEHICLE SUPPLY ORDERS'}</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-zinc-100 mt-1">
            {isAr ? 'أوامر توريد وحجز السيارات (LPO)' : 'B2B Car Supply & Purchase Orders'}
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {isAr 
              ? 'إصدار أوامر التوريد والحجز الصادرة من شركة سبلندر للشركات والمكاتب الزميلة على الهيد ليتر الرسمي مع الالتزام بالمخالفات وسالك والرقم الضريبي.'
              : 'Issue luxury vehicle booking LPOs to peer rental companies with full compliance on fines, Salik, VAT, and official letterhead.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setFormData({
                poNumber: `LPO 515${orders.length + 9}`,
                orderType: 'car_booking',
                supplierName: '',
                supplierTrn: '',
                supplierContact: '',
                supplierPhone: '',
                supplierEmail: '',
                supplierAddress: 'دبي، الإمارات',
                department: 'إدارة تشغيل وتوريد السيارات (B2B Fleet)',
                date: new Date().toISOString().split('T')[0],
                deliveryDate: new Date().toISOString().split('T')[0],
                returnDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
                startTime: '5pm',
                endTime: '5pm',
                deliveryLocation: 'دبي - تسليم واستلام رسمي',
                projectRef: 'حجز سيارة لعميل VIP',
                vehicleRef: '',
                splendorTrn: '104391520400003',
                signerName: 'Ahmed Morsy',
                signerTitle: 'Splendor Car Rental LLC',
                paymentTerms: 'Kindly issue a tax invoice under VAT Registration Number (104391520400003)',
                notes: 'We appreciate your continuous support and confirm our commitment to return the vehicle on time and in the same condition received.',
                vehicleType: '',
                modelYear: '2023',
                plateNumber: '',
                dailyRateIncludingVat: 400,
                durationDays: 2,
                items: [
                  {
                    id: '1',
                    itemCode: '',
                    description: '',
                    vehicleType: '',
                    modelYear: '2023',
                    plateNumber: '',
                    quantity: 2,
                    unit: 'Days',
                    durationText: '2 Days',
                    unitPrice: 400,
                    vatRate: 0.05,
                    vatAmount: 40,
                    total: 800
                  }
                ]
              });
              setCreateModalTab('type_and_vendor');
              setCreateModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow-lg shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إنشاء أمر توريد سيارة جديد (LPO)' : 'New Vehicle LPO'}</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-zinc-400">{isAr ? 'إجمالي أوامر التوريد' : 'Total LPOs'}</p>
            <p className="text-2xl font-black text-zinc-100 font-mono">{summaryStats.totalCount}</p>
            <p className="text-[11px] text-[#f5d97f] font-semibold">{summaryStats.carBookingCount} {isAr ? 'حجوزات سيارات شركات' : 'Car bookings'}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-zinc-800/80 flex items-center justify-center text-[#D4AF37]">
            <ClipboardList className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-zinc-400">{isAr ? 'القيمة الإجمالية الصادرة' : 'Total Outgoing Value'}</p>
            <p className="text-2xl font-black text-[#f5d97f] font-mono">{summaryStats.totalAmount.toLocaleString()} <span className="text-xs text-zinc-400">AED</span></p>
            <p className="text-[11px] text-emerald-400 font-semibold">{isAr ? 'شاملة ضريبة 5% وسالك' : 'Incl. 5% VAT'}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#D4AF37]">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-zinc-400">{isAr ? 'أوامر معتمدة وجارية' : 'Approved & Active'}</p>
            <p className="text-2xl font-black text-sky-400 font-mono">{summaryStats.approvedCount}</p>
            <p className="text-[11px] text-zinc-500">{isAr ? 'سيارات تحت التشغيل حالياً' : 'Cars in active operation'}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Car className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-zinc-400">{isAr ? 'الرقم الضريبي المعتمد' : 'VAT Registration (TRN)'}</p>
            <p className="text-xs font-mono font-bold text-zinc-200 tracking-wider">104391520400003</p>
            <p className="text-[11px] text-emerald-400 font-semibold">{isAr ? 'معتمد في جميع الـ LPOs' : 'Standard in all orders'}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isAr ? 'بحث برقم LPO، اسم الشركة الموردة، نوع السيارة...' : 'Search by LPO#, company, car model...'}
            className="w-full pr-9 pl-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {/* Order Type Toggle */}
          <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                typeFilter === 'all' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setTypeFilter('car_booking')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1 ${
                typeFilter === 'car_booking' ? 'bg-[#D4AF37] text-zinc-950 shadow font-bold' : 'text-zinc-400'
              }`}
            >
              <Car className="w-3 h-3" />
              <span>توريد سيارات</span>
            </button>
            <button
              onClick={() => setTypeFilter('parts_and_services')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                typeFilter === 'parts_and_services' ? 'bg-[#D4AF37] text-zinc-950 shadow font-bold' : 'text-zinc-400'
              }`}
            >
              قطع وتجهيزات
            </button>
          </div>

          {['all', 'approved', 'sent', 'fulfilled'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === st
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow font-bold'
                  : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {st === 'all' && (isAr ? 'الكل' : 'All')}
              {st === 'approved' && (isAr ? 'معتمد' : 'Approved')}
              {st === 'sent' && (isAr ? 'مرسل' : 'Sent')}
              {st === 'fulfilled' && (isAr ? 'مغلق' : 'Fulfilled')}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800">
                <th className="p-3.5 pr-5">رقم LPO / التاريخ</th>
                <th className="p-3.5">الشركة الموردة للسيارة (Vendor)</th>
                <th className="p-3.5">السيارة / الموديل / اللوحة</th>
                <th className="p-3.5">فترة الحجز والتوريد</th>
                <th className="p-3.5">السعر اليومي والإجمالي</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5 text-center">المعاينة والطباعة وPDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {filteredOrders.map(po => {
                const firstItem = po.items[0];
                return (
                  <tr key={po.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3.5 pr-5">
                      <div className="font-mono font-black text-zinc-100 text-sm">{po.poNumber}</div>
                      <div className="text-[11px] text-zinc-500">{formatDate(po.date)}</div>
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-zinc-100">{po.supplierName}</div>
                      <div className="text-[11px] text-zinc-400 font-mono" dir="ltr">{po.supplierPhone || '—'}</div>
                    </td>
                    <td className="p-3.5">
                      {firstItem?.vehicleType ? (
                        <div>
                          <div className="font-bold text-[#f5d97f] flex items-center gap-1.5">
                            <Car className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>{firstItem.vehicleType}</span>
                            <span className="text-zinc-400 text-[11px] font-mono">({firstItem.modelYear || '2023'})</span>
                          </div>
                          {firstItem.plateNumber && (
                            <div className="text-[11px] text-zinc-400 font-mono">Plate: {firstItem.plateNumber}</div>
                          )}
                        </div>
                      ) : (
                        <div className="font-semibold text-zinc-300">{po.vehicleRef || po.department}</div>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="text-zinc-200 font-semibold font-mono text-[11px]">
                        من {formatDate(po.deliveryDate)} {po.startTime || ''}
                      </div>
                      <div className="text-zinc-400 font-mono text-[11px]">
                        إلى {formatDate(po.returnDate || po.deliveryDate)} {po.endTime || ''}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="font-mono font-bold text-[#f5d97f] text-sm">
                        {po.grandTotal.toLocaleString()} AED
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        {firstItem?.unitPrice ? `${firstItem.unitPrice} AED/Day` : `${po.items.length} بنود`}
                      </div>
                    </td>
                    <td className="p-3.5">
                      {getStatusBadge(po.status)}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Master Letterhead Preview & Print Button */}
                        <button
                          onClick={() => setSelectedOrderForPrint(po)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-black transition-all shadow hover:brightness-110 active:scale-95"
                          title={isAr ? 'معاينة وطباعة أمر التوريد على الهيد ليتر وحفظه كـ PDF' : 'Official Letterhead & PDF'}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>{isAr ? 'الهيد ليتر / PDF' : 'Print / PDF'}</span>
                        </button>

                        {/* Status quick toggle */}
                        {po.status === 'approved' && (
                          <button
                            onClick={() => handleUpdateStatus(po.id, 'sent')}
                            className="px-2.5 py-1.5 rounded-lg bg-sky-950/60 text-sky-300 hover:bg-sky-900 border border-sky-800 font-semibold text-[11px]"
                            title="تحديد كمرسل للشركة"
                          >
                            إرسال
                          </button>
                        )}

                        {po.status === 'sent' && (
                          <button
                            onClick={() => handleUpdateStatus(po.id, 'fulfilled')}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900 border border-emerald-800 font-semibold text-[11px]"
                            title="تحديد كتم استلام السيارة"
                          >
                            تم الاستلام
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredOrders.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              <Car className="w-8 h-8 mx-auto mb-2 opacity-50 text-zinc-600" />
              <p>{isAr ? 'لا توجد أوامر توريد مطابقة للبحث.' : 'No vehicle supply orders found.'}</p>
            </div>
          )}
        </div>
      </div>

      {/* ================= CREATE NEW VEHICLE LPO MODAL WITH EXACT TABS ================= */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={isAr ? `إنشاء أمر توريد وحجز سيارة رسمي (${formData.poNumber})` : 'Create Official Vehicle Purchase Order (LPO)'}
        subtitle={isAr ? 'نموذج إصدار أمر توريد سيارات فارهة صادر للشركات والموردين على الهيد ليتر المعتمد' : 'Official Corporate Vehicle Booking LPO on Splendor Letterhead'}
        maxWidth="4xl"
      >
        <form onSubmit={handleCreateOrder} className="space-y-5 font-arabic text-xs">
          
          {/* Tab Navigation inside Modal */}
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
            {[
              { id: 'type_and_vendor', label: isAr ? '1. بيانات الشركة الموردة ورقم الـ LPO' : '1. Supplier & LPO#' },
              { id: 'vehicle_and_booking', label: isAr ? '2. تفاصيل السيارة والتواريخ والأسعار' : '2. Car Details & Dates' },
              { id: 'terms_and_signatures', label: isAr ? '3. الشروط الضريبية والاعتماد والتوقيع' : '3. Terms & Signature' }
            ].map(t => (
              <button
                type="button"
                key={t.id}
                onClick={() => setCreateModalTab(t.id as any)}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                  createModalTab === t.id
                    ? 'bg-[#D4AF37] text-zinc-950 shadow'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB 1: VENDOR & LPO BASICS */}
          {createModalTab === 'type_and_vendor' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-zinc-300 font-bold">نوع أمر التوريد</label>
                  <select
                    value={formData.orderType}
                    onChange={(e) => setFormData({ ...formData, orderType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-[#f5d97f] font-bold"
                  >
                    <option value="car_booking">🚗 توريد وحجز سيارة من شركة زميلة (Car Booking)</option>
                    <option value="parts_and_services">🛠️ توريد قطع غيار وتجهيزات وصيانة عامة</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-zinc-300 font-bold">رقم أمر التوريد (LPO Number)</label>
                  <input
                    type="text"
                    value={formData.poNumber}
                    onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono font-black"
                    placeholder="LPO 5158"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-zinc-300 font-bold">تاريخ إصدار الـ LPO</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono"
                    required
                  />
                </div>
              </div>

              {/* Vendor Details */}
              <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                <div className="flex items-center gap-2 text-[#f5d97f] font-bold border-b border-zinc-800 pb-2">
                  <Building2 className="w-4 h-4" />
                  <span>الشركة المطلوب توريد وحجز السيارة منها (Supplier / Car Rental Company)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-zinc-400">اسم الشركة الموردة بالإنجليزية/العربية *</label>
                    <input
                      type="text"
                      placeholder="مثال: Alayham for Car Rental L.L.C"
                      value={formData.supplierName}
                      onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-bold"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-zinc-400">الرقم الضريبي للشركة الموردة (TRN)</label>
                    <input
                      type="text"
                      placeholder="100xxxxxxxxxxxx"
                      value={formData.supplierTrn}
                      onChange={(e) => setFormData({ ...formData, supplierTrn: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-zinc-400">هاتف الشركة (لإرسال LPO واتساب مباشرة)</label>
                    <input
                      type="text"
                      placeholder="+971 50 xxx xxxx"
                      value={formData.supplierPhone}
                      onChange={(e) => setFormData({ ...formData, supplierPhone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-zinc-400">البريد الإلكتروني للشركة</label>
                    <input
                      type="email"
                      placeholder="booking@supplier.com"
                      value={formData.supplierEmail}
                      onChange={(e) => setFormData({ ...formData, supplierEmail: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setCreateModalTab('vehicle_and_booking')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold"
                >
                  <span>التالي: تفاصيل السيارة والتواريخ والأسعار</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: VEHICLE DETAILS & BOOKING DURATION */}
          {createModalTab === 'vehicle_and_booking' && (
            <div className="space-y-4 animate-fade-in">
              {formData.orderType === 'car_booking' ? (
                <div className="space-y-4">
                  {/* Vehicle Technical Specifications Matrix (Matching Reference Sheet) */}
                  <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-[#f5d97f] font-bold border-b border-zinc-800 pb-2">
                      <Car className="w-4 h-4" />
                      <span>مواصفات السيارة المطلوبة وبيانات اللوحة (Vehicle Details Table)</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-zinc-300 font-bold">نوع وفئة السيارة (Vehicle Type) *</label>
                        <input
                          type="text"
                          placeholder="مثال: BMW X5 / Mercedes G63 / Range Rover"
                          value={formData.vehicleType}
                          onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-bold text-sm"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-300 font-bold">سنة الموديل (Model)</label>
                        <input
                          type="text"
                          placeholder="2023 / 2024"
                          value={formData.modelYear}
                          onChange={(e) => setFormData({ ...formData, modelYear: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-300 font-bold">رقم اللوحة (Plate Number)</label>
                        <input
                          type="text"
                          placeholder="مثال: X 88074 / Dubai K 992"
                          value={formData.plateNumber}
                          onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono font-bold tracking-wider"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Booking Dates & Times */}
                  <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-[#f5d97f] font-bold border-b border-zinc-800 pb-2">
                      <Calendar className="w-4 h-4" />
                      <span>فترة الحجز والتوريد وساعات الاستلام والتسليم</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-zinc-400 font-bold">تاريخ البدء (From Date) *</label>
                        <input
                          type="date"
                          value={formData.deliveryDate}
                          onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono font-bold"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-400">ساعة البدء (Start Time)</label>
                        <input
                          type="text"
                          placeholder="مثال: 5pm"
                          value={formData.startTime}
                          onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-400 font-bold">تاريخ الانتهاء (Till Date) *</label>
                        <input
                          type="date"
                          value={formData.returnDate}
                          onChange={(e) => setFormData({ ...formData, returnDate: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono font-bold"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-400">ساعة الانتهاء (End Time)</label>
                        <input
                          type="text"
                          placeholder="مثال: 5pm"
                          value={formData.endTime}
                          onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Financial Rate & Duration */}
                  <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-zinc-300 font-bold">السعر اليومي شامل الضريبة (Per Day Incl. VAT) *</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={formData.dailyRateIncludingVat}
                            onChange={(e) => setFormData({ ...formData, dailyRateIncludingVat: Number(e.target.value) })}
                            className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[#f5d97f] font-mono font-black text-base"
                            placeholder="400"
                            required
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-xs">AED</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-300 font-bold">المدة بالأيام (Duration) *</label>
                        <input
                          type="number"
                          min="1"
                          value={formData.durationDays}
                          onChange={(e) => setFormData({ ...formData, durationDays: Number(e.target.value) })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono font-bold text-base text-center"
                          placeholder="2"
                          required
                        />
                      </div>

                      <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col justify-center">
                        <span className="text-[11px] text-zinc-400">الإجمالي النهائي الصافي:</span>
                        <span className="text-xl font-mono font-black text-[#f5d97f]">
                          {formMetrics.grandTotal.toLocaleString()} AED
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Multi-Item General Procurement Table */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-zinc-300 font-bold">جدول أصناف ومواصفات التوريد المطلوبة</p>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-[#f5d97f] font-bold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة صنف جديد</span>
                    </button>
                  </div>

                  {formData.items.map((item, idx) => (
                    <div key={item.id || idx} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#f5d97f] font-mono">بند #{idx + 1}</span>
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-red-400 hover:bg-red-950/40 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <div className="md:col-span-6">
                          <label className="text-[10px] text-zinc-400">الوصف الفني *</label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-semibold"
                            required
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-[10px] text-zinc-400">الكمية</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                            className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-center font-bold"
                          />
                        </div>
                        <div className="md:col-span-4">
                          <label className="text-[10px] text-zinc-400">سعر الوحدة (AED)</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(idx, 'unitPrice', Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono font-bold text-center"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setCreateModalTab('type_and_vendor')}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-bold"
                >
                  السابق
                </button>
                <button
                  type="button"
                  onClick={() => setCreateModalTab('terms_and_signatures')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold"
                >
                  <span>التالي: الشروط الضريبية والاعتماد والتوقيع</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: TAX & LEGAL STATEMENTS & SIGNATURES */}
          {createModalTab === 'terms_and_signatures' && (
            <div className="space-y-4 animate-fade-in">
              {/* Reference Legal Texts (Auto-Included) */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center gap-2 text-[#f5d97f] font-bold border-b border-zinc-800 pb-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>النصوص القانونية والضريبية المعتمدة (تظهر مطابقة للنموذج المرجعي)</span>
                </div>

                <div className="space-y-2 text-zinc-300 text-xs leading-relaxed bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
                  <p className="flex items-start gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>مسؤولية المخالفات وسالك:</strong> We are responsible for any fines and Salik during the validity of the LPO.</span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>الفاتورة الضريبية:</strong> Kindly issue a tax invoice under VAT Registration Number (104391520400003) covering all related details and requirements.</span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>الالتزام بالحالة والموعد:</strong> We appreciate your continuous support and confirm our commitment to return the vehicle on time and in the same condition received.</span>
                  </p>
                </div>
              </div>

              {/* Signatures & Authorizations */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center gap-2 text-[#f5d97f] font-bold border-b border-zinc-800 pb-2">
                  <Building2 className="w-4 h-4" />
                  <span>بيانات التوقيع والاعتماد والختم الرسمي</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-zinc-300 font-bold">اسم الشركة المعتمدة</label>
                    <input
                      type="text"
                      value="Splendor Car Rental LLC"
                      readOnly
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-zinc-300 font-bold">اسم المسؤول الموقع (Signer Name)</label>
                    <input
                      type="text"
                      value={formData.signerName}
                      onChange={(e) => setFormData({ ...formData, signerName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-bold"
                      placeholder="Ahmed Morsy"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-zinc-300 font-bold">الرقم الضريبي لشركة سبلندر (TRN)</label>
                    <input
                      type="text"
                      value={formData.splendorTrn}
                      onChange={(e) => setFormData({ ...formData, splendorTrn: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[#f5d97f] font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalTab('vehicle_and_booking')}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-bold"
                >
                  السابق
                </button>

                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-black text-xs shadow-lg shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>اعتماد وإصدار أمر التوريد والطباعة</span>
                </button>
              </div>
            </div>
          )}

        </form>
      </Modal>

      {/* Printable Master Letterhead Modal with Authentic Design & Live Print / PDF Engine */}
      {selectedOrderForPrint && (
        <PurchaseOrderLetterheadModal
          isOpen={!!selectedOrderForPrint}
          onClose={() => setSelectedOrderForPrint(null)}
          purchaseOrder={selectedOrderForPrint}
        />
      )}

    </div>
  );
};
