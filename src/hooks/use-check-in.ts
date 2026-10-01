import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { apiPost } from '@/lib/api';
import { type Outcome, type Pending, emptyPending, submitCheckIn } from '@/lib/check-in';

/**
 * Warehouse check-in for the screens that have it. The outcome shows at once; a refusal puts the
 * row back and says why. `onSaved` runs once the server agreed, so the screen can reload what
 * depends on it (the list, the alert).
 */
export function useCheckIn(onSaved: () => void) {
  const latest = useRef<Pending>(emptyPending());
  const [pending, setPending] = useState<Pending>(emptyPending);

  const apply = useCallback((change: (p: Pending) => Pending) => {
    latest.current = change(latest.current);
    setPending(latest.current);
  }, []);

  const checkIn = useCallback(
    async (shipmentId: string, trackingNumber: string, outcome: Outcome) => {
      try {
        const saved = await submitCheckIn({
          shipmentId,
          outcome,
          current: () => latest.current,
          apply,
          send: () => apiPost(`/api/v1/stock/returns/${shipmentId}/check-in`, { outcome }),
        });
        if (saved) {
          toast.success(`${trackingNumber} checked in as ${outcome}`);
          onSaved();
        }
      } catch (cause) {
        toast.error(cause instanceof Error ? `${trackingNumber}: ${cause.message}` : 'Check-in failed');
      }
    },
    [apply, onSaved],
  );

  return { pending, checkIn };
}
