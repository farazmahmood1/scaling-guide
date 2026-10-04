import { Fragment, useState } from 'react';
import { Check, Copy, Lock, Minus, RefreshCw, ShieldOff, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/auth/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/skeletons';
import { useApi } from '@/hooks/use-api';
import { type Role, type RoleMatrix, type UserAccount, apiPatch, apiPost } from '@/lib/api';
import { PERMISSION_GROUPS, generatePassword, holds, passwordProblem } from '@/lib/accounts';
import { formatKarachiTime } from '@/lib/format';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50';

function RoleSelect({ value, roles, onChange, disabled, label }: { value: Role; roles: RoleMatrix['roles']; onChange: (role: Role) => void; disabled?: boolean; label: string }) {
  return (
    <select className={selectClass} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value as Role)}>
      {roles.map((r) => (
        <option key={r.role} value={r.role}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

/** Making an account: who, which role, and a first password to hand over (generated, or one you choose). */
function CreateUser({ roles, onDone }: { roles: RoleMatrix['roles']; onDone: () => void }) {
  const [form, setForm] = useState({ email: '', name: '', role: 'operations' as Role, password: '' });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string }>();
  const problem = form.password ? passwordProblem(form.password) : null;
  const valid = /^\S+@\S+\.\S+$/.test(form.email.trim()) && form.name.trim() && form.password && !problem;

  const save = async () => {
    setSaving(true);
    try {
      await apiPost('/api/v1/users', { email: form.email.trim(), name: form.name.trim(), role: form.role, password: form.password });
      setCreated({ email: form.email.trim(), password: form.password });
      setForm({ email: '', name: '', role: form.role, password: '' });
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not create the account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Add a user</h3>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !saving) void save();
        }}
      >
        <Input aria-label="Email" type="email" placeholder="Email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input aria-label="Name" placeholder="Name" autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <RoleSelect value={form.role} roles={roles} label="Role" onChange={(role) => setForm({ ...form, role })} />
        <div className="flex gap-2">
          <Input aria-label="First password" aria-invalid={!!problem} className="font-mono" placeholder="First password" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Button type="button" variant="outline" onClick={() => setForm({ ...form, password: generatePassword() })}>
            <RefreshCw className="size-4" />
            Generate
          </Button>
        </div>
        {problem && (
          <p role="alert" className="text-xs text-brand-coral sm:col-span-2">
            {problem}
          </p>
        )}
        <Button type="submit" disabled={!valid || saving} className="sm:col-span-2">
          <UserPlus className="size-4" />
          {saving ? 'Adding…' : 'Add user'}
        </Button>
      </form>
      {created && (
        <div role="status" className="space-y-1 rounded-lg border-2 border-primary/40 bg-primary/5 p-3 text-sm">
          <p className="font-medium">Account made for {created.email}.</p>
          <p className="text-muted-foreground">Give them this password now; it is not shown again. They should change it under My account.</p>
          <p className="flex items-center gap-2">
            <span className="font-mono select-all">{created.password}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(created.password);
                toast.success('Password copied');
              }}
            >
              <Copy className="size-4" />
              Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCreated(undefined)}>
              Done
            </Button>
          </p>
        </div>
      )}
    </div>
  );
}

function UserRow({ u, roles, isSelf, onChanged }: { u: UserAccount; roles: RoleMatrix['roles']; isSelf: boolean; onChanged: () => void }) {
  const [panel, setPanel] = useState<'password' | 'totp' | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = password ? passwordProblem(password) : null;

  const run = async (what: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await what();
      toast.success(ok);
      setPanel(null);
      setPassword('');
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Fragment>
      <tr className="border-t align-top" data-active={u.isActive}>
        <th scope="row" className="px-3 py-2 text-left font-normal">
          <span className={u.isActive ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>{u.name}</span>
          {isSelf && <Badge variant="secondary" className="ml-2">You</Badge>}
          <div className="text-xs text-muted-foreground">{u.email}</div>
          <div className="text-xs text-muted-foreground">{u.lastLoginAt ? `Last signed in ${formatKarachiTime(u.lastLoginAt)}` : 'Never signed in'}</div>
        </th>
        <td className="px-3 py-2">
          <RoleSelect value={u.role} roles={roles} label={`Role of ${u.name}`} disabled={isSelf || busy} onChange={(role) => void run(() => apiPatch(`/api/v1/users/${u.id}`, { role }), `${u.name} is now ${roles.find((r) => r.role === role)?.label ?? role}`)} />
          {isSelf && <p className="mt-1 text-xs text-muted-foreground">Another owner changes yours.</p>}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {!u.isActive && <Badge variant="destructive">Switched off</Badge>}
            {u.locked && (
              <Badge variant="outline" className="gap-1">
                <Lock className="size-3" />
                Locked
              </Badge>
            )}
            {!u.hasPassword && <Badge variant="outline">No password yet</Badge>}
            <Badge variant={u.totpEnabled ? 'secondary' : 'outline'}>{u.totpEnabled ? 'Authenticator on' : 'No authenticator'}</Badge>
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap justify-end gap-1">
            <Button size="sm" variant="ghost" disabled={isSelf || busy} onClick={() => void run(() => apiPatch(`/api/v1/users/${u.id}`, { isActive: !u.isActive }), u.isActive ? `${u.name} switched off` : `${u.name} switched on`)}>
              {u.isActive ? 'Switch off' : 'Switch on'}
            </Button>
            <Button size="sm" variant={panel === 'password' ? 'secondary' : 'ghost'} onClick={() => setPanel(panel === 'password' ? null : 'password')}>
              Set password
            </Button>
            {u.totpEnabled && !isSelf && (
              <Button size="sm" variant={panel === 'totp' ? 'secondary' : 'ghost'} onClick={() => setPanel(panel === 'totp' ? null : 'totp')}>
                <ShieldOff className="size-4" />
                Reset authenticator
              </Button>
            )}
          </div>
        </td>
      </tr>
      {panel && (
        <tr className="bg-muted/30">
          <td colSpan={4} className="px-3 py-3">
            {panel === 'password' ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (password && !problem && !busy) void run(() => apiPost(`/api/v1/users/${u.id}/password`, { password }), `Password set for ${u.name}. It also unlocks the account.`);
                }}
              >
                <Input aria-label={`New password for ${u.name}`} className="max-w-xs font-mono" placeholder="New password" autoComplete="off" value={password} aria-invalid={!!problem} onChange={(e) => setPassword(e.target.value)} autoFocus />
                <Button type="button" variant="outline" size="sm" onClick={() => setPassword(generatePassword())}>
                  <RefreshCw className="size-4" />
                  Generate
                </Button>
                <Button type="submit" size="sm" disabled={!password || !!problem || busy}>
                  Set password
                </Button>
                {problem && (
                  <span role="alert" className="text-xs text-brand-coral">
                    {problem}
                  </span>
                )}
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Switch off {u.name}'s authenticator? They will set up a new one at their next sign-in. Do this only if they have lost their phone and their recovery codes.</span>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void run(() => apiPost(`/api/v1/users/${u.id}/reset-totp`, {}), `${u.name}'s authenticator was reset`)}>
                  Reset it
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** What each role may do, as the table the server enforces. A tick is a permission the role holds. */
export function RoleMatrixTable({ matrix }: { matrix: RoleMatrix }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">What each role may do</caption>
        <thead className="bg-muted/40">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Permission
            </th>
            {matrix.roles.map((r) => (
              <th key={r.role} scope="col" className="px-3 py-2 text-center font-medium">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_GROUPS.map((group) => (
            <Fragment key={group.heading}>
              <tr className="border-t bg-muted/20">
                <th scope="colgroup" colSpan={matrix.roles.length + 1} className="px-3 py-1.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.heading}
                </th>
              </tr>
              {group.permissions.map((p) => (
                <tr key={p.key} className="border-t">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">
                    {p.label}
                  </th>
                  {matrix.roles.map((r) => {
                    const yes = holds(matrix.roles, r.role, p.key);
                    return (
                      <td key={r.role} className="px-3 py-1.5 text-center">
                        {yes ? <Check className="mx-auto size-4 text-primary" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not allowed" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The accounts, for an owner: add people, change their role, switch them off, set a password, clear a
 * lost authenticator. A role change applies to that person's next request, with no sign-in. Below, the
 * table of what each role may do: the server's own, not a copy.
 */
export function UsersAdmin() {
  const { user: me } = useAuth();
  const users = useApi<{ users: UserAccount[] }>('/api/v1/users');
  const matrix = useApi<RoleMatrix>('/api/v1/users/roles');
  const roles = matrix.data?.roles ?? [];

  return (
    <div className="space-y-6">
      {users.error && !users.data && (
        <p role="alert" className="text-sm text-brand-coral">
          Could not load the users: {users.error}
        </p>
      )}
      {!users.data && !users.error && (
        <TableSkeleton rows={4} label="Loading the users" columns={[{ header: 'Person', sub: true }, { header: 'Role', as: 'control' }, { header: 'Status', as: 'badge' }, { as: 'button', align: 'right' }]} />
      )}
      {roles.length > 0 && <CreateUser roles={roles} onDone={users.reload} />}
      {users.data && roles.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Users</caption>
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Person
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Role
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.users.map((u) => (
                <UserRow key={u.id} u={u} roles={roles} isSelf={u.email === me?.email} onChanged={users.reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section aria-label="What each role may do">
        <h3 className="mb-1 font-semibold">What each role may do</h3>
        <p className="mb-2 text-sm text-muted-foreground">This is the table the server enforces on every request, not a description of it.</p>
        {matrix.data ? <RoleMatrixTable matrix={matrix.data} /> : <TableSkeleton rows={8} label="Loading the roles" columns={['Permission', ...Array.from({ length: 5 }, () => ({ header: '', align: 'center' as const }))]} />}
      </section>
    </div>
  );
}
