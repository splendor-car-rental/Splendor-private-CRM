import { auth } from '../firebase/config';

interface IdempotencyCacheEntry {
  key: string;
  expiresAt: number;
}

const idempotencyCache = new Map<string, IdempotencyCacheEntry>();
const IDEMPOTENCY_REUSE_WINDOW_MS = 2 * 60 * 1000;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isCriticalFinancialWrite(url: string, method: string): boolean {
  if (method !== 'POST') return false;
  const path = (() => {
    try { return new URL(url, window.location.origin).pathname; }
    catch { return url.split('?')[0]; }
  })();
  return path === '/api/payments'
    || path === '/api/deposits'
    || path === '/api/accounting/credit-notes'
    || path === '/api/accounting/debit-notes'
    || /^\/api\/accounting\/payables\/[^/]+\/pay$/.test(path)
    || /^\/api\/accounting\/payments\/[^/]+\/allocate$/.test(path)
    || /^\/api\/accounting\/supplier-invoices\/[^/]+\/post$/.test(path)
    || /^\/api\/accounting\/charges\/[^/]+\/post$/.test(path)
    || /^\/api\/accounting\/deposits\/[^/]+\/(apply|refund)$/.test(path)
    || /^\/api\/deposits\/[^/]+\/(apply|refund)$/.test(path);
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function attachStableIdempotencyKey(input: RequestInfo | URL, init: RequestInit, headers: Headers): string | undefined {
  if (headers.has('Idempotency-Key')) return undefined;
  const method = String(init.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = requestUrl(input);
  if (!isCriticalFinancialWrite(url, method)) return undefined;

  const now = Date.now();
  for (const [cacheKey, entry] of idempotencyCache) {
    if (entry.expiresAt <= now) idempotencyCache.delete(cacheKey);
  }

  const bodyFingerprint = typeof init.body === 'string' ? init.body : '';
  const cacheKey = `${method}:${url}:${bodyFingerprint}`;
  let entry = idempotencyCache.get(cacheKey);
  if (!entry || entry.expiresAt <= now) {
    entry = { key: makeIdempotencyKey(), expiresAt: now + IDEMPOTENCY_REUSE_WINDOW_MS };
    idempotencyCache.set(cacheKey, entry);
  }
  headers.set('Idempotency-Key', entry.key);
  return cacheKey;
}

/**
 * Drop-in replacement for the global `fetch` for calls to this app's own
 * `/api/*` backend. Attaches the current Firebase user's ID token as a
 * Bearer Authorization header so the server can verify who is calling it.
 *
 * Critical finance POSTs share a short-lived Idempotency-Key only while the
 * outcome is ambiguous. Concurrent double-clicks and retries after network
 * errors/5xx reuse the key; once a definitive <500 response is received the
 * key is released, so a later intentional identical transaction is not
 * silently mistaken for a retry.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});

  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch (error) {
      console.warn('Failed to attach auth token to request:', error);
    }
  }

  const idempotencyCacheKey = attachStableIdempotencyKey(input, init, headers);
  try {
    const response = await fetch(input, { ...init, headers });
    if (idempotencyCacheKey && response.status < 500) idempotencyCache.delete(idempotencyCacheKey);
    return response;
  } catch (error) {
    // Keep the key until its short expiry because the caller cannot know
    // whether the server committed before the network failed.
    throw error;
  }
}
