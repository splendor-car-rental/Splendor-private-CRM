import { createDurable, updateDurable } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { PersistenceError } from './persistence.js';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals.js';
import { computeRequiredApprovalTier } from '../config/procurement.js';
import type { RecordAuditFn } from './businessRules.js';
import type {
  PurchaseOrder, PurchaseOrderLineItem, PurchaseOrderVersionSnapshot, PurchaseOrderKind,
  PurchaseOrderStatus, PurchaseOrderAmendmentRequest, PurchaseOrderLineItemCancellation,
  PurchaseOrderCancellation, RetroactivePOReason, ProcurementOperation, UserRole, SupplierOperationTypeKey
} from '../types/index.js';

// ----------------------------------------------------
// PURCHASE ORDERS (Splendor Procurement, Phase 1, rules 1-3, 9-13, 54-63)
// ----------------------------------------------------

export class PurchaseOrderError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'PurchaseOrderError';
  }
}

function computeLineTotal(item: Pick<PurchaseOrderLineItem, 'quantity' | 'unitPrice'>): number {
  return Math.round(item.quantity * item.unitPrice * 100) / 100;
}

function computeTotalValue(lineItems: PurchaseOrderLineItem[]): number {
  return Math.round(
    lineItems
      .filter((li) => li.status !== 'cancelled')
      .reduce((sum, li) => sum + li.lineTotal, 0) * 100
  ) / 100;
}

export interface CreatePurchaseOrderInput {
  kind: PurchaseOrderKind;
  retroactiveReason?: RetroactivePOReason;
  retroactiveReasonOther?: string;
  actualOperationDate?: string;
  supplierId: string;
  supplierName: string;
  lineItems: Array<Pick<PurchaseOrderLineItem, 'operationType' | 'operationTypeOther' | 'description' | 'vehicleDescription' | 'quantity' | 'unitPrice'>>;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
  reason: string; // required to open the approval request -- rule 85's mandatory-reason pattern applies here too
}

/**
 * Creates a Purchase Order (rule 1: sequential PO-SCR-100... number, never
 * reused, issued by the system). Regular and retroactive POs share the
 * exact same sequence and the same approval system (rule 59) -- the only
 * difference is `kind` and, for retroactive, a reason + the real historical
 * date (rule 57). Always starts in `pending_approval`: even the FIRST
 * version of a PO is a movement someone else must approve (rule 85), not
 * something its creator can self-approve into existence.
 */
export async function createPurchaseOrder(input: CreatePurchaseOrderInput, recordAudit: RecordAuditFn): Promise<{ po: PurchaseOrder; approvalRequestId: string }> {
  if (input.lineItems.length === 0) {
    throw new PurchaseOrderError('A purchase order requires at least one line item.');
  }
  if (input.kind === 'retroactive' && !input.retroactiveReason) {
    throw new PurchaseOrderError('A retroactive PO requires a reason from the fixed list.');
  }
  if (input.retroactiveReason === 'other' && !input.retroactiveReasonOther?.trim()) {
    throw new PurchaseOrderError('Selecting "other" as the retroactive reason requires a description.');
  }

  const id = await issueNextNumber('PurchaseOrder');
  const now = new Date().toISOString();

  const lineItems: PurchaseOrderLineItem[] = input.lineItems.map((li, idx) => ({
    id: `${id}-L${idx + 1}`,
    operationType: li.operationType,
    operationTypeOther: li.operationTypeOther,
    description: li.description,
    vehicleDescription: li.vehicleDescription,
    quantity: li.quantity,
    unitPrice: li.unitPrice,
    lineTotal: computeLineTotal(li),
    status: 'pending'
  }));

  const totalValue = computeTotalValue(lineItems);
  const requiredApprovalTier = computeRequiredApprovalTier(totalValue);

  const initialVersion: PurchaseOrderVersionSnapshot = {
    version: 1,
    lineItems,
    totalValue,
    requiredApprovalTier,
    changedBy: input.requestedBy,
    changedByName: input.requestedByName,
    changedAt: now,
    reason: 'Initial creation'
  };

  const po: PurchaseOrder = {
    id,
    kind: input.kind,
    retroactiveReason: input.retroactiveReason,
    retroactiveReasonOther: input.retroactiveReasonOther,
    actualOperationDate: input.actualOperationDate,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    lineItems,
    totalValue,
    requiredApprovalTier,
    status: 'pending_approval',
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    version: 1,
    history: [initialVersion],
    amendmentRequestIds: [],
    createdAt: now,
    updatedAt: now
  };

  await createDurable('purchase_orders', po as unknown as { id: string });

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'PurchaseOrder',
    entityId: id,
    action: 'create',
    newValue: `Created ${input.kind} PO for ${input.supplierName}: ${lineItems.length} line item(s), ${totalValue.toLocaleString()} AED.`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'PurchaseOrder',
    entityId: id,
    action: 'approve_creation',
    payload: { purchaseOrderId: id },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { po, approvalRequestId: approvalRequest.id };
}

/**
 * Rule 9-10: every non-cancelled line item that does not already have an
 * Operation becomes its own independent Operation, linked back to the same
 * parent PO -- no manual re-linking required. Shared by the initial-approval
 * handler and the amendment-approval handler (a new line added by an
 * amendment needs an Operation exactly the same way a line from the
 * original PO does). Line items live inside one array field on the PO
 * document, so operationId assignments are collected in memory and written
 * back as one updated array, rather than attempting per-line dot-path array
 * updates Firestore doesn't support cleanly.
 */
async function createOperationsForNewLineItems(
  po: Pick<PurchaseOrder, 'id' | 'supplierId' | 'supplierName'>,
  lineItems: PurchaseOrderLineItem[],
  decider: ProcurementApprovalActor,
  recordAudit: RecordAuditFn,
  reason: string
): Promise<PurchaseOrderLineItem[]> {
  const now = new Date().toISOString();
  const updatedLineItems: PurchaseOrderLineItem[] = [...lineItems];
  for (let i = 0; i < updatedLineItems.length; i++) {
    const line = updatedLineItems[i];
    if (line.status === 'cancelled' || line.operationId) continue;
    const opId = await issueNextNumber('ProcurementOperation');
    const operation: ProcurementOperation = {
      id: opId,
      purchaseOrderId: po.id,
      lineItemId: line.id,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      operationType: line.operationType,
      description: line.description,
      status: 'open',
      supplierInvoiceIds: [],
      supplierPaymentIds: [],
      supplierAgreementDocumentIds: [],
      documentIds: [],
      totalCost: 0,
      totalRevenue: 0,
      profitLoss: 0,
      createdAt: now,
      updatedAt: now
    };
    await createDurable('procurement_operations', operation as unknown as { id: string });
    updatedLineItems[i] = { ...line, operationId: opId };

    await recordAudit({
      userId: decider.uid,
      userName: decider.name,
      userRole: decider.role,
      entityType: 'ProcurementOperation',
      entityId: opId,
      action: 'create',
      newValue: `Opened operation for PO ${po.id} line ${line.id} (${line.description}).`,
      reason
    });
  }
  return updatedLineItems;
}

/**
 * Derives the PO-level status purely from its current line items --
 * cancellation and receiving are both tracked per line, so the parent
 * status is always a recomputation, never a value someone sets directly.
 * Precedence: any cancelled line always shows as at least
 * partially_cancelled (the PO did not complete as originally ordered),
 * even if every remaining line was fully received.
 */
function computeDerivedStatus(lineItems: PurchaseOrderLineItem[]): PurchaseOrderStatus {
  const nonCancelled = lineItems.filter((li) => li.status !== 'cancelled');
  if (nonCancelled.length === 0) return 'cancelled';
  const anyCancelled = nonCancelled.length < lineItems.length;
  if (anyCancelled) return 'partially_cancelled';
  const allReceived = nonCancelled.every((li) => li.status === 'received');
  if (allReceived) return 'fulfilled';
  const anyReceived = nonCancelled.some((li) => li.status === 'received');
  if (anyReceived) return 'partially_fulfilled';
  return 'approved';
}

/** Approval handler: PO creation -> approved. Creates one ProcurementOperation per line item (rule 9-10), never asking the requester to re-link anything manually. */
registerApprovalHandler('PurchaseOrder', 'approve_creation', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const admin = (await import('firebase-admin')).default;
  const poId = request.entityId;
  const ref = admin.firestore().collection('purchase_orders').doc(poId);
  const snap = await ref.get();
  if (!snap.exists) throw new PurchaseOrderError(`Purchase order ${poId} not found.`);
  const po = snap.data() as PurchaseOrder;

  const now = new Date().toISOString();
  const updatedLineItems = await createOperationsForNewLineItems(po, po.lineItems, decider, recordAudit, `PO ${poId} approved`);

  await updateDurable('purchase_orders', poId, {
    status: 'approved',
    approvedBy: decider.uid,
    approvedByName: decider.name,
    approvedAt: now,
    lineItems: updatedLineItems,
    updatedAt: now
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'PurchaseOrder',
    entityId: poId,
    action: 'approval',
    newValue: `PO ${poId} approved (${po.totalValue.toLocaleString()} AED, tier: ${po.requiredApprovalTier}).`,
    reason: request.reason
  });
});

// ----------------------------------------------------
// PO AMENDMENT (rule 10-11): no silent edit on an approved PO. An amendment
// request -> review -> approval always produces a NEW version; the old
// version stays fully intact in `history`. A value change re-evaluates the
// required approval tier via the same computeRequiredApprovalTier() the
// initial creation used -- see src/config/procurement.ts for why that tier
// table is currently a single interim tier pending a real business decision.
// ----------------------------------------------------

const AMENDABLE_PO_STATUSES: PurchaseOrderStatus[] = ['approved', 'partially_fulfilled', 'fulfilled', 'partially_cancelled'];

export interface AmendPurchaseOrderLineItemInput {
  /** Existing line item id to modify. Omit to add a brand-new line item. */
  id?: string;
  operationType: SupplierOperationTypeKey;
  operationTypeOther?: string;
  description: string;
  vehicleDescription?: string;
  quantity: number;
  unitPrice: number;
}

export interface RequestPurchaseOrderAmendmentInput {
  purchaseOrderId: string;
  lineItems: AmendPurchaseOrderLineItemInput[];
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
  reason: string;
}

async function loadPurchaseOrder(poId: string): Promise<PurchaseOrder> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('purchase_orders').doc(poId).get();
  if (!snap.exists) throw new PurchaseOrderError(`Purchase order ${poId} not found.`);
  return snap.data() as PurchaseOrder;
}

/**
 * Requests an amendment to an already-approved PO. Only the CHANGES need to
 * be supplied: an entry with an existing line `id` modifies that line
 * (description/quantity/price/type), an entry with no `id` adds a brand-new
 * line. Any existing line not mentioned is carried forward untouched --
 * omitting a line can never silently remove it. Nothing on the live PO
 * changes yet; the proposed result is computed now and frozen onto the
 * amendment request, then applied verbatim if and when it is approved.
 */
export async function requestPurchaseOrderAmendment(input: RequestPurchaseOrderAmendmentInput, recordAudit: RecordAuditFn): Promise<{ amendmentRequest: PurchaseOrderAmendmentRequest; approvalRequestId: string }> {
  if (input.lineItems.length === 0) {
    throw new PurchaseOrderError('An amendment requires at least one changed or added line item.');
  }
  const po = await loadPurchaseOrder(input.purchaseOrderId);
  if (!AMENDABLE_PO_STATUSES.includes(po.status)) {
    throw new PurchaseOrderError(`A purchase order in status "${po.status}" cannot be amended.`);
  }

  const maxExistingIndex = po.lineItems.reduce((max, li) => {
    const match = /-L(\d+)$/.exec(li.id);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  let nextIndex = maxExistingIndex;

  const proposedLineItems: PurchaseOrderLineItem[] = po.lineItems.map((existing) => {
    const change = input.lineItems.find((li) => li.id === existing.id);
    if (!change) return existing;
    if (existing.status === 'cancelled') {
      throw new PurchaseOrderError(`Line item ${existing.id} is cancelled and cannot be modified by an amendment.`);
    }
    return {
      ...existing,
      operationType: change.operationType,
      operationTypeOther: change.operationTypeOther,
      description: change.description,
      vehicleDescription: change.vehicleDescription,
      quantity: change.quantity,
      unitPrice: change.unitPrice,
      lineTotal: computeLineTotal(change)
    };
  });

  for (const change of input.lineItems) {
    if (change.id) {
      if (!po.lineItems.some((li) => li.id === change.id)) {
        throw new PurchaseOrderError(`Line item ${change.id} does not belong to this purchase order.`);
      }
      continue;
    }
    nextIndex += 1;
    proposedLineItems.push({
      id: `${po.id}-L${nextIndex}`,
      operationType: change.operationType,
      operationTypeOther: change.operationTypeOther,
      description: change.description,
      vehicleDescription: change.vehicleDescription,
      quantity: change.quantity,
      unitPrice: change.unitPrice,
      lineTotal: computeLineTotal(change),
      status: 'pending'
    });
  }

  const proposedTotalValue = computeTotalValue(proposedLineItems);

  const id = await issueNextNumber('PurchaseOrderAmendmentRequest');
  const now = new Date().toISOString();
  const amendmentRequest: PurchaseOrderAmendmentRequest = {
    id,
    purchaseOrderId: po.id,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedAt: now,
    reason: input.reason,
    proposedLineItems,
    proposedTotalValue,
    status: 'pending_approval'
  };
  await createDurable('purchase_order_amendment_requests', amendmentRequest as unknown as { id: string });
  await updateDurable('purchase_orders', po.id, {
    amendmentRequestIds: [...(po.amendmentRequestIds || []), id],
    updatedAt: now
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'update',
    newValue: `Requested amendment ${id}: total value ${po.totalValue.toLocaleString()} -> ${proposedTotalValue.toLocaleString()} AED.`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'approve_amendment',
    payload: { amendmentRequestId: id },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { amendmentRequest, approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('PurchaseOrder', 'approve_amendment', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const admin = (await import('firebase-admin')).default;
  const amendmentId = request.payload.amendmentRequestId as string;
  const arRef = admin.firestore().collection('purchase_order_amendment_requests').doc(amendmentId);
  const arSnap = await arRef.get();
  if (!arSnap.exists) throw new PurchaseOrderError(`Amendment request ${amendmentId} not found.`);
  const amendmentRequest = arSnap.data() as PurchaseOrderAmendmentRequest;
  if (amendmentRequest.status !== 'pending_approval') {
    throw new PurchaseOrderError(`Amendment request ${amendmentId} has already been ${amendmentRequest.status}.`);
  }

  const po = await loadPurchaseOrder(request.entityId);
  const now = new Date().toISOString();
  const newVersion = po.version + 1;
  const requiredApprovalTier = computeRequiredApprovalTier(amendmentRequest.proposedTotalValue);

  const lineItemsWithOperations = await createOperationsForNewLineItems(po, amendmentRequest.proposedLineItems, decider, recordAudit, `Amendment ${amendmentId} approved`);

  const versionSnapshot: PurchaseOrderVersionSnapshot = {
    version: newVersion,
    lineItems: lineItemsWithOperations,
    totalValue: amendmentRequest.proposedTotalValue,
    requiredApprovalTier,
    changedBy: decider.uid,
    changedByName: decider.name,
    changedAt: now,
    reason: request.reason,
    amendmentRequestId: amendmentId
  };

  await updateDurable('purchase_orders', po.id, {
    lineItems: lineItemsWithOperations,
    totalValue: amendmentRequest.proposedTotalValue,
    requiredApprovalTier,
    version: newVersion,
    history: [...po.history, versionSnapshot],
    status: computeDerivedStatus(lineItemsWithOperations),
    updatedAt: now
  } as unknown as Record<string, unknown>);

  await updateDurable('purchase_order_amendment_requests', amendmentId, {
    status: 'approved',
    decidedBy: decider.uid,
    decidedByName: decider.name,
    decidedAt: now,
    decisionNote: request.decisionNote,
    resultingVersion: newVersion
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'approval',
    newValue: `Amendment ${amendmentId} approved: PO ${po.id} now version ${newVersion}, ${amendmentRequest.proposedTotalValue.toLocaleString()} AED (tier: ${requiredApprovalTier}).`,
    reason: request.reason
  });
});

// ----------------------------------------------------
// PARTIAL LINE-ITEM CANCELLATION (rule 12-ish / general rules 85, 87): a
// single line of a multi-vehicle PO can be cancelled without touching the
// rest -- request -> review -> approval, never a delete, always keeping the
// reason/requester/approver/timestamp/impact trail on the line itself.
// ----------------------------------------------------

export interface RequestLineItemCancellationInput {
  purchaseOrderId: string;
  lineItemId: string;
  reason: string;
  financialImpact?: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

export async function requestLineItemCancellation(input: RequestLineItemCancellationInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  const po = await loadPurchaseOrder(input.purchaseOrderId);
  const line = po.lineItems.find((li) => li.id === input.lineItemId);
  if (!line) throw new PurchaseOrderError(`Line item ${input.lineItemId} does not belong to this purchase order.`);
  if (line.status === 'cancelled') throw new PurchaseOrderError('This line item is already cancelled.');
  if (line.cancellation?.status === 'pending_approval') throw new PurchaseOrderError('This line item already has a pending cancellation request.');
  if (po.status === 'cancelled') throw new PurchaseOrderError('This purchase order is already fully cancelled.');

  const now = new Date().toISOString();
  const cancellation: PurchaseOrderLineItemCancellation = {
    reason: input.reason,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedAt: now,
    financialImpact: input.financialImpact,
    status: 'pending_approval'
  };
  const updatedLineItems = po.lineItems.map((li) => (li.id === input.lineItemId ? { ...li, cancellation } : li));
  await updateDurable('purchase_orders', po.id, { lineItems: updatedLineItems, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'update',
    newValue: `Requested cancellation of line ${input.lineItemId} (${line.description}).`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'approve_line_cancellation',
    payload: { lineItemId: input.lineItemId },
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('PurchaseOrder', 'approve_line_cancellation', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const lineItemId = request.payload.lineItemId as string;
  const po = await loadPurchaseOrder(request.entityId);
  const line = po.lineItems.find((li) => li.id === lineItemId);
  if (!line || !line.cancellation || line.cancellation.status !== 'pending_approval') {
    throw new PurchaseOrderError(`Line item ${lineItemId} has no pending cancellation request.`);
  }

  const now = new Date().toISOString();
  const updatedLineItems = po.lineItems.map((li) =>
    li.id === lineItemId
      ? {
          ...li,
          status: 'cancelled' as const,
          cancellation: { ...li.cancellation!, status: 'approved' as const, approvedBy: decider.uid, approvedByName: decider.name, approvedAt: now }
        }
      : li
  );
  const totalValue = computeTotalValue(updatedLineItems);
  const status = computeDerivedStatus(updatedLineItems);

  await updateDurable('purchase_orders', po.id, { lineItems: updatedLineItems, totalValue, status, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'approval',
    newValue: `Line ${lineItemId} cancelled (${line.description}). PO total now ${totalValue.toLocaleString()} AED, status ${status}.`,
    reason: request.reason
  });
});

// ----------------------------------------------------
// FULL PO CANCELLATION -- same request -> review -> approval workflow,
// status only: the PO number is never reused and no records are deleted.
// Cascades to any Operation still in status 'open' (nothing has started on
// it yet) so a cancelled PO doesn't leave dangling open work behind; an
// Operation already 'in_progress' or 'closed' is left untouched.
// ----------------------------------------------------

export interface RequestFullPOCancellationInput {
  purchaseOrderId: string;
  reason: string;
  financialImpact?: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
}

export async function requestFullPurchaseOrderCancellation(input: RequestFullPOCancellationInput, recordAudit: RecordAuditFn): Promise<{ approvalRequestId: string }> {
  const po = await loadPurchaseOrder(input.purchaseOrderId);
  if (po.status === 'cancelled') throw new PurchaseOrderError('This purchase order is already cancelled.');
  if (po.cancellation?.status === 'pending_approval') throw new PurchaseOrderError('This purchase order already has a pending cancellation request.');

  const now = new Date().toISOString();
  const cancellation: PurchaseOrderCancellation = {
    reason: input.reason,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedAt: now,
    financialImpact: input.financialImpact,
    status: 'pending_approval'
  };
  await updateDurable('purchase_orders', po.id, { cancellation, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.requestedBy,
    userName: input.requestedByName,
    userRole: input.requestedByRole,
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'update',
    newValue: `Requested full cancellation of PO ${po.id}.`,
    reason: input.reason
  });

  const approvalRequest = await createProcurementApproval({
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'approve_full_cancellation',
    payload: {},
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole,
    reason: input.reason
  }, recordAudit);

  return { approvalRequestId: approvalRequest.id };
}

registerApprovalHandler('PurchaseOrder', 'approve_full_cancellation', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const admin = (await import('firebase-admin')).default;
  const po = await loadPurchaseOrder(request.entityId);
  const existingCancellation = po.cancellation;
  if (!existingCancellation || existingCancellation.status !== 'pending_approval') {
    throw new PurchaseOrderError(`Purchase order ${po.id} has no pending cancellation request.`);
  }

  const now = new Date().toISOString();
  const updatedLineItems = po.lineItems.map((li) =>
    li.status === 'cancelled'
      ? li
      : {
          ...li,
          status: 'cancelled' as const,
          cancellation: li.cancellation ?? {
            reason: existingCancellation.reason,
            requestedBy: existingCancellation.requestedBy,
            requestedByName: existingCancellation.requestedByName,
            requestedAt: existingCancellation.requestedAt,
            approvedBy: decider.uid,
            approvedByName: decider.name,
            approvedAt: now,
            status: 'approved' as const
          }
        }
  );
  const updatedCancellation: PurchaseOrderCancellation = {
    ...existingCancellation,
    status: 'approved',
    approvedBy: decider.uid,
    approvedByName: decider.name,
    approvedAt: now
  };

  await updateDurable('purchase_orders', po.id, {
    status: 'cancelled',
    lineItems: updatedLineItems,
    cancellation: updatedCancellation,
    updatedAt: now
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'approval',
    newValue: `PO ${po.id} fully cancelled.`,
    reason: request.reason
  });

  // Cascade: an Operation nothing has started on yet is cancelled along with
  // its PO; one already in progress or closed is left exactly as it is.
  const opsSnap = await admin.firestore().collection('procurement_operations').where('purchaseOrderId', '==', po.id).get();
  for (const doc of opsSnap.docs) {
    const operation = doc.data() as ProcurementOperation;
    if (operation.status !== 'open') continue;
    await updateDurable('procurement_operations', operation.id, { status: 'cancelled', updatedAt: now } as unknown as Record<string, unknown>);
    await recordAudit({
      userId: decider.uid,
      userName: decider.name,
      userRole: decider.role,
      entityType: 'ProcurementOperation',
      entityId: operation.id,
      action: 'update',
      newValue: `Operation cancelled: parent PO ${po.id} was fully cancelled.`,
      reason: request.reason
    });
  }
});

// ----------------------------------------------------
// PARTIAL FULFILLMENT (n of m vehicles/items received, PO stays open) --
// a minimal receiving marker for status tracking. The full vehicle-receiving
// workflow (reservation-severity tiers, damage-claim baseline) is a later,
// separate checkpoint; this only records the fact "this line was received"
// so the PO's derived status correctly reflects partial completion.
// ----------------------------------------------------

export interface ReceiveLineItemInput {
  purchaseOrderId: string;
  lineItemId: string;
  actor: ProcurementApprovalActor;
}

export async function receiveLineItem(input: ReceiveLineItemInput, recordAudit: RecordAuditFn): Promise<PurchaseOrder> {
  const po = await loadPurchaseOrder(input.purchaseOrderId);
  const line = po.lineItems.find((li) => li.id === input.lineItemId);
  if (!line) throw new PurchaseOrderError(`Line item ${input.lineItemId} does not belong to this purchase order.`);
  if (line.status === 'cancelled') throw new PurchaseOrderError('A cancelled line item cannot be received.');
  if (line.status === 'received') throw new PurchaseOrderError('This line item has already been marked received.');

  const now = new Date().toISOString();
  const updatedLineItems = po.lineItems.map((li) => (li.id === input.lineItemId ? { ...li, status: 'received' as const } : li));
  const status = computeDerivedStatus(updatedLineItems);

  await updateDurable('purchase_orders', po.id, { lineItems: updatedLineItems, status, updatedAt: now } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: input.actor.uid,
    userName: input.actor.name,
    userRole: input.actor.role,
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'update',
    newValue: `Line ${input.lineItemId} (${line.description}) marked received. PO status now ${status}.`
  });

  return { ...po, lineItems: updatedLineItems, status, updatedAt: now };
}
