import type { Request, Response } from 'express';
import admin from 'firebase-admin';
// Importing the existing server initializes the same Firebase Admin boundary
// used by the rest of the CRM. Vercel does not start a long-lived listener.
// @ts-ignore TS5097 -- intentional Vercel serverless bundling entrypoint.
import '../server.ts';
import {
  issueAndRenderCorporateDocument,
  getCorporateDocumentMeta,
  type CorporateDocumentInput,
  type CorporateDocumentKind
} from '../src/server/corporateDocumentEngine.js';

const KINDS: CorporateDocumentKind[] = [
  'lpo', 'credit_note', 'fines_notice', 'debit_note', 'contract_extension',
  'payment_receipt', 'tax_invoice', 'simplified_tax_invoice', 'official_letter',
  'vehicle_record_card', 'vehicle_exit_permit'
];

const ROLE_MATRIX: Record<CorporateDocumentKind, string[]> = {
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

async function verifiedStaff(req: Request, res: Response) {
  if (admin.apps.length === 0) {
    res.status(503).json({ error: 'Server authentication is not configured.' });
    return null;
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const snap = await admin.firestore().collection('users').doc(decoded.uid).get();
    const profile = snap.exists ? (snap.data() as any) : null;
    if (!profile?.role) {
      res.status(403).json({ error: 'Staff profile not found.' });
      return null;
    }
    return { uid: decoded.uid, name: profile.name || decoded.name || decoded.uid, role: String(profile.role) };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      immutableLetterhead: true,
      kinds: KINDS.map(kind => ({ kind, ...getCorporateDocumentMeta(kind) }))
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const actor = await verifiedStaff(req, res);
  if (!actor) return;

  const body = (req.body || {}) as CorporateDocumentInput;
  if (!body.kind || !KINDS.includes(body.kind)) {
    return res.status(400).json({ error: 'Unsupported corporate document type.' });
  }
  if (!ROLE_MATRIX[body.kind].includes(actor.role)) {
    return res.status(403).json({ error: 'You do not have permission to generate this document.' });
  }

  try {
    // Never accept a client-supplied serial. issueAndRenderCorporateDocument
    // always receives a clean copy without `serial`, forcing the durable
    // Firestore-backed numbering transaction to be the source of truth.
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
