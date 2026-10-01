import { useState } from 'react';
import { KeyRound, ShieldCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/auth/auth-context';
import { TotpEnrolment } from '@/components/totp-enrolment';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiPost } from '@/lib/api';
import { passwordProblem } from '@/lib/accounts';

/** Your own password, as a form: the current one, the new one twice, and what is wrong in words. */
function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const problem = next ? passwordProblem(next) : null;
  const mismatch = again !== '' && again !== next;
  const valid = next !== '' && !problem && next === again;

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await apiPost('/api/v1/auth/password', { ...(current ? { current } : {}), next });
      toast.success('Password changed');
      setCurrent('');
      setNext('');
      setAgain('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change the password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !saving) void save();
      }}
    >
      <div className="space-y-1">
        <label htmlFor="current-password" className="text-sm font-medium">
          Current password
        </label>
        <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <p className="text-xs text-muted-foreground">Leave this empty if you have not set a password of your own yet.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="new-password" className="text-sm font-medium">
          New password
        </label>
        <Input id="new-password" type="password" autoComplete="new-password" value={next} aria-invalid={!!problem} aria-describedby="new-password-note" onChange={(e) => setNext(e.target.value)} />
        <p id="new-password-note" className={problem ? 'text-xs text-brand-coral' : 'text-xs text-muted-foreground'}>
          {problem ?? 'At least 12 characters. A few words together is easier to remember than symbols.'}
        </p>
      </div>
      <div className="space-y-1">
        <label htmlFor="again-password" className="text-sm font-medium">
          New password again
        </label>
        <Input id="again-password" type="password" autoComplete="new-password" value={again} aria-invalid={mismatch} onChange={(e) => setAgain(e.target.value)} />
        {mismatch && (
          <p role="alert" className="text-xs text-brand-coral">
            The two do not match.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-brand-coral">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!valid || saving}>
        <KeyRound className="size-4" />
        {saving ? 'Saving…' : 'Change password'}
      </Button>
    </form>
  );
}

/**
 * Your own account: who you are, what your role is, your password, and your authenticator app. The
 * one page every signed-in person has, whatever their role.
 */
export function AccountPage() {
  const { user, roleLabel, totp, adoptToken, can } = useAuth();
  const [setting, setSetting] = useState(false);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
        <p className="text-sm text-muted-foreground">Your sign-in, and how it is protected.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{user?.name}</CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Role: <Badge variant="secondary">{roleLabel}</Badge>
            </p>
            <p className="text-muted-foreground">
              Your role decides what you can open. An owner can change it, and the change shows up here on its own.
              {can('pii.phone') ? ' You can see customers\' phone numbers.' : ' Customers\' phone numbers are never shown to you.'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Change the password you sign in with.</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Authenticator app</CardTitle>
            <CardDescription>A second step at sign-in: a six-digit code from an app on your phone.</CardDescription>
          </CardHeader>
          <CardContent>
            {totp?.enabled ? (
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2 font-medium text-primary">
                  <ShieldCheck className="size-5" aria-hidden />
                  On. You enter a code from your app each time you sign in.
                </p>
                <p className="text-muted-foreground">If you lose your phone, sign in with one of your recovery codes. If you have none left, an owner can reset your authenticator so you can set it up again.</p>
              </div>
            ) : setting ? (
              <TotpEnrolment
                account={user?.email ?? ''}
                onDone={async (token) => {
                  await adoptToken(token);
                  setSetting(false);
                }}
              />
            ) : (
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <ShieldAlert className="size-5 text-brand-coral" aria-hidden />
                  Off.{totp?.required ? ' Your role requires one.' : ' Recommended for everyone.'}
                </p>
                <Button onClick={() => setSetting(true)}>Set up an authenticator app</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
