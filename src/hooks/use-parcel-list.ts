import { useCallback } from 'react';

import { useApi } from '@/hooks/use-api';
import type { ParcelPage } from '@/lib/api';
import type { ListQuery } from '@/lib/list-query';
import { fetchAllParcels } from '@/lib/parcels';
import { parcelsPath } from '@/lib/postex';

/** One page of parcels for a list view, plus the export of the whole view. */
export function useParcelList(query: ListQuery) {
  const state = useApi<ParcelPage>(parcelsPath(query));
  const exportRows = useCallback(() => fetchAllParcels(query), [query]);
  return { ...state, exportRows };
}
