import { describe, expect, it } from 'vitest';

import { describeAccessChange, sameAccess } from '@/lib/access';
import type { MeResponse, Permission } from '@/lib/api';

const AGENT: Permission[] = ['orders.read', 'confirmations.work', 'pii.phone'];
const ACCOUNTANT: Permission[] = ['dashboard.read', 'reconciliation.read', 'purchasing.read', 'partners.read', 'accounting.read', 'accounting.close', 'reports.read'];

const me = (role: MeResponse['user']['role'], roleLabel: string, permissions: Permission[]): MeResponse => ({
  user: { email: 'a@test.example', name: 'A', role },
  roleLabel,
  permissions,
  totp: { enabled: false, required: false },
  enrolmentRequired: false,
});

describe('noticing that access changed', () => {
  it('says nothing the first time, and nothing when nothing changed', () => {
    expect(describeAccessChange(undefined, me('agent', 'Confirmation agent', AGENT))).toBeNull();
    expect(describeAccessChange(me('agent', 'Confirmation agent', AGENT), me('agent', 'Confirmation agent', AGENT))).toBeNull();
  });

  it('names the new role when it changes', () => {
    expect(describeAccessChange(me('agent', 'Confirmation agent', AGENT), me('accountant', 'Accountant', ACCOUNTANT))).toBe('Your access changed: you are now Accountant.');
  });

  it('says which modules appeared or went, when the role is the same but its permissions moved', () => {
    const before = me('operations', 'Operations', ['orders.read']);
    const after = me('operations', 'Operations', ['orders.read', 'accounting.read', 'reports.read']);
    expect(describeAccessChange(before, after)).toBe('Your access changed: you can now open Accounting, Reports.');
    expect(describeAccessChange(after, before)).toBe('Your access changed: no longer Accounting, Reports.');
  });

  it('still says so for a change that opens or closes no module', () => {
    const before = me('operations', 'Operations', ['orders.read', 'pii.phone']);
    const after = me('operations', 'Operations', ['orders.read']);
    expect(describeAccessChange(before, after)).toBe('Your access changed.');
  });
});

describe('telling whether a reading is new', () => {
  const base = me('agent', 'Confirmation agent', AGENT);
  it('is the same for an identical reading', () => {
    expect(sameAccess(base, me('agent', 'Confirmation agent', AGENT))).toBe(true);
    expect(sameAccess(undefined, base)).toBe(false);
  });

  it('is different when the role, the permissions, the name, or the authenticator state differ', () => {
    expect(sameAccess(base, me('accountant', 'Accountant', AGENT))).toBe(false);
    expect(sameAccess(base, me('agent', 'Confirmation agent', [...AGENT, 'stock.read']))).toBe(false);
    expect(sameAccess(base, { ...base, user: { ...base.user, name: 'B' } })).toBe(false);
    expect(sameAccess(base, { ...base, enrolmentRequired: true })).toBe(false);
    expect(sameAccess(base, { ...base, totp: { enabled: true, required: false } })).toBe(false);
  });
});
