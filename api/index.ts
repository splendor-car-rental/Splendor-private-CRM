import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import app from '../server.js';

/**
 * Vercel serverless function entry point.
 *
 * The Express application remains the single business/API implementation,
 * but this boundary adds defense-in-depth for the internal test runner.
 * server.ts historically exempted /api/tests/run-all from its global auth
 * middleware because the old UI called it with plain fetch(). The UI is now
 * authenticated, and this Vercel boundary independently rejects direct
 * unauthenticated access to that diagnostic workload even if the inner
 * Express exemption is accidentally reintroduced later.
 */
async function handler(req: Request, res: Response) {
  if (req.path === '/api/tests/run-all') {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

    if (!token || admin.apps.length === 0) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
      const role = profile.exists ? (profile.data() as any)?.role : null;
      if (role !== 'ceo' && role !== 'admin') {
        return res.status(403).json({ error: 'Only CEO or Admin may run the internal diagnostic suite.' });
      }
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
  }

  return app(req, res);
}

export default handler;
