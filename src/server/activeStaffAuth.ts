import type { Request, Response } from 'express';
import admin from 'firebase-admin';

export const SPLENDOR_FIREBASE_PROJECT_ID = 'splendor-private-crm';

let firestoreSettingsApplied = false;

/**
 * Initializes Firebase Admin only against Splendor's approved production
 * project (or an explicitly configured local Firestore emulator). A valid
 * credential for a different Firebase project is rejected fail-closed.
 */
export function ensureSplendorFirebaseAdmin(): void {
  if (admin.apps.length === 0) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-splendor-audit' });
    } else {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (!raw) throw new Error('Firebase Admin is not configured.');
      const serviceAccount = JSON.parse(raw);
      if (String(serviceAccount.project_id || '') !== SPLENDOR_FIREBASE_PROJECT_ID) {
        throw new Error('Configured Firebase service account belongs to an unexpected project.');
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: SPLENDOR_FIREBASE_PROJECT_ID,
        storageBucket: 'splendor-private-crm.firebasestorage.app'
      });
    }
  }

  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const activeProject = String(admin.app().options.projectId || '');
    if (activeProject && activeProject !== SPLENDOR_FIREBASE_PROJECT_ID) {
      throw new Error('Firebase Admin app is bound to an unexpected project.');
    }
  }

  if (!firestoreSettingsApplied && typeof admin.firestore().settings === 'function') {
    admin.firestore().settings({ ignoreUndefinedProperties: true });
    firestoreSettingsApplied = true;
  }
}

export type VerifiedActiveStaff = {
  uid: string;
  name: string;
  role: string;
};

/**
 * Server-authoritative staff authentication. Missing `status` is inactive;
 * legacy absence never grants access. This is intentionally stricter than
 * older role-only helpers and should be used by all new production routes.
 */
export async function getVerifiedActiveStaff(
  req: Request,
  res: Response,
  allowedRoles: readonly string[]
): Promise<VerifiedActiveStaff | null> {
  try {
    ensureSplendorFirebaseAdmin();
  } catch (error) {
    console.error('[auth] strict active-staff initialization failed', error);
    res.status(503).json({ error: 'Server authentication is not configured safely.' });
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
    const data = profile.exists ? profile.data() as any : null;
    const role = String(data?.role || '');
    if (!data || String(data.status || '') !== 'active' || !allowedRoles.includes(role)) {
      res.status(403).json({ error: 'An active authorized Splendor staff account is required.' });
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
