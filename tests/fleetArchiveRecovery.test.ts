import { describe, expect, it } from 'vitest';
import { FleetArchiveError, planVehicleArchive } from '../src/server/fleetArchive';
import { deleteDurable, runDurableBatch } from '../src/server/persistence';

const actor = { uid: 'ceo-1', name: 'CEO One', role: 'ceo' };
const baseVehicle = {
  id: 'VEH-0001',
  lifecycleStatus: 'ACTIVE',
  status: 'available',
  currentContractId: null,
  currentCustomerId: null,
  website: { enabled: true, visibility: 'WEBSITE', featured: true },
  timeline: []
};

describe('fleet archive recovery policy', () => {
  it('blocks archive while an operative contract exists', () => {
    expect(() => planVehicleArchive(baseVehicle, [{ id: 'CON-1', status: 'active' }], actor, 'retire', '2026-09-03T00:00:00.000Z'))
      .toThrow(FleetArchiveError);
    try {
      planVehicleArchive(baseVehicle, [{ id: 'CON-1', status: 'active' }], actor, 'retire', '2026-09-03T00:00:00.000Z');
    } catch (error) {
      expect((error as FleetArchiveError).status).toBe(409);
    }
  });

  it('blocks archive while contract settlement is pending even if the contract status itself is no longer active', () => {
    expect(() => planVehicleArchive(
      baseVehicle,
      [{ id: 'CON-2', status: 'completed', returnWorkflow: { status: 'settlement_pending' } }],
      actor,
      'retire',
      '2026-09-03T00:00:00.000Z'
    )).toThrow(/unsettled contract/);
  });

  it('blocks archive when the vehicle still carries a current contract pointer', () => {
    expect(() => planVehicleArchive(
      { ...baseVehicle, currentContractId: 'CON-3' },
      [],
      actor,
      'retire',
      '2026-09-03T00:00:00.000Z'
    )).toThrow(/bound to an operative or unsettled contract/);
  });

  it('archives without deleting identity/history and disables public visibility', () => {
    const now = '2026-09-03T00:00:00.000Z';
    const result = planVehicleArchive(baseVehicle, [], actor, 'fleet retirement', now);
    expect(result.replayed).toBe(false);
    expect(result.vehicle.id).toBe(baseVehicle.id);
    expect(result.vehicle.lifecycleStatus).toBe('ARCHIVED');
    expect(result.vehicle.status).toBe('unavailable');
    expect(result.vehicle.archivedBy).toBe(actor.uid);
    expect(result.vehicle.archivedReason).toBe('fleet retirement');
    expect(result.vehicle.website).toMatchObject({ enabled: false, visibility: 'INTERNAL_ONLY', featured: false });
    expect(result.vehicle.timeline).toHaveLength(1);
    expect(result.vehicle.timeline[0]).toMatchObject({ action: 'ARCHIVED', userId: actor.uid, reason: 'fleet retirement' });
  });

  it('is idempotent and does not append duplicate archive events on retry', () => {
    const archived = { ...baseVehicle, lifecycleStatus: 'ARCHIVED', status: 'unavailable', timeline: [{ id: 'existing' }] };
    const result = planVehicleArchive(archived, [], actor, 'retry', '2026-09-03T00:00:00.000Z');
    expect(result.replayed).toBe(true);
    expect(result.vehicle).toBe(archived);
    expect(result.vehicle.timeline).toHaveLength(1);
  });

  it('fails closed on every persistence helper that attempts a physical vehicle delete', async () => {
    await expect(deleteDurable('vehicles', 'VEH-0001')).rejects.toThrow(/Physical deletion of vehicle master records is prohibited/);
    await expect(runDurableBatch([{ type: 'delete', collection: 'vehicles', id: 'VEH-0001' }]))
      .rejects.toThrow(/Physical deletion of vehicle master records is prohibited/);
  });
});
