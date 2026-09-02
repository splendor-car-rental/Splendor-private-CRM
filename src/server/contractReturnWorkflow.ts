import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { ACCOUNTING_CONTROL_ACCOUNTS } from '../config/accounting';

export type ContractReturnActor = {
  uid: string;
  name: string;
  role: string;
};

export class ContractReturnWorkflowError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ContractReturnWorkflowError';
    this.status = status;
  }
}

export type BeginReturnResult = {
  contract: any;
  vehicle: any;
  customer: any;
  inspection: any;
};

export type SettleReturnInput = {
  /** Human closure/reference note only. Never treated as proof that money moved. */
  settlementReference: string;
  settlementNotes?: string;
  /**
   * Legacy compatibility field. Browser-selected ids are deliberately NOT
   * accepted as settlement evidence; callers must settle charges through an
   * authoritative accounting workflow first.
   */
  settledChargeIds?: string[];
};

export type SettleReturnResult = {
  contract: any;
  vehicle: any;
  customer: any;
  inspection: any;
  settledChargeIds: string[];
};

type AccountingJournal = {
  id: string;
  sourceType: string;
  sourceId: string;
  sourceAction: string;
  status: string;
  totalDebit: number;
  totalCredit: number;
  reference?: string;
  lines?: Array<{
    accountCode: string;
    debit: number;
    credit: number;
    dimensions?: { customerId?: string; contractId?: string; invoiceId?: string; [key: string]: unknown };
  }>;
};

function db() {
  if (admin.apps.length === 0) {
    throw new ContractReturnWorkflowError(503, 'Server persistence is not configured.');
  }
  return admin.firestore();
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown, label = 'Amount'): number {
  const parsed = finiteNumber(value);
  if (parsed === null) throw new ContractReturnWorkflowError(409, `${label} is not a valid financial amount.`);
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function deterministicJournalId(sourceType: string, sourceId: string, sourceAction: string): string {
  const digest = crypto.createHash('sha256').update(`${sourceType}:${sourceId}:${sourceAction}`).digest('hex').slice(0, 24).toUpperCase();
  return `JRN-${digest}`;
}

function journalMoney(journal: AccountingJournal, accountCode: string, side: 'debit' | 'credit', dimensions?: { customerId?: string; contractId?: string }): number {
  return money((journal.lines || []).reduce((sum, line) => {
    if (line.accountCode !== accountCode) return sum;
    if (dimensions?.customerId && line.dimensions?.customerId !== dimensions.customerId) return sum;
    if (dimensions?.contractId && line.dimensions?.contractId !== dimensions.contractId) return sum;
    return sum + Number(line[side] || 0);
  }, 0), `Journal ${journal.id} ${side}`);
}

function assertPostedJournal(
  journal: AccountingJournal | undefined,
  expected: { sourceType: string; sourceId: string; sourceAction?: string; sourceActionPrefix?: string },
  label: string
): AccountingJournal {
  if (!journal) throw new ContractReturnWorkflowError(409, `${label} has no accounting journal evidence.`);
  if (journal.status !== 'posted') throw new ContractReturnWorkflowError(409, `${label} accounting journal is not posted.`);
  if (journal.sourceType !== expected.sourceType || journal.sourceId !== expected.sourceId) {
    throw new ContractReturnWorkflowError(409, `${label} accounting journal is bound to a different source.`);
  }
  if (expected.sourceAction && journal.sourceAction !== expected.sourceAction) {
    throw new ContractReturnWorkflowError(409, `${label} accounting journal action is invalid.`);
  }
  if (expected.sourceActionPrefix && !String(journal.sourceAction || '').startsWith(expected.sourceActionPrefix)) {
    throw new ContractReturnWorkflowError(409, `${label} accounting journal action is invalid.`);
  }
  return journal;
}

/**
 * First half of vehicle return.
 *
 * This is intentionally NOT contract closure. The physical vehicle can be
 * back in SPLENDOR custody while finance still needs to settle damage,
 * excess mileage, tolls/fines, or invoices. During this state the vehicle
 * is `unavailable`, preventing an unsafe immediate re-rental.
 */
export async function beginContractReturn(
  contractId: string,
  inspectionId: string,
  actor: ContractReturnActor
): Promise<BeginReturnResult> {
  if (!contractId) throw new ContractReturnWorkflowError(400, 'contractId is required.');
  if (!inspectionId) throw new ContractReturnWorkflowError(400, 'A completed return inspection is required.');

  const firestore = db();
  const now = new Date().toISOString();

  return firestore.runTransaction(async tx => {
    const contractRef = firestore.collection('contracts').doc(contractId);
    const inspectionRef = firestore.collection('vehicle_inspections').doc(inspectionId);

    const [contractSnap, inspectionSnap] = await Promise.all([
      tx.get(contractRef),
      tx.get(inspectionRef)
    ]);
    if (!contractSnap.exists) throw new ContractReturnWorkflowError(404, 'Contract not found.');
    if (!inspectionSnap.exists) throw new ContractReturnWorkflowError(404, 'Return inspection not found.');

    const contract = { id: contractSnap.id, ...(contractSnap.data() as any) };
    const inspection = { id: inspectionSnap.id, ...(inspectionSnap.data() as any) };

    if (contract.status !== 'active') {
      throw new ContractReturnWorkflowError(409, `Only an active contract can enter return settlement; current status is ${contract.status || 'unknown'}.`);
    }
    if (contract.returnWorkflow?.status === 'settlement_pending') {
      throw new ContractReturnWorkflowError(409, 'This contract is already awaiting return settlement.');
    }
    if (inspection.type !== 'return' || inspection.status !== 'completed') {
      throw new ContractReturnWorkflowError(409, 'The linked vehicle inspection must be a completed return inspection.');
    }
    if (inspection.contractId !== contract.id || inspection.vehicleId !== contract.vehicleId) {
      throw new ContractReturnWorkflowError(409, 'Return inspection is not bound to this exact contract and vehicle.');
    }

    const vehicleRef = firestore.collection('vehicles').doc(contract.vehicleId);
    const customerRef = firestore.collection('customers').doc(contract.customerId);
    const [vehicleSnap, customerSnap] = await Promise.all([tx.get(vehicleRef), tx.get(customerRef)]);
    if (!vehicleSnap.exists) throw new ContractReturnWorkflowError(409, 'Vehicle record not found.');
    if (!customerSnap.exists) throw new ContractReturnWorkflowError(409, 'Customer record not found.');

    const vehicle = { id: vehicleSnap.id, ...(vehicleSnap.data() as any) };
    const customer = { id: customerSnap.id, ...(customerSnap.data() as any) };
    if (vehicle.currentContractId && vehicle.currentContractId !== contract.id) {
      throw new ContractReturnWorkflowError(409, 'Vehicle is currently bound to a different contract.');
    }

    const returnMileage = finiteNumber(inspection.mileage);
    const handoverMileage = finiteNumber(contract.handover?.startMileage);
    if (returnMileage === null) {
      throw new ContractReturnWorkflowError(409, 'Completed return inspection is missing a valid odometer reading.');
    }
    if (handoverMileage !== null && returnMileage < handoverMileage) {
      throw new ContractReturnWorkflowError(409, 'Return odometer cannot be below the handover odometer.');
    }

    const unresolvedDamage = Array.isArray(inspection.damages)
      ? inspection.damages.find((damage: any) => damage?.liabilityStatus === 'pending_review')
      : null;
    if (unresolvedDamage) {
      throw new ContractReturnWorkflowError(409, `Damage ${unresolvedDamage.id || ''} still requires a liability decision.`);
    }

    const returnDetails = {
      inspectionId: inspection.id,
      returnDateTime: inspection.completedAt || now,
      endMileage: returnMileage,
      fuelLevelPercent: finiteNumber(inspection.fuelLevelPercent),
      exteriorCondition: inspection.exteriorCondition,
      interiorCondition: inspection.interiorCondition,
      damages: inspection.damages || [],
      customerAcknowledgement: inspection.customerAcknowledgement,
      notes: inspection.notes || ''
    };
    const returnWorkflow = {
      status: 'settlement_pending',
      inspectionId: inspection.id,
      returnedAt: now,
      receivedBy: actor.uid,
      receivedByName: actor.name
    };

    const updatedContract = {
      ...contract,
      returnDetails,
      returnWorkflow,
      updatedAt: now
    };
    const updatedVehicle = {
      ...vehicle,
      status: 'unavailable',
      mileage: returnMileage,
      currentCustomerId: contract.customerId,
      currentContractId: contract.id,
      updatedAt: now
    };

    tx.set(contractRef, { returnDetails, returnWorkflow, updatedAt: now }, { merge: true });
    tx.set(vehicleRef, {
      status: 'unavailable',
      mileage: returnMileage,
      currentCustomerId: contract.customerId,
      currentContractId: contract.id,
      updatedAt: now
    }, { merge: true });

    return { contract: updatedContract, vehicle: updatedVehicle, customer, inspection };
  });
}

/**
 * Final vehicle-release gate.
 *
 * Browser state is never accepted as proof of settlement. A zero-looking
 * invoice field, a free-text reference, or a list of charge ids cannot close
 * a contract. The transaction reconstructs the economic state from durable
 * accounting evidence: issued invoice journals, verified posted payments,
 * posted credit/debit notes, and fully posted deposit-to-charge allocations.
 */
export async function settleContractReturn(
  contractId: string,
  input: SettleReturnInput,
  actor: ContractReturnActor
): Promise<SettleReturnResult> {
  const settlementReference = String(input?.settlementReference || '').trim();
  if (!settlementReference) {
    throw new ContractReturnWorkflowError(400, 'A settlementReference is required to close the contract.');
  }
  if ((input?.settledChargeIds || []).length > 0) {
    throw new ContractReturnWorkflowError(400, 'Charge ids supplied by the browser are not settlement evidence. Settle approved charges through accounting before closing the contract.');
  }

  const firestore = db();
  const now = new Date().toISOString();

  return firestore.runTransaction(async tx => {
    const contractRef = firestore.collection('contracts').doc(contractId);
    const contractSnap = await tx.get(contractRef);
    if (!contractSnap.exists) throw new ContractReturnWorkflowError(404, 'Contract not found.');
    const contract = { id: contractSnap.id, ...(contractSnap.data() as any) };

    if (contract.status !== 'active' || contract.returnWorkflow?.status !== 'settlement_pending') {
      throw new ContractReturnWorkflowError(409, 'Contract is not in return settlement state.');
    }
    const inspectionId = String(contract.returnWorkflow.inspectionId || '');
    if (!inspectionId) throw new ContractReturnWorkflowError(409, 'Return workflow is missing its inspection binding.');

    const vehicleRef = firestore.collection('vehicles').doc(contract.vehicleId);
    const customerRef = firestore.collection('customers').doc(contract.customerId);
    const inspectionRef = firestore.collection('vehicle_inspections').doc(inspectionId);
    const invoicesQuery = firestore.collection('invoices').where('contractId', '==', contract.id);
    const chargesQuery = firestore.collection('charges').where('relatedContractId', '==', contract.id);
    const paymentsQuery = firestore.collection('payments').where('customerId', '==', contract.customerId);
    const notesQuery = firestore.collection('accounting_financial_notes').where('customerId', '==', contract.customerId);

    const [vehicleSnap, customerSnap, inspectionSnap, invoicesSnap, chargesSnap, paymentsSnap, notesSnap] = await Promise.all([
      tx.get(vehicleRef),
      tx.get(customerRef),
      tx.get(inspectionRef),
      tx.get(invoicesQuery),
      tx.get(chargesQuery),
      tx.get(paymentsQuery),
      tx.get(notesQuery)
    ]);

    if (!vehicleSnap.exists) throw new ContractReturnWorkflowError(409, 'Vehicle record not found.');
    if (!customerSnap.exists) throw new ContractReturnWorkflowError(409, 'Customer record not found.');
    if (!inspectionSnap.exists || (inspectionSnap.data() as any)?.status !== 'completed') {
      throw new ContractReturnWorkflowError(409, 'Completed return inspection no longer exists.');
    }

    const liveInvoices = invoicesSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(invoice => !['cancelled', 'draft'].includes(String(invoice.status || '').toLowerCase()));
    if (liveInvoices.length === 0) {
      throw new ContractReturnWorkflowError(409, 'Contract cannot be closed until an issued final invoice exists.');
    }

    const contractPayments = paymentsSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(payment => !payment.contractId || payment.contractId === contract.id);
    const contractInvoiceIds = new Set(liveInvoices.map(invoice => invoice.id));
    const contractNotes = notesSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(note => contractInvoiceIds.has(String(note.invoiceId || '')) && note.status === 'posted');
    const approvedCharges = chargesSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(charge => charge.approvalStatus === 'approved');

    // Build the complete evidence reference set while we are still in the
    // read-only phase of the transaction.
    const journalRefs = new Map<string, FirebaseFirestore.DocumentReference>();
    for (const invoice of liveInvoices) {
      const id = deterministicJournalId('Invoice', invoice.id, 'issue');
      journalRefs.set(id, firestore.collection('accounting_journals').doc(id));
    }
    for (const payment of contractPayments) {
      if (payment.accountingJournalId) journalRefs.set(String(payment.accountingJournalId), firestore.collection('accounting_journals').doc(String(payment.accountingJournalId)));
    }
    for (const note of contractNotes) {
      if (note.journalId) journalRefs.set(String(note.journalId), firestore.collection('accounting_journals').doc(String(note.journalId)));
    }
    for (const charge of approvedCharges) {
      if (charge.accountingJournalId) journalRefs.set(String(charge.accountingJournalId), firestore.collection('accounting_journals').doc(String(charge.accountingJournalId)));
      for (const allocation of Array.isArray(charge.depositAllocations) ? charge.depositAllocations : []) {
        if (allocation?.journalId) journalRefs.set(String(allocation.journalId), firestore.collection('accounting_journals').doc(String(allocation.journalId)));
      }
    }

    const depositIds = new Set<string>();
    for (const charge of approvedCharges) {
      for (const allocation of Array.isArray(charge.depositAllocations) ? charge.depositAllocations : []) {
        if (allocation?.depositId) depositIds.add(String(allocation.depositId));
      }
    }
    const depositRefs = [...depositIds].map(id => firestore.collection('deposits').doc(id));
    const [journalSnaps, depositSnaps] = await Promise.all([
      Promise.all([...journalRefs.values()].map(ref => tx.get(ref))),
      Promise.all(depositRefs.map(ref => tx.get(ref)))
    ]);
    const journals = new Map<string, AccountingJournal>();
    journalSnaps.forEach(snap => { if (snap.exists) journals.set(snap.id, { id: snap.id, ...(snap.data() as any) }); });
    const deposits = new Map<string, any>();
    depositSnaps.forEach(snap => { if (snap.exists) deposits.set(snap.id, { id: snap.id, ...(snap.data() as any) }); });

    // Deposit receipt journals are only known after reading each deposit.
    const receiptJournalRefs = new Map<string, FirebaseFirestore.DocumentReference>();
    for (const deposit of deposits.values()) {
      if (deposit.accountingJournalId && !journals.has(String(deposit.accountingJournalId))) {
        receiptJournalRefs.set(String(deposit.accountingJournalId), firestore.collection('accounting_journals').doc(String(deposit.accountingJournalId)));
      }
    }
    if (receiptJournalRefs.size > 0) {
      const receiptJournalSnaps = await Promise.all([...receiptJournalRefs.values()].map(ref => tx.get(ref)));
      receiptJournalSnaps.forEach(snap => { if (snap.exists) journals.set(snap.id, { id: snap.id, ...(snap.data() as any) }); });
    }

    // ---- Invoice settlement reconstructed from immutable/posted evidence ----
    for (const invoice of liveInvoices) {
      if (invoice.customerId !== contract.customerId || invoice.contractId !== contract.id) {
        throw new ContractReturnWorkflowError(409, `Invoice ${invoice.id} is not bound to this exact customer and contract.`);
      }
      const invoiceTotal = money(invoice.totalAmount, `Invoice ${invoice.id} total`);
      if (invoiceTotal < 0) throw new ContractReturnWorkflowError(409, `Invoice ${invoice.id} total is invalid.`);

      const invoiceJournalId = deterministicJournalId('Invoice', invoice.id, 'issue');
      const invoiceJournal = assertPostedJournal(journals.get(invoiceJournalId), {
        sourceType: 'Invoice', sourceId: invoice.id, sourceAction: 'issue'
      }, `Invoice ${invoice.id}`);
      const invoiceArDebit = journalMoney(invoiceJournal, ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, 'debit', { customerId: contract.customerId, contractId: contract.id });
      if (Math.abs(invoiceArDebit - invoiceTotal) > 0.01) {
        throw new ContractReturnWorkflowError(409, `Invoice ${invoice.id} journal does not support its authoritative total.`);
      }

      let noteDelta = 0;
      for (const note of contractNotes.filter(note => note.invoiceId === invoice.id)) {
        const noteTotal = money(note.totalAmount, `Financial note ${note.id} total`);
        const expectedType = note.type === 'credit_note' ? 'CreditNote' : note.type === 'debit_note' ? 'DebitNote' : '';
        if (!expectedType || !note.journalId) throw new ContractReturnWorkflowError(409, `Financial note ${note.id} is invalid.`);
        const noteJournal = assertPostedJournal(journals.get(String(note.journalId)), {
          sourceType: expectedType, sourceId: note.id, sourceAction: 'issue'
        }, `Financial note ${note.id}`);
        const arSide = note.type === 'credit_note' ? 'credit' : 'debit';
        const arAmount = journalMoney(noteJournal, ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, arSide, { customerId: contract.customerId, contractId: contract.id });
        if (Math.abs(arAmount - noteTotal) > 0.01) {
          throw new ContractReturnWorkflowError(409, `Financial note ${note.id} journal does not support its amount.`);
        }
        noteDelta += note.type === 'credit_note' ? -noteTotal : noteTotal;
      }

      let verifiedAllocated = 0;
      for (const payment of contractPayments) {
        const allocation = (Array.isArray(payment.allocatedTo) ? payment.allocatedTo : []).find((item: any) => item?.invoiceId === invoice.id);
        if (!allocation) continue;
        const allocationAmount = money(allocation.amount, `Payment ${payment.id} allocation`);
        if (allocationAmount <= 0) throw new ContractReturnWorkflowError(409, `Payment ${payment.id} contains an invalid invoice allocation.`);
        if (payment.customerId !== contract.customerId || (payment.contractId && payment.contractId !== contract.id)) {
          throw new ContractReturnWorkflowError(409, `Payment ${payment.id} is not bound to this contract customer.`);
        }
        if (String(payment.status || '').toLowerCase() === 'refunded') {
          throw new ContractReturnWorkflowError(409, `Payment ${payment.id} allocated to invoice ${invoice.id} has been refunded.`);
        }
        const trustedGateway = Boolean(payment.gatewayPaymentIntentId);
        if (payment.verificationStatus !== 'verified' && !trustedGateway) {
          throw new ContractReturnWorkflowError(409, `Payment ${payment.id} allocated to invoice ${invoice.id} is not verified.`);
        }
        if (payment.accountingPostingStatus !== 'posted' || !payment.accountingJournalId) {
          throw new ContractReturnWorkflowError(409, `Payment ${payment.id} allocated to invoice ${invoice.id} is not posted to accounting.`);
        }
        const paymentJournal = assertPostedJournal(journals.get(String(payment.accountingJournalId)), {
          sourceType: 'Payment', sourceId: payment.id, sourceAction: 'receive'
        }, `Payment ${payment.id}`);
        const allAllocated = money((Array.isArray(payment.allocatedTo) ? payment.allocatedTo : []).reduce((sum: number, item: any) => sum + Number(item?.amount || 0), 0), `Payment ${payment.id} allocated total`);
        const arCredit = journalMoney(paymentJournal, ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, 'credit', { customerId: contract.customerId, ...(payment.contractId ? { contractId: contract.id } : {}) });
        if (arCredit + 0.01 < allAllocated) {
          throw new ContractReturnWorkflowError(409, `Payment ${payment.id} allocations exceed its posted AR credit. Accounting allocation must be corrected first.`);
        }
        verifiedAllocated += allocationAmount;
      }

      const ledgerBalance = money(invoiceTotal + noteDelta - verifiedAllocated, `Invoice ${invoice.id} reconstructed balance`);
      if (ledgerBalance > 0.01) {
        throw new ContractReturnWorkflowError(409, `Invoice ${invoice.invoiceNumber || invoice.id} still has ${ledgerBalance.toFixed(2)} AED outstanding according to posted accounting evidence.`);
      }
      if (ledgerBalance < -0.01) {
        throw new ContractReturnWorkflowError(409, `Invoice ${invoice.invoiceNumber || invoice.id} is over-allocated by ${Math.abs(ledgerBalance).toFixed(2)} AED. Accounting review is required before closure.`);
      }
    }

    // ---- Approved charge settlement: only fully journal-backed deposit application ----
    for (const charge of approvedCharges) {
      if (charge.customerId !== contract.customerId || charge.relatedContractId !== contract.id) {
        throw new ContractReturnWorkflowError(409, `Approved charge ${charge.id} is not bound to this exact customer and contract.`);
      }
      const chargeTotal = money(charge.totalAmount, `Charge ${charge.id} total`);
      if (chargeTotal <= 0) throw new ContractReturnWorkflowError(409, `Approved charge ${charge.id} total is invalid.`);
      if (charge.accountingPostingStatus !== 'posted' || !charge.accountingJournalId) {
        throw new ContractReturnWorkflowError(409, `Approved charge ${charge.id} has not been posted to accounting.`);
      }
      const chargeJournal = assertPostedJournal(journals.get(String(charge.accountingJournalId)), {
        sourceType: 'AdditionalCharge', sourceId: charge.id, sourceAction: 'approve'
      }, `Approved charge ${charge.id}`);
      const chargeArDebit = journalMoney(chargeJournal, ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, 'debit', { customerId: contract.customerId, contractId: contract.id });
      if (Math.abs(chargeArDebit - chargeTotal) > 0.01) {
        throw new ContractReturnWorkflowError(409, `Approved charge ${charge.id} journal does not support its authoritative total.`);
      }

      const allocations = Array.isArray(charge.depositAllocations) ? charge.depositAllocations : [];
      const applied = money(charge.depositAppliedAmount || 0, `Charge ${charge.id} deposit-applied amount`);
      const allocationTotal = money(allocations.reduce((sum: number, allocation: any) => sum + Number(allocation?.amount || 0), 0), `Charge ${charge.id} allocation total`);
      if (applied + 0.01 < chargeTotal || allocationTotal + 0.01 < chargeTotal || Math.abs(applied - allocationTotal) > 0.01 || !charge.deductedFromDepositId) {
        throw new ContractReturnWorkflowError(409, `Approved charge ${charge.id} is not fully settled by authoritative deposit allocations.`);
      }

      for (const allocation of allocations) {
        const allocationAmount = money(allocation?.amount, `Charge ${charge.id} deposit allocation`);
        if (allocationAmount <= 0 || !allocation?.depositId || !allocation?.journalId) {
          throw new ContractReturnWorkflowError(409, `Approved charge ${charge.id} contains incomplete deposit settlement evidence.`);
        }
        const deposit = deposits.get(String(allocation.depositId));
        if (!deposit) throw new ContractReturnWorkflowError(409, `Deposit ${allocation.depositId} referenced by charge ${charge.id} no longer exists.`);
        if (deposit.customerId !== contract.customerId || (deposit.contractId && deposit.contractId !== contract.id)) {
          throw new ContractReturnWorkflowError(409, `Deposit ${deposit.id} used on charge ${charge.id} is not bound to this contract customer.`);
        }
        if (deposit.accountingPostingStatus !== 'posted' || !deposit.accountingJournalId) {
          throw new ContractReturnWorkflowError(409, `Deposit ${deposit.id} used on charge ${charge.id} has no posted receipt evidence.`);
        }
        assertPostedJournal(journals.get(String(deposit.accountingJournalId)), {
          sourceType: 'Deposit', sourceId: deposit.id, sourceAction: 'receive'
        }, `Deposit ${deposit.id}`);

        const applicationJournal = assertPostedJournal(journals.get(String(allocation.journalId)), {
          sourceType: 'Deposit', sourceId: deposit.id, sourceActionPrefix: `apply:${charge.id}:`
        }, `Deposit allocation ${allocation.journalId}`);
        if (String(applicationJournal.reference || '') !== charge.id) {
          throw new ContractReturnWorkflowError(409, `Deposit allocation ${allocation.journalId} is not bound to charge ${charge.id}.`);
        }
        const arCredit = journalMoney(applicationJournal, ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable, 'credit', { customerId: contract.customerId, contractId: contract.id });
        if (Math.abs(arCredit - allocationAmount) > 0.01) {
          throw new ContractReturnWorkflowError(409, `Deposit allocation ${allocation.journalId} does not support its recorded amount.`);
        }
      }
    }

    const vehicle = { id: vehicleSnap.id, ...(vehicleSnap.data() as any) };
    const customer = { id: customerSnap.id, ...(customerSnap.data() as any) };
    const inspection = { id: inspectionSnap.id, ...(inspectionSnap.data() as any) };

    const returnWorkflow = {
      ...contract.returnWorkflow,
      status: 'closed',
      settlementReference,
      settlementNotes: input.settlementNotes || '',
      settlementEvidence: {
        policy: 'ledger_backed_v1',
        invoiceIds: liveInvoices.map(invoice => invoice.id),
        verifiedPaymentIds: contractPayments
          .filter(payment => (payment.verificationStatus === 'verified' || payment.gatewayPaymentIntentId) && payment.accountingPostingStatus === 'posted')
          .map(payment => payment.id),
        fullySettledChargeIds: approvedCharges.map(charge => charge.id)
      },
      settledBy: actor.uid,
      settledByName: actor.name,
      settledAt: now
    };
    const updatedContract = {
      ...contract,
      status: 'completed',
      returnWorkflow,
      updatedAt: now
    };
    const updatedVehicle = {
      ...vehicle,
      status: 'available',
      currentCustomerId: null,
      currentContractId: null,
      updatedAt: now
    };
    const updatedCustomer = {
      ...customer,
      lifetimeValue: money(Number(customer.lifetimeValue || 0) + Number(contract.grandTotal || 0), 'Customer lifetime value'),
      updatedAt: now
    };

    // All reads and evidence validation are complete. Only now may the
    // vehicle be released and the contract leave the active state.
    tx.set(contractRef, { status: 'completed', returnWorkflow, updatedAt: now }, { merge: true });
    tx.set(vehicleRef, {
      status: 'available',
      currentCustomerId: null,
      currentContractId: null,
      updatedAt: now
    }, { merge: true });
    tx.set(customerRef, { lifetimeValue: updatedCustomer.lifetimeValue, updatedAt: now }, { merge: true });

    return {
      contract: updatedContract,
      vehicle: updatedVehicle,
      customer: updatedCustomer,
      inspection,
      settledChargeIds: approvedCharges.map(charge => charge.id)
    };
  });
}
