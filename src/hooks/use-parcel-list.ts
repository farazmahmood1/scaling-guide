import { useCallback, useMemo } from 'react';

import { useBrand } from '@/brand/brand-context';
import { useApi } from '@/hooks/use-api';
import type { ParcelPage } from '@/lib/api';
import { withBrand } from '@/lib/brand';
import type { ListQuery } from '@/lib/list-query';
import { fetchAllParcels } from '@/lib/parcels';
import { parcelsPath } from '@/lib/postex';

/** One page of parcels for a list view, plus the export of the whole view, both narrowed to the sidebar's brand. */
export function useParcelList(view: ListQuery) {
  const { brand } = useBrand();
  const query = useMemo(() => withBrand(view, brand), [view, brand]);
  const state = useApi<ParcelPage>(parcelsPath(query));
  const exportRows = useCallback(() => fetchAllParcels(query), [query]);
  return { ...state, exportRows };
}
