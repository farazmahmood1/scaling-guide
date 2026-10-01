import type { Permission } from '@/lib/api';

/**
 * The app's modules: one route each, in navigation order, with the permission each needs. The
 * permissions are the server's own (it sends the signed-in person's list), so what the menu shows
 * and what the server allows are one table, not two that could drift. The backend enforces access on
 * every request; this only decides what the navigation shows, so a module a person cannot use is
 * hidden, never shown disabled.
 */
export type ModuleKey =
  | 'overview'
  | 'orders'
  | 'parcels'
  | 'returns'
  | 'reconciliation'
  | 'confirmations'
  | 'inventory'
  | 'purchase'
  | 'partners'
  | 'pr'
  | 'accounting'
  | 'reports'
  | 'settings';

export interface Module {
  key: ModuleKey;
  path: string;
  label: string;
  /** One line under the title, for the placeholder and the page header. */
  summary: string;
  group: 'Daily work' | 'Stock and buying' | 'Money';
  /** The permission that opens this module. */
  requires: Permission;
}

export const MODULES: readonly Module[] = [
  { key: 'overview', path: '/', label: 'Overview', summary: 'Headline figures across both brands.', group: 'Daily work', requires: 'dashboard.read' },
  { key: 'orders', path: '/orders', label: 'Orders', summary: 'Every Shopify order and the state it is in.', group: 'Daily work', requires: 'orders.read' },
  { key: 'confirmations', path: '/confirmations', label: 'Confirmations', summary: 'Confirm cash-on-delivery orders before they are booked.', group: 'Daily work', requires: 'confirmations.work' },
  { key: 'parcels', path: '/parcels', label: 'Parcels', summary: 'PostEx parcels, their history and their charges.', group: 'Daily work', requires: 'parcels.read' },
  { key: 'returns', path: '/returns', label: 'Returns', summary: 'Parcels PostEx sent back, waiting to be checked in.', group: 'Daily work', requires: 'returns.read' },
  { key: 'reconciliation', path: '/reconciliation', label: 'Reconciliation', summary: 'Parcels, orders and cash that do not agree.', group: 'Daily work', requires: 'reconciliation.read' },
  { key: 'inventory', path: '/inventory', label: 'Inventory', summary: 'Stock per product and location, counts and corrections.', group: 'Stock and buying', requires: 'stock.read' },
  { key: 'purchase', path: '/purchase', label: 'Purchase', summary: 'Requests, quotations, purchase orders, receipts and vendor bills.', group: 'Stock and buying', requires: 'purchasing.read' },
  { key: 'partners', path: '/partners', label: 'Partners', summary: 'Stock at retail partners and their sales sheets.', group: 'Stock and buying', requires: 'partners.read' },
  { key: 'pr', path: '/pr', label: 'PR', summary: 'Influencers, their codes, PR sends and posts.', group: 'Stock and buying', requires: 'pr.read' },
  { key: 'accounting', path: '/accounting', label: 'Accounting', summary: 'Invoices, bills, payments, month close and opening balances.', group: 'Money', requires: 'accounting.read' },
  { key: 'reports', path: '/reports', label: 'Reports', summary: 'Profit and loss, breakdowns and ledgers, each figure drilling down.', group: 'Money', requires: 'reports.read' },
  { key: 'settings', path: '/settings', label: 'Settings', summary: 'Connections, alerts, the confirmation desk, purchasing, month close and users.', group: 'Money', requires: 'settings.manage' },
];

/** Whether a set of permissions (the server's list for this person) opens a module. */
export const canUse = (module: Module, permissions: readonly string[] | undefined): boolean => permissions !== undefined && permissions.includes(module.requires);

/** The modules a person may use, in navigation order. Recomputed whenever their permissions change. */
export const visibleModules = (permissions: readonly string[] | undefined): Module[] => MODULES.filter((m) => canUse(m, permissions));

/** Where someone lands when the home page is not theirs: the first module they may use. */
export const homePath = (permissions: readonly string[] | undefined): string => visibleModules(permissions)[0]?.path ?? '/account';

export const moduleByKey = (key: ModuleKey): Module => MODULES.find((m) => m.key === key)!;

/** The module a path belongs to (`/purchase/orders/12` is Purchase); undefined for an unknown path. */
export const moduleForPath = (pathname: string): Module | undefined => {
  if (pathname === '/' || pathname === '') return moduleByKey('overview');
  return MODULES.find((m) => m.path !== '/' && (pathname === m.path || pathname.startsWith(`${m.path}/`)));
};

/** Routes outside the navigation: their tab titles. */
export const EXTRA_TITLES: Record<string, string> = { '/dev/table': 'Table demo', '/account': 'My account' };

/** The tab title for a path: its module, a known extra route, or "Not found". */
export const titleForPath = (pathname: string): string =>
  moduleForPath(pathname)?.label ?? EXTRA_TITLES[pathname.replace(/\/$/, '')] ?? 'Not found';

/** `#/returns` from before the router: the path it now lives at, so old bookmarks still work. */
export const legacyHashPath = (hash: string): string | null => {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  if (!hash.startsWith('#')) return null;
  if (name === '' || name === 'overview') return '/';
  if (name === 'influencers') return '/pr';
  return MODULES.some((m) => m.key === name) ? `/${name}` : null;
};
