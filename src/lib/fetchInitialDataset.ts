import { apiFetch } from './apiFetch.js';

/**
 * Distinguishes a successful empty dataset from a failed initial request.
 * Undefined means the caller must preserve any state already populated by a
 * live Firestore listener; an actual [] from a successful response remains a
 * valid empty collection.
 */
export async function fetchInitialDataset<T>(path: string): Promise<T | undefined> {
  try {
    const res = await apiFetch(path);
    const body = await res.json().catch(() => undefined);
    if (!res.ok) {
      const message = body && typeof body === 'object' && 'error' in body
        ? String((body as any).error)
        : `${res.status} ${res.statusText}`;
      throw new Error(message);
    }
    if (body === undefined) throw new Error('The server returned a non-JSON response.');
    return body as T;
  } catch (error) {
    console.warn(`Initial CRM dataset request failed for ${path}; preserving current state.`, error);
    return undefined;
  }
}
