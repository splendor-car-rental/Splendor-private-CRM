import admin from 'firebase-admin';
import { updateDurable } from './persistence';
import { globalStore } from './dataStore';
import { isWhatsAppConfigured } from './whatsapp';
import { unresolvedCount } from './deadLetterQueue';
import type { HealthCheckResult } from '../types';

// ----------------------------------------------------
// OPERATIONAL HEALTH MONITORING (Phase 23.7)
// ----------------------------------------------------
// Answers "is the platform itself working?" across every external
// dependency this app actually has: the API process itself, Firestore,
// WhatsApp, the Gemini AI integration, the background notification sweep,
// and the dead-letter queue. Deliberately does NOT claim to monitor
// "Vercel" as a platform -- this process has no access to Vercel's own
// infrastructure metrics without a separate integration/credential the
// business hasn't set up, so reporting fabricated platform-health numbers
// would be worse than not reporting them. What IS honestly knowable about
// the runtime (uptime, memory, whether VERCEL is set) is reported instead.

const BACKGROUND_JOB_STATUS_DOC = 'background_job_status';

export interface BackgroundJobRunSummary {
  lastRunAt: string;
  alertsFired: number;
  details: string[];
}

/** Persists the outcome of every runNotificationChecks() sweep (cron or manual), regardless of whether Firebase Admin is configured (no-ops safely if not) -- this is what lets a later health check detect a stale/never-run background job. */
export async function recordBackgroundJobRun(summary: BackgroundJobRunSummary): Promise<void> {
  if (admin.apps.length === 0) return;
  await updateDurable('settings', BACKGROUND_JOB_STATUS_DOC, summary as unknown as Record<string, unknown>);
}

async function getBackgroundJobStatus(): Promise<BackgroundJobRunSummary | null> {
  if (admin.apps.length === 0) return null;
  try {
    const snap = await admin.firestore().collection('settings').doc(BACKGROUND_JOB_STATUS_DOC).get();
    return snap.exists ? (snap.data() as BackgroundJobRunSummary) : null;
  } catch {
    return null;
  }
}

/**
 * Live probe: writes then reads back a tiny sentinel document, measuring
 * round-trip latency -- proves Firestore is actually reachable and
 * writable right now, not just that credentials parsed at boot.
 */
async function checkFirestore(): Promise<HealthCheckResult['checks']['firestore']> {
  if (admin.apps.length === 0) {
    return { status: 'unhealthy', error: 'Firebase Admin is not configured.' };
  }
  const startedAt = Date.now();
  try {
    const ref = admin.firestore().collection('settings').doc('health_probe');
    await ref.set({ checkedAt: new Date().toISOString() }, { merge: true });
    await ref.get();
    return { status: 'healthy', latencyMs: Date.now() - startedAt };
  } catch (error: any) {
    return { status: 'unhealthy', latencyMs: Date.now() - startedAt, error: error?.message || 'Firestore probe failed.' };
  }
}

function checkWhatsApp(): HealthCheckResult['checks']['whatsapp'] {
  if (!isWhatsAppConfigured()) {
    return { status: 'not_configured', recentFailureCount: 0 };
  }
  const recentFailureCount = globalStore.whatsappMessageLog
    .slice(0, 50)
    .filter(m => m.status === 'failed').length;
  // More than half of the last 50 attempts failing is a real integration
  // problem (rate limiting, revoked token, ...), not noise -- 3 is the
  // detection floor so a single bad phone number doesn't trip it.
  return { status: recentFailureCount >= 3 ? 'degraded' : 'configured', recentFailureCount };
}

function checkAi(): HealthCheckResult['checks']['ai'] {
  return { status: process.env.GEMINI_API_KEY ? 'configured' : 'not_configured' };
}

async function checkBackgroundJobs(): Promise<HealthCheckResult['checks']['backgroundJobs']> {
  const status = await getBackgroundJobStatus();
  if (!status) return { status: 'never_run' };
  const hoursSinceLastRun = (Date.now() - new Date(status.lastRunAt).getTime()) / 3600000;
  // The sweep is scheduled every 6h (vercel.json); more than double that
  // with no run means the cron itself stopped firing, not just a slow tick.
  const stale = hoursSinceLastRun > 12;
  return {
    status: stale ? 'stale' : 'healthy',
    lastRunAt: status.lastRunAt,
    alertsFired: status.alertsFired,
    staleSinceHours: stale ? Math.round(hoursSinceLastRun) : undefined
  };
}

export async function checkOperationalHealth(): Promise<HealthCheckResult> {
  const [firestore, backgroundJobs] = await Promise.all([checkFirestore(), checkBackgroundJobs()]);
  const whatsapp = checkWhatsApp();
  const ai = checkAi();
  const dlqUnresolved = unresolvedCount();

  const checks: HealthCheckResult['checks'] = {
    api: {
      status: 'healthy',
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryUsedMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      runtime: process.env.VERCEL ? 'vercel' : 'node'
    },
    firestore,
    whatsapp,
    ai,
    backgroundJobs,
    deadLetterQueue: { status: dlqUnresolved > 0 ? 'has_unresolved' : 'healthy', unresolvedCount: dlqUnresolved }
  };

  const unhealthy = firestore.status === 'unhealthy' || backgroundJobs.status === 'stale';
  const degraded = !unhealthy && (whatsapp.status === 'degraded' || dlqUnresolved > 0);

  return {
    checkedAt: new Date().toISOString(),
    overallStatus: unhealthy ? 'unhealthy' : degraded ? 'degraded' : 'healthy',
    checks
  };
}
