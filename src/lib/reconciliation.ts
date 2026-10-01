import type { ReviewItem } from '@/lib/api';
import { REASONS } from '@/lib/format';

/**
 * How each kind of reconciliation item is presented and what a person can do with it. The five
 * rules of BUILD-PLAN step 9 each have their own question, actions and wording for a decision;
 * anything else the jobs open falls back to a plain profile, so a new kind still shows up.
 */
export const RULE_KINDS = ['unmatched_shipment', 'cod_mismatch', 'possible_duplicate_booking', 'stuck_in_transit', 'postex_unknown_status'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export type QueueAction = 'link' | 'unlink' | 'resolve' | 'ignore';

interface Decision {
  /** The button, in the words of this kind: what "resolved" or "ignored" means here. */
  label: string;
  /** What the note should say. A note is always required. */
  prompt: string;
  /** One-tap starting points for the note; a person can edit them. */
  chips: readonly string[];
}

export interface KindProfile {
  kind: string;
  title: string;
  /** What a person is being asked, in one sentence. */
  question: string;
  actions: readonly QueueAction[];
  resolve: Decision;
  ignore: Decision;
  /** Only for a kind whose parcel is linked: take the link back out. */
  unlink?: Decision;
}

const PROFILES: Record<string, KindProfile> = {
  unmatched_shipment: {
    kind: 'unmatched_shipment',
    title: 'Parcels without an order',
    question: 'PostEx carries this parcel, but no Shopify order is linked to it.',
    actions: ['link', 'resolve', 'ignore'],
    resolve: { label: 'No order exists', prompt: 'What happened to the order?', chips: ['Order was deleted in Shopify', 'Order is older than the 60 days Shopify returns'] },
    ignore: { label: 'Not an order parcel', prompt: 'What is this parcel instead?', chips: ['Sample or gift, never an order', 'Booked by mistake'] },
  },
  cod_mismatch: {
    kind: 'cod_mismatch',
    title: 'COD differs from the order',
    question: 'PostEx will collect a different amount from the customer than the order says.',
    actions: ['resolve', 'ignore'],
    resolve: { label: 'Corrected', prompt: 'What was corrected, and where?', chips: ['Corrected on the PostEx portal', 'Order total was edited after booking'] },
    ignore: { label: 'COD is right', prompt: 'Why is this amount correct?', chips: ['Customer paid part online', 'Zero COD on purpose (PR or gift)'] },
  },
  possible_duplicate_booking: {
    kind: 'possible_duplicate_booking',
    title: 'Possible duplicate bookings',
    question: 'More than one live parcel exists for the same order; the customer could be charged or sent twice.',
    actions: ['resolve', 'ignore'],
    resolve: { label: 'Extra cancelled', prompt: 'Which parcel was cancelled, and how?', chips: ['Extra parcel cancelled at PostEx', 'Extra parcel intercepted before delivery'] },
    ignore: { label: 'Intentional re-send', prompt: 'Why are there two parcels?', chips: ['Re-sent after a refused attempt', 'Two different orders share a reference'] },
  },
  stuck_in_transit: {
    kind: 'stuck_in_transit',
    title: 'Stuck in transit',
    question: 'This parcel has not changed status for longer than expected.',
    actions: ['resolve', 'ignore'],
    resolve: { label: 'Chased with PostEx', prompt: 'What did PostEx say?', chips: ['Called PostEx, parcel is moving', 'PostEx confirmed it is lost'] },
    ignore: { label: 'Expected delay', prompt: 'Why is the delay fine?', chips: ['Remote city, slow lane', 'Customer asked us to hold delivery'] },
  },
  postex_unknown_status: {
    kind: 'postex_unknown_status',
    title: 'Unknown PostEx statuses',
    question: 'PostEx sent a status code we have no meaning for yet.',
    actions: ['resolve', 'ignore'],
    resolve: { label: 'Code understood', prompt: 'What does the code mean?', chips: ['Meaning confirmed with PostEx'] },
    ignore: { label: 'Not important', prompt: 'Why can this code be left alone?', chips: ['Booking-stage code, nothing to do'] },
  },
  match_suggested: {
    kind: 'match_suggested',
    title: 'Matches to check',
    question: 'The matcher linked this parcel without an order number; glance at it to be sure.',
    actions: ['unlink', 'resolve', 'ignore'],
    resolve: { label: 'Match is right', prompt: 'How did you check?', chips: ['Checked: same customer and amount'] },
    ignore: { label: 'Leave it', prompt: 'Why leave it unchecked?', chips: ['Low value, not worth a check'] },
    unlink: { label: 'Wrong order: unlink', prompt: 'Why is this the wrong order?', chips: ['Different customer', 'Same amount and city by coincidence'] },
  },
};

export const profileFor = (kind: string): KindProfile =>
  PROFILES[kind] ?? {
    kind,
    title: kind.replaceAll('_', ' '),
    question: 'A job opened this item for a person to look at.',
    actions: ['resolve', 'ignore'],
    resolve: { label: 'Resolved', prompt: 'What was done?', chips: [] },
    ignore: { label: 'Ignore', prompt: 'Why is this not a problem?', chips: [] },
  };

/** The five rules first, in rule order; anything else after, alphabetically. */
export const orderKinds = (kinds: readonly string[]): string[] => {
  const rank = (k: string) => {
    const i = (RULE_KINDS as readonly string[]).indexOf(k);
    return i === -1 ? RULE_KINDS.length : i;
  };
  return [...kinds].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

const SEVERITY_RANK: Record<ReviewItem['severity'], number> = { error: 0, warning: 1, info: 2 };

/** Worst first; the API's newest-first order is kept within a severity. */
export const bySeverity = <T extends Pick<ReviewItem, 'severity'>>(items: readonly T[]): T[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (SEVERITY_RANK[a.item.severity] ?? 3) - (SEVERITY_RANK[b.item.severity] ?? 3) || a.index - b.index)
    .map((x) => x.item);

export const SEVERITY_TEXT: Record<ReviewItem['severity'], { label: string; variant: 'destructive' | 'outline' | 'secondary' }> = {
  error: { label: 'Urgent', variant: 'destructive' },
  warning: { label: 'Check', variant: 'outline' },
  info: { label: 'For information', variant: 'secondary' },
};

/** One fewer open item of a kind; a kind with none left drops out, so its group disappears. */
export const dropOne = (counts: Readonly<Record<string, number>>, kind: string): Record<string, number> => {
  const { [kind]: current = 0, ...rest } = counts;
  return current > 1 ? { ...rest, [kind]: current - 1 } : rest;
};

const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

const METHOD_TEXT: Record<string, string> = {
  tracking_note: "the order's note names this parcel's tracking number",
  order_ref: 'the order number on the label',
  cod_city_window: 'the same COD to the paisa and the same city, ordered shortly before booking',
  phone_window: "the customer's phone, ordered shortly before booking",
};

/**
 * The parcels of a duplicate-booking item, each with the id that opens it. The backend writes id
 * and number together; an item opened before it did has only the numbers, which can still be
 * searched for but not opened directly.
 */
export const duplicateParcels = (detail: Record<string, unknown>): Array<{ id: string | null; trackingNumber: string }> => {
  const paired = Array.isArray(detail['parcels'])
    ? (detail['parcels'] as unknown[]).flatMap((p) => {
        const o = p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
        return typeof o['trackingNumber'] === 'string' && o['trackingNumber'] ? [{ id: typeof o['id'] === 'string' && o['id'] ? o['id'] : null, trackingNumber: o['trackingNumber'] }] : [];
      })
    : [];
  if (paired.length > 0) return paired;
  return Array.isArray(detail['trackingNumbers']) ? (detail['trackingNumbers'] as unknown[]).map(text).filter(Boolean).map((trackingNumber) => ({ id: null, trackingNumber })) : [];
};

const NO_MATCH_ADVICE: Record<string, string> = {
  unlinked_by_hand: 'A person took this parcel off the wrong order, and the matcher will not offer that order again. Link the right one.',
  account_has_no_store: 'Set which store this PostEx account belongs to, then it matches by itself.',
  foreign_ref_prefix: 'It may be the other brand\'s order. Add the prefix in Parcel matching if this store uses it.',
  order_ref_not_found: 'The order may be older than the 60 days Shopify returns, or the number was mistyped.',
  ambiguous: 'Several orders fit equally well, so the matcher refused to pick one.',
  no_candidate_matched: 'Nothing fits by number, COD and city, or phone. Search the candidates below.',
};

export interface MatchExplanation {
  headline: string;
  advice: string | null;
  /** 0 to 1, only for a match the matcher made. */
  confidence: number | null;
}

/** Why the matcher did what it did, for the two kinds the matcher writes: no match, and a weak match. */
export const explainMatch = (item: Pick<ReviewItem, 'kind' | 'detail'>): MatchExplanation | null => {
  const d = item.detail;
  if (item.kind === 'unmatched_shipment') {
    const reason = text(d['reason']);
    return {
      headline: REASONS[reason] ? `Not matched: ${REASONS[reason]}` : 'Not matched: the matcher has no reason on record',
      advice: NO_MATCH_ADVICE[reason] ?? null,
      confidence: null,
    };
  }
  if (item.kind === 'match_suggested') {
    const method = text(d['method']);
    const confidence = typeof d['confidence'] === 'number' && Number.isFinite(d['confidence']) ? Math.min(1, Math.max(0, d['confidence'])) : null;
    return {
      headline: `Matched by ${METHOD_TEXT[method] ?? method.replaceAll('_', ' ') ?? 'an unknown method'}`,
      advice: 'No order number was written on the parcel, so the matcher inferred this one. Confirm it, or leave it.',
      confidence,
    };
  }
  return null;
};

export const confidencePercent = (confidence: number): string => `${Math.round(confidence * 100)}%`;
