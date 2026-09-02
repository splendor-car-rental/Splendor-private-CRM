import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('destructive production-operation safety', () => {
  it('does not expose a production reset control through React or CRMContext', () => {
    expect(read('src/components/views/SettingsAuditView.tsx')).not.toContain('DELETE ALL DATA');
    expect(read('src/context/CRMContext.tsx')).not.toContain('resetTransactionalData');
  });

  it('keeps bulk reset restricted to a local Firestore emulator', () => {
    const server = read('server.ts');
    expect(server).toContain("if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.VERCEL_ENV === 'production')");
  });

  it('fails closed if the legacy browser bulk-sync helper is reached in a production build', () => {
    const firestoreService = read('src/firebase/firestoreService.ts');
    expect(firestoreService).toContain('if (import.meta.env.PROD)');
    expect(firestoreService).toContain('Bulk Firestore seed/sync is disabled in production');
  });

  it('protects the in-app test runner in Express as well as the Vercel boundary', () => {
    const server = read('server.ts');
    expect(server).not.toContain("req.path === '/tests/run-all'");
    expect(server).toContain("app.post('/api/tests/run-all', requireRole('ceo', 'admin')");
  });

  it('prohibits physical deletion of Fleet vehicle master records below route level', () => {
    const persistence = read('src/server/persistence.ts');
    expect(persistence).toContain("if (collection === 'vehicles')");
    expect(persistence).toContain('Physical deletion of Fleet vehicle master records is prohibited');
    expect(persistence).toContain("if (op.type === 'delete') assertDeleteAllowed(op.collection)");
  });

  it('routes production Fleet DELETE requests to the non-destructive archive handler', () => {
    const vercel = read('vercel.json');
    const fleet = read('api/fleet-safe.ts');
    expect(vercel).toContain('"/api/fleet/:vehicleId"');
    expect(vercel).toContain('"/api/fleet-safe?vehicleId=:vehicleId"');
    expect(fleet).toContain("lifecycleStatus: 'ARCHIVED'");
    expect(fleet).toContain("status: 'unavailable'");
    expect(fleet).not.toContain('.delete()');
  });

  it('routes contract extension through a read-before-write-safe production transaction', () => {
    const vercel = read('vercel.json');
    const extension = read('api/contract-extension-safe.ts');
    expect(vercel).toContain('"/api/contracts/:contractId/extend"');
    expect(vercel).toContain('"/api/contract-extension-safe?contractId=:contractId"');
    const firstWrite = extension.indexOf('tx.set(contractRef');
    expect(firstWrite).toBeGreaterThan(0);
    expect(extension.lastIndexOf('tx.get(', firstWrite)).toBeGreaterThan(0);
    expect(extension.indexOf('tx.get(', firstWrite)).toBe(-1);
  });
});
