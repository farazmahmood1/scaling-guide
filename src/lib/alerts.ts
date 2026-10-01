import { DEFINITIONS } from '@/lib/dashboard';
import { kindLabel } from '@/lib/format';
import { orderKinds, profileFor } from '@/lib/reconciliation';

/** The desk's own alerts live on the Confirmation Desk; everything else is the reconciliation queue. */
const DESK_KINDS = new Set(['confirmed_not_booked', 'cancelled_but_booked']);

export interface AlertRow {
  key: string;
  label: string;
  count: number;
  href: string;
  /** What this alert means, for its definition on hover. */
  meaning: string;
  returns?: boolean;
}

/**
 * The queue's open counts and the unchecked returns as one list: returns first (stock is missing
 * from the shelf until they are checked in), then the queue's kinds in its own order. A kind with
 * nothing open is not listed, so an empty list means all clear.
 */
export const alertRows = (open: Record<string, number>, awaiting: number): AlertRow[] => [
  ...(awaiting > 0 ? [{ key: 'returns', label: 'Returned parcels not checked in', count: awaiting, href: '/returns', meaning: DEFINITIONS.returnsAwaiting, returns: true }] : []),
  ...orderKinds(Object.keys(open))
    .filter((k) => (open[k] ?? 0) > 0)
    .map((k) => ({ key: k, label: kindLabel(k), count: open[k]!, href: DESK_KINDS.has(k) ? '/confirmations' : '/reconciliation', meaning: profileFor(k).question })),
];
