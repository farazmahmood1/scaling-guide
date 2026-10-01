import type { OrderStatus, PurchaseOrderLine } from '@/lib/api';
import { karachiLocal } from '@/lib/format';

/** Today's date in Karachi as `YYYY-MM-DD`: the day a document is dated unless a person says otherwise. */
export const today = (): string => karachiLocal(new Date()).slice(0, 10);

/** The five steps of buying, in order; the screen is organised around them. */
export const STEPS = [
  { key: 'requests', label: 'Request', hint: 'Someone says what is needed' },
  { key: 'quotes', label: 'Quote', hint: 'Vendors say what it costs' },
  { key: 'orders', label: 'Order', hint: 'We commit to one vendor' },
  { key: 'receive', label: 'Receive', hint: 'The goods arrive' },
  { key: 'bills', label: 'Bill', hint: 'The vendor bills, we pay' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

export const ORDER_STATUS_TEXT: Record<OrderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ordered: { label: 'Ordered', variant: 'outline' },
  partially_received: { label: 'Partly received', variant: 'outline' },
  received: { label: 'Received, not billed', variant: 'secondary' },
  billed: { label: 'Billed, unpaid', variant: 'secondary' },
  paid: { label: 'Paid', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

export const toReceive = (line: Pick<PurchaseOrderLine, 'qty' | 'received'>): number => Math.max(0, line.qty - line.received);
export const toBill = (line: Pick<PurchaseOrderLine, 'received' | 'billed'>): number => Math.max(0, line.received - line.billed);

/** Whole units typed in a box: a non-negative integer, else null. Blank is zero. */
export const wholeUnits = (text: string): number | null => {
  const t = text.trim();
  if (t === '') return 0;
  return /^\d{1,7}$/.test(t) ? Number(t) : null;
};

/** The paisa digits the API wants for an amount of rupees typed by a person; null if it is not one. */
export const paisaDigits = (paisa: string | null): string | null => (paisa !== null && /^\d{1,15}$/.test(paisa) ? paisa : null);

/**
 * A bill is usually the order's prices for what has arrived and is not billed yet; that is what
 * the form starts with, and the three-way match checks anything a person changes.
 */
export const billDefaults = (lines: readonly PurchaseOrderLine[]): Array<{ poLineId: string; qty: number; unitPaisa: string }> =>
  lines.filter((l) => toBill(l) > 0).map((l) => ({ poLineId: l.id, qty: toBill(l), unitPaisa: l.unitCost }));
