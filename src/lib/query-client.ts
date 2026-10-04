import { QueryClient } from '@tanstack/react-query';

import { ApiError, DATA_CHANGED_EVENT } from '@/lib/api';

/**
 * The one cache every read goes through. A screen opened again within a minute is drawn from it
 * with no request; after that it is shown at once and refreshed behind. Two parts of a page asking
 * for the same thing (the closed months, the cities) share one request.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      // Coming back to the tab would refetch everything on screen; the minute's staleness is fine.
      refetchOnWindowFocus: false,
      // The server refusing is an answer, not a blip: only a dropped connection is tried once more.
      retry: (failures, error) => failures < 1 && !(error instanceof ApiError),
    },
  },
});

// Any write may change any figure (a check-in moves stock, the ledger and the dashboard), so every
// cached read is marked stale and the ones on screen are fetched again.
if (typeof window !== 'undefined') window.addEventListener(DATA_CHANGED_EVENT, () => void queryClient.invalidateQueries());
