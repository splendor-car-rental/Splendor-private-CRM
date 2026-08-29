/**
 * Lease-to-Own Operating System (src/server/leaseToOwn.ts)
 * ===========================================================================
 *
 * Runs against the real Firestore emulator -- every mutation here is a
 * genuine transaction/batch (reserveVehicleSlot, runDurableTransaction,
 * runDurableBatch), same pattern as tests/vehicleInspections.test.ts and
 * tests/maintenance.test.ts. globalStore (the in-memory cache leaseToOwn.ts
 * reads customers/vehicles from, same as every other route in this app) is
 * reset and reseeded before each test.
 *
 * Covers: Application lifecycle, Eligibility (incl. KYC guard), Approval/
 * SoD, Vehicle conflict, Payment schedule, Payment + idempotency/
 * concurrency, Late payment, Early settlement, Default, Termination,
 * Ownership transfer, Audit.
 */

import { generateKeyPairSync } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let admin: typeof import('firebase-admin');
let db: FirebaseFirestore.Firestore;
let globalStore: typeof import('../src/server/dataStore').globalStore;
let lto: typeof import('../src/server/leaseToOwn');
let policy: typeof import('../src/server/leaseToOwnPolicy');
let businessRules: typeof import('../src/server/businessRules');
let ApprovalError: typeof import('../src/server/approvals').ApprovalError;
let IdempotencyConflictError: typeof import('../src/server/idempotency').IdempotencyConflictError;
let fingerprintRequest: typeof import('../src/server/idempotency').fingerprintRequest;

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-splendor-crm-rules-test';
const SALES = { uid: 'sales-uid', name: 'Test Sales', role: 'sales' as const };
const CEO = { uid: 'ceo-uid', name: 'Test CEO', role: 'ceo' as const };
const ADMIN_ACTOR = { uid: 'admin-uid', name: 'Test Admin', role: 'admin' as const };

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set -- run via `npm test` (firebase emulators:exec), not vitest directly.');
  }

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const fakeServiceAccount = {
    type: 'service_account',
    project_id: PROJECT_ID,
    private_key_id: 'test-key',
    private_key: privateKey,
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`,
    client_id: '000000000000000000000',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token'
  };

  const adminModule = await import('firebase-admin');
  admin = adminModule.default ?? (adminModule as any);
  admin.initializeApp({ credential: admin.credential.cert(fakeServiceAccount as any), projectId: PROJECT_ID });
  db = admin.firestore();

  ({ globalStore } = await import('../src/server/dataStore'));
  lto = await import('../src/server/leaseToOwn');
  policy = await import('../src/server/leaseToOwnPolicy');
  businessRules = await import('../src/server/businessRules');
  ({ ApprovalError } = await import('../src/server/approvals'));
  ({ IdempotencyConflictError, fingerprintRequest } = await import('../src/server/idempotency'));
});

afterAll(async () => {
  await Promise.all(admin.apps.map((app) => app?.delete()));
});

async function clearCollection(name: string) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

afterEach(async () => {
  await Promise.all([
    'vehicles', 'contracts', 'lto_applications', 'lto_installments', 'lto_settlement_requests',
    'temporary_holds', 'approval_requests', 'payments', 'idempotency_keys', 'vehicle_inspections',
    'blocklist_entries'
  ].map(clearCollection));
});

function setRule(id: string, value: number | null, tier: 'sensitive_rule' | 'business_rule' = 'sensitive_rule') {
  businessRules.__setRuleForTests({ id, label: 'Test', tier, valueType: 'number', value, min: 0, max: 1000000, editable: true } as any);
}

beforeEach(() => {
  globalStore.customers.length = 0;
  globalStore.vehicles.length = 0;
  globalStore.contracts.length = 0;
  globalStore.payments.length = 0;
  globalStore.auditLogs.length = 0;

  setRule('ltoMonthlyMarkupRatePercent', 6);
  setRule('ltoProcessingFeeAed', 1000);
  setRule('ltoOwnershipTransferFeeAed', 500);
  setRule('ltoConsecutiveMissedInstallmentsForDefault', 2, 'business_rule');
  setRule('ltoMinCustomerAgeYears', 21, 'business_rule');
  setRule('ltoGraceDays', 5, 'business_rule');
  setRule('ltoLateThresholdDays', 15, 'business_rule');
  setRule('ltoApplicationHoldDays', 3, 'business_rule');
});

const noopAudit = vi.fn().mockResolvedValue({ id: 'AL-1', timestamp: new Date().toISOString() } as any);

function validCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'CUST-LTO-1', fullName: 'Ahmed Al Test', phone: '+971500000001', email: 'ahmed@test.ae',
    status: 'active', idType: 'emirates_id', idNumber: '784-1990-1234567-1',
    idExpiryDate: '2030-01-01', licenseNumber: 'DXB-LIC-1', licenseExpiryDate: '2030-01-01',
    dateOfBirth: '1990-01-01', nationality: 'UAE',
    ...overrides
  } as any;
}

async function seedVehicle(id: string, overrides: Record<string, unknown> = {}) {
  const vehicle = {
    id, make: 'Rolls-Royce', model: 'Ghost', status: 'available',
    plateNumber: `T-${id}`, vin: `VIN-${id}`, dailyRate: 3000, totalRevenue: 0,
    ...overrides
  };
  await db.collection('vehicles').doc(id).set(vehicle);
  globalStore.vehicles.push(vehicle as any);
  return vehicle;
}

async function seedCustomer(overrides: Record<string, unknown> = {}) {
  const customer = validCustomer(overrides);
  globalStore.customers.push(customer);
  return customer;
}

function baseApplicationInput(customerId: string, vehicleId: string, overrides: Record<string, unknown> = {}) {
  return {
    customerId, customerName: 'Ahmed Al Test', vehicleId, vehicleName: 'Rolls-Royce Ghost',
    requestedTermMonths: 24, requestedDownPayment: 30000, vehiclePrice: 150000,
    ...overrides
  };
}

async function approveFullApplication(customerId: string, vehicleId: string, offerOverrides: Record<string, unknown> = {}) {
  const { result: application } = await lto.createLtoApplication(baseApplicationInput(customerId, vehicleId), SALES, null, undefined, noopAudit);
  await lto.submitLtoApplication(application.id, SALES, noopAudit);
  const { application: decided, contract } = await lto.decideLtoApplication(
    application.id, 'approved', 'Approved for test.',
    { downPayment: 30000, termMonths: 24, hasFinalPayment: false, ...offerOverrides },
    CEO, noopAudit
  );
  return { application: decided, contract: contract! };
}

// ---------------------------------------------------------------------------
// Eligibility / KYC guard
// ---------------------------------------------------------------------------

describe('checkLtoEligibility', () => {
  it('is eligible when KYC, age, and blocklist all pass', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-ELIG-1');
    const result = await lto.checkLtoEligibility(customer.id, 'VEH-ELIG-1');
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('KYC GUARD: blocks when ID/license details are incomplete', async () => {
    const customer = await seedCustomer({ idNumber: undefined, idExpiryDate: undefined });
    await seedVehicle('VEH-ELIG-2');
    const result = await lto.checkLtoEligibility(customer.id, 'VEH-ELIG-2');
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.includes('KYC is incomplete'))).toBe(true);
  });

  it('KYC GUARD: blocks when the ID or license has expired', async () => {
    const customer = await seedCustomer({ idExpiryDate: '2020-01-01' });
    await seedVehicle('VEH-ELIG-3');
    const result = await lto.checkLtoEligibility(customer.id, 'VEH-ELIG-3');
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.includes('expired'))).toBe(true);
  });

  it('blocks a blocklisted customer', async () => {
    const customer = await seedCustomer({ status: 'blocklisted' });
    await seedVehicle('VEH-ELIG-4');
    const result = await lto.checkLtoEligibility(customer.id, 'VEH-ELIG-4');
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.includes('blocklisted'))).toBe(true);
  });

  it('blocks an underage customer and never guesses when date of birth is missing', async () => {
    const tooYoung = await seedCustomer({ id: 'CUST-YOUNG', dateOfBirth: new Date(Date.now() - 19 * 365 * 24 * 60 * 60 * 1000).toISOString() });
    await seedVehicle('VEH-ELIG-5');
    const result = await lto.checkLtoEligibility(tooYoung.id, 'VEH-ELIG-5');
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.toLowerCase().includes('age'))).toBe(true);

    const noDob = await seedCustomer({ id: 'CUST-NODOB', dateOfBirth: undefined });
    const result2 = await lto.checkLtoEligibility(noDob.id, 'VEH-ELIG-5');
    expect(result2.eligible).toBe(false);
    expect(result2.reasons.some(r => r.includes('cannot be verified'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Application lifecycle + Approval/SoD
// ---------------------------------------------------------------------------

describe('Application lifecycle', () => {
  it('DRAFT -> SUBMITTED -> APPROVED creates a real Contract with an installment schedule and moves the vehicle to lto_active', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-APP-1');

    const { application, contract } = await approveFullApplication(customer.id, 'VEH-APP-1');
    expect(application.status).toBe('approved');
    expect(contract.contractType).toBe('lease_to_own');
    expect(contract.lto!.ltoStatus).toBe('active');
    expect(contract.lto!.termMonths).toBe(24);

    const installments = await lto.listLtoInstallments(contract.id);
    // 1 down payment + 24 monthly = 25
    expect(installments.length).toBe(25);
    expect(installments[0].installmentNumber).toBe(0);
    expect(installments[0].amount).toBe(30000);

    const vehicle = globalStore.vehicles.find(v => v.id === 'VEH-APP-1')!;
    expect(vehicle.status).toBe('rented');
    expect((vehicle as any).ltoStatus).toBe('lto_active');
    expect((vehicle as any).ltoContractId).toBe(contract.id);

    // Handover inspection (Module 08 reuse) was auto-started.
    const view = await lto.getLtoContractView(contract.id);
    expect(view.handoverInspectionId).toBeTruthy();
  });

  it('submission is refused for an ineligible customer (KYC guard) and no hold/approval is created', async () => {
    const customer = await seedCustomer({ idNumber: undefined });
    await seedVehicle('VEH-APP-2');
    const { result: application } = await lto.createLtoApplication(baseApplicationInput(customer.id, 'VEH-APP-2'), SALES, null, undefined, noopAudit);
    await expect(lto.submitLtoApplication(application.id, SALES, noopAudit)).rejects.toThrow(/not eligible/);
    const holds = await db.collection('temporary_holds').get();
    expect(holds.empty).toBe(true);
  });

  it('SoD: the same person who submitted cannot decide their own application', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-APP-3');
    const { result: application } = await lto.createLtoApplication(baseApplicationInput(customer.id, 'VEH-APP-3'), SALES, null, undefined, noopAudit);
    await lto.submitLtoApplication(application.id, SALES, noopAudit);
    await expect(
      lto.decideLtoApplication(application.id, 'approved', 'Self-approval attempt.', { downPayment: 30000, termMonths: 24, hasFinalPayment: false }, SALES, noopAudit)
    ).rejects.toBeInstanceOf(ApprovalError);
  });

  it('RBAC/SoD: a non-decider role (e.g. sales) cannot decide an approval request', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-APP-4');
    const { result: application } = await lto.createLtoApplication(baseApplicationInput(customer.id, 'VEH-APP-4'), SALES, null, undefined, noopAudit);
    await lto.submitLtoApplication(application.id, SALES, noopAudit);
    const otherSales = { uid: 'sales-uid-2', name: 'Other Sales', role: 'sales' as const };
    await expect(
      lto.decideLtoApplication(application.id, 'approved', 'Not authorized.', { downPayment: 30000, termMonths: 24, hasFinalPayment: false }, otherSales, noopAudit)
    ).rejects.toBeInstanceOf(ApprovalError);
  });

  it('rejecting an application releases the temporary hold and never creates a contract', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-APP-5');
    const { result: application } = await lto.createLtoApplication(baseApplicationInput(customer.id, 'VEH-APP-5'), SALES, null, undefined, noopAudit);
    await lto.submitLtoApplication(application.id, SALES, noopAudit);
    const { application: rejected, contract } = await lto.decideLtoApplication(application.id, 'rejected', 'Not a fit.', null, CEO, noopAudit);
    expect(rejected.status).toBe('rejected');
    expect(contract).toBeUndefined();
    const holds = await db.collection('temporary_holds').get();
    expect(holds.empty).toBe(true);
  });

  it('idempotent creation: a retried create with the same Idempotency-Key never creates two applications', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-APP-6');
    const input = baseApplicationInput(customer.id, 'VEH-APP-6');
    const first = await lto.createLtoApplication(input, SALES, 'dup-app-key', fingerprintRequest(input), noopAudit);
    const second = await lto.createLtoApplication(input, SALES, 'dup-app-key', fingerprintRequest(input), noopAudit);
    expect(second.replayed).toBe(true);
    expect(second.result.id).toBe(first.result.id);
    const snap = await db.collection('lto_applications').get();
    expect(snap.docs.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Vehicle conflict (reservation-engine reuse)
// ---------------------------------------------------------------------------

describe('Vehicle conflict', () => {
  it('a second LTO application cannot be approved onto a vehicle already under an active LTO agreement', async () => {
    const customerA = await seedCustomer({ id: 'CUST-A' });
    const customerB = await seedCustomer({ id: 'CUST-B' });
    await seedVehicle('VEH-CONFLICT-1');

    await approveFullApplication(customerA.id, 'VEH-CONFLICT-1');

    const { result: appB } = await lto.createLtoApplication(baseApplicationInput(customerB.id, 'VEH-CONFLICT-1'), SALES, null, undefined, noopAudit);
    // The vehicle is no longer 'available' (it's 'rented' after approval A),
    // so submission itself is expected to fail the hold/availability check.
    await expect(lto.submitLtoApplication(appB.id, SALES, noopAudit)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Payment schedule + Payment integrity (idempotency/concurrency)
// ---------------------------------------------------------------------------

describe('Payment recording', () => {
  it('records a payment, updates installment + contract running balances, and creates a real Payment record', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-PAY-1');
    const { contract } = await approveFullApplication(customer.id, 'VEH-PAY-1');
    const installments = await lto.listLtoInstallments(contract.id);
    const downPaymentInstallment = installments.find(i => i.installmentNumber === 0)!;

    const { result } = await lto.recordLtoInstallmentPayment(downPaymentInstallment.id, 30000, 'bank_transfer', SALES, 'pay-key-1', undefined, noopAudit);
    expect(result.installment.status).toBe('paid');
    expect(result.installment.remainingAmount).toBe(0);
    expect(result.contract.lto!.paidAmount).toBe(30000);

    const paymentsSnap = await db.collection('payments').where('contractId', '==', contract.id).get();
    expect(paymentsSnap.docs.length).toBe(1);
    expect(globalStore.payments.some(p => p.contractId === contract.id)).toBe(true);
  });

  it('CONCURRENCY/IDEMPOTENCY: two duplicate payment submissions with the same Idempotency-Key never double-credit', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-PAY-2');
    const { contract } = await approveFullApplication(customer.id, 'VEH-PAY-2');
    const installments = await lto.listLtoInstallments(contract.id);
    const target = installments.find(i => i.installmentNumber === 0)!;

    const [a, b] = await Promise.all([
      lto.recordLtoInstallmentPayment(target.id, 30000, 'bank_transfer', SALES, 'concurrent-pay-key', undefined, noopAudit),
      lto.recordLtoInstallmentPayment(target.id, 30000, 'bank_transfer', SALES, 'concurrent-pay-key', undefined, noopAudit)
    ]);
    expect(a.replayed || b.replayed).toBe(true);

    const paymentsSnap = await db.collection('payments').where('contractId', '==', contract.id).get();
    expect(paymentsSnap.docs.length).toBe(1);
  });

  it('rejects a payment that exceeds the installment\'s remaining amount', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-PAY-3');
    const { contract } = await approveFullApplication(customer.id, 'VEH-PAY-3');
    const installments = await lto.listLtoInstallments(contract.id);
    const target = installments.find(i => i.installmentNumber === 0)!;
    await expect(
      lto.recordLtoInstallmentPayment(target.id, 999999, 'bank_transfer', SALES, null, undefined, noopAudit)
    ).rejects.toThrow(/exceeds the remaining amount/);
  });

  it('rejects further payment against an already-paid installment', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-PAY-4');
    const { contract } = await approveFullApplication(customer.id, 'VEH-PAY-4');
    const installments = await lto.listLtoInstallments(contract.id);
    const target = installments.find(i => i.installmentNumber === 0)!;
    await lto.recordLtoInstallmentPayment(target.id, 30000, 'bank_transfer', SALES, 'first-pay', undefined, noopAudit);
    await expect(
      lto.recordLtoInstallmentPayment(target.id, 10, 'bank_transfer', SALES, 'second-pay', undefined, noopAudit)
    ).rejects.toThrow(/already paid/);
  });
});

// ---------------------------------------------------------------------------
// Late payment / Default
// ---------------------------------------------------------------------------

describe('Late payment + Default (Clause 3: two consecutive missed months)', () => {
  it('flags default once two consecutive monthly installments are missed past their due dates', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-DEFAULT-1');
    const { contract } = await approveFullApplication(customer.id, 'VEH-DEFAULT-1');

    // Push installments #1 and #2 into the past so they read as genuinely missed.
    const installments = await lto.listLtoInstallments(contract.id);
    const past = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const pastEarlier = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString();
    const inst1 = installments.find(i => i.installmentNumber === 1)!;
    const inst2 = installments.find(i => i.installmentNumber === 2)!;
    await db.collection('lto_installments').doc(inst1.id).update({ dueDate: pastEarlier });
    await db.collection('lto_installments').doc(inst2.id).update({ dueDate: past });

    const updatedContract = await lto.markLtoDefault(contract.id, CEO, noopAudit);
    expect(updatedContract.lto!.ltoStatus).toBe('default');
    const vehicle = globalStore.vehicles.find(v => v.id === 'VEH-DEFAULT-1')!;
    expect((vehicle as any).ltoStatus).toBe('lto_default');
  });

  it('refuses to flag default when the missed streak is below the configured threshold', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-DEFAULT-2');
    const { contract } = await approveFullApplication(customer.id, 'VEH-DEFAULT-2');
    await expect(lto.markLtoDefault(contract.id, CEO, noopAudit)).rejects.toThrow(/below the/);
  });
});

// ---------------------------------------------------------------------------
// Early Settlement (Clause 6: no percentage penalty)
// ---------------------------------------------------------------------------

describe('Early settlement', () => {
  it('computes final settlement as outstanding balance + flat transfer fee (no percentage), and completing it settles all remaining installments', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-SETTLE-1');
    const { contract } = await approveFullApplication(customer.id, 'VEH-SETTLE-1');

    const request = await lto.requestLtoEarlySettlement(contract.id, 0, undefined, SALES, noopAudit);
    expect(request.ownershipTransferFee).toBe(500);
    expect(request.finalSettlementAmount).toBe(request.outstandingBalance + 500);

    const decided = await lto.decideLtoEarlySettlement(request.id, 'approved', 'Approved.', CEO, noopAudit);
    expect(decided.status).toBe('completed');

    const view = await lto.getLtoContractView(contract.id);
    expect(view.contract.lto!.ltoStatus).toBe('settled');
    expect(view.installments.every(i => i.status === 'paid' || i.status === 'settled')).toBe(true);
  });

  it('rejecting a settlement request returns the agreement to active', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-SETTLE-2');
    const { contract } = await approveFullApplication(customer.id, 'VEH-SETTLE-2');
    const request = await lto.requestLtoEarlySettlement(contract.id, 0, undefined, SALES, noopAudit);
    const decided = await lto.decideLtoEarlySettlement(request.id, 'rejected', 'Not approved.', CEO, noopAudit);
    expect(decided.status).toBe('rejected');
    const view = await lto.getLtoContractView(contract.id);
    expect(view.contract.lto!.ltoStatus).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// Termination -> Ownership Transfer -> Completion
// ---------------------------------------------------------------------------

describe('Termination, recovery, ownership transfer, completion', () => {
  it('termination requires a decision and never auto-recovers the vehicle; recovery is a separate staff-confirmed step', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-TERM-1');
    const { contract } = await approveFullApplication(customer.id, 'VEH-TERM-1');

    await lto.requestLtoTermination(contract.id, 'Customer requested exit.', SALES, noopAudit);
    let view = await lto.getLtoContractView(contract.id);
    expect(view.contract.lto!.ltoStatus).toBe('termination_requested');
    // Vehicle must NOT already be recovered/available just from the request.
    expect(globalStore.vehicles.find(v => v.id === 'VEH-TERM-1')!.status).toBe('rented');

    const decided = await lto.decideLtoTermination(contract.id, 'approved', 'Approved termination.', CEO, noopAudit);
    expect(decided.lto!.ltoStatus).toBe('terminated');
    expect(globalStore.vehicles.find(v => v.id === 'VEH-TERM-1')! as any).toHaveProperty('ltoStatus', 'lto_recovery');

    const recoveredVehicle = await lto.markLtoVehicleRecovered(contract.id, SALES, noopAudit);
    expect(recoveredVehicle.status).toBe('available');
    expect((recoveredVehicle as any).ltoStatus).toBeUndefined();
  });

  it('ownership transfer is only recorded once staff confirms it -- never an automatic RTA integration', async () => {
    const customer = await seedCustomer();
    await seedVehicle('VEH-OWN-1');
    const { contract } = await approveFullApplication(customer.id, 'VEH-OWN-1');

    // Fully settle first (required before ownership transfer in this lifecycle).
    const request = await lto.requestLtoEarlySettlement(contract.id, 0, undefined, SALES, noopAudit);
    await lto.decideLtoEarlySettlement(request.id, 'approved', 'Approved.', CEO, noopAudit);

    await lto.requestLtoOwnershipTransfer(contract.id, SALES, noopAudit);
    let view = await lto.getLtoContractView(contract.id);
    expect(view.contract.lto!.ltoStatus).toBe('ownership_transfer_pending');

    const confirmed = await lto.confirmLtoOwnershipTransfer(contract.id, 'docs/transfer-evidence.pdf', CEO, noopAudit);
    expect(confirmed.lto!.ltoStatus).toBe('ownership_transferred');
    expect(globalStore.vehicles.find(v => v.id === 'VEH-OWN-1')! as any).toHaveProperty('ltoStatus', 'owned');
    expect(globalStore.vehicles.find(v => v.id === 'VEH-OWN-1')!.lifecycleStatus).toBe('TRANSFERRED');

    const completed = await lto.completeLtoAgreement(contract.id, CEO, noopAudit);
    expect(completed.lto!.ltoStatus).toBe('completed');
    expect(completed.status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

describe('Audit', () => {
  it('every sensitive LTO action calls the injected recordAudit', async () => {
    noopAudit.mockClear();
    const customer = await seedCustomer();
    await seedVehicle('VEH-AUDIT-1');
    await approveFullApplication(customer.id, 'VEH-AUDIT-1');
    // create, submit(approval create), decide(approval decide + contract create) -> at least 4 audit calls
    expect(noopAudit.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
