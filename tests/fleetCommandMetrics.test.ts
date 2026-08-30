import { describe, expect, it } from 'vitest';
import { calculateFleetCommandMetrics } from '../src/server/fleetCommandMetrics';
import type { Contract, Reservation, Vehicle } from '../src/types';

const vehicle = (id: string, status: Vehicle['status']): Vehicle => ({
  id,
  make: 'Test',
  model: 'Vehicle',
  year: 2026,
  status,
} as Vehicle);

describe('fleet command metrics', () => {
  it('calculates status mix, utilization, active contracts and upcoming reservations', () => {
    const vehicles = [
      vehicle('V1', 'available'),
      vehicle('V2', 'rented'),
      vehicle('V3', 'reserved'),
      vehicle('V4', 'maintenance'),
      vehicle('V5', 'unavailable'),
    ];
    const contracts = [
      { status: 'active' },
      { status: 'completed' },
    ] as Contract[];
    const reservations = [
      { status: 'confirmed', pickupDateTime: '2026-09-01T10:00:00Z' },
      { status: 'pending', pickupDateTime: '2026-08-01T10:00:00Z' },
      { status: 'cancelled', pickupDateTime: '2026-09-02T10:00:00Z' },
    ] as Reservation[];

    const result = calculateFleetCommandMetrics(
      vehicles,
      contracts,
      reservations,
      new Date('2026-08-30T12:00:00Z')
    );

    expect(result).toEqual({
      totalVehicles: 5,
      available: 1,
      rented: 1,
      reserved: 1,
      maintenance: 1,
      unavailable: 1,
      utilizationPercent: 66.7,
      activeContracts: 1,
      upcomingReservations: 1,
    });
  });

  it('returns zero utilization when every vehicle is blocked from operation', () => {
    const vehicles = [vehicle('V1', 'maintenance'), vehicle('V2', 'unavailable')];
    const result = calculateFleetCommandMetrics(vehicles, [], [], new Date());
    expect(result.utilizationPercent).toBe(0);
    expect(result.totalVehicles).toBe(2);
  });
});
