import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import {
  approveRentalContract,
  signApprovedRentalContract,
  submitRentalContractForReview,
  ContractLifecycleTransitionError
} from '../src/server/contractLifecycleTransitions.js';
import { issueNextNumber } from '../src/server/idGenerator.js';
import { appendToAuditChain } from '../src/server/auditIntegrity.js';
import { globalStore } from '../src/server/dataStore.js';

const ACTION_ROLES: Record<string, string[]> = {
  review: ['ceo', 'admin', 'operations', 'sales'],
  approve: ['ceo', 'admin'],
  sign: ['ceo', 'admin', 'operations', 'sales']
};

async function actorFor(req: Request, res: Response, action: string) {
  const allowed = ACTION_ROLES[action];
  if (!allowed) {
    res.status(400).json({ error: 'Unsupported contract lifecycle action.' });
    return null;
  }
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token || admin.apps.length === 0) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
    const data = profile.exists ? (profile.data() as any) : null;
    if (!data || !allowed.includes(data.role)) {
      res.status(403).json({ error: 'You do not have permission for this contract lifecycle transition.' });
      return null;
    }
    return { uid: decoded.uid, name: data.name || decoded.name || decoded.uid, role: data.role };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}

async function recordLifecycleAudit(actor: { uid: string; name: string; role: string }, contract: any, action: string) {
  try {
    const id = await issueNextNumber('AuditLog');
    const timestamp = new Date().toISOString();
    const previousValue = action === 'review' ? 'Status: Draft' : action === 'approve' ? 'Status: Review' : 'Status: Approved';
    const newValue = action === 'review' ? 'Status: Review' : action === 'approve' ? 'Status: Approved' : 'Status: Signed';
    const base = {
      id,
      timestamp,
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'Contract',
      entityId: contract.id,
      action: 'status_change',
      previousValue,
      newValue,
      reason: action === 'review'
        ? 'Contract submitted into the server-authoritative review workflow'
        : action === 'approve'
          ? 'Four-Eyes management approval completed after KYC and vehicle conflict checks'
          : 'Physical/scanned signed artifact promoted to immutable storage and signing evidence recorded'
    };
    const chain = await appendToAuditChain(base);
    const entry = { ...base, ...chain };
    await admin.firestore().collection('audit_logs').doc(id).set(entry);
    globalStore.auditLogs.unshift(entry as any);
  } catch (error) {
    console.error('[contract-lifecycle] transition succeeded but audit write failed', error);
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const action = String(req.query.action || '').trim();
  const contractId = String(req.query.contractId || '').trim();
  if (!contractId) return res.status(400).json({ error: 'contractId is required.' });

  const actor = await actorFor(req, res, action);
  if (!actor) return;

  try {
    const contract = action === 'review'
      ? await submitRentalContractForReview(contractId, actor)
      : action === 'approve'
        ? await approveRentalContract(contractId, actor)
        : action === 'sign'
          ? await signApprovedRentalContract(contractId, String((req.body || {}).signedDocumentPath || ''), actor)
          : null;

    if (!contract) return res.status(400).json({ error: 'Unsupported contract lifecycle action.' });
    const index = globalStore.contracts.findIndex(c => c.id === contract.id);
    if (index !== -1) globalStore.contracts[index] = contract;
    await recordLifecycleAudit(actor, contract, action);
    return res.status(200).json({ success: true, action, contract });
  } catch (error) {
    if (error instanceof ContractLifecycleTransitionError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[contract-lifecycle] transition failed', error);
    return res.status(500).json({ error: 'Contract lifecycle transition failed.' });
  }
}
