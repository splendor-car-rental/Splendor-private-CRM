import type { Request, Response } from 'express';
import app from '../server.js';
import { globalStore } from '../src/server/dataStore.js';
import { getVerifiedActiveStaff } from '../src/server/activeStaffAuth.js';
import { archiveVehicle, FleetArchiveError } from '../src/server/fleetArchive.js';

const ARCHIVE_ROLES = ['ceo', 'admin'] as const;

function restoreFleetUrl(req: Request, vehicleId: string) {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(req.query || {})) {
    if (key === 'vehicleId') continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      if (value !== undefined) query.append(key, String(value));
    }
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  req.url = `/api/fleet/${encodeURIComponent(vehicleId)}${suffix}`;
}

export default async function fleetSafeHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const vehicleId = String(req.query.vehicleId || '').trim();
  if (!vehicleId) return res.status(400).json({ error: 'vehicleId is required.' });

  if (String(req.method || '').toUpperCase() !== 'DELETE') {
    restoreFleetUrl(req, vehicleId);
    return app(req, res);
  }

  const actor = await getVerifiedActiveStaff(req, res, ARCHIVE_ROLES);
  if (!actor) return;
  const reason = String(req.body?.reason || 'Archived by authorized management').trim().slice(0, 1000);

  try {
    const outcome = await archiveVehicle(vehicleId, reason, actor);
    const index = globalStore.vehicles.findIndex(vehicle => vehicle.id === vehicleId);
    if (index >= 0) globalStore.vehicles[index] = outcome.vehicle as any;

    return res.status(200).json({
      success: true,
      archived: true,
      replayed: outcome.replayed,
      vehicle: outcome.vehicle,
      message: outcome.replayed
        ? `Vehicle ${vehicleId} is already archived.`
        : `Vehicle ${vehicleId} successfully archived.`
    });
  } catch (error) {
    if (error instanceof FleetArchiveError) return res.status(error.status).json({ error: error.message });
    console.error('[fleet-archive] archive failed atomically', error);
    return res.status(500).json({ error: 'Vehicle archive failed atomically.' });
  }
}
