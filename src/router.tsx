import type { ReactElement } from 'react';
import { Loader2 } from 'lucide-react';
import { type RouteObject, createBrowserRouter } from 'react-router';

import { AppShell } from '@/components/app-shell';
import { RequireRole } from '@/components/require-role';
import { Rethrow, RouteError } from '@/components/route-error';
import { MODULES, type ModuleKey } from '@/lib/nav';
import { NotFoundPage } from '@/pages/not-found';

/**
 * Each module's page, loaded on first visit: `npm run build` emits one chunk per page. Modules not
 * built yet share the placeholder chunk, each with its own title.
 */
const placeholder = (key: ModuleKey) => import('@/pages/placeholder').then(({ PlaceholderPage }) => <PlaceholderPage moduleKey={key} />);

const PAGES: Record<ModuleKey, () => Promise<ReactElement>> = {
  overview: () => import('@/pages/overview').then(({ OverviewPage }) => <OverviewPage />),
  orders: () => placeholder('orders'),
  parcels: () => placeholder('parcels'),
  returns: () => import('@/pages/returns').then(({ ReturnsPage }) => <ReturnsPage />),
  reconciliation: () => import('@/pages/reconciliation').then(({ ReconciliationPage }) => <ReconciliationPage />),
  confirmations: () => import('@/pages/confirmations').then(({ ConfirmationsPage }) => <ConfirmationsPage />),
  inventory: () => import('@/pages/inventory').then(({ InventoryPage }) => <InventoryPage />),
  purchase: () => placeholder('purchase'),
  partners: () => placeholder('partners'),
  pr: () => import('@/pages/influencers').then(({ InfluencersPage }) => <InfluencersPage />),
  accounting: () => import('@/pages/accounting').then(({ AccountingPage }) => <AccountingPage />),
  reports: () => placeholder('reports'),
  settings: () => placeholder('settings'),
};

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    // The first page's code is still loading when the app starts.
    hydrateFallbackElement: (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
    children: [
      ...MODULES.map(
        (m): RouteObject => ({
          ...(m.path === '/' ? { index: true } : { path: m.path.slice(1) }),
          // Each route has its own boundary: one broken page leaves the shell and the rest working.
          errorElement: <RouteError />,
          lazy: async () => {
            try {
              return { element: <RequireRole moduleKey={m.key}>{await PAGES[m.key]()}</RequireRole> };
            } catch (error) {
              // A rejected `lazy` leaves the outlet empty instead of reaching the boundary; thrown
              // while rendering, the failure shows in this route's boundary like any other.
              return { element: <Rethrow error={error} /> };
            }
          },
        }),
      ),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
