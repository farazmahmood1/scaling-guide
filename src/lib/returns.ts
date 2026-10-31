import type { CheckInLine, ParcelUnit } from '@/lib/api';
import type { Outcome } from '@/lib/check-in';

/**
 * The split check-in's arithmetic, apart from how it draws: per product, the units marked fine go
 * back on the shelf and the rest are damaged, so the two always add up to what the parcel carried.
 */

/** Each product's lines from the "fine" counts typed so far; untouched products are all fine. */
export const splitLines = (units: readonly ParcelUnit[], fine: Record<string, number>): CheckInLine[] =>
  units.map((u) => {
    const typed = fine[u.variantId];
    const restocked = typed === undefined || !Number.isFinite(typed) ? u.qty : Math.min(u.qty, Math.max(0, Math.trunc(typed)));
    return { variantId: u.variantId, restocked, damaged: u.qty - restocked };
  });

/** Why the split cannot be sent as it is, or null: one that sends everything one way is a plain check-in. */
export const splitProblem = (units: readonly ParcelUnit[], lines: readonly CheckInLine[]): string | null => {
  if (units.length === 0) return 'Nothing to split.';
  if (lines.every((l) => l.damaged === 0)) return 'Everything is fine: use Restock instead.';
  if (lines.every((l) => l.restocked === 0)) return 'Everything is damaged: use Damaged instead.';
  return null;
};

/** Where a returned parcel is, in words: on its way back, or handed back to us. */
export const returnStageText = (stage: string | null): string => (stage === 'returning' ? 'On the way back' : stage === 'returned' ? 'Back with us' : (stage ?? '—'));

/** What a check-in does to the order in Shopify, in words, for the confirmation. */
export const shopifyEffect = (orderNumber: string, outcome: Outcome): string => {
  const items = outcome === 'restocked' ? 'its items restocked' : outcome === 'damaged' ? 'its items not restocked' : 'the good items restocked and the damaged ones not';
  return `In Shopify, ${orderNumber} is cancelled with ${items} if it is still open there, or gets a return recorded the same way if it was fulfilled. No refund, and the customer is not emailed. A cancel cannot be undone in Shopify.`;
};
