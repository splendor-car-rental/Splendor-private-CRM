import { UAE_VAT_RATE, vatPortion } from '../config/tax';

export interface ContractExtensionActor {
  uid: string;
  name: string;
  role: string;
}

export interface ContractExtensionRecoveryInput {
  contractId: string;
  newEndDateTime: string;
  customDailyRate?: unknown;
  currentOdometerKm?: unknown;
  paymentMethod?: string;
  paymentMethodLabel?: string;
  issueDate?: string;
  notes?: string;
  actor: ContractExtensionActor;
  addendumId: string;
  now?: string;
}

export interface ContractExtensionRecoveryResult {
  contract: Record<string, any>;
  addendum: Record<string, any>;
  extraDays: number;
  extraAmount: number;
}

export class ContractExtensionRecoveryError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ContractExtensionRecoveryError';
  }
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Clean recovery of the legacy formal extension transaction.
 *
 * The invariant that fixes #35 is structural: every Firestore read required
 * by the mutation is completed before the first tx.set(). The addendum id is
 * issued by the caller before this transaction so no nested Firestore
 * transaction is opened while this transaction is active.
 *
 * Commercial fields deliberately preserve the current operational behavior;
 * this module does not claim that the configured VAT value is filing-ready
 * tax evidence. Tax governance remains a separate release gate.
 */
export async function executeContractExtensionTransaction(
  db: FirebaseFirestore.Firestore,
  input: ContractExtensionRecoveryInput
): Promise<ContractExtensionRecoveryResult> {
  const contractRef = db.collection('contracts').doc(input.contractId);
  const now = input.now || new Date().toISOString();

  return db.runTransaction(async tx => {
    // READ 1: authoritative contract.
    const contractSnap = await tx.get(contractRef);
    if (!contractSnap.exists) throw new ContractExtensionRecoveryError(404, 'Contract not found.');
    const contract = { id: contractSnap.id, ...(contractSnap.data() as Record<string, unknown>) } as Record<string, any>;

    const prevEnd = new Date(contract.endDateTime).getTime();
    const nextEnd = new Date(input.newEndDateTime).getTime();
    if (!Number.isFinite(prevEnd) || !Number.isFinite(nextEnd) || nextEnd <= prevEnd) {
      throw new ContractExtensionRecoveryError(400, 'New end date/time must be strictly after the current contract end date/time.');
    }

    // READ 2: bound vehicle. Critically, this is before every write.
    const vehicleRef = contract.vehicleId ? db.collection('vehicles').doc(String(contract.vehicleId)) : null;
    const vehicleSnap = vehicleRef ? await tx.get(vehicleRef) : null;
    if (vehicleRef && (!vehicleSnap || !vehicleSnap.exists)) {
      throw new ContractExtensionRecoveryError(409, 'Bound vehicle record does not exist.');
    }

    const diffMs = nextEnd - prevEnd;
    const extraDays = Math.max(1, Math.ceil(diffMs / 86_400_000));
    const requestedRate = Number(input.customDailyRate);
    const rate = input.customDailyRate !== undefined && Number.isFinite(requestedRate) && requestedRate > 0
      ? requestedRate
      : Number(contract.dailyRate || 0);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new ContractExtensionRecoveryError(409, 'Contract has no valid extension daily rate.');
    }

    const periodRentalAmount = money(rate * extraDays);
    const vatAmount = money(vatPortion(periodRentalAmount));
    const totalExtensionAmount = money(periodRentalAmount + vatAmount);
    const issueDate = String(input.issueDate || now.slice(0, 10));
    const addendumSeq = String((Array.isArray(contract.extensions) ? contract.extensions.length : 0) + 1).padStart(4, '0');
    const addendumNumber = `EXT-${new Date(now).getUTCFullYear()}-${addendumSeq}`;
    const paymentMethod = String(input.paymentMethod || 'credit_card');

    const addendumRecord = {
      id: input.addendumId,
      addendumNumber,
      contractId: contract.id,
      contractNumber: contract.contractNumber || contract.id,
      issueDate,
      customerName: contract.customerName,
      customerPhone: contract.customerPhone,
      plateNumber: contract.vehiclePlate,
      vehicleName: contract.vehicleName,
      currentEndDateTime: contract.endDateTime,
      newEndDateTime: input.newEndDateTime,
      extensionDurationDays: extraDays,
      currentOdometerKm: Number(input.currentOdometerKm) || Number(contract.handover?.startMileage || 0),
      dailyRate: rate,
      periodRentalAmount,
      vatRatePercent: UAE_VAT_RATE * 100,
      vatAmount,
      totalExtensionAmount,
      paymentMethod,
      paymentMethodLabel: input.paymentMethodLabel || paymentMethod,
      bankDetails: {
        bankName: 'بنك الإمارات دبي الوطني (Emirates NBD)',
        accountNumber: '1015963340001',
        iban: 'AE220260001015963340001'
      },
      notes: input.notes || `Contract extension for ${extraDays} day(s).`,
      createdBy: input.actor.uid,
      createdByName: input.actor.name,
      createdAt: now,
      updatedAt: now
    };

    const updated = {
      ...contract,
      endDateTime: input.newEndDateTime,
      dailyRate: rate,
      rentalTotal: money(Number(contract.rentalTotal || 0) + periodRentalAmount),
      vatAmount: money(Number(contract.vatAmount || 0) + vatAmount),
      grandTotal: money(Number(contract.grandTotal || 0) + totalExtensionAmount),
      extensions: [...(Array.isArray(contract.extensions) ? contract.extensions : []), addendumRecord],
      updatedAt: now
    };

    // WRITES start only here, after every required read above has completed.
    tx.set(contractRef, updated, { merge: false });
    if (vehicleRef) tx.set(vehicleRef, { updatedAt: now }, { merge: true });

    return { contract: updated, addendum: addendumRecord, extraDays, extraAmount: totalExtensionAmount };
  });
}
