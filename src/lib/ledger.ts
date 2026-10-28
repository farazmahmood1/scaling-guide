import type { DrillSpec, JournalLine, PartnerLedgerRow, Period, PnlRow, TrialBalanceReportRow } from '@/lib/api';
import { apiGet } from '@/lib/api';
import { toCsv } from '@/lib/csv';
import { karachiLocal, paisaToInput } from '@/lib/format';

/**
 * Pure logic behind the books screens: which months are closed, whether a month may be closed,
 * the drill-through address that every figure uses, the P&L laid out by month, and CSV export.
 */

// ---- Months and closed periods ----

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthKey = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}`;
export const monthOf = (date: string): string => date.slice(0, 7);
export const monthLabel = (key: string): string => {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1] ?? key} ${y}`;
};
/** A `YYYY-MM-DD` day as people say it: `2026-11-05` → `5 Nov 2026`. */
export const dayLabel = (day: string): string => `${Number(day.slice(8, 10))} ${monthLabel(day.slice(0, 7))}`;

/** The months the books are closed for, as `YYYY-MM`. */
export const closedMonths = (periods: readonly Pick<Period, 'year' | 'month' | 'status'>[]): Set<string> =>
  new Set(periods.filter((p) => p.status === 'closed').map((p) => monthKey(p.year, p.month)));

export const isClosedDate = (date: string, closed: ReadonlySet<string>): boolean => closed.has(monthOf(date));

/** Every month from the one `from` is in to the one `to` is in, inclusive. */
export const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const [ey, em] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];
  while ((y < ey || (y === ey && m <= em)) && out.length < 600) {
    out.push(monthKey(y, m));
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
};

/** The closed months a date range touches; with no bounds, every closed month (the range is open-ended). */
export const closedInRange = (from: string | null, to: string | null, closed: ReadonlySet<string>): string[] => {
  const all = [...closed].sort();
  return all.filter((m) => (!from || m >= monthOf(from)) && (!to || m <= monthOf(to)));
};

/**
 * Why a month cannot be closed yet, in words, or null if it can. The same rules the server
 * enforces (so the button explains itself); the server still decides.
 */
export const closeBlocker = (period: Pick<Period, 'year' | 'month' | 'status' | 'closableFrom'>, periods: readonly Pick<Period, 'year' | 'month' | 'status' | 'entries'>[], today: string): string | null => {
  if (period.status === 'closed') return 'Already closed';
  if (today < period.closableFrom) return `Can be closed from ${dayLabel(period.closableFrom)}`;
  const key = monthKey(period.year, period.month);
  const earlier = periods
    .filter((p) => p.status === 'open' && p.entries > 0 && monthKey(p.year, p.month) < key)
    .map((p) => monthKey(p.year, p.month))
    .sort()[0];
  return earlier ? `Close ${monthLabel(earlier)} first: months close in order` : null;
};

/**
 * How a line or row in a closed month looks everywhere: a slate tint and a heavy slate edge, with
 * a lock and the word "Closed" beside it (see `ClosedMark`). Tint and edge are not the only signal.
 */
export const CLOSED_ROW_CLASS = 'border-l-4 border-l-slate-500 bg-slate-500/10';

// ---- Dates ----

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Ranges people ask for, as Karachi days. `today` is injected so the ranges can be tested. */
export const reportRanges = (today: string = karachiLocal(new Date()).slice(0, 10)): Array<{ label: string; from: string; to: string }> => {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const q = Math.floor((m - 1) / 3) * 3 + 1;
  return [
    { label: 'This month', from: `${y}-${pad(m)}-01`, to: today },
    { label: 'Last month', from: `${prev.y}-${pad(prev.m)}-01`, to: `${prev.y}-${pad(prev.m)}-${pad(lastDay(prev.y, prev.m))}` },
    { label: 'This quarter', from: `${y}-${pad(q)}-01`, to: today },
    { label: 'This year', from: `${y}-01-01`, to: today },
  ];
};

// ---- Drill-through ----

export interface Scope {
  from?: string | null;
  to?: string | null;
  store?: string | null;
}

/** The lines endpoint's query for a figure: what it is (the drill) within the report's period and brand. */
export const linesQuery = (drill: DrillSpec, scope: Scope = {}, paging?: { page: number; size: number }): string => {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(drill)) if (value) p.set(key, value);
  if (scope.from) p.set('from', scope.from);
  if (scope.to) p.set('to', scope.to);
  if (scope.store) p.set('store', scope.store);
  if (paging) {
    p.set('page', String(paging.page));
    p.set('size', String(paging.size));
  }
  return p.toString();
};

/** Same figure, same lines: a drill is identified by its content, so opening it twice is one panel. */
export const drillKey = (drill: DrillSpec, scope: Scope = {}): string => linesQuery(drill, scope);

const SOURCE_LABELS: Record<string, string> = {
  shipment_sale: 'Parcel delivered: sale',
  shipment_cogs: 'Parcel delivered: cost of goods',
  shipment_forward_charge: 'PostEx delivery charge',
  shipment_return_charge: 'PostEx return charge',
  shipment_write_off: 'Damaged return written off',
  payout_line: 'PostEx payout',
  vendor_bill: 'Vendor bill',
  vendor_payment: 'Vendor payment',
  goods_receipt: 'Goods received',
  consignment_sale: 'Partner sale (invoice)',
  consignment_cogs: 'Partner sale: cost of goods',
  partner_payment: 'Partner payment',
  opening_balance: 'Opening balances',
  expense: 'Expense',
  pr_send: 'PR package',
  reversal: 'Reversal',
};
export const sourceLabel = (type: string): string => SOURCE_LABELS[type] ?? type.replaceAll('_', ' ');

/** The family an entry belongs to, for its colour in the journal: what kind of money movement it is. */
export type SourceFamily = 'sale' | 'cost' | 'postex' | 'cash' | 'purchase' | 'expense' | 'opening' | 'reversal';
const SOURCE_FAMILY: Record<string, SourceFamily> = {
  shipment_sale: 'sale',
  consignment_sale: 'sale',
  shipment_cogs: 'cost',
  consignment_cogs: 'cost',
  shipment_write_off: 'cost',
  pr_send: 'cost',
  shipment_forward_charge: 'postex',
  shipment_return_charge: 'postex',
  payout_line: 'cash',
  partner_payment: 'cash',
  vendor_bill: 'purchase',
  vendor_payment: 'purchase',
  goods_receipt: 'purchase',
  expense: 'expense',
  opening_balance: 'opening',
  reversal: 'reversal',
};
export const sourceFamily = (type: string): SourceFamily => SOURCE_FAMILY[type] ?? 'reversal';

/** Each account in everyday words, for the plain reading of an entry. Unknown codes keep their book name. */
const PLAIN_ACCOUNT: Record<string, string> = {
  '1000': 'Money in bank',
  '1010': 'Cash in hand',
  '1100': 'PostEx owes us',
  '1150': 'Customers owe us',
  '1200': 'Partner shops owe us',
  '1300': 'Stock value',
  '1400': 'Tax we can claim back',
  '2000': 'We owe suppliers',
  '2050': 'We owe for goods not billed yet',
  '2100': 'Sales tax we owe',
  '3000': "Owner's money",
  '3100': 'Opening balances',
  '4000': 'Sales',
  '5000': 'Cost of goods sold',
  '5010': 'Price difference on purchases',
  '6000': 'PostEx delivery charges',
  '6010': 'PostEx return charges',
  '6020': 'Tax on PostEx charges',
  '6100': 'PR and marketing',
  '6200': 'Damaged stock written off',
};
export const plainAccount = (code: string, name: string): string => PLAIN_ACCOUNT[code] ?? name;

/**
 * What one line did, in everyday terms: an account going up or down by an amount. Assets and
 * expenses go up with a debit; what we owe, the owner's money and income go up with a credit.
 * The first digit of the code is the account's type (1 asset, 2 owed, 3 owner, 4 income, 5-6 cost).
 */
export const lineEffect = (code: string, debit: string, credit: string): { up: boolean; amount: string } => {
  const debitUp = code.startsWith('1') || code.startsWith('5') || code.startsWith('6');
  const net = BigInt(debit) - BigInt(credit);
  const up = debitUp ? net >= 0n : net <= 0n;
  return { up, amount: (net < 0n ? -net : net).toString() };
};

/** Every line of a drill, a page at a time, for the CSV export. Capped, and says when it was. */
export const EXPORT_LINE_CAP = 50_000;
export async function fetchAllLines(drill: DrillSpec, scope: Scope): Promise<{ lines: JournalLine[]; truncated: boolean; hasBalance: boolean }> {
  const lines: JournalLine[] = [];
  let hasBalance = false;
  for (let page = 1; ; page++) {
    const result = await apiGet<{ total: number; lines: JournalLine[] }>(`/api/v1/reports/lines?${linesQuery(drill, scope, { page, size: 200 })}`);
    lines.push(...result.lines);
    hasBalance ||= result.lines.some((l) => l.balance !== null);
    if (result.lines.length === 0 || lines.length >= result.total) return { lines, truncated: false, hasBalance };
    if (lines.length >= EXPORT_LINE_CAP) return { lines, truncated: true, hasBalance };
  }
}

// ---- CSV ----

/** Plain rupees with two decimals, exact from paisa: what a spreadsheet can sum. */
export const rupees = (paisa: string): string => (/^-?\d+$/.test(paisa) ? paisaToInput(paisa) : '');

export const linesCsv = (lines: readonly JournalLine[], withBalance: boolean): string =>
  toCsv(
    ['Date', 'Entry', 'Account', 'Account name', 'Memo', 'Source', 'Debit', 'Credit', ...(withBalance ? ['Balance'] : []), 'Reversal', 'Reversed'],
    lines.map((l) => [
      l.date,
      l.entryId,
      l.accountCode,
      l.accountName,
      l.memo,
      sourceLabel(l.originType),
      l.debit === '0' ? '' : rupees(l.debit),
      l.credit === '0' ? '' : rupees(l.credit),
      ...(withBalance ? [l.balance === null ? '' : rupees(l.balance)] : []),
      l.isReversal ? 'yes' : '',
      l.reversed ? 'yes' : '',
    ]),
  );

/** The summary reports as CSV, in exact rupees. */
export const trialBalanceCsv = (rows: readonly TrialBalanceReportRow[]): string =>
  toCsv(['Account', 'Name', 'Type', 'Opening', 'Debit', 'Credit', 'Closing'], rows.map((r) => [r.code, r.name, r.type, rupees(r.opening), rupees(r.debit), rupees(r.credit), rupees(r.closing)]));

export const partnerLedgerCsv = (rows: readonly PartnerLedgerRow[]): string =>
  toCsv(['Partner', 'Kind', 'Opening', 'Debit', 'Credit', 'Closing'], rows.map((r) => [r.name, r.partnerType.replace('_', ' '), rupees(r.opening), rupees(r.debit), rupees(r.credit), rupees(r.closing)]));

export const pnlCsv = (grid: PnlGrid, net: Record<string, string>): string =>
  toCsv(
    ['Account', 'Name', 'Type', ...grid.months, 'Total'],
    [
      ...grid.accounts.map((a) => [a.code, a.name, a.type, ...grid.months.map((m) => rupees(a.byMonth[m] ?? '0')), rupees(a.total)]),
      ['', 'Net profit', '', ...grid.months.map((m) => rupees(net[m] ?? '0')), rupees(Object.values(net).reduce((n, v) => n + BigInt(v), 0n).toString())],
    ],
  );

// ---- P&L by month ----

export interface PnlGrid {
  months: string[];
  accounts: Array<{ code: string; name: string; type: 'income' | 'expense'; byMonth: Record<string, string>; total: string }>;
}

/** One row per account and one column per month, with each row's total, summed exactly in BigInt. */
export const pivotPnl = (rows: readonly PnlRow[]): PnlGrid => {
  const months = [...new Set(rows.map((r) => r.month).filter((m): m is string => m !== null))].sort();
  const byAccount = new Map<string, PnlGrid['accounts'][number] & { sum: bigint }>();
  for (const r of rows) {
    if (r.month === null || !/^-?\d+$/.test(r.amount)) continue;
    let a = byAccount.get(r.code);
    if (!a) {
      a = { code: r.code, name: r.name, type: r.type, byMonth: {}, total: '0', sum: 0n };
      byAccount.set(r.code, a);
    }
    a.byMonth[r.month] = r.amount;
    a.sum += BigInt(r.amount);
  }
  const accounts = [...byAccount.values()]
    .sort((a, b) => (a.type === b.type ? a.code.localeCompare(b.code) : a.type === 'income' ? -1 : 1))
    .map(({ sum, ...a }) => ({ ...a, total: sum.toString() }));
  return { months, accounts };
};

/** Net profit per month: income less expenses, in BigInt. */
export const netByMonth = (grid: PnlGrid): Record<string, string> =>
  Object.fromEntries(
    grid.months.map((m) => [
      m,
      grid.accounts.reduce((n, a) => n + (BigInt(a.byMonth[m] ?? '0') * (a.type === 'income' ? 1n : -1n)), 0n).toString(),
    ]),
  );
