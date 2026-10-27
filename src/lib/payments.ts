import type { PaidOrderRow, PaymentWindow } from '@/lib/api';
import { paisaShare, shareText } from '@/lib/dashboard';
import { formatPaisa } from '@/lib/format';
import { codCsv } from '@/lib/parcels';

/**
 * The Payments screen's logic, apart from how it draws: the periods it offers, and how a payment's
 * figures are written. Money stays integer paisa in strings; every printed amount is formatted
 * from the string.
 */

export const PAYMENT_WINDOWS: ReadonlyArray<{ key: PaymentWindow; label: string; hours: number }> = [
  { key: '24h', label: 'Last 24 hours', hours: 24 },
  { key: '7d', label: 'Last 7 days', hours: 7 * 24 },
  { key: '14d', label: 'Last 14 days', hours: 14 * 24 },
  { key: '30d', label: 'Last 30 days', hours: 30 * 24 },
];
export const DEFAULT_WINDOW: PaymentWindow = '24h';
export const isPaymentWindow = (v: string | null): v is PaymentWindow => PAYMENT_WINDOWS.some((w) => w.key === v);

/** The shortest period, ending at `until`, that reaches back to `at`; null when even the longest does not. */
export const windowReaching = (at: string, until: string): (typeof PAYMENT_WINDOWS)[number] | null =>
  PAYMENT_WINDOWS.find((w) => Date.parse(until) - Date.parse(at) <= w.hours * 3_600_000) ?? null;

/** What PostEx kept, as it charges it: `Rs 200.00 + Rs 32.00`, the delivery fee plus its tax. With no tax, the fee alone. */
export const chargesText = (fee: string, tax: string): string => (BigInt(tax) === 0n ? formatPaisa(fee) : `${formatPaisa(fee)} + ${formatPaisa(tax)}`);

/** The delivery fee and its tax added up, in paisa. */
export const chargesTotal = (fee: string, tax: string): string => (BigInt(fee) + BigInt(tax)).toString();

/** Profit as a share of the sale (net of sales tax); a dash when nothing was sold. */
export const marginText = (profit: string, revenue: string): string => shareText(paisaShare(profit, revenue));

/** Sold, with no cost price on file: the profit then counts the goods as free, so it reads high. */
export const missingCost = (r: Pick<PaidOrderRow, 'goods' | 'revenue'>): boolean => BigInt(r.goods) === 0n && BigInt(r.revenue) > 0n;

/** A row as people name it: its Shopify order, else its parcel's tracking number. */
export const paymentLabel = (r: Pick<PaidOrderRow, 'orderNumber' | 'trackingNumbers'>): string => r.orderNumber ?? r.trackingNumbers.join(', ');

export const PAYMENT_CSV_HEADER = ['Order', 'Brand', 'Tracking numbers', 'Paid at', 'CPR', 'Payment', 'COD', 'Delivery fee', 'Delivery tax', 'Product cost', 'Profit', 'Margin'] as const;

export const paymentCsvRow = (r: PaidOrderRow): string[] => [
  paymentLabel(r),
  r.store ?? '',
  r.trackingNumbers.join(' '),
  r.paidAt,
  r.cprNumbers.join(' '),
  codCsv(r.payment),
  codCsv(r.cod),
  codCsv(r.deliveryFee),
  codCsv(r.deliveryTax),
  codCsv(r.goods),
  codCsv(r.profit),
  marginText(r.profit, r.revenue),
];
