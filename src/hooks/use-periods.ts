import { useMemo } from 'react';

import { useApi } from '@/hooks/use-api';
import type { Period } from '@/lib/api';
import { closedMonths } from '@/lib/ledger';

/** Which months are closed, for marking every figure and line that falls in one. */
export function usePeriods() {
  const { data, error, loading, reload } = useApi<{ periods: Period[] }>('/api/v1/accounting/periods');
  const closed = useMemo(() => closedMonths(data?.periods ?? []), [data]);
  return { periods: data?.periods, closed, error, loading, reload };
}
