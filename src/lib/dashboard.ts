import type { BreakdownRow, RateFigure, ReturnRateRow, StoreKey } from '@/lib/api';
import { karachiLocal } from '@/lib/format';
import { monthLabel } from '@/lib/ledger';

/**
 * The dashboard's logic, apart from how it draws: the periods, what each figure means (one place,
 * so a number never appears without its definition), where each figure's report lives, and the
 * shaping of report rows for charts. Money stays integer paisa in strings until the moment a chart
 * needs a number to place a mark; every printed amount is formatted from the string.
 */

// ---- Periods ----

export const DASH_RANGES = [
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
] as const;
export type DashRangeKey = (typeof DASH_RANGES)[number]['key'];
export const isDashRange = (v: string | null): v is DashRangeKey => DASH_RANGES.some((r) => r.key === v);

const pad = (n: number) => String(n).padStart(2, '0');
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addDays = (day: string, days: number): string => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
export const todayKarachi = (): string => karachiLocal(new Date()).slice(0, 10);

export interface Period {
  from: string | null;
  to: string | null;
}

/** A named range as Karachi days; `all` is open-ended on both sides. */
export const rangeFor = (key: DashRangeKey, today: string = todayKarachi()): Period => {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  switch (key) {
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'month':
      return { from: `${y}-${pad(m)}-01`, to: today };
    case 'last-month': {
      const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
      return { from: `${prev.y}-${pad(prev.m)}-01`, to: `${prev.y}-${pad(prev.m)}-${pad(lastDayOf(prev.y, prev.m))}` };
    }
    case 'year':
      return { from: `${y}-01-01`, to: today };
    case 'all':
      return { from: null, to: null };
  }
};

/** The window the trend charts always cover: the last six calendar months, this one included. */
export const trendWindow = (today: string = todayKarachi()): Required<Period> => {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const start = m - 5 >= 1 ? { y, m: m - 5 } : { y: y - 1, m: m - 5 + 12 };
  return { from: `${start.y}-${pad(start.m)}-01`, to: today };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayText = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

/** A period in words, with the year: `1 Sep – 17 Sep 2026`, `All time`. */
export const periodText = (p: Period): string => {
  if (!p.from && !p.to) return 'All time';
  if (!p.from) return `Up to ${dayText(p.to!)} ${p.to!.slice(0, 4)}`;
  const to = p.to ?? todayKarachi();
  const sameYear = p.from.slice(0, 4) === to.slice(0, 4);
  return `${dayText(p.from)}${sameYear ? '' : ` ${p.from.slice(0, 4)}`} – ${dayText(to)} ${to.slice(0, 4)}`;
};

/** `As of 17 Sep 2026`: the day a balance is read at, for figures that are a position and not a period. */
export const asOfText = (day: string): string => `As of ${dayText(day)} ${day.slice(0, 4)}`;

// ---- Figures ----

/** `11.8%`; a dash when there was nothing to divide, never `0%` or `NaN%`. */
export const rateText = (r: RateFigure): string => (r.rate === null ? '—' : `${(r.rate * 100).toFixed(1)}%`);

/** What a rate is made of, in words: `117 of 994 parcels`. */
export const rateBasis = (r: RateFigure, what: string): string => (r.of === 0 ? `No ${what} with a final outcome yet` : `${r.count.toLocaleString('en-PK')} of ${r.of.toLocaleString('en-PK')} ${what}`);

/**
 * Rupees compacted for a tile or an axis (`Rs 1.2M`, `Rs 45.3K`, `Rs 980`), computed on the paisa as
 * a BigInt so no amount passes through a float on its way to the screen. Truncated, never rounded
 * up, so a compact figure never overstates.
 */
export const compactRupees = (paisa: string | null): string => {
  if (paisa === null || !/^-?\d+$/.test(paisa)) return '—';
  const negative = paisa.startsWith('-');
  const rupees = BigInt(negative ? paisa.slice(1) : paisa) / 100n;
  const scaled = (unit: bigint, suffix: string) => {
    const tenths = (rupees * 10n) / unit;
    return `${tenths / 10n}${tenths % 10n === 0n ? '' : `.${tenths % 10n}`}${suffix}`;
  };
  const body = rupees >= 1_000_000_000n ? scaled(1_000_000_000n, 'B') : rupees >= 1_000_000n ? scaled(1_000_000n, 'M') : rupees >= 10_000n ? scaled(1_000n, 'K') : rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}Rs ${body}`;
};

/** Paisa as rupees for placing a mark on a chart. Display only: tooltips and tables print the exact string. */
export const plotRupees = (paisa: string): number => (/^-?\d+$/.test(paisa) ? Number(paisa) / 100 : 0);

// ---- Chart data ----

export interface TrendPoint {
  month: string;
  label: string;
  revenue: number;
  profit: number;
  revenuePaisa: string;
  profitPaisa: string;
  parcels: number;
}

/** Monthly revenue and profit from the month breakdown, oldest first; rows that are not a month are ignored. */
export const monthTrend = (rows: readonly BreakdownRow[]): TrendPoint[] =>
  rows
    .filter((r) => /^\d{4}-\d{2}$/.test(r.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((r) => ({
      month: r.key,
      label: monthLabel(r.key).replace(/ 20(\d\d)$/, " '$1"),
      revenue: plotRupees(r.revenue),
      profit: plotRupees(r.profit),
      revenuePaisa: r.revenue,
      profitPaisa: r.profit,
      parcels: r.parcels,
    }));

export interface RatePoint {
  key: string;
  label: string;
  rate: number;
  returned: number;
  of: number;
}

/** Return rate by booking month, oldest first. */
export const rateTrend = (rows: readonly ReturnRateRow[]): RatePoint[] =>
  rows
    .filter((r) => /^\d{4}-\d{2}$/.test(r.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((r) => ({ key: r.key, label: monthLabel(r.key).replace(/ 20(\d\d)$/, " '$1"), rate: r.rate, returned: r.returned, of: r.of }));

/** Below this many finished parcels a city's rate says nothing: 1 of 1 returned is not "100%". */
export const MIN_CITY_OUTCOMES = 10;

/** The cities with the highest return rates among those with enough finished parcels. */
export const rankCities = (rows: readonly ReturnRateRow[], options: { top?: number; min?: number } = {}): { shown: ReturnRateRow[]; leftOut: number } => {
  const min = options.min ?? MIN_CITY_OUTCOMES;
  const eligible = rows.filter((r) => r.of >= min && r.key !== '-');
  const ranked = [...eligible].sort((a, b) => b.rate - a.rate || b.of - a.of || a.label.localeCompare(b.label));
  return { shown: ranked.slice(0, options.top ?? 8), leftOut: rows.length - eligible.length };
};

export const AGE_BUCKETS = [
  { key: '0-7', label: '0–7 days' },
  { key: '8-14', label: '8–14 days' },
  { key: '15-30', label: '15–30 days' },
  { key: '31+', label: 'Over 30 days' },
] as const;

// ---- Where each figure's report is ----

export interface Scope {
  range: DashRangeKey;
  store: StoreKey | null;
}

/** The query that carries a period and brand to another screen, in that screen's own parameter names. */
const carry = (p: Period, store: StoreKey | null, extra: Record<string, string> = {}, options: { openEnded?: 'all' } = {}): string => {
  const q = new URLSearchParams(extra);
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  // The Reports screen reads "no dates" as this year, so all time is a flag it understands.
  if (!p.from && !p.to && options.openEnded === 'all') q.set('all', '1');
  if (store) q.set('store', store);
  return q.toString();
};

/** The report behind each tile, opened on the tile's own period and brand. */
export const tileLinks = (scope: Scope, asOf: string, today: string = todayKarachi()) => {
  const period = rangeFor(scope.range, today);
  const report = (extra: Record<string, string> = {}) => `/reports?${carry(period, scope.store, extra, { openEnded: 'all' })}`;
  const parcels = (stage: string) => `/parcels?${carry(period, scope.store, { stage })}`;
  return {
    revenue: report({ tab: 'general-ledger', account: '4000' }),
    profit: report(),
    returnRate: parcels('returned'),
    deliverySuccess: parcels('delivered'),
    // The COD receivable's ledger from the start, so its closing balance is the figure on the tile.
    cash: `/reports?${carry({ from: '2000-01-01', to: asOf }, scope.store, { tab: 'general-ledger', account: '1100' })}`,
    profitPerParcel: report(),
  };
};

export const returnedParcelsLink = (period: Period, store: StoreKey | null, city: string): string => `/parcels?${carry(period, store, { stage: 'returned', city })}`;

// ---- Definitions ----

/**
 * What every figure on the dashboard means, in the words of the report behind it. One place: a
 * tile, a chart and a table all read from here, so a number never appears without its definition
 * and two screens never define it differently.
 */
export const DEFINITIONS = {
  revenue:
    "Sales revenue posted for parcels PostEx delivered in the period, plus partners' consignment sales, less any that came back after delivery. A parcel that is placed, confirmed, booked or still in transit adds nothing. PR packages never count.",
  netProfit: 'Income less expenses over the period, read from the books: delivered revenue, less the cost of the goods, PostEx charges, marketing, write-offs and other expenses.',
  returnRate: 'Parcels returned to us ÷ parcels that were delivered or returned, among parcels booked in the period. Parcels still out are not counted, and PR packages are excluded.',
  deliverySuccess: 'Parcels delivered ÷ parcels with a final outcome (delivered, returned or cancelled), among parcels booked in the period. Parcels still out are not counted; PR packages are excluded.',
  firstAttempt: 'Of the parcels delivered, the share that arrived without a failed delivery attempt on the way.',
  cash: "Cash on delivered parcels that PostEx holds and has not paid out yet, as of the date shown: the COD collected, less PostEx's charges, less the payouts already received.",
  ageing: 'How long that cash has been waiting, in days since each parcel was delivered, as of the date shown. Older cash is more likely to be overdue.',
  profitPerParcel: "Net profit of the parcels in the period ÷ their number, from each parcel's own ledger lines: its revenue, less its goods, PostEx charges, marketing and write-off. A returned parcel counts with the charges it still cost.",
  trend: 'Revenue and net profit for each calendar month (Karachi), from the books, for the last six months. Revenue is posted when a parcel is delivered, so a month can show a sale and, later, its reversal.',
  returnTrend: 'The return rate, as defined above, for parcels booked in each of the last six months. A recent month fills in as its parcels reach an outcome, so the latest bar can still move.',
  cityReturns: `The return rate by delivery city, as defined above, for the period. Cities with fewer than ${MIN_CITY_OUTCOMES} finished parcels are left out, because a rate on a handful of parcels says nothing.`,
  alerts: 'Things a person has to look at: items open on the reconciliation queue (grouped by what is wrong) and returned parcels nobody has checked in at the warehouse. Each is cleared by acting on it, not by time.',
  returnsAwaiting: 'Parcels PostEx has brought back to us that nobody has yet checked in as restocked or damaged. Until they are, their stock is not on the shelf.',
} as const;
