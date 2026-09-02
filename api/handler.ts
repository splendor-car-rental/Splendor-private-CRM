import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import app from '../server.js';
import { assignPlateAtomically } from '../src/server/atomicPlateAssignment.js';
import { handleAccountingRequest, handleSafeCustomerPaymentRequest, handleSafeLegacyDepositMutation } from '../src/server/accountingApi.js';
import { createManualDepositAtomic } from '../src/server/safeManualDepositCreate.js';
import { recordAccountingAudit } from '../src/server/accountingAudit.js';
import { issueNextNumber } from '../src/server/idGenerator.js';
import { appendToAuditChain } from '../src/server/auditIntegrity.js';
import { globalStore } from '../src/server/dataStore.js';
import {
  beginContractReturn,
  settleContractReturn,
  ContractReturnWorkflowError
} from '../src/server/contractReturnWorkflow.js';
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
const HANDOVER_ROLES = ['ceo', 'admin', 'operations'];
const RETURN_INTAKE_ROLES = ['ceo', 'admin', 'operations'];
const RETURN_SETTLEMENT_ROLES = ['ceo', 'admin', 'finance'];
const HANDOVER_KYC_REQUIRED: Record<string, string[]> = {
  UAE_RESIDENT: ['EMIRATES_ID_FRONT', 'EMIRATES_ID_BACK', 'DRIVING_LICENSE_FRONT', 'DRIVING_LICENSE_BACK'],
  GCC_NATIONAL: ['PASSPORT', 'DRIVING_LICENSE_FRONT', 'DRIVING_LICENSE_BACK'],
  TOURIST: ['PASSPORT', 'VISA_ENTRY_STAMP', 'DRIVING_LICENSE_FRONT']
};

class HandoverGateError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HandoverGateError';
    this.status = status;
  }
}

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

function calculateAge(dobIso: string, referenceIso: string): number {
  const dob = new Date(dobIso);
  const ref = new Date(referenceIso);
  if (!Number.isFinite(dob.getTime()) || !Number.isFinite(ref.getTime())) return 0;
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = ref.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && ref.getUTCDate() < dob.getUTCDate())) age -= 1;
  return Math.max(0, age);
}

function validateKycForHandover(customer: any, contract: any, now: string) {
  if (!customer || customer.status === 'blocklisted') {
    throw new HandoverGateError(409, 'Handover blocked: customer is missing or blocklisted.');
  }

  const profile = customer.kycProfile;
  if (!profile || profile.status !== 'VERIFIED') {
    throw new HandoverGateError(409, 'Handover blocked: customer KYC is not VERIFIED.');
  }

  const dob = String(profile.dateOfBirth || customer.dateOfBirth || '').trim();
  const legacySyntheticDob = !customer.dateOfBirth && dob === '1995-01-01';
  if (!profile.isAgeVerified || !dob || legacySyntheticDob) {
    throw new HandoverGateError(409, 'Handover blocked: customer date of birth/age has not been genuinely verified.');
  }

  const age = calculateAge(dob, contract.startDateTime || now);
  if (age < 21) {
    throw new HandoverGateError(409, `Handover blocked: customer age (${age}) is below the minimum rental age.`);
  }

  const category = String(profile.customerCategory || 'TOURIST');
  const required = HANDOVER_KYC_REQUIRED[category] || HANDOVER_KYC_REQUIRED.TOURIST;
  const documents = Array.isArray(profile.documents) ? profile.documents : [];
  const targetTime = new Date(contract.endDateTime || contract.startDateTime || now).getTime();

  for (const requiredCategory of required) {
    const accepted = documents.find((doc: any) => doc?.category === requiredCategory && doc?.status === 'ACCEPTED');
    if (!accepted) {
      throw new HandoverGateError(409, `Handover blocked: required KYC document ${requiredCategory} is not approved.`);
    }
    if (accepted.expiryDate) {
      const expiryTime = new Date(accepted.expiryDate).getTime();
      if (!Number.isFinite(expiryTime) || expiryTime < targetTime) {
        throw new HandoverGateError(409, `Handover blocked: required KYC document ${requiredCategory} expires before the rental completes.`);
      }
    }
  }
}

function validateHandoverEvidence(handoverData: any) {
  const startMileage = Number(handoverData?.startMileage);
  const fuelLevelPercent = Number(handoverData?.fuelLevelPercent);
  const customerSignatureUrl = String(handoverData?.customerSignatureUrl || '').trim();
  const employeeSignatureUrl = String(handoverData?.employeeSignatureUrl || '').trim();

  if (!Number.isFinite(startMileage) || startMileage < 0) {
    throw new HandoverGateError(400, 'A valid non-negative startMileage is required for handover.');
  }
  if (!Number.isFinite(fuelLevelPercent) || fuelLevelPercent < 0 || fuelLevelPercent > 100) {
    throw new HandoverGateError(400, 'fuelLevelPercent must be between 0 and 100.');
  }
  if (!customerSignatureUrl || !employeeSignatureUrl) {
    throw new HandoverGateError(400, 'Both customer and employee handover signatures are required.');
  }

  return { startMileage, fuelLevelPercent, customerSignatureUrl, employeeSignatureUrl };
}

async function persistContractLifecycleAudit(
  actor: { uid: string; name: string; role: string },
  contractId: string,
  previousValue: string,
  newValue: string,
  reason: string
) {
  try {
    const id = await issueNextNumber('AuditLog');
    const timestamp = new Date().toISOString();
    const baseEntry = {
      id,
      timestamp,
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'Contract',
      entityId: contractId,
      action: 'status_change',
      previousValue,
      newValue,
      reason
    };
    const chain = await appendToAuditChain(baseEntry);
    const entry = { ...baseEntry, ...chain };
    await admin.firestore().collection('audit_logs').doc(id).set(entry);
    globalStore.auditLogs.unshift(entry as any);
  } catch (error) {
    console.error('[contract-lifecycle] lifecycle mutation succeeded but audit persistence failed', error);
  }
}

async function handleProductionContractHandover(req: Request, res: Response, contractId: string) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const actor = await getVerifiedStaff(req, res, HANDOVER_ROLES);
  if (!actor) return;

  let evidence: ReturnType<typeof validateHandoverEvidence>;
  try {
    evidence = validateHandoverEvidence((req.body || {}).handoverData || {});
  } catch (error) {
    if (error instanceof HandoverGateError) return res.status(error.status).json({ error: error.message });
    throw error;
  }

  const db = admin.firestore();
  const now = new Date().toISOString();
  let outcome: { contract: any; vehicle: any; customer: any };

  try {
    outcome = await db.runTransaction(async tx => {
      const contractRef = db.collection('contracts').doc(contractId);
      const contractSnap = await tx.get(contractRef);
      if (!contractSnap.exists) throw new HandoverGateError(404, 'Contract not found.');
      const contract = { id: contractSnap.id, ...(contractSnap.data() as any) };

      if (contract.status !== 'signed') {
        throw new HandoverGateError(409, `Handover requires a signed contract; current status is ${contract.status || 'unknown'}.`);
      }
      if (contract.termsAccepted !== true) {
        throw new HandoverGateError(409, 'Handover blocked: contract terms have not been explicitly accepted.');
      }
      if (!contract.customerId || !contract.vehicleId) {
        throw new HandoverGateError(409, 'Handover blocked: contract is missing its customer or vehicle binding.');
      }

      const customerRef = db.collection('customers').doc(contract.customerId);
      const vehicleRef = db.collection('vehicles').doc(contract.vehicleId);
      const depositQuery = db.collection('deposits').where('contractId', '==', contract.id);
      const vehicleContractsQuery = db.collection('contracts').where('vehicleId', '==', contract.vehicleId);

      const [customerSnap, vehicleSnap, depositSnap, vehicleContractsSnap] = await Promise.all([
        tx.get(customerRef),
        tx.get(vehicleRef),
        tx.get(depositQuery),
        tx.get(vehicleContractsQuery)
      ]);

      if (!customerSnap.exists) throw new HandoverGateError(409, 'Handover blocked: customer record not found.');
      if (!vehicleSnap.exists) throw new HandoverGateError(409, 'Handover blocked: vehicle record not found.');
      const customer = { id: customerSnap.id, ...(customerSnap.data() as any) };
      const vehicle = { id: vehicleSnap.id, ...(vehicleSnap.data() as any) };

      validateKycForHandover(customer, contract, now);

      const requiredDeposit = Math.max(0, Number(contract.depositAmount || 0));
      const heldDepositBalance = depositSnap.docs.reduce((sum, doc) => {
        const deposit = doc.data() as any;
        if (!['held', 'collected', 'partially_refunded'].includes(String(deposit.status || ''))) return sum;
        return sum + Math.max(0, Number(deposit.balance ?? deposit.amount ?? 0));
      }, 0);
      if (heldDepositBalance + 0.001 < requiredDeposit) {
        throw new HandoverGateError(409, `Handover blocked: verified held deposit is ${heldDepositBalance} AED but ${requiredDeposit} AED is required.`);
      }

      if (vehicle.lifecycleStatus && vehicle.lifecycleStatus !== 'ACTIVE') {
        throw new HandoverGateError(409, `Handover blocked: vehicle lifecycle status is ${vehicle.lifecycleStatus}.`);
      }
      if (['maintenance', 'unavailable'].includes(String(vehicle.status || ''))) {
        throw new HandoverGateError(409, `Handover blocked: vehicle is ${vehicle.status}.`);
      }
      if (vehicle.status === 'rented' && vehicle.currentContractId !== contract.id) {
        throw new HandoverGateError(409, 'Handover blocked: vehicle is already rented under another contract.');
      }

      const start = new Date(contract.startDateTime).getTime();
      const end = new Date(contract.endDateTime).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        throw new HandoverGateError(409, 'Handover blocked: contract rental window is invalid.');
      }
      for (const doc of vehicleContractsSnap.docs) {
        if (doc.id === contract.id) continue;
        const other = doc.data() as any;
        if (!['approved', 'signed', 'active'].includes(String(other.status || ''))) continue;
        const otherStart = new Date(other.startDateTime).getTime();
        const otherEnd = new Date(other.endDateTime).getTime();
        if (Number.isFinite(otherStart) && Number.isFinite(otherEnd) && start <= otherEnd && end >= otherStart) {
          throw new HandoverGateError(409, `Handover blocked: vehicle has a conflicting ${other.status} contract (${doc.id}).`);
        }
      }

      const handover = {
        ...((req.body || {}).handoverData || {}),
        handoverDateTime: now,
        employeeId: actor.uid,
        employeeName: actor.name,
        startMileage: evidence.startMileage,
        fuelLevelPercent: evidence.fuelLevelPercent,
        customerSignatureUrl: evidence.customerSignatureUrl,
        employeeSignatureUrl: evidence.employeeSignatureUrl
      };
      const updatedContract = {
        ...contract,
        status: 'active',
        handover,
        depositStatus: requiredDeposit > 0 ? 'held' : contract.depositStatus,
        updatedAt: now
      };
      const updatedVehicle = {
        ...vehicle,
        status: 'rented',
        currentCustomerId: contract.customerId,
        currentContractId: contract.id,
        mileage: evidence.startMileage,
        updatedAt: now
      };
      const updatedCustomer = {
        ...customer,
        totalRentals: Number(customer.totalRentals || 0) + 1,
        updatedAt: now
      };

      tx.set(contractRef, updatedContract, { merge: true });
      tx.set(vehicleRef, {
        status: 'rented',
        currentCustomerId: contract.customerId,
        currentContractId: contract.id,
        mileage: evidence.startMileage,
        updatedAt: now
      }, { merge: true });
      tx.set(customerRef, { totalRentals: updatedCustomer.totalRentals, updatedAt: now }, { merge: true });

      return { contract: updatedContract, vehicle: updatedVehicle, customer: updatedCustomer };
    });
  } catch (error) {
    if (error instanceof HandoverGateError) return res.status(error.status).json({ error: error.message });
    console.error('[contract-handover] atomic handover failed', error);
    return res.status(500).json({ error: 'Contract handover failed atomically. No handover was completed.' });
  }

  const contractIndex = globalStore.contracts.findIndex(c => c.id === outcome.contract.id);
  if (contractIndex !== -1) globalStore.contracts[contractIndex] = outcome.contract;
  const vehicleIndex = globalStore.vehicles.findIndex(v => v.id === outcome.vehicle.id);
  if (vehicleIndex !== -1) globalStore.vehicles[vehicleIndex] = outcome.vehicle;
  const customerIndex = globalStore.customers.findIndex(c => c.id === outcome.customer.id);
  if (customerIndex !== -1) globalStore.customers[customerIndex] = outcome.customer;

  await persistContractLifecycleAudit(
    actor,
    outcome.contract.id,
    'Status: Signed',
    `Status: Active (verified handover at ${evidence.startMileage} km)`,
    'Atomic production handover gate passed: KYC, deposit, signatures, vehicle readiness and schedule conflict checks verified'
  );
  return res.status(200).json({ success: true, contract: outcome.contract });
}

function applyLifecycleResultToCache(outcome: { contract: any; vehicle: any; customer: any }) {
  const contractIndex = globalStore.contracts.findIndex(c => c.id === outcome.contract.id);
  if (contractIndex !== -1) globalStore.contracts[contractIndex] = outcome.contract;
  const vehicleIndex = globalStore.vehicles.findIndex(v => v.id === outcome.vehicle.id);
  if (vehicleIndex !== -1) globalStore.vehicles[vehicleIndex] = outcome.vehicle;
  const customerIndex = globalStore.customers.findIndex(c => c.id === outcome.customer.id);
  if (customerIndex !== -1) globalStore.customers[customerIndex] = outcome.customer;
}

async function handleProductionContractReturn(req: Request, res: Response, contractId: string) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const actor = await getVerifiedStaff(req, res, RETURN_INTAKE_ROLES);
  if (!actor) return;

  const inspectionId = String((req.body || {}).inspectionId || (req.body || {}).returnData?.inspectionId || '').trim();
  try {
    const outcome = await beginContractReturn(contractId, inspectionId, actor);
    applyLifecycleResultToCache(outcome);
    await persistContractLifecycleAudit(
      actor,
      outcome.contract.id,
      'Status: Active',
      'Return received — settlement pending; vehicle unavailable',
      `Completed return inspection ${outcome.inspection.id} accepted as the physical return source of truth`
    );
    return res.status(202).json({ success: true, settlementPending: true, contract: outcome.contract });
  } catch (error) {
    if (error instanceof ContractReturnWorkflowError) return res.status(error.status).json({ error: error.message });
    console.error('[contract-return] return intake failed', error);
    return res.status(500).json({ error: 'Contract return intake failed atomically.' });
  }
}

async function handleProductionContractReturnSettlement(req: Request, res: Response, contractId: string) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const actor = await getVerifiedStaff(req, res, RETURN_SETTLEMENT_ROLES);
  if (!actor) return;

  const body = req.body || {};
  try {
    const outcome = await settleContractReturn(contractId, {
      settlementReference: String(body.settlementReference || ''),
      settlementNotes: body.settlementNotes,
      settledChargeIds: Array.isArray(body.settledChargeIds) ? body.settledChargeIds.map(String) : []
    }, actor);
    applyLifecycleResultToCache(outcome);
    for (const chargeId of outcome.settledChargeIds) {
      const charge = globalStore.charges.find(c => c.id === chargeId);
      if (charge) Object.assign(charge as any, {
        settledAt: outcome.contract.returnWorkflow?.settledAt,
        settledBy: actor.uid,
        settledByName: actor.name,
        settlementReference: outcome.contract.returnWorkflow?.settlementReference
      });
    }
    await persistContractLifecycleAudit(
      actor,
      outcome.contract.id,
      'Return settlement pending',
      'Status: Completed; vehicle released to Available',
      `Finance/management return settlement approved under reference ${outcome.contract.returnWorkflow?.settlementReference}`
    );
    return res.status(200).json({ success: true, contract: outcome.contract, settledChargeIds: outcome.settledChargeIds });
  } catch (error) {
    if (error instanceof ContractReturnWorkflowError) return res.status(error.status).json({ error: error.message });
    console.error('[contract-return] settlement close failed', error);
    return res.status(500).json({ error: 'Return settlement failed atomically. The contract remains open.' });
  }
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
  const returnSettlementMatch = req.path.match(/^\/api\/contracts\/([^/]+)\/return\/settle$/);
  if (returnSettlementMatch) {
    return handleProductionContractReturnSettlement(req, res, decodeURIComponent(returnSettlementMatch[1]));
  }

  const returnMatch = req.path.match(/^\/api\/contracts\/([^/]+)\/return$/);
  if (returnMatch) {
    return handleProductionContractReturn(req, res, decodeURIComponent(returnMatch[1]));
  }

  const handoverMatch = req.path.match(/^\/api\/contracts\/([^/]+)\/handover$/);
  if (handoverMatch) {
    return handleProductionContractHandover(req, res, decodeURIComponent(handoverMatch[1]));
  }

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
