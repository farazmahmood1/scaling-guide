import { LogOut } from 'lucide-react';

import { useAuth } from '@/auth/auth-context';
import { TotpEnrolment } from '@/components/totp-enrolment';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * All an owner or manager can see until they have set up an authenticator app. It is not a page of
 * the app: the server refuses everything else to such a session, so this is the whole screen.
 */
export function EnrolmentGate() {
  const { user, roleLabel, signOut, adoptToken } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2 text-white">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-coral text-sm font-bold">c</span>
          <span className="text-lg font-semibold tracking-tight">NUR Organics</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>One more step before you start</CardTitle>
            <CardDescription>
              {roleLabel ? `As ${/^[aeiou]/i.test(roleLabel) ? 'an' : 'a'} ${roleLabel.toLowerCase()}` : 'In your role'}, you sign in with a second step: a code from an authenticator app on your phone. Set it up now; it takes a minute.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TotpEnrolment account={user?.email ?? ''} onDone={adoptToken} />
          </CardContent>
        </Card>
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={signOut} className="text-white/70 hover:bg-white/10 hover:text-white">
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
