import type { ListQuery } from '@/lib/list-query';

/**
 * PostEx status codes in words (CLAUDE.md lists the ones verified on live data). A code not in
 * the list still renders: PostEx's own message, marked as one we do not know yet, never a crash.
 */
export const STATUS_LABELS: Record<string, string> = {
  '0002': 'Cancelled by us in PostEx',
  '0005': 'Delivered',
  '0006': 'Returned to our warehouse',
  '0008': 'Under review at PostEx',
  '0013': 'Delivery attempted',
  '0040': 'Return started',
};

/** Why an attempt failed (`0013`), as PostEx abbreviates it. */
export const FAILURE_REASONS: Record<string, string> = {
  RFD: 'Customer refused',
  CNA: 'Customer not available',
  ICA: 'Incomplete address',
  OPN: 'Customer wanted to open it first',
};

export interface StatusText {
  label: string;
  known: boolean;
  /** For an attempt: why it failed, when PostEx said. */
  reason: string | null;
}

export const describeStatus = (code: string | null, message?: string | null): StatusText => {
  if (code === null) return { label: 'Booked, not yet moving', known: true, reason: null };
  const label = STATUS_LABELS[code];
  const abbr = /\b(RFD|CNA|ICA|OPN)\b/.exec(message ?? '')?.[1];
  const reason = code === '0013' && abbr ? (FAILURE_REASONS[abbr] ?? null) : null;
  if (label) return { label, known: true, reason };
  const text = message?.trim();
  return { label: text ? `${text} (code ${code})` : `Status code ${code}`, known: false, reason: null };
};

export const STAGES = ['booked', 'in_transit', 'attempted', 'delivered', 'returning', 'returned', 'cancelled'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  booked: 'Booked',
  in_transit: 'In transit',
  attempted: 'Attempted',
  delivered: 'Delivered',
  returning: 'Returning',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

export const stageTone = (stage: string): 'default' | 'secondary' | 'destructive' | 'outline' =>
  stage === 'delivered' ? 'default' : stage === 'returned' || stage === 'returning' || stage === 'cancelled' ? 'destructive' : stage === 'attempted' ? 'outline' : 'secondary';

/** The parcels API address for a list view: the same names the URL uses, so the two never drift. */
export const parcelsPath = (q: ListQuery, page: { page: number; pageSize: number } = q): string => {
  const params = new URLSearchParams();
  if (q.search) params.set('q', q.search);
  for (const key of ['stage', 'store', 'flag', 'city']) {
    const values = q.multi[key];
    if (values?.length) params.set(key, values.join(','));
  }
  if (q.from) params.set('from', q.from);
  if (q.to) params.set('to', q.to);
  if (q.sort) params.set('sort', `${q.sort.key}:${q.sort.dir}`);
  params.set('page', String(page.page));
  params.set('size', String(page.pageSize));
  return `/api/v1/parcels?${params}`;
};
