import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useApi } from '@/hooks/use-api';
import { ApiError, DATA_CHANGED_EVENT } from '@/lib/api';
import { queryClient } from '@/lib/query-client';

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function Count({ path }: { path: string }) {
  const { data, loading } = useApi<{ count: number }>(path);
  return <p>{loading ? 'loading' : `count ${data?.count}`}</p>;
}

describe('the read cache', () => {
  it('draws a path it has already read from the cache, keyed by the whole path', () => {
    queryClient.setQueryData(['/api/v1/parcels?store=nur'], { count: 7 });
    expect(renderToStaticMarkup(<Count path="/api/v1/parcels?store=nur" />)).toContain('count 7');
    // Another brand is another answer, never the cached one.
    expect(renderToStaticMarkup(<Count path="/api/v1/parcels?store=organics" />)).toContain('loading');
  });

  it('retries a dropped connection once, and never a refusal from the server', () => {
    const retry = queryClient.getDefaultOptions().queries?.retry as (failures: number, error: Error) => boolean;
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(retry(1, new TypeError('Failed to fetch'))).toBe(false);
    expect(retry(0, new ApiError('Forbidden', 403))).toBe(false);
    expect(retry(0, new ApiError('Bad Gateway', 502))).toBe(false);
  });

  it('marks every cached read stale when a write goes through', async () => {
    // Tests run in Node: the client listens on `window` only where there is one, so give it one first.
    const events = new EventTarget();
    vi.stubGlobal('window', events);
    vi.resetModules();
    const fresh = (await import('@/lib/query-client')).queryClient;
    fresh.setQueryData(['/api/v1/reports/dashboard'], { ok: true });
    expect(fresh.getQueryState(['/api/v1/reports/dashboard'])?.isInvalidated).toBe(false);

    events.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    expect(fresh.getQueryState(['/api/v1/reports/dashboard'])?.isInvalidated).toBe(true);
    fresh.clear();
  });
});
