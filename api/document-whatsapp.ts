import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import {
  sendIssuedDocumentToCustomerWhatsApp,
  IssuedDocumentWhatsAppError
} from '../src/server/issuedDocumentWhatsApp.js';
import type { CorporateDocumentKind } from '../src/server/corporateDocumentEngine.js';

const ALL_STAFF_ROLES = ['ceo', 'admin', 'operations', 'sales', 'finance', 'fleet'];
const DOCUMENT_SEND_ROLES: Partial<Record<CorporateDocumentKind, string[]>> = {
  rental_contract: ['ceo', 'admin', 'operations', 'sales'],
  contract_extension: ['ceo', 'admin', 'operations', 'sales'],
  payment_receipt: ['ceo', 'admin', 'finance'],
  tax_invoice: ['ceo', 'admin', 'finance'],
  simplified_tax_invoice: ['ceo', 'admin', 'finance'],
  account_statement: ['ceo', 'admin', 'finance', 'operations', 'sales'],
  payment_demand: ['ceo', 'admin', 'finance', 'operations'],
  credit_note: ['ceo', 'admin', 'finance'],
  debit_note: ['ceo', 'admin', 'finance']
};

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
    if (!data || !ALL_STAFF_ROLES.includes(data.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return null;
    }
    return { uid: decoded.uid, name: data.name || decoded.name || decoded.uid, role: data.role };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const actor = await verifiedActor(req, res);
  if (!actor) return;

  const archiveId = String(req.query.archiveId || '').trim();
  if (!archiveId) return res.status(400).json({ error: 'Issued document archive id is required.' });

  // Authorization is checked against the immutable archive's own kind, not
  // a browser-supplied document type.
  const archiveSnap = await admin.firestore().collection('issued_documents').doc(archiveId).get();
  if (!archiveSnap.exists) return res.status(404).json({ error: 'Issued document not found.' });
  const archive = archiveSnap.data() as any;
  const kind = archive?.kind as CorporateDocumentKind;
  const allowedRoles = DOCUMENT_SEND_ROLES[kind];
  if (!allowedRoles || !allowedRoles.includes(actor.role)) {
    return res.status(403).json({ error: 'This document type is not eligible for customer WhatsApp delivery, or your role cannot send it.' });
  }

  try {
    const result = await sendIssuedDocumentToCustomerWhatsApp(archiveId, actor);
    if (result.status === 'not_configured') {
      return res.status(503).json({ success: false, status: result.status, error: result.error });
    }
    if (result.status === 'failed') {
      return res.status(502).json({ success: false, status: result.status, error: result.error });
    }
    return res.status(200).json({
      success: true,
      status: 'sent',
      archiveId: result.archiveId,
      serial: result.serial,
      kind: result.kind,
      customerId: result.customerId,
      customerName: result.customerName
    });
  } catch (error) {
    if (error instanceof IssuedDocumentWhatsAppError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[document-whatsapp] issued-document delivery failed', error);
    return res.status(500).json({ error: 'Issued document delivery failed.' });
  }
}
