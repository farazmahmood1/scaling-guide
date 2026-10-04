import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { apiGet } from '@/lib/api';
import { queryClient } from '@/lib/query-client';

export interface AsyncState<T> {
  data?: T;
  error?: string;
  /** A request for this view is in flight: the first load, a changed filter, or a reload. */
  loading: boolean;
  reload: () => void;
}

/**
 * A GET, cached by its path. While a changed path loads, the previous answer stays on screen, so a
 * filter change dims the table rather than blanking it. The client is passed in, not read from
 * context, so a component renders the same in a test with no provider around it.
 */
export function useApi<T>(path: string): AsyncState<T> {
  const query = useQuery({ queryKey: [path], queryFn: ({ signal }) => apiGet<T>(path, signal), placeholderData: keepPreviousData }, queryClient);
  const { refetch } = query;
  // Joins a request already in flight (one a write just started) rather than cancelling it.
  const reload = useCallback(() => void refetch({ cancelRefetch: false }), [refetch]);
  return {
    data: query.data,
    error: query.error ? query.error.message || 'Request failed' : undefined,
    loading: query.isFetching,
    reload,
  };
}
