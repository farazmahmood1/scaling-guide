import { Loader2 } from 'lucide-react';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { AppShell } from '@/components/app-shell';
import { useRoute } from '@/lib/route';
import { InventoryPage } from '@/pages/inventory';
import { LoginPage } from '@/pages/login';
import { OverviewPage } from '@/pages/overview';
import { ReconciliationPage } from '@/pages/reconciliation';
import { ReturnsPage } from '@/pages/returns';

function Routes() {
  const { user, restoring } = useAuth();
  const page = useRoute();

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
    <AppShell page={page}>
      {page === 'overview' && <OverviewPage />}
      {page === 'reconciliation' && <ReconciliationPage />}
      {page === 'returns' && <ReturnsPage />}
      {page === 'inventory' && <InventoryPage />}
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
