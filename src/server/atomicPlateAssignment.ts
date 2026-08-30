import type { PlateAssignmentHistory, Vehicle, VehicleTimelineEvent, AuditLog } from '../types';
import { globalStore } from './dataStore';
import { runDurableTransaction } from './persistence';

export interface AtomicPlateAssignmentParams {
  vehicleId: string;
  newPlateNumber: string;
  newPlateCity: string;
  reason: string;
  assignedBy: string;
  assignedByName: string;
  effectiveDate?: string;
}

export interface AtomicPlateAssignmentResult {
  success: boolean;
  vehicle?: Vehicle;
  displacedVehicle?: Vehicle;
  auditLog?: AuditLog;
  error?: string;
}

/**
 * Server-authoritative plate assignment.
 *
 * Unlike the legacy SplendorConnectEngine method, this implementation makes
 * the target vehicle and any vehicle currently carrying the requested plate
 * participate in ONE Firestore transaction. That closes the race where two
 * concurrent requests could both observe a free plate and assign it.
 */
export async function atomicAssignPlate(params: AtomicPlateAssignmentParams): Promise<AtomicPlateAssignmentResult> {
  const normalizedPlate = params.newPlateNumber.trim().toUpperCase();
  if (!params.vehicleId || !normalizedPlate || !params.newPlateCity || !params.reason.trim() || !params.assignedBy) {
    return { success: false, error: 'Missing required plate assignment fields.' };
  }

  return runDurableTransaction(async (tx, ctx) => {
    const vehiclesRef = ctx.db.collection('vehicles');
    const auditRef = ctx.db.collection('audit_logs').doc();
    const targetRef = vehiclesRef.doc(params.vehicleId);
    const targetSnap = await tx.get(targetRef);

    if (!targetSnap.exists) return { success: false, error: 'Vehicle not found.' };
    const target = { id: targetSnap.id, ...targetSnap.data() } as Vehicle;

    const allVehiclesSnap = await tx.get(vehiclesRef);
    const displacedSnap = allVehiclesSnap.docs.find(doc => {
      if (doc.id === params.vehicleId) return false;
      const data = doc.data() as Vehicle;
      return String(data.plateNumber || '').trim().toUpperCase() === normalizedPlate;
    });

    const now = new Date().toISOString();
    const history: PlateAssignmentHistory = {
      id: `PAH-${Date.now()}`,
      vehicleId: params.vehicleId,
      oldPlateNumber: target.plateNumber,
      oldPlateCity: (target as any).plateCity,
      newPlateNumber: normalizedPlate,
      newPlateCity: params.newPlateCity,
      reason: params.reason.trim(),
      assignedBy: params.assignedBy,
      assignedByName: params.assignedByName,
      effectiveDate: params.effectiveDate || now,
      createdAt: now,
    } as PlateAssignmentHistory;

    const timelineEvent: VehicleTimelineEvent = {
      id: `VTE-${Date.now()}`,
      vehicleId: params.vehicleId,
      type: 'plate_assignment',
      title: 'Plate assignment updated',
      description: `${target.plateNumber || 'No plate'} → ${normalizedPlate}`,
      timestamp: now,
      actorId: params.assignedBy,
      actorName: params.assignedByName,
    } as VehicleTimelineEvent;

    const updatedTarget = {
      ...target,
      plateNumber: normalizedPlate,
      plateCity: params.newPlateCity,
      updatedAt: now,
      plateAssignmentHistory: [...(((target as any).plateAssignmentHistory || []) as PlateAssignmentHistory[]), history],
      timeline: [...(((target as any).timeline || []) as VehicleTimelineEvent[]), timelineEvent],
    } as Vehicle;

    tx.set(targetRef, updatedTarget, { merge: true });

    let displacedVehicle: Vehicle | undefined;
    if (displacedSnap) {
      const existing = { id: displacedSnap.id, ...displacedSnap.data() } as Vehicle;
      displacedVehicle = {
        ...existing,
        plateNumber: undefined,
        plateCity: undefined,
        updatedAt: now,
      } as Vehicle;
      tx.set(displacedSnap.ref, displacedVehicle, { merge: true });
    }

    const auditLog: AuditLog = {
      id: auditRef.id,
      timestamp: now,
      action: 'UPDATE',
      entityType: 'vehicle',
      entityId: params.vehicleId,
      userId: params.assignedBy,
      userName: params.assignedByName,
      details: `Atomic plate assignment: ${target.plateNumber || 'No plate'} → ${normalizedPlate}`,
    } as AuditLog;
    tx.set(auditRef, auditLog);

    return { success: true, vehicle: updatedTarget, displacedVehicle, auditLog };
  });
}

export async function atomicAssignPlateWithStoreSync(params: AtomicPlateAssignmentParams): Promise<AtomicPlateAssignmentResult> {
  const result = await atomicAssignPlate(params);
  if (!result.success || !result.vehicle) return result;

  const targetIndex = globalStore.vehicles.findIndex(v => v.id === result.vehicle!.id);
  if (targetIndex >= 0) globalStore.vehicles[targetIndex] = result.vehicle;
  if (result.displacedVehicle) {
    const displacedIndex = globalStore.vehicles.findIndex(v => v.id === result.displacedVehicle!.id);
    if (displacedIndex >= 0) globalStore.vehicles[displacedIndex] = result.displacedVehicle;
  }
  if (result.auditLog) globalStore.auditLogs.push(result.auditLog);
  return result;
}
