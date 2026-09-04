import { randomUUID } from 'crypto';
import type { PlateAssignmentHistory, Vehicle, VehicleTimelineEvent, AuditLog } from '../types/index.js';
import { globalStore } from './dataStore.js';
import { runDurableTransaction } from './persistence.js';

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
export async function assignPlateAtomically(
  params: AtomicPlateAssignmentParams
): Promise<AtomicPlateAssignmentResult> {
  const vehicleId = String(params.vehicleId || '').trim();
  const newPlateNumber = String(params.newPlateNumber || '').trim();
  const newPlateCity = String(params.newPlateCity || '').trim();
  const reason = String(params.reason || 'Plate updated by fleet operations').trim();
  const assignedBy = String(params.assignedBy || '').trim();
  const assignedByName = String(params.assignedByName || '').trim();

  if (!vehicleId || !newPlateNumber || !newPlateCity || !assignedBy || !assignedByName) {
    return { success: false, error: 'Vehicle, plate, city, and verified actor information are required.' };
  }

  const normalizedPlate = newPlateNumber.toUpperCase().replace(/\s+/g, ' ');
  const normalizedCity = newPlateCity.trim();
  const effectiveDate = params.effectiveDate || new Date().toISOString();

  try {
    const outcome = await runDurableTransaction(async (tx, db) => {
      const vehicleRef = db.collection('vehicles').doc(vehicleId);
      const plateQuery = db.collection('vehicles')
        .where('plateNumber', '==', normalizedPlate)
        .where('plateCity', '==', normalizedCity)
        .limit(1);

      const [vehicleSnap, plateSnap] = await Promise.all([
        tx.get(vehicleRef),
        tx.get(plateQuery)
      ]);

      if (!vehicleSnap.exists) {
        throw new Error('Vehicle record not found.');
      }

      const vehicle = vehicleSnap.data() as Vehicle;
      const otherSnap = plateSnap.docs.find(doc => doc.id !== vehicleId) || null;
      const otherVehicle = otherSnap ? (otherSnap.data() as Vehicle) : null;

      const previousPlateNumber = vehicle.plateNumber || '';
      const previousPlateCity = vehicle.plateCity || '';
      const targetHistory = Array.isArray(vehicle.plateHistory) ? [...vehicle.plateHistory] : [];
      const targetTimeline = Array.isArray(vehicle.timeline) ? [...vehicle.timeline] : [];
      const eventId = `EVT-${randomUUID()}`;
      const assignmentId = `PLT-${randomUUID()}`;

      if (otherVehicle && otherSnap) {
        const otherHistory = Array.isArray(otherVehicle.plateHistory) ? [...otherVehicle.plateHistory] : [];
        const otherTimeline = Array.isArray(otherVehicle.timeline) ? [...otherVehicle.timeline] : [];
        const currentOther = otherHistory.find(item => item.isCurrent);

        if (currentOther) {
          currentOther.isCurrent = false;
          currentOther.endDate = effectiveDate;
          currentOther.reason = `Plate transferred to vehicle ${vehicleId}`;
          currentOther.unassignedBy = assignedBy;
          currentOther.unassignedByName = assignedByName;
        }

        otherTimeline.push({
          id: `${eventId}-TRANSFER`,
          vehicleId: otherVehicle.id,
          date: effectiveDate,
          action: 'PLATE_TRANSFERRED',
          previousState: { plateNumber: normalizedPlate, plateCity: normalizedCity },
          newState: { plateNumber: 'PENDING-PLATE', plateCity: otherVehicle.plateCity },
          reason: `Plate transferred to ${vehicleId}: ${reason}`,
          userId: assignedBy,
          userName: assignedByName,
          createdAt: effectiveDate
        } as VehicleTimelineEvent);

        const displacedVehicle: Vehicle = {
          ...otherVehicle,
          plateNumber: 'PENDING-PLATE',
          plateHistory: otherHistory,
          timeline: otherTimeline,
          updatedAt: effectiveDate
        };
        tx.set(otherSnap.ref, displacedVehicle, { merge: true });
      }

      const currentAssignment = targetHistory.find(item => item.isCurrent);
      if (currentAssignment) {
        currentAssignment.isCurrent = false;
        currentAssignment.endDate = effectiveDate;
        currentAssignment.unassignedBy = assignedBy;
        currentAssignment.unassignedByName = assignedByName;
      }

      const newAssignment: PlateAssignmentHistory = {
        id: assignmentId,
        plateNumber: normalizedPlate,
        plateCity: normalizedCity,
        vehicleId,
        vehicleVin: vehicle.vin,
        vehicleName: `${vehicle.make} ${vehicle.model}`,
        startDate: effectiveDate,
        isCurrent: true,
        reason,
        assignedBy,
        assignedByName,
        createdAt: effectiveDate
      };
      targetHistory.push(newAssignment);

      targetTimeline.push({
        id: eventId,
        vehicleId,
        date: effectiveDate,
        action: 'PLATE_ASSIGNED',
        previousState: { plateNumber: previousPlateNumber, plateCity: previousPlateCity },
        newState: { plateNumber: normalizedPlate, plateCity: normalizedCity },
        reason,
        userId: assignedBy,
        userName: assignedByName,
        createdAt: effectiveDate
      } as VehicleTimelineEvent);

      const updatedVehicle: Vehicle = {
        ...vehicle,
        plateNumber: normalizedPlate,
        plateCity: normalizedCity,
        currentPlateAssignmentId: assignmentId,
        plateHistory: targetHistory,
        timeline: targetTimeline,
        updatedAt: effectiveDate
      };

      const auditId = `AUD-PLATE-${randomUUID()}`;
      const auditLog: AuditLog = {
        id: auditId,
        timestamp: effectiveDate,
        userId: assignedBy,
        userName: assignedByName,
        userRole: 'fleet',
        entityType: 'Vehicle',
        entityId: vehicleId,
        action: 'update',
        previousValue: `Plate: ${previousPlateCity} ${previousPlateNumber}`,
        newValue: `Plate: ${normalizedCity} ${normalizedPlate}`,
        reason
      } as AuditLog;

      tx.set(vehicleRef, updatedVehicle, { merge: true });
      tx.create(db.collection('audit_logs').doc(auditId), auditLog);

      return {
        vehicle: updatedVehicle,
        displacedVehicle: otherVehicle && otherSnap
          ? ({
              ...otherVehicle,
              plateNumber: 'PENDING-PLATE',
              plateHistory: Array.isArray(otherVehicle.plateHistory) ? [...otherVehicle.plateHistory] : [],
              timeline: Array.isArray(otherVehicle.timeline) ? [...otherVehicle.timeline] : [],
              updatedAt: effectiveDate
            } as Vehicle)
          : undefined,
        auditLog
      };
    });

    const vehicleIndex = globalStore.vehicles.findIndex(v => v.id === vehicleId);
    if (vehicleIndex !== -1) globalStore.vehicles[vehicleIndex] = outcome.vehicle;

    if (outcome.displacedVehicle) {
      const displacedIndex = globalStore.vehicles.findIndex(v => v.id === outcome.displacedVehicle!.id);
      if (displacedIndex !== -1) globalStore.vehicles[displacedIndex] = outcome.displacedVehicle;
    }

    globalStore.auditLogs.unshift(outcome.auditLog);

    return {
      success: true,
      vehicle: outcome.vehicle,
      displacedVehicle: outcome.displacedVehicle,
      auditLog: outcome.auditLog
    };
  } catch (error: any) {
    console.error('[atomicPlateAssignment] transaction failed:', error);
    return {
      success: false,
      error: error?.message || 'Failed to assign the vehicle plate atomically.'
    };
  }
}
