import { createDurable, updateDurable, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { createProcurementApproval, registerApprovalHandler, type ProcurementApprovalRequest, type ProcurementApprovalActor } from './procurementApprovals.js';
import type { RecordAuditFn } from './businessRules.js';
import type { VehicleReceivingRecord, ReceivingResult, ReservationSeverity, UserRole } from '../types/index.js';

// ----------------------------------------------------
// VEHICLE RECEIVING FROM SUPPLIER (Splendor Procurement, Phase 1)
// ----------------------------------------------------
// Every vehicle received from a supplier is inspected and recorded as
// matching, with a reservation, or rejected. A reservation carries a
// severity: simple (proceed, just documented -- the baseline a later
// damage claim at return will be compared against), impactful (must be
// approved before the vehicle can be handed to a customer), or
// dangerous_safety (blocked outright). Nothing here is ever silently
// overwritten -- the record is the baseline itself.

export class VehicleReceivingError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'VehicleReceivingError';
  }
}

function computeDecision(result: ReceivingResult, severity?: ReservationSeverity): VehicleReceivingRecord['decision'] {
  if (result === 'rejected') return 'blocked';
  if (result === 'matching') return 'proceed';
  // with_reservation
  if (severity === 'dangerous_safety') return 'blocked';
  if (severity === 'impactful') return 'requires_approval_before_handover';
  return 'proceed'; // simple
}

export interface RecordVehicleReceivingInput {
  operationId: string;
  purchaseOrderId: string;
  supplierId: string;
  vehicleId?: string;
  result: ReceivingResult;
  reservationSeverity?: ReservationSeverity;
  reservationReason?: string;
  description: string;
  mediaDocumentIds?: string[];
  financialImpact?: string;
  receivedBy: string;
  receivedByName: string;
  receivedByRole: UserRole;
}

export async function recordVehicleReceiving(input: RecordVehicleReceivingInput, recordAudit: RecordAuditFn): Promise<{ record: VehicleReceivingRecord; approvalRequestId?: string }> {
  if (input.result === 'with_reservation' && !input.reservationSeverity) {
    throw new VehicleReceivingError('A reservation requires a severity (simple, impactful, or dangerous_safety).');
  }
  if (input.result === 'with_reservation' && !input.reservationReason?.trim()) {
    throw new VehicleReceivingError('A reservation requires a reason.');
  }

  const decision = computeDecision(input.result, input.reservationSeverity);
  const id = await issueNextNumber('VehicleReceivingRecord');
  const now = new Date().toISOString();
  const record: VehicleReceivingRecord = {
    id,
    operationId: input.operationId,
    purchaseOrderId: input.purchaseOrderId,
    supplierId: input.supplierId,
    vehicleId: input.vehicleId,
    result: input.result,
    reservationSeverity: input.reservationSeverity,
    reservationReason: input.reservationReason,
    description: input.description,
    mediaDocumentIds: input.mediaDocumentIds || [],
    receivedBy: input.receivedBy,
    receivedByName: input.receivedByName,
    receivedAt: now,
    decision,
    financialImpact: input.financialImpact,
    createdAt: now
  };
  await createDurable('vehicle_receiving_records', record as unknown as { id: string });

  await recordAudit({
    userId: input.receivedBy,
    userName: input.receivedByName,
    userRole: input.receivedByRole,
    entityType: 'VehicleReceivingRecord',
    entityId: id,
    action: 'create',
    newValue: `Vehicle received for operation ${input.operationId}: ${input.result}${input.reservationSeverity ? ` (${input.reservationSeverity})` : ''} -- ${decision}.`
  });

  if (decision !== 'requires_approval_before_handover') {
    return { record };
  }

  const approvalRequest = await createProcurementApproval({
    entityType: 'VehicleReceivingRecord',
    entityId: id,
    action: 'approve_handover',
    payload: { receivingRecordId: id },
    requestedBy: input.receivedBy,
    requestedByName: input.receivedByName,
    requestedByRole: input.receivedByRole,
    reason: `Impactful reservation on receiving ${id}: ${input.reservationReason}`
  }, recordAudit);

  return { record, approvalRequestId: approvalRequest.id };
}

async function loadReceivingRecord(id: string): Promise<VehicleReceivingRecord> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('vehicle_receiving_records').doc(id).get();
  if (!snap.exists) throw new VehicleReceivingError(`Receiving record ${id} not found.`);
  return snap.data() as VehicleReceivingRecord;
}

registerApprovalHandler('VehicleReceivingRecord', 'approve_handover', async (request: ProcurementApprovalRequest, decider: ProcurementApprovalActor, recordAudit: RecordAuditFn) => {
  const id = request.payload.receivingRecordId as string;
  const record = await loadReceivingRecord(id);
  if (record.approvedForHandoverAt) {
    throw new VehicleReceivingError(`Receiving record ${id} has already been cleared for handover.`);
  }

  const now = new Date().toISOString();
  await updateDurable('vehicle_receiving_records', id, {
    approvedForHandoverBy: decider.uid,
    approvedForHandoverByName: decider.name,
    approvedForHandoverAt: now
  } as unknown as Record<string, unknown>);

  await recordAudit({
    userId: decider.uid,
    userName: decider.name,
    userRole: decider.role,
    entityType: 'VehicleReceivingRecord',
    entityId: id,
    action: 'approval',
    newValue: `Receiving ${id} cleared for handover despite the impactful reservation.`,
    reason: request.reason
  });
});
