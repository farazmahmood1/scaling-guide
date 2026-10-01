import { formatKarachiFull } from '@/lib/format';
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
  // An event with no code at all: PostEx's words if it gave any, never "Status code ".
  if (!code.trim()) return { label: message?.trim() || 'Status update', known: false, reason: null };
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

export const PARCEL_FLAGS = ['unmatched', 'zero_cod', 'pr', 'not_checked_in', 'checked_in'] as const;

export const FLAG_LABELS: Record<(typeof PARCEL_FLAGS)[number], string> = {
  unmatched: 'No order linked',
  zero_cod: 'Zero COD',
  pr: 'PR parcel',
  not_checked_in: 'Returned, not checked in',
  checked_in: 'Checked in',
};

export interface TimelineEntry {
  code: string;
  label: string;
  known: boolean;
  reason: string | null;
  /** PostEx's own message, when it says more than our label does. */
  detail: string | null;
  /** Karachi time with the zone, or a dash when PostEx gave none or gave something unreadable. */
  when: string;
}

const karachiStamp = (iso: string | null): string => {
  try {
    return formatKarachiFull(iso);
  } catch {
    // Intl throws on a string that is not a date; one bad event must not take the page down.
    return '—';
  }
};

/** Every event of a parcel in words and Karachi time. Total: no code, known or not, throws. */
export const timelineEntries = (events: ReadonlyArray<{ code: string; message: string; occurredAt: string | null }>): TimelineEntry[] =>
  events.map((e) => {
    const text = describeStatus(e.code, e.message);
    const message = e.message?.trim() ?? '';
    return {
      code: e.code,
      label: text.label,
      known: text.known,
      reason: text.reason,
      detail: message && message !== text.label && !text.label.startsWith(message) ? message : null,
      when: karachiStamp(e.occurredAt),
    };
  });

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
