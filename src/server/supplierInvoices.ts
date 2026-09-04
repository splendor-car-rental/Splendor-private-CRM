import { createDurable, updateDurable, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals.js';
import type { RecordAuditFn } from './businessRules.js';
import type { SupplierInvoice, SupplierInvoiceCancellation, PurchaseOrder, UserRole } from '../types/index.js';

// ----------------------------------------------------
// SUPPLIER INVOICES: matching against the PO, corrections, duplicates
// (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// Every invoice is reconciled against its purchase order on submission.
// An invoice for LESS than the PO never automatically creates a debt
// against the supplier -- the variance is just recorded for a human to
// look at. An invoice for MORE than the PO never automatically triggers
// payment -- it needs a re-evaluated approval before it can be approved at
// all. A corrective/replacement invoice is never an edit of the original:
// it is a new invoice record, explicitly linked back via
// correctionOfInvoiceId, and the original is cancelled with a
// SupplierInvoiceCancellation pointing forward to its replacement. A
// possible duplicate (same supplier + invoice number) is flagged, never
// blocked.

export class SupplierInvoiceError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'SupplierInvoiceError';
  }
}

async function loadPO(poId: string): Promise<PurchaseOrder> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('purchase_orders').doc(poId).get();
  if (!snap.exists) throw new SupplierInvoiceError(`Purchase order ${poId} not found.`);
  return snap.data() as PurchaseOrder;
}

async function loadInvoice(id: string): Promise<SupplierInvoice> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('supplier_invoices').doc(id).get();
  if (!snap.exists) throw new SupplierInvoiceError(`Invoice ${id} not found.`);
  return snap.data() as SupplierInvoice;
}

async function findPossibleDuplicateInvoice(supplierId: string, invoiceNumber: string): Promise<string | undefined> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('supplier_invoices').get();
  const match = snap.docs
    .map((d: any) => d.data() as SupplierInvoice)
    .find((inv) => inv.supplierId === supplierId && inv.invoiceNumber === invoiceNumber && inv.status !== 'cancelled');
  return match?.id;
}

export interface SubmitSupplierInvoiceInput {
  purchaseOrderId?: string;
  operationId?: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  documentIds?: string[];
  correctionOfInvoiceId?: string;
  correctionReason?: string;
  createdBy: string;
  createdByName: string;
  createdByRole: UserRole;
}

export async function submitSupplierInvoice(input: SubmitSupplierInvoiceInput, recordAudit: RecordAuditFn): Promise<{ invoice: SupplierInvoice; approvalRequestId: string }> {
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    throw new SupplierInvoiceError('An invoice requires an amount greater than zero.');
  }
  if (!input.invoiceNumber?.trim()) {
    throw new SupplierInvoiceError('An invoice number is required.');
  }

  let originalInvoice: SupplierInvoice | undefined;
  if (input.correctionOfInvoiceId) {
    if (!input.correctionReason?.trim()) {
      throw new SupplierInvoiceError('Submitting a corrective/replacement invoice requires a correction reason.');
    }
    originalInvoice = await loadInvoice(input.correctionOfInvoiceId);
    if (originalInvoice.supplierId !== input.supplierId) {
      throw new SupplierInvoiceError('A corrective invoice must be for the same supplier as the original.');
    }
    if (originalInvoice.status === 'cancelled') {
      throw new SupplierInvoiceError('The original invoice is already cancelled/replaced.');
    }
  }

  // Rule: reconcile against the PO. Invoice-less-than-PO never auto-creates
  // a debt; invoice-more-than-PO never auto-pays -- it just needs a
  // re-evaluated approval, which is what the review below already is.
  let poVarianceAmount: number | undefined;
  if (input.purchaseOrderId) {
    const po = await loadPO(input.purchaseOrderId);
    const referenceAmount = input.operationId
      ? po.lineItems.filter((li) => li.operationId === input.operationId && li.status !== 'cancelled').reduce((sum, li) => sum + li.lineTotal, 0)
      : po.totalValue;
    poVarianceAmount = Math.round((input.amount - referenceAmount) * 100) / 100;
  }

  const duplicateOf = await findPossibleDuplicateInvoice(input.supplierId, input.invoiceNumber);

  const id = await issueNextNumber('SupplierInvoice');
  const now = new Date().toISOString();
  const invoice: SupplierInvoice = {
    id,
    purchaseOrderId: input.purchaseOrderId,
    operationId: input.operationId,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    amount: input.amount,
    documentIds: input.documentIds || [],
    status: 'pending_review',
    correctionOfInvoiceId: input.correctionOfInvoiceId,
    correctionReason: input.correctionReason,
    duplicateWarning: duplicateOf ? { possibleDuplicateOfInvoiceId: duplicateOf } : undefined,
    poVarianceAmount,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now
  };
  await createDurable('supplier_invoices', invoice as unknown as { id: string });

  if (originalInvoice) {
    const cancellation: SupplierInvoiceCancellation = {
      reason: input.correctionReason!,
      cancelledBy: input.createdBy,
      cancelledByName: input.createdByName,
      cancelledAt: now,
      replacementInvoiceId: id
    };
    await updateDurable('supplier_invoices', originalInvoice.id, { status: 'cancelled', cancellation, updatedAt: now } as unknown as Record<string, unknown>);
  }

  const varianceNote = poVarianceAmount
    ? poVarianceAmount > 0
      ? ` INVOICE EXCEEDS PO by ${poVarianceAmount.toLocaleString()} AED -- needs re-evaluated approval before payment.`
      : ` Invoice is ${Math.abs(poVarianceAmount).toLocaleString()} AED under the PO -- variance recorded, no debt auto-created.`
    : '';

  await recordAudit({
    userId: input.createdBy,
    userName: input.createdByName,
    userRole: input.createdByRole,
    entityType: 'SupplierInvoice',
    entityId: id,
    action: 'create',
    newValue: `Submitted invoice ${input.invoiceNumber} from ${input.supplierName}: ${input.amount.toLocaleString()} AED.${varianceNote}${duplicateOf ? ` Possible duplicate of ${duplicateOf} -- flagged, not blocked.` : ''}${originalInvoice ? ` Corrects/replaces invoice ${originalInvoice.id}.` : ''}`
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'SupplierInvoice',
    entityId: id,
    action: 'approve_invoice',
    payload: { invoiceId: id },
    requestedBy: input.createdBy,
    requestedByName: input.createdByName,
    requestedByRole: input.createdByRole,
    reason: `Invoice ${input.invoiceNumber} from ${input.supplierName}${varianceNote}`
  }, recordAudit);

  if (poVarianceAmount) {
    await updateDurable('supplier_invoices', id, { varianceApprovalRequestId: approvalRequest.id } as unknown as Record<string, unknown>);
    invoice.varianceApprovalRequestId = approvalRequest.id;
  }

  return { invoice, approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('SupplierInvoice', 'approve_invoice', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const invoiceId = request.payload.invoiceId as string;
  const invoice = await loadInvoice(invoiceId);
  if (invoice.status !== 'pending_review') {
    throw new SupplierInvoiceError(`Invoice ${invoiceId} has already been ${invoice.status}.`);
  }

  const now = new Date().toISOString();
  await updateDurable('supplier_invoices', invoiceId, { status: 'approved', updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'SupplierInvoice',
    entityId: invoiceId,
    action: 'approval',
    newValue: `Invoice ${invoiceId} approved: ${invoice.amount.toLocaleString()} AED from ${invoice.supplierName}. Approval does not itself trigger payment.`,
    reason: request.reason
  });
});

export interface MarkSupplierInvoiceRejectedInput {
  invoiceId: string;
  reason: string;
  actor: ProcurementApprovalActor;
}

/** Rejection is recorded as a cancellation (the type has no separate "rejected" state) -- never a silent delete. */
export async function markSupplierInvoiceRejected(input: MarkSupplierInvoiceRejectedInput, recordAudit: RecordAuditFn): Promise<SupplierInvoice> {
  const invoice = await loadInvoice(input.invoiceId);
  if (invoice.status !== 'pending_review') {
    throw new SupplierInvoiceError(`Invoice ${input.invoiceId} has already been ${invoice.status}.`);
  }

  const now = new Date().toISOString();
  const cancellation: SupplierInvoiceCancellation = {
    reason: input.reason,
    cancelledBy: input.actor.uid,
    cancelledByName: input.actor.name,
    cancelledAt: now
  };
  await updateDurable('supplier_invoices', invoice.id, { status: 'cancelled', cancellation, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.actor.uid,
    userName: input.actor.name,
    userRole: input.actor.role,
    entityType: 'SupplierInvoice',
    entityId: invoice.id,
    action: 'approval',
    newValue: `Invoice ${invoice.id} rejected: ${input.reason}`,
    reason: input.reason
  });

  return { ...invoice, status: 'cancelled', cancellation, updatedAt: now };
}

export interface RequestSupplierInvoiceCancellationInput {
  invoiceId: string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

/** Cancelling an already-approved invoice (should never have existed) is its own request -> review -> approval workflow, distinct from a fresh submission's reject. */
export async function requestSupplierInvoiceCancellation(input: RequestSupplierInvoiceCancellationInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  const invoice = await loadInvoice(input.invoiceId);
  if (invoice.status === 'cancelled') throw new SupplierInvoiceError('This invoice is already cancelled.');

  const approvalRequest = await createProcurementApproval({
    entityType: 'SupplierInvoice',
    entityId: invoice.id,
    action: 'approve_cancellation',
    payload: { invoiceId: invoice.id },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'SupplierInvoice',
    entityId: invoice.id,
    action: 'update',
    newValue: `Requested cancellation of invoice ${invoice.id}.`,
    reason: input.reason
  });

  return { approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('SupplierInvoice', 'approve_cancellation', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const invoiceId = request.payload.invoiceId as string;
  await loadInvoice(invoiceId); // 404s cleanly if the invoice somehow no longer exists

  const now = new Date().toISOString();
  const cancellation: SupplierInvoiceCancellation = {
    reason: request.reason,
    cancelledBy: decider.uid,
    cancelledByName: decider.name,
    cancelledAt: now
  };
  await updateDurable('supplier_invoices', invoiceId, { status: 'cancelled', cancellation, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'SupplierInvoice',
    entityId: invoiceId,
    action: 'approval',
    newValue: `Invoice ${invoiceId} cancelled: ${request.reason}`,
    reason: request.reason
  });
});
