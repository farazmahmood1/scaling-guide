import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { type ListQuery, type QuerySpec, applyChange, parseQuery, toParams } from '@/lib/list-query';

/**
 * A list screen's state, read from and written to the URL. `replace` is for changes made while
 * typing (search), so Back does not step through every keystroke; everything else pushes a new
 * history entry, so Back undoes a filter. Parameters the spec does not own are kept.
 */
export function useListQuery(spec: QuerySpec): [ListQuery, (change: Partial<ListQuery>, options?: { replace?: boolean }) => void] {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseQuery(params, spec), [params, spec]);
  const update = useCallback(
    (change: Partial<ListQuery>, options: { replace?: boolean } = {}) => {
      setParams(
        (current) => {
          const next = toParams(applyChange(parseQuery(current, spec), change), spec);
          const owned = new Set(['q', 'from', 'to', 'page', 'size', 'sort', 'hide', ...Object.keys(spec.multi)]);
          for (const [key, value] of current) if (!owned.has(key)) next.append(key, value);
          return next;
        },
        { replace: options.replace ?? false },
      );
    },
    [setParams, spec],
  );
  return [query, update];
}
