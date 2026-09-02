import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import app from '../server.js';
import { assignPlateAtomically } from '../src/server/atomicPlateAssignment.js';
import { handleAccountingRequest, handleSafeCustomerPaymentRequest, handleSafeLegacyDepositMutation } from '../src/server/accountingApi.js';
import { createManualDepositAtomic } from '../src/server/safeManualDepositCreate.js';
import { recordAccountingAudit } from '../src/server/accountingAudit.js';
import {
  issueAndRenderCorporateDocument,
  getCorporateDocumentMeta,
  type CorporateDocumentInput,
  type CorporateDocumentKind
} from '../src/server/corporateDocumentEngine.js';
import {
  DocumentIssuanceInProgressError,
  issueContextualDocument,
  previewContextualDocument,
  type ContextualDocumentSource
} from '../src/server/contextualDocumentService.js';

const CORPORATE_DOCUMENT_KINDS: CorporateDocumentKind[] = [
  'rental_contract', 'lpo', 'credit_note', 'fines_notice', 'debit_note',
  'payment_demand', 'damage_claim', 'contract_extension', 'payment_receipt',
  'tax_invoice', 'simplified_tax_invoice', 'official_letter', 'vehicle_record_card',
  'vehicle_exit_permit', 'fleet_document_renewal_schedule', 'account_statement', 'quotation'
];

const CORPORATE_DOCUMENT_ROLES: Record<CorporateDocumentKind, string[]> = {
  rental_contract: ['ceo', 'admin', 'operations', 'sales'],
  lpo: ['ceo', 'admin', 'operations', 'fleet', 'finance'],
  credit_note: ['ceo', 'admin', 'finance'],
  fines_notice: ['ceo', 'admin', 'operations', 'finance'],
  debit_note: ['ceo', 'admin', 'finance'],
  payment_demand: ['ceo', 'admin', 'finance', 'operations'],
  damage_claim: ['ceo', 'admin', 'operations', 'fleet', 'finance'],
  contract_extension: ['ceo', 'admin', 'operations', 'sales'],
  payment_receipt: ['ceo', 'admin', 'finance'],
  tax_invoice: ['ceo', 'admin', 'finance'],
  simplified_tax_invoice: ['ceo', 'admin', 'finance'],
  official_letter: ['ceo', 'admin', 'operations', 'sales', 'finance', 'fleet'],
  vehicle_record_card: ['ceo', 'admin', 'operations', 'fleet'],
  vehicle_exit_permit: ['ceo', 'admin', 'operations', 'fleet'],
  fleet_document_renewal_schedule: ['ceo', 'admin', 'operations', 'fleet'],
  account_statement: ['ceo', 'admin', 'finance', 'operations', 'sales'],
  quotation: ['ceo', 'admin', 'sales', 'operations']
};

const ALL_STAFF_ROLES = ['ceo', 'admin', 'operations', 'sales', 'finance', 'fleet'];
const ISSUED_DOCUMENT_PREFIX = 'issued-documents/';

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

function idempotencyKeyFromRequest(req: Request): string | undefined {
  const value = req.headers['idempotency-key'];
  return Array.isArray(value) ? value[0] : value;
}

function sendCorporatePdf(res: Response, issued: { pdf: Buffer; fileName: string; serial: string; archived?: boolean; archiveId?: string }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${issued.fileName}"`);
  res.setHeader('X-Document-Serial', issued.serial);
  res.setHeader('X-Document-Archived', issued.archived ? 'true' : 'false');
  if (issued.archiveId) res.setHeader('X-Document-Archive-Id', issued.archiveId);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(issued.pdf);
}

async function handleContextualCorporateDocument(req: Request, res: Response, mode: 'preview' | 'issue') {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const body = req.body || {};
  const kind = body.kind as CorporateDocumentKind;
  const source = body.source as ContextualDocumentSource;
  if (!kind || !CORPORATE_DOCUMENT_KINDS.includes(kind)) return res.status(400).json({ error: 'Unsupported corporate document type.' });
  if (!source?.type || !source?.id) return res.status(400).json({ error: 'A server-bound document source is required.' });

  const actor = await getVerifiedStaff(req, res, CORPORATE_DOCUMENT_ROLES[kind]);
  if (!actor) return;
  try {
    const result = mode === 'preview'
      ? await previewContextualDocument(kind, source)
      : await issueContextualDocument(kind, source, actor);
    return sendCorporatePdf(res, result);
  } catch (error) {
    console.error(`[corporate-documents:${mode}] generation failed`);
    const message = error instanceof Error ? error.message : 'Document generation failed.';
    if (error instanceof DocumentIssuanceInProgressError) {
      res.setHeader('Retry-After', '2');
      return res.status(409).json({ error: message });
    }
    const lower = message.toLowerCase();
    const status = lower.includes('not found') ? 404
      : lower.includes('requires an approved purchase order') ? 409
      : lower.includes('must be bound') || lower.includes('required') || lower.includes('does not match') ? 400
      : 500;
    return res.status(status).json({ error: message });
  }
}

async function handleCorporateDocuments(req: Request, res: Response) {
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      immutableLetterhead: true,
      sourceBoundPreview: true,
      immutableIssuedArchive: true,
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
  if (body.kind === 'lpo') {
    return res.status(400).json({ error: 'LPO cannot be issued from browser-supplied document values. Use the source-bound purchase-order preview/issue workflow.' });
  }

  const actor = await getVerifiedStaff(req, res, CORPORATE_DOCUMENT_ROLES[body.kind]);
  if (!actor) return;

  try {
    const { serial: _ignoredSerial, ...safeInput } = body as any;
    const issued = await issueAndRenderCorporateDocument(safeInput);
    return sendCorporatePdf(res, issued);
  } catch {
    console.error('[corporate-documents] generation failed');
    return res.status(500).json({ error: 'Document generation failed. No document was issued.' });
  }
}

async function handleIssuedDocumentFile(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const storagePath = String(req.query.path || '');
  if (!storagePath.startsWith(ISSUED_DOCUMENT_PREFIX) || storagePath.includes('..')) {
    return res.status(400).json({ error: 'Invalid or missing issued-document path.' });
  }

  const actor = await getVerifiedStaff(req, res, ALL_STAFF_ROLES);
  if (!actor) return;

  try {
    const snapshot = await admin.firestore()
      .collection('issued_documents')
      .where('storagePath', '==', storagePath)
      .limit(1)
      .get();
    if (snapshot.empty) return res.status(404).json({ error: 'Issued document not found.' });

    const data = snapshot.docs[0].data() as any;
    const kind = data.kind as CorporateDocumentKind;
    if (data.status !== 'issued' || !kind || !CORPORATE_DOCUMENT_KINDS.includes(kind)) {
      return res.status(404).json({ error: 'Issued document not found.' });
    }
    if (!CORPORATE_DOCUMENT_ROLES[kind].includes(actor.role)) {
      return res.status(403).json({ error: 'You do not have permission to read this document.' });
    }

    const [pdf] = await admin.storage().bucket().file(storagePath).download();
    const fileName = String(data.fileName || 'Splendor-document.pdf').replace(/["\r\n]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.setHeader('X-Document-Serial', String(data.serial || ''));
    res.setHeader('X-Document-Archive-Id', snapshot.docs[0].id);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(pdf);
  } catch {
    console.error('[issued-documents:file] read failed');
    return res.status(500).json({ error: 'Issued document could not be read.' });
  }
}

async function handler(req: Request, res: Response) {
  if (req.path === '/api/corporate-documents/preview') {
    return handleContextualCorporateDocument(req, res, 'preview');
  }
  if (req.path === '/api/corporate-documents/issue') {
    return handleContextualCorporateDocument(req, res, 'issue');
  }
  if (req.path === '/api/corporate-documents') {
    return handleCorporateDocuments(req, res);
  }
  if (req.path === '/api/documents/file' && String(req.query.path || '').startsWith(ISSUED_DOCUMENT_PREFIX)) {
    return handleIssuedDocumentFile(req, res);
  }

  if (req.path === '/api/accounting' || req.path.startsWith('/api/accounting/')) {
    const actor = await getVerifiedStaff(req, res, ['ceo', 'admin', 'finance']);
    if (!actor) return;
    return handleAccountingRequest(req, res, actor);
  }

  if (req.path === '/api/deposits' && req.method === 'POST') {
    const actor = await getVerifiedStaff(req, res, ['ceo', 'admin', 'finance', 'operations', 'sales']);
    if (!actor) return;
    try {
      const body = req.body || {};
      if (body.holdType === 'gateway_authorization') {
        return res.status(400).json({ error: 'Gateway authorization holds must be created by the signed payment-gateway lifecycle.' });
      }
      const result = await createManualDepositAtomic({
        customerId: String(body.customerId || ''),
        customerName: body.customerName,
        contractId: body.contractId,
        reservationId: body.reservationId,
        amount: Number(body.amount),
        paymentMethod: body.paymentMethod,
        settlementAccountCode: body.settlementAccountCode,
        holdReleaseDueDate: body.holdReleaseDueDate,
        notes: body.notes,
        transactionRef: body.transactionRef
      }, actor, idempotencyKeyFromRequest(req), recordAccountingAudit);
      return res.status(result.replayed ? 200 : 201).json(result.deposit);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Security deposit request failed.';
      const status = message.toLowerCase().includes('idempotency-key') || message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('closed') ? 409 : 400;
      return res.status(status).json({ error: message });
    }
  }

  const depositMutationMatch = req.path.match(/^\/api\/deposits\/([^/]+)\/(apply|refund)$/);
  if (depositMutationMatch && req.method === 'POST') {
    const actor = await getVerifiedStaff(req, res, ['ceo', 'admin', 'finance']);
    if (!actor) return;
    return handleSafeLegacyDepositMutation(
      req,
      res,
      actor,
      decodeURIComponent(depositMutationMatch[1]),
      depositMutationMatch[2] as 'apply' | 'refund'
    );
  }

  if (req.path === '/api/payments' && req.method === 'POST') {
    const actor = await getVerifiedStaff(req, res, ['ceo', 'admin', 'finance']);
    if (!actor) return;
    return handleSafeCustomerPaymentRequest(req, res, actor);
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
