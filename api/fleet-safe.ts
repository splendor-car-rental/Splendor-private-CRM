import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { getVerifiedActiveStaff } from '../src/server/activeStaffAuth.js';
import { issueNextNumber } from '../src/server/idGenerator.js';
import { appendToAuditChain } from '../src/server/auditIntegrity.js';

const ARCHIVE_ROLES = ['ceo', 'admin'] as const;
const OPERATIVE_CONTRACT_STATUSES = new Set(['approved', 'signed', 'active']);

class FleetArchiveError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FleetArchiveError';
  }
}

async function persistArchiveAudit(
  actor: { uid: string; name: string; role: string },
  vehicleId: string,
  previousLifecycleStatus: string,
  previousStatus: string,
  reason: string
) {
  const id = await issueNextNumber('AuditLog');
  const timestamp = new Date().toISOString();
  const base = {
    id,
    timestamp,
    userId: actor.uid,
    userName: actor.name,
    userRole: actor.role,
    entityType: 'Vehicle',
    entityId: vehicleId,
    action: 'status_change',
    previousValue: JSON.stringify({ lifecycleStatus: previousLifecycleStatus, status: previousStatus }),
    newValue: JSON.stringify({ lifecycleStatus: 'ARCHIVED', status: 'unavailable' }),
    reason
  };
  const chain = await appendToAuditChain(base);
  await admin.firestore().collection('audit_logs').doc(id).create({ ...base, ...chain });
}

export default async function fleetSafeHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (String(req.method || '').toUpperCase() !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const actor = await getVerifiedActiveStaff(req, res, ARCHIVE_ROLES);
  if (!actor) return;

  const vehicleId = String(req.query.vehicleId || '').trim();
  if (!vehicleId) return res.status(400).json({ error: 'vehicleId is required.' });
  const reason = String(req.body?.reason || req.query.reason || 'Archived by authorized management').trim().slice(0, 1000);
  if (!reason) return res.status(400).json({ error: 'An archive reason is required.' });

  const firestore = admin.firestore();
  const vehicleRef = firestore.collection('vehicles').doc(vehicleId);
  const contractsQuery = firestore.collection('contracts').where('vehicleId', '==', vehicleId);
  const now = new Date().toISOString();

  try {
    const outcome = await firestore.runTransaction(async tx => {
      // Every read is completed before the first write.
      const [vehicleSnap, contractsSnap] = await Promise.all([
        tx.get(vehicleRef),
        tx.get(contractsQuery)
      ]);
      if (!vehicleSnap.exists) throw new FleetArchiveError(404, 'Vehicle not found.');
      const vehicle = { id: vehicleSnap.id, ...(vehicleSnap.data() as any) };

      if (vehicle.lifecycleStatus === 'ARCHIVED') {
        return {
          replayed: true,
          vehicle,
          previousLifecycleStatus: 'ARCHIVED',
          previousStatus: String(vehicle.status || 'unavailable')
        };
      }

      const operativeContract = contractsSnap.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
        .find(contract =>
          OPERATIVE_CONTRACT_STATUSES.has(String(contract.status || '')) ||
          String(contract.returnWorkflow?.status || '') === 'settlement_pending'
        );
      if (vehicle.currentContractId || operativeContract) {
        throw new FleetArchiveError(
          409,
          `Vehicle cannot be archived while bound to an operative or unsettled contract${operativeContract ? ` (${operativeContract.id})` : ''}.`
        );
      }

      const previousLifecycleStatus = String(vehicle.lifecycleStatus || 'ACTIVE');
      const previousStatus = String(vehicle.status || '');
      const timeline = Array.isArray(vehicle.timeline) ? vehicle.timeline : [];
      const archiveEvent = {
        id: `ARCHIVE-${vehicleId}-${now}`,
        vehicleId,
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

      tx.set(vehicleRef, archivedVehicle, { merge: false });
      return { replayed: false, vehicle: archivedVehicle, previousLifecycleStatus, previousStatus };
    });

    if (!outcome.replayed) {
      try {
        await persistArchiveAudit(actor, vehicleId, outcome.previousLifecycleStatus, outcome.previousStatus, reason);
      } catch (error) {
        // The archive transition itself contains immutable actor/reason/timeline
        // evidence. A separate audit-chain failure must be visible but must not
        // cause a client retry to duplicate or reverse the committed archive.
        console.error('[fleet-archive] archive committed but audit-chain append failed', error);
      }
    }

    return res.status(200).json({
      success: true,
      archived: true,
      replayed: outcome.replayed,
      vehicle: outcome.vehicle,
      message: outcome.replayed ? `Vehicle ${vehicleId} is already archived.` : `Vehicle ${vehicleId} successfully archived.`
    });
  } catch (error) {
    if (error instanceof FleetArchiveError) return res.status(error.status).json({ error: error.message });
    console.error('[fleet-archive] archive failed atomically', error);
    return res.status(500).json({ error: 'Vehicle archive failed atomically.' });
  }
}
