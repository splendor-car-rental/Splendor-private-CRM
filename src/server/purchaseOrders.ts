import { createDurable, updateDurable } from './persistence';
import { issueNextNumber } from './idGenerator';
import { PersistenceError } from './persistence';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals';
import { computeRequiredApprovalTier } from '../config/procurement';
import type { RecordAuditFn } from './businessRules';
import type {
  PurchaseOrder, PurchaseOrderLineItem, PurchaseOrderVersionSnapshot, PurchaseOrderKind,
  RetroactivePOReason, ProcurementOperation, UserRole
} from '../types';

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

/** Approval handler: PO creation -> approved. Creates one ProcurementOperation per line item (rule 9-10), never asking the requester to re-link anything manually. */
registerApprovalHandler('PurchaseOrder', 'approve_creation', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const admin = (await import('firebase-admin')).default;
  const poId = request.entityId;
  const ref = admin.firestore().collection('purchase_orders').doc(poId);
  const snap = await ref.get();
  if (!snap.exists) throw new PurchaseOrderError(`Purchase order ${poId} not found.`);
  const po = snap.data() as PurchaseOrder;

  const now = new Date().toISOString();
  const updated: Partial<PurchaseOrder> = {
    status: 'approved',
    approvedBy: decider.uid,
    approvedByName: decider.name,
    approvedAt: now,
    updatedAt: now
  };
  await updateDurable('purchase_orders', poId, updated as unknown as Record<string, unknown>);

  // Rule 9-10: every line item becomes its own independent Operation, all
  // linked back to the same parent PO -- no manual re-linking required.
  // Line items live inside one array field on the PO document, so the
  // operationId assignments are collected in memory and written back as one
  // updated array, rather than attempting per-line dot-path array updates
  // Firestore doesn't support cleanly.
  const updatedLineItems: PurchaseOrderLineItem[] = [...po.lineItems];
  for (let i = 0; i < updatedLineItems.length; i++) {
    const line = updatedLineItems[i];
    if (line.status === 'cancelled') continue;
    const opId = await issueNextNumber('ProcurementOperation');
    const operation: ProcurementOperation = {
      id: opId,
      purchaseOrderId: poId,
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
      newValue: `Opened operation for PO ${poId} line ${line.id} (${line.description}).`,
      reason: `PO ${poId} approved`
    });
  }
  await updateDurable('purchase_orders', poId, { lineItems: updatedLineItems } as unknown as Record<string, unknown>);

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
