import type { Request, Response } from 'express';
import admin from 'firebase-admin';

const ALLOWED_ROLES = new Set(['ceo', 'admin', 'operations', 'fleet']);
const MAX_UPSTREAM_ITEMS = 1000;

interface EtqanConfig {
  baseUrl: string;
  token: string;
  positionsPath: string;
  accountId?: string;
  collectionPath?: string;
  deviceIdPath: string;
  latitudePath: string;
  longitudePath: string;
  timestampPath: string;
  speedPath?: string;
  headingPath?: string;
  ignitionPath?: string;
  odometerPath?: string;
  fuelPath?: string;
  engineStatusPath?: string;
  authHeader: string;
  authScheme: string;
}

interface NormalizedPing {
  provider: 'etqan';
  providerDeviceId: string;
  vehicleId?: string;
  plateNumber?: string;
  vehicleName?: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  speedKmh?: number;
  headingDeg?: number;
  ignitionOn?: boolean;
  odometerKm?: number;
  fuelLevelPercent?: number;
  engineStatus?: string;
  stale: boolean;
}

function readConfig(): { configured: true; value: EtqanConfig } | { configured: false; missing: string[] } {
  const required: Array<[string, string]> = [
    ['ETQAN_API_BASE_URL', process.env.ETQAN_API_BASE_URL || ''],
    ['ETQAN_API_TOKEN', process.env.ETQAN_API_TOKEN || ''],
    ['ETQAN_LIVE_POSITIONS_PATH', process.env.ETQAN_LIVE_POSITIONS_PATH || ''],
    ['ETQAN_FIELD_DEVICE_ID', process.env.ETQAN_FIELD_DEVICE_ID || ''],
    ['ETQAN_FIELD_LATITUDE', process.env.ETQAN_FIELD_LATITUDE || ''],
    ['ETQAN_FIELD_LONGITUDE', process.env.ETQAN_FIELD_LONGITUDE || ''],
    ['ETQAN_FIELD_TIMESTAMP', process.env.ETQAN_FIELD_TIMESTAMP || '']
  ];
  const missing = required.filter(([, value]) => !value.trim()).map(([key]) => key);
  if (missing.length) return { configured: false, missing };

  return {
    configured: true,
    value: {
      baseUrl: process.env.ETQAN_API_BASE_URL!.replace(/\/+$/, ''),
      token: process.env.ETQAN_API_TOKEN!,
      positionsPath: process.env.ETQAN_LIVE_POSITIONS_PATH!,
      accountId: process.env.ETQAN_ACCOUNT_ID || undefined,
      collectionPath: process.env.ETQAN_FIELD_COLLECTION || undefined,
      deviceIdPath: process.env.ETQAN_FIELD_DEVICE_ID!,
      latitudePath: process.env.ETQAN_FIELD_LATITUDE!,
      longitudePath: process.env.ETQAN_FIELD_LONGITUDE!,
      timestampPath: process.env.ETQAN_FIELD_TIMESTAMP!,
      speedPath: process.env.ETQAN_FIELD_SPEED || undefined,
      headingPath: process.env.ETQAN_FIELD_HEADING || undefined,
      ignitionPath: process.env.ETQAN_FIELD_IGNITION || undefined,
      odometerPath: process.env.ETQAN_FIELD_ODOMETER || undefined,
      fuelPath: process.env.ETQAN_FIELD_FUEL || undefined,
      engineStatusPath: process.env.ETQAN_FIELD_ENGINE_STATUS || undefined,
      authHeader: process.env.ETQAN_AUTH_HEADER || 'Authorization',
      authScheme: process.env.ETQAN_AUTH_SCHEME ?? 'Bearer'
    }
  };
}

function getPath(source: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path.split('.').filter(Boolean).reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || !(key in current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function finite(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function booleanish(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'on', 'yes', 'running', 'ignition_on'].includes(text)) return true;
  if (['0', 'false', 'off', 'no', 'stopped', 'ignition_off'].includes(text)) return false;
  return undefined;
}

function normalizedTimestamp(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

async function verifiedStaff(req: Request, res: Response) {
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
    if (!data || !ALLOWED_ROLES.has(String(data.role))) {
      res.status(403).json({ error: 'You do not have permission to access live fleet tracking.' });
      return null;
    }
    return { uid: decoded.uid, role: String(data.role) };
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
}

function buildUpstreamUrl(config: EtqanConfig): string {
  const path = config.positionsPath.startsWith('/') ? config.positionsPath : `/${config.positionsPath}`;
  const url = new URL(`${config.baseUrl}${path}`);
  if (config.accountId && !url.searchParams.has('accountId')) url.searchParams.set('accountId', config.accountId);
  return url.toString();
}

function extractItems(payload: unknown, config: EtqanConfig): unknown[] {
  const candidate = config.collectionPath ? getPath(payload, config.collectionPath) : payload;
  if (!Array.isArray(candidate)) {
    throw new Error('Etqan response mapping did not resolve to an array. Confirm ETQAN_FIELD_COLLECTION with the provider API documentation.');
  }
  return candidate.slice(0, MAX_UPSTREAM_ITEMS);
}

function normalizeItem(item: unknown, config: EtqanConfig): Omit<NormalizedPing, 'vehicleId' | 'plateNumber' | 'vehicleName'> | null {
  const providerDeviceId = String(getPath(item, config.deviceIdPath) ?? '').trim();
  const latitude = finite(getPath(item, config.latitudePath));
  const longitude = finite(getPath(item, config.longitudePath));
  const timestamp = normalizedTimestamp(getPath(item, config.timestampPath));
  if (!providerDeviceId || latitude === undefined || longitude === undefined || !timestamp) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const ageMs = Math.max(0, Date.now() - new Date(timestamp).getTime());
  return {
    provider: 'etqan',
    providerDeviceId,
    latitude,
    longitude,
    timestamp,
    speedKmh: finite(getPath(item, config.speedPath)),
    headingDeg: finite(getPath(item, config.headingPath)),
    ignitionOn: booleanish(getPath(item, config.ignitionPath)),
    odometerKm: finite(getPath(item, config.odometerPath)),
    fuelLevelPercent: finite(getPath(item, config.fuelPath)),
    engineStatus: config.engineStatusPath ? String(getPath(item, config.engineStatusPath) ?? '').trim() || undefined : undefined,
    stale: ageMs > 10 * 60 * 1000
  };
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const actor = await verifiedStaff(req, res);
  if (!actor) return;

  const loaded = readConfig();
  if (!loaded.configured) {
    return res.status(503).json({
      configured: false,
      provider: 'etqan',
      error: 'Etqan live tracking integration is not configured.',
      missingConfiguration: loaded.missing
    });
  }

  try {
    const config = loaded.value;
    const authValue = config.authScheme.trim() ? `${config.authScheme.trim()} ${config.token}` : config.token;
    const upstream = await fetch(buildUpstreamUrl(config), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        [config.authHeader]: authValue
      },
      signal: AbortSignal.timeout(10_000)
    });

    if (!upstream.ok) {
      console.error('[telematics] Etqan upstream failed', upstream.status);
      return res.status(502).json({ configured: true, provider: 'etqan', error: `Tracking provider returned HTTP ${upstream.status}.` });
    }

    const payload = await upstream.json();
    const normalized = extractItems(payload, config).map(item => normalizeItem(item, config)).filter(Boolean) as Array<Omit<NormalizedPing, 'vehicleId' | 'plateNumber' | 'vehicleName'>>;

    const vehicleSnapshot = await admin.firestore().collection('vehicles').get();
    const byDeviceId = new Map<string, { id: string; plateNumber?: string; vehicleName: string }>();
    for (const doc of vehicleSnapshot.docs) {
      const vehicle = doc.data() as any;
      const deviceId = String(vehicle?.customFields?.etqanDeviceId || vehicle?.customFields?.trackingDeviceId || '').trim();
      if (!deviceId) continue;
      byDeviceId.set(deviceId, {
        id: doc.id,
        plateNumber: String(vehicle.plateNumber || ''),
        vehicleName: `${String(vehicle.make || '').trim()} ${String(vehicle.model || '').trim()}`.trim() || doc.id
      });
    }

    const positions: NormalizedPing[] = normalized.map(item => {
      const linked = byDeviceId.get(item.providerDeviceId);
      return linked ? { ...item, vehicleId: linked.id, plateNumber: linked.plateNumber, vehicleName: linked.vehicleName } : item;
    });

    const linkedCount = positions.filter(position => position.vehicleId).length;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      configured: true,
      provider: 'etqan',
      fetchedAt: new Date().toISOString(),
      linkedCount,
      unlinkedCount: positions.length - linkedCount,
      positions
    });
  } catch (error: any) {
    console.error('[telematics] live provider integration failed', error);
    return res.status(502).json({ configured: true, provider: 'etqan', error: error?.message || 'Live tracking provider request failed.' });
  }
}
