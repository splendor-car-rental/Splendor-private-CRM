import type { Contract, Reservation, Vehicle } from '../types/index.js';

export interface FleetCommandMetrics {
  totalVehicles: number;
  available: number;
  rented: number;
  reserved: number;
  maintenance: number;
  unavailable: number;
  utilizationPercent: number;
  activeContracts: number;
  upcomingReservations: number;
}

/**
 * Pure fleet command KPIs. No persistence and no business-state mutation;
 * the caller supplies the authoritative vehicle, contract and reservation
 * collections. This keeps management metrics deterministic and testable.
 */
export function calculateFleetCommandMetrics(
  vehicles: Vehicle[],
  contracts: Contract[],
  reservations: Reservation[],
  now = new Date()
): FleetCommandMetrics {
  const counts = vehicles.reduce<Record<string, number>>((acc, vehicle) => {
    acc[vehicle.status] = (acc[vehicle.status] || 0) + 1;
    return acc;
  }, {});

  const totalVehicles = vehicles.length;
  const unavailableForUtilization = (counts.maintenance || 0) + (counts.unavailable || 0);
  const utilizationDenominator = Math.max(0, totalVehicles - unavailableForUtilization);
  const utilized = (counts.rented || 0) + (counts.reserved || 0);

  const upcomingReservations = reservations.filter(reservation => {
    const start = new Date(reservation.pickupDateTime).getTime();
    return ['confirmed', 'pending'].includes(reservation.status) && start >= now.getTime();
  }).length;

  return {
    totalVehicles,
    available: counts.available || 0,
    rented: counts.rented || 0,
    reserved: counts.reserved || 0,
    maintenance: counts.maintenance || 0,
    unavailable: counts.unavailable || 0,
    utilizationPercent: utilizationDenominator === 0
      ? 0
      : Number(((utilized / utilizationDenominator) * 100).toFixed(1)),
    activeContracts: contracts.filter(contract => contract.status === 'active').length,
    upcomingReservations,
  };
}
