import admin from 'firebase-admin';
import { issueNextNumber } from './idGenerator';
import { getRuleValue } from './businessRules';
import { vatPortion } from '../config/tax';

export class ReservationContractDraftError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ReservationContractDraftError';
    this.status = status;
  }
}

export async function createUnsignedDraftFromReservation(reservationId: string) {
  if (admin.apps.length === 0) throw new ReservationContractDraftError(503, 'Server persistence is not configured.');
  const db = admin.firestore();
  const proposedContractId = await issueNextNumber('Contract');
  const reservationRef = db.collection('reservations').doc(reservationId);

  return db.runTransaction(async tx => {
    const resSnap = await tx.get(reservationRef);
    if (!resSnap.exists) throw new ReservationContractDraftError(404, 'Reservation not found.');
    const reservation = { id: resSnap.id, ...(resSnap.data() as any) };

    // Idempotent replay: if another request already linked the reservation,
    // return that authoritative contract instead of creating an orphan.
    if (reservation.contractId) {
      const existingRef = db.collection('contracts').doc(String(reservation.contractId));
      const existingSnap = await tx.get(existingRef);
      if (!existingSnap.exists) {
        throw new ReservationContractDraftError(409, 'Reservation points to a missing contract; manual review is required before retrying.');
      }
      return {
        contract: { id: existingSnap.id, ...(existingSnap.data() as any) },
        reservation,
        replayed: true
      };
    }

    if (['cancelled', 'completed', 'no_show'].includes(String(reservation.status || ''))) {
      throw new ReservationContractDraftError(409, `A ${reservation.status} reservation cannot create a contract.`);
    }
    if (!reservation.customerId || !reservation.vehicleId) {
      throw new ReservationContractDraftError(409, 'Reservation is missing its customer or vehicle binding.');
    }

    const customerRef = db.collection('customers').doc(reservation.customerId);
    const vehicleRef = db.collection('vehicles').doc(reservation.vehicleId);
    const [customerSnap, vehicleSnap] = await Promise.all([tx.get(customerRef), tx.get(vehicleRef)]);
    if (!customerSnap.exists) throw new ReservationContractDraftError(409, 'Reservation customer record not found.');
    if (!vehicleSnap.exists) throw new ReservationContractDraftError(409, 'Reservation vehicle record not found.');
    const customer = { id: customerSnap.id, ...(customerSnap.data() as any) };
    const vehicle = { id: vehicleSnap.id, ...(vehicleSnap.data() as any) };

    const total = Number(reservation.totalAmount || 0);
    if (!(total > 0)) throw new ReservationContractDraftError(409, 'Reservation total is invalid.');
    const start = new Date(reservation.pickupDateTime).getTime();
    const end = new Date(reservation.returnDateTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new ReservationContractDraftError(409, 'Reservation rental window is invalid.');
    }

    const now = new Date().toISOString();
    const vatAmount = vatPortion(total);
    const contract = {
      id: proposedContractId,
      contractNumber: proposedContractId,
      reservationId: reservation.id,
      customerId: reservation.customerId,
      customerName: reservation.customerName || customer.fullName,
      customerPhone: reservation.customerPhone || customer.phone,
      customerAddress: customer.address || '',
      vehicleId: reservation.vehicleId,
      vehicleName: reservation.vehicleName || `${vehicle.make} ${vehicle.model}`,
      vehiclePlate: reservation.vehiclePlate || `${vehicle.plateCity} ${vehicle.plateNumber}`,
      vehicleVin: vehicle.vin,
      startDateTime: reservation.pickupDateTime,
      endDateTime: reservation.returnDateTime,
      pickupLocation: reservation.pickupLocation,
      returnLocation: reservation.returnLocation,
      dailyRate: Number(reservation.dailyRate || 0),
      rentalTotal: total - vatAmount,
      vatAmount,
      grandTotal: total,
      depositAmount: Math.max(0, Number(reservation.depositAmount || 0)),
      mileageAllowancePerDay: getRuleValue('contractDefaultMileageAllowanceKm', 200),
      extraKmRate: getRuleValue('contractExtraKmRateAed', 15),
      depositReleaseDays: getRuleValue('contractDepositReleaseDays', 21),
      status: 'draft',
      paymentStatus: 'unpaid',
      depositStatus: 'pending',
      termsAccepted: false,
      notes: reservation.notes || 'Rental agreement draft created from reservation',
      createdAt: now,
      updatedAt: now
    };
    const updatedReservation = {
      ...reservation,
      contractId: proposedContractId,
      status: 'active',
      updatedAt: now
    };

    tx.create(db.collection('contracts').doc(proposedContractId), contract);
    tx.set(reservationRef, {
      contractId: proposedContractId,
      status: 'active',
      updatedAt: now
    }, { merge: true });

    return { contract, reservation: updatedReservation, replayed: false };
  });
}
