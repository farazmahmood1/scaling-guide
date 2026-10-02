import { useCallback } from 'react';

import { useApi } from '@/hooks/use-api';
import type { OrderPage } from '@/lib/api';
import type { ListQuery } from '@/lib/list-query';
import { fetchAllOrders, ordersPath } from '@/lib/orders';

/** One page of orders for a list view, plus the export of the whole view. */
export function useOrderList(query: ListQuery) {
  const state = useApi<OrderPage>(ordersPath(query));
  const exportRows = useCallback(() => fetchAllOrders(query), [query]);
  return { ...state, exportRows };
}
