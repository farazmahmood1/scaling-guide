import { useCallback, useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';

export interface AsyncState<T> {
  data?: T;
  error?: string;
  loading: boolean;
  reload: () => void;
}

/**
 * Small fetch-on-mount hook. Enough while the API surface is small; TanStack Query takes over
 * once caching and background refresh start to matter.
 */
export function useApi<T>(path: string): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    apiGet<T>(path, controller.signal)
      .then((result) => {
        setData(result);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Request failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  return { data, error, loading, reload };
}
