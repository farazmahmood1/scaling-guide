import type { Permission, Role } from '@/lib/api';

/**
 * Logic for the account and user-management screens: what a password must be (the server's rule, so
 * a form can say so before sending), a way to make a good one, and how permissions are grouped to be
 * read as a table.
 */

export const MIN_PASSWORD_LENGTH = 12;

/** Why a password is not acceptable, or null. Length is what counts (the server's own rule). */
export const passwordProblem = (password: string): string | null => {
  if ([...password].length < MIN_PASSWORD_LENGTH) return `At least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > 200) return 'At most 200 characters';
  if (/^(.)\1+$/.test(password)) return 'Not one character repeated';
  return null;
};

const WORDS = [
  'amber', 'basil', 'cedar', 'dune', 'ember', 'fjord', 'grove', 'harbor', 'iris', 'jade', 'kelp', 'lotus', 'maple', 'nectar', 'olive', 'pearl',
  'quartz', 'river', 'sage', 'tulip', 'umber', 'violet', 'willow', 'yarrow', 'zephyr', 'cobalt', 'dahlia', 'fennel', 'ginger', 'hazel', 'indigo', 'juniper',
];

/**
 * A password made of four words and two digits (`maple-river-hazel-sage-47`): long enough to be
 * strong, easy to read out and to type. Random from the browser's own source, for handing to a new
 * user, who is asked to change it.
 */
export const generatePassword = (random: (n: number) => number = (n) => crypto.getRandomValues(new Uint32Array(1))[0]! % n): string => {
  const words = Array.from({ length: 4 }, () => WORDS[random(WORDS.length)]!);
  return `${words.join('-')}-${String(random(90) + 10)}`;
};

// ---- Roles and permissions as a table ----

/** The permissions in the order, and under the headings, a person reads them. */
export const PERMISSION_GROUPS: ReadonlyArray<{ heading: string; permissions: ReadonlyArray<{ key: Permission; label: string }> }> = [
  {
    heading: 'Looking',
    permissions: [
      { key: 'dashboard.read', label: 'Overview dashboard' },
      { key: 'orders.read', label: 'Orders' },
      { key: 'parcels.read', label: 'Parcels' },
      { key: 'returns.read', label: 'Returns' },
      { key: 'reconciliation.read', label: 'Reconciliation queue' },
      { key: 'stock.read', label: 'Stock' },
      { key: 'purchasing.read', label: 'Purchasing' },
      { key: 'partners.read', label: 'Partners' },
      { key: 'pr.read', label: 'PR and influencers' },
      { key: 'accounting.read', label: 'Accounting' },
      { key: 'reports.read', label: 'Reports' },
      { key: 'integrations.read', label: 'Connection status' },
    ],
  },
  {
    heading: 'Doing',
    permissions: [
      { key: 'confirmations.work', label: 'Work the confirmation desk' },
      { key: 'orders.import', label: 'Import order history' },
      { key: 'returns.checkin', label: 'Check returns in' },
      { key: 'reconciliation.work', label: 'Resolve and link queue items' },
      { key: 'stock.adjust', label: 'Count and correct stock' },
      { key: 'purchasing.write', label: 'Buy: requests to bills' },
      { key: 'partners.write', label: 'Move partner stock, import sales' },
      { key: 'pr.write', label: 'Manage PR sends' },
      { key: 'accounting.close', label: 'Close months, opening balances' },
    ],
  },
  {
    heading: 'Running the system',
    permissions: [
      { key: 'settings.manage', label: 'Change settings' },
      { key: 'users.manage', label: 'Manage users' },
      { key: 'pii.phone', label: "See customers' phone numbers" },
    ],
  },
];

/** Every permission the table above names, so a test can check none is left out. */
export const GROUPED_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

export const holds = (matrix: ReadonlyArray<{ role: Role; permissions: readonly Permission[] }>, role: Role, permission: Permission): boolean =>
  matrix.find((r) => r.role === role)?.permissions.includes(permission) ?? false;
