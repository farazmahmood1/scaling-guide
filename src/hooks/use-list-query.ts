import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { saveColumns, useSavedColumns } from '@/hooks/use-saved-columns';
import { type ListQuery, type QuerySpec, applyChange, parseQuery, toParams, withSavedColumns } from '@/lib/list-query';

/**
 * A list screen's state, read from and written to the URL. `replace` is for changes made while
 * typing (search), so Back does not step through every keystroke; everything else pushes a new
 * history entry, so Back undoes a filter. Parameters the spec does not own are kept. The columns
 * a person hides are also saved with their account (when the spec names a `screen`), so the list
 * opens with them hidden next time.
 */
export function useListQuery(spec: QuerySpec): [ListQuery, (change: Partial<ListQuery>, options?: { replace?: boolean }) => void] {
  const [params, setParams] = useSearchParams();
  const saved = useSavedColumns(spec.screen);
  const query = useMemo(() => withSavedColumns(parseQuery(params, spec), params, spec, saved), [params, spec, saved]);
  const update = useCallback(
    (change: Partial<ListQuery>, options: { replace?: boolean } = {}) => {
      if (change.hidden && spec.screen) saveColumns(spec.screen, change.hidden);
      setParams(
        (current) => {
          // The saved columns are already the view, so they stay out of the URL.
          const next = toParams(applyChange(parseQuery(current, spec), change), spec);
          if (change.hidden && spec.screen) next.delete('hide');
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
