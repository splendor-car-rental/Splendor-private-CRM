import type { NextFunction, Request, RequestHandler, Response } from 'express';
import admin from 'firebase-admin';

const MANAGEMENT_ROLES = new Set(['ceo', 'admin']);
const CORPORATE_SENSITIVE_FIELDS = ['creditLimitAed', 'paymentTermsDays', 'status'];
const CORPORATE_SERVER_OWNED_FIELDS = ['id', 'usedExposureAed', 'activeContractsCount', 'createdAt', 'updatedAt'];

/**
 * Normalizes security-sensitive request metadata before an async route runs.
 *
 * Actor identity must always come from the verified Firebase session and
 * server-side user profile; client-supplied actorId/actorName values are
 * never trusted for audit records. Corporate account financial/status
 * controls are management-only, while calculated/server-owned fields cannot
 * be overwritten through the generic update endpoint.
 */
async function hardenRequest(req: Request, res: Response): Promise<boolean> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    delete req.body.actorId;
    delete req.body.actorName;
  }

  if (req.method === 'PUT' && req.path.startsWith('/api/corporate-accounts/') && req.body && typeof req.body === 'object') {
    for (const field of CORPORATE_SERVER_OWNED_FIELDS) {
      delete req.body[field];
    }

    const requestedSensitiveField = CORPORATE_SENSITIVE_FIELDS.some(field =>
      Object.prototype.hasOwnProperty.call(req.body, field)
    );

    if (requestedSensitiveField) {
      const uid = (req as any).authUser?.uid;
      if (!uid || admin.apps.length === 0) {
        res.status(403).json({ error: 'Management authorization is required for corporate credit/status changes.' });
        return false;
      }

      try {
        const snap = await admin.firestore().collection('users').doc(uid).get();
        const role = snap.exists ? ((snap.data() as any)?.role ?? null) : null;
        if (!role || !MANAGEMENT_ROLES.has(role)) {
          res.status(403).json({ error: 'Only CEO or Admin can change corporate credit limits, payment terms, or account status.' });
          return false;
        }
      } catch (error) {
        console.error('[security] corporate management authorization check failed:', error);
        res.status(500).json({ error: 'Could not verify management authorization.' });
        return false;
      }
    }
  }

  return true;
}

// This app runs Express 4.x, which does NOT automatically catch a rejected
// promise thrown by an `async` route handler (that only became automatic
// in Express 5). Before this remediation, 16 of 23 async routes had no
// try/catch at all -- an unexpected throw (a malformed request body, a
// Firestore error, anything) became an unhandled promise rejection: the
// request hung forever with no response, and depending on the Node
// process's default unhandled-rejection behavior, could take down the
// whole warm serverless instance for every other in-flight request on it.
//
// asyncHandler wraps a route handler so any rejection is forwarded to
// Express's own error-handling pipeline (`next(err)`) instead of being
// lost. Paired with the catch-all error middleware registered in
// server.ts, every async route now fails safely: a controlled JSON error
// response, never a hang or a crash.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void hardenRequest(req, res)
      .then((allowed) => {
        if (!allowed) return;
        return fn(req, res, next);
      })
      .catch(next);
  };
}
