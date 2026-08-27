import {
  Customer, Lead, Opportunity, Vehicle, Quotation, Reservation,
  Contract, AdditionalCharge, Deposit, Payment, Invoice,
  BankImportBatch, BankTransaction, CRMTask, Communication,
  CRMDocument, DocumentTemplate, AuditLog, CustomFieldDefinition,
  NumberingConfig, SystemHealth, NotificationItem, User,
  TollTransaction, TollImportBatch, TollPricingConfig,
  PlateAssignmentHistory, VehicleTimelineEvent, PublicVehicleDTO,
  WebsiteVehiclePublication, WebsiteReconciliationItem,
  NotificationEventConfig, CustomReminder, WhatsAppMessageLogEntry, CustomerNotificationConfig
} from '../types';
import { DEFAULT_TOLL_PRICING } from '../lib/tollCalculations';
import { NOTIFICATION_EVENTS, CUSTOMER_NOTIFICATION_EVENTS } from '../config/notificationEvents';

export class DataStore {
  public users: User[] = [
    {
      id: 'USR-001',
      name: 'Ahmed Morsy',
      nameAr: 'أحمد مرسي',
      email: 'ceo@splendor-rental.ae',
      role: 'ceo',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      phone: '+971 50 111 2233',
      branch: 'Dubai Downtown Flagship',
      status: 'active',
    },
    {
      id: 'USR-002',
      name: 'Tariq Al-Mansoor',
      nameAr: 'طارق المنصور',
      email: 'operations@splendor-rental.ae',
      role: 'operations',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      phone: '+971 52 444 5566',
      branch: 'Dubai Downtown Flagship',
      status: 'active',
    },
    {
      id: 'USR-003',
      name: 'Elena Rostova',
      nameAr: 'إيلينا روستوفا',
      email: 'elena.r@splendor-rental.ae',
      role: 'sales',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      phone: '+971 55 777 8899',
      branch: 'Palm Jumeirah Executive Suite',
      status: 'active',
    },
    {
      id: 'USR-004',
      name: 'Faisal Al-Hashimi',
      nameAr: 'فيصل الهاشمي',
      email: 'faisal.h@splendor-rental.ae',
      role: 'finance',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
      phone: '+971 54 999 0011',
      branch: 'Dubai Downtown Flagship',
      status: 'active',
    },
    {
      id: 'USR-005',
      name: 'Khalid Ben-Zayed',
      nameAr: 'خالد بن زايد',
      email: 'khalid.b@splendor-rental.ae',
      role: 'fleet',
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
      phone: '+971 50 333 4455',
      branch: 'Dubai International Airport VIP Terminal',
      status: 'active',
    }
  ];

  public customers: Customer[] = [];
  public leads: Lead[] = [];
  public opportunities: Opportunity[] = [];
  public vehicles: Vehicle[] = [];
  public quotations: Quotation[] = [];
  public reservations: Reservation[] = [];
  public contracts: Contract[] = [];
  public charges: AdditionalCharge[] = [];
  public deposits: Deposit[] = [];
  public payments: Payment[] = [];
  public invoices: Invoice[] = [];
  public bankBatches: BankImportBatch[] = [];
  public bankImportBatches: BankImportBatch[] = [];
  public bankTransactions: BankTransaction[] = [];
  public tollTransactions: TollTransaction[] = [];
  public tollImportBatches: TollImportBatch[] = [];
  public tasks: CRMTask[] = [];
  public communications: Communication[] = [];
  public documents: CRMDocument[] = [];
  public documentTemplates: DocumentTemplate[] = [];
  public websitePublications: WebsiteVehiclePublication[] = [];
  public reconciliationItems: WebsiteReconciliationItem[] = [];
  public auditLogs: AuditLog[] = [];

  // Live default Salik/Darb/Parking rates -- starts equal to the fixed
  // defaults the owner confirmed, but is editable at runtime (Settings >
  // Tolls & Parking > Pricing, CEO/Admin/Finance/Sales only) since rates can
  // rise or fall. Every calculateTollTransaction() call should read this
  // instead of the DEFAULT_TOLL_PRICING constant so a rate change applies
  // immediately to new entries/imports. Spread-copied so mutations here
  // never touch the shared DEFAULT_TOLL_PRICING constant.
  public tollPricingConfig: TollPricingConfig = { ...DEFAULT_TOLL_PRICING };

  // Notification & WhatsApp Control Center. One config row per event key
  // (seeded from the static NOTIFICATION_EVENTS list, all enabled by
  // default but with nobody assigned yet -- so nothing actually sends until
  // an Admin picks recipients and/or WhatsApp credentials are configured).
  public notificationEventConfigs: NotificationEventConfig[] = NOTIFICATION_EVENTS.map(e => ({
    eventKey: e.key,
    enabled: true,
    broadcastToGroup: false,
    staffRecipientIds: []
  }));
  public customReminders: CustomReminder[] = [];
  public whatsappMessageLog: WhatsAppMessageLogEntry[] = [];
  // Customer-facing WhatsApp toggles (Salik/fine charges, receipts,
  // payment due/overdue, contract-expiring, extension notices) -- default
  // enabled, since these are direct customer service value (not internal
  // staff alerting), but still gated overall on isWhatsAppConfigured().
  public customerNotificationConfigs: CustomerNotificationConfig[] = CUSTOMER_NOTIFICATION_EVENTS.map(e => ({
    eventKey: e.key,
    enabled: true
  }));
  // Cooldown tracking for the automated monitoring sweep -- see shouldAlert()/markAlerted() in notificationEngine.ts.
  public notificationCooldowns: Record<string, string> = {};

  public customFields: CustomFieldDefinition[] = [
    {
      id: 'CF-01',
      entityType: 'customer',
      label: 'VIP Chauffeur Preference',
      labelAr: 'تفضيل السائق الخاص VIP',
      key: 'vip_chauffeur_preference',
      type: 'dropdown',
      options: ['Self-Drive Only', 'Dedicated Chauffeur Required', 'Optional On-Call'],
      required: false,
      active: true
    },
    {
      id: 'CF-02',
      entityType: 'vehicle',
      label: 'Exhaust Sound Profile',
      labelAr: 'نغمة العادم الرياضية',
      key: 'exhaust_sound_profile',
      type: 'dropdown',
      options: ['Titanium Sport Exhaust', 'Silent Electric', 'OEM Valvetronic'],
      required: false,
      active: true
    }
  ];

  public numberingConfigs: NumberingConfig[] = [
    { entity: 'Customer', prefix: 'CUS-', digits: 6, nextNumber: 1, sample: 'CUS-000001' },
    { entity: 'Lead', prefix: 'LEAD-', digits: 6, nextNumber: 1, sample: 'LEAD-000001' },
    { entity: 'Quotation', prefix: 'QT-', digits: 6, nextNumber: 1, sample: 'QT-000001' },
    { entity: 'Reservation', prefix: 'RES-', digits: 6, nextNumber: 1, sample: 'RES-000001' },
    { entity: 'Contract', prefix: 'CON-2026-', digits: 5, nextNumber: 1, sample: 'CON-2026-00001' },
    { entity: 'Invoice', prefix: 'INV-', digits: 6, nextNumber: 1, sample: 'INV-000001' },
    { entity: 'Payment', prefix: 'PAY-', digits: 6, nextNumber: 1, sample: 'PAY-000001' },
    { entity: 'Receipt', prefix: 'RCP-2026-', digits: 5, nextNumber: 1, sample: 'RCP-2026-00001' },
    { entity: 'Deposit', prefix: 'DEP-', digits: 6, nextNumber: 1, sample: 'DEP-000001' },
    { entity: 'Task', prefix: 'TSK-', digits: 6, nextNumber: 1, sample: 'TSK-000001' },
    { entity: 'TollTransaction', prefix: 'TOL-', digits: 6, nextNumber: 1, sample: 'TOL-000001' }
  ];

  public notifications: NotificationItem[] = [];

  // Helper Methods for Single Source of Truth
  public logAudit(log: Omit<AuditLog, 'id' | 'timestamp'>) {
    const newLog: AuditLog = {
      ...log,
      id: `AUD-${String(this.auditLogs.length + 1).padStart(6, '0')}`,
      timestamp: new Date().toISOString()
    };
    this.auditLogs.unshift(newLog);
    return newLog;
  }

  public getNextNumber(entityName: string): string {
    const config = this.numberingConfigs.find(c => c.entity.toLowerCase() === entityName.toLowerCase());
    if (!config) return `${entityName.toUpperCase().slice(0, 3)}-${Date.now()}`;
    const num = config.nextNumber;
    config.nextNumber += 1;
    config.sample = `${config.prefix}${String(config.nextNumber).padStart(config.digits, '0')}`;
    return `${config.prefix}${String(num).padStart(config.digits, '0')}`;
  }

  public getSystemHealth(): SystemHealth {
    return {
      status: 'healthy',
      databaseLatencyMs: 14,
      activeSessions: 1,
      apiAvailabilityPercent: 99.98,
      failedJobsCount: 0,
      failedImportsCount: 0,
      pendingReconciliationsCount: this.bankTransactions.filter(t => !t.reconciled).length,
      lastBackupAt: new Date().toISOString(),
      uptimeSeconds: 864000
    };
  }

  // Duplicate customer detection
  public findDuplicateCustomers(email?: string, phone?: string, licenseNumber?: string, idNumber?: string) {
    const normalizedPhone = (phone || '').replace(/[^0-9]/g, '');
    const targetEmail = (email || '').toLowerCase();
    const targetLicense = (licenseNumber || '').toLowerCase();
    const targetId = (idNumber || '').toLowerCase();

    return this.customers.filter(c => {
      const cPhone = (c.phone || '').replace(/[^0-9]/g, '');
      const emailMatch = targetEmail && c.email && c.email.toLowerCase() === targetEmail;
      const phoneMatch = normalizedPhone.length > 6 && cPhone.endsWith(normalizedPhone.slice(-7));
      const licenseMatch = targetLicense && c.licenseNumber && c.licenseNumber.toLowerCase() === targetLicense;
      const idMatch = targetId && c.idNumber && c.idNumber.toLowerCase() === targetId;
      return emailMatch || phoneMatch || licenseMatch || idMatch;
    });
  }

  // Vehicle Availability Engine
  public checkVehicleAvailability(vehicleId: string, startDateStr: string, endDateStr: string, excludeReservationId?: string): { available: boolean; conflictingRecords: any[] } {
    const targetStart = new Date(startDateStr).getTime();
    const targetEnd = new Date(endDateStr).getTime();
    const conflicts: any[] = [];

    const vehicle = this.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return { available: false, conflictingRecords: ['Vehicle not found'] };

    if (vehicle.status === 'maintenance' || vehicle.status === 'unavailable') {
      conflicts.push({ type: 'status_block', message: `Vehicle is currently marked as ${vehicle.status}` });
    }

    // Check active contracts
    this.contracts.forEach(c => {
      if (c.vehicleId === vehicleId && c.status === 'active') {
        const cStart = new Date(c.startDateTime).getTime();
        const cEnd = new Date(c.endDateTime).getTime();
        if (targetStart <= cEnd && targetEnd >= cStart) {
          conflicts.push({ type: 'active_contract', id: c.id, contractNumber: c.contractNumber, customer: c.customerName });
        }
      }
    });

    // Check existing confirmed/active/pending reservations
    this.reservations.forEach(r => {
      if (r.id === excludeReservationId) return;
      if (r.vehicleId === vehicleId && (r.status === 'confirmed' || r.status === 'active' || r.status === 'pending')) {
        const rStart = new Date(r.pickupDateTime).getTime();
        const rEnd = new Date(r.returnDateTime).getTime();
        if (targetStart <= rEnd && targetEnd >= rStart) {
          conflicts.push({ type: 'reservation', id: r.id, customer: r.customerName, dates: `${r.pickupDateTime} - ${r.returnDateTime}` });
        }
      }
    });

    return {
      available: conflicts.length === 0,
      conflictingRecords: conflicts
    };
  }

  // Generate complete statement for customer
  public getCustomerStatement(customerId: string): any {
    const customer = this.customers.find(c => c.id === customerId);
    if (!customer) return null;

    const invoices = this.invoices.filter(i => i.customerId === customerId);
    const payments = this.payments.filter(p => p.customerId === customerId);
    const deposits = this.deposits.filter(d => d.customerId === customerId);
    const charges = this.charges.filter(ch => ch.customerId === customerId);

    const entries: any[] = [];
    let runningBalance = 0;

    // Collate all transactions
    invoices.forEach(inv => {
      runningBalance += inv.totalAmount;
      entries.push({
        id: `stmt-${inv.id}`,
        date: inv.issueDate,
        type: 'invoice',
        reference: inv.id,
        description: `Rental Invoice ${inv.id}`,
        debit: inv.totalAmount,
        credit: 0,
        runningBalance
      });
    });

    payments.forEach(pay => {
      runningBalance -= pay.amount;
      entries.push({
        id: `stmt-${pay.id}`,
        date: pay.receivedAt.split('T')[0],
        type: 'payment',
        reference: pay.receiptNumber || pay.id,
        description: `Payment Received (${(pay.method || '').toUpperCase()} - Ref: ${pay.referenceNumber || ''})`,
        debit: 0,
        credit: pay.amount,
        runningBalance
      });
    });

    charges.forEach(ch => {
      runningBalance += ch.totalAmount;
      entries.push({
        id: `stmt-${ch.id}`,
        date: ch.timestamp.split('T')[0],
        type: 'debit',
        reference: ch.id,
        description: `Additional Charge: ${ch.description}`,
        debit: ch.totalAmount,
        credit: 0,
        runningBalance
      });
    });

    deposits.forEach(dep => {
      entries.push({
        id: `stmt-${dep.id}`,
        date: dep.createdAt.split('T')[0],
        type: 'deposit_in',
        reference: dep.id,
        description: `Security Deposit Held (${dep.status})`,
        debit: 0,
        credit: 0,
        runningBalance
      });
    });

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalInvoiced = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const totalDepositsHeld = deposits.filter(d => d.status === 'held').reduce((s, d) => s + d.balance, 0);

    return {
      customerId: customer.id,
      customerName: customer.fullName,
      customerNameAr: customer.fullNameAr,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      periodStart: '2026-01-01',
      periodEnd: new Date().toISOString().split('T')[0],
      openingBalance: 0,
      totalInvoiced,
      totalPaid,
      totalDepositsHeld,
      closingBalance: totalInvoiced - totalPaid,
      entries,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Runs `fn` against a completely fresh, isolated copy of this store's
   * data (every array/object own-property reset to the same defaults a
   * brand-new DataStore starts with), then restores the REAL data
   * afterward -- always, even if fn throws. Every own data property is
   * swapped by reference, not deep-copied, so the swap is cheap and every
   * module holding a reference to this exact `globalStore` object (e.g.
   * splendorConnectEngine.ts, which imports `globalStore` directly and
   * reads/writes its properties the same way server.ts does) transparently
   * sees the isolated test data too -- there is only ever one `globalStore`
   * object; only which arrays its properties point to changes, briefly.
   *
   * This exists solely for the Test Suite Runner (POST
   * /api/tests/run-all): every TC-xx fixture in that handler pushes demo
   * customers/vehicles/contracts/etc. from *within* the callback passed
   * here, so none of it can ever enter, or be read from, the real
   * production data -- not even transiently, since no other request can
   * interleave with a synchronous callback in Node's single-threaded event
   * loop, and this handler makes no Firestore writes of its own.
   *
   * IMPORTANT: `fn` must be synchronous. An async fn would let a real
   * request read or mutate this store mid-test-run, seeing (or corrupting)
   * the temporary isolated state -- the whole safety property of this
   * method depends on the swap-run-restore sequence never yielding to the
   * event loop in between.
   */
  public withIsolatedState<T>(fn: () => T): T {
    const fresh = new DataStore();
    const keys = Object.keys(this) as (keyof DataStore)[];
    const original: Partial<Record<keyof DataStore, any>> = {};
    for (const key of keys) {
      original[key] = (this as any)[key];
      (this as any)[key] = (fresh as any)[key];
    }
    try {
      return fn();
    } finally {
      for (const key of keys) {
        (this as any)[key] = original[key];
      }
    }
  }
}

export const globalStore = new DataStore();
