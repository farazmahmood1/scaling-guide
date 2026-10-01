import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { RouterProvider } from 'react-router';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { legacyHashPath } from '@/lib/nav';
import { EnrolmentGate } from '@/pages/enrolment-gate';
import { LoginPage } from '@/pages/login';
import { createRouter } from '@/router';

// Links from before the router (`/#/returns`) land on the page they meant.
const legacy = legacyHashPath(window.location.hash);
if (legacy) window.history.replaceState(null, '', legacy);

function Routes() {
  const { user, restoring, enrolmentRequired } = useAuth();
  const [router] = useState(createRouter);

  // Avoids a flash of the login page while the stored token is being checked.
  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-navy">
        <Loader2 className="size-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (!user) return <LoginPage />;
  // An owner or manager who has not set up an authenticator app can do nothing else until they do.
  if (enrolmentRequired) return <EnrolmentGate />;
  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
