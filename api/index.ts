import type { Request, Response } from 'express';
import { getVerifiedActiveStaff } from '../src/server/activeStaffAuth.js';
import { assignPlateAtomically } from '../src/server/atomicPlateAssignment.js';
import { handleAccountingRequest, handleSafeCustomerPaymentRequest, handleSafeLegacyDepositMutation } from '../src/server/accountingApi.js';
import { handleSafeManualDepositCreate } from '../src/server/safeManualDepositCreate.js';
import { recordAccountingAudit } from '../src/server/accountingAudit.js';
import {
  issueAndRenderCorporateDocument,
  getCorporateDocumentMeta,
  type CorporateDocumentInput,
  type CorporateDocumentKind
} from '../src/server/corporateDocumentEngine.js';

type ExpressApp = (req: Request, res: Response) => unknown;
let appPromise: Promise<ExpressApp> | null = null;

/** Import the legacy Express surface only when a request actually needs it. */
async function getExpressApp(): Promise<ExpressApp> {
  if (!appPromise) {
    appPromise = import('../server.js').then(module => module.default as ExpressApp).catch(error => {
      appPromise = null;
      throw error;
    });
  }
  return appPromise;
}

const CORPORATE_DOCUMENT_KINDS: CorporateDocumentKind[] = [
  'lpo', 'credit_note', 'fines_notice', 'debit_note', 'contract_extension',
  'payment_receipt', 'tax_invoice', 'simplified_tax_invoice', 'official_letter',
  'vehicle_record_card', 'vehicle_exit_permit', 'account_statement', 'quotation',
  'payment_demand_notice', 'fleet_document_renewal_schedule', 'damage_claim_notice'
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
  vehicle_exit_permit: ['ceo', 'admin', 'operations', 'fleet'],
  account_statement: ['ceo', 'admin', 'finance', 'operations', 'sales'],
  quotation: ['ceo', 'admin', 'sales', 'operations'],
  payment_demand_notice: ['ceo', 'admin', 'finance'],
  fleet_document_renewal_schedule: ['ceo', 'admin', 'fleet', 'operations'],
  damage_claim_notice: ['ceo', 'admin', 'operations', 'finance']
};

async function verifiedStaff(req: Request, res: Response, roles: readonly string[]) {
  return getVerifiedActiveStaff(req, res, roles);
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
  const actor = await verifiedStaff(req, res, CORPORATE_DOCUMENT_ROLES[body.kind]);
  if (!actor) return;

  try {
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
  if (req.path === '/api/corporate-documents') return handleCorporateDocuments(req, res);

  if (req.path === '/api/accounting' || req.path.startsWith('/api/accounting/')) {
    const actor = await verifiedStaff(req, res, ['ceo', 'admin', 'finance']);
    if (!actor) return;
    return handleAccountingRequest(req, res, actor);
  }

  if (req.path === '/api/deposits' && req.method === 'POST') {
    const actor = await verifiedStaff(req, res, ['ceo', 'admin', 'finance', 'operations', 'sales']);
    if (!actor) return;
    return handleSafeManualDepositCreate(req, res, actor, recordAccountingAudit);
  }

  const depositMutationMatch = req.path.match(/^\/api\/deposits\/([^/]+)\/(apply|refund)$/);
  if (depositMutationMatch && req.method === 'POST') {
    const actor = await verifiedStaff(req, res, ['ceo', 'admin', 'finance']);
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
    const actor = await verifiedStaff(req, res, ['ceo', 'admin', 'finance']);
    if (!actor) return;
    return handleSafeCustomerPaymentRequest(req, res, actor);
  }

  if (req.path === '/api/tests/run-all') {
    const actor = await verifiedStaff(req, res, ['ceo', 'admin']);
    if (!actor) return;
    const app = await getExpressApp();
    return app(req, res);
  }

  const plateMatch = req.path.match(/^\/api\/fleet\/([^/]+)\/assign-plate$/);
  if (plateMatch && req.method === 'POST') {
    const actor = await verifiedStaff(req, res, ['ceo', 'admin', 'fleet']);
    if (!actor) return;
    const body = req.body || {};
    if (!body.plateNumber || !body.plateCity) return res.status(400).json({ error: 'Plate number and city are required.' });

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

  const app = await getExpressApp();
  return app(req, res);
}

export default handler;
