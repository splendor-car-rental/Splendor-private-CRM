import admin from 'firebase-admin';
import { createDurable, updateDurable, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { createApprovalRequest, decideApprovalRequest, ApprovalError } from './approvals';
import { RuleChangeActor, RecordAuditFn } from './businessRules';
import { DEFAULT_MANUFACTURERS, DEFAULT_CATALOG_MODELS } from '../config/vehicleCatalog';
import type {
  VehicleManufacturer, VehicleCatalogModel, VehicleCatalogUpdateRequest,
  VehicleCatalogRequestStatus, ApprovalRequestStatus
} from '../types';

/**
 * SPLENDOR Master Vehicle Catalog -- server-side engine.
 *
 * Mirrors the same architecture as src/server/businessRules.ts
 * (static seed defaults + Firestore-approved additions merged at read time)
 * and reuses the existing Four-Eyes/Segregation-of-Duties approval engine
 * (src/server/approvals.ts, ApprovalRequestType 'vehicle_catalog_update')
 * rather than building a second approval mechanism.
 *
 * Flow mandated by the mission brief: Discovery -> Verification -> Review
 * -> Approval -> Master Catalog. A staff member (or a future discovery
 * process) can only PROPOSE a new manufacturer/model via
 * proposeCatalogUpdate(); nothing is added to the readable catalog until an
 * authorized, DIFFERENT person approves it via decideCatalogUpdate() --
 * enforced by the underlying decideApprovalRequest()'s SoD check. A
 * rejected or still-pending request never appears in listManufacturers()/
 * listModelsForMake().
 */

export class VehicleCatalogError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'VehicleCatalogError';
  }
}

const REQUESTS_COLLECTION = 'vehicle_catalog_requests';
const MANUFACTURERS_COLLECTION = 'vehicle_catalog_manufacturers';
const MODELS_COLLECTION = 'vehicle_catalog_models';

/** Static seed manufacturers plus any staff-proposed, approved additions. Never includes pending/rejected proposals. */
export async function listManufacturers(): Promise<VehicleManufacturer[]> {
  if (admin.apps.length === 0) return DEFAULT_MANUFACTURERS;
  const db = admin.firestore();
  const snap = await db.collection(MANUFACTURERS_COLLECTION).get();
  const approved = snap.docs.map((d) => d.data() as VehicleManufacturer);
  const seedIds = new Set(DEFAULT_MANUFACTURERS.map((m) => m.id));
  return [...DEFAULT_MANUFACTURERS, ...approved.filter((m) => !seedIds.has(m.id))];
}

/**
 * Models for one manufacturer only -- callers must always pass a
 * manufacturerId (never a free-text make) so a model list can never leak
 * across manufacturers, per the mission's cascading-dropdown requirement.
 */
export async function listModelsForManufacturer(manufacturerId: string): Promise<VehicleCatalogModel[]> {
  const seedModels = DEFAULT_CATALOG_MODELS.filter((m) => m.manufacturerId === manufacturerId);
  if (admin.apps.length === 0) return seedModels;
  const db = admin.firestore();
  const snap = await db.collection(MODELS_COLLECTION).where('manufacturerId', '==', manufacturerId).get();
  const approved = snap.docs.map((d) => d.data() as VehicleCatalogModel);
  const seedIds = new Set(seedModels.map((m) => m.id));
  return [...seedModels, ...approved.filter((m) => !seedIds.has(m.id))];
}

export interface ProposeCatalogUpdateInput {
  requestType: VehicleCatalogUpdateRequest['requestType'];
  manufacturerName: string;
  modelName?: string;
  year?: number;
  trim?: string;
  details?: string;
  sourceNote?: string;
  discoverySource?: VehicleCatalogUpdateRequest['discoverySource'];
  requestedBy: string;
  requestedByName: string;
  requestedByRole: RuleChangeActor['role'];
}

/**
 * "الموديل غير موجود؟ طلب إضافة موديل جديد" -- staff-submitted (or future
 * discovery-submitted) request. This ONLY creates a pending record; it
 * never writes to the readable catalog. discoverySource defaults to
 * 'staff_request' -- 'internet_discovery' is schema-ready for a future
 * automated discovery job, but per the mission's absolute rule the
 * internet is discovery-only and every hit still lands here as PENDING,
 * never auto-approved.
 */
export async function proposeCatalogUpdate(input: ProposeCatalogUpdateInput, recordAudit: RecordAuditFn): Promise<VehicleCatalogUpdateRequest> {
  if (!input.manufacturerName || !input.manufacturerName.trim()) {
    throw new VehicleCatalogError('A manufacturer name is required.');
  }
  if (input.requestType === 'new_model' && (!input.modelName || !input.modelName.trim())) {
    throw new VehicleCatalogError('A model name is required to request a new model.');
  }

  const id = await issueNextNumber('VehicleCatalogUpdateRequest');
  const now = new Date().toISOString();

  const approval = await createApprovalRequest({
    type: 'vehicle_catalog_update',
    entityType: 'VehicleCatalogUpdateRequest',
    entityId: id,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByRole: input.requestedByRole as any,
    reason: input.details || `${input.requestType} -- ${input.manufacturerName}${input.modelName ? ` / ${input.modelName}` : ''}`,
    beforeValue: null,
    afterValue: `${input.manufacturerName}${input.modelName ? ` / ${input.modelName}` : ''}`
  }, recordAudit);

  const request: VehicleCatalogUpdateRequest = {
    id,
    requestType: input.requestType,
    manufacturerName: input.manufacturerName.trim(),
    ...(input.modelName ? { modelName: input.modelName.trim() } : {}),
    ...(input.year !== undefined ? { year: input.year } : {}),
    ...(input.trim ? { trim: input.trim } : {}),
    ...(input.details ? { details: input.details } : {}),
    ...(input.sourceNote ? { sourceNote: input.sourceNote } : {}),
    discoverySource: input.discoverySource || 'staff_request',
    status: 'pending',
    approvalRequestId: approval.id,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedAt: now,
    createdAt: now,
    updatedAt: now
  };

  await createDurable(REQUESTS_COLLECTION, request as unknown as { id: string });
  return request;
}

export async function listCatalogUpdateRequests(status?: VehicleCatalogRequestStatus): Promise<VehicleCatalogUpdateRequest[]> {
  if (admin.apps.length === 0) return [];
  const db = admin.firestore();
  const snap = await db.collection(REQUESTS_COLLECTION).get();
  const all = snap.docs.map((d) => d.data() as VehicleCatalogUpdateRequest);
  const filtered = status ? all.filter((r) => r.status === status) : all;
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)).slice(0, 200);
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Decides a pending catalog update request. Reuses decideApprovalRequest()
 * for the actual approve/reject decision -- so the Four-Eyes/SoD check
 * (decider can never be the requester) and the immutable approval-history
 * record are the exact same mechanism every other approval type in this
 * system uses, not a parallel one.
 *
 * Only on 'approved' does this write into the readable catalog collections
 * (vehicle_catalog_manufacturers / vehicle_catalog_models), tagged
 * source: 'staff_entry' since it came from a human-reviewed request rather
 * than an OEM/official reference import. Rejection leaves the catalog
 * completely untouched -- unconfirmed data never enters it.
 */
export async function decideCatalogUpdate(
  requestId: string,
  decision: Exclude<ApprovalRequestStatus, 'pending'>,
  note: string,
  decider: RuleChangeActor,
  recordAudit: RecordAuditFn
): Promise<VehicleCatalogUpdateRequest> {
  if (admin.apps.length === 0) throw new VehicleCatalogError('Firebase Admin is not configured.');
  const db = admin.firestore();
  const ref = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new VehicleCatalogError('Catalog update request not found.');
  const request = snap.data() as VehicleCatalogUpdateRequest;
  if (request.status !== 'pending') {
    throw new VehicleCatalogError(`This request has already been ${request.status}.`);
  }

  await decideApprovalRequest(request.approvalRequestId!, decision, note, decider, recordAudit);

  const now = new Date().toISOString();
  const decided: VehicleCatalogUpdateRequest = {
    ...request,
    status: decision,
    decidedBy: decider.uid,
    decidedByName: decider.name,
    decidedAt: now,
    decisionNote: note,
    updatedAt: now
  };

  if (decision === 'approved') {
    if (request.requestType === 'new_manufacturer' || request.requestType === 'new_model') {
      const manufacturerId = slugify(request.manufacturerName);
      const manufacturers = await listManufacturers();
      const existingManufacturer = manufacturers.find((m) => m.id === manufacturerId);
      if (!existingManufacturer) {
        const manufacturer: VehicleManufacturer = {
          id: manufacturerId,
          name: request.manufacturerName,
          source: 'staff_entry',
          createdAt: now,
          updatedAt: now
        };
        await createDurable(MANUFACTURERS_COLLECTION, manufacturer as unknown as { id: string });
      }
      decided.resultingManufacturerId = manufacturerId;

      if (request.requestType === 'new_model' && request.modelName) {
        const modelId = `${manufacturerId}-${slugify(request.modelName)}`;
        const model: VehicleCatalogModel = {
          id: modelId,
          manufacturerId,
          make: request.manufacturerName,
          model: request.modelName,
          ...(request.trim ? { trim: request.trim } : {}),
          ...(request.year !== undefined ? { productionYears: String(request.year) } : {}),
          source: 'staff_entry',
          createdAt: now,
          updatedAt: now
        };
        await createDurable(MODELS_COLLECTION, model as unknown as { id: string });
        decided.resultingModelId = modelId;
      }
    }
  }

  await updateDurable(REQUESTS_COLLECTION, requestId, decided as unknown as Record<string, unknown>);
  return decided;
}

export { ApprovalError };
