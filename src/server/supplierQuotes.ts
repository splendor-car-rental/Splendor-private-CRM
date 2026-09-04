import { createDurable, updateDurable, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { createProcurementApproval, registerApprovalHandler, listProcurementApprovals, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals.js';
import type { RecordAuditFn } from './businessRules.js';
import type { SupplierQuote, QuoteSource, UserRole } from '../types/index.js';

// ----------------------------------------------------
// SUPPLIER QUOTES / OFFERS (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// Every offer received from a supplier is documented, without exception --
// never deleted, never silently ignored. A known source is mandatory; a
// phone-call quote additionally requires the responsible supplier contact's
// name and phone number (the date/time of capture is the record's
// createdAt). Staff RECOMMENDS the suitable offer; a different, authorized
// person APPROVES the selection (the same Segregation-of-Duties primitive
// as everywhere else in this spec) before it becomes the one selected
// offer for its purchase order. Nothing here ever edits a quote's original
// price/terms/source once recorded -- a new price from the supplier is a
// new quote record, not an edit of the old one.

export class SupplierQuoteError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'SupplierQuoteError';
  }
}

export interface AddSupplierQuoteInput {
  purchaseOrderId?: string;
  supplierId: string;
  supplierName: string;
  source: QuoteSource;
  sourceOther?: string;
  contactInfo?: string;
  phoneContactPersonName?: string;
  phoneContactPersonPhone?: string;
  price: number;
  terms?: string;
  documentIds?: string[];
  createdBy: string;
  createdByName: string;
  createdByRole: UserRole;
}

/** Records a supplier offer exactly as received. This is documentation, not a financial commitment -- no approval is required just to log that an offer exists. */
export async function addSupplierQuote(input: AddSupplierQuoteInput, recordAudit: RecordAuditFn): Promise<SupplierQuote> {
  if (typeof input.price !== 'number' || input.price <= 0) {
    throw new SupplierQuoteError('A quote requires a price greater than zero.');
  }
  if (input.source === 'other' && !input.sourceOther?.trim()) {
    throw new SupplierQuoteError('Selecting "other" as the quote source requires a description.');
  }
  if (input.source === 'phone_call' && (!input.phoneContactPersonName?.trim() || !input.phoneContactPersonPhone?.trim())) {
    throw new SupplierQuoteError('A phone-call quote requires the responsible supplier contact\'s name and phone number.');
  }

  const id = await issueNextNumber('SupplierQuote');
  const now = new Date().toISOString();
  const quote: SupplierQuote = {
    id,
    purchaseOrderId: input.purchaseOrderId,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    source: input.source,
    sourceOther: input.sourceOther,
    contactInfo: input.contactInfo,
    phoneContactPersonName: input.phoneContactPersonName,
    phoneContactPersonPhone: input.phoneContactPersonPhone,
    price: input.price,
    terms: input.terms,
    documentIds: input.documentIds || [],
    isSelected: false,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now
  };

  await createDurable('supplier_quotes', quote as unknown as { id: string });

  await recordAudit({
    userId: input.createdBy,
    userName: input.createdByName,
    userRole: input.createdByRole,
    entityType: 'SupplierQuote',
    entityId: id,
    action: 'create',
    newValue: `Recorded ${input.source} quote from ${input.supplierName}: ${input.price.toLocaleString()} AED.`
  });

  return quote;
}

async function loadSupplierQuote(quoteId: string): Promise<SupplierQuote> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('supplier_quotes').doc(quoteId).get();
  if (!snap.exists) throw new SupplierQuoteError(`Quote ${quoteId} not found.`);
  return snap.data() as SupplierQuote;
}

export interface RequestSupplierQuoteSelectionInput {
  quoteId: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
  reason: string;
}

/** Staff recommends this offer as the one to go with. Recorded immediately as the recommendation, but `isSelected` stays false until a different, authorized person approves it. */
export async function requestSupplierQuoteSelection(input: RequestSupplierQuoteSelectionInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  const quote = await loadSupplierQuote(input.quoteId);
  if (quote.isSelected) throw new SupplierQuoteError('This quote is already the selected offer.');

  const pendingRequests = await listProcurementApprovals('pending', 'SupplierQuote');
  if (pendingRequests.some((r) => r.entityId === input.quoteId)) {
    throw new SupplierQuoteError('This quote already has a pending selection request.');
  }

  const now = new Date().toISOString();
  await updateDurable('supplier_quotes', quote.id, {
    selectedBy: input.requestedBy,
    selectedByName: input.requestedByName,
    selectedAt: now,
    updatedAt: now
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'SupplierQuote',
    entityId: quote.id,
    action: 'update',
    newValue: `Recommended quote ${quote.id} (${quote.price.toLocaleString()} AED from ${quote.supplierName}) for selection.`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'SupplierQuote',
    entityId: quote.id,
    action: 'approve_selection',
    payload: { quoteId: quote.id },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('SupplierQuote', 'approve_selection', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const admin = (await import('firebase-admin')).default;
  const quoteId = request.payload.quoteId as string;
  const quote = await loadSupplierQuote(quoteId);

  const now = new Date().toISOString();
  await updateDurable('supplier_quotes', quote.id, {
    isSelected: true,
    approvedBy: decider.uid,
    approvedByName: decider.name,
    approvedAt: now,
    updatedAt: now
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'SupplierQuote',
    entityId: quote.id,
    action: 'approval',
    newValue: `Quote ${quote.id} selected as the winning offer (${quote.price.toLocaleString()} AED from ${quote.supplierName}).`,
    reason: request.reason
  });

  // Only one offer can be the currently-selected offer per purchase order --
  // superseding a previous selection updates its selection flag only, never
  // its recorded price/terms/source, so the original offer stays intact.
  if (quote.purchaseOrderId) {
    const snap = await admin.firestore().collection('supplier_quotes').get();
    const others = snap.docs
      .map((d: any) => d.data() as SupplierQuote)
      .filter((q) => q.purchaseOrderId === quote.purchaseOrderId && q.id !== quote.id && q.isSelected);
    for (const other of others) {
      await updateDurable('supplier_quotes', other.id, { isSelected: false, updatedAt: now } as unknown as Record<string, unknown>);
      await recordAudit({
        userId: decider.uid,
        userName: decider.name,
        userRole: decider.role,
        entityType: 'SupplierQuote',
        entityId: other.id,
        action: 'update',
        newValue: `No longer the selected offer for PO ${quote.purchaseOrderId} -- superseded by ${quote.id}.`,
        reason: request.reason
      });
    }
  }
});
