import { createDurable, runDurableTransaction, PersistenceError } from './persistence';
import { issueNextNumber } from './idGenerator';
import { runIdempotentCreate, type IdempotentOutcome } from './idempotency';
import { REQUIRED_PHOTO_CATEGORIES_BY_TYPE, REQUIRES_CUSTOMER_ACKNOWLEDGEMENT } from '../config/inspectionPhotoCategories';
import type { RecordAuditFn } from './businessRules';
import type {
  VehicleInspection, InspectionType, InspectionDamageMarker, InspectionPhoto,
  DamageClassification, DamageLiabilityStatus, InspectionPhotoCategory, UserRole
} from '../types';

// ----------------------------------------------------
// VEHICLE INSPECTION & PHOTO EVIDENCE (Splendor Master Rule Set, Module 08)
// ----------------------------------------------------
// Deliberately its OWN collection (vehicle_inspections), not layered onto
// the generic /api/documents catalog: that route trusts client-supplied
// actorId/actorName and has no read-side scoping (see DISCOVERED finding
// in this session's final report) -- inheriting that would directly
// contradict this feature's own security requirements. Every mutation
// here derives the actor from the server-verified caller
// (getRequesterActor in server.ts), never from the request body.

export class InspectionError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'InspectionError';
  }
}

export interface InspectionActor {
  uid: string;
  name: string;
  role: UserRole;
}

function requireDraft(inspection: VehicleInspection): void {
  if (inspection.status === 'completed') {
    throw new InspectionError(`Inspection ${inspection.id} is already completed and its evidence is immutable.`);
  }
  if (inspection.status === 'voided') {
    throw new InspectionError(`Inspection ${inspection.id} was voided and can no longer be modified.`);
  }
}

async function loadInspection(id: string): Promise<VehicleInspection> {
  const admin = (await import('firebase-admin')).default;
  const snap = await admin.firestore().collection('vehicle_inspections').doc(id).get();
  if (!snap.exists) throw new InspectionError(`Inspection ${id} not found.`);
  return snap.data() as VehicleInspection;
}

// ---- Start ----

export interface StartInspectionInput {
  vehicleId: string;
  vehicleName: string;
  contractId?: string;
  contractNumber?: string;
  type: InspectionType;
  compareAgainstInspectionId?: string;
}

export async function startInspection(
  input: StartInspectionInput,
  actor: InspectionActor,
  idempotencyKey: string | undefined | null,
  fingerprint: string | undefined,
  recordAudit: RecordAuditFn
): Promise<IdempotentOutcome<VehicleInspection>> {
  if (!input.vehicleId) throw new InspectionError('A vehicle is required to start an inspection.');
  if ((input.type === 'handover' || input.type === 'return') && !input.contractId) {
    throw new InspectionError(`A ${input.type} inspection requires an associated contract.`);
  }

  return runIdempotentCreate('inspection-start', idempotencyKey, fingerprint, async () => {
    const id = await issueNextNumber('Inspection');
    const now = new Date().toISOString();
    // Optional fields are omitted entirely rather than set to `undefined`
    // when absent -- createDurable's underlying .create() call rejects an
    // explicit `undefined` value against real Firestore (this test suite's
    // fake service-account init doesn't set ignoreUndefinedProperties,
    // matching the exact class of issue fixed earlier for auditIntegrity.ts).
    const inspection: VehicleInspection = {
      id,
      vehicleId: input.vehicleId,
      vehicleName: input.vehicleName,
      ...(input.contractId ? { contractId: input.contractId } : {}),
      ...(input.contractNumber ? { contractNumber: input.contractNumber } : {}),
      type: input.type,
      status: 'draft',
      inspectorId: actor.uid,
      inspectorName: actor.name,
      startedAt: now,
      damages: [],
      requiredPhotoCategories: REQUIRED_PHOTO_CATEGORIES_BY_TYPE[input.type],
      photos: [],
      ...(input.compareAgainstInspectionId ? { compareAgainstInspectionId: input.compareAgainstInspectionId } : {}),
      createdAt: now,
      updatedAt: now
    };
    await createDurable('vehicle_inspections', inspection as unknown as { id: string });

    await recordAudit({
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'VehicleInspection',
      entityId: id,
      action: 'create',
      newValue: `Started ${input.type} inspection for vehicle ${input.vehicleId}${input.contractId ? ` (contract ${input.contractId})` : ''}.`
    });

    return inspection;
  });
}

// ---- Update draft fields (mileage/fuel/condition/notes) ----

export interface UpdateInspectionDetailsInput {
  mileage?: number;
  fuelLevelPercent?: number;
  exteriorCondition?: VehicleInspection['exteriorCondition'];
  interiorCondition?: VehicleInspection['interiorCondition'];
  notes?: string;
}

export async function updateInspectionDetails(
  inspectionId: string,
  input: UpdateInspectionDetailsInput,
  actor: InspectionActor,
  recordAudit: RecordAuditFn
): Promise<VehicleInspection> {
  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('vehicle_inspections').doc(inspectionId);

  const updated = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new InspectionError(`Inspection ${inspectionId} not found.`);
    const inspection = snap.data() as VehicleInspection;
    requireDraft(inspection);

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.mileage !== undefined) patch.mileage = input.mileage;
    if (input.fuelLevelPercent !== undefined) patch.fuelLevelPercent = input.fuelLevelPercent;
    if (input.exteriorCondition !== undefined) patch.exteriorCondition = input.exteriorCondition;
    if (input.interiorCondition !== undefined) patch.interiorCondition = input.interiorCondition;
    if (input.notes !== undefined) patch.notes = input.notes;

    tx.set(ref, patch, { merge: true });
    return { ...inspection, ...patch } as VehicleInspection;
  });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'VehicleInspection', entityId: inspectionId, action: 'update',
    newValue: `Updated inspection details: ${JSON.stringify(input)}.`
  });

  return updated;
}

// ---- Damage ----

export interface AddDamageInput {
  part: InspectionDamageMarker['part'];
  severity: InspectionDamageMarker['severity'];
  classification: DamageClassification;
  description: string;
  photoIds?: string[];
}

export async function addDamageMarker(
  inspectionId: string,
  input: AddDamageInput,
  actor: InspectionActor,
  recordAudit: RecordAuditFn
): Promise<VehicleInspection> {
  if (!input.description || !input.description.trim()) {
    throw new InspectionError('A description is required for a damage record.');
  }

  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('vehicle_inspections').doc(inspectionId);

  const updated = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new InspectionError(`Inspection ${inspectionId} not found.`);
    const inspection = snap.data() as VehicleInspection;
    requireDraft(inspection);

    const now = new Date().toISOString();
    // RULE (financial safety): recording damage NEVER auto-creates a charge.
    // pre_existing damage carries no liability question at all; new/uncertain
    // damage opens a review, but the review's outcome is a classification
    // flag here -- any actual customer charge still has to go through the
    // existing Debt/charge creation flow, unchanged by this feature.
    const marker: InspectionDamageMarker = {
      id: `DMG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      part: input.part,
      severity: input.severity,
      classification: input.classification,
      description: input.description.trim(),
      photoIds: input.photoIds || [],
      liabilityStatus: input.classification === 'pre_existing' ? 'not_applicable' : 'pending_review',
      recordedBy: actor.uid,
      recordedByName: actor.name,
      recordedAt: now
    };

    const damages = [...inspection.damages, marker];
    tx.set(ref, { damages, updatedAt: now }, { merge: true });
    return { ...inspection, damages, updatedAt: now };
  });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'VehicleInspection', entityId: inspectionId, action: 'update',
    newValue: `Recorded ${input.classification} damage: ${input.part} (${input.severity}) -- ${input.description}`
  });

  return updated;
}

export interface ReviewDamageLiabilityInput {
  damageId: string;
  liabilityStatus: Extract<DamageLiabilityStatus, 'customer_liable' | 'not_customer_liable'>;
  reviewNotes: string;
}

export async function reviewDamageLiability(
  inspectionId: string,
  input: ReviewDamageLiabilityInput,
  actor: InspectionActor,
  recordAudit: RecordAuditFn
): Promise<VehicleInspection> {
  if (!input.reviewNotes || !input.reviewNotes.trim()) {
    throw new InspectionError('A review note is required to decide liability for this damage.');
  }

  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('vehicle_inspections').doc(inspectionId);

  const updated = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new InspectionError(`Inspection ${inspectionId} not found.`);
    const inspection = snap.data() as VehicleInspection;

    const idx = inspection.damages.findIndex(d => d.id === input.damageId);
    if (idx === -1) throw new InspectionError(`Damage record ${input.damageId} not found on inspection ${inspectionId}.`);
    if (inspection.damages[idx].classification === 'pre_existing') {
      throw new InspectionError('Pre-existing damage has no liability review to make.');
    }

    const now = new Date().toISOString();
    const damages = [...inspection.damages];
    damages[idx] = {
      ...damages[idx],
      liabilityStatus: input.liabilityStatus,
      reviewedBy: actor.uid,
      reviewedByName: actor.name,
      reviewedAt: now,
      reviewNotes: input.reviewNotes.trim()
    };

    tx.set(ref, { damages, updatedAt: now }, { merge: true });
    return { ...inspection, damages, updatedAt: now };
  });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'VehicleInspection', entityId: inspectionId, action: 'update',
    previousValue: 'liabilityStatus: pending_review',
    newValue: `liabilityStatus: ${input.liabilityStatus}`,
    reason: input.reviewNotes
  });

  return updated;
}

// ---- Photos ----

export interface RegisterPhotoInput {
  category: InspectionPhotoCategory;
  documentPath: string;
  fileUrl: string;
  notes?: string;
}

export async function registerInspectionPhoto(
  inspectionId: string,
  input: RegisterPhotoInput,
  actor: InspectionActor,
  recordAudit: RecordAuditFn
): Promise<VehicleInspection> {
  if (!input.documentPath || !input.fileUrl) {
    throw new InspectionError('A photo must reference an already-uploaded document path and URL.');
  }

  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('vehicle_inspections').doc(inspectionId);

  const updated = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new InspectionError(`Inspection ${inspectionId} not found.`);
    const inspection = snap.data() as VehicleInspection;
    requireDraft(inspection);

    const now = new Date().toISOString();
    const sequence = inspection.photos.filter(p => p.category === input.category).length + 1;
    const photo: InspectionPhoto = {
      id: `INSPPH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      inspectionId,
      vehicleId: inspection.vehicleId,
      ...(inspection.contractId ? { contractId: inspection.contractId } : {}),
      category: input.category,
      documentPath: input.documentPath,
      fileUrl: input.fileUrl,
      sequence,
      uploadedBy: actor.uid,
      uploadedByName: actor.name,
      uploadedAt: now,
      ...(input.notes ? { notes: input.notes } : {})
    };

    const photos = [...inspection.photos, photo];
    tx.set(ref, { photos, updatedAt: now }, { merge: true });
    return { ...inspection, photos, updatedAt: now };
  });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'VehicleInspection', entityId: inspectionId, action: 'update',
    newValue: `Attached ${input.category} photo (sequence ${updated.photos[updated.photos.length - 1].sequence}).`
  });

  return updated;
}

// ---- Customer acknowledgement ----

export interface AcknowledgeInspectionInput {
  acknowledgedByName: string;
  notes?: string;
}

export async function acknowledgeInspection(
  inspectionId: string,
  input: AcknowledgeInspectionInput,
  actor: InspectionActor,
  recordAudit: RecordAuditFn
): Promise<VehicleInspection> {
  if (!input.acknowledgedByName || !input.acknowledgedByName.trim()) {
    throw new InspectionError('The acknowledging customer\'s name is required.');
  }

  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('vehicle_inspections').doc(inspectionId);

  const updated = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new InspectionError(`Inspection ${inspectionId} not found.`);
    const inspection = snap.data() as VehicleInspection;
    requireDraft(inspection);

    const now = new Date().toISOString();
    const customerAcknowledgement = {
      acknowledgedAt: now,
      acknowledgedByName: input.acknowledgedByName.trim(),
      witnessedBy: actor.uid,
      witnessedByName: actor.name,
      ...(input.notes ? { notes: input.notes } : {})
    };

    tx.set(ref, { customerAcknowledgement, updatedAt: now }, { merge: true });
    return { ...inspection, customerAcknowledgement, updatedAt: now };
  });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'VehicleInspection', entityId: inspectionId, action: 'update',
    newValue: `Customer acknowledgement recorded: ${input.acknowledgedByName}, witnessed by ${actor.name}.`
  });

  return updated;
}

// ---- Completion ----

export async function completeInspection(
  inspectionId: string,
  idempotencyKey: string | undefined | null,
  actor: InspectionActor,
  recordAudit: RecordAuditFn
): Promise<IdempotentOutcome<VehicleInspection>> {
  return runIdempotentCreate(`inspection-complete:${inspectionId}`, idempotencyKey, undefined, async () => {
    const admin = (await import('firebase-admin')).default;
    const ref = admin.firestore().collection('vehicle_inspections').doc(inspectionId);

    return runDurableTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new InspectionError(`Inspection ${inspectionId} not found.`);
      const inspection = snap.data() as VehicleInspection;

      if (inspection.status === 'completed') return inspection; // already done -- idempotent no-op
      requireDraft(inspection);

      const missingCategories = inspection.requiredPhotoCategories.filter(
        cat => !inspection.photos.some(p => p.category === cat)
      );
      if (missingCategories.length > 0) {
        throw new InspectionError(`Missing required photo evidence: ${missingCategories.join(', ')}.`);
      }
      if (REQUIRES_CUSTOMER_ACKNOWLEDGEMENT[inspection.type] && !inspection.customerAcknowledgement) {
        throw new InspectionError('Customer acknowledgement is required before this inspection can be completed.');
      }
      const unreviewedDamage = inspection.damages.find(d => d.liabilityStatus === 'pending_review');
      if (unreviewedDamage) {
        throw new InspectionError(`Damage record ${unreviewedDamage.id} still needs a liability review decision before completion.`);
      }

      const now = new Date().toISOString();
      const patch = { status: 'completed' as const, completedAt: now, updatedAt: now };
      tx.set(ref, patch, { merge: true });
      return { ...inspection, ...patch };
    });
  }).then(async (outcome) => {
    if (!outcome.replayed) {
      await recordAudit({
        userId: actor.uid, userName: actor.name, userRole: actor.role,
        entityType: 'VehicleInspection', entityId: inspectionId, action: 'status_change',
        previousValue: 'Status: draft', newValue: 'Status: completed',
        reason: 'All required evidence captured and acknowledgement obtained where required.'
      });
    }
    return outcome;
  });
}

export async function voidInspection(
  inspectionId: string,
  reason: string,
  actor: InspectionActor,
  recordAudit: RecordAuditFn
): Promise<VehicleInspection> {
  if (!reason || !reason.trim()) throw new InspectionError('A reason is required to void an inspection.');

  const admin = (await import('firebase-admin')).default;
  const ref = admin.firestore().collection('vehicle_inspections').doc(inspectionId);

  const updated = await runDurableTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new InspectionError(`Inspection ${inspectionId} not found.`);
    const inspection = snap.data() as VehicleInspection;
    if (inspection.status === 'completed') {
      throw new InspectionError(`Inspection ${inspectionId} is already completed and cannot be voided -- its evidence is permanent.`);
    }
    if (inspection.status === 'voided') {
      throw new InspectionError(`Inspection ${inspectionId} is already voided.`);
    }

    const now = new Date().toISOString();
    const patch = { status: 'voided' as const, voidedAt: now, voidedBy: actor.uid, voidedByName: actor.name, voidReason: reason.trim(), updatedAt: now };
    tx.set(ref, patch, { merge: true });
    return { ...inspection, ...patch };
  });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'VehicleInspection', entityId: inspectionId, action: 'status_change',
    previousValue: 'Status: draft', newValue: 'Status: voided',
    reason
  });

  return updated;
}

export async function getInspection(id: string): Promise<VehicleInspection> {
  return loadInspection(id);
}

export interface ListInspectionsFilter {
  vehicleId?: string;
  contractId?: string;
}

export async function listInspections(filter: ListInspectionsFilter): Promise<VehicleInspection[]> {
  const admin = (await import('firebase-admin')).default;
  let query: FirebaseFirestore.Query = admin.firestore().collection('vehicle_inspections');
  if (filter.vehicleId) query = query.where('vehicleId', '==', filter.vehicleId);
  if (filter.contractId) query = query.where('contractId', '==', filter.contractId);
  const snap = await query.get();
  return snap.docs.map((d: any) => d.data() as VehicleInspection).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}
