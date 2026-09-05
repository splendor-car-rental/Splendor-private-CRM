import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { isMfaSatisfied } from './mfa.js';

const DEFAULT_EXPECTED_PROJECT_ID = 'splendor-private-crm';

function ensureFirebaseAdmin(): boolean {
  if (admin.apps.length > 0) return true;

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-splendor-audit' });
    if (typeof admin.firestore().settings === 'function') {
      admin.firestore().settings({ ignoreUndefinedProperties: true });
    }
    return true;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return false;

  try {
    const serviceAccount = JSON.parse(raw);
    const expectedProjectId = process.env.EXPECTED_FIREBASE_PROJECT_ID || DEFAULT_EXPECTED_PROJECT_ID;
    if (!serviceAccount.project_id || serviceAccount.project_id !== expectedProjectId) {
      return false;
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
      storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
    });
    if (typeof admin.firestore().settings === 'function') {
      admin.firestore().settings({ ignoreUndefinedProperties: true });
    }
    return true;
  } catch {
    return false;
  }
}

export interface VerifiedActiveStaff {
  uid: string;
  name: string;
  role: string;
}

export async function getVerifiedActiveStaff(
  req: Request,
  res: Response,
  allowedRoles: readonly string[],
  options?: { skipMfaGate?: boolean }
): Promise<VerifiedActiveStaff | null> {
  if (!ensureFirebaseAdmin()) {
    res.status(503).json({ error: 'Server authentication is not configured.' });
    return null;
  }

  const authorization = String(req.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
    const data = profile.exists ? (profile.data() as Record<string, unknown>) : null;
    const role = String(data?.role || '');
    const status = String(data?.status || '');

    if (!data || status !== 'active' || !allowedRoles.includes(role)) {
      res.status(403).json({ error: 'A valid active Splendor staff role is required.' });
      return null;
    }

    if (!options?.skipMfaGate && !(await isMfaSatisfied(decoded.uid, role))) {
      res.status(401).json({ error: 'MFA_REQUIRED' });
      return null;
    }

    return {
      uid: decoded.uid,
      name: String(data.name || decoded.name || decoded.uid),
      role
    };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}
