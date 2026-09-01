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

  it('protects the in-app test runner in Express as well as the Vercel boundary', () => {
    const server = read('server.ts');
    expect(server).not.toContain("req.path === '/tests/run-all'");
    expect(server).toContain("app.post('/api/tests/run-all', requireRole('ceo', 'admin')");
  });
});
