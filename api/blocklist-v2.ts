import type { Request, Response } from 'express';
import admin from 'firebase-admin';
// Importing the application initializes the same Firebase Admin boundary
// used by the main API function; no second credential/config path exists.
import '../server.js';
import {
  createBlocklistEntry,
  listBlocklistEntries,
  BlocklistError,
  type BlocklistIdentifier,
  type BlocklistProfile,
  type BlocklistSubjectType
} from '../src/server/blocklist.js';
import { recordAccountingAudit } from '../src/server/accountingAudit.js';

const READ_ROLES = ['ceo', 'admin', 'operations', 'sales', 'finance', 'fleet'];
const WRITE_ROLES = ['ceo', 'admin', 'operations'];

async function verifiedActor(req: Request, res: Response, allowedRoles: string[]) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token || admin.apps.length === 0) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
    const data = profile.exists ? profile.data() as any : null;
    if (!data || !allowedRoles.includes(String(data.role))) {
      res.status(403).json({ error: 'You do not have permission to manage the security blocklist.' });
      return null;
    }
    return { uid: decoded.uid, name: data.name || decoded.name || decoded.uid, role: data.role };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}

export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const actor = await verifiedActor(req, res, READ_ROLES);
    if (!actor) return;
    try {
      return res.status(200).json(await listBlocklistEntries());
    } catch (error) {
      console.error('[blocklist-v2] list failed', error);
      return res.status(500).json({ error: 'Blocklist could not be loaded.' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const actor = await verifiedActor(req, res, WRITE_ROLES);
  if (!actor) return;
  const body = req.body || {};

  try {
    const entry = await createBlocklistEntry({
      // Keep the legacy primary identifier fields for backward-compatible
      // customer/booking checks while persisting every supplied identifier.
      identifierType: body.identifierType,
      identifierValue: body.identifierValue,
      identifierCountry: body.identifierCountry,
      subjectType: body.subjectType as BlocklistSubjectType | undefined,
      identifiers: Array.isArray(body.identifiers) ? body.identifiers as BlocklistIdentifier[] : undefined,
      profile: body.profile && typeof body.profile === 'object' ? body.profile as BlocklistProfile : undefined,
      customerName: body.customerName,
      tier: body.tier,
      reason: body.reason,
      conditionalNote: body.conditionalNote,
      createdBy: actor.uid,
      createdByName: actor.name,
      createdByRole: actor.role
    }, recordAccountingAudit);
    return res.status(201).json(entry);
  } catch (error) {
    if (error instanceof BlocklistError) return res.status(400).json({ error: error.message });
    console.error('[blocklist-v2] create failed', error);
    return res.status(500).json({ error: 'The block could not be saved. No success has been reported.' });
  }
}
