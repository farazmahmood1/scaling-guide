import type { MeResponse, Permission } from '@/lib/api';
import { visibleModules } from '@/lib/nav';

/**
 * What changed about a person's access between two readings of the server's permission list, in
 * words, or null if nothing did. The dashboard re-reads it as it goes (on a timer, on coming back to
 * the tab, and straight after any refusal), so a role changed by an owner shows up as a notice and a
 * different menu, with no reload.
 */
export const describeAccessChange = (before: Pick<MeResponse, 'user' | 'roleLabel' | 'permissions'> | undefined, after: Pick<MeResponse, 'user' | 'roleLabel' | 'permissions'>): string | null => {
  if (!before) return null;
  if (before.user.role !== after.user.role) return `Your access changed: you are now ${after.roleLabel}.`;
  const had = new Set<Permission>(before.permissions);
  const has = new Set<Permission>(after.permissions);
  const gained = after.permissions.filter((p) => !had.has(p));
  const lost = before.permissions.filter((p) => !has.has(p));
  if (gained.length === 0 && lost.length === 0) return null;
  const modules = (perms: readonly Permission[]) => visibleModules(perms).map((m) => m.label);
  const added = modules(after.permissions).filter((m) => !modules(before.permissions).includes(m));
  const removed = modules(before.permissions).filter((m) => !modules(after.permissions).includes(m));
  if (added.length > 0 || removed.length > 0) {
    return `Your access changed${added.length ? `: you can now open ${added.join(', ')}` : ''}${removed.length ? `${added.length ? ' and' : ':'} no longer ${removed.join(', ')}` : ''}.`;
  }
  return 'Your access changed.';
};

/** Whether the server's reading differs from the last one in anything the screens depend on. */
export const sameAccess = (a: Pick<MeResponse, 'user' | 'permissions' | 'totp' | 'enrolmentRequired'> | undefined, b: Pick<MeResponse, 'user' | 'permissions' | 'totp' | 'enrolmentRequired'>): boolean =>
  !!a &&
  a.user.role === b.user.role &&
  a.user.name === b.user.name &&
  a.enrolmentRequired === b.enrolmentRequired &&
  a.totp.enabled === b.totp.enabled &&
  a.permissions.length === b.permissions.length &&
  a.permissions.every((p, i) => p === b.permissions[i]);
