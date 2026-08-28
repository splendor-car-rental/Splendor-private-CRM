#!/usr/bin/env tsx
/**
 * Disaster Recovery Drill (Phase 23.8)
 * ======================================
 *
 * WHAT THIS PROVES: that this app's actual Firestore data model
 * (customers, vehicles, contracts, business rules, audit logs) round-trips
 * correctly through an export -> cold-start -> import cycle, with no
 * silent data loss or corruption, and reports how long the mechanical
 * restore step takes.
 *
 * WHAT THIS DOES NOT PROVE: the real production RPO or RTO. Those depend
 * on two things this session has no access to and cannot fabricate
 * evidence for:
 *   - RPO: whether GCP Firestore scheduled backups / Point-in-Time
 *     Recovery are actually enabled on the real "splendor-private-crm"
 *     project, and how often. That is a one-time `gcloud`/Console
 *     configuration action on GCP infrastructure this session has no
 *     credentials for -- see docs/DISASTER_RECOVERY.md for the exact
 *     command someone with project IAM access needs to run.
 *   - RTO: real incident response also includes detecting the outage,
 *     getting authorized access, and cutting traffic over -- none of
 *     which a local script can honestly measure.
 *
 * SAFETY: every emulator this script starts uses a throwaway project id
 * and a temporary local directory. It never touches a real Firebase/GCP
 * project, never reads .env, and never sends network traffic anywhere
 * outside 127.0.0.1. Safe to run repeatedly on a laptop or in CI.
 */

import { spawn, ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const PROJECT_ID = `dr-drill-${Date.now()}`;
const FIRESTORE_PORT = 8098;
const workDir = mkdtempSync(path.join(tmpdir(), 'dr-drill-'));
const exportDir = path.join(workDir, 'export');
mkdirSync(exportDir, { recursive: true });
const configPath = path.join(workDir, 'firebase.json');

writeFileSync(configPath, JSON.stringify({
  emulators: { firestore: { port: FIRESTORE_PORT }, ui: { enabled: false } }
}));

function log(msg: string): void {
  console.log(`[dr-drill] ${msg}`);
}

function startEmulator(importDir?: string): ChildProcess {
  const args = ['firebase', 'emulators:start', '--project', PROJECT_ID, '--only', 'firestore', '--config', configPath];
  if (importDir) args.push('--import', importDir);
  return spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

async function waitForReady(timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${FIRESTORE_PORT}/`);
      if (res) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Firestore emulator did not become ready within ${timeoutMs}ms.`);
}

async function stopEmulator(proc: ChildProcess): Promise<void> {
  proc.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1500));
}

interface ManifestEntry {
  collection: string;
  id: string;
  field: string;
  expected: unknown;
}

async function seedData(): Promise<ManifestEntry[]> {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FIRESTORE_PORT}`;
  const admin = (await import('firebase-admin')).default;
  admin.initializeApp({ projectId: PROJECT_ID });
  const db = admin.firestore();

  // Synthetic, obviously-fake data mirroring this app's real collection
  // shapes -- never real customer/business data, consistent with "do not
  // use real production records as test fixtures."
  const fixtures: { collection: string; docs: Record<string, unknown>[] }[] = [
    {
      collection: 'customers',
      docs: [
        { id: 'CUS-DRILL01', fullName: 'DR Drill Customer One', phone: '971500000001', outstandingBalance: 0 },
        { id: 'CUS-DRILL02', fullName: 'DR Drill Customer Two', phone: '971500000002', outstandingBalance: 1500 }
      ]
    },
    {
      collection: 'vehicles',
      docs: [
        { id: 'VEH-DRILL01', make: 'DrillMake', model: 'DrillModel', dailyRate: 999, status: 'available' }
      ]
    },
    {
      collection: 'contracts',
      docs: [
        { id: 'CON-DRILL01', customerId: 'CUS-DRILL01', vehicleId: 'VEH-DRILL01', grandTotal: 4200, status: 'active' }
      ]
    },
    {
      collection: 'business_rules',
      docs: [
        { id: 'drillTestRule', label: 'DR Drill Rule', tier: 'business_rule', value: 42, version: 1, history: [] }
      ]
    },
    {
      collection: 'audit_logs',
      docs: [
        { id: 'AUD-DRILL01', userId: 'USR-DRILL', userName: 'Drill Runner', userRole: 'ceo', entityType: 'DrDrill', entityId: 'DRILL', action: 'create', timestamp: new Date().toISOString() }
      ]
    }
  ];

  const manifest: ManifestEntry[] = [];
  for (const { collection, docs } of fixtures) {
    for (const doc of docs) {
      const { id, ...data } = doc as { id: string; [k: string]: unknown };
      await db.collection(collection).doc(id).set(data);
      const [firstField, firstValue] = Object.entries(data)[0];
      manifest.push({ collection, id, field: firstField, expected: firstValue });
    }
  }
  await admin.app().delete();
  return manifest;
}

async function verifyData(manifest: ManifestEntry[]): Promise<string[]> {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FIRESTORE_PORT}`;
  const admin = (await import('firebase-admin')).default;
  admin.initializeApp({ projectId: PROJECT_ID });
  const db = admin.firestore();

  const mismatches: string[] = [];
  for (const entry of manifest) {
    const snap = await db.collection(entry.collection).doc(entry.id).get();
    if (!snap.exists) {
      mismatches.push(`${entry.collection}/${entry.id}: document missing after restore.`);
      continue;
    }
    const actual = (snap.data() as Record<string, unknown>)[entry.field];
    if (JSON.stringify(actual) !== JSON.stringify(entry.expected)) {
      mismatches.push(`${entry.collection}/${entry.id}.${entry.field}: expected ${JSON.stringify(entry.expected)}, got ${JSON.stringify(actual)}.`);
    }
  }
  await admin.app().delete();
  return mismatches;
}

async function triggerExport(): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT_ID}:export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ database: `projects/${PROJECT_ID}/databases/(default)`, export_directory: exportDir })
  });
  if (!res.ok) {
    throw new Error(`Export request failed: HTTP ${res.status} ${await res.text()}`);
  }
}

async function main() {
  console.log('=== Disaster Recovery Drill (Phase 23.8) ===');
  console.log(`Project: ${PROJECT_ID} (throwaway, local-only) | Firestore emulator port: ${FIRESTORE_PORT}`);
  console.log('This never touches real production data or a real GCP project.\n');

  let emulatorA: ChildProcess | undefined;
  let emulatorB: ChildProcess | undefined;
  const timings: Record<string, number> = {};

  try {
    log('[1/6] Starting a fresh, isolated Firestore emulator...');
    let t0 = Date.now();
    emulatorA = startEmulator();
    await waitForReady();
    timings.emulatorStartMs = Date.now() - t0;

    log('[2/6] Seeding synthetic data across every core collection...');
    t0 = Date.now();
    const manifest = await seedData();
    timings.seedMs = Date.now() - t0;
    log(`      Seeded ${manifest.length} documents across ${new Set(manifest.map(m => m.collection)).size} collections.`);

    log('[3/6] Exporting the emulator\'s data (this is the "backup" step)...');
    t0 = Date.now();
    await triggerExport();
    timings.exportMs = Date.now() - t0;

    log('[4/6] Simulating an outage: stopping the emulator entirely...');
    t0 = Date.now();
    await stopEmulator(emulatorA);
    emulatorA = undefined;
    timings.teardownMs = Date.now() - t0;

    log('[5/6] Cold-starting a NEW emulator instance and importing the export (the "restore" step)...');
    t0 = Date.now();
    emulatorB = startEmulator(exportDir);
    await waitForReady();
    timings.coldStartRestoreMs = Date.now() - t0;

    log('[6/6] Verifying every seeded document survived the round-trip intact...');
    t0 = Date.now();
    const mismatches = await verifyData(manifest);
    timings.verifyMs = Date.now() - t0;

    const mechanismRestoreMs = timings.teardownMs + timings.coldStartRestoreMs;

    console.log('\n=== Results ===');
    console.log(`Emulator start:                ${timings.emulatorStartMs} ms`);
    console.log(`Seed ${manifest.length} documents:            ${timings.seedMs} ms`);
    console.log(`Export ("backup"):             ${timings.exportMs} ms`);
    console.log(`Teardown (simulated outage):   ${timings.teardownMs} ms`);
    console.log(`Cold start + import ("restore"): ${timings.coldStartRestoreMs} ms`);
    console.log(`Verification read-back:        ${timings.verifyMs} ms`);
    console.log(`--> Mechanism-level restore time: ${mechanismRestoreMs} ms (${(mechanismRestoreMs / 1000).toFixed(1)}s)`);
    console.log('    NOTE: this is ONLY the data-restore mechanism on a trivial dataset.');
    console.log('    It is NOT the real production RTO -- see docs/DISASTER_RECOVERY.md.');

    if (mismatches.length > 0) {
      console.error('\n❌ DATA INTEGRITY FAILURE -- the export/import cycle did not preserve all data:');
      mismatches.forEach(m => console.error(`   - ${m}`));
      process.exitCode = 1;
    } else {
      console.log(`\n✅ All ${manifest.length} documents survived the export/import cycle with no data loss.`);
      process.exitCode = 0;
    }
  } finally {
    if (emulatorA) await stopEmulator(emulatorA);
    if (emulatorB) await stopEmulator(emulatorB);
    rmSync(workDir, { recursive: true, force: true });
    delete process.env.FIRESTORE_EMULATOR_HOST;
  }
}

main().catch((err) => {
  console.error('[dr-drill] Fatal error:', err);
  process.exit(1);
});
