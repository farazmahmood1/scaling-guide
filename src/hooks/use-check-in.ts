import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type CheckInLine, type CheckInResponse, type ShopifySyncState, apiPost } from '@/lib/api';
import { type Outcome, type Pending, emptyPending, submitCheckIn } from '@/lib/check-in';

const OUTCOME_WORDS: Record<Outcome, string> = { restocked: 'restocked', damaged: 'damaged', mixed: 'split (part restocked, part damaged)' };

/** What Shopify did after a return action, as a toast: a refusal warns, a wait on the open order informs. */
export const announceShopify = (head: string, sync: (ShopifySyncState & { error?: string | null }) | null | undefined): void => {
  if (sync?.outcome === 'failed') toast.warning(`${head}; Shopify was not updated`, { description: sync.error ?? sync.message });
  else if (sync?.outcome === 'pending') toast.info(`${head}; Shopify still has the order open`, { description: sync.message });
  else toast.success(head, sync ? { description: `Shopify: ${sync.message}` } : undefined);
};

/**
 * Warehouse check-in for the screens that have it. The outcome shows at once; a refusal puts the
 * row back and says why. `onSaved` runs once the server agreed, so the screen can reload what
 * depends on it (the list, the alert). A check-in never cancels the Shopify order: that is
 * `cancelInShopify`, its own action, asked for separately.
 */
export function useCheckIn(onSaved: () => void) {
  const latest = useRef<Pending>(emptyPending());
  const [pending, setPending] = useState<Pending>(emptyPending);
  const [busyShopify, setBusyShopify] = useState<string | null>(null);

  const apply = useCallback((change: (p: Pending) => Pending) => {
    latest.current = change(latest.current);
    setPending(latest.current);
  }, []);

  const checkIn = useCallback(
    async (shipmentId: string, trackingNumber: string, outcome: Outcome, lines?: CheckInLine[]): Promise<boolean> => {
      let response: CheckInResponse | undefined;
      try {
        const saved = await submitCheckIn({
          shipmentId,
          outcome,
          current: () => latest.current,
          apply,
          send: async () => {
            response = await apiPost<CheckInResponse>(`/api/v1/stock/returns/${shipmentId}/check-in`, { outcome, ...(lines ? { lines } : {}) });
          },
        });
        if (saved) {
          // The check-in is saved whatever Shopify said; say what Shopify did, or why it did not.
          announceShopify(`${trackingNumber} checked in as ${OUTCOME_WORDS[outcome]}`, response?.shopify);
          onSaved();
        }
        return saved;
      } catch (cause) {
        toast.error(cause instanceof Error ? `${trackingNumber}: ${cause.message}` : 'Check-in failed');
        return false;
      }
    },
    [apply, onSaved],
  );

  /** Asks Shopify again for a check-in it refused, or that waits on the open order. */
  const retryShopify = useCallback(
    async (shipmentId: string, trackingNumber: string) => {
      setBusyShopify(shipmentId);
      try {
        const result = await apiPost<CheckInResponse>(`/api/v1/stock/returns/${shipmentId}/shopify-sync`, {});
        announceShopify(trackingNumber, result.shopify);
        onSaved();
      } catch (cause) {
        toast.error(cause instanceof Error ? `${trackingNumber}: ${cause.message}` : 'Could not reach Shopify');
      } finally {
        setBusyShopify(null);
      }
    },
    [onSaved],
  );

  /** Cancels the parcel's order in Shopify, restocking it only if goods came back in good condition. Asked for, never automatic. */
  const cancelInShopify = useCallback(
    async (shipmentId: string, trackingNumber: string) => {
      setBusyShopify(shipmentId);
      try {
        const result = await apiPost<CheckInResponse>(`/api/v1/stock/returns/${shipmentId}/shopify-cancel`, {});
        announceShopify(`${trackingNumber}: order cancelled in Shopify`, result.shopify);
        onSaved();
      } catch (cause) {
        toast.error(cause instanceof Error ? `${trackingNumber}: ${cause.message}` : 'Could not cancel in Shopify');
      } finally {
        setBusyShopify(null);
      }
    },
    [onSaved],
  );

  return { pending, checkIn, retryShopify, cancelInShopify, busyShopify };
}
