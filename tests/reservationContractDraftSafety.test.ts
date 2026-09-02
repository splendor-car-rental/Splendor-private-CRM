import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = readFileSync(new URL('../src/server/reservationContractDraft.ts', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../api/reservation-contract.ts', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

describe('reservation to rental-contract conversion safety', () => {
  it('creates only an unsigned non-operative draft from committed reservation data', () => {
    expect(service).toContain("status: 'draft'");
    expect(service).toContain("depositStatus: 'pending'");
    expect(service).toContain('termsAccepted: false');
    expect(service).toContain('grandTotal: total');
    expect(service).toContain('vatPortion(total)');
    expect(service).not.toContain('termsAccepted: true');
  });

  it('replays the already-linked authoritative contract instead of creating a second contract', () => {
    expect(service).toContain('if (reservation.contractId)');
    expect(service).toContain("db.collection('contracts').doc(String(reservation.contractId))");
    expect(service).toContain('replayed: true');
    expect(service).toContain('Reservation points to a missing contract; manual review is required before retrying.');
  });

  it('does not accept customer/vehicle/commercial contract data from the browser conversion request', () => {
    expect(endpoint).toContain("String(req.query.reservationId || '')");
    expect(endpoint).not.toContain('req.body.customerId');
    expect(endpoint).not.toContain('req.body.vehicleId');
    expect(endpoint).not.toContain('req.body.grandTotal');
  });

  it('routes the legacy URL to the hardened conversion function before the API catch-all', () => {
    const routes = vercel.rewrites.map((route: any) => route.source);
    const hardened = routes.indexOf('/api/reservations/:reservationId/create-contract');
    const catchAll = routes.indexOf('/api/:path*');
    expect(hardened).toBeGreaterThan(-1);
    expect(hardened).toBeLessThan(catchAll);
  });
});
