import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import app from '../server.js';
import { checkBlocklist, type ExtendedBlocklistIdentifierType } from '../src/server/blocklist.js';

const CUSTOMER_WRITE_ROLES = ['ceo', 'admin', 'operations', 'sales'];

type Candidate = { type: ExtendedBlocklistIdentifierType; value: string; country?: string };

function addCandidate(target: Candidate[], type: ExtendedBlocklistIdentifierType, value: unknown, country?: unknown) {
  const text = String(value || '').trim();
  if (!text) return;
  const normalizedCountry = String(country || '').trim() || undefined;
  const key = `${type}:${text}:${normalizedCountry || ''}`.toLowerCase();
  if (target.some(item => `${item.type}:${item.value}:${item.country || ''}`.toLowerCase() === key)) return;
  target.push({ type, value: text, country: normalizedCountry });
}

/**
 * Build exact, reliable identifiers from the customer payload. Name is intentionally absent:
 * names are display context, never an automatic security match key because names are not unique.
 */
export function blocklistCandidatesFromCustomerPayload(body: any): Candidate[] {
  const candidates: Candidate[] = [];
  const custom = body?.customFields && typeof body.customFields === 'object' ? body.customFields : {};
  const idType = String(body?.idType || '').trim() as ExtendedBlocklistIdentifierType;
  if (['emirates_id', 'passport', 'gcc_id', 'national_id'].includes(idType)) {
    addCandidate(candidates, idType, body.idNumber, idType === 'passport' || idType === 'gcc_id' || idType === 'national_id'
      ? (body.idIssuedBy || custom.identityIssuedBy || body.nationality || body.country)
      : undefined);
  }

  addCandidate(candidates, 'driving_license', body?.licenseNumber, body?.licenseCountry);
  addCandidate(
    candidates,
    'driving_license',
    custom.homeCountryDrivingLicenseNumber,
    custom.homeCountryDrivingLicenseCountryCode || custom.homeCountryDrivingLicenseCountry
  );
  addCandidate(candidates, 'email', body?.email);
  addCandidate(candidates, 'phone', body?.phone);
  if (String(body?.whatsapp || '').trim() !== String(body?.phone || '').trim()) addCandidate(candidates, 'phone', body?.whatsapp);

  addCandidate(candidates, 'trade_license', custom.tradeLicenseNumber, custom.tradeLicenseIssuedBy || body?.country);
  addCandidate(candidates, 'company_registration', custom.companyRegistrationNumber, custom.registrationCountry || body?.country);
  addCandidate(candidates, 'tax_registration', custom.taxRegistrationNumber || custom.trn || body?.trn);

  // The structured intake records the licence kind separately. Upgrade the
  // candidate to the more specific international-permit type when known so
  // an IDP block is not missed merely because the legacy Customer schema
  // stores all licence numbers in one field.
  if (String(custom.drivingLicenseType || '').toLowerCase() === 'international' && body?.licenseNumber) {
    addCandidate(candidates, 'international_driving_permit', body.licenseNumber, body.licenseCountry);
  }
  return candidates;
}

async function verifiedWriter(req: Request, res: Response) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || admin.apps.length === 0) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
    const data = profile.exists ? profile.data() as any : null;
    if (!data || !CUSTOMER_WRITE_ROLES.includes(String(data.role))) {
      res.status(403).json({ error: 'You do not have permission to register customers.' });
      return null;
    }
    return { uid: decoded.uid, role: data.role };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}

function delegateToAuthoritativeCustomersRoute(req: Request, res: Response) {
  // A Vercel rewrite may expose either the source URL or the destination URL
  // to a function depending on runtime adapter details. Force the canonical
  // Express path before delegation so customer reads/creates cannot become a
  // 404 after the security guard is introduced.
  req.url = '/api/customers';
  return app(req, res);
}

export default async function handler(req: Request, res: Response) {
  // Preserve the existing authoritative API for reads and non-create
  // methods. Only customer creation needs the pre-write multi-identifier
  // screening boundary.
  if (req.method !== 'POST') return delegateToAuthoritativeCustomersRoute(req, res);

  const actor = await verifiedWriter(req, res);
  if (!actor) return;

  try {
    const candidates = blocklistCandidatesFromCustomerPayload(req.body || {});
    for (const candidate of candidates) {
      const match = await checkBlocklist(candidate.type, candidate.value, candidate.country);
      if (!match) continue;
      if (match.tier === 'full') {
        return res.status(403).json({
          error: 'Customer registration blocked by an active security record.',
          blocklistEntryId: match.id,
          matchedIdentifierType: candidate.type
        });
      }
      return res.status(409).json({
        error: `Customer registration requires security review: ${match.conditionalNote || 'conditional block on file'}`,
        blocklistEntryId: match.id,
        matchedIdentifierType: candidate.type,
        conditional: true
      });
    }

    // The legacy create route still owns validation, duplicate checks,
    // durable customer creation, notifications and audit. This guard adds a
    // fail-closed security precondition without creating a parallel customer
    // persistence path.
    return delegateToAuthoritativeCustomersRoute(req, res);
  } catch (error) {
    console.error('[customers-guard] blocklist screening failed', error);
    return res.status(503).json({ error: 'Security screening could not be completed. Customer was not created.' });
  }
}
