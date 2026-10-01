import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { type Page, hrefFor } from '@/lib/route';

const NAV: ReadonlyArray<{ label: string; page?: Page }> = [
  { label: 'Overview', page: 'overview' },
  { label: 'Confirmations', page: 'confirmations' },
  { label: 'Reconciliation', page: 'reconciliation' },
  { label: 'Returns', page: 'returns' },
  { label: 'Inventory', page: 'inventory' },
  { label: 'Influencers', page: 'influencers' },
  { label: 'Accounting', page: 'accounting' },
  { label: 'Orders' },
  { label: 'Profit' },
];

export function AppShell({ page, children }: { page: Page; children: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-brand-navy text-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-brand-coral text-sm font-bold">c</span>
            <span className="font-semibold tracking-tight">NUR Organics</span>
          </div>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
            {NAV.map((item) =>
              item.page ? (
                <a
                  key={item.label}
                  href={hrefFor(item.page)}
                  aria-current={item.page === page ? 'page' : undefined}
                  className={
                    item.page === page
                      ? 'rounded-md bg-white/10 px-3 py-1.5 font-medium'
                      : 'rounded-md px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white'
                  }
                >
                  {item.label}
                </a>
              ) : (
                // Pages not built yet stay labels.
                <span key={item.label} className="rounded-md px-3 py-1.5 text-white/40" aria-disabled>
                  {item.label}
                </span>
              ),
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-white/50 sm:inline">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        NUR by Juggun · Juggun's Organics — built by Codilated
      </footer>
    </div>
  );
}
