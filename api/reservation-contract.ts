import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { createUnsignedDraftFromReservation, ReservationContractDraftError } from '../src/server/reservationContractDraft.js';
import { issueNextNumber } from '../src/server/idGenerator.js';
import { appendToAuditChain } from '../src/server/auditIntegrity.js';
import { globalStore } from '../src/server/dataStore.js';

const ALLOWED_ROLES = ['ceo', 'admin', 'operations', 'sales'];

async function verifiedActor(req: Request, res: Response) {
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
    if (!data || !ALLOWED_ROLES.includes(data.role)) {
      res.status(403).json({ error: 'You do not have permission to create a contract from this reservation.' });
      return null;
    }
    return { uid: decoded.uid, name: data.name || decoded.name || decoded.uid, role: data.role };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}

async function audit(actor: { uid: string; name: string; role: string }, contract: any, reservation: any) {
  try {
    const id = await issueNextNumber('AuditLog');
    const timestamp = new Date().toISOString();
    const base = {
      id,
      timestamp,
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'Contract',
      entityId: contract.id,
      action: 'create',
      newValue: `Created unsigned draft contract ${contract.id} from reservation ${reservation.id} (${Number(contract.grandTotal || 0).toLocaleString()} AED)`,
      reason: 'Reservation converted to a non-operative rental agreement draft; signing and handover remain separate gated transitions'
    };
    const chain = await appendToAuditChain(base);
    const entry = { ...base, ...chain };
    await admin.firestore().collection('audit_logs').doc(id).set(entry);
    globalStore.auditLogs.unshift(entry as any);
  } catch (error) {
    console.error('[reservation-contract] draft created but audit write failed', error);
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const actor = await verifiedActor(req, res);
  if (!actor) return;
  const reservationId = String(req.query.reservationId || '').trim();
  if (!reservationId) return res.status(400).json({ error: 'reservationId is required.' });

  try {
    const outcome = await createUnsignedDraftFromReservation(reservationId);
    if (!outcome.replayed) {
      globalStore.contracts.unshift(outcome.contract as any);
      const index = globalStore.reservations.findIndex(r => r.id === reservationId);
      if (index !== -1) globalStore.reservations[index] = outcome.reservation;
      await audit(actor, outcome.contract, outcome.reservation);
    }
    return res.status(outcome.replayed ? 200 : 201).json({ success: true, ...outcome });
  } catch (error) {
    if (error instanceof ReservationContractDraftError) return res.status(error.status).json({ error: error.message });
    console.error('[reservation-contract] conversion failed', error);
    return res.status(500).json({ error: 'Reservation-to-contract conversion failed.' });
  }
}
