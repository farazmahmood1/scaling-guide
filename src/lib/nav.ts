import type { Role } from '@/lib/api';

/**
 * The app's modules: one route each, in navigation order, with the roles that may use it
 * (BUILD-PLAN Step 15: each role sees only its own surface). The backend enforces access on
 * every request; this only decides what the navigation shows, so a module a role cannot use is
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
  roles: readonly Role[];
}

const ALL: readonly Role[] = ['owner', 'manager', 'operations', 'agent', 'accountant'];

export const MODULES: readonly Module[] = [
  { key: 'overview', path: '/', label: 'Overview', summary: 'Headline figures across both brands.', group: 'Daily work', roles: ALL },
  { key: 'orders', path: '/orders', label: 'Orders', summary: 'Every Shopify order and the state it is in.', group: 'Daily work', roles: ['owner', 'manager', 'operations', 'agent'] },
  { key: 'confirmations', path: '/confirmations', label: 'Confirmations', summary: 'Confirm cash-on-delivery orders before they are booked.', group: 'Daily work', roles: ['owner', 'manager', 'operations', 'agent'] },
  { key: 'parcels', path: '/parcels', label: 'Parcels', summary: 'PostEx parcels, their history and their charges.', group: 'Daily work', roles: ['owner', 'manager', 'operations'] },
  { key: 'returns', path: '/returns', label: 'Returns', summary: 'Parcels PostEx sent back, waiting to be checked in.', group: 'Daily work', roles: ['owner', 'manager', 'operations'] },
  { key: 'reconciliation', path: '/reconciliation', label: 'Reconciliation', summary: 'Parcels, orders and cash that do not agree.', group: 'Daily work', roles: ['owner', 'manager', 'operations', 'accountant'] },
  { key: 'inventory', path: '/inventory', label: 'Inventory', summary: 'Stock per product and location, counts and corrections.', group: 'Stock and buying', roles: ['owner', 'manager', 'operations'] },
  { key: 'purchase', path: '/purchase', label: 'Purchase', summary: 'Requests, quotations, purchase orders, receipts and vendor bills.', group: 'Stock and buying', roles: ['owner', 'manager', 'operations', 'accountant'] },
  { key: 'partners', path: '/partners', label: 'Partners', summary: 'Stock at retail partners and their sales sheets.', group: 'Stock and buying', roles: ['owner', 'manager', 'operations', 'accountant'] },
  { key: 'pr', path: '/pr', label: 'PR', summary: 'Influencers, their codes, PR sends and posts.', group: 'Stock and buying', roles: ['owner', 'manager', 'operations'] },
  { key: 'accounting', path: '/accounting', label: 'Accounting', summary: 'Trial balance, month close and opening balances.', group: 'Money', roles: ['owner', 'manager', 'accountant'] },
  { key: 'reports', path: '/reports', label: 'Reports', summary: 'Profit and loss, breakdowns and ledgers, each figure drilling down.', group: 'Money', roles: ['owner', 'manager', 'accountant'] },
  { key: 'settings', path: '/settings', label: 'Settings', summary: 'Matching, confirmation tags, desk and purchasing settings.', group: 'Money', roles: ['owner', 'manager'] },
];

export const canUse = (module: Module, role: Role | undefined): boolean => role !== undefined && module.roles.includes(role);

/** The modules a role may use, in navigation order. */
export const visibleModules = (role: Role | undefined): Module[] => MODULES.filter((m) => canUse(m, role));

export const moduleByKey = (key: ModuleKey): Module => MODULES.find((m) => m.key === key)!;

/** The module a path belongs to (`/purchase/orders/12` is Purchase); undefined for an unknown path. */
export const moduleForPath = (pathname: string): Module | undefined => {
  if (pathname === '/' || pathname === '') return moduleByKey('overview');
  return MODULES.find((m) => m.path !== '/' && (pathname === m.path || pathname.startsWith(`${m.path}/`)));
};

/** `#/returns` from before the router: the path it now lives at, so old bookmarks still work. */
export const legacyHashPath = (hash: string): string | null => {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  if (!hash.startsWith('#')) return null;
  if (name === '' || name === 'overview') return '/';
  if (name === 'influencers') return '/pr';
  return MODULES.some((m) => m.key === name) ? `/${name}` : null;
};
