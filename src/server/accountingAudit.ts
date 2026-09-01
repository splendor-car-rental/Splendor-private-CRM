import admin from 'firebase-admin';
import { issueNextNumber } from './idGenerator';
import { appendToAuditChain, type AuditChainFields } from './auditIntegrity';
import type { AuditLog } from '../types';
import type { RecordAuditFn } from './businessRules';

/**
 * Durable audit writer for the accounting API boundary.
 *
 * The main Express application has an equivalent private helper in
 * server.ts. The Vercel accounting dispatcher lives in api/index.ts, so it
 * cannot call that private closure. This implementation deliberately uses
 * the same id generator, same tamper-evident hash chain, and same
 * `audit_logs` collection rather than inventing a parallel finance log.
 */
export const recordAccountingAudit: RecordAuditFn = async (log) => {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  const id = await issueNextNumber('AuditLog');
  const timestamp = new Date().toISOString();
  const baseEntry = { ...log, id, timestamp } as AuditLog;
  const { contentHash, previousHash } = await appendToAuditChain(baseEntry as unknown as AuditChainFields);
  const entry: AuditLog = { ...baseEntry, contentHash, previousHash };
  await admin.firestore().collection('audit_logs').doc(id).create(entry as unknown as FirebaseFirestore.DocumentData);
  return entry;
};
