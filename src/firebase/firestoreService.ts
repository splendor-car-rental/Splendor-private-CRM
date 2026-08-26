import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db } from './config';
import { handleFirestoreError, OperationType } from './errorHandling';
import { 
  Customer, Lead, Opportunity, Vehicle, Quotation, 
  Reservation, Contract, AdditionalCharge, Deposit, 
  Payment, Invoice, BankImportBatch, BankTransaction, 
  CRMTask, Communication, CRMDocument, AuditLog, 
  CustomFieldDefinition, NumberingConfig, NotificationItem 
} from '../types';

export const COLLECTIONS = {
  VEHICLES: 'vehicles',
  CUSTOMERS: 'customers',
  LEADS: 'leads',
  OPPORTUNITIES: 'opportunities',
  QUOTATIONS: 'quotations',
  RESERVATIONS: 'reservations',
  CONTRACTS: 'contracts',
  CHARGES: 'charges',
  DEPOSITS: 'deposits',
  PAYMENTS: 'payments',
  INVOICES: 'invoices',
  BANK_BATCHES: 'bank_batches',
  BANK_TRANSACTIONS: 'bank_transactions',
  TASKS: 'tasks',
  COMMUNICATIONS: 'communications',
  DOCUMENTS: 'documents',
  AUDIT_LOGS: 'audit_logs',
  CUSTOM_FIELDS: 'custom_fields',
  NUMBERING_CONFIGS: 'numbering_configs',
  NOTIFICATIONS: 'notifications',
  TOLL_TRANSACTIONS: 'toll_transactions',
  TOLL_IMPORT_BATCHES: 'toll_import_batches'
} as const;

export class FirestoreService {
  /**
   * Subscribe to real-time changes on a Firestore collection
   */
  static subscribe<T>(
    collectionName: string,
    onData: (items: T[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const colRef = collection(db, collectionName);
    const q = query(colRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        })) as T[];
        onData(items);
      },
      (error) => {
        console.warn(`Firestore snapshot error for ${collectionName}:`, error);
        if (onError) {
          onError(error);
        } else {
          try {
            handleFirestoreError(error, OperationType.LIST, collectionName);
          } catch (e) {
            // Logged handled
          }
        }
      }
    );

    return unsubscribe;
  }

  /**
   * Fetch all documents from a collection once
   */
  static async getAll<T>(collectionName: string): Promise<T[]> {
    try {
      const snap = await getDocs(collection(db, collectionName));
      return snap.docs.map(d => ({ ...d.data(), id: d.id })) as T[];
    } catch (error) {
      console.warn(`Failed to fetch ${collectionName} from Firestore:`, error);
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  }

  /**
   * Set/Upsert document by ID
   */
  static async set(collectionName: string, id: string, data: any): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      await setDoc(docRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${id}`);
    }
  }

  /**
   * Update existing document fields
   */
  static async update(collectionName: string, id: string, data: any): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, { ...data, updatedAt: new Date().toISOString() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${id}`);
    }
  }

  /**
   * Delete document
   */
  static async remove(collectionName: string, id: string): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${id}`);
    }
  }

  /**
   * Check Firestore state and return live document counts across all core collections
   */
  static async getLiveCollectionStats(): Promise<{
    totalDocs: number;
    counts: Record<string, number>;
    hasAnyData: boolean;
  }> {
    const collectionsToCheck = [
      COLLECTIONS.VEHICLES,
      COLLECTIONS.CUSTOMERS,
      COLLECTIONS.CONTRACTS,
      COLLECTIONS.LEADS,
      COLLECTIONS.RESERVATIONS,
      COLLECTIONS.QUOTATIONS,
      COLLECTIONS.INVOICES,
      COLLECTIONS.BANK_TRANSACTIONS
    ];

    const counts: Record<string, number> = {};
    let total = 0;

    await Promise.all(
      collectionsToCheck.map(async (colName) => {
        try {
          const snap = await getDocs(collection(db, colName));
          counts[colName] = snap.size;
          total += snap.size;
        } catch (e) {
          counts[colName] = 0;
        }
      })
    );

    return {
      totalDocs: total,
      counts,
      hasAnyData: total > 0
    };
  }

  /**
   * Seed luxury fleet, sample VIP customers, contracts, and settings to the user's Firestore project
   */
  static async seedFullCRMToFirestore(seedData: {
    vehicles: Vehicle[];
    customers: Customer[];
    leads: Lead[];
    opportunities: Opportunity[];
    quotations: Quotation[];
    reservations: Reservation[];
    contracts: Contract[];
    invoices: Invoice[];
    deposits: Deposit[];
    payments: Payment[];
    charges: AdditionalCharge[];
    bankTransactions: BankTransaction[];
    bankBatches: BankImportBatch[];
    tasks: CRMTask[];
    communications: Communication[];
    documents: CRMDocument[];
    auditLogs: AuditLog[];
    customFields: CustomFieldDefinition[];
    numberingConfigs: NumberingConfig[];
    notifications: NotificationItem[];
  }): Promise<{ writtenCount: number }> {
    let written = 0;

    const commitBatchList = async (colName: string, items: any[]) => {
      if (!items || items.length === 0) return;
      const chunks: any[][] = [];
      for (let i = 0; i < items.length; i += 400) {
        chunks.push(items.slice(i, i + 400));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(item => {
          const id = item.id || `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const docRef = doc(db, colName, id);
          batch.set(docRef, item, { merge: true });
          written += 1;
        });
        await batch.commit();
      }
    };

    await commitBatchList(COLLECTIONS.VEHICLES, seedData.vehicles);
    await commitBatchList(COLLECTIONS.CUSTOMERS, seedData.customers);
    await commitBatchList(COLLECTIONS.LEADS, seedData.leads);
    await commitBatchList(COLLECTIONS.OPPORTUNITIES, seedData.opportunities);
    await commitBatchList(COLLECTIONS.QUOTATIONS, seedData.quotations);
    await commitBatchList(COLLECTIONS.RESERVATIONS, seedData.reservations);
    await commitBatchList(COLLECTIONS.CONTRACTS, seedData.contracts);
    await commitBatchList(COLLECTIONS.INVOICES, seedData.invoices);
    await commitBatchList(COLLECTIONS.DEPOSITS, seedData.deposits);
    await commitBatchList(COLLECTIONS.PAYMENTS, seedData.payments);
    await commitBatchList(COLLECTIONS.CHARGES, seedData.charges);
    await commitBatchList(COLLECTIONS.BANK_TRANSACTIONS, seedData.bankTransactions);
    await commitBatchList(COLLECTIONS.BANK_BATCHES, seedData.bankBatches);
    await commitBatchList(COLLECTIONS.TASKS, seedData.tasks);
    await commitBatchList(COLLECTIONS.COMMUNICATIONS, seedData.communications);
    await commitBatchList(COLLECTIONS.DOCUMENTS, seedData.documents);
    await commitBatchList(COLLECTIONS.AUDIT_LOGS, seedData.auditLogs);
    await commitBatchList(COLLECTIONS.CUSTOM_FIELDS, seedData.customFields);
    await commitBatchList(COLLECTIONS.NUMBERING_CONFIGS, seedData.numberingConfigs);
    await commitBatchList(COLLECTIONS.NOTIFICATIONS, seedData.notifications);

    return { writtenCount: written };
  }
}
