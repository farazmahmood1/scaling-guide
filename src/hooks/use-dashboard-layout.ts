import { useCallback, useState } from 'react';

import { useAuth } from '@/auth/auth-context';
import { type Layouts, readSavedLayout, writeSavedLayout } from '@/lib/dashboard-layout';

/**
 * What is being arranged: whether the cards can be moved now, and the layout this person saved on
 * this browser. Held by the page, so the Customize button can sit with the filters while the grid
 * is further down.
 */
export function useDashboardLayout() {
  const { user } = useAuth();
  const person = user?.email;
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<unknown>(() => readSavedLayout(person));
  const keep = useCallback(
    (next: Layouts) => {
      setSaved(next);
      writeSavedLayout(person, next);
    },
    [person],
  );
  const reset = useCallback(() => {
    setSaved(null);
    writeSavedLayout(person, null);
  }, [person]);
  return { editing, setEditing, saved, keep, reset };
}
export type DashboardLayout = ReturnType<typeof useDashboardLayout>;
