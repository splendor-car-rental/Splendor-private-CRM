import type { AuditLog } from '../types/index.js';
import { appendToAuditChain, type AuditChainFields } from './auditIntegrity.js';
import { issueNextNumber } from './idGenerator.js';
import { createDurable } from './persistence.js';

export async function recordDurableAudit(
  log: Omit<AuditLog, 'id' | 'timestamp' | 'contentHash' | 'previousHash'>
): Promise<AuditLog> {
  const id = await issueNextNumber('AuditLog');
  const timestamp = new Date().toISOString();
  const baseEntry = { ...log, id, timestamp } as AuditLog;
  const { contentHash, previousHash } = await appendToAuditChain(baseEntry as unknown as AuditChainFields);
  const entry: AuditLog = { ...baseEntry, contentHash, previousHash };
  await createDurable('audit_logs', entry as unknown as { id: string });
  return entry;
}
