import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('../src/lib/apiFetch', () => ({ apiFetch }));

import { fetchInitialDataset } from '../src/lib/fetchInitialDataset';

describe('fetchInitialDataset production data retention', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('preserves existing state when the API returns a failure', async () => {
    apiFetch.mockResolvedValueOnce(new Response('FUNCTION_INVOCATION_FAILED', { status: 500 }));
    await expect(fetchInitialDataset('/api/fleet')).resolves.toBeUndefined();
  });

  it('preserves existing state when the API response is not JSON', async () => {
    apiFetch.mockResolvedValueOnce(new Response('<html>error</html>', { status: 200 }));
    await expect(fetchInitialDataset('/api/fleet')).resolves.toBeUndefined();
  });

  it('accepts an explicit successful empty collection', async () => {
    apiFetch.mockResolvedValueOnce(
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    await expect(fetchInitialDataset<unknown[]>('/api/fleet')).resolves.toEqual([]);
  });

  it('preserves state when the authenticated fetch rejects before a response exists', async () => {
    apiFetch.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(fetchInitialDataset('/api/fleet')).resolves.toBeUndefined();
  });
});
