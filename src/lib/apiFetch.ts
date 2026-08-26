import { auth } from '../firebase/config';

/**
 * Drop-in replacement for the global `fetch` for calls to this app's own
 * `/api/*` backend. Attaches the current Firebase user's ID token as a
 * Bearer Authorization header so the server can verify who is calling it.
 *
 * The server (see server.ts) now requires this token on every /api/* route
 * except /api/health — without it, previously anyone on the internet could
 * call these endpoints directly (create/edit/delete customers, contracts,
 * payments, etc.) with no login at all.
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

  return fetch(input, { ...init, headers });
}
