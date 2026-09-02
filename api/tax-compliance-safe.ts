import type { Request, Response } from 'express';
import admin from 'firebase-admin';

let firestoreSettingsApplied = false;

function ensureTaxFirebaseAdmin(res: Response): boolean {
  try {
    if (admin.apps.length === 0) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (!raw) {
        res.status(503).json({ error: 'Server authentication is not configured. Contact your administrator.' });
        return false;
      }
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        ...(serviceAccount.project_id ? { projectId: serviceAccount.project_id } : {})
      });
    }
    if (!firestoreSettingsApplied) {
      admin.firestore().settings({ ignoreUndefinedProperties: true });
      firestoreSettingsApplied = true;
    }
    return true;
  } catch (error) {
    console.error('[tax-compliance] safe runtime initialization failed', error);
    res.status(503).json({ error: 'Tax Compliance runtime could not initialize safely.' });
    return false;
  }
}

export default async function safeTaxComplianceHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!ensureTaxFirebaseAdmin(res)) return;
  const { default: handler } = await import('./tax-compliance.js');
  return handler(req, res);
}
