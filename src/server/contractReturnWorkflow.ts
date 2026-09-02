import admin from 'firebase-admin';

export type ContractReturnActor = {
  uid: string;
  name: string;
  role: string;
};

export class ContractReturnWorkflowError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ContractReturnWorkflowError';
    this.status = status;
  }
}

export type BeginReturnResult = {
  contract: any;
  vehicle: any;
  customer: any;
  inspection: any;
};

export type SettleReturnInput = {
  settlementReference: string;
  settlementNotes?: string;
  settledChargeIds?: string[];
};

export type SettleReturnResult = {
  contract: any;
  vehicle: any;
  customer: any;
  inspection: any;
  settledChargeIds: string[];
};

function db() {
  if (admin.apps.length === 0) {
    throw new ContractReturnWorkflowError(503, 'Server persistence is not configured.');
  }
  return admin.firestore();
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSettledCharge(charge: any): boolean {
  if (!charge) return true;
  if (['cancelled', 'waived', 'rejected'].includes(String(charge.status || '').toLowerCase())) return true;
  if (charge.approvalStatus && charge.approvalStatus !== 'approved') return true;
  return Boolean(charge.deductedFromDepositId || charge.settledAt || charge.settlementReference);
}

/**
 * First half of vehicle return.
 *
 * This is intentionally NOT contract closure. The physical vehicle can be
 * back in SPLENDOR custody while finance still needs to settle damage,
 * excess mileage, tolls/fines, or invoices. During this state the vehicle
 * is `unavailable`, preventing an unsafe immediate re-rental.
 */
export async function beginContractReturn(
  contractId: string,
  inspectionId: string,
  actor: ContractReturnActor
): Promise<BeginReturnResult> {
  if (!contractId) throw new ContractReturnWorkflowError(400, 'contractId is required.');
  if (!inspectionId) throw new ContractReturnWorkflowError(400, 'A completed return inspection is required.');

  const firestore = db();
  const now = new Date().toISOString();

  return firestore.runTransaction(async tx => {
    const contractRef = firestore.collection('contracts').doc(contractId);
    const inspectionRef = firestore.collection('vehicle_inspections').doc(inspectionId);

    const [contractSnap, inspectionSnap] = await Promise.all([
      tx.get(contractRef),
      tx.get(inspectionRef)
    ]);
    if (!contractSnap.exists) throw new ContractReturnWorkflowError(404, 'Contract not found.');
    if (!inspectionSnap.exists) throw new ContractReturnWorkflowError(404, 'Return inspection not found.');

    const contract = { id: contractSnap.id, ...(contractSnap.data() as any) };
    const inspection = { id: inspectionSnap.id, ...(inspectionSnap.data() as any) };

    if (contract.status !== 'active') {
      throw new ContractReturnWorkflowError(409, `Only an active contract can enter return settlement; current status is ${contract.status || 'unknown'}.`);
    }
    if (contract.returnWorkflow?.status === 'settlement_pending') {
      throw new ContractReturnWorkflowError(409, 'This contract is already awaiting return settlement.');
    }
    if (inspection.type !== 'return' || inspection.status !== 'completed') {
      throw new ContractReturnWorkflowError(409, 'The linked vehicle inspection must be a completed return inspection.');
    }
    if (inspection.contractId !== contract.id || inspection.vehicleId !== contract.vehicleId) {
      throw new ContractReturnWorkflowError(409, 'Return inspection is not bound to this exact contract and vehicle.');
    }

    const vehicleRef = firestore.collection('vehicles').doc(contract.vehicleId);
    const customerRef = firestore.collection('customers').doc(contract.customerId);
    const [vehicleSnap, customerSnap] = await Promise.all([tx.get(vehicleRef), tx.get(customerRef)]);
    if (!vehicleSnap.exists) throw new ContractReturnWorkflowError(409, 'Vehicle record not found.');
    if (!customerSnap.exists) throw new ContractReturnWorkflowError(409, 'Customer record not found.');

    const vehicle = { id: vehicleSnap.id, ...(vehicleSnap.data() as any) };
    const customer = { id: customerSnap.id, ...(customerSnap.data() as any) };
    if (vehicle.currentContractId && vehicle.currentContractId !== contract.id) {
      throw new ContractReturnWorkflowError(409, 'Vehicle is currently bound to a different contract.');
    }

    const returnMileage = finiteNumber(inspection.mileage);
    const handoverMileage = finiteNumber(contract.handover?.startMileage);
    if (returnMileage === null) {
      throw new ContractReturnWorkflowError(409, 'Completed return inspection is missing a valid odometer reading.');
    }
    if (handoverMileage !== null && returnMileage < handoverMileage) {
      throw new ContractReturnWorkflowError(409, 'Return odometer cannot be below the handover odometer.');
    }

    const unresolvedDamage = Array.isArray(inspection.damages)
      ? inspection.damages.find((damage: any) => damage?.liabilityStatus === 'pending_review')
      : null;
    if (unresolvedDamage) {
      throw new ContractReturnWorkflowError(409, `Damage ${unresolvedDamage.id || ''} still requires a liability decision.`);
    }

    const returnDetails = {
      inspectionId: inspection.id,
      returnDateTime: inspection.completedAt || now,
      endMileage: returnMileage,
      fuelLevelPercent: finiteNumber(inspection.fuelLevelPercent),
      exteriorCondition: inspection.exteriorCondition,
      interiorCondition: inspection.interiorCondition,
      damages: inspection.damages || [],
      customerAcknowledgement: inspection.customerAcknowledgement,
      notes: inspection.notes || ''
    };
    const returnWorkflow = {
      status: 'settlement_pending',
      inspectionId: inspection.id,
      returnedAt: now,
      receivedBy: actor.uid,
      receivedByName: actor.name
    };

    const updatedContract = {
      ...contract,
      returnDetails,
      returnWorkflow,
      updatedAt: now
    };
    const updatedVehicle = {
      ...vehicle,
      status: 'unavailable',
      mileage: returnMileage,
      currentCustomerId: contract.customerId,
      currentContractId: contract.id,
      updatedAt: now
    };

    tx.set(contractRef, { returnDetails, returnWorkflow, updatedAt: now }, { merge: true });
    tx.set(vehicleRef, {
      status: 'unavailable',
      mileage: returnMileage,
      currentCustomerId: contract.customerId,
      currentContractId: contract.id,
      updatedAt: now
    }, { merge: true });

    return { contract: updatedContract, vehicle: updatedVehicle, customer, inspection };
  });
}

/**
 * Second half of vehicle return.
 *
 * Closure is a finance/management decision, not a browser-calculated total.
 * It requires a completed inspection, at least one final contract invoice,
 * every non-cancelled invoice paid to zero, and every approved charge either
 * already settled or explicitly included in this settlement reference.
 */
export async function settleContractReturn(
  contractId: string,
  input: SettleReturnInput,
  actor: ContractReturnActor
): Promise<SettleReturnResult> {
  const settlementReference = String(input?.settlementReference || '').trim();
  if (!settlementReference) {
    throw new ContractReturnWorkflowError(400, 'A settlementReference is required to close the contract.');
  }

  const explicitlySettled = new Set((input.settledChargeIds || []).map(String));
  const firestore = db();
  const now = new Date().toISOString();

  return firestore.runTransaction(async tx => {
    const contractRef = firestore.collection('contracts').doc(contractId);
    const contractSnap = await tx.get(contractRef);
    if (!contractSnap.exists) throw new ContractReturnWorkflowError(404, 'Contract not found.');
    const contract = { id: contractSnap.id, ...(contractSnap.data() as any) };

    if (contract.status !== 'active' || contract.returnWorkflow?.status !== 'settlement_pending') {
      throw new ContractReturnWorkflowError(409, 'Contract is not in return settlement state.');
    }
    const inspectionId = String(contract.returnWorkflow.inspectionId || '');
    if (!inspectionId) throw new ContractReturnWorkflowError(409, 'Return workflow is missing its inspection binding.');

    const vehicleRef = firestore.collection('vehicles').doc(contract.vehicleId);
    const customerRef = firestore.collection('customers').doc(contract.customerId);
    const inspectionRef = firestore.collection('vehicle_inspections').doc(inspectionId);
    const invoicesQuery = firestore.collection('invoices').where('contractId', '==', contract.id);
    const chargesQuery = firestore.collection('charges').where('relatedContractId', '==', contract.id);

    const [vehicleSnap, customerSnap, inspectionSnap, invoicesSnap, chargesSnap] = await Promise.all([
      tx.get(vehicleRef),
      tx.get(customerRef),
      tx.get(inspectionRef),
      tx.get(invoicesQuery),
      tx.get(chargesQuery)
    ]);

    if (!vehicleSnap.exists) throw new ContractReturnWorkflowError(409, 'Vehicle record not found.');
    if (!customerSnap.exists) throw new ContractReturnWorkflowError(409, 'Customer record not found.');
    if (!inspectionSnap.exists || (inspectionSnap.data() as any)?.status !== 'completed') {
      throw new ContractReturnWorkflowError(409, 'Completed return inspection no longer exists.');
    }

    const liveInvoices = invoicesSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(invoice => String(invoice.status || '').toLowerCase() !== 'cancelled');
    if (liveInvoices.length === 0) {
      throw new ContractReturnWorkflowError(409, 'Contract cannot be closed until a final invoice exists.');
    }
    const unpaidInvoice = liveInvoices.find(invoice => Number(invoice.balanceDue || 0) > 0.001);
    if (unpaidInvoice) {
      throw new ContractReturnWorkflowError(409, `Invoice ${unpaidInvoice.invoiceNumber || unpaidInvoice.id} still has an outstanding balance.`);
    }

    const approvedCharges = chargesSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(charge => !charge.approvalStatus || charge.approvalStatus === 'approved');
    const chargesNeedingSettlement = approvedCharges.filter(charge => !isSettledCharge(charge));
    const missingExplicitSettlement = chargesNeedingSettlement.filter(charge => !explicitlySettled.has(charge.id));
    if (missingExplicitSettlement.length > 0) {
      throw new ContractReturnWorkflowError(
        409,
        `Approved charges still require settlement confirmation: ${missingExplicitSettlement.map(c => c.id).join(', ')}.`
      );
    }

    const vehicle = { id: vehicleSnap.id, ...(vehicleSnap.data() as any) };
    const customer = { id: customerSnap.id, ...(customerSnap.data() as any) };
    const inspection = { id: inspectionSnap.id, ...(inspectionSnap.data() as any) };

    const returnWorkflow = {
      ...contract.returnWorkflow,
      status: 'closed',
      settlementReference,
      settlementNotes: input.settlementNotes || '',
      settledBy: actor.uid,
      settledByName: actor.name,
      settledAt: now
    };
    const updatedContract = {
      ...contract,
      status: 'completed',
      returnWorkflow,
      updatedAt: now
    };
    const updatedVehicle = {
      ...vehicle,
      status: 'available',
      currentCustomerId: null,
      currentContractId: null,
      updatedAt: now
    };
    const updatedCustomer = {
      ...customer,
      lifetimeValue: Number(customer.lifetimeValue || 0) + Number(contract.grandTotal || 0),
      updatedAt: now
    };

    // All reads happen above; writes begin here.
    for (const charge of chargesNeedingSettlement) {
      if (!explicitlySettled.has(charge.id)) continue;
      tx.set(firestore.collection('charges').doc(charge.id), {
        settledAt: now,
        settledBy: actor.uid,
        settledByName: actor.name,
        settlementReference,
        updatedAt: now
      }, { merge: true });
    }
    tx.set(contractRef, { status: 'completed', returnWorkflow, updatedAt: now }, { merge: true });
    tx.set(vehicleRef, {
      status: 'available',
      currentCustomerId: null,
      currentContractId: null,
      updatedAt: now
    }, { merge: true });
    tx.set(customerRef, { lifetimeValue: updatedCustomer.lifetimeValue, updatedAt: now }, { merge: true });

    return {
      contract: updatedContract,
      vehicle: updatedVehicle,
      customer: updatedCustomer,
      inspection,
      settledChargeIds: chargesNeedingSettlement.filter(charge => explicitlySettled.has(charge.id)).map(charge => charge.id)
    };
  });
}
