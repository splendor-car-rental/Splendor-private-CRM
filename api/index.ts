import type { Request, Response } from 'express';
import admin from 'firebase-admin';
// Vercel must bundle the TypeScript source so the Express app is available
// inside the serverless function instead of relying on a runtime /server.js
// file that is not deployed next to this entrypoint.
// @ts-ignore TS5097 -- intentional Vercel bundling entrypoint.
import app from '../server.ts';
import { assignPlateAtomically } from '../src/server/atomicPlateAssignment.js';
import {
  issueAndRenderCorporateDocument,
  getCorporateDocumentMeta,
  type CorporateDocumentInput,
  type CorporateDocumentKind
} from '../src/server/corporateDocumentEngine.js';

const CORPORATE_DOCUMENT_KINDS: CorporateDocumentKind[] = [
  'lpo', 'credit_note', 'fines_notice', 'debit_note', 'contract_extension',
  'payment_receipt', 'tax_invoice', 'simplified_tax_invoice', 'official_letter',
  'vehicle_record_card', 'vehicle_exit_permit'
];

const CORPORATE_DOCUMENT_ROLES: Record<CorporateDocumentKind, string[]> = {
  lpo: ['ceo', 'admin', 'operations', 'fleet', 'finance'],
  credit_note: ['ceo', 'admin', 'finance'],
  fines_notice: ['ceo', 'admin', 'operations', 'finance'],
  debit_note: ['ceo', 'admin', 'finance'],
  contract_extension: ['ceo', 'admin', 'operations', 'sales'],
  payment_receipt: ['ceo', 'admin', 'finance'],
  tax_invoice: ['ceo', 'admin', 'finance'],
  simplified_tax_invoice: ['ceo', 'admin', 'finance'],
  official_letter: ['ceo', 'admin', 'operations', 'sales', 'finance', 'fleet'],
  vehicle_record_card: ['ceo', 'admin', 'operations', 'fleet'],
  vehicle_exit_permit: ['ceo', 'admin', 'operations', 'fleet']
};

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

async function handleCorporateDocuments(req: Request, res: Response) {
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      immutableLetterhead: true,
      kinds: CORPORATE_DOCUMENT_KINDS.map(kind => ({ kind, ...getCorporateDocumentMeta(kind) }))
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = (req.body || {}) as CorporateDocumentInput;
  if (!body.kind || !CORPORATE_DOCUMENT_KINDS.includes(body.kind)) {
    return res.status(400).json({ error: 'Unsupported corporate document type.' });
  }

  const actor = await getVerifiedStaff(req, res, CORPORATE_DOCUMENT_ROLES[body.kind]);
  if (!actor) return;

  try {
    // Never trust a serial supplied by the browser. The engine issues the
    // next number atomically from Firestore and returns the authoritative ID.
    const { serial: _ignoredSerial, ...safeInput } = body as any;
    const issued = await issueAndRenderCorporateDocument(safeInput);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${issued.fileName}"`);
    res.setHeader('X-Document-Serial', issued.serial);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(issued.pdf);
  } catch (error) {
    console.error('[corporate-documents] generation failed:', error);
    return res.status(500).json({ error: 'Document generation failed. No document was issued.' });
  }
}

async function handler(req: Request, res: Response) {
  if (req.path === '/api/corporate-documents') {
    return handleCorporateDocuments(req, res);
  }

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
