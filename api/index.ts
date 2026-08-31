import type { Request, Response } from 'express';
import admin from 'firebase-admin';
// Vercel must bundle the TypeScript source so the Express app is available
// inside the serverless function instead of relying on a runtime /server.js
// file that is not deployed next to this entrypoint.
// @ts-ignore TS5097 -- intentional Vercel bundling entrypoint.
import app from '../server.ts';
import { assignPlateAtomically } from '../src/server/atomicPlateAssignment.js';

async function getVerifiedStaff(req: Request, res: Response, allowedRoles: string[]) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token || admin.apps.length === 0) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
    const data = profile.exists ? (profile.data() as any) : null;
    if (!data || !allowedRoles.includes(data.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return null;
    }
    return { uid: decoded.uid, name: data.name || decoded.name || decoded.uid, role: data.role };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}

/**
 * Vercel serverless boundary.
 *
 * The Express app remains the single business/API implementation. This
 * boundary adds two defense-in-depth controls for historically exempt or
 * multi-write-sensitive routes:
 *  1. the internal test runner is CEO/Admin only;
 *  2. production plate assignment uses the atomic Firestore transaction
 *     implementation and the verified token identity, not client-supplied
 *     actor fields.
 */
async function handler(req: Request, res: Response) {
  if (req.path === '/api/tests/run-all') {
    const actor = await getVerifiedStaff(req, res, ['ceo', 'admin']);
    if (!actor) return;
    return app(req, res);
  }

  const plateMatch = req.path.match(/^\/api\/fleet\/([^/]+)\/assign-plate$/);
  if (plateMatch && req.method === 'POST') {
    const actor = await getVerifiedStaff(req, res, ['ceo', 'admin', 'fleet']);
    if (!actor) return;

    const body = req.body || {};
    if (!body.plateNumber || !body.plateCity) {
      return res.status(400).json({ error: 'Plate number and city are required.' });
    }

    const result = await assignPlateAtomically({
      vehicleId: decodeURIComponent(plateMatch[1]),
      newPlateNumber: String(body.plateNumber).trim(),
      newPlateCity: String(body.plateCity).trim(),
      reason: String(body.reason || 'Plate updated by fleet operations').trim(),
      assignedBy: actor.uid,
      assignedByName: actor.name,
      effectiveDate: body.effectiveDate
    });

    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json({ success: true, vehicle: result.vehicle });
  }

  return app(req, res);
}

export default handler;
