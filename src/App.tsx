import { Loader2 } from 'lucide-react';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { AppShell } from '@/components/app-shell';
import { LoginPage } from '@/pages/login';
import { OverviewPage } from '@/pages/overview';

function Routes() {
  const { user, restoring } = useAuth();

  // Avoids a flash of the login page while the stored token is being checked.
  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-navy">
        <Loader2 className="size-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <AppShell>
      <OverviewPage />
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
