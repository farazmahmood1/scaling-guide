import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/api';
import { MODULES, canUse, homePath, legacyHashPath, moduleByKey, moduleForPath, titleForPath, visibleModules } from '@/lib/nav';

/** What the server sends for each role (the backend's permission table), for checking the menus follow it. */
const ROLE_PERMISSIONS = {
  owner: PERMISSIONS,
  agent: ['orders.read', 'confirmations.work', 'pii.phone'],
  operations: ['dashboard.read', 'orders.read', 'confirmations.work', 'parcels.read', 'returns.read', 'returns.checkin', 'reconciliation.read', 'reconciliation.work', 'stock.read', 'stock.adjust', 'purchasing.read', 'purchasing.write', 'partners.read', 'partners.write', 'pr.read', 'pr.write', 'integrations.read', 'pii.phone'],
  accountant: ['dashboard.read', 'reconciliation.read', 'purchasing.read', 'partners.read', 'accounting.read', 'accounting.close', 'reports.read'],
} as const;

describe('modules and permissions', () => {
  it('has the thirteen modules, each at its own path', () => {
    expect(MODULES.map((m) => m.label)).toEqual([
      'Overview', 'Orders', 'Confirmations', 'Parcels', 'Returns', 'Reconciliation', 'Inventory', 'Purchase', 'Partners', 'PR', 'Accounting', 'Reports', 'Settings',
    ]);
    expect(new Set(MODULES.map((m) => m.path)).size).toBe(MODULES.length);
  });

  it('asks each module for a permission the server knows, and each permission opens at most one module', () => {
    for (const m of MODULES) expect(PERMISSIONS as readonly string[]).toContain(m.requires);
    expect(new Set(MODULES.map((m) => m.requires)).size).toBe(MODULES.length);
  });

  it('shows each role only the modules its permissions open', () => {
    expect(visibleModules(ROLE_PERMISSIONS.owner)).toHaveLength(13);
    expect(visibleModules(ROLE_PERMISSIONS.agent).map((m) => m.key)).toEqual(['orders', 'confirmations']);
    expect(visibleModules(ROLE_PERMISSIONS.accountant).map((m) => m.key)).toEqual(['overview', 'reconciliation', 'purchase', 'partners', 'accounting', 'reports']);
    expect(visibleModules(undefined)).toEqual([]);
    expect(canUse(moduleByKey('settings'), ROLE_PERMISSIONS.operations)).toBe(false);
  });

  it('changes what is shown the moment the permissions change, with nothing else to reload', () => {
    // Someone moved from agent to accountant: the same function, new list, new menu.
    expect(visibleModules(ROLE_PERMISSIONS.agent).map((m) => m.key)).not.toContain('reports');
    expect(visibleModules(ROLE_PERMISSIONS.accountant).map((m) => m.key)).toContain('reports');
    expect(visibleModules(ROLE_PERMISSIONS.accountant).map((m) => m.key)).not.toContain('confirmations');
  });

  it('sends someone whose home page is not theirs to the first module that is, or to their account', () => {
    expect(homePath(ROLE_PERMISSIONS.owner)).toBe('/');
    expect(homePath(ROLE_PERMISSIONS.agent)).toBe('/orders');
    expect(homePath([])).toBe('/account');
  });

  it('finds the module of a path, nested paths included', () => {
    expect(moduleForPath('/')?.key).toBe('overview');
    expect(moduleForPath('/purchase/orders/12')?.key).toBe('purchase');
    expect(moduleForPath('/prx')).toBeUndefined();
    expect(moduleForPath('/nope')).toBeUndefined();
    expect([titleForPath('/purchase'), titleForPath('/dev/table'), titleForPath('/account'), titleForPath('/nope')]).toEqual(['Purchase', 'Table demo', 'My account', 'Not found']);
  });

  it('sends old hash links to their paths', () => {
    expect(legacyHashPath('#/returns')).toBe('/returns');
    expect(legacyHashPath('#/influencers')).toBe('/pr');
    expect(legacyHashPath('#/')).toBe('/');
    expect(legacyHashPath('#/unknown')).toBeNull();
    expect(legacyHashPath('')).toBeNull();
  });
});
