import { createHash } from 'node:crypto';
import admin from 'firebase-admin';

export type ContractLifecycleActor = { uid: string; name: string; role: string };

export class ContractLifecycleTransitionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ContractLifecycleTransitionError';
    this.status = status;
  }
}

const REQUIRED_KYC: Record<string, string[]> = {
  UAE_RESIDENT: ['EMIRATES_ID_FRONT', 'EMIRATES_ID_BACK', 'DRIVING_LICENSE_FRONT', 'DRIVING_LICENSE_BACK'],
  GCC_NATIONAL: ['PASSPORT', 'DRIVING_LICENSE_FRONT', 'DRIVING_LICENSE_BACK'],
  TOURIST: ['PASSPORT', 'VISA_ENTRY_STAMP', 'DRIVING_LICENSE_FRONT']
};

function firestore() {
  if (admin.apps.length === 0) throw new ContractLifecycleTransitionError(503, 'Server persistence is not configured.');
  return admin.firestore();
}

function calculateAge(dobIso: string, referenceIso: string): number {
  const dob = new Date(dobIso);
  const ref = new Date(referenceIso);
  if (!Number.isFinite(dob.getTime()) || !Number.isFinite(ref.getTime())) return 0;
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = ref.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && ref.getUTCDate() < dob.getUTCDate())) age--;
  return Math.max(0, age);
}

function assertRentalContract(contract: any) {
  if (contract.contractType === 'lease_to_own') {
    throw new ContractLifecycleTransitionError(409, 'Lease-to-Own contracts use the dedicated LTO approval lifecycle.');
  }
}

function assertKycApprovedForContract(customer: any, contract: any) {
  if (!customer || customer.status === 'blocklisted') {
    throw new ContractLifecycleTransitionError(409, 'Contract approval blocked: customer is missing or blocklisted.');
  }
  const profile = customer.kycProfile;
  if (!profile || profile.status !== 'VERIFIED') {
    throw new ContractLifecycleTransitionError(409, 'Contract approval blocked: customer KYC must be VERIFIED.');
  }
  const dob = String(profile.dateOfBirth || customer.dateOfBirth || '').trim();
  if (!profile.isAgeVerified || !dob || (!customer.dateOfBirth && dob === '1995-01-01')) {
    throw new ContractLifecycleTransitionError(409, 'Contract approval blocked: customer age has not been genuinely verified.');
  }
  const age = calculateAge(dob, contract.startDateTime || new Date().toISOString());
  if (age < 21) throw new ContractLifecycleTransitionError(409, `Contract approval blocked: customer age (${age}) is below the minimum rental age.`);

  const required = REQUIRED_KYC[String(profile.customerCategory || 'TOURIST')] || REQUIRED_KYC.TOURIST;
  const documents = Array.isArray(profile.documents) ? profile.documents : [];
  const rentalEnd = new Date(contract.endDateTime).getTime();
  for (const category of required) {
    const document = documents.find((d: any) => d?.category === category && d?.status === 'ACCEPTED');
    if (!document) throw new ContractLifecycleTransitionError(409, `Contract approval blocked: ${category} is not approved.`);
    if (document.expiryDate) {
      const expiry = new Date(document.expiryDate).getTime();
      if (!Number.isFinite(expiry) || !Number.isFinite(rentalEnd) || expiry < rentalEnd) {
        throw new ContractLifecycleTransitionError(409, `Contract approval blocked: ${category} expires before the rental ends.`);
      }
    }
  }
}

export async function submitRentalContractForReview(contractId: string, actor: ContractLifecycleActor) {
  const db = firestore();
  const ref = db.collection('contracts').doc(contractId);
  const now = new Date().toISOString();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ContractLifecycleTransitionError(404, 'Contract not found.');
    const contract = { id: snap.id, ...(snap.data() as any) };
    assertRentalContract(contract);
    if (contract.status !== 'draft') {
      throw new ContractLifecycleTransitionError(409, `Only a draft contract can be submitted for review; current status is ${contract.status}.`);
    }
    if (!contract.customerId || !contract.vehicleId || !contract.startDateTime || !contract.endDateTime) {
      throw new ContractLifecycleTransitionError(409, 'Contract is missing required customer, vehicle, or rental-window data.');
    }
    if (!(Number(contract.grandTotal) > 0) || Number(contract.depositAmount) < 0) {
      throw new ContractLifecycleTransitionError(409, 'Contract commercial values are invalid.');
    }

    const lifecycleReview = {
      submittedBy: actor.uid,
      submittedByName: actor.name,
      submittedByRole: actor.role,
      submittedAt: now
    };
    tx.set(ref, { status: 'review', lifecycleReview, updatedAt: now }, { merge: true });
    return { ...contract, status: 'review', lifecycleReview, updatedAt: now };
  });
}

export async function approveRentalContract(contractId: string, actor: ContractLifecycleActor) {
  const db = firestore();
  const ref = db.collection('contracts').doc(contractId);
  const now = new Date().toISOString();

  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ContractLifecycleTransitionError(404, 'Contract not found.');
    const contract = { id: snap.id, ...(snap.data() as any) };
    assertRentalContract(contract);
    if (contract.status !== 'review') {
      throw new ContractLifecycleTransitionError(409, `Only a contract in review can be approved; current status is ${contract.status}.`);
    }
    if (!contract.lifecycleReview?.submittedBy) {
      throw new ContractLifecycleTransitionError(409, 'Contract has no server-recorded review submission evidence.');
    }
    if (contract.lifecycleReview.submittedBy === actor.uid) {
      throw new ContractLifecycleTransitionError(409, 'Four-Eyes control: the reviewer who submitted this contract cannot approve it.');
    }

    const customerRef = db.collection('customers').doc(contract.customerId);
    const vehicleRef = db.collection('vehicles').doc(contract.vehicleId);
    const conflictsQuery = db.collection('contracts').where('vehicleId', '==', contract.vehicleId);
    const [customerSnap, vehicleSnap, conflictsSnap] = await Promise.all([
      tx.get(customerRef),
      tx.get(vehicleRef),
      tx.get(conflictsQuery)
    ]);
    if (!customerSnap.exists) throw new ContractLifecycleTransitionError(409, 'Customer record not found.');
    if (!vehicleSnap.exists) throw new ContractLifecycleTransitionError(409, 'Vehicle record not found.');

    const customer = { id: customerSnap.id, ...(customerSnap.data() as any) };
    const vehicle = { id: vehicleSnap.id, ...(vehicleSnap.data() as any) };
    assertKycApprovedForContract(customer, contract);

    if (vehicle.lifecycleStatus && vehicle.lifecycleStatus !== 'ACTIVE') {
      throw new ContractLifecycleTransitionError(409, `Contract approval blocked: vehicle lifecycle is ${vehicle.lifecycleStatus}.`);
    }
    if (['maintenance', 'unavailable'].includes(String(vehicle.status || ''))) {
      throw new ContractLifecycleTransitionError(409, `Contract approval blocked: vehicle is ${vehicle.status}.`);
    }
    if (vehicle.status === 'rented' && vehicle.currentContractId !== contract.id) {
      throw new ContractLifecycleTransitionError(409, 'Contract approval blocked: vehicle is already rented under another contract.');
    }

    const start = new Date(contract.startDateTime).getTime();
    const end = new Date(contract.endDateTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new ContractLifecycleTransitionError(409, 'Contract rental window is invalid.');
    }
    for (const doc of conflictsSnap.docs) {
      if (doc.id === contract.id) continue;
      const other = doc.data() as any;
      if (!['approved', 'signed', 'active'].includes(String(other.status || ''))) continue;
      const otherStart = new Date(other.startDateTime).getTime();
      const otherEnd = new Date(other.endDateTime).getTime();
      if (Number.isFinite(otherStart) && Number.isFinite(otherEnd) && start <= otherEnd && end >= otherStart) {
        throw new ContractLifecycleTransitionError(409, `Contract approval blocked by overlapping ${other.status} contract ${doc.id}.`);
      }
    }

    const lifecycleApproval = {
      approvedBy: actor.uid,
      approvedByName: actor.name,
      approvedByRole: actor.role,
      approvedAt: now,
      reviewSubmittedBy: contract.lifecycleReview.submittedBy
    };
    tx.set(ref, { status: 'approved', lifecycleApproval, updatedAt: now }, { merge: true });
    return { ...contract, status: 'approved', lifecycleApproval, updatedAt: now };
  });
}

function validateSignedFile(buffer: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' {
  if (buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  throw new ContractLifecycleTransitionError(400, 'Signed contract evidence must be a genuine PDF, JPEG, or PNG file.');
}

/**
 * Final signing transition. A scanned/in-person signed artifact is promoted
 * from the customer's private upload area to an immutable contract-specific
 * storage path before Firestore status moves to `signed`.
 *
 * Remote OTP/e-signing is deliberately NOT simulated here. Until a verified
 * identity/signature provider is integrated, this endpoint records only an
 * authenticated staff-witnessed physical/scanned signing event.
 */
export async function signApprovedRentalContract(
  contractId: string,
  signedDocumentPath: string,
  actor: ContractLifecycleActor
) {
  const db = firestore();
  const contractRef = db.collection('contracts').doc(contractId);
  const initialSnap = await contractRef.get();
  if (!initialSnap.exists) throw new ContractLifecycleTransitionError(404, 'Contract not found.');
  const initialContract = { id: initialSnap.id, ...(initialSnap.data() as any) };
  assertRentalContract(initialContract);
  if (initialContract.status !== 'approved') {
    throw new ContractLifecycleTransitionError(409, `Only an approved contract can be signed; current status is ${initialContract.status}.`);
  }

  const sourcePath = String(signedDocumentPath || '').trim();
  const expectedPrefix = `customer-documents/${initialContract.customerId}/`;
  if (!sourcePath.startsWith(expectedPrefix) || sourcePath.includes('..')) {
    throw new ContractLifecycleTransitionError(400, 'Signed contract evidence must come from this customer\'s authenticated document upload area.');
  }

  let bytes: Buffer;
  try {
    [bytes] = await admin.storage().bucket().file(sourcePath).download();
  } catch {
    throw new ContractLifecycleTransitionError(404, 'Signed contract evidence file was not found in private storage.');
  }
  if (!bytes.length) throw new ContractLifecycleTransitionError(400, 'Signed contract evidence file is empty.');
  const contentType = validateSignedFile(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const extension = contentType === 'application/pdf' ? 'pdf' : contentType === 'image/jpeg' ? 'jpg' : 'png';
  const immutableStoragePath = `signed-contracts/${contractId}/${sha256}.${extension}`;

  await admin.storage().bucket().file(immutableStoragePath).save(bytes, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: 'private, no-store',
      metadata: {
        contractId,
        sourceSha256: sha256,
        sourcePath,
        promotedBy: actor.uid
      }
    }
  });

  const now = new Date().toISOString();
  return db.runTransaction(async tx => {
    const snap = await tx.get(contractRef);
    if (!snap.exists) throw new ContractLifecycleTransitionError(404, 'Contract not found.');
    const contract = { id: snap.id, ...(snap.data() as any) };
    assertRentalContract(contract);

    if (contract.status === 'signed' && contract.signingEvidence?.sha256 === sha256) return contract;
    if (contract.status !== 'approved') {
      throw new ContractLifecycleTransitionError(409, `Contract changed while signing; current status is ${contract.status}.`);
    }
    if (!contract.lifecycleApproval?.approvedBy) {
      throw new ContractLifecycleTransitionError(409, 'Contract has no server-recorded approval evidence.');
    }

    const signingEvidence = {
      method: 'in_person_scanned',
      immutableStoragePath,
      sha256,
      contentType,
      sourceUploadPath: sourcePath,
      customerId: contract.customerId,
      customerName: contract.customerName,
      witnessedBy: actor.uid,
      witnessedByName: actor.name,
      witnessedByRole: actor.role,
      signedAt: now
    };
    tx.set(contractRef, {
      status: 'signed',
      termsAccepted: true,
      signingEvidence,
      updatedAt: now
    }, { merge: true });
    return { ...contract, status: 'signed', termsAccepted: true, signingEvidence, updatedAt: now };
  });
}
