import admin from 'firebase-admin';
import { recordDurableAudit } from './durableAudit';

const OPERATIVE_CONTRACT_STATUSES = new Set(['approved', 'signed', 'active']);

export interface FleetArchiveActor {
  uid: string;
  name: string;
  role: string;
}

export class FleetArchiveError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FleetArchiveError';
  }
}

export function planVehicleArchive(
  vehicle: Record<string, any>,
  contracts: Array<Record<string, any>>,
  actor: FleetArchiveActor,
  reason: string,
  now: string
): { replayed: boolean; vehicle: Record<string, any>; previousLifecycleStatus: string; previousStatus: string } {
  const previousLifecycleStatus = String(vehicle.lifecycleStatus || 'ACTIVE');
  const previousStatus = String(vehicle.status || '');

  if (previousLifecycleStatus === 'ARCHIVED') {
    return { replayed: true, vehicle, previousLifecycleStatus, previousStatus };
  }

  const operativeContract = contracts.find(contract =>
    OPERATIVE_CONTRACT_STATUSES.has(String(contract.status || '')) ||
    String(contract.returnWorkflow?.status || '') === 'settlement_pending'
  );

  if (vehicle.currentContractId || operativeContract) {
    const suffix = operativeContract?.id ? ` (${operativeContract.id})` : '';
    throw new FleetArchiveError(409, `Vehicle cannot be archived while bound to an operative or unsettled contract${suffix}.`);
  }

  const timeline = Array.isArray(vehicle.timeline) ? vehicle.timeline : [];
  const archiveEvent = {
    id: `ARCHIVE-${vehicle.id}-${now}`,
    vehicleId: vehicle.id,
    date: now,
    action: 'ARCHIVED',
    previousState: { lifecycleStatus: previousLifecycleStatus, status: previousStatus },
    newState: { lifecycleStatus: 'ARCHIVED', status: 'unavailable' },
    reason,
    userId: actor.uid,
    userName: actor.name,
    userRole: actor.role,
    createdAt: now
  };

  const archivedVehicle = {
    ...vehicle,
    lifecycleStatus: 'ARCHIVED',
    status: 'unavailable',
    currentCustomerId: null,
    currentContractId: null,
    archivedAt: now,
    archivedBy: actor.uid,
    archivedByName: actor.name,
    archivedReason: reason,
    updatedAt: now,
    website: vehicle.website
      ? { ...vehicle.website, enabled: false, visibility: 'INTERNAL_ONLY', featured: false }
      : vehicle.website,
    timeline: [...timeline, archiveEvent]
  };

  return { replayed: false, vehicle: archivedVehicle, previousLifecycleStatus, previousStatus };
}

export async function archiveVehicle(
  vehicleId: string,
  reason: string,
  actor: FleetArchiveActor
): Promise<{ replayed: boolean; vehicle: Record<string, any> }> {
  const db = admin.firestore();
  const vehicleRef = db.collection('vehicles').doc(vehicleId);
  const contractsQuery = db.collection('contracts').where('vehicleId', '==', vehicleId);
  const now = new Date().toISOString();

  const outcome = await db.runTransaction(async tx => {
    const [vehicleSnap, contractsSnap] = await Promise.all([
      tx.get(vehicleRef),
      tx.get(contractsQuery)
    ]);

    if (!vehicleSnap.exists) throw new FleetArchiveError(404, 'Vehicle not found.');
    const vehicle = { id: vehicleSnap.id, ...(vehicleSnap.data() as Record<string, unknown>) };
    const contracts = contractsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
    const plan = planVehicleArchive(vehicle, contracts, actor, reason, now);

    if (!plan.replayed) {
      tx.set(vehicleRef, plan.vehicle, { merge: false });
    }
    return plan;
  });

  if (!outcome.replayed) {
    try {
      await recordDurableAudit({
        userId: actor.uid,
        userName: actor.name,
        userRole: actor.role as any,
        entityType: 'Vehicle',
        entityId: vehicleId,
        action: 'status_change',
        previousValue: JSON.stringify({ lifecycleStatus: outcome.previousLifecycleStatus, status: outcome.previousStatus }),
        newValue: JSON.stringify({ lifecycleStatus: 'ARCHIVED', status: 'unavailable' }),
        reason
      });
    } catch (error) {
      console.error('[fleet-archive] archive committed but global audit append failed', error);
    }
  }

  return { replayed: outcome.replayed, vehicle: outcome.vehicle };
}
