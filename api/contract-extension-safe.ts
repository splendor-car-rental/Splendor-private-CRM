import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { getVerifiedActiveStaff } from '../src/server/activeStaffAuth.js';
import { issueNextNumber } from '../src/server/idGenerator.js';
import { appendToAuditChain } from '../src/server/auditIntegrity.js';
import { dispatchNotificationEvent } from '../src/server/notificationEngine.js';
import { UAE_VAT_RATE, vatPortion } from '../src/config/tax.js';

const EXTENSION_ROLES = ['ceo', 'admin', 'operations', 'sales'] as const;
const BLOCKING_RESERVATION_STATUSES = new Set(['pending', 'confirmed', 'active']);
const BLOCKING_CONTRACT_STATUSES = new Set(['approved', 'signed', 'active']);

class ContractExtensionError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ContractExtensionError';
  }
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function windowsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

async function persistExtensionAudit(
  actor: { uid: string; name: string; role: string },
  contract: any,
  addendum: any,
  extraDays: number,
  totalExtensionAmount: number,
  reason: string
) {
  const id = await issueNextNumber('AuditLog');
  const timestamp = new Date().toISOString();
  const base = {
    id,
    timestamp,
    userId: actor.uid,
    userName: actor.name,
    userRole: actor.role,
    entityType: 'Contract',
    entityId: contract.id,
    action: 'update',
    previousValue: `Contract ${contract.contractNumber || contract.id} end date: ${addendum.currentEndDateTime}`,
    newValue: `Extended by ${extraDays} days until ${addendum.newEndDateTime}. Added Addendum #${addendum.addendumNumber} (+${totalExtensionAmount.toFixed(2)} AED).`,
    reason
  };
  const chain = await appendToAuditChain(base);
  await admin.firestore().collection('audit_logs').doc(id).create({ ...base, ...chain });
}

export default async function contractExtensionSafeHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (String(req.method || '').toUpperCase() !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const actor = await getVerifiedActiveStaff(req, res, EXTENSION_ROLES);
  if (!actor) return;

  const contractId = String(req.query.contractId || '').trim();
  const newEndDateTime = String(req.body?.newEndDateTime || '').trim();
  if (!contractId || !newEndDateTime) return res.status(400).json({ error: 'contractId and newEndDateTime are required.' });

  const customDailyRate = req.body?.dailyRate;
  const currentOdometerKm = req.body?.currentOdometerKm;
  const paymentMethod = String(req.body?.paymentMethod || 'credit_card');
  const paymentMethodLabel = String(req.body?.paymentMethodLabel || paymentMethod);
  const issueDate = String(req.body?.issueDate || new Date().toISOString().slice(0, 10));
  const notes = String(req.body?.notes || '').trim().slice(0, 3000);
  const addendumId = await issueNextNumber('Addendum');
  const firestore = admin.firestore();
  const contractRef = firestore.collection('contracts').doc(contractId);
  const now = new Date().toISOString();

  try {
    const outcome = await firestore.runTransaction(async tx => {
      const contractSnap = await tx.get(contractRef);
      if (!contractSnap.exists) throw new ContractExtensionError(404, 'Contract not found.');
      const contract = { id: contractSnap.id, ...(contractSnap.data() as any) };
      if (['completed', 'cancelled'].includes(String(contract.status || ''))) {
        throw new ContractExtensionError(409, `Cannot extend a contract with status '${contract.status}'.`);
      }

      const previousEndMs = new Date(contract.endDateTime).getTime();
      const nextEndMs = new Date(newEndDateTime).getTime();
      if (!Number.isFinite(previousEndMs) || !Number.isFinite(nextEndMs) || nextEndMs <= previousEndMs) {
        throw new ContractExtensionError(400, 'New end date/time must be strictly after the current contract end date/time.');
      }

      // Read every related document/query before the first write. This fixes
      // #35 and also checks the newly requested extension window against
      // already committed future use of the same vehicle.
      const vehicleRef = contract.vehicleId ? firestore.collection('vehicles').doc(String(contract.vehicleId)) : null;
      const reservationsQuery = contract.vehicleId
        ? firestore.collection('reservations').where('vehicleId', '==', contract.vehicleId)
        : null;
      const contractsQuery = contract.vehicleId
        ? firestore.collection('contracts').where('vehicleId', '==', contract.vehicleId)
        : null;
      const [vehicleSnap, reservationsSnap, contractsSnap] = await Promise.all([
        vehicleRef ? tx.get(vehicleRef) : Promise.resolve(null),
        reservationsQuery ? tx.get(reservationsQuery) : Promise.resolve(null),
        contractsQuery ? tx.get(contractsQuery) : Promise.resolve(null)
      ]);

      if (vehicleRef && (!vehicleSnap || !vehicleSnap.exists)) {
        throw new ContractExtensionError(409, 'Bound vehicle record does not exist.');
      }
      if (vehicleSnap) {
        const vehicle = vehicleSnap.data() as any;
        if (vehicle.lifecycleStatus && vehicle.lifecycleStatus !== 'ACTIVE') {
          throw new ContractExtensionError(409, `Contract cannot be extended because vehicle lifecycle is ${vehicle.lifecycleStatus}.`);
        }
      }

      const extensionWindowStart = previousEndMs;
      const extensionWindowEnd = nextEndMs;
      if (reservationsSnap) {
        for (const doc of reservationsSnap.docs) {
          const reservation = doc.data() as any;
          if (contract.reservationId && doc.id === contract.reservationId) continue;
          if (!BLOCKING_RESERVATION_STATUSES.has(String(reservation.status || ''))) continue;
          const start = new Date(reservation.pickupDateTime).getTime();
          const end = new Date(reservation.returnDateTime).getTime();
          if (Number.isFinite(start) && Number.isFinite(end) && windowsOverlap(extensionWindowStart, extensionWindowEnd, start, end)) {
            throw new ContractExtensionError(409, `Extension conflicts with reservation ${doc.id}.`);
          }
        }
      }
      if (contractsSnap) {
        for (const doc of contractsSnap.docs) {
          if (doc.id === contractId) continue;
          const other = doc.data() as any;
          if (!BLOCKING_CONTRACT_STATUSES.has(String(other.status || ''))) continue;
          const start = new Date(other.startDateTime).getTime();
          const end = new Date(other.endDateTime).getTime();
          if (Number.isFinite(start) && Number.isFinite(end) && windowsOverlap(extensionWindowStart, extensionWindowEnd, start, end)) {
            throw new ContractExtensionError(409, `Extension conflicts with contract ${doc.id}.`);
          }
        }
      }

      const extraDays = Math.max(1, Math.ceil((nextEndMs - previousEndMs) / 86_400_000));
      const requestedRate = Number(customDailyRate);
      const rate = customDailyRate !== undefined && Number.isFinite(requestedRate) && requestedRate > 0
        ? requestedRate
        : Number(contract.dailyRate || 0);
      if (!Number.isFinite(rate) || rate <= 0) throw new ContractExtensionError(409, 'Contract has no valid extension daily rate.');
      const periodRentalAmount = money(rate * extraDays);
      const vatAmount = money(vatPortion(periodRentalAmount));
      const totalExtensionAmount = money(periodRentalAmount + vatAmount);
      const sequence = String((Array.isArray(contract.extensions) ? contract.extensions.length : 0) + 1).padStart(4, '0');
      const addendumNumber = `EXT-${new Date(issueDate).getUTCFullYear() || new Date().getUTCFullYear()}-${sequence}`;
      const addendumRecord = {
        id: addendumId,
        addendumNumber,
        contractId: contract.id,
        contractNumber: contract.contractNumber || contract.id,
        issueDate,
        customerName: contract.customerName,
        customerPhone: contract.customerPhone,
        plateNumber: contract.vehiclePlate,
        vehicleName: contract.vehicleName,
        currentEndDateTime: contract.endDateTime,
        newEndDateTime,
        extensionDurationDays: extraDays,
        currentOdometerKm: Number(currentOdometerKm) || Number(contract.handover?.startMileage || 0),
        dailyRate: rate,
        periodRentalAmount,
        vatRatePercent: UAE_VAT_RATE * 100,
        vatAmount,
        totalExtensionAmount,
        paymentMethod,
        paymentMethodLabel,
        notes: notes || `Contract extension for ${extraDays} day(s).`,
        createdBy: actor.uid,
        createdByName: actor.name,
        createdAt: now,
        updatedAt: now
      };
      const updated = {
        ...contract,
        endDateTime: newEndDateTime,
        dailyRate: rate,
        rentalTotal: money(Number(contract.rentalTotal || 0) + periodRentalAmount),
        vatAmount: money(Number(contract.vatAmount || 0) + vatAmount),
        grandTotal: money(Number(contract.grandTotal || 0) + totalExtensionAmount),
        extensions: [...(Array.isArray(contract.extensions) ? contract.extensions : []), addendumRecord],
        updatedAt: now
      };

      tx.set(contractRef, updated, { merge: false });
      if (vehicleRef) tx.set(vehicleRef, { updatedAt: now }, { merge: true });
      return { contract: updated, addendum: addendumRecord, extraDays, extraAmount: totalExtensionAmount };
    });

    try {
      await persistExtensionAudit(actor, outcome.contract, outcome.addendum, outcome.extraDays, outcome.extraAmount, notes || 'Formal Contract Extension Addendum Issued');
    } catch (error) {
      console.error('[contract-extension] extension committed but audit-chain append failed', error);
    }

    try {
      await dispatchNotificationEvent(
        'contract_extended',
        `Contract ${outcome.contract.contractNumber || outcome.contract.id} extended by ${outcome.extraDays} day(s) until ${newEndDateTime} (+${outcome.extraAmount.toFixed(2)} AED).`,
        `تم تمديد العقد رقم ${outcome.contract.contractNumber || outcome.contract.id} لمدة ${outcome.extraDays} يوم حتى ${newEndDateTime} (إجمالي الإضافة ${outcome.extraAmount.toFixed(2)} درهم).`
      );
    } catch (error) {
      console.error('[contract-extension] notification dispatch failed', error);
    }

    return res.status(200).json({ success: true, ...outcome });
  } catch (error) {
    if (error instanceof ContractExtensionError) return res.status(error.status).json({ error: error.message });
    console.error('[contract-extension] extension failed atomically', error);
    return res.status(500).json({ error: 'Contract extension failed atomically.' });
  }
}
