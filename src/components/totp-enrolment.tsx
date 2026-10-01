import { useState } from 'react';
import { Copy, Download, Loader2, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type TotpEnabled, type TotpSetup, apiPost } from '@/lib/api';
import { downloadText } from '@/lib/csv';
import { cleanCode, groupSecret, isCompleteCode, recoveryCodesFile } from '@/lib/totp-ui';

type Step = { name: 'intro' } | { name: 'scan'; setup: TotpSetup } | { name: 'codes'; codes: string[]; token: string };

/**
 * Setting up an authenticator app, in three steps that cannot be skipped over. First a QR code (and
 * the same secret in text, for typing in by hand). Nothing is switched on until the app's own
 * six-digit code is given back and the server confirms it: a QR code that was read wrong can never
 * lock anyone out. Then the one-time recovery codes, shown once, which must be acknowledged before
 * finishing, because they are the only way back in if the phone is lost.
 */
export function TotpEnrolment({ account, onDone }: { account: string; onDone: (token: string) => Promise<void> | void }) {
  const [step, setStep] = useState<Step>({ name: 'intro' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setStep({ name: 'scan', setup: await apiPost<TotpSetup>('/api/v1/auth/totp/setup', {}) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the setup');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const done = await apiPost<TotpEnabled>('/api/v1/auth/totp/enable', { code: cleanCode(code) });
      setStep({ name: 'codes', codes: done.recoveryCodes, token: done.token });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check the code');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (step.name === 'intro') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          You will need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or Authy. It shows a six-digit code that changes every 30 seconds, which you type after your password.
        </p>
        <Button onClick={start} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Set up the authenticator app
        </Button>
        {error && (
          <p role="alert" className="text-sm text-brand-coral">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (step.name === 'scan') {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Open your authenticator app and add an account by scanning this code.</li>
          <li>Type the six-digit code the app shows now, to prove it was set up right.</li>
        </ol>
        <div className="flex flex-wrap items-start gap-4">
          {/* Black on white with a quiet margin, whatever the theme: dark-mode QR codes do not scan. */}
          <div className="rounded-lg border bg-white p-3" data-testid="qr-code">
            <QRCodeSVG value={step.setup.otpauthUri} size={176} level="M" marginSize={2} fgColor="#000000" bgColor="#ffffff" title="QR code for your authenticator app" />
          </div>
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <p className="text-muted-foreground">Cannot scan it? Type this key into the app instead:</p>
            <p className="font-mono text-sm break-all select-all" data-testid="totp-secret">
              {groupSecret(step.setup.secret)}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(step.setup.secret);
                toast.success('Key copied');
              }}
            >
              <Copy className="size-4" />
              Copy the key
            </Button>
          </div>
        </div>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (isCompleteCode(code) && !busy) void verify();
          }}
        >
          <label htmlFor="totp-code" className="text-sm font-medium">
            Code from the app
          </label>
          <div className="flex flex-wrap gap-2">
            <Input id="totp-code" className="w-40 font-mono text-lg tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} aria-invalid={!!error} onChange={(e) => setCode(cleanCode(e.target.value))} autoFocus />
            <Button type="submit" disabled={!isCompleteCode(code) || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Check the code and turn it on
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-brand-coral">
              {error}
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <ShieldCheck className="size-5" aria-hidden />
        The authenticator app is on.
      </p>
      <div className="space-y-2 rounded-lg border-2 border-brand-coral/50 bg-brand-coral/5 p-3">
        <p className="text-sm font-semibold">Save these recovery codes now. They are shown only once.</p>
        <p className="text-sm text-muted-foreground">If you lose your phone, each code lets you sign in once, in place of the app's code. Keep them somewhere safe and separate from your phone.</p>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm" data-testid="recovery-codes">
          {step.codes.map((c) => (
            <li key={c} className="select-all">
              {c}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(step.codes.join('\n'));
              toast.success('Recovery codes copied');
            }}
          >
            <Copy className="size-4" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadText('nur-recovery-codes.txt', recoveryCodesFile(step.codes, account), 'text/plain;charset=utf-8')}>
            <Download className="size-4" />
            Download
          </Button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have saved my recovery codes
      </label>
      <Button disabled={!saved || busy} onClick={() => { setBusy(true); void Promise.resolve(onDone(step.token)).finally(() => setBusy(false)); }}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        Finish
      </Button>
    </div>
  );
}
