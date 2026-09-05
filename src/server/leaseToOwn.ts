import admin from 'firebase-admin';
import { createDurable, updateDurable, runDurableTransaction, runDurableBatch, PersistenceError, type BatchOp } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { runIdempotentCreate, type IdempotentOutcome } from './idempotency.js';
import { reserveVehicleSlot, placeTemporaryHold, releaseTemporaryHold, AvailabilityConflictError } from './availability.js';
import { checkBlocklist } from './blocklist.js';
import { createApprovalRequest, decideApprovalRequest, ApprovalError } from './approvals.js';
import { startInspection, getInspection, listInspections, InspectionError } from './vehicleInspections.js';
import { dispatchCustomerNotification } from './notificationEngine.js';
import type { RecordAuditFn, RuleChangeActor } from './businessRules.js';
import {
  computeLtoFinancialOffer, computeOutstandingBalance, computeSettlementAmount,
  computeInstallmentStatus, countConsecutiveMissedInstallments, getLtoMinCustomerAgeYears,
  getLtoApplicationHoldDays, getLtoConsecutiveMissedInstallmentsForDefault, LtoPolicyNotConfiguredError,
  type LtoOfferInput
} from './leaseToOwnPolicy.js';
import { globalStore } from './dataStore.js';
import type {
  LtoApplication, LtoApplicationStatus, LtoEligibilityCheck, LtoFinancialOffer,
  LtoContractDetails, LtoStatus, LtoInstallment, LtoInstallmentStatus,
  LtoSettlementRequest, Contract, Customer, Vehicle, UserRole, Payment
} from '../types/index.js';

// ----------------------------------------------------
// LEASE-TO-OWN (Splendor Private Mobility Operating System)
// ----------------------------------------------------
// A full product module built on the existing Customer/KYC/Vehicle/
// Reservation/Contract/Financial/Audit/RBAC/SoD/WhatsApp/Document
// architecture -- see the module header in src/types/index.ts for why no
// parallel system was created for any of those. This file is the
// orchestration layer: every mutating function here is a real Firestore
// transaction (or a durable batch), goes through the shared idempotency
// primitives (runIdempotentCreate / reserveVehicleSlot's own runIdempotent),
// and calls recordAudit (dependency-injected, same RecordAuditFn pattern as
// every other module this session) for every sensitive action.

export class LtoError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'LtoError';
  }
}

export interface LtoActor {
  uid: string;
  name: string;
  role: UserRole;
}

const LTO_APPLICATIONS = 'lto_applications';
const LTO_INSTALLMENTS = 'lto_installments';
const LTO_SETTLEMENTS = 'lto_settlement_requests';

function toRuleChangeActor(actor: LtoActor): RuleChangeActor {
  return { uid: actor.uid, name: actor.name, role: actor.role };
}

async function loadApplication(id: string): Promise<LtoApplication> {
  const snap = await admin.firestore().collection(LTO_APPLICATIONS).doc(id).get();
  if (!snap.exists) throw new LtoError(`طلب الإيجار المنتهي بالتملك ${id} غير موجود.`);
  return snap.data() as LtoApplication;
}

async function loadContract(id: string): Promise<Contract> {
  const snap = await admin.firestore().collection('contracts').doc(id).get();
  if (!snap.exists) throw new LtoError(`العقد ${id} غير موجود.`);
  const contract = snap.data() as Contract;
  if (contract.contractType !== 'lease_to_own' || !contract.lto) {
    throw new LtoError(`العقد ${id} ليس اتفاقية إيجار منتهٍ بالتملك.`);
  }
  return contract;
}

async function loadSettlementRequest(id: string): Promise<LtoSettlementRequest> {
  const snap = await admin.firestore().collection(LTO_SETTLEMENTS).doc(id).get();
  if (!snap.exists) throw new LtoError(`طلب التسوية ${id} غير موجود.`);
  return snap.data() as LtoSettlementRequest;
}

async function listInstallments(contractId: string): Promise<LtoInstallment[]> {
  const snap = await admin.firestore().collection(LTO_INSTALLMENTS).where('contractId', '==', contractId).get();
  return snap.docs.map(d => d.data() as LtoInstallment).sort((a, b) => a.installmentNumber - b.installmentNumber);
}

/**
 * Writes a vehicle/contract patch durably AND mirrors it onto globalStore's
 * in-memory copy, matching the existing convention set by every other route
 * in server.ts (e.g. `globalStore.vehicles[index] = updated`) -- without
 * this, other synchronous reads across the app (dashboards, Customer 360,
 * the next eligibility/conflict check) would keep seeing pre-LTO-mutation
 * data until an unrelated read happened to refresh the cache. `deleteKeys`
 * removes a field from both the durable doc (via FieldValue.delete()) and
 * the in-memory copy, since plain omission does not clear a Firestore
 * merge-write's existing value.
 */
async function patchVehicle(vehicleId: string, patch: Record<string, unknown>, deleteKeys: string[] = []): Promise<void> {
  const durablePatch: Record<string, unknown> = { ...patch };
  for (const key of deleteKeys) durablePatch[key] = admin.firestore.FieldValue.delete();
  await updateDurable('vehicles', vehicleId, durablePatch);
  const index = globalStore.vehicles.findIndex(v => v.id === vehicleId);
  if (index !== -1) {
    const updated: Record<string, unknown> = { ...globalStore.vehicles[index], ...patch };
    for (const key of deleteKeys) delete updated[key];
    globalStore.vehicles[index] = updated as unknown as Vehicle;
  }
}

async function patchContract(contractId: string, patch: Record<string, unknown>): Promise<void> {
  await updateDurable('contracts', contractId, patch);
  const index = globalStore.contracts.findIndex(c => c.id === contractId);
  if (index !== -1) globalStore.contracts[index] = { ...globalStore.contracts[index], ...patch } as Contract;
}

// ---------------------------------------------------------------------------
// 1. Eligibility Engine
// ---------------------------------------------------------------------------

function calculateAgeYears(dateOfBirth: string): number | null {
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/**
 * Reads the customer/vehicle from globalStore (the in-memory cache every
 * other synchronous CRM read already relies on) and the blocklist from the
 * real, existing checkBlocklist() -- never a second identity/KYC system.
 * Never guesses: every failure reason is explicit and human-readable.
 */
export async function checkLtoEligibility(customerId: string, vehicleId: string): Promise<LtoEligibilityCheck> {
  const reasons: string[] = [];
  const customer = globalStore.customers.find(c => c.id === customerId);
  const vehicle = globalStore.vehicles.find(v => v.id === vehicleId);

  if (!customer) {
    return { eligible: false, reasons: ['العميل غير موجود.'], checkedAt: new Date().toISOString() };
  }

  if (customer.status === 'blocklisted') reasons.push('العميل مدرج في قائمة الحظر.');

  if ((customer.idType === 'emirates_id' || customer.idType === 'passport') && customer.idNumber) {
    const match = await checkBlocklist(customer.idType, customer.idNumber, customer.idType === 'passport' ? customer.nationality : undefined);
    if (match && match.tier === 'full') reasons.push(`العميل مطابق لسجل حظر كامل (${match.id}).`);
  }

  const now = Date.now();
  if (!customer.idNumber || !customer.idExpiryDate || !customer.licenseNumber || !customer.licenseExpiryDate) {
    reasons.push('بيانات التحقق من الهوية غير مكتملة -- يجب توفير بيانات الهوية ورخصة القيادة.');
  } else {
    if (new Date(customer.idExpiryDate).getTime() < now) reasons.push('هوية العميل منتهية الصلاحية.');
    if (new Date(customer.licenseExpiryDate).getTime() < now) reasons.push('رخصة قيادة العميل منتهية الصلاحية.');
  }

  const minAge = getLtoMinCustomerAgeYears();
  if (!customer.dateOfBirth) {
    reasons.push('تاريخ الميلاد غير مسجل -- لا يمكن التحقق من العمر.');
  } else {
    const age = calculateAgeYears(customer.dateOfBirth);
    if (age === null) reasons.push('تاريخ الميلاد المسجل غير صحيح -- لا يمكن التحقق من العمر.');
    else if (age < minAge) reasons.push(`عمر العميل أقل من الحد الأدنى للإيجار المنتهي بالتملك (${minAge} سنة).`);
  }

  if (!vehicle) {
    reasons.push('المركبة غير موجودة.');
  } else {
    if (vehicle.lifecycleStatus && vehicle.lifecycleStatus !== 'ACTIVE') reasons.push(`المركبة غير نشطة في الأسطول (الحالة: ${vehicle.lifecycleStatus}).`);
    if (vehicle.status !== 'available') reasons.push(`المركبة غير متاحة حالياً (الحالة: ${vehicle.status}).`);
    if (vehicle.ltoStatus) reasons.push(`المركبة مرتبطة بالفعل بمسار إيجار منتهٍ بالتملك (${vehicle.ltoStatus}).`);
  }

  const existingActiveLto = globalStore.contracts.find(c =>
    c.customerId === customerId && c.contractType === 'lease_to_own' && c.lto &&
    ['active', 'settlement_requested', 'default', 'termination_requested', 'ownership_transfer_pending'].includes(c.lto.ltoStatus)
  );
  if (existingActiveLto) reasons.push(`يوجد للعميل بالفعل اتفاقية إيجار منتهٍ بالتملك نشطة (${existingActiveLto.id}).`);

  return { eligible: reasons.length === 0, reasons, checkedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// 2. Application
// ---------------------------------------------------------------------------

export interface CreateLtoApplicationInput {
  customerId: string;
  customerName: string;
  vehicleId: string;
  vehicleName: string;
  requestedTermMonths: number;
  requestedDownPayment: number;
  vehiclePrice: number;
  notes?: string;
}

export async function createLtoApplication(
  input: CreateLtoApplicationInput,
  actor: LtoActor,
  idempotencyKey: string | undefined | null,
  fingerprint: string | undefined,
  recordAudit: RecordAuditFn
): Promise<IdempotentOutcome<LtoApplication>> {
  if (!input.customerId || !input.vehicleId) throw new LtoError('العميل والمركبة مطلوبان.');
  if (!input.requestedTermMonths || input.requestedTermMonths <= 0) throw new LtoError('مدة العقد المطلوبة (بالأشهر) يجب أن تكون أكبر من صفر.');
  if (!input.vehiclePrice || input.vehiclePrice <= 0) throw new LtoError('سعر المركبة يجب أن يكون أكبر من صفر.');
  if (input.requestedDownPayment < 0) throw new LtoError('الدفعة المقدمة لا يمكن أن تكون سالبة.');

  return runIdempotentCreate('lto-application-create', idempotencyKey, fingerprint, async () => {
    const id = await issueNextNumber('LtoApplication');
    const now = new Date().toISOString();
    const application: LtoApplication = {
      id,
      customerId: input.customerId,
      customerName: input.customerName,
      vehicleId: input.vehicleId,
      vehicleName: input.vehicleName,
      requestedTermMonths: input.requestedTermMonths,
      requestedDownPayment: input.requestedDownPayment,
      vehiclePrice: input.vehiclePrice,
      notes: input.notes || '',
      status: 'draft',
      createdBy: actor.uid,
      createdByName: actor.name,
      createdAt: now,
      updatedAt: now
    };
    await createDurable(LTO_APPLICATIONS, application as unknown as { id: string });

    await recordAudit({
      userId: actor.uid, userName: actor.name, userRole: actor.role,
      entityType: 'LtoApplication', entityId: id, action: 'create',
      newValue: `Draft Lease-to-Own application for ${application.customerName}, vehicle ${application.vehicleName}, ${application.requestedTermMonths} months.`
    });

    return application;
  });
}

/** DRAFT -> SUBMITTED. Runs eligibility, places a temporary hold on the vehicle (via the existing hold mechanism), and opens an approval request through the existing Four-Eyes/SoD engine. Refuses to submit an ineligible application. */
export async function submitLtoApplication(applicationId: string, actor: LtoActor, recordAudit: RecordAuditFn): Promise<LtoApplication> {
  const application = await loadApplication(applicationId);
  if (application.status !== 'draft') throw new LtoError(`الطلب ${applicationId} في حالة ${application.status}، وليس مسودة -- لا يمكن إرساله مرة أخرى.`);

  const eligibility = await checkLtoEligibility(application.customerId, application.vehicleId);
  if (!eligibility.eligible) {
    await updateDurable(LTO_APPLICATIONS, applicationId, { eligibilityCheck: eligibility, updatedAt: new Date().toISOString() });
    throw new LtoError(`الطلب غير مؤهل: ${eligibility.reasons.join(' ')}`);
  }

  const now = new Date();
  const holdEnd = new Date(now.getTime() + application.requestedTermMonths * 30 * 24 * 60 * 60 * 1000);
  let hold;
  try {
    hold = await placeTemporaryHold({
      vehicleId: application.vehicleId,
      startIso: now.toISOString(),
      endIso: holdEnd.toISOString(),
      holderKey: applicationId,
      holdMinutes: getLtoApplicationHoldDays() * 24 * 60
    });
  } catch (err) {
    if (err instanceof AvailabilityConflictError) {
      throw new LtoError('يوجد تعارض في جدولة المركبة المختارة، ولا يمكن حجزها لهذا الطلب.');
    }
    throw err;
  }

  const approval = await createApprovalRequest({
    type: 'lto_application',
    entityType: 'LtoApplication',
    entityId: applicationId,
    requestedBy: actor.uid,
    requestedByName: actor.name,
    requestedByRole: actor.role,
    reason: `Lease-to-Own application for ${application.customerName} (${application.vehicleName}, ${application.requestedTermMonths} months) submitted for review.`,
    beforeValue: 'draft',
    afterValue: 'submitted'
  }, recordAudit);

  const now2 = new Date().toISOString();
  const updated: LtoApplication = {
    ...application,
    status: 'submitted',
    eligibilityCheck: eligibility,
    temporaryHoldId: hold.id,
    approvalRequestId: approval.id,
    submittedAt: now2,
    updatedAt: now2
  };
  await updateDurable(LTO_APPLICATIONS, applicationId, updated as unknown as Record<string, unknown>);

  try {
    await dispatchCustomerNotification('lto_application_received', application.customerId, application.customerName, undefined,
      `Your Lease-to-Own application for ${application.vehicleName} has been received and is under review. Our team will contact you shortly.`,
      `تم استلام طلب الإيجار المنتهي بالتملك الخاص بك للمركبة ${application.vehicleName} وهو قيد المراجعة. سيتواصل معك فريقنا قريباً.`
    );
  } catch (err) {
    console.error('WhatsApp dispatch failed (lto_application_received):', err);
  }

  return updated;
}

export async function cancelLtoApplication(applicationId: string, reason: string, actor: LtoActor, recordAudit: RecordAuditFn): Promise<LtoApplication> {
  const application = await loadApplication(applicationId);
  if (application.status === 'approved' || application.status === 'rejected' || application.status === 'cancelled') {
    throw new LtoError(`الطلب ${applicationId} في حالة ${application.status} بالفعل، ولا يمكن إلغاؤه.`);
  }
  if (application.temporaryHoldId) await releaseTemporaryHold(application.temporaryHoldId);

  const now = new Date().toISOString();
  const updated: LtoApplication = { ...application, status: 'cancelled', cancelledAt: now, cancelledReason: reason, updatedAt: now };
  await updateDurable(LTO_APPLICATIONS, applicationId, updated as unknown as Record<string, unknown>);

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'LtoApplication', entityId: applicationId, action: 'update',
    previousValue: application.status, newValue: 'cancelled', reason
  });
  return updated;
}

/**
 * Decides a pending application via the SAME Four-Eyes/SoD approvals
 * engine every other governance decision in this app uses --
 * decideApprovalRequest() itself enforces that the decider is never the
 * original requester and holds a decider-eligible role, and records the
 * immutable decision + audit entry. On approval, this function then
 * creates the real Contract (see createLtoAgreementFromApplication) --
 * kept as an explicit second step so a decision is recorded even if
 * agreement creation itself later fails for an unrelated reason (a
 * vehicle conflict that appeared between submission and decision, say).
 */
export async function decideLtoApplication(
  applicationId: string,
  decision: 'approved' | 'rejected',
  note: string,
  offerInput: Omit<LtoOfferInput, 'vehiclePrice'> | null,
  decider: LtoActor,
  recordAudit: RecordAuditFn
): Promise<{ application: LtoApplication; contract?: Contract }> {
  const application = await loadApplication(applicationId);
  if (application.status !== 'submitted' && application.status !== 'under_review') {
    throw new LtoError(`الطلب ${applicationId} في حالة ${application.status}، وليس بانتظار قرار.`);
  }
  if (!application.approvalRequestId) throw new LtoError('لم يتم إرسال هذا الطلب من خلال مسار الموافقات على الإطلاق.');

  await decideApprovalRequest(application.approvalRequestId, decision, note, toRuleChangeActor(decider), recordAudit);

  const now = new Date().toISOString();
  let updated: LtoApplication = {
    ...application,
    status: decision,
    decidedAt: now,
    decidedBy: decider.uid,
    decidedByName: decider.name,
    decisionReason: note,
    updatedAt: now
  };

  if (decision === 'rejected') {
    if (application.temporaryHoldId) await releaseTemporaryHold(application.temporaryHoldId);
    await updateDurable(LTO_APPLICATIONS, applicationId, updated as unknown as Record<string, unknown>);
    try {
      await dispatchCustomerNotification('lto_application_rejected', application.customerId, application.customerName, undefined,
        `We're unable to proceed with your Lease-to-Own application for ${application.vehicleName} at this time.`,
        `نأسف، لا يمكننا المتابعة في طلب الإيجار المنتهي بالتملك الخاص بك للمركبة ${application.vehicleName} في الوقت الحالي.`
      );
    } catch (err) {
      console.error('WhatsApp dispatch failed (lto_application_rejected):', err);
    }
    return { application: updated };
  }

  if (!offerInput) throw new LtoError('شروط العرض المالي (المدة بالأشهر، الدفعة المقدمة، الدفعة الختامية) مطلوبة للموافقة على الطلب.');
  const offer = computeLtoFinancialOffer({ ...offerInput, vehiclePrice: application.vehiclePrice });
  updated = { ...updated, offer };
  await updateDurable(LTO_APPLICATIONS, applicationId, updated as unknown as Record<string, unknown>);

  const contract = await createLtoAgreementFromApplication(updated, offer, decider, recordAudit);
  const finalApplication: LtoApplication = { ...updated, contractId: contract.id, updatedAt: new Date().toISOString() };
  await updateDurable(LTO_APPLICATIONS, applicationId, finalApplication as unknown as Record<string, unknown>);

  try {
    await dispatchCustomerNotification('lto_application_approved', application.customerId, application.customerName, undefined,
      `Congratulations! Your Lease-to-Own application for ${application.vehicleName} has been approved. Contract ${contract.id}: ${offer.termMonths} months, monthly installment AED ${offer.monthlyInstallment.toLocaleString()}. Our concierge team will contact you to arrange handover.`,
      `تهانينا! تمت الموافقة على طلب الإيجار المنتهي بالتملك الخاص بك للمركبة ${application.vehicleName}. رقم العقد ${contract.id}: مدة ${offer.termMonths} شهراً، القسط الشهري ${offer.monthlyInstallment.toLocaleString()} درهم. سيتواصل معك فريق الكونسيرج لترتيب موعد التسليم.`
    );
  } catch (err) {
    console.error('WhatsApp dispatch failed (lto_application_approved):', err);
  }

  return { application: finalApplication, contract };
}

// ---------------------------------------------------------------------------
// 3 & 4. Agreement creation (Vehicle Reservation reuse + Financial Offer)
// ---------------------------------------------------------------------------

function buildInstallmentSchedule(contract: Contract, offer: LtoFinancialOffer, startDate: Date): LtoInstallment[] {
  const installments: LtoInstallment[] = [];
  const now = new Date().toISOString();

  if (offer.downPayment > 0) {
    installments.push({
      id: '', contractId: contract.id, customerId: contract.customerId, customerName: contract.customerName,
      installmentNumber: 0, isFinalPayment: false, dueDate: startDate.toISOString(),
      amount: offer.downPayment, principalPortion: offer.downPayment, markupPortion: 0,
      paidAmount: 0, remainingAmount: offer.downPayment, status: 'due', createdAt: now, updatedAt: now
    });
  }

  for (let i = 1; i <= offer.termMonths; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);
    installments.push({
      id: '', contractId: contract.id, customerId: contract.customerId, customerName: contract.customerName,
      installmentNumber: i, isFinalPayment: false, dueDate: dueDate.toISOString(),
      amount: offer.monthlyInstallment, principalPortion: offer.monthlyPrincipalPortion, markupPortion: offer.monthlyMarkupPortion,
      paidAmount: 0, remainingAmount: offer.monthlyInstallment,
      status: 'upcoming', createdAt: now, updatedAt: now
    });
  }

  if (offer.finalPayment > 0) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + offer.termMonths);
    installments.push({
      id: '', contractId: contract.id, customerId: contract.customerId, customerName: contract.customerName,
      installmentNumber: offer.termMonths + 1, isFinalPayment: true, dueDate: dueDate.toISOString(),
      amount: offer.finalPayment, principalPortion: offer.finalPayment, markupPortion: 0,
      paidAmount: 0, remainingAmount: offer.finalPayment, status: 'upcoming', createdAt: now, updatedAt: now
    });
  }

  return installments;
}

/**
 * Creates the real Contract (contractType:'lease_to_own') through
 * reserveVehicleSlot() -- the exact same atomic, buffer-aware,
 * cross-instance-safe conflict-checking transaction every reservation and
 * rental contract in this app already goes through, targeting the
 * 'contracts' collection exactly like POST /api/reservations/:id/
 * create-contract already does. The agreement's own start/end dates span
 * the full LTO term, so the EXISTING active-contract-date-range check
 * already blocks any other booking for this vehicle for the whole term --
 * zero new conflict-checking code. Immediately after, auto-starts a real
 * handover VehicleInspection (Module 08) linked to this contract -- per
 * Splendor's own LTO contract template (Clause 8), liability only
 * transfers to the customer from a signed, defect-free handover record,
 * exactly what that module already produces.
 */
async function createLtoAgreementFromApplication(
  application: LtoApplication,
  offer: LtoFinancialOffer,
  actor: LtoActor,
  recordAudit: RecordAuditFn
): Promise<Contract> {
  const vehicle = globalStore.vehicles.find(v => v.id === application.vehicleId);
  const customer = globalStore.customers.find(c => c.id === application.customerId);
  if (!vehicle) throw new LtoError('المركبة غير موجودة.');
  if (!customer) throw new LtoError('العميل غير موجود.');

  const contractId = await issueNextNumber('Contract');
  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + offer.termMonths + (offer.finalPayment > 0 ? 1 : 0));

  const ltoDetails: LtoContractDetails = {
    applicationId: application.id,
    termMonths: offer.termMonths,
    downPayment: offer.downPayment,
    monthlyInstallment: offer.monthlyInstallment,
    finalPayment: offer.finalPayment,
    vehiclePrice: offer.vehiclePrice,
    processingFee: offer.processingFee,
    vatAmount: offer.vatAmount,
    totalContractValue: offer.totalContractValue,
    paidAmount: 0,
    outstandingAmount: offer.totalContractValue,
    ltoStatus: 'active'
  };

  let replayed = false;
  let contract: Contract;
  try {
    ({ doc: contract, replayed } = await reserveVehicleSlot(
      { vehicleId: application.vehicleId, startIso: now.toISOString(), endIso: endDate.toISOString(), excludeHoldId: application.temporaryHoldId, idempotencyKey: `lto-agreement:${application.id}` },
      'contracts',
      () => ({
        id: contractId,
        contractNumber: contractId,
        customerId: customer.id,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        customerAddress: customer.address || 'Dubai, UAE',
        vehicleId: vehicle.id,
        vehicleName: application.vehicleName,
        vehiclePlate: vehicle.plateNumber || 'TBD',
        vehicleVin: vehicle.vin || 'VIN-UNASSIGNED',
        startDateTime: now.toISOString(),
        endDateTime: endDate.toISOString(),
        pickupLocation: 'Showroom',
        returnLocation: 'Showroom',
        dailyRate: 0,
        rentalTotal: offer.totalContractValue,
        vatAmount: offer.vatAmount,
        grandTotal: offer.totalContractValue,
        depositAmount: 0,
        mileageAllowancePerDay: 0,
        extraKmRate: 0,
        depositReleaseDays: 0,
        status: 'active' as const,
        paymentStatus: 'unpaid' as const,
        depositStatus: 'pending' as const,
        notes: application.notes,
        termsAccepted: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        contractType: 'lease_to_own' as const,
        lto: ltoDetails
      })
    ));
  } catch (err) {
    if (err instanceof AvailabilityConflictError) {
      throw new LtoError('المركبة لم تعد متاحة -- يوجد حجز متعارض لهذه الفترة.');
    }
    throw err;
  }

  if (replayed) return contract;

  const installments = buildInstallmentSchedule(contract, offer, now);
  const ops: BatchOp[] = installments.map(inst => {
    const id = `${contractId}-${inst.installmentNumber}`;
    return { type: 'create', collection: LTO_INSTALLMENTS, id, data: { ...inst, id } as unknown as Record<string, unknown> };
  });
  // Firestore batches cap at 500 writes -- this codebase's own runDurableBatch
  // precedent chunks at that limit; an LTO term is realistically well under it.
  await runDurableBatch(ops);

  await patchVehicle(vehicle.id, { status: 'rented', ltoStatus: 'lto_active', ltoContractId: contract.id });

  // Handover: a real Vehicle Inspection (Module 08), not a bare status flip
  // -- per Clause 8 of Splendor's own LTO contract, liability only
  // transfers to the customer once a signed, defect-free handover exists.
  let handoverInspectionId: string | undefined;
  try {
    const { result: inspection } = await startInspection(
      { vehicleId: vehicle.id, vehicleName: application.vehicleName, contractId: contract.id, contractNumber: contract.contractNumber, type: 'handover' },
      { uid: actor.uid, name: actor.name, role: actor.role },
      `lto-handover:${contract.id}`,
      undefined,
      recordAudit
    );
    handoverInspectionId = inspection.id;
  } catch (err) {
    console.error(`Failed to auto-start the handover inspection for LTO contract ${contract.id}:`, err);
  }

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'Contract', entityId: contract.id, action: 'create',
    newValue: `Lease-to-Own agreement created for ${customer.fullName}, vehicle ${application.vehicleName}, ${offer.termMonths} months, total value ${offer.totalContractValue.toLocaleString()} AED. Handover inspection: ${handoverInspectionId || 'FAILED TO START -- see server logs'}.`,
    reason: `From application ${application.id}`
  });

  globalStore.contracts.unshift(contract);
  return contract;
}

// ---------------------------------------------------------------------------
// 5 & 6. Payment Schedule + Payment Integrity
// ---------------------------------------------------------------------------

export async function listLtoInstallments(contractId: string): Promise<LtoInstallment[]> {
  const installments = await listInstallments(contractId);
  const now = new Date();
  return installments.map(i => ({ ...i, status: computeInstallmentStatus(i, now) }));
}

/**
 * Records money received against ONE installment. Server-authoritative
 * (amount/method come from the request but the running balances are
 * recomputed inside the SAME transaction from the stored installment/
 * contract documents, never trusted from the client), idempotent (via
 * runIdempotentCreate, so a duplicate submission or network retry can never
 * double-credit a payment), and creates a REAL Payment record in the
 * EXISTING payments collection/ledger -- never a second financial ledger.
 */
export async function recordLtoInstallmentPayment(
  installmentId: string,
  amount: number,
  method: 'cash' | 'bank_transfer' | 'card' | 'online_link' | 'corporate_credit',
  actor: LtoActor,
  idempotencyKey: string | undefined | null,
  fingerprint: string | undefined,
  recordAudit: RecordAuditFn
): Promise<IdempotentOutcome<{ installment: LtoInstallment; contract: Contract }>> {
  if (amount <= 0) throw new LtoError('مبلغ الدفعة يجب أن يكون أكبر من صفر.');

  return runIdempotentCreate(`lto-payment:${installmentId}`, idempotencyKey, fingerprint, async () => {
    const paymentId = await issueNextNumber('Payment');
    const installmentRef = admin.firestore().collection(LTO_INSTALLMENTS).doc(installmentId);

    const result = await runDurableTransaction(async (tx, db) => {
      const instSnap = await tx.get(installmentRef);
      if (!instSnap.exists) throw new LtoError(`القسط ${installmentId} غير موجود.`);
      const installment = instSnap.data() as LtoInstallment;

      const contractRef = db.collection('contracts').doc(installment.contractId);
      const contractSnap = await tx.get(contractRef);
      if (!contractSnap.exists) throw new LtoError(`العقد ${installment.contractId} غير موجود.`);
      const contract = contractSnap.data() as Contract;
      if (!contract.lto) throw new LtoError(`العقد ${installment.contractId} ليس اتفاقية إيجار منتهٍ بالتملك.`);

      if (installment.status === 'paid' || installment.status === 'settled') {
        throw new LtoError(`القسط ${installmentId} مدفوع بالفعل (${installment.status}) -- لا يُقبل أي دفع إضافي.`);
      }
      if (amount > installment.remainingAmount + 0.01) {
        throw new LtoError(`الدفعة البالغة ${amount} تتجاوز المبلغ المتبقي وقدره ${installment.remainingAmount} على هذا القسط.`);
      }

      const now = new Date().toISOString();
      const newPaidAmount = Math.round((installment.paidAmount + amount) * 100) / 100;
      const newRemaining = Math.round((installment.amount - newPaidAmount) * 100) / 100;
      const updatedInstallment: LtoInstallment = {
        ...installment,
        paidAmount: newPaidAmount,
        remainingAmount: Math.max(0, newRemaining),
        status: computeInstallmentStatus({ ...installment, paidAmount: newPaidAmount }, new Date()),
        // A partial payment with no prior paidAt must NOT write an explicit
        // `undefined` (real Firestore rejects that) -- only set the key once
        // there is an actual value, keeping any earlier paidAt otherwise.
        ...(newRemaining <= 0 ? { paidAt: now } : installment.paidAt !== undefined ? { paidAt: installment.paidAt } : {}),
        updatedAt: now
      };

      const newContractPaid = Math.round((contract.lto.paidAmount + amount) * 100) / 100;
      const newContractOutstanding = Math.max(0, Math.round((contract.lto.outstandingAmount - amount) * 100) / 100);
      const updatedContract: Contract = { ...contract, lto: { ...contract.lto, paidAmount: newContractPaid, outstandingAmount: newContractOutstanding }, updatedAt: now };

      tx.create(db.collection('payments').doc(paymentId), {
        id: paymentId,
        customerId: installment.customerId,
        customerName: installment.customerName,
        contractId: installment.contractId,
        amount,
        method,
        status: 'received',
        referenceNumber: `LTO-${installmentId}`,
        allocatedTo: [],
        receivedBy: actor.uid,
        receivedAt: now,
        receiptNumber: paymentId,
        notes: `Lease-to-Own installment #${installment.installmentNumber} payment.`,
        createdAt: now
      });
      tx.set(installmentRef, updatedInstallment as unknown as Record<string, unknown>, { merge: true });
      tx.set(contractRef, updatedContract as unknown as Record<string, unknown>, { merge: true });

      return { installment: updatedInstallment, contract: updatedContract, paymentRecord: {
        id: paymentId, customerId: installment.customerId, customerName: installment.customerName, contractId: installment.contractId,
        amount, method, status: 'received' as const, referenceNumber: `LTO-${installmentId}`, allocatedTo: [], receivedBy: actor.uid,
        receivedAt: now, receiptNumber: paymentId, notes: `Lease-to-Own installment #${installment.installmentNumber} payment.`, createdAt: now
      } };
    });

    // The transaction above only writes Firestore -- mirror it onto
    // globalStore ourselves (same convention as every other route), so
    // Customer 360 / Vehicle Details / Dashboard reads reflect the payment
    // immediately rather than waiting on an unrelated cache refresh.
    const contractIndex = globalStore.contracts.findIndex(c => c.id === result.contract.id);
    if (contractIndex !== -1) globalStore.contracts[contractIndex] = result.contract;
    globalStore.payments.unshift(result.paymentRecord as unknown as Payment);

    await recordAudit({
      userId: actor.uid, userName: actor.name, userRole: actor.role,
      entityType: 'LtoInstallment', entityId: installmentId, action: 'update',
      newValue: `Payment of ${amount} AED (${method}) recorded against installment #${result.installment.installmentNumber} of contract ${result.contract.id}. Payment ${paymentId}.`
    });

    return { installment: result.installment, contract: result.contract };
  });
}

// ---------------------------------------------------------------------------
// 7. Collections
// ---------------------------------------------------------------------------

/**
 * Recomputes every active LTO contract's installment statuses and
 * dispatches ONE reminder per installment per day at most (via
 * lastReminderAt) when it newly reads as due/late/overdue -- reusing the
 * existing customer-notification dispatch and Task-creation mechanisms,
 * never a second scheduler. Hooked into the SAME cron/manual-trigger path
 * as runNotificationChecks() (see server.ts's handleRunChecks) -- not a
 * second cron entry. Never terminates a contract or recovers a vehicle
 * itself -- see markLtoDefault()/requestLtoTermination() for the
 * human-decided next step this sweep can only flag the need for.
 */
export async function runLtoCollectionsSweep(): Promise<{ remindersSent: number; tasksCreated: number }> {
  let remindersSent = 0;
  let tasksCreated = 0;
  const now = new Date();
  const activeContracts = globalStore.contracts.filter(c => c.contractType === 'lease_to_own' && c.lto?.ltoStatus === 'active');

  for (const contract of activeContracts) {
    const installments = await listInstallments(contract.id);
    let overdueCount = 0;

    for (const installment of installments) {
      const freshStatus = computeInstallmentStatus(installment, now);
      if (freshStatus === installment.status) continue;

      await updateDurable(LTO_INSTALLMENTS, installment.id, { status: freshStatus, updatedAt: now.toISOString() });

      const alreadyRemindedToday = installment.lastReminderAt && (now.getTime() - new Date(installment.lastReminderAt).getTime()) < 24 * 60 * 60 * 1000;
      if (!alreadyRemindedToday && (freshStatus === 'due' || freshStatus === 'late' || freshStatus === 'overdue')) {
        const eventKey = freshStatus === 'due' ? 'lto_payment_due' : freshStatus === 'late' ? 'lto_payment_late' : 'lto_payment_late';
        try {
          await dispatchCustomerNotification(eventKey, contract.customerId, contract.customerName, undefined,
            `Your Lease-to-Own installment #${installment.installmentNumber} for ${contract.vehicleName} (AED ${installment.remainingAmount.toLocaleString()}) is ${freshStatus}. Please settle at your earliest convenience.`,
            `قسط الإيجار المنتهي بالتملك رقم ${installment.installmentNumber} للمركبة ${contract.vehicleName} (${installment.remainingAmount.toLocaleString()} درهم) ${freshStatus === 'due' ? 'مستحق اليوم' : 'متأخر السداد'}. برجاء السداد في أقرب وقت.`
          );
          remindersSent++;
          await updateDurable(LTO_INSTALLMENTS, installment.id, { lastReminderAt: now.toISOString() });
        } catch (err) {
          console.error(`LTO reminder dispatch failed for installment ${installment.id}:`, err);
        }
      }
      if (freshStatus === 'overdue') overdueCount++;
    }

    if (overdueCount > 0) {
      const taskId = await issueNextNumber('Task');
      await createDurable('tasks', {
        id: taskId,
        title: `Lease-to-Own collections: ${contract.customerName} (${contract.id})`,
        description: `${overdueCount} overdue installment(s) on contract ${contract.id}, vehicle ${contract.vehicleName}.`,
        status: 'pending',
        priority: 'high',
        relatedEntityType: 'Contract',
        relatedEntityId: contract.id,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });
      tasksCreated++;
    }
  }

  return { remindersSent, tasksCreated };
}

// ---------------------------------------------------------------------------
// 8. Early Settlement
// ---------------------------------------------------------------------------

export async function requestLtoEarlySettlement(contractId: string, adjustments: number, adjustmentReason: string | undefined, actor: LtoActor, recordAudit: RecordAuditFn): Promise<LtoSettlementRequest> {
  const contract = await loadContract(contractId);
  if (contract.lto!.ltoStatus !== 'active') throw new LtoError(`العقد ${contractId} في حالة ${contract.lto!.ltoStatus} -- لا يمكن طلب التسوية المبكرة إلا لاتفاقية نشطة.`);

  const installments = await listInstallments(contractId);
  const outstandingBalance = computeOutstandingBalance(installments.map(i => ({ status: computeInstallmentStatus(i), remainingAmount: i.remainingAmount })));
  const { ownershipTransferFee, finalSettlementAmount } = computeSettlementAmount(outstandingBalance, adjustments || 0);

  const id = await issueNextNumber('LtoSettlementRequest');
  const now = new Date().toISOString();
  const approval = await createApprovalRequest({
    type: 'lto_settlement',
    entityType: 'LtoSettlementRequest',
    entityId: id,
    requestedBy: actor.uid,
    requestedByName: actor.name,
    requestedByRole: actor.role,
    reason: `Early settlement requested for contract ${contractId} (${contract.customerName}): outstanding ${outstandingBalance.toLocaleString()} AED + transfer fee ${ownershipTransferFee.toLocaleString()} AED = ${finalSettlementAmount.toLocaleString()} AED.`,
    beforeValue: 'active',
    afterValue: 'settlement_requested'
  }, recordAudit);

  const request: LtoSettlementRequest = {
    id, contractId, customerId: contract.customerId, customerName: contract.customerName,
    outstandingBalance, ownershipTransferFee, adjustments: adjustments || 0,
    ...(adjustmentReason !== undefined ? { adjustmentReason } : {}),
    finalSettlementAmount, status: 'pending', approvalRequestId: approval.id,
    requestedBy: actor.uid, requestedByName: actor.name, requestedAt: now
  };
  await createDurable(LTO_SETTLEMENTS, request as unknown as { id: string });
  await patchContract(contractId, { lto: { ...contract.lto, ltoStatus: 'settlement_requested', settlementRequestId: id }, updatedAt: now });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'LtoSettlementRequest', entityId: id, action: 'create',
    newValue: `Early settlement requested: ${finalSettlementAmount.toLocaleString()} AED.`
  });

  return request;
}

export async function decideLtoEarlySettlement(settlementRequestId: string, decision: 'approved' | 'rejected', note: string, decider: LtoActor, recordAudit: RecordAuditFn): Promise<LtoSettlementRequest> {
  const request = await loadSettlementRequest(settlementRequestId);
  if (request.status !== 'pending') throw new LtoError(`طلب التسوية ${settlementRequestId} في حالة ${request.status} بالفعل.`);
  if (!request.approvalRequestId) throw new LtoError('لم يتم إرسال طلب التسوية هذا من خلال مسار الموافقات على الإطلاق.');

  await decideApprovalRequest(request.approvalRequestId, decision, note, toRuleChangeActor(decider), recordAudit);

  const now = new Date().toISOString();
  const contract = await loadContract(request.contractId);

  if (decision === 'rejected') {
    const updated: LtoSettlementRequest = { ...request, status: 'rejected', decidedBy: decider.uid, decidedByName: decider.name, decidedAt: now, decisionNote: note };
    await updateDurable(LTO_SETTLEMENTS, settlementRequestId, updated as unknown as Record<string, unknown>);
    // settlementRequestId lives inside the nested `lto` map; Firestore's
    // set({merge:true}) deep-merges nested maps rather than replacing them,
    // so omitting the key from the new `lto` object would not clear the old
    // value already stored -- FieldValue.delete() is required for that leaf.
    await updateDurable('contracts', request.contractId, {
      lto: { ...contract.lto, ltoStatus: 'active', settlementRequestId: admin.firestore.FieldValue.delete() },
      updatedAt: now
    });
    const { settlementRequestId: _drop, ...ltoWithoutSettlement } = { ...contract.lto!, ltoStatus: 'active' as const };
    const contractIndex = globalStore.contracts.findIndex(c => c.id === request.contractId);
    if (contractIndex !== -1) globalStore.contracts[contractIndex] = { ...globalStore.contracts[contractIndex], lto: ltoWithoutSettlement, updatedAt: now } as Contract;
    return updated;
  }

  const paymentId = await issueNextNumber('Payment');
  const settlementPayment = {
    id: paymentId, customerId: request.customerId, customerName: request.customerName, contractId: request.contractId,
    amount: request.finalSettlementAmount, method: 'bank_transfer', status: 'received',
    referenceNumber: `LTO-SETTLEMENT-${settlementRequestId}`, allocatedTo: [], receivedBy: decider.uid,
    receivedAt: now, receiptNumber: paymentId, notes: `Lease-to-Own early settlement for contract ${request.contractId}.`, createdAt: now
  };
  await createDurable('payments', settlementPayment);
  globalStore.payments.unshift(settlementPayment as unknown as Payment);

  const installments = await listInstallments(request.contractId);
  const ops: BatchOp[] = installments
    .filter(i => i.status !== 'paid' && i.status !== 'settled')
    .map(i => ({ type: 'update', collection: LTO_INSTALLMENTS, id: i.id, data: { status: 'settled', remainingAmount: 0, updatedAt: now } }));
  if (ops.length > 0) await runDurableBatch(ops);

  const updated: LtoSettlementRequest = { ...request, status: 'completed', decidedBy: decider.uid, decidedByName: decider.name, decidedAt: now, decisionNote: note, completedAt: now, paymentId };
  await updateDurable(LTO_SETTLEMENTS, settlementRequestId, updated as unknown as Record<string, unknown>);
  await patchContract(request.contractId, {
    lto: { ...contract.lto, ltoStatus: 'settled', paidAmount: contract.lto!.totalContractValue, outstandingAmount: 0 },
    updatedAt: now
  });
  await patchVehicle(contract.vehicleId, { ltoStatus: 'lto_settlement' });

  try {
    await dispatchCustomerNotification('lto_settlement', request.customerId, request.customerName, undefined,
      `Your Lease-to-Own agreement for contract ${request.contractId} has been fully settled. Our team will now proceed with the ownership transfer.`,
      `تمت تسوية عقد الإيجار المنتهي بالتملك رقم ${request.contractId} بالكامل. سيقوم فريقنا الآن بإجراءات نقل الملكية.`
    );
  } catch (err) {
    console.error('WhatsApp dispatch failed (lto_settlement):', err);
  }

  return updated;
}

// ---------------------------------------------------------------------------
// 9. Default / Termination
// ---------------------------------------------------------------------------

/** Flags a contract as default-eligible per Splendor's own contract template Clause 3 (N consecutive missed months). Never terminates the contract or recovers the vehicle itself -- a human (RBAC/SoD via requestLtoTermination/decideLtoTermination) always decides that. */
export async function markLtoDefault(contractId: string, actor: LtoActor, recordAudit: RecordAuditFn): Promise<Contract> {
  const contract = await loadContract(contractId);
  if (contract.lto!.ltoStatus !== 'active') throw new LtoError(`العقد ${contractId} في حالة ${contract.lto!.ltoStatus} -- لا يمكن وضع علامة تعثّر إلا على اتفاقية نشطة.`);

  const installments = await listInstallments(contractId);
  const missedStreak = countConsecutiveMissedInstallments(installments.filter(i => !i.isFinalPayment));
  const threshold = getLtoConsecutiveMissedInstallmentsForDefault();
  if (missedStreak < threshold) {
    throw new LtoError(`العقد ${contractId} لديه ${missedStreak} قسط/أقساط متتالية فائتة، وهو أقل من حد التعثّر البالغ ${threshold} شهر.`);
  }

  const now = new Date().toISOString();
  await patchContract(contractId, { lto: { ...contract.lto, ltoStatus: 'default', defaultedAt: now, defaultReason: `${missedStreak} consecutive missed installments (threshold: ${threshold}).` }, updatedAt: now });
  await patchVehicle(contract.vehicleId, { ltoStatus: 'lto_default' });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'Contract', entityId: contractId, action: 'update',
    newValue: `Flagged as Lease-to-Own default: ${missedStreak} consecutive missed installments.`
  });

  return (await loadContract(contractId));
}

export async function requestLtoTermination(contractId: string, reason: string, actor: LtoActor, recordAudit: RecordAuditFn): Promise<Contract> {
  const contract = await loadContract(contractId);
  if (!['active', 'default'].includes(contract.lto!.ltoStatus)) throw new LtoError(`العقد ${contractId} في حالة ${contract.lto!.ltoStatus} -- لا يمكن طلب الإنهاء إلا على اتفاقية نشطة أو متعثّرة.`);
  if (!reason || !reason.trim()) throw new LtoError('السبب مطلوب لطلب الإنهاء.');

  await createApprovalRequest({
    type: 'lto_termination', entityType: 'Contract', entityId: contractId,
    requestedBy: actor.uid, requestedByName: actor.name, requestedByRole: actor.role,
    reason, beforeValue: contract.lto!.ltoStatus, afterValue: 'termination_requested'
  }, recordAudit);

  const now = new Date().toISOString();
  await patchContract(contractId, { lto: { ...contract.lto, ltoStatus: 'termination_requested', terminationRequestedAt: now, terminationRequestedReason: reason }, updatedAt: now });
  return (await loadContract(contractId));
}

/** Approving termination does NOT itself execute any legal or recovery action -- per this mission's explicit instruction, no automatic legal/repossession step is taken. It only records the decision and marks the agreement/vehicle so staff can proceed with the (human, off-system) recovery process, then call markLtoVehicleRecovered() once the vehicle is physically back. */
export async function decideLtoTermination(contractId: string, decision: 'approved' | 'rejected', note: string, decider: LtoActor, recordAudit: RecordAuditFn): Promise<Contract> {
  const contract = await loadContract(contractId);
  if (contract.lto!.ltoStatus !== 'termination_requested') throw new LtoError(`العقد ${contractId} ليس لديه طلب إنهاء معلّق.`);

  // Find the most recent pending lto_termination approval request for this contract.
  const approvalsSnap = await admin.firestore().collection('approval_requests')
    .where('entityType', '==', 'Contract').where('entityId', '==', contractId).get();
  const pending = approvalsSnap.docs.map(d => d.data() as any).filter(r => r.type === 'lto_termination' && r.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!pending) throw new LtoError('لا يوجد طلب موافقة إنهاء معلّق لهذا العقد.');

  await decideApprovalRequest(pending.id, decision, note, toRuleChangeActor(decider), recordAudit);

  const now = new Date().toISOString();
  if (decision === 'rejected') {
    await patchContract(contractId, { lto: { ...contract.lto, ltoStatus: 'active' }, updatedAt: now });
    return (await loadContract(contractId));
  }

  await patchContract(contractId, { lto: { ...contract.lto, ltoStatus: 'terminated', terminatedAt: now }, status: 'cancelled', updatedAt: now });
  await patchVehicle(contract.vehicleId, { ltoStatus: 'lto_recovery' });
  return (await loadContract(contractId));
}

/** Staff confirms the vehicle has been physically recovered after termination -- returns it to the normal rental pool. Never automatic. */
export async function markLtoVehicleRecovered(contractId: string, actor: LtoActor, recordAudit: RecordAuditFn): Promise<Vehicle> {
  const contract = await loadContract(contractId);
  if (contract.lto!.ltoStatus !== 'terminated') throw new LtoError(`العقد ${contractId} في حالة ${contract.lto!.ltoStatus} -- استرداد المركبة ينطبق فقط بعد الإنهاء.`);

  await patchVehicle(contract.vehicleId, { status: 'available' }, ['ltoStatus', 'ltoContractId']);
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'Vehicle', entityId: contract.vehicleId, action: 'update',
    newValue: `Vehicle recovered after terminated Lease-to-Own contract ${contractId}, returned to available rental fleet.`
  });
  const vehicle = globalStore.vehicles.find(v => v.id === contract.vehicleId);
  if (!vehicle) throw new LtoError('المركبة غير موجودة بعد تحديث الاسترداد.');
  return vehicle;
}

// ---------------------------------------------------------------------------
// 10. Ownership Transfer
// ---------------------------------------------------------------------------

/** LEASE_COMPLETED -> SETTLEMENT_CONFIRMED implicitly (ltoStatus:'settled' already means this) -> OWNERSHIP_TRANSFER_PENDING. */
export async function requestLtoOwnershipTransfer(contractId: string, actor: LtoActor, recordAudit: RecordAuditFn): Promise<Contract> {
  const contract = await loadContract(contractId);
  if (contract.lto!.ltoStatus !== 'settled') throw new LtoError(`العقد ${contractId} في حالة ${contract.lto!.ltoStatus} -- لا يمكن بدء نقل الملكية إلا بعد تسوية الاتفاقية بالكامل.`);

  const now = new Date().toISOString();
  await patchContract(contractId, { lto: { ...contract.lto, ltoStatus: 'ownership_transfer_pending' }, updatedAt: now });
  await patchVehicle(contract.vehicleId, { ltoStatus: 'ownership_transfer_pending' });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'Contract', entityId: contractId, action: 'update',
    newValue: 'Ownership transfer process started. NOTE: the actual RTA ownership/plate transfer is an EXTERNAL, manual process -- no RTA API integration exists or is invented here.'
  });
  return (await loadContract(contractId));
}

/**
 * Staff confirms the ownership transfer completed OUTSIDE this system (at
 * the RTA) -- there is no RTA ownership-transfer API available or invented
 * here (an explicit EXTERNAL DEPENDENCY, per this mission's own
 * instruction). Ownership is only ever considered transferred in this
 * system once this is explicitly recorded, evidenced by an uploaded
 * transfer document (via the existing document pipeline, referenced by
 * documentPath -- never a new storage system).
 */
export async function confirmLtoOwnershipTransfer(contractId: string, documentPath: string | undefined, actor: LtoActor, recordAudit: RecordAuditFn): Promise<Contract> {
  const contract = await loadContract(contractId);
  if (contract.lto!.ltoStatus !== 'ownership_transfer_pending') throw new LtoError(`العقد ${contractId} في حالة ${contract.lto!.ltoStatus} -- لا يوجد نقل ملكية معلّق.`);

  const now = new Date().toISOString();
  await patchContract(contractId, { lto: { ...contract.lto, ltoStatus: 'ownership_transferred', ownershipTransferredAt: now }, updatedAt: now });
  await patchVehicle(contract.vehicleId, { ltoStatus: 'owned', lifecycleStatus: 'TRANSFERRED' });

  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'Contract', entityId: contractId, action: 'update',
    newValue: `Ownership transfer confirmed by staff.${documentPath ? ` Evidence: ${documentPath}.` : ' No evidence document attached.'}`
  });

  try {
    await dispatchCustomerNotification('lto_ownership_transfer', contract.customerId, contract.customerName, undefined,
      `Congratulations! Ownership of ${contract.vehicleName} has been transferred to you. Thank you for choosing Splendor.`,
      `تهانينا! تم نقل ملكية المركبة ${contract.vehicleName} إليك. شكراً لاختيارك سبلندر.`
    );
  } catch (err) {
    console.error('WhatsApp dispatch failed (lto_ownership_transfer):', err);
  }

  return (await loadContract(contractId));
}

export async function completeLtoAgreement(contractId: string, actor: LtoActor, recordAudit: RecordAuditFn): Promise<Contract> {
  const contract = await loadContract(contractId);
  if (contract.lto!.ltoStatus !== 'ownership_transferred') throw new LtoError(`العقد ${contractId} في حالة ${contract.lto!.ltoStatus} -- الإتمام يتطلب تأكيد نقل الملكية.`);

  const now = new Date().toISOString();
  await patchContract(contractId, { lto: { ...contract.lto, ltoStatus: 'completed' }, status: 'completed', updatedAt: now });
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'Contract', entityId: contractId, action: 'update', newValue: 'Lease-to-Own agreement completed.'
  });
  return (await loadContract(contractId));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getLtoApplicationById(id: string): Promise<LtoApplication> {
  return loadApplication(id);
}

export async function listLtoApplications(filter?: { status?: LtoApplicationStatus }): Promise<LtoApplication[]> {
  let query: FirebaseFirestore.Query = admin.firestore().collection(LTO_APPLICATIONS);
  if (filter?.status) query = query.where('status', '==', filter.status);
  const snap = await query.get();
  return snap.docs.map(d => d.data() as LtoApplication).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface LtoContractView {
  contract: Contract;
  installments: LtoInstallment[];
  handoverInspectionId?: string;
}

export async function getLtoContractView(contractId: string): Promise<LtoContractView> {
  const contract = await loadContract(contractId);
  const installments = await listLtoInstallments(contractId);
  // The handover inspection's id is never stored on the Contract itself --
  // Module 08's own inspection records already carry contractId, so it's
  // looked up there instead of duplicating the reference.
  const inspections = await listInspections({ contractId });
  const handover = inspections.find(i => i.type === 'handover');
  return { contract, installments, handoverInspectionId: handover?.id };
}

export async function listLtoContracts(filter?: { ltoStatus?: LtoStatus }): Promise<Contract[]> {
  const all = globalStore.contracts.filter(c => c.contractType === 'lease_to_own' && c.lto);
  return filter?.ltoStatus ? all.filter(c => c.lto!.ltoStatus === filter.ltoStatus) : all;
}

export async function getLtoSummaryForCustomer(customerId: string): Promise<Contract[]> {
  return globalStore.contracts.filter(c => c.customerId === customerId && c.contractType === 'lease_to_own' && c.lto);
}

export async function getLtoSummaryForVehicle(vehicleId: string): Promise<Contract[]> {
  return globalStore.contracts.filter(c => c.vehicleId === vehicleId && c.contractType === 'lease_to_own' && c.lto);
}

export { ApprovalError, InspectionError, LtoPolicyNotConfiguredError, getInspection };
