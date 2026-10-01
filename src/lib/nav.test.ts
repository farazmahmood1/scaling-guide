import { describe, expect, it } from 'vitest';

import { MODULES, canUse, legacyHashPath, moduleByKey, moduleForPath, titleForPath, visibleModules } from '@/lib/nav';

describe('modules and roles', () => {
  it('has the thirteen modules, each at its own path', () => {
    expect(MODULES.map((m) => m.label)).toEqual([
      'Overview', 'Orders', 'Confirmations', 'Parcels', 'Returns', 'Reconciliation', 'Inventory', 'Purchase', 'Partners', 'PR', 'Accounting', 'Reports', 'Settings',
    ]);
    expect(new Set(MODULES.map((m) => m.path)).size).toBe(MODULES.length);
  });

  it('shows each role only its own surface', () => {
    expect(visibleModules('owner')).toHaveLength(13);
    expect(visibleModules('agent').map((m) => m.key)).toEqual(['overview', 'orders', 'confirmations']);
    expect(visibleModules('accountant').map((m) => m.key)).toEqual(['overview', 'reconciliation', 'purchase', 'partners', 'accounting', 'reports']);
    expect(visibleModules(undefined)).toEqual([]);
    expect(canUse(moduleByKey('settings'), 'operations')).toBe(false);
  });

  it('finds the module of a path, nested paths included', () => {
    expect(moduleForPath('/')?.key).toBe('overview');
    expect(moduleForPath('/purchase/orders/12')?.key).toBe('purchase');
    expect(moduleForPath('/prx')).toBeUndefined();
    expect(moduleForPath('/nope')).toBeUndefined();
    expect([titleForPath('/purchase'), titleForPath('/dev/table'), titleForPath('/nope')]).toEqual(['Purchase', 'Table demo', 'Not found']);
  });

  it('sends old hash links to their paths', () => {
    expect(legacyHashPath('#/returns')).toBe('/returns');
    expect(legacyHashPath('#/influencers')).toBe('/pr');
    expect(legacyHashPath('#/')).toBe('/');
    expect(legacyHashPath('#/unknown')).toBeNull();
    expect(legacyHashPath('')).toBeNull();
  });
});
