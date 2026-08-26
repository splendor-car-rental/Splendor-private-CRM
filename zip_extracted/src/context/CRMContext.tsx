import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  Customer, Lead, Opportunity, Vehicle, Quotation, 
  Reservation, Contract, AdditionalCharge, Deposit, 
  Payment, Invoice, BankImportBatch, BankTransaction, 
  CRMTask, Communication, CRMDocument, AuditLog, 
  CustomFieldDefinition, NumberingConfig, NotificationItem 
} from '../types';
import { FirestoreService, COLLECTIONS } from '../firebase/firestoreService';
import { testFirebaseConnection, firebaseConfig } from '../firebase/config';
import { apiFetch as fetch } from '../lib/apiFetch';

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
  
  createTask: (taskData: Partial<CRMTask>) => Promise<CRMTask>;
  updateTask: (id: string, data: Partial<CRMTask>) => Promise<CRMTask>;
  
  addCommunication: (commData: Partial<Communication>) => Promise<Communication>;
  addDocument: (docData: Partial<CRMDocument>) => Promise<CRMDocument>;
}

const CRMContext = createContext<CRMContextType | undefined>(undefined);

export const CRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
        docRes, auditRes, cfRes, numRes, notifRes
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
        fetch('/api/notifications').then(r => r.json()).catch(() => [])
      ]);

      if (custRes && custRes.length > 0) setCustomers(custRes);
      if (leadRes && leadRes.length > 0) setLeads(leadRes);
      if (oppRes && oppRes.length > 0) setOpportunities(oppRes);
      if (vehRes && vehRes.length > 0) setVehicles(vehRes);
      if (quoteRes && quoteRes.length > 0) setQuotations(quoteRes);
      if (resRes && resRes.length > 0) setReservations(resRes);
      if (conRes && conRes.length > 0) setContracts(conRes);
      if (chgRes && chgRes.length > 0) setCharges(chgRes);
      if (depRes && depRes.length > 0) setDeposits(depRes);
      if (payRes && payRes.length > 0) setPayments(payRes);
      if (invRes && invRes.length > 0) setInvoices(invRes);
      if (bBatchRes && bBatchRes.length > 0) setBankBatches(bBatchRes);
      if (bTxnRes && bTxnRes.length > 0) setBankTransactions(bTxnRes);
      if (tskRes && tskRes.length > 0) setTasks(tskRes);
      if (commRes && commRes.length > 0) setCommunications(commRes);
      if (docRes && docRes.length > 0) setDocuments(docRes);
      if (auditRes && auditRes.length > 0) setAuditLogs(auditRes);
      if (cfRes && cfRes.length > 0) setCustomFields(cfRes);
      if (numRes && numRes.length > 0) setNumberingConfigs(numRes);
      if (notifRes && notifRes.length > 0) setNotifications(notifRes);

      await refreshFirebaseStats();
    } catch (error) {
      console.error('Failed to fetch CRM dataset:', error);
      showToast('Sync Warning', 'Using cached state while connecting to Firebase', 'info');
    } finally {
      setLoading(false);
    }
  }, [showToast, refreshFirebaseStats]);

  // Subscribe to real-time Firestore collections
  useEffect(() => {
    let unsubs: (() => void)[] = [];

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

        // Subscribe to Vehicles
        unsubs.push(
          FirestoreService.subscribe<Vehicle>(COLLECTIONS.VEHICLES, (items) => {
            if (items && items.length > 0) {
              setVehicles(items);
            }
          })
        );

        // Subscribe to Customers
        unsubs.push(
          FirestoreService.subscribe<Customer>(COLLECTIONS.CUSTOMERS, (items) => {
            if (items && items.length > 0) {
              setCustomers(items);
            }
          })
        );

        // Subscribe to Contracts
        unsubs.push(
          FirestoreService.subscribe<Contract>(COLLECTIONS.CONTRACTS, (items) => {
            if (items && items.length > 0) {
              setContracts(items);
            }
          })
        );

        // Subscribe to Leads
        unsubs.push(
          FirestoreService.subscribe<Lead>(COLLECTIONS.LEADS, (items) => {
            if (items && items.length > 0) {
              setLeads(items);
            }
          })
        );

        // Subscribe to Reservations
        unsubs.push(
          FirestoreService.subscribe<Reservation>(COLLECTIONS.RESERVATIONS, (items) => {
            if (items && items.length > 0) {
              setReservations(items);
            }
          })
        );

        // Subscribe to Quotations
        unsubs.push(
          FirestoreService.subscribe<Quotation>(COLLECTIONS.QUOTATIONS, (items) => {
            if (items && items.length > 0) {
              setQuotations(items);
            }
          })
        );

        // Subscribe to Invoices
        unsubs.push(
          FirestoreService.subscribe<Invoice>(COLLECTIONS.INVOICES, (items) => {
            if (items && items.length > 0) {
              setInvoices(items);
            }
          })
        );

        // Subscribe to Payments
        unsubs.push(
          FirestoreService.subscribe<Payment>(COLLECTIONS.PAYMENTS, (items) => {
            if (items && items.length > 0) {
              setPayments(items);
            }
          })
        );

        // Subscribe to Deposits
        unsubs.push(
          FirestoreService.subscribe<Deposit>(COLLECTIONS.DEPOSITS, (items) => {
            if (items && items.length > 0) {
              setDeposits(items);
            }
          })
        );

        // Subscribe to Bank Transactions
        unsubs.push(
          FirestoreService.subscribe<BankTransaction>(COLLECTIONS.BANK_TRANSACTIONS, (items) => {
            if (items && items.length > 0) {
              setBankTransactions(items);
            }
          })
        );

        // Subscribe to Tasks
        unsubs.push(
          FirestoreService.subscribe<CRMTask>(COLLECTIONS.TASKS, (items) => {
            if (items && items.length > 0) {
              setTasks(items);
            }
          })
        );
      } catch (err) {
        console.warn('Firebase real-time listener setup:', err);
      }
    };

    setupListeners();
    fetchData();

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [fetchData]);

  // Sync entire dataset to user's Firestore project
  const syncAllToFirestore = useCallback(async () => {
    try {
      setFirebaseSyncState(prev => ({ ...prev, isSyncing: true }));
      showToast('Firebase Synchronization', 'Syncing fleet and CRM records directly to Firestore project...', 'info');

      // Fetch latest server baseline if needed
      const [
        cRes, lRes, oRes, vRes, qRes, rRes, conRes,
        chgRes, depRes, payRes, invRes, bbRes, btRes,
        tRes, commRes, dRes, aRes, cfRes, numRes, notRes
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
        fetch('/api/notifications').then(r => r.json()).catch(() => notifications)
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
        notifications: notRes
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

    showToast('Quotation Prepared', `Quotation ${quote.id} (${quote.grandTotal.toLocaleString()} AED) created.`);
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
    showToast('Contract Issued', `Contract ${newContract.contractNumber} (${newContract.grandTotal?.toLocaleString()} AED) active.`);
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
    showToast('Payment Recorded', `Payment of ${pay.amount.toLocaleString()} AED allocated. Receipt: ${pay.receiptNumber}`);
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
    showToast('Deposit Applied', `Applied ${amount.toLocaleString()} AED against outstanding charges.`);
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
    showToast('Deposit Refunded', `Refund of ${amount.toLocaleString()} AED processed.`);
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
      invoices, bankBatches, bankTransactions, tasks, communications,
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
      addVehicle, updateVehicle, checkVehicleAvailability,
      createQuotation, convertQuotationToReservation,
      createReservation, createContractFromReservation, createContract,
      processHandover, processReturn,
      recordPayment, applyDeposit, refundDeposit,
      uploadBankBatch, reconcileBankTransaction,
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
