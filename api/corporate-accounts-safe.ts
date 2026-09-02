import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { issueNextNumber } from '../src/server/idGenerator.js';
import type { CorporateAccount } from '../src/types/index.js';

const WRITE_ROLES = new Set(['ceo', 'admin', 'sales', 'finance']);
const DELETE_ROLES = new Set(['ceo', 'admin']);
const READ_ROLES = new Set(['ceo', 'admin', 'operations', 'sales', 'fleet', 'finance']);
const COLLECTION = 'corporate_accounts';

interface Actor {
  uid: string;
  name: string;
  role: string;
}

function ensureFirebaseAdmin(): boolean {
  if (admin.apps.length > 0) return true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return false;
  try {
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      ...(serviceAccount.project_id ? { projectId: serviceAccount.project_id } : {})
    });
    return true;
  } catch (error) {
    console.error('[corporate] Firebase Admin initialization failed');
    return false;
  }
}

async function authenticate(req: Request, res: Response, allowed: Set<string>): Promise<Actor | null> {
  if (!ensureFirebaseAdmin()) {
    res.status(503).json({ error: 'Server authentication is not configured. Contact your administrator.' });
    return null;
  }

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
    const data = profile.exists ? profile.data() as any : null;
    if (!data || !allowed.has(String(data.role))) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return null;
    }
    return { uid: decoded.uid, name: String(data.name || decoded.name || decoded.uid), role: String(data.role) };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}

function cleanText(value: unknown, maxLength = 500): string {
  return String(value || '').trim().slice(0, maxLength);
}

function accountIdFromRequest(req: Request): string {
  return cleanText(req.query.accountId, 80);
}

function validatePayload(body: any): string | null {
  if (!cleanText(body?.legalName, 200)) return 'Company name in English is required.';
  if (!cleanText(body?.tradeLicenseNumber, 120)) return 'Trade licence number is required.';
  if (body?.primaryContact && typeof body.primaryContact !== 'object') return 'Primary contact must be an object.';
  return null;
}

function normalizedAccountInput(body: any) {
  return {
    legalName: cleanText(body?.legalName, 200),
    legalNameAr: cleanText(body?.legalNameAr, 200),
    tradeLicenseNumber: cleanText(body?.tradeLicenseNumber, 120),
    trnVatNumber: cleanText(body?.trnVatNumber, 120),
    licenseExpiry: cleanText(body?.licenseExpiry, 40),
    branchId: 'COMPANY_WIDE',
    primaryContact: {
      name: cleanText(body?.primaryContact?.name, 160),
      email: cleanText(body?.primaryContact?.email, 200),
      phone: cleanText(body?.primaryContact?.phone, 80),
      designation: cleanText(body?.primaryContact?.designation, 160)
    },
    // Owner-approved business policy: Splendor extends no customer credit.
    // These fields stay at zero only for backwards schema compatibility.
    creditLimitAed: 0,
    usedExposureAed: 0,
    paymentTermsDays: 0,
    authorizedDriversCount: Math.max(0, Number(body?.authorizedDriversCount || 0)),
    status: 'active' as const,
    notes: cleanText(body?.notes, 2000)
  };
}

async function writeAudit(actor: Actor, entityId: string, action: 'create' | 'update' | 'delete', previousValue: unknown, newValue: unknown, reason: string) {
  try {
    const id = await issueNextNumber('auditlog');
    await admin.firestore().collection('audit_logs').doc(id).set({
      id,
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      entityType: 'CorporateAccount',
      entityId,
      action,
      ...(previousValue !== undefined ? { previousValue: JSON.stringify(previousValue) } : {}),
      ...(newValue !== undefined ? { newValue: JSON.stringify(newValue) } : {}),
      reason,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // The business write is authoritative; surface the audit failure to logs
    // rather than fabricating a second persistence path.
    console.error('[corporate] audit persistence failed', error);
  }
}

export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  const method = String(req.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const actor = await authenticate(req, res, READ_ROLES);
    if (!actor) return;
    const snapshot = await admin.firestore().collection(COLLECTION).get();
    const accounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(accounts);
  }

  if (method === 'POST') {
    const actor = await authenticate(req, res, WRITE_ROLES);
    if (!actor) return;
    const validationError = validatePayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const input = normalizedAccountInput(req.body);
    const now = new Date().toISOString();
    const id = await issueNextNumber('corporateaccount');
    const account: CorporateAccount = {
      id,
      ...input,
      activeContractsCount: 0,
      createdAt: now,
      updatedAt: now
    };

    try {
      await admin.firestore().collection(COLLECTION).doc(id).create(account as any);
    } catch (error: any) {
      if (error?.code === 6 || String(error?.message || '').includes('ALREADY_EXISTS')) {
        return res.status(409).json({ error: 'Corporate account identifier collision. Retry the request.' });
      }
      throw error;
    }

    await writeAudit(actor, id, 'create', undefined, { legalName: account.legalName, tradeLicenseNumber: account.tradeLicenseNumber, creditPolicy: 'NO_CREDIT' }, 'New corporate customer master created under no-credit policy.');
    return res.status(201).json(account);
  }

  if (method === 'PUT' || method === 'PATCH') {
    const actor = await authenticate(req, res, WRITE_ROLES);
    if (!actor) return;
    const id = accountIdFromRequest(req);
    if (!id) return res.status(400).json({ error: 'accountId is required.' });
    const validationError = validatePayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const ref = admin.firestore().collection(COLLECTION).doc(id);
    const previous = await ref.get();
    if (!previous.exists) return res.status(404).json({ error: 'Corporate account not found.' });

    const input = normalizedAccountInput(req.body);
    const updated: CorporateAccount = {
      ...(previous.data() as CorporateAccount),
      ...input,
      id,
      createdAt: String((previous.data() as any)?.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString()
    };
    await ref.set(updated as any, { merge: false });
    await writeAudit(actor, id, 'update', { legalName: (previous.data() as any)?.legalName, tradeLicenseNumber: (previous.data() as any)?.tradeLicenseNumber }, { legalName: updated.legalName, tradeLicenseNumber: updated.tradeLicenseNumber, creditPolicy: 'NO_CREDIT' }, cleanText(req.body?.reason, 500) || 'Corporate customer master updated under no-credit policy.');
    return res.status(200).json(updated);
  }

  if (method === 'DELETE') {
    const actor = await authenticate(req, res, DELETE_ROLES);
    if (!actor) return;
    const id = accountIdFromRequest(req);
    if (!id) return res.status(400).json({ error: 'accountId is required.' });
    const reason = cleanText(req.body?.reason || req.query?.reason, 500);
    if (!reason) return res.status(400).json({ error: 'A deletion reason is required.' });

    const ref = admin.firestore().collection(COLLECTION).doc(id);
    const previous = await ref.get();
    if (!previous.exists) return res.status(404).json({ error: 'Corporate account not found.' });
    await ref.delete();
    await writeAudit(actor, id, 'delete', { legalName: (previous.data() as any)?.legalName, tradeLicenseNumber: (previous.data() as any)?.tradeLicenseNumber }, { deleted: true }, reason);
    return res.status(200).json({ success: true, id });
  }

  res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
