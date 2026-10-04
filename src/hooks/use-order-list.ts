import { useCallback, useMemo } from 'react';

import { useBrand } from '@/brand/brand-context';
import { useApi } from '@/hooks/use-api';
import type { OrderPage } from '@/lib/api';
import { withBrand } from '@/lib/brand';
import type { ListQuery } from '@/lib/list-query';
import { fetchAllOrders, ordersPath } from '@/lib/orders';

/** One page of orders for a list view, plus the export of the whole view, both narrowed to the sidebar's brand. */
export function useOrderList(view: ListQuery) {
  const { brand } = useBrand();
  const query = useMemo(() => withBrand(view, brand), [view, brand]);
  const state = useApi<OrderPage>(ordersPath(query));
  const exportRows = useCallback(() => fetchAllOrders(query), [query]);
  return { ...state, exportRows };
}
