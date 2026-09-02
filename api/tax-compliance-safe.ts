import type { Request, Response } from 'express';
import admin from 'firebase-admin';

let firestoreSettingsApplied = false;
const EXPECTED_FIREBASE_PROJECT_ID = 'splendor-private-crm';

function ensureTaxFirebaseAdmin(res: Response): boolean {
  try {
    if (admin.apps.length === 0) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (!raw) {
        res.status(503).json({ error: 'Server authentication is not configured. Contact your administrator.' });
        return false;
      }
      const serviceAccount = JSON.parse(raw);
      if (String(serviceAccount.project_id || '') !== EXPECTED_FIREBASE_PROJECT_ID) {
        console.error('[tax-compliance] refused Firebase credential for unexpected project');
        res.status(503).json({ error: 'Tax Compliance runtime Firebase project binding is invalid.' });
        return false;
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: EXPECTED_FIREBASE_PROJECT_ID
      });
    } else {
      const activeProjectId = String(admin.app().options.projectId || process.env.GCLOUD_PROJECT || '');
      if (activeProjectId && activeProjectId !== EXPECTED_FIREBASE_PROJECT_ID && !process.env.FIRESTORE_EMULATOR_HOST) {
        console.error('[tax-compliance] existing Firebase Admin app is bound to an unexpected project');
        res.status(503).json({ error: 'Tax Compliance runtime Firebase project binding is invalid.' });
        return false;
      }
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

  const resource = String(req.query.resource || 'summary').trim();
  if (resource === 'periods') {
    const { default: periodHandler } = await import('../src/server/taxPeriodApi.js');
    return periodHandler(req, res);
  }
  if (resource === 'exceptions') {
    const { default: exceptionHandler } = await import('../src/server/taxExceptionApi.js');
    return exceptionHandler(req, res);
  }
  if (resource === 'reconciliations') {
    const { default: reconciliationHandler } = await import('../src/server/taxReconciliationApi.js');
    return reconciliationHandler(req, res);
  }

  const { default: handler } = await import('./tax-compliance.js');
  return handler(req, res);
}
