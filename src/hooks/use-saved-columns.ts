import { useEffect, useState } from 'react';

import { apiGet, apiPut } from '@/lib/api';

/**
 * The columns each list hides, as saved with the signed-in account. Read once per page load and
 * shared by every list; a save updates the copy here at once, so coming back to a list shows what
 * was chosen without waiting for the server. A failed read leaves every list on its defaults.
 */

type Saved = Record<string, string[]>;

let saved: Saved | null = null;
let loading: Promise<Saved> | null = null;
const listeners = new Set<() => void>();

const load = (): Promise<Saved> => {
  loading ??= apiGet<{ columns: Saved }>('/api/v1/auth/preferences')
    .then((r) => r.columns)
    .catch(() => {
      // The next list to open asks again.
      loading = null;
      return {};
    })
    .then((columns) => {
      // A save made while the read was in flight is newer than what it returned.
      saved = { ...columns, ...saved };
      for (const l of listeners) l();
      return saved;
    });
  return loading;
};

/** The hidden columns saved for `screen`; `undefined` until known, or when nothing was ever saved. */
export function useSavedColumns(screen: string | undefined): string[] | undefined {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!screen) return;
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
    };
  }, [screen]);
  return screen ? saved?.[screen] : undefined;
}

export const saveColumns = (screen: string, hidden: string[]): void => {
  saved = { ...saved, [screen]: hidden };
  for (const l of listeners) l();
  // Not worth interrupting anyone over: the choice still holds on this page load if it fails.
  apiPut(`/api/v1/auth/preferences/columns/${screen}`, { hidden }).catch(() => undefined);
};

/** Forgets what was read, for the next account to sign in on this tab. */
export const forgetSavedColumns = (): void => {
  saved = null;
  loading = null;
};
