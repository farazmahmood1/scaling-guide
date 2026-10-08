import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type CheckInResponse, apiPost } from '@/lib/api';
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
      let response: CheckInResponse | undefined;
      try {
        const saved = await submitCheckIn({
          shipmentId,
          outcome,
          current: () => latest.current,
          apply,
          send: async () => {
            response = await apiPost<CheckInResponse>(`/api/v1/stock/returns/${shipmentId}/check-in`, { outcome });
          },
        });
        if (saved) {
          // The check-in is saved whatever Shopify said; say what Shopify did, or why it did not.
          const sync = response?.shopify;
          if (sync?.outcome === 'failed') toast.warning(`${trackingNumber} checked in as ${outcome}; Shopify was not updated`, { description: sync.error ?? sync.message });
          else toast.success(`${trackingNumber} checked in as ${outcome}`, sync ? { description: `Shopify: ${sync.message}` } : undefined);
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
