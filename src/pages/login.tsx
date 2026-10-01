import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { needsCode, signInMessage } from '@/lib/sign-in';
import { isSignInCode, looksLikeRecovery } from '@/lib/totp-ui';

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // After the right password for an account with an authenticator, the server asks for the code.
  const [askForCode, setAskForCode] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await signIn(email, password, askForCode ? code.trim() : undefined);
    } catch (cause) {
      if (needsCode(cause)) {
        setAskForCode(true);
        setError(undefined);
      } else {
        setError(signInMessage(cause));
        if (cause instanceof Error && 'code' in cause && cause.code === 'totp_invalid') setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setAskForCode(false);
    setCode('');
    setError(undefined);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2 text-white">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-coral text-sm font-bold">c</span>
          <span className="text-lg font-semibold tracking-tight">NUR Organics</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{askForCode ? 'Enter your code' : 'Sign in'}</CardTitle>
            <CardDescription>{askForCode ? 'The six-digit code from your authenticator app' : 'Orders, returns, stock and profit for both brands'}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {!askForCode ? (
                <>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input id="email" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@nurorganics.pk" />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium">
                      Password
                    </label>
                    <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="code" className="text-sm font-medium">
                    Authentication code
                  </label>
                  <Input
                    id="code"
                    className={looksLikeRecovery(code) ? 'font-mono' : 'font-mono text-lg tracking-widest'}
                    inputMode={looksLikeRecovery(code) ? 'text' : 'numeric'}
                    autoComplete="one-time-code"
                    autoFocus
                    value={code}
                    aria-invalid={!!error}
                    aria-describedby="code-help"
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                  />
                  <p id="code-help" className="text-xs text-muted-foreground">
                    Lost your phone? Type one of your recovery codes here instead (like ABCDE-FGHJK). Each works once.
                  </p>
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-brand-coral">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={busy || (askForCode && !isSignInCode(code))}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? 'Signing in' : askForCode ? 'Verify and sign in' : 'Sign in'}
              </Button>
              {askForCode && (
                <Button type="button" variant="ghost" className="w-full" onClick={back}>
                  Back
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-white/40">Built by Codilated</p>
      </div>
    </div>
  );
}
