import admin from 'firebase-admin';
import { createDurable, updateDurable } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import type { FailedJob } from '../types/index.js';

// ----------------------------------------------------
// DEAD-LETTER QUEUE (Phase 23.7)
// ----------------------------------------------------
// Before this, a failed WhatsApp send was recorded as a single row in
// globalStore.whatsappMessageLog (status: 'failed') and then never looked
// at again by anything -- a permanent-hire's overdue-deposit reminder or a
// customer's payment receipt could silently fail to send with nothing
// surfacing it for review or retry. This durably records every such
// failure with everything needed to retry it, and gives it an explicit
// lifecycle instead of a dead log line: Failed (created) -> Alerted (the
// operational-health sweep noticed a non-empty queue) -> Resolved (a retry
// succeeded, or a human closed it out with a note).

let cache: FailedJob[] = [];

/** In-memory mirror, hydrated at boot alongside every other collection (see server.ts's hydrateStoreFromFirestore). */
export function setDeadLetterCache(jobs: FailedJob[]): void {
  cache = jobs;
}
export function getDeadLetterCache(): FailedJob[] {
  return cache;
}

function isAlreadyExistsError(error: unknown): boolean {
  const candidate = error as {
    code?: unknown;
    cause?: { code?: unknown; message?: unknown };
  } | undefined;
  return candidate?.code === 6 || candidate?.cause?.code === 6 || candidate?.cause?.message === 'ALREADY_EXISTS';
}

export async function recordFailedJob(jobType: FailedJob['jobType'], payload: Record<string, unknown>, error: string): Promise<FailedJob> {
  let id = await issueNextNumber('FailedJob');
  const job: FailedJob = {
    id,
    jobType,
    status: 'failed',
    payload,
    error,
    attempts: 0,
    createdAt: new Date().toISOString()
  };

  if (admin.apps.length > 0) {
    try {
      await createDurable('dead_letter_queue', job as unknown as { id: string });
    } catch (err) {
      // A durable counter and the target document must be treated as one
      // uniqueness boundary. If a stale/colliding allocation is ever
      // observed (for example after a recovered counter or a cold-start
      // migration), do not turn a real failed job into a 502. Re-key the
      // document while preserving the FAI- prefix and the original job data.
      if (!isAlreadyExistsError(err)) throw err;
      id = `${id}-${cryptoRandomSuffix()}`;
      job.id = id;
      await createDurable('dead_letter_queue', job as unknown as { id: string });
    }
  }
  cache.unshift(job);
  return job;
}

function cryptoRandomSuffix(): string {
  // Web/Node crypto.randomUUID is available in the Vercel Node runtime.
  // Keep the suffix compact because this is an exceptional collision path,
  // not the normal numbering format.
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Marks every still-open (failed/alerted) entry as alerted -- called once per sweep that successfully raises the "dead-letter queue is non-empty" health alert, so the same backlog doesn't get silently re-alerted forever without anyone knowing it was already flagged. */
export async function markAllAlerted(): Promise<void> {
  const now = new Date().toISOString();
  for (const job of cache) {
    if (job.status === 'failed') {
      job.status = 'alerted';
      job.alertedAt = now;
      if (admin.apps.length > 0) {
        await updateDurable('dead_letter_queue', job.id, { status: 'alerted', alertedAt: now });
      }
    }
  }
}

export class DeadLetterError extends Error {}

/** Re-attempts a failed WhatsApp send. On success, marks the job resolved; on failure, increments attempts and records the new error, staying open. */
export async function retryFailedJob(id: string): Promise<FailedJob> {
  const job = cache.find(j => j.id === id);
  if (!job) throw new DeadLetterError('Failed job not found.');
  if (job.status === 'resolved') throw new DeadLetterError('This job is already resolved.');
  if (job.jobType !== 'whatsapp_send') throw new DeadLetterError(`Unsupported job type for retry: ${job.jobType}`);

  const { phone, message } = job.payload as { phone?: string; message?: string };
  if (!phone || !message) throw new DeadLetterError('This job is missing the data needed to retry it.');

  const now = new Date().toISOString();
  const result = await sendWhatsAppMessage(phone, message);
  job.attempts += 1;
  job.lastAttemptAt = now;

  if (result.status === 'sent') {
    job.status = 'resolved';
    job.resolvedAt = now;
    job.resolvedByName = 'Automatic retry';
  } else {
    job.error = result.error || `Retry failed with status "${result.status}".`;
  }

  if (admin.apps.length > 0) {
    await updateDurable('dead_letter_queue', job.id, {
      status: job.status, attempts: job.attempts, lastAttemptAt: job.lastAttemptAt,
      resolvedAt: job.resolvedAt, resolvedByName: job.resolvedByName, error: job.error
    });
  }
  return job;
}

export async function resolveFailedJob(id: string, note: string, actor: { uid: string; name: string }): Promise<FailedJob> {
  const job = cache.find(j => j.id === id);
  if (!job) throw new DeadLetterError('Failed job not found.');
  if (job.status === 'resolved') throw new DeadLetterError('This job is already resolved.');
  if (!note || !note.trim()) throw new DeadLetterError('A resolution note is required.');

  const now = new Date().toISOString();
  job.status = 'resolved';
  job.resolvedAt = now;
  job.resolvedBy = actor.uid;
  job.resolvedByName = actor.name;
  job.resolutionNote = note;

  if (admin.apps.length > 0) {
    await updateDurable('dead_letter_queue', job.id, {
      status: 'resolved', resolvedAt: now, resolvedBy: actor.uid, resolvedByName: actor.name, resolutionNote: note
    });
  }
  return job;
}

export function unresolvedCount(): number {
  return cache.filter(j => j.status !== 'resolved').length;
}
