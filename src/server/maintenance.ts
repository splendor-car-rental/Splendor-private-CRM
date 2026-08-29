import { runDurableTransaction, PersistenceError } from './persistence';
import { getRuleValue, type RecordAuditFn } from './businessRules';
import type { Vehicle, VehicleTimelineEvent, UserRole } from '../types';

// ----------------------------------------------------
// PREVENTIVE MAINTENANCE SCHEDULING (Splendor Master Rule Set, Module 09)
// ----------------------------------------------------
// RULE-M01: every vehicle carries a mileage-based service interval
// (maintenanceOilFilterIntervalKm, a configurable Business Rule -- default
// 7,000 km) and an alert lead distance (maintenanceAlertLeadKm, default
// 500 km). RULE-M02: maintenanceStatus auto-recomputes to 'due_soon' the
// moment current mileage comes within the lead distance of the next
// service threshold, purely from mileage updates that already happen
// during contract return -- no separate polling job needed. RULE-M03:
// 'in_service' is a human signal (the vehicle is physically at the
// workshop right now, set via startMaintenance) that the mileage-driven
// recompute never silently overwrites; only logMaintenanceCompleted
// (service actually finished) clears it back to 'optimal' and rolls the
// next-due threshold forward.

const DEFAULT_INTERVAL_KM = 7000;
const DEFAULT_ALERT_LEAD_KM = 500;

export class MaintenanceError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'MaintenanceError';
  }
}

export interface MaintenanceActor {
  uid: string;
  name: string;
  role: UserRole;
}

type MaintenanceScheduleFields = Pick<Vehicle, 'mileage' | 'lastMaintenanceMileage' | 'nextMaintenanceMileage' | 'maintenanceStatus'>;

/**
 * Recomputes lastMaintenanceMileage/nextMaintenanceMileage/maintenanceStatus
 * given a vehicle's current stored schedule and its NEW mileage reading.
 * Pure function -- callers persist the result themselves (see its use in
 * server.ts's contract-return handler, inside that route's own transaction).
 * Returns {} (no change) if the vehicle is currently 'in_service', since
 * that state is only ever cleared by an explicit logMaintenanceCompleted.
 */
export function computeMaintenanceScheduleUpdate(
  vehicle: Partial<MaintenanceScheduleFields>,
  newMileage: number
): Partial<MaintenanceScheduleFields> {
  if (vehicle.maintenanceStatus === 'in_service') return {};

  const intervalKm = getRuleValue('maintenanceOilFilterIntervalKm', DEFAULT_INTERVAL_KM);
  const alertLeadKm = getRuleValue('maintenanceAlertLeadKm', DEFAULT_ALERT_LEAD_KM);
  const lastMaintenanceMileage = vehicle.lastMaintenanceMileage ?? 0;
  const nextMaintenanceMileage = vehicle.nextMaintenanceMileage || (lastMaintenanceMileage + intervalKm);
  const maintenanceStatus: 'optimal' | 'due_soon' = newMileage >= nextMaintenanceMileage - alertLeadKm ? 'due_soon' : 'optimal';

  return { lastMaintenanceMileage, nextMaintenanceMileage, maintenanceStatus };
}

function makeTimelineEvent(
  vehicleId: string,
  action: VehicleTimelineEvent['action'],
  previousState: Record<string, unknown>,
  newState: Record<string, unknown>,
  reason: string,
  actor: MaintenanceActor
): VehicleTimelineEvent {
  const now = new Date().toISOString();
  return {
    id: `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    vehicleId, date: now, action, previousState, newState, reason,
    userId: actor.uid, userName: actor.name, userRole: actor.role, createdAt: now
  };
}

/**
 * RULE-M03: marks a vehicle as physically in the workshop right now.
 * Also flips the vehicle's overall availability status to 'maintenance' so
 * the existing booking-conflict checks (src/server/availability.ts) reject
 * any new reservation/contract against it until logMaintenanceCompleted.
 */
export async function startMaintenance(
  vehicleId: string,
  actor: MaintenanceActor,
  recordAudit: RecordAuditFn,
  reason: string
): Promise<Vehicle> {
  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('vehicles').doc(vehicleId);

  const updated = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new MaintenanceError(`Vehicle ${vehicleId} not found.`);
    const vehicle = snap.data() as Vehicle;
    if (vehicle.status === 'rented' || vehicle.status === 'reserved') {
      throw new MaintenanceError(`Vehicle ${vehicleId} is currently ${vehicle.status} and cannot be taken into maintenance until it's returned.`);
    }
    if (vehicle.maintenanceStatus === 'in_service') {
      throw new MaintenanceError(`Vehicle ${vehicleId} is already in service.`);
    }
    const event = makeTimelineEvent(
      vehicleId, 'MAINTENANCE_STARTED',
      { status: vehicle.status, maintenanceStatus: vehicle.maintenanceStatus },
      { status: 'maintenance', maintenanceStatus: 'in_service' },
      reason, actor
    );
    const patch = {
      status: 'maintenance' as const,
      maintenanceStatus: 'in_service' as const,
      timeline: [...(vehicle.timeline || []), event],
      updatedAt: event.date
    };
    tx.set(ref, patch, { merge: true });
    return { ...vehicle, ...patch };
  });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'Vehicle', entityId: vehicleId, action: 'status_change',
    previousValue: `maintenanceStatus: ${updated.maintenanceStatus === 'in_service' ? 'optimal/due_soon' : updated.maintenanceStatus}`,
    newValue: 'maintenanceStatus: in_service (vehicle status: maintenance)',
    reason
  });

  return updated;
}

export interface LogMaintenanceInput {
  vehicleId: string;
  mileageAtService?: number; // defaults to the vehicle's current mileage
  notes?: string;
}

/**
 * RULE-M03: records a completed service -- resets the interval from the
 * service mileage and clears 'in_service' back to 'optimal'. If the
 * vehicle's overall status was 'maintenance' (set by startMaintenance), it
 * returns to 'available' since the vehicle is now road-ready again.
 */
export async function logMaintenanceCompleted(
  input: LogMaintenanceInput,
  actor: MaintenanceActor,
  recordAudit: RecordAuditFn
): Promise<Vehicle> {
  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('vehicles').doc(input.vehicleId);
  const intervalKm = getRuleValue('maintenanceOilFilterIntervalKm', DEFAULT_INTERVAL_KM);

  const updated = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new MaintenanceError(`Vehicle ${input.vehicleId} not found.`);
    const vehicle = snap.data() as Vehicle;
    const mileageAtService = input.mileageAtService ?? vehicle.mileage;
    if (typeof mileageAtService !== 'number' || Number.isNaN(mileageAtService)) {
      throw new MaintenanceError('A valid service mileage is required.');
    }
    if (mileageAtService < (vehicle.lastMaintenanceMileage ?? 0)) {
      throw new MaintenanceError('Service mileage cannot be less than the last recorded service mileage.');
    }

    const event = makeTimelineEvent(
      input.vehicleId, 'MAINTENANCE_LOGGED',
      { maintenanceStatus: vehicle.maintenanceStatus, lastMaintenanceMileage: vehicle.lastMaintenanceMileage },
      { maintenanceStatus: 'optimal', lastMaintenanceMileage: mileageAtService, nextMaintenanceMileage: mileageAtService + intervalKm },
      input.notes || 'Scheduled maintenance completed', actor
    );
    const patch: Record<string, unknown> = {
      lastMaintenanceMileage: mileageAtService,
      nextMaintenanceMileage: mileageAtService + intervalKm,
      maintenanceStatus: 'optimal',
      timeline: [...(vehicle.timeline || []), event],
      updatedAt: event.date
    };
    if (vehicle.status === 'maintenance') patch.status = 'available';
    tx.set(ref, patch, { merge: true });
    return { ...vehicle, ...patch } as Vehicle;
  });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'Vehicle', entityId: input.vehicleId, action: 'update',
    newValue: `Maintenance logged at ${updated.lastMaintenanceMileage} km. Next due at ${updated.nextMaintenanceMileage} km.`,
    reason: input.notes || 'Scheduled maintenance completed'
  });

  return updated;
}
