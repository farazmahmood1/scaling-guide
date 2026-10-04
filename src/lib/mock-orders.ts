import type { ListQuery } from '@/lib/list-query';

/**
 * 10,000 made-up orders and a "server" that filters, sorts and pages them, for the table demo.
 * Deterministic (a seeded generator), so the same URL always shows the same rows. No real data.
 */
export interface MockOrder {
  id: string;
  orderNumber: string;
  store: 'nur' | 'organics';
  status: 'placed' | 'confirmed' | 'booked' | 'delivered' | 'returned' | 'cancelled';
  city: string;
  customer: string;
  placedAt: string;
  /** Paisa, as a decimal string, as the API sends money. */
  totalPaisa: string;
  items: number;
}

export const STATUSES = ['placed', 'confirmed', 'booked', 'delivered', 'returned', 'cancelled'] as const;
export const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Sialkot'] as const;

export const mockOrders = (count = 10_000): MockOrder[] => {
  let seed = 42;
  const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
  const start = Date.parse('2026-01-01T05:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const placed = new Date(start + Math.floor(random() * 273 * 86_400_000));
    return {
      id: String(i + 1),
      orderNumber: `#${60_000 + i}`,
      store: random() < 0.6 ? 'nur' : 'organics',
      status: STATUSES[Math.floor(random() * STATUSES.length)]!,
      city: CITIES[Math.floor(random() * CITIES.length)]!,
      customer: `Test Customer ${1 + Math.floor(random() * 3000)}`,
      placedAt: placed.toISOString(),
      totalPaisa: String((900 + Math.floor(random() * 90) * 50) * 100),
      items: 1 + Math.floor(random() * 4),
    };
  });
};

const KARACHI_MS = 5 * 3_600_000;
/** The Karachi day of an instant, for the demo's date filter (Pakistan has no DST today). */
const karachiDay = (iso: string) => new Date(Date.parse(iso) + KARACHI_MS).toISOString().slice(0, 10);

const compare: Record<string, (a: MockOrder, b: MockOrder) => number> = {
  orderNumber: (a, b) => a.orderNumber.localeCompare(b.orderNumber),
  placedAt: (a, b) => a.placedAt.localeCompare(b.placedAt),
  total: (a, b) => Number(BigInt(a.totalPaisa) - BigInt(b.totalPaisa)),
  city: (a, b) => a.city.localeCompare(b.city),
  items: (a, b) => a.items - b.items,
};

/** Every row the query matches, sorted; the server's work before paging. */
export const matching = (rows: readonly MockOrder[], q: ListQuery): MockOrder[] => {
  const search = q.search.trim().toLowerCase();
  const status = q.multi['status'];
  const store = q.multi['brand'];
  const city = q.multi['city'];
  const out = rows.filter(
    (r) =>
      (!search || r.orderNumber.toLowerCase().includes(search) || r.customer.toLowerCase().includes(search) || r.city.toLowerCase().includes(search)) &&
      (!status || status.includes(r.status)) &&
      (!store || store.includes(r.store)) &&
      (!city || city.includes(r.city)) &&
      (!q.from || karachiDay(r.placedAt) >= q.from) &&
      (!q.to || karachiDay(r.placedAt) <= q.to),
  );
  const sort = q.sort ? compare[q.sort.key] : undefined;
  if (sort) {
    const dir = q.sort!.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => dir * sort(a, b) || a.id.localeCompare(b.id));
  }
  return out;
};

export const page = (rows: readonly MockOrder[], q: ListQuery): { rows: MockOrder[]; total: number } => {
  const all = matching(rows, q);
  return { rows: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: all.length };
};
