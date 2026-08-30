import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  Customer, Lead, Opportunity, Vehicle, Quotation, 
  Reservation, Contract, AdditionalCharge, Deposit, 
  Payment, Invoice, BankImportBatch, BankTransaction, ReceivedAmountClassification,
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

// Every mutation below sends its own request and reads the response itself
// (rather than a shared wrapper further down the call stack), so this is
// the one place that decides what "the API call failed" means. Before this
// fix, most mutation functions called `res.json()` unconditionally and
// trusted the result to be the created/updated entity -- on a 400/403/500,
// the server's `{ error: "..." }` body was cast straight into state
// (setCustomers([errorObject, ...]), etc.), mirrored to Firestore, and
// followed by a success toast, while the thrown-away real error vanished.
// Every call site below now goes through this so a failure surfaces as a
// thrown Error with the server's real message, and nothing else happens.
async function parseApiResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error((body && typeof body === 'object' && body.error) || fallbackMessage);
    // Carry any extra structured fields the server sent alongside `error`
    // (e.g. the Publish Gate's `missingReasons`/`missingReasonsEn` arrays)
    // onto the thrown Error so a specific caller can surface them, without
    // every other caller needing to know or care that they exist.
    if (body && typeof body === 'object') Object.assign(error, body);
    throw error;
  }
  return body as T;
}

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
  startVehicleMaintenance: (vehicleId: string, reason: string) => Promise<Vehicle>;
  logVehicleMaintenance: (vehicleId: string, mileageAtService: number, notes: string) => Promise<Vehicle>;
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
  applyDeposit: (depositId: string, amount: number, reason: string, chargeId: string) => Promise<Deposit>;
  refundDeposit: (depositId: string, amount: number) => Promise<Deposit>;
  
  previewBankImport: (file: { fileName: string; fileBase64: string; bankName?: string; accountNumber?: string }) => Promise<{ batch: BankImportBatch; transactions: BankTransaction[]; warnings: string[] }>;
  confirmBankImport: (file: { fileName: string; fileBase64: string; bankName?: string; accountNumber?: string }) => Promise<{ batch: BankImportBatch; transactions: BankTransaction[]; warnings: string[] }>;
  reconcileBankTransaction: (txnId: string, targetRecordType: string, targetRecordId: string, classification: ReceivedAmountClassification, duplicateOverrideReason?: string) => Promise<void>;
  reclassifyBankTransaction: (txnId: string, classification: ReceivedAmountClassification, reason: string) => Promise<void>;
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

  // Actions. The server is the sole durable writer for every entity below
  // (see src/server/persistence.ts) -- these functions only call the API
  // and mirror a SUCCESSFUL response into local state; they never write to
  // Firestore directly any more, and never touch state on a failed response.
  const checkDuplicateCustomer = async (email: string, phone: string, licenseNumber?: string, idNumber?: string) => {
    const res = await fetch('/api/customers/check-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, licenseNumber, idNumber })
    });
    return parseApiResponse<{ hasDuplicate: boolean; matches: Customer[] }>(res, 'Failed to check for duplicate customers.');
  };

  const addCustomer = async (data: Partial<Customer>) => {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    let newCust: Customer;
    try {
      newCust = await parseApiResponse<Customer>(res, 'Failed to create customer.');
    } catch (err: any) {
      showToast('Customer Creation Failed', err.message, 'error');
      throw err;
    }
    setCustomers(prev => [newCust, ...prev.filter(c => c.id !== newCust.id)]);
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
    let updated: Customer;
    try {
      updated = await parseApiResponse<Customer>(res, 'Failed to update customer.');
    } catch (err: any) {
      showToast('Update Failed', err.message, 'error');
      throw err;
    }
    setCustomers(prev => prev.map(c => c.id === id ? updated : c));
    showToast('Profile Updated', `Customer profile updated successfully.`);
    return updated;
  };

  const mergeCustomers = async (sourceId: string, targetId: string) => {
    const res = await fetch(`/api/customers/${sourceId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetCustomerId: targetId })
    });
    try {
      await parseApiResponse(res, 'Merge failed.');
    } catch (err: any) {
      showToast('Merge Failed', err.message, 'error');
      throw err;
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
    let newLead: Lead;
    try {
      newLead = await parseApiResponse<Lead>(res, 'Failed to create lead.');
    } catch (err: any) {
      showToast('Lead Creation Failed', err.message, 'error');
      throw err;
    }
    setLeads(prev => [newLead, ...prev.filter(l => l.id !== newLead.id)]);
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
    let updated: Lead;
    try {
      updated = await parseApiResponse<Lead>(res, 'Failed to update lead.');
    } catch (err: any) {
      showToast('Update Failed', err.message, 'error');
      throw err;
    }
    setLeads(prev => prev.map(l => l.id === id ? updated : l));
    return updated;
  };

  const convertLeadToCustomer = async (leadId: string) => {
    const res = await fetch(`/api/leads/${leadId}/convert-customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    let data: { customer: Customer };
    try {
      data = await parseApiResponse<{ customer: Customer }>(res, 'Conversion failed.');
    } catch (err: any) {
      showToast('Conversion Failed', err.message, 'error');
      throw err;
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
    let newVeh: Vehicle;
    try {
      newVeh = await parseApiResponse<Vehicle>(res, 'Failed to add vehicle.');
    } catch (err: any) {
      showToast('Vehicle Add Failed', err.message, 'error');
      throw err;
    }
    setVehicles(prev => [newVeh, ...prev.filter(v => v.id !== newVeh.id)]);
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
    let updated: Vehicle;
    try {
      updated = await parseApiResponse<Vehicle>(res, 'Failed to update vehicle.');
    } catch (err: any) {
      showToast('Update Failed', err.message, 'error');
      throw err;
    }
    setVehicles(prev => prev.map(v => v.id === id ? updated : v));
    showToast('Fleet Updated', `Vehicle ${updated.make} ${updated.model} saved.`);
    return updated;
  };

  const assignPlate = async (vehicleId: string, plateNumber: string, plateCity: string, reason: string) => {
    const res = await fetch(`/api/fleet/${vehicleId}/assign-plate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plateNumber, plateCity, reason })
    });
    let result: { success: boolean; vehicle: Vehicle; error?: string };
    try {
      result = await parseApiResponse(res, 'Plate assignment failed.');
    } catch (err: any) {
      showToast('Plate Assignment Failed', err.message, 'error');
      throw err;
    }
    const updated = result.vehicle;
    setVehicles(prev => prev.map(v => v.id === vehicleId ? updated : v));
    showToast('Plate Assigned', `Vehicle ${updated.make} ${updated.model} now carries plate ${plateCity} ${plateNumber}.`);
    return updated;
  };

  const publishToWebsite = async (vehicleId: string, publication: Partial<WebsiteVehiclePublication>) => {
    const res = await fetch(`/api/fleet/${vehicleId}/website-publish`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publication })
    });
    let result: { success: boolean; vehicle: Vehicle; error?: string };
    try {
      result = await parseApiResponse(res, 'Website publish failed.');
    } catch (err: any) {
      showToast('Publish Failed', err.message, 'error');
      throw err;
    }
    const updated = result.vehicle;
    setVehicles(prev => prev.map(v => v.id === vehicleId ? updated : v));
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
    let result: { success: boolean; vehicle: Vehicle; error?: string };
    try {
      result = await parseApiResponse(res, 'Lifecycle update failed.');
    } catch (err: any) {
      showToast('Lifecycle Update Failed', err.message, 'error');
      throw err;
    }
    const updated = result.vehicle;
    setVehicles(prev => prev.map(v => v.id === vehicleId ? updated : v));
    showToast('Lifecycle Updated', `Vehicle ${updated.make} ${updated.model} is now ${lifecycleStatus}.`);
    return updated;
  };

  // RULE-M03 (Splendor Master Rule Set): starting maintenance takes a
  // vehicle physically off the road; logging a completed service rolls the
  // next-due mileage threshold forward again. See src/server/maintenance.ts.
  const startVehicleMaintenance = async (vehicleId: string, reason: string) => {
    const res = await fetch(`/api/fleet/${vehicleId}/start-maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    let updated: Vehicle;
    try {
      updated = await parseApiResponse<Vehicle>(res, 'Failed to start maintenance.');
    } catch (err: any) {
      showToast('Could Not Start Maintenance', err.message, 'error');
      throw err;
    }
    setVehicles(prev => prev.map(v => v.id === vehicleId ? updated : v));
    showToast('Maintenance Started', `${updated.make} ${updated.model} is now marked in service.`);
    return updated;
  };

  const logVehicleMaintenance = async (vehicleId: string, mileageAtService: number, notes: string) => {
    const res = await fetch(`/api/fleet/${vehicleId}/log-maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mileageAtService, notes })
    });
    let updated: Vehicle;
    try {
      updated = await parseApiResponse<Vehicle>(res, 'Failed to log the completed maintenance.');
    } catch (err: any) {
      showToast('Could Not Log Maintenance', err.message, 'error');
      throw err;
    }
    setVehicles(prev => prev.map(v => v.id === vehicleId ? updated : v));
    showToast('Maintenance Logged', `${updated.make} ${updated.model} is back in service. Next due at ${(updated.nextMaintenanceMileage || 0).toLocaleString()} km.`);
    return updated;
  };

  const getReconciliationReport = async (): Promise<WebsiteReconciliationItem[]> => {
    const res = await fetch('/api/fleet/reconciliation/report');
    const data = await parseApiResponse<{ report: WebsiteReconciliationItem[] }>(res, 'Failed to load reconciliation report.');
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
    let quote: Quotation;
    try {
      quote = await parseApiResponse<Quotation>(res, 'Failed to create quotation.');
    } catch (err: any) {
      showToast('Quotation Failed', err.message, 'error');
      throw err;
    }
    setQuotations(prev => [quote, ...prev.filter(q => q.id !== quote.id)]);
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
    let data: { reservation: Reservation };
    try {
      data = await parseApiResponse<{ reservation: Reservation }>(res, 'Failed to convert quotation.');
    } catch (err: any) {
      showToast('Conflict Detected', err.message, 'error');
      throw err;
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
    let resData: Reservation;
    try {
      resData = await parseApiResponse<Reservation>(res, 'Vehicle not available.');
    } catch (err: any) {
      showToast('Booking Conflict', err.message, 'error');
      throw err;
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
    let data: { contract: Contract };
    try {
      data = await parseApiResponse<{ contract: Contract }>(res, 'Failed to generate contract.');
    } catch (err: any) {
      showToast('Contract Generation Failed', err.message, 'error');
      throw err;
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
    let newContract: Contract;
    try {
      newContract = await parseApiResponse<Contract>(res, 'Failed to issue contract.');
    } catch (err: any) {
      showToast('Contract Failed', err.message, 'error');
      throw err;
    }
    setContracts(prev => [newContract, ...prev.filter(c => c.id !== newContract.id)]);
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
    let data: { contract: Contract };
    try {
      data = await parseApiResponse<{ contract: Contract }>(res, 'Handover failed.');
    } catch (err: any) {
      showToast('Handover Failed', err.message, 'error');
      throw err;
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
    let data: { contract: Contract };
    try {
      data = await parseApiResponse<{ contract: Contract }>(res, 'Return processing failed.');
    } catch (err: any) {
      showToast('Return Failed', err.message, 'error');
      throw err;
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
    let pay: Payment;
    try {
      pay = await parseApiResponse<Payment>(res, 'Failed to record payment.');
    } catch (err: any) {
      showToast('Payment Failed', err.message, 'error');
      throw err;
    }
    await fetchData();
    showToast('Payment Recorded', `Payment of ${(pay.amount || 0).toLocaleString()} AED allocated. Receipt: ${pay.receiptNumber}`);
    refreshFirebaseStats();
    return pay;
  };

  const applyDeposit = async (depositId: string, amount: number, reason: string, chargeId: string) => {
    const res = await fetch(`/api/deposits/${depositId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applyAmount: amount, reason, chargeId })
    });
    let data: { deposit: Deposit };
    try {
      data = await parseApiResponse<{ deposit: Deposit }>(res, 'Failed to apply deposit.');
    } catch (err: any) {
      showToast('Deposit Application Failed', err.message, 'error');
      throw err;
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
    let data: { deposit: Deposit };
    try {
      data = await parseApiResponse<{ deposit: Deposit }>(res, 'Failed to refund deposit.');
    } catch (err: any) {
      showToast('Deposit Refund Failed', err.message, 'error');
      throw err;
    }
    await fetchData();
    showToast('Deposit Refunded', `Refund of ${(amount || 0).toLocaleString()} AED processed.`);
    return data.deposit;
  };

  // Real CSV/Excel statement parsing (server.ts / bankStatementParsers.ts),
  // routed through the exact same preview-then-confirm shape as the toll
  // importer above: `confirm:false` only ever asks the server to parse and
  // classify the file, never writes anything, so the caller can render the
  // matched/needs-review/duplicate/etc breakdown before anyone commits to
  // it. This is also where the mission's absolute rule actually lives on
  // the frontend: nothing here (or in the routes it calls) ever turns a
  // parsed row into a Payment or a reconciled BankTransaction by itself.
  const runBankImport = async (file: { fileName: string; fileBase64: string; bankName?: string; accountNumber?: string }, confirm: boolean) => {
    const res = await fetch('/api/bank-batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...file, confirm })
    });
    return parseApiResponse<{ batch: BankImportBatch; transactions: BankTransaction[]; warnings: string[] }>(res, 'Bank statement import failed.');
  };

  const previewBankImport = async (file: { fileName: string; fileBase64: string; bankName?: string; accountNumber?: string }) => {
    try {
      return await runBankImport(file, false);
    } catch (err: any) {
      showToast('Preview Failed', err.message, 'error');
      throw err;
    }
  };

  const confirmBankImport = async (file: { fileName: string; fileBase64: string; bankName?: string; accountNumber?: string }) => {
    let data: { batch: BankImportBatch; transactions: BankTransaction[]; warnings: string[] };
    try {
      data = await runBankImport(file, true);
    } catch (err: any) {
      showToast('Import Failed', err.message, 'error');
      throw err;
    }
    await fetchData();
    showToast('Statement Imported', `Imported ${data.transactions.length} transaction(s) from ${data.batch.bankName}.`);
    return data;
  };

  const reconcileBankTransaction = async (txnId: string, targetRecordType: string, targetRecordId: string, classification: ReceivedAmountClassification, duplicateOverrideReason?: string) => {
    const idempotencyKey = crypto.randomUUID();
    const res = await fetch(`/api/bank-transactions/${txnId}/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ targetRecordType, targetRecordId, classification, duplicateOverrideReason })
    });
    let data: { transaction: BankTransaction };
    try {
      data = await parseApiResponse<{ transaction: BankTransaction }>(res, 'Failed to reconcile transaction.');
    } catch (err: any) {
      showToast('Reconciliation Failed', err.message, 'error');
      throw err;
    }
    await fetchData();
    showToast('Transaction Reconciled', `Reconciled ${data.transaction.reference} successfully.`);
  };

  const reclassifyBankTransaction = async (txnId: string, classification: ReceivedAmountClassification, reason: string) => {
    const idempotencyKey = crypto.randomUUID();
    const res = await fetch(`/api/bank-transactions/${txnId}/reclassify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ classification, reason })
    });
    let data: { transaction: BankTransaction };
    try {
      data = await parseApiResponse<{ transaction: BankTransaction }>(res, 'Failed to reclassify transaction.');
    } catch (err: any) {
      showToast('Reclassification Failed', err.message, 'error');
      throw err;
    }
    await fetchData();
    showToast('Transaction Reclassified', `${data.transaction.reference} reclassified to ${classification.replace(/_/g, ' ')}.`);
  };

  /**
   * ABSOLUTE RULE (Bank Reconciliation mission brief): a payment/receipt
   * may NEVER be created or confirmed automatically from bank-statement
   * analysis alone -- every non-"matched" outcome goes to human review and
   * approval, and even a "matched" row is only ever confirmed by an
   * explicit, individual reconcileBankTransaction() call a person makes
   * (see handleConfirmMatch in BankReconciliationView.tsx).
   *
   * This function previously violated that rule outright: it looped over
   * every high-confidence suggested match and called
   * reconcileBankTransaction() on each one with zero human review,
   * silently posting invoice/customer-balance updates a person never saw.
   * It's kept (same name, same call sites) purely as a non-mutating
   * "surface what's ready for review" summary -- it never reconciles
   * anything itself.
   */
  const runAutoReconciliation = async () => {
    const candidates = bankTransactions.filter(
      t => !t.reconciled && t.matchClassification === 'matched' && t.suggestedMatch
    );
    if (candidates.length > 0) {
      showToast(
        'Review Needed',
        `${candidates.length} transaction(s) have a high-confidence suggested match ready for your review. Confirm each one individually -- no payment is ever auto-confirmed from a bank statement alone.`
      );
    } else {
      showToast('No Action Needed', 'No unreconciled transactions currently have a high-confidence suggested match.');
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
    let record: TollTransaction;
    try {
      record = await parseApiResponse<TollTransaction>(res, 'Failed to log toll/parking entry.');
    } catch (err: any) {
      showToast('Entry Failed', err.message, 'error');
      throw err;
    }
    setTollTransactions(prev => [record, ...prev]);
    showToast('Transaction Logged', `${((record as any).type || '').toUpperCase()} entry ${record.id} saved -- ${(record as any).totalChargedToCustomer} AED billed to customer.`);
    return record;
  };

  const updateTollTransaction = async (id: string, data: any) => {
    const res = await fetch(`/api/tolls/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    let updated: TollTransaction;
    try {
      updated = await parseApiResponse<TollTransaction>(res, 'Failed to update toll/parking entry.');
    } catch (err: any) {
      showToast('Update Failed', err.message, 'error');
      throw err;
    }
    setTollTransactions(prev => prev.map(t => t.id === id ? updated : t));
    return updated;
  };

  const deleteTollTransaction = async (id: string) => {
    const res = await fetch(`/api/tolls/${id}`, { method: 'DELETE' });
    try {
      await parseApiResponse(res, 'Failed to delete toll/parking entry.');
    } catch (err: any) {
      showToast('Delete Failed', err.message, 'error');
      throw err;
    }
    setTollTransactions(prev => prev.filter(t => t.id !== id));
    showToast('Transaction Removed', 'The toll/parking entry was deleted.');
  };

  const runTollImport = async (file: { fileName: string; fileBase64: string; type: 'salik' | 'darb' }, confirm: boolean) => {
    const res = await fetch('/api/tolls/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...file, confirm })
    });
    return parseApiResponse<{ batch: TollImportBatch; transactions: TollTransaction[]; warnings: string[] }>(res, 'Toll import failed.');
  };

  // Parses the file and returns what WOULD be imported, without saving --
  // the import UI must show this for the user to review before committing,
  // since statement parsing (especially PDF) is best-effort.
  const previewTollImport = async (file: { fileName: string; fileBase64: string; type: 'salik' | 'darb' }) => {
    try {
      return await runTollImport(file, false);
    } catch (err: any) {
      showToast('Preview Failed', err.message, 'error');
      throw err;
    }
  };

  const confirmTollImport = async (file: { fileName: string; fileBase64: string; type: 'salik' | 'darb' }) => {
    let data: { batch: TollImportBatch; transactions: TollTransaction[]; warnings: string[] };
    try {
      data = await runTollImport(file, true);
    } catch (err: any) {
      showToast('Import Failed', err.message, 'error');
      throw err;
    }
    setTollImportBatches(prev => [data.batch, ...prev]);
    setTollTransactions(prev => [...data.transactions, ...prev]);
    showToast('Statement Imported', `Imported ${(data.batch as any).totalTransactions} transaction(s) from ${(data.batch as any).fileName} (${(data.batch as any).matchedCount} auto-matched to a contract).`);
    return data;
  };

  const updateTollPricingConfig = async (data: Partial<TollPricingConfig>) => {
    const res = await fetch('/api/toll-pricing-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    let updated: TollPricingConfig;
    try {
      updated = await parseApiResponse<TollPricingConfig>(res, 'Failed to update toll pricing.');
    } catch (err: any) {
      showToast('Update Failed', err.message, 'error');
      throw err;
    }
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
    let updated: NotificationEventConfig;
    try {
      updated = await parseApiResponse<NotificationEventConfig>(res, 'Failed to update notification config.');
    } catch (err: any) {
      showToast('Update Failed', err.message, 'error');
      throw err;
    }
    setNotificationEventConfigs(prev => prev.map(c => c.eventKey === eventKey ? updated : c));
    return updated;
  };

  const updateCustomerNotificationConfig = async (eventKey: string, enabled: boolean) => {
    const res = await fetch(`/api/customer-notification-configs/${eventKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    let updated: CustomerNotificationConfig;
    try {
      updated = await parseApiResponse<CustomerNotificationConfig>(res, 'Failed to update notification config.');
    } catch (err: any) {
      showToast('Update Failed', err.message, 'error');
      throw err;
    }
    setCustomerNotificationConfigs(prev => prev.map(c => c.eventKey === eventKey ? updated : c));
    return updated;
  };

  const sendCustomReminder = async (data: { title: string; message: string; broadcastToGroup: boolean; staffRecipientIds: string[] }) => {
    const res = await fetch('/api/custom-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    let reminder: CustomReminder;
    try {
      reminder = await parseApiResponse<CustomReminder>(res, 'Failed to send reminder.');
    } catch (err: any) {
      showToast('Reminder Failed', err.message, 'error');
      throw err;
    }
    setCustomReminders(prev => [reminder, ...prev]);
    showToast(
      (reminder as any).status === 'not_configured' ? 'Reminder Saved (Not Sent)' : 'Reminder Sent',
      (reminder as any).status === 'not_configured' ? 'WhatsApp isn\'t connected yet -- the reminder was saved but not dispatched.' : `Sent to ${data.broadcastToGroup ? 'the group and ' : ''}${data.staffRecipientIds.length} staff member(s).`
    );
    return reminder;
  };

  const runNotificationChecksNow = async () => {
    const res = await fetch('/api/notifications/run-checks', { method: 'POST' });
    let result: { ranAt: string; alertsFired: number; details: string[] };
    try {
      result = await parseApiResponse(res, 'Notification check sweep failed.');
    } catch (err: any) {
      showToast('Checks Failed', err.message, 'error');
      throw err;
    }
    showToast('Checks Complete', `${result.alertsFired} alert(s) fired.`);
    return result;
  };

  const refreshWhatsappStatus = async () => {
    const res = await fetch('/api/whatsapp/status').then(r => r.ok ? r.json() : null).catch(() => null);
    if (res) setWhatsappStatus(res);
  };

  const extendContract = async (contractId: string, newEndDateTime: string) => {
    const res = await fetch(`/api/contracts/${contractId}/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newEndDateTime })
    });
    let data: { contract: Contract; extraDays: number; extraAmount: number };
    try {
      data = await parseApiResponse(res, 'Failed to extend contract.');
    } catch (err: any) {
      showToast('Extension Failed', err.message, 'error');
      throw err;
    }
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
    let data: { success: boolean; deletedDocs: number };
    try {
      data = await parseApiResponse(res, 'Failed to reset transactional data.');
    } catch (err: any) {
      showToast('Reset Failed', err.message, 'error');
      throw err;
    }
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
    let data: { answer: string; confidence: number };
    try {
      data = await parseApiResponse(res, 'AI query failed.');
    } catch (err: any) {
      showToast('AI Query Failed', err.message, 'error');
      throw err;
    }
    return { text: data.answer, confidence: data.confidence };
  };

  const generateCustomerAISummary = async (customerId: string, language: string = 'en'): Promise<{ summary: string; confidence: number }> => {
    const res = await fetch('/api/ai/customer-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, language })
    });
    let data: { summary: string; confidence: number };
    try {
      data = await parseApiResponse(res, 'AI customer summary failed.');
    } catch (err: any) {
      showToast('AI Summary Failed', err.message, 'error');
      throw err;
    }
    return { summary: data.summary, confidence: data.confidence };
  };

  const createTask = async (taskData: Partial<CRMTask>) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });
    let task: CRMTask;
    try {
      task = await parseApiResponse<CRMTask>(res, 'Failed to create task.');
    } catch (err: any) {
      showToast('Task Creation Failed', err.message, 'error');
      throw err;
    }
    setTasks(prev => [task, ...prev]);
    showToast('Task Created', task.title);
    return task;
  };

  const updateTask = async (id: string, data: Partial<CRMTask>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    let updated: CRMTask;
    try {
      updated = await parseApiResponse<CRMTask>(res, 'Failed to update task.');
    } catch (err: any) {
      showToast('Update Failed', err.message, 'error');
      throw err;
    }
    setTasks(prev => prev.map(t => t.id === id ? updated : t));
    return updated;
  };

  const addCommunication = async (commData: Partial<Communication>) => {
    const res = await fetch('/api/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commData)
    });
    let comm: Communication;
    try {
      comm = await parseApiResponse<Communication>(res, 'Failed to log activity.');
    } catch (err: any) {
      showToast('Logging Failed', err.message, 'error');
      throw err;
    }
    setCommunications(prev => [comm, ...prev]);
    showToast('Activity Logged', `Logged ${comm.channel} activity.`);
    return comm;
  };

  const addDocument = async (docData: Partial<CRMDocument>) => {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docData)
    });
    let doc: CRMDocument;
    try {
      doc = await parseApiResponse<CRMDocument>(res, 'Failed to upload document.');
    } catch (err: any) {
      showToast('Upload Failed', err.message, 'error');
      throw err;
    }
    setDocuments(prev => [doc, ...prev]);
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
      addVehicle, updateVehicle, assignPlate, publishToWebsite, updateLifecycleStatus, startVehicleMaintenance, logVehicleMaintenance, getReconciliationReport, checkVehicleAvailability,
      createQuotation, convertQuotationToReservation,
      createReservation, createContractFromReservation, createContract,
      processHandover, processReturn,
      recordPayment, applyDeposit, refundDeposit,
      previewBankImport, confirmBankImport, reconcileBankTransaction, reclassifyBankTransaction, runAutoReconciliation,
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
