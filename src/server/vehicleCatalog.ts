import admin from 'firebase-admin';
import { createDurable, updateDurable, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { createApprovalRequest, decideApprovalRequest, ApprovalError } from './approvals';
import { RuleChangeActor, RecordAuditFn } from './businessRules';
import { DEFAULT_MANUFACTURERS, DEFAULT_CATALOG_MODELS } from '../config/vehicleCatalog';
import { UAE_CATALOG_EXPANSION_MANUFACTURERS, UAE_CATALOG_EXPANSION_MODELS } from '../config/vehicleCatalogExpansion';
import type {
  VehicleManufacturer, VehicleCatalogModel, VehicleCatalogUpdateRequest,
  VehicleCatalogRequestStatus, ApprovalRequestStatus
} from '../types';

/**
 * SPLENDOR Master Vehicle Catalog -- server-side engine.
 *
 * Static seed/reference data and Firestore-approved additions are merged at
 * read time. The UAE expansion is curated reference data for the mainstream
 * manufacturers used by Splendor operations. Model specifications are
 * reference suggestions only; the real vehicle's VIN/trim remains the source
 * of truth before publication.
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

const STATIC_MANUFACTURERS = [...DEFAULT_MANUFACTURERS, ...UAE_CATALOG_EXPANSION_MANUFACTURERS];
const STATIC_MODELS = [...DEFAULT_CATALOG_MODELS, ...UAE_CATALOG_EXPANSION_MODELS];

/**
 * Static manufacturers plus approved Firestore additions. Pending/rejected
 * proposals never appear. The static seed list is always non-empty and
 * never depends on Firestore, so a transient read failure on the (much
 * smaller) approved-additions collection degrades to "no extra
 * staff-approved entries this call" rather than wiping out the entire
 * Manufacturer dropdown on the Add/Edit Vehicle screen.
 */
export async function listManufacturers(): Promise<VehicleManufacturer[]> {
  if (admin.apps.length === 0) return STATIC_MANUFACTURERS;
  try {
    const db = admin.firestore();
    const snap = await db.collection(MANUFACTURERS_COLLECTION).get();
    const approved = snap.docs.map((d) => d.data() as VehicleManufacturer);
    const seedIds = new Set(STATIC_MANUFACTURERS.map((m) => m.id));
    return [...STATIC_MANUFACTURERS, ...approved.filter((m) => !seedIds.has(m.id))];
  } catch (error) {
    console.error('[vehicleCatalog] Failed to read approved manufacturer additions, falling back to the static seed list:', error);
    return STATIC_MANUFACTURERS;
  }
}

/** Models are strictly scoped to the selected manufacturer. Same fallback
 * reasoning as listManufacturers() above: never let a Firestore hiccup on
 * the approved-additions collection empty out the Model dropdown. */
export async function listModelsForManufacturer(manufacturerId: string): Promise<VehicleCatalogModel[]> {
  const seedModels = STATIC_MODELS.filter((m) => m.manufacturerId === manufacturerId);
  if (admin.apps.length === 0) return seedModels;
  try {
    const db = admin.firestore();
    const snap = await db.collection(MODELS_COLLECTION).where('manufacturerId', '==', manufacturerId).get();
    const approved = snap.docs.map((d) => d.data() as VehicleCatalogModel);
    const seedIds = new Set(seedModels.map((m) => m.id));
    return [...seedModels, ...approved.filter((m) => !seedIds.has(m.id))];
  } catch (error) {
    console.error('[vehicleCatalog] Failed to read approved model additions, falling back to the static seed list:', error);
    return seedModels;
  }
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
 * Approves/rejects catalog proposals using the existing four-eyes approval
 * engine. Approved additions enter Firestore; reference seed data remains
 * immutable in source control.
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

  if (decision === 'approved' && (request.requestType === 'new_manufacturer' || request.requestType === 'new_model')) {
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

  await updateDurable(REQUESTS_COLLECTION, requestId, decided as unknown as Record<string, unknown>);
  return decided;
}

export { ApprovalError };
