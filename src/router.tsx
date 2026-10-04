import type { ReactElement } from 'react';
import { type RouteObject, createBrowserRouter } from 'react-router';

import { AppShell } from '@/components/app-shell';
import { RequireRole } from '@/components/require-role';
import { Rethrow, RouteError } from '@/components/route-error';
import { AppSkeleton } from '@/components/skeletons';
import { MODULES, type ModuleKey } from '@/lib/nav';
import { NotFoundPage } from '@/pages/not-found';

/** Each module's page, loaded on first visit: `npm run build` emits one chunk per page. */
const PAGES: Record<ModuleKey, () => Promise<ReactElement>> = {
  overview: () => import('@/pages/overview').then(({ OverviewPage }) => <OverviewPage />),
  orders: () => import('@/pages/orders').then(({ OrdersPage }) => <OrdersPage />),
  parcels: () => import('@/pages/parcels').then(({ ParcelsPage }) => <ParcelsPage />),
  returns: () => import('@/pages/returns').then(({ ReturnsPage }) => <ReturnsPage />),
  reconciliation: () => import('@/pages/reconciliation').then(({ ReconciliationPage }) => <ReconciliationPage />),
  confirmations: () => import('@/pages/confirmations').then(({ ConfirmationsPage }) => <ConfirmationsPage />),
  inventory: () => import('@/pages/inventory').then(({ InventoryPage }) => <InventoryPage />),
  purchase: () => import('@/pages/purchase').then(({ PurchasePage }) => <PurchasePage />),
  partners: () => import('@/pages/partners').then(({ PartnersPage }) => <PartnersPage />),
  pr: () => import('@/pages/influencers').then(({ InfluencersPage }) => <InfluencersPage />),
  accounting: () => import('@/pages/accounting').then(({ AccountingPage }) => <AccountingPage />),
  reports: () => import('@/pages/reports').then(({ ReportsPage }) => <ReportsPage />),
  settings: () => import('@/pages/settings').then(({ SettingsPage }) => <SettingsPage />),
};

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    // The first page's code is still loading when the app starts.
    hydrateFallbackElement: <AppSkeleton />,
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
      // One parcel: part of the Parcels module, so it takes that module's role gate and title.
      {
        path: 'parcels/:id',
        errorElement: <RouteError />,
        lazy: async () => {
          try {
            return { element: <RequireRole moduleKey="parcels">{await import('@/pages/parcel-detail').then(({ ParcelDetailPage }) => <ParcelDetailPage />)}</RequireRole> };
          } catch (error) {
            return { element: <Rethrow error={error} /> };
          }
        },
      },
      // One order: part of the Orders module, so it takes that module's role gate and title.
      {
        path: 'orders/:id',
        errorElement: <RouteError />,
        lazy: async () => {
          try {
            return { element: <RequireRole moduleKey="orders">{await import('@/pages/order-detail').then(({ OrderDetailPage }) => <OrderDetailPage />)}</RequireRole> };
          } catch (error) {
            return { element: <Rethrow error={error} /> };
          }
        },
      },
      // Everyone's own account: not a module, so no role gates it.
      { path: 'account', errorElement: <RouteError />, lazy: async () => ({ element: await import('@/pages/account').then(({ AccountPage }) => <AccountPage />) }) },
      // Component demos, outside the navigation.
      { path: 'dev/table', errorElement: <RouteError />, lazy: async () => ({ element: await import('@/pages/dev/table-demo').then(({ TableDemoPage }) => <TableDemoPage />) }) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
