import admin from 'firebase-admin';
import type { Vehicle, PlateAssignmentHistory, AuditLog } from '../types';
import { globalStore } from './dataStore';
import { issueNextNumber } from './idGenerator';

export type AtomicPlateAssignmentParams = {
  vehicleId: string;
  newPlateNumber: string;
  newPlateCity: string;
  reason: string;
  assignedBy: string;
  assignedByName: string;
  effectiveDate?: string;
};

/**
 * Atomic replacement for the legacy multi-write plate assignment flow.
 * Reads the target and current plate owner first, then commits the affected
 * vehicle documents and audit record together. Firestore retries the
 * transaction when concurrent edits touch a read document.
 */
export async function assignPlateAtomically(params: AtomicPlateAssignmentParams) {
  if (admin.apps.length === 0) return { success: false, error: 'Firestore is not configured.' };

  const db = admin.firestore();
  const targetRef = db.collection('vehicles').doc(params.vehicleId);
  const auditId = await issueNextNumber('AuditLog');
  const now = params.effectiveDate || new Date().toISOString();

  try {
    const result = await db.runTransaction(async tx => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) throw new Error('Vehicle record not found');

      const target = { ...(targetSnap.data() as Vehicle), id: targetSnap.id } as Vehicle;
      const q = db.collection('vehicles')
        .where('plateNumber', '==', params.newPlateNumber)
        .where('plateCity', '==', params.newPlateCity);
      const plateSnap = await tx.get(q);
      const ownerDoc = plateSnap.docs.find(d => d.id !== params.vehicleId);
      const owner = ownerDoc ? ({ ...(ownerDoc.data() as Vehicle), id: ownerDoc.id } as Vehicle) : null;

      const previousPlate = `${target.plateCity || ''} ${target.plateNumber || ''}`.trim();
      const targetHistory = [...(target.plateHistory || [])];
      const current = targetHistory.find(p => p.isCurrent);
      if (current) {
        current.isCurrent = false;
        current.endDate = now;
        current.unassignedBy = params.assignedBy;
        current.unassignedByName = params.assignedByName;
      }

      if (owner && ownerDoc) {
        const ownerHistory = [...(owner.plateHistory || [])];
        const ownerCurrent = ownerHistory.find(p => p.isCurrent);
        if (ownerCurrent) {
          ownerCurrent.isCurrent = false;
          ownerCurrent.endDate = now;
          ownerCurrent.reason = `Plate transferred to vehicle ${target.id}`;
        }
        tx.set(ownerDoc.ref, {
          ...owner,
          plateNumber: 'PENDING-PLATE',
          plateHistory: ownerHistory,
          updatedAt: now
        });
      }

      const assignment: PlateAssignmentHistory = {
        id: `PLT-${Date.now().toString().slice(-6)}`,
        plateNumber: params.newPlateNumber,
        plateCity: params.newPlateCity,
        vehicleId: target.id,
        vehicleVin: target.vin,
        vehicleName: `${target.make} ${target.model}`,
        startDate: now,
        isCurrent: true,
        reason: params.reason,
        assignedBy: params.assignedBy,
        assignedByName: params.assignedByName,
        createdAt: now
      };
      targetHistory.push(assignment);

      const targetTimeline = [...(target.timeline || []), {
        id: `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        vehicleId: target.id,
        date: now,
        action: 'PLATE_ASSIGNED',
        previousState: { plateNumber: target.plateNumber, plateCity: target.plateCity },
        newState: { plateNumber: params.newPlateNumber, plateCity: params.newPlateCity },
        reason: params.reason,
        userId: params.assignedBy,
        userName: params.assignedByName,
        createdAt: now
      }];

      const updatedTarget: Vehicle = {
        ...target,
        plateNumber: params.newPlateNumber,
        plateCity: params.newPlateCity,
        plateHistory: targetHistory,
        timeline: targetTimeline,
        updatedAt: now
      };

      const audit: AuditLog = {
        id: auditId,
        timestamp: now,
        userId: params.assignedBy,
        userName: params.assignedByName,
        userRole: 'fleet',
        entityType: 'Vehicle',
        entityId: target.id,
        action: 'update',
        previousValue: `Plate: ${previousPlate}`,
        newValue: `Plate: ${params.newPlateCity} ${params.newPlateNumber}`,
        reason: params.reason
      };

      tx.set(targetRef, updatedTarget);
      tx.create(db.collection('audit_logs').doc(auditId), audit);
      return { target: updatedTarget, owner };
    });

    const targetIndex = globalStore.vehicles.findIndex(v => v.id === result.target.id);
    if (targetIndex >= 0) globalStore.vehicles[targetIndex] = result.target;
    if (result.owner) {
      const ownerIndex = globalStore.vehicles.findIndex(v => v.id === result.owner!.id);
      if (ownerIndex >= 0) globalStore.vehicles[ownerIndex] = { ...result.owner, plateNumber: 'PENDING-PLATE' } as Vehicle;
    }
    globalStore.auditLogs.unshift({
      id: auditId,
      timestamp: now,
      userId: params.assignedBy,
      userName: params.assignedByName,
      userRole: 'fleet',
      entityType: 'Vehicle',
      entityId: result.target.id,
      action: 'update',
      previousValue: 'Plate assignment changed',
      newValue: `Plate: ${params.newPlateCity} ${params.newPlateNumber}`,
      reason: params.reason
    } as AuditLog);

    return { success: true, vehicle: result.target };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Plate assignment failed.' };
  }
}
