import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  Customer, Lead, Opportunity, Vehicle, Quotation, 
  Reservation, Contract, AdditionalCharge, Deposit, 
  Payment, Invoice, BankImportBatch, BankTransaction,
  CRMTask, Communication, CRMDocument, AuditLog,
  CustomFieldDefinition, NumberingConfig, NotificationItem,
  TollTransaction, TollImportBatch, TollPricingConfig,
  WebsiteVehiclePublication, VehicleLifecycleStatus, WebsiteReconciliationItem,
  NotificationEventConfig, CustomReminder, WhatsAppMessageLogEntry, CustomerNotificationConfig
} from '../types';
import { FirestoreService, COLLECTIONS } from '../firebase/firestoreService';
import { testFirebaseConnection, firebaseConfig } from '../firebase/config';
import { apiFetch as fetch } from '../lib/apiFetch';
import { useAuth } from './AuthContext';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

export interface FirebaseSyncState {
  connected: boolean;
  projectId: string;
  latencyMs: number;
  totalDocs: number;
  collectionCounts: Record<string, number>;
  lastSynced: string;
  isSyncing: boolean;
  isRealtime: boolean;
  error?: string;
}

interface CRMContextType {
  // State
  customers: Customer[];
  leads: Lead[];
  opportunities: Opportunity[];
  vehicles: Vehicle[];
  quotations: Quotation[];
  reservations: Reservation[];
  contracts: Contract[];
  charges: AdditionalCharge[];
  deposits: Deposit[];
  payments: Payment[];
  invoices: Invoice[];
  bankBatches: BankImportBatch[];
  bankTransactions: BankTransaction[];
  tollTransactions: TollTransaction[];
  tollImportBatches: TollImportBatch[];
  tollPricingConfig: TollPricingConfig | null;
  notificationEventConfigs: NotificationEventConfig[];
  customerNotificationConfigs: CustomerNotificationConfig[];
  customReminders: CustomReminder[];
  whatsappMessageLog: WhatsAppMessageLogEntry[];
  whatsappStatus: { configured: boolean; groupRecipientCount: number };
  tasks: CRMTask[];
  communications: Communication[];
  documents: CRMDocument[];
  auditLogs: AuditLog[];
  customFields: CustomFieldDefinition[];
  numberingConfigs: NumberingConfig[];
  notifications: NotificationItem[];
  
  loading: boolean;
  activeView: string;
  setActiveView: (view: string) => void;
  
  // Firebase Live Telemetry State
  firebaseSyncState: FirebaseSyncState;
  syncAllToFirestore: () => Promise<void>;
  
  // Modals & Drawers state
  globalSearchOpen: boolean;
  setGlobalSearchOpen: (open: boolean) => void;
  selectedCustomerId: string | null;
  setSelectedCustomerId: (id: string | null) => void;
  selectedVehicleId: string | null;
  setSelectedVehicleId: (id: string | null) => void;
  selectedContractId: string | null;
  setSelectedContractId: (id: string | null) => void;
  selectedQuotationId: string | null;
  setSelectedQuotationId: (id: string | null) => void;
  
  // Operations
  fetchData: () => Promise<void>;
  showToast: (title: string, message: string, type?: 'success' | 'error' | 'info') => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;

  // Actions
  addCustomer: (data: Partial<Customer>) => Promise<Customer>;
  updateCustomer: (id: string, data: Partial<Customer>) => Promise<Customer>;
  mergeCustomers: (sourceId: string, targetId: string) => Promise<void>;
  checkDuplicateCustomer: (email: string, phone: string, licenseNumber?: string, idNumber?: string) => Promise<{ hasDuplicate: boolean; matches: Customer[] }>;
  
  addLead: (data: Partial<Lead>) => Promise<Lead>;
  updateLead: (id: string, data: Partial<Lead>) => Promise<Lead>;
  convertLeadToCustomer: (leadId: string) => Promise<Customer>;
  
  addVehicle: (data: Partial<Vehicle>) => Promise<Vehicle>;
  updateVehicle: (id: string, data: Partial<Vehicle>) => Promise<Vehicle>;
  assignPlate: (vehicleId: string, plateNumber: string, plateCity: string, reason: string) => Promise<Vehicle>;
  publishToWebsite: (vehicleId: string, publication: Partial<WebsiteVehiclePublication>) => Promise<Vehicle>;
  updateLifecycleStatus: (vehicleId: string, lifecycleStatus: VehicleLifecycleStatus, reason: string, saleRecord?: any) => Promise<Vehicle>;
  getReconciliationReport: () => Promise<WebsiteReconciliationItem[]>;
  checkVehicleAvailability: (vehicleId: string, startDate: string, endDate: string, excludeResId?: string) => Promise<{ available: boolean; conflictingRecords: any[] }>;
  
  createQuotation: (data: Partial<Quotation>) => Promise<Quotation>;
  convertQuotationToReservation: (quoteId: string) => Promise<Reservation>;
  
  createReservation: (data: Partial<Reservation>) => Promise<Reservation>;
  createContractFromReservation: (resId: string) => Promise<Contract>;
  createContract: (data: Partial<Contract>) => Promise<Contract>;
  
  processHandover: (contractId: string, handoverData: any) => Promise<Contract>;
  processReturn: (contractId: string, returnData: any) => Promise<Contract>;
  
  recordPayment: (paymentData: any) => Promise<Payment>;
  applyDeposit: (depositId: string, amount: number, reason: string) => Promise<Deposit>;
  refundDeposit: (depositId: string, amount: number) => Promise<Deposit>;
  
  uploadBankBatch: (batchData: any) => Promise<void>;
  reconcileBankTransaction: (txnId: string, targetRecordType: string, targetRecordId: string) => Promise<void>;
  runAutoReconciliation: () => Promise<void>;

  addManualToll: (data: any) => Promise<TollTransaction>;
  updateTollTransaction: (id: string, data: any) => Promise<TollTransaction>;
  deleteTollTransaction: (id: string) => Promise<void>;
  previewTollImport: (file: { fileName: string; fileBase64: string; type: 'salik' | 'darb' }) => Promise<{ batch: TollImportBatch; transactions: TollTransaction[]; warnings: string[] }>;
  confirmTollImport: (file: { fileName: string; fileBase64: string; type: 'salik' | 'darb' }) => Promise<{ batch: TollImportBatch; transactions: TollTransaction[]; warnings: string[] }>;
  updateTollPricingConfig: (data: Partial<TollPricingConfig>) => Promise<TollPricingConfig>;

  queryAI: (prompt: string, language?: string) => Promise<{ text: string; confidence: number }>;
  generateCustomerAISummary: (customerId: string, language?: string) => Promise<{ summary: string; confidence: number }>;

  updateNotificationConfig: (eventKey: string, data: Partial<NotificationEventConfig>) => Promise<NotificationEventConfig>;
  updateCustomerNotificationConfig: (eventKey: string, enabled: boolean) => Promise<CustomerNotificationConfig>;
  sendCustomReminder: (data: { title: string; message: string; broadcastToGroup: boolean; staffRecipientIds: string[] }) => Promise<CustomReminder>;
  runNotificationChecksNow: () => Promise<{ ranAt: string; alertsFired: number; details: string[] }>;
  refreshWhatsappStatus: () => Promise<void>;
  extendContract: (contractId: string, newEndDateTime: string) => Promise<{ contract: Contract; extraDays: number; extraAmount: number }>;

  /** CEO/Admin only -- wipes every transactional/demo record and resets numbering back to 1. Irreversible. */
  resetTransactionalData: (confirmText: string) => Promise<{ success: boolean; deletedDocs: number }>;

  createTask: (taskData: Partial<CRMTask>) => Promise<CRMTask>;
  updateTask: (id: string, data: Partial<CRMTask>) => Promise<CRMTask>;
  
  addCommunication: (commData: Partial<Communication>) => Promise<Communication>;
  addDocument: (docData: Partial<CRMDocument>) => Promise<CRMDocument>;
}

const CRMContext = createContext<CRMContextType | undefined>(undefined);

export const CRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [charges, setCharges] = useState<AdditionalCharge[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bankBatches, setBankBatches] = useState<BankImportBatch[]>([]);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [tollTransactions, setTollTransactions] = useState<TollTransaction[]>([]);
  const [tollImportBatches, setTollImportBatches] = useState<TollImportBatch[]>([]);
  const [tollPricingConfig, setTollPricingConfig] = useState<TollPricingConfig | null>(null);
  const [notificationEventConfigs, setNotificationEventConfigs] = useState<NotificationEventConfig[]>([]);
  const [customerNotificationConfigs, setCustomerNotificationConfigs] = useState<CustomerNotificationConfig[]>([]);
  const [customReminders, setCustomReminders] = useState<CustomReminder[]>([]);
  const [whatsappMessageLog, setWhatsappMessageLog] = useState<WhatsAppMessageLogEntry[]>([]);
  const [whatsappStatus, setWhatsappStatus] = useState<{ configured: boolean; groupRecipientCount: number }>({ configured: false, groupRecipientCount: 0 });
  const [tasks, setTasks] = useState<CRMTask[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [documents, setDocuments] = useState<CRMDocument[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [numberingConfigs, setNumberingConfigs] = useState<NumberingConfig[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [globalSearchOpen, setGlobalSearchOpen] = useState<boolean>(false);
  
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Firebase Live Telemetry State
  const [firebaseSyncState, setFirebaseSyncState] = useState<FirebaseSyncState>({
    connected: false,
    projectId: firebaseConfig.projectId,
    latencyMs: 0,
    totalDocs: 0,
    collectionCounts: {},
    lastSynced: new Date().toISOString(),
    isSyncing: false,
    isRealtime: false
  });

  const isInitialLoadedRef = useRef(false);

  const showToast = useCallback((title: string, message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Update live statistics from collections
  const refreshFirebaseStats = useCallback(async () => {
    try {
      const ping = await testFirebaseConnection();
      const stats = await FirestoreService.getLiveCollectionStats();
      setFirebaseSyncState(prev => ({
        ...prev,
        connected: ping.connected,
        latencyMs: ping.latencyMs,
        totalDocs: stats.totalDocs,
        collectionCounts: stats.counts,
        lastSynced: new Date().toISOString(),
        isRealtime: true,
        error: ping.errorMessage
      }));
    } catch (e: any) {
      console.warn('Failed to refresh Firebase stats:', e);
    }
  }, []);

  // Load initial fallback/server data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        custRes, leadRes, oppRes, vehRes, quoteRes,
        resRes, conRes, chgRes, depRes, payRes,
        invRes, bBatchRes, bTxnRes, tskRes, commRes,
        docRes, auditRes, cfRes, numRes, notifRes,
        tollRes, tollBatchRes, tollPricingRes,
        notifCfgRes, remindersRes, waLogRes, waStatusRes, custNotifCfgRes
      ] = await Promise.all([
        fetch('/api/customers').then(r => r.json()).catch(() => []),
        fetch('/api/leads').then(r => r.json()).catch(() => []),
        fetch('/api/opportunities').then(r => r.json()).catch(() => []),
        fetch('/api/fleet').then(r => r.json()).catch(() => []),
        fetch('/api/quotations').then(r => r.json()).catch(() => []),
        fetch('/api/reservations').then(r => r.json()).catch(() => []),
        fetch('/api/contracts').then(r => r.json()).catch(() => []),
        fetch('/api/charges').then(r => r.json()).catch(() => []),
        fetch('/api/deposits').then(r => r.json()).catch(() => []),
        fetch('/api/payments').then(r => r.json()).catch(() => []),
        fetch('/api/invoices').then(r => r.json()).catch(() => []),
        fetch('/api/bank-batches').then(r => r.json()).catch(() => []),
        fetch('/api/bank-transactions').then(r => r.json()).catch(() => []),
        fetch('/api/tasks').then(r => r.json()).catch(() => []),
        fetch('/api/communications').then(r => r.json()).catch(() => []),
        fetch('/api/documents').then(r => r.json()).catch(() => []),
        fetch('/api/audit-logs').then(r => r.json()).catch(() => []),
        fetch('/api/settings/custom-fields').then(r => r.json()).catch(() => []),
        fetch('/api/settings/numbering').then(r => r.json()).catch(() => []),
        fetch('/api/notifications').then(r => r.json()).catch(() => []),
        fetch('/api/tolls').then(r => r.json()).catch(() => []),
        fetch('/api/toll-batches').then(r => r.json()).catch(() => []),
        fetch('/api/toll-pricing-config').then(r => r.json()).catch(() => null),
        fetch('/api/notification-configs').then(r => r.json()).catch(() => []),
        fetch('/api/custom-reminders').then(r => r.json()).catch(() => []),
        fetch('/api/whatsapp/message-log').then(r => r.json()).catch(() => []),
        fetch('/api/whatsapp/status').then(r => r.json()).catch(() => ({ configured: false, groupRecipientCount: 0 })),
        fetch('/api/customer-notification-configs').then(r => r.json()).catch(() => [])
      ]);

      setCustomers(Array.isArray(custRes) ? custRes : []);
      setLeads(Array.isArray(leadRes) ? leadRes : []);
      setOpportunities(Array.isArray(oppRes) ? oppRes : []);
      setVehicles(Array.isArray(vehRes) ? vehRes : []);
      setQuotations(Array.isArray(quoteRes) ? quoteRes : []);
      setReservations(Array.isArray(resRes) ? resRes : []);
      setContracts(Array.isArray(conRes) ? conRes : []);
      setCharges(Array.isArray(chgRes) ? chgRes : []);
      setDeposits(Array.isArray(depRes) ? depRes : []);
      setPayments(Array.isArray(payRes) ? payRes : []);
      setInvoices(Array.isArray(invRes) ? invRes : []);
      setBankBatches(Array.isArray(bBatchRes) ? bBatchRes : []);
      setBankTransactions(Array.isArray(bTxnRes) ? bTxnRes : []);
      setTasks(Array.isArray(tskRes) ? tskRes : []);
      setCommunications(Array.isArray(commRes) ? commRes : []);
      setDocuments(Array.isArray(docRes) ? docRes : []);
      setAuditLogs(Array.isArray(auditRes) ? auditRes : []);
      setCustomFields(Array.isArray(cfRes) ? cfRes : []);
      setNumberingConfigs(Array.isArray(numRes) ? numRes : []);
      setNotifications(Array.isArray(notifRes) ? notifRes : []);
      setTollTransactions(Array.isArray(tollRes) ? tollRes : []);
      setTollImportBatches(Array.isArray(tollBatchRes) ? tollBatchRes : []);
      if (tollPricingRes) setTollPricingConfig(tollPricingRes);
      if (notifCfgRes && notifCfgRes.length > 0) setNotificationEventConfigs(notifCfgRes);
      if (remindersRes && remindersRes.length > 0) setCustomReminders(remindersRes);
      if (waLogRes && waLogRes.length > 0) setWhatsappMessageLog(waLogRes);
      if (waStatusRes) setWhatsappStatus(waStatusRes);
      if (custNotifCfgRes && custNotifCfgRes.length > 0) setCustomerNotificationConfigs(custNotifCfgRes);

      await refreshFirebaseStats();
    } catch (error) {
      console.error('Failed to fetch CRM dataset:', error);
      showToast('Sync Warning', 'Using live Firestore connection directly', 'info');
    } finally {
      setLoading(false);
    }
  }, [showToast, refreshFirebaseStats]);

  // Subscribe to real-time Firestore collections only when authenticated
  useEffect(() => {
    let unsubs: (() => void)[] = [];

    // Always fetch baseline data from backend
    fetchData();

    if (!firebaseUser) {
      return () => {
        unsubs.forEach(unsub => unsub());
      };
    }

    const setupListeners = async () => {
      try {
        const ping = await testFirebaseConnection();
        setFirebaseSyncState(prev => ({
          ...prev,
          connected: ping.connected,
          latencyMs: ping.latencyMs,
          projectId: ping.projectId,
          isRealtime: true
        }));

        // Real-time Firestore subscriptions directly hydrating live state
        unsubs.push(
          FirestoreService.subscribe<Vehicle>(COLLECTIONS.VEHICLES, (items) => {
            setVehicles(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<Customer>(COLLECTIONS.CUSTOMERS, (items) => {
            setCustomers(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<Contract>(COLLECTIONS.CONTRACTS, (items) => {
            setContracts(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<Lead>(COLLECTIONS.LEADS, (items) => {
            setLeads(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<Opportunity>(COLLECTIONS.OPPORTUNITIES, (items) => {
            setOpportunities(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<Reservation>(COLLECTIONS.RESERVATIONS, (items) => {
            setReservations(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<Quotation>(COLLECTIONS.QUOTATIONS, (items) => {
            setQuotations(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<Invoice>(COLLECTIONS.INVOICES, (items) => {
            setInvoices(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<Payment>(COLLECTIONS.PAYMENTS, (items) => {
            setPayments(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<Deposit>(COLLECTIONS.DEPOSITS, (items) => {
            setDeposits(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<AdditionalCharge>(COLLECTIONS.CHARGES, (items) => {
            setCharges(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<BankTransaction>(COLLECTIONS.BANK_TRANSACTIONS, (items) => {
            setBankTransactions(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<BankImportBatch>(COLLECTIONS.BANK_BATCHES, (items) => {
            setBankBatches(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<CRMTask>(COLLECTIONS.TASKS, (items) => {
            setTasks(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<Communication>(COLLECTIONS.COMMUNICATIONS, (items) => {
            setCommunications(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<CRMDocument>(COLLECTIONS.DOCUMENTS, (items) => {
            setDocuments(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<AuditLog>(COLLECTIONS.AUDIT_LOGS, (items) => {
            setAuditLogs(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<NotificationItem>(COLLECTIONS.NOTIFICATIONS, (items) => {
            setNotifications(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<TollTransaction>(COLLECTIONS.TOLL_TRANSACTIONS, (items) => {
            setTollTransactions(items || []);
          })
        );

        unsubs.push(
          FirestoreService.subscribe<TollImportBatch>(COLLECTIONS.TOLL_IMPORT_BATCHES, (items) => {
            setTollImportBatches(items || []);
          })
        );
      } catch (err) {
        console.warn('Firebase real-time listener setup:', err);
      }
    };

    setupListeners();

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [fetchData, firebaseUser]);

  // Sync entire dataset to user's Firestore project
  const syncAllToFirestore = useCallback(async () => {
    try {
      setFirebaseSyncState(prev => ({ ...prev, isSyncing: true }));
      showToast('Firebase Synchronization', 'Syncing fleet and CRM records directly to Firestore project...', 'info');

      // Fetch latest server baseline if needed
      const [
        cRes, lRes, oRes, vRes, qRes, rRes, conRes,
        chgRes, depRes, payRes, invRes, bbRes, btRes,
        tRes, commRes, dRes, aRes, cfRes, numRes, notRes,
        tollRes, tollBatchRes
      ] = await Promise.all([
        fetch('/api/customers').then(r => r.json()).catch(() => customers),
        fetch('/api/leads').then(r => r.json()).catch(() => leads),
        fetch('/api/opportunities').then(r => r.json()).catch(() => opportunities),
        fetch('/api/fleet').then(r => r.json()).catch(() => vehicles),
        fetch('/api/quotations').then(r => r.json()).catch(() => quotations),
        fetch('/api/reservations').then(r => r.json()).catch(() => reservations),
        fetch('/api/contracts').then(r => r.json()).catch(() => contracts),
        fetch('/api/charges').then(r => r.json()).catch(() => charges),
        fetch('/api/deposits').then(r => r.json()).catch(() => deposits),
        fetch('/api/payments').then(r => r.json()).catch(() => payments),
        fetch('/api/invoices').then(r => r.json()).catch(() => invoices),
        fetch('/api/bank-batches').then(r => r.json()).catch(() => bankBatches),
        fetch('/api/bank-transactions').then(r => r.json()).catch(() => bankTransactions),
        fetch('/api/tasks').then(r => r.json()).catch(() => tasks),
        fetch('/api/communications').then(r => r.json()).catch(() => communications),
        fetch('/api/documents').then(r => r.json()).catch(() => documents),
        fetch('/api/audit-logs').then(r => r.json()).catch(() => auditLogs),
        fetch('/api/settings/custom-fields').then(r => r.json()).catch(() => customFields),
        fetch('/api/settings/numbering').then(r => r.json()).catch(() => numberingConfigs),
        fetch('/api/notifications').then(r => r.json()).catch(() => notifications),
        fetch('/api/tolls').then(r => r.json()).catch(() => tollTransactions),
        fetch('/api/toll-batches').then(r => r.json()).catch(() => tollImportBatches)
      ]);

      const result = await FirestoreService.seedFullCRMToFirestore({
        customers: cRes,
        leads: lRes,
        opportunities: oRes,
        vehicles: vRes,
        quotations: qRes,
        reservations: rRes,
        contracts: conRes,
        charges: chgRes,
        deposits: depRes,
        payments: payRes,
        invoices: invRes,
        bankBatches: bbRes,
        bankTransactions: btRes,
        tasks: tRes,
        communications: commRes,
        documents: dRes,
        auditLogs: aRes,
        customFields: cfRes,
        numberingConfigs: numRes,
        notifications: notRes,
        tollTransactions: tollRes,
        tollImportBatches: tollBatchRes
      });

      await refreshFirebaseStats();
      showToast('Firebase Live Sync Complete', `Successfully written ${result.writtenCount} records to Firestore (${firebaseConfig.projectId}).`);
    } catch (e: any) {
      console.error('Failed to sync to Firestore:', e);
      showToast('Firebase Sync Error', e?.message || 'Check Firestore database rules & permission', 'error');
    } finally {
      setFirebaseSyncState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [
    customers, leads, opportunities, vehicles, quotations,
    reservations, contracts, charges, deposits, payments,
    invoices, bankBatches, bankTransactions, tasks,
    communications, documents, auditLogs, customFields,
    numberingConfigs, notifications, showToast, refreshFirebaseStats
  ]);

  // Actions with synchronized Firestore writes
  const checkDuplicateCustomer = async (email: string, phone: string, licenseNumber?: string, idNumber?: string) => {
    const res = await fetch('/api/customers/check-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, licenseNumber, idNumber })
    });
    return res.json();
  };

  const addCustomer = async (data: Partial<Customer>) => {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const newCust: Customer = await res.json();
    setCustomers(prev => [newCust, ...prev.filter(c => c.id !== newCust.id)]);
    
    // Save to Firestore
    try {
      await FirestoreService.set(COLLECTIONS.CUSTOMERS, newCust.id, newCust);
    } catch (e) {
      console.warn('Firestore write customer warning:', e);
    }
    
    showToast('Customer Created', `${newCust.fullName} (${newCust.id}) has been registered.`);
    refreshFirebaseStats();
    return newCust;
  };

  const updateCustomer = async (id: string, data: Partial<Customer>) => {
    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const updated: Customer = await res.json();
    setCustomers(prev => prev.map(c => c.id === id ? updated : c));
    
    // Update in Firestore
    try {
      await FirestoreService.update(COLLECTIONS.CUSTOMERS, id, updated);
    } catch (e) {
      console.warn('Firestore update customer warning:', e);
    }

    showToast('Profile Updated', `Customer profile updated successfully.`);
    return updated;
  };

  const mergeCustomers = async (sourceId: string, targetId: string) => {
    const res = await fetch(`/api/customers/${sourceId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetCustomerId: targetId })
    });
    if (!res.ok) throw new Error('Merge failed');
    
    try {
      await FirestoreService.remove(COLLECTIONS.CUSTOMERS, sourceId);
    } catch (e) {
      console.warn('Firestore merge delete warning:', e);
    }
    
    await fetchData();
    showToast('Records Merged', `Successfully consolidated records into ${targetId}.`);
  };

  const addLead = async (data: Partial<Lead>) => {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const newLead: Lead = await res.json();
    setLeads(prev => [newLead, ...prev.filter(l => l.id !== newLead.id)]);
    
    // Write to Firestore
    try {
      await FirestoreService.set(COLLECTIONS.LEADS, newLead.id, newLead);
    } catch (e) {
      console.warn('Firestore write lead warning:', e);
    }

    showToast('Lead Created', `New inquiry from ${newLead.fullName} logged.`);
    refreshFirebaseStats();
    return newLead;
  };

  const updateLead = async (id: string, data: Partial<Lead>) => {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const updated: Lead = await res.json();
    setLeads(prev => prev.map(l => l.id === id ? updated : l));
    
    try {
      await FirestoreService.update(COLLECTIONS.LEADS, id, updated);
    } catch (e) {
      console.warn('Firestore update lead warning:', e);
    }
    return updated;
  };

  const convertLeadToCustomer = async (leadId: string) => {
    const res = await fetch(`/api/leads/${leadId}/convert-customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Conversion failed');
    
    try {
      await FirestoreService.set(COLLECTIONS.CUSTOMERS, data.customer.id, data.customer);
      await FirestoreService.update(COLLECTIONS.LEADS, leadId, { status: 'won', customerId: data.customer.id });
    } catch (e) {
      console.warn('Firestore lead convert warning:', e);
    }

    await fetchData();
    showToast('Lead Converted', `Successfully created Customer ${data.customer.id}.`);
    return data.customer;
  };

  const addVehicle = async (data: Partial<Vehicle>) => {
    const res = await fetch('/api/fleet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const newVeh: Vehicle = await res.json();
    setVehicles(prev => [newVeh, ...prev.filter(v => v.id !== newVeh.id)]);
    
    try {
      await FirestoreService.set(COLLECTIONS.VEHICLES, newVeh.id, newVeh);
    } catch (e) {
      console.warn('Firestore write vehicle warning:', e);
    }

    showToast('Vehicle Added', `${newVeh.make} ${newVeh.model} registered to fleet.`);
    refreshFirebaseStats();
    return newVeh;
  };

  const updateVehicle = async (id: string, data: Partial<Vehicle>) => {
    const res = await fetch(`/api/fleet/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const updated: Vehicle = await res.json();
    setVehicles(prev => prev.map(v => v.id === id ? updated : v));
    
    try {
      await FirestoreService.update(COLLECTIONS.VEHICLES, id, updated);
    } catch (e) {
      console.warn('Firestore update vehicle warning:', e);
    }

    showToast('Fleet Updated', `Vehicle ${updated.make} ${updated.model} saved.`);
    return updated;
  };

  const assignPlate = async (vehicleId: string, plateNumber: string, plateCity: string, reason: string) => {
    const res = await fetch(`/api/fleet/${vehicleId}/assign-plate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plateNumber, plateCity, reason })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Plate assignment failed');
    }
    const updated: Vehicle = result.vehicle;
    setVehicles(prev => prev.map(v => v.id === vehicleId ? updated : v));
    try {
      await FirestoreService.update(COLLECTIONS.VEHICLES, vehicleId, updated);
    } catch (e) {
      console.warn('Firestore update vehicle plate warning:', e);
    }
    showToast('Plate Assigned', `Vehicle ${updated.make} ${updated.model} now carries plate ${plateCity} ${plateNumber}.`);
    return updated;
  };

  const publishToWebsite = async (vehicleId: string, publication: Partial<WebsiteVehiclePublication>) => {
    const res = await fetch(`/api/fleet/${vehicleId}/website-publish`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publication })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Website publish failed');
    }
    const updated: Vehicle = result.vehicle;
    setVehicles(prev => prev.map(v => v.id === vehicleId ? updated : v));
    try {
      await FirestoreService.update(COLLECTIONS.VEHICLES, vehicleId, updated);
    } catch (e) {
      console.warn('Firestore update vehicle publish warning:', e);
    }
    showToast(
      publication.enabled ? 'Showroom Published' : 'Showroom Hidden',
      `Vehicle ${updated.make} ${updated.model} website status is now ${publication.visibility || 'UPDATED'}.`
    );
    return updated;
  };

  const updateLifecycleStatus = async (
    vehicleId: string,
    lifecycleStatus: VehicleLifecycleStatus,
    reason: string,
    saleRecord?: any
  ) => {
    const res = await fetch(`/api/fleet/${vehicleId}/lifecycle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lifecycleStatus, reason, saleRecord })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Lifecycle update failed');
    }
    const updated: Vehicle = result.vehicle;
    setVehicles(prev => prev.map(v => v.id === vehicleId ? updated : v));
    try {
      await FirestoreService.update(COLLECTIONS.VEHICLES, vehicleId, updated);
    } catch (e) {
      console.warn('Firestore update vehicle lifecycle warning:', e);
    }
    showToast('Lifecycle Updated', `Vehicle ${updated.make} ${updated.model} is now ${lifecycleStatus}.`);
    return updated;
  };

  const getReconciliationReport = async (): Promise<WebsiteReconciliationItem[]> => {
    const res = await fetch('/api/fleet/reconciliation/report');
    const data = await res.json();
    return data.report || [];
  };

  const checkVehicleAvailability = async (vehicleId: string, startDate: string, endDate: string, excludeResId?: string) => {
    const res = await fetch('/api/fleet/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId, startDate, endDate, excludeReservationId: excludeResId })
    });
    return res.json();
  };

  const createQuotation = async (data: Partial<Quotation>) => {
    const res = await fetch('/api/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const quote: Quotation = await res.json();
    setQuotations(prev => [quote, ...prev.filter(q => q.id !== quote.id)]);
    
    try {
      await FirestoreService.set(COLLECTIONS.QUOTATIONS, quote.id, quote);
    } catch (e) {
      console.warn('Firestore quote write warning:', e);
    }

    showToast('Quotation Prepared', `Quotation ${quote.id} (${(quote.grandTotal || 0).toLocaleString()} AED) created.`);
    refreshFirebaseStats();
    return quote;
  };

  const convertQuotationToReservation = async (quoteId: string) => {
    const res = await fetch(`/api/quotations/${quoteId}/convert-reservation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('Conflict Detected', data.error || 'Failed to convert quotation', 'error');
      throw new Error(data.error);
    }
    
    try {
      await FirestoreService.set(COLLECTIONS.RESERVATIONS, data.reservation.id, data.reservation);
      await FirestoreService.update(COLLECTIONS.QUOTATIONS, quoteId, { status: 'accepted' });
    } catch (e) {
      console.warn('Firestore convert quote warning:', e);
    }

    await fetchData();
    showToast('Reservation Confirmed', `Reservation ${data.reservation.id} created from quotation.`);
    return data.reservation;
  };

  const createReservation = async (data: Partial<Reservation>) => {
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const resData = await res.json();
    if (!res.ok) {
      showToast('Booking Conflict', resData.error || 'Vehicle not available', 'error');
      throw new Error(resData.error);
    }
    
    try {
      await FirestoreService.set(COLLECTIONS.RESERVATIONS, resData.id, resData);
    } catch (e) {
      console.warn('Firestore reservation write warning:', e);
    }

    await fetchData();
    showToast('Reservation Booked', `Reservation ${resData.id} confirmed.`);
    refreshFirebaseStats();
    return resData;
  };

  const createContractFromReservation = async (resId: string) => {
    const res = await fetch(`/api/reservations/${resId}/create-contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    try {
      await FirestoreService.set(COLLECTIONS.CONTRACTS, data.contract.id, data.contract);
      await FirestoreService.update(COLLECTIONS.RESERVATIONS, resId, { status: 'confirmed' });
      await FirestoreService.update(COLLECTIONS.VEHICLES, data.contract.vehicleId, { status: 'reserved' });
    } catch (e) {
      console.warn('Firestore contract write warning:', e);
    }

    await fetchData();
    showToast('Contract Generated', `Contract ${data.contract.id} generated.`);
    refreshFirebaseStats();
    return data.contract;
  };

  const createContract = async (data: Partial<Contract>) => {
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const newContract: Contract = await res.json();
    setContracts(prev => [newContract, ...prev.filter(c => c.id !== newContract.id)]);

    // Write to Firestore immediately
    try {
      await FirestoreService.set(COLLECTIONS.CONTRACTS, newContract.id, newContract);
      if (newContract.vehicleId) {
        await FirestoreService.update(COLLECTIONS.VEHICLES, newContract.vehicleId, { 
          status: newContract.status === 'active' ? 'rented' : 'reserved' 
        });
      }
    } catch (e) {
      console.warn('Firestore write contract warning:', e);
    }

    await fetchData();
    showToast('Contract Issued', `Contract ${newContract.contractNumber} (${(newContract.grandTotal || 0).toLocaleString()} AED) active.`);
    refreshFirebaseStats();
    return newContract;
  };

  const processHandover = async (contractId: string, handoverData: any) => {
    const res = await fetch(`/api/contracts/${contractId}/handover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handoverData })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    try {
      await FirestoreService.update(COLLECTIONS.CONTRACTS, contractId, data.contract);
      await FirestoreService.update(COLLECTIONS.VEHICLES, data.contract.vehicleId, { status: 'rented' });
    } catch (e) {
      console.warn('Firestore handover write warning:', e);
    }

    await fetchData();
    showToast('Handover Completed', `Vehicle handed over. Contract is now Active.`);
    refreshFirebaseStats();
    return data.contract;
  };

  const processReturn = async (contractId: string, returnData: any) => {
    const res = await fetch(`/api/contracts/${contractId}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnData })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    try {
      await FirestoreService.update(COLLECTIONS.CONTRACTS, contractId, data.contract);
      await FirestoreService.update(COLLECTIONS.VEHICLES, data.contract.vehicleId, { status: 'available' });
    } catch (e) {
      console.warn('Firestore return write warning:', e);
    }

    await fetchData();
    showToast('Return Processed', `Vehicle returned & final settlement calculated.`);
    refreshFirebaseStats();
    return data.contract;
  };

  const recordPayment = async (paymentData: any) => {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData)
    });
    const pay = await res.json();
    
    try {
      await FirestoreService.set(COLLECTIONS.PAYMENTS, pay.id, pay);
    } catch (e) {
      console.warn('Firestore payment write warning:', e);
    }

    await fetchData();
    showToast('Payment Recorded', `Payment of ${(pay.amount || 0).toLocaleString()} AED allocated. Receipt: ${pay.receiptNumber}`);
    refreshFirebaseStats();
    return pay;
  };

  const applyDeposit = async (depositId: string, amount: number, reason: string) => {
    const res = await fetch(`/api/deposits/${depositId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applyAmount: amount, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    try {
      await FirestoreService.update(COLLECTIONS.DEPOSITS, depositId, data.deposit);
    } catch (e) {
      console.warn('Firestore apply deposit warning:', e);
    }

    await fetchData();
    showToast('Deposit Applied', `Applied ${(amount || 0).toLocaleString()} AED against outstanding charges.`);
    return data.deposit;
  };

  const refundDeposit = async (depositId: string, amount: number) => {
    const res = await fetch(`/api/deposits/${depositId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundAmount: amount })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    try {
      await FirestoreService.update(COLLECTIONS.DEPOSITS, depositId, data.deposit);
    } catch (e) {
      console.warn('Firestore refund deposit warning:', e);
    }

    await fetchData();
    showToast('Deposit Refunded', `Refund of ${(amount || 0).toLocaleString()} AED processed.`);
    return data.deposit;
  };

  const uploadBankBatch = async (batchData: any) => {
    const res = await fetch('/api/bank-batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    try {
      await FirestoreService.set(COLLECTIONS.BANK_BATCHES, data.batch.id, data.batch);
    } catch (e) {
      console.warn('Firestore bank batch write warning:', e);
    }

    await fetchData();
    showToast('Statement Imported', `Imported ${data.batch.totalTransactions} transactions from ${data.batch.bankName}.`);
  };

  const reconcileBankTransaction = async (txnId: string, targetRecordType: string, targetRecordId: string) => {
    const res = await fetch(`/api/bank-transactions/${txnId}/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetRecordType, targetRecordId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    try {
      await FirestoreService.update(COLLECTIONS.BANK_TRANSACTIONS, txnId, data.transaction);
    } catch (e) {
      console.warn('Firestore txn reconcile warning:', e);
    }

    await fetchData();
    showToast('Transaction Reconciled', `Reconciled ${data.transaction.reference} successfully.`);
  };

  /**
   * Bulk version of reconcileBankTransaction: auto-confirms every
   * unreconciled transaction that already has a high-confidence AI
   * suggested match (>= 90), instead of requiring one click per row.
   * Was previously called by BankReconciliationView's "Run Auto
   * Reconciliation" button but never actually defined -- clicking it threw
   * "runAutoReconciliation is not a function".
   */
  const runAutoReconciliation = async () => {
    const candidates = bankTransactions.filter(
      t => !t.reconciled && t.suggestedMatch && t.suggestedMatch.confidence >= 90 && t.suggestedMatch.invoiceId
    );
    let count = 0;
    for (const txn of candidates) {
      try {
        await reconcileBankTransaction(txn.id, 'invoice', txn.suggestedMatch!.invoiceId!);
        count += 1;
      } catch (e) {
        console.warn(`Auto-reconciliation skipped ${txn.id}:`, e);
      }
    }
    if (count > 0) {
      showToast('Auto-Reconciliation Complete', `Automatically reconciled ${count} high-confidence transaction(s).`);
    } else {
      showToast('Auto-Reconciliation Complete', 'No high-confidence unmatched transactions were found.');
    }
  };

  /**
   * Toll/Parking module (Salik, Darb, Parking): manual entry, editing,
   * deletion, file import (preview-then-confirm), and the live default
   * pricing config. All math is done server-side via calculateTollTransaction
   * so client and import rows are always computed identically.
   */
  const addManualToll = async (data: any) => {
    const res = await fetch('/api/tolls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const record = await res.json();
    if (!res.ok) throw new Error(record.error);
    setTollTransactions(prev => [record, ...prev]);

    try {
      await FirestoreService.set(COLLECTIONS.TOLL_TRANSACTIONS, record.id, record);
    } catch (e) {
      console.warn('Firestore toll transaction write warning:', e);
    }

    showToast('Transaction Logged', `${(record.type || '').toUpperCase()} entry ${record.id} saved -- ${record.totalChargedToCustomer} AED billed to customer.`);
    return record;
  };

  const updateTollTransaction = async (id: string, data: any) => {
    const res = await fetch(`/api/tolls/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const updated = await res.json();
    if (!res.ok) throw new Error(updated.error);
    setTollTransactions(prev => prev.map(t => t.id === id ? updated : t));

    try {
      await FirestoreService.update(COLLECTIONS.TOLL_TRANSACTIONS, id, updated);
    } catch (e) {
      console.warn('Firestore toll transaction update warning:', e);
    }

    return updated;
  };

  const deleteTollTransaction = async (id: string) => {
    const res = await fetch(`/api/tolls/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setTollTransactions(prev => prev.filter(t => t.id !== id));

    try {
      await FirestoreService.remove(COLLECTIONS.TOLL_TRANSACTIONS, id);
    } catch (e) {
      console.warn('Firestore toll transaction delete warning:', e);
    }

    showToast('Transaction Removed', 'The toll/parking entry was deleted.');
  };

  const runTollImport = async (file: { fileName: string; fileBase64: string; type: 'salik' | 'darb' }, confirm: boolean) => {
    const res = await fetch('/api/tolls/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...file, confirm })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data as { batch: TollImportBatch; transactions: TollTransaction[]; warnings: string[] };
  };

  // Parses the file and returns what WOULD be imported, without saving --
  // the import UI must show this for the user to review before committing,
  // since statement parsing (especially PDF) is best-effort.
  const previewTollImport = async (file: { fileName: string; fileBase64: string; type: 'salik' | 'darb' }) => {
    return runTollImport(file, false);
  };

  const confirmTollImport = async (file: { fileName: string; fileBase64: string; type: 'salik' | 'darb' }) => {
    const data = await runTollImport(file, true);
    setTollImportBatches(prev => [data.batch, ...prev]);
    setTollTransactions(prev => [...data.transactions, ...prev]);

    try {
      await FirestoreService.set(COLLECTIONS.TOLL_IMPORT_BATCHES, data.batch.id, data.batch);
      await Promise.all(data.transactions.map(t => FirestoreService.set(COLLECTIONS.TOLL_TRANSACTIONS, t.id, t)));
    } catch (e) {
      console.warn('Firestore toll import write warning:', e);
    }

    showToast('Statement Imported', `Imported ${data.batch.totalTransactions} transaction(s) from ${data.batch.fileName} (${data.batch.matchedCount} auto-matched to a contract).`);
    return data;
  };

  const updateTollPricingConfig = async (data: Partial<TollPricingConfig>) => {
    const res = await fetch('/api/toll-pricing-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const updated = await res.json();
    if (!res.ok) throw new Error(updated.error);
    setTollPricingConfig(updated);
    showToast('Pricing Updated', 'Salik/Darb/Parking default rates were updated.');
    return updated;
  };

  /**
   * Notification & WhatsApp Control Center: per-event staff/group toggles,
   * per-event customer-facing toggles, the custom-reminder composer, the
   * message activity log, WhatsApp connection status, and the manual
   * "Run Checks Now" trigger for the automated monitoring sweep.
   */
  const updateNotificationConfig = async (eventKey: string, data: Partial<NotificationEventConfig>) => {
    const res = await fetch(`/api/notification-configs/${eventKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const updated = await res.json();
    if (!res.ok) throw new Error(updated.error);
    setNotificationEventConfigs(prev => prev.map(c => c.eventKey === eventKey ? updated : c));
    return updated;
  };

  const updateCustomerNotificationConfig = async (eventKey: string, enabled: boolean) => {
    const res = await fetch(`/api/customer-notification-configs/${eventKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    const updated = await res.json();
    if (!res.ok) throw new Error(updated.error);
    setCustomerNotificationConfigs(prev => prev.map(c => c.eventKey === eventKey ? updated : c));
    return updated;
  };

  const sendCustomReminder = async (data: { title: string; message: string; broadcastToGroup: boolean; staffRecipientIds: string[] }) => {
    const res = await fetch('/api/custom-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const reminder = await res.json();
    if (!res.ok) throw new Error(reminder.error);
    setCustomReminders(prev => [reminder, ...prev]);
    showToast(
      reminder.status === 'not_configured' ? 'Reminder Saved (Not Sent)' : 'Reminder Sent',
      reminder.status === 'not_configured' ? 'WhatsApp isn\'t connected yet -- the reminder was saved but not dispatched.' : `Sent to ${data.broadcastToGroup ? 'the group and ' : ''}${data.staffRecipientIds.length} staff member(s).`
    );
    return reminder;
  };

  const runNotificationChecksNow = async () => {
    const res = await fetch('/api/notifications/run-checks', { method: 'POST' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    showToast('Checks Complete', `${result.alertsFired} alert(s) fired.`);
    return result;
  };

  const refreshWhatsappStatus = async () => {
    const res = await fetch('/api/whatsapp/status').then(r => r.json()).catch(() => null);
    if (res) setWhatsappStatus(res);
  };

  const extendContract = async (contractId: string, newEndDateTime: string) => {
    const res = await fetch(`/api/contracts/${contractId}/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newEndDateTime })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setContracts(prev => prev.map(c => c.id === contractId ? data.contract : c));
    showToast('Contract Extended', `+${data.extraDays} day(s), +${data.extraAmount.toLocaleString()} AED.`);
    return data;
  };

  const resetTransactionalData = async (confirmText: string) => {
    const res = await fetch('/api/admin/reset-transactional-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmText })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    // Every list this app renders should read empty immediately rather than
    // waiting on the next full fetchData() poll.
    setCustomers([]); setLeads([]); setOpportunities([]); setVehicles([]);
    setQuotations([]); setReservations([]); setContracts([]); setCharges([]);
    setDeposits([]); setPayments([]); setInvoices([]); setBankBatches([]);
    setBankTransactions([]); setTollTransactions([]); setTollImportBatches([]);
    setTasks([]); setCommunications([]); setDocuments([]); setAuditLogs([]);
    setNotifications([]); setCustomReminders([]); setWhatsappMessageLog([]);
    showToast('System Reset', `Cleared ${data.deletedDocs} record(s). The system is ready for real data.`);
    return data;
  };

  /**
   * Client-side wrappers for the AI endpoints server.ts already exposes
   * (/api/ai/query, /api/ai/customer-summary). AIStudioView has called
   * queryAI()/generateCustomerAISummary() since it was built, but neither
   * was ever defined here -- every button on the AI Intelligence page threw
   * "queryAI is not a function" / "generateCustomerAISummary is not a
   * function". The server always responds successfully (it falls back to a
   * canned answer if GEMINI_API_KEY isn't configured), so these just need
   * to call it and normalize the response field names to what the view
   * expects.
   */
  const queryAI = async (prompt: string, language: string = 'en'): Promise<{ text: string; confidence: number }> => {
    const res = await fetch('/api/ai/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, language })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI query failed.');
    return { text: data.answer, confidence: data.confidence };
  };

  const generateCustomerAISummary = async (customerId: string, language: string = 'en'): Promise<{ summary: string; confidence: number }> => {
    const res = await fetch('/api/ai/customer-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, language })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI customer summary failed.');
    return { summary: data.summary, confidence: data.confidence };
  };

  const createTask = async (taskData: Partial<CRMTask>) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });
    const task = await res.json();
    setTasks(prev => [task, ...prev]);
    
    try {
      await FirestoreService.set(COLLECTIONS.TASKS, task.id, task);
    } catch (e) {
      console.warn('Firestore task write warning:', e);
    }

    showToast('Task Created', task.title);
    return task;
  };

  const updateTask = async (id: string, data: Partial<CRMTask>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const updated = await res.json();
    setTasks(prev => prev.map(t => t.id === id ? updated : t));
    
    try {
      await FirestoreService.update(COLLECTIONS.TASKS, id, updated);
    } catch (e) {
      console.warn('Firestore task update warning:', e);
    }
    return updated;
  };

  const addCommunication = async (commData: Partial<Communication>) => {
    const res = await fetch('/api/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commData)
    });
    const comm = await res.json();
    setCommunications(prev => [comm, ...prev]);
    
    try {
      await FirestoreService.set(COLLECTIONS.COMMUNICATIONS, comm.id, comm);
    } catch (e) {
      console.warn('Firestore comm write warning:', e);
    }

    showToast('Activity Logged', `Logged ${comm.channel} activity.`);
    return comm;
  };

  const addDocument = async (docData: Partial<CRMDocument>) => {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docData)
    });
    const doc = await res.json();
    setDocuments(prev => [doc, ...prev]);
    
    try {
      await FirestoreService.set(COLLECTIONS.DOCUMENTS, doc.id, doc);
    } catch (e) {
      console.warn('Firestore doc write warning:', e);
    }

    showToast('Document Uploaded', doc.title);
    return doc;
  };

  return (
    <CRMContext.Provider value={{
      customers, leads, opportunities, vehicles, quotations,
      reservations, contracts, charges, deposits, payments,
      invoices, bankBatches, bankTransactions, tollTransactions,
      tollImportBatches, tollPricingConfig,
      notificationEventConfigs, customerNotificationConfigs, customReminders,
      whatsappMessageLog, whatsappStatus, tasks, communications,
      documents, auditLogs, customFields, numberingConfigs, notifications,
      loading, activeView, setActiveView,
      firebaseSyncState, syncAllToFirestore,
      globalSearchOpen, setGlobalSearchOpen,
      selectedCustomerId, setSelectedCustomerId,
      selectedVehicleId, setSelectedVehicleId,
      selectedContractId, setSelectedContractId,
      selectedQuotationId, setSelectedQuotationId,
      fetchData, showToast, toasts, dismissToast,
      addCustomer, updateCustomer, mergeCustomers, checkDuplicateCustomer,
      addLead, updateLead, convertLeadToCustomer,
      addVehicle, updateVehicle, assignPlate, publishToWebsite, updateLifecycleStatus, getReconciliationReport, checkVehicleAvailability,
      createQuotation, convertQuotationToReservation,
      createReservation, createContractFromReservation, createContract,
      processHandover, processReturn,
      recordPayment, applyDeposit, refundDeposit,
      uploadBankBatch, reconcileBankTransaction, runAutoReconciliation,
      addManualToll, updateTollTransaction, deleteTollTransaction,
      previewTollImport, confirmTollImport, updateTollPricingConfig,
      updateNotificationConfig, updateCustomerNotificationConfig,
      sendCustomReminder, runNotificationChecksNow, refreshWhatsappStatus,
      extendContract, resetTransactionalData,
      queryAI, generateCustomerAISummary,
      createTask, updateTask, addCommunication, addDocument
    }}>
      {children}
    </CRMContext.Provider>
  );
};

export const useCRM = () => {
  const context = useContext(CRMContext);
  if (!context) throw new Error('useCRM must be used within a CRMProvider');
  return context;
};
