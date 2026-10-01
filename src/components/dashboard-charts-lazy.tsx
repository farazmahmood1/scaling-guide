import { type ReactNode, Suspense, lazy } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * The charts, loaded when they are needed. The chart library is most of the dashboard's weight, and
 * the dashboard is the first screen, so the tiles, the alert summary and every definition render at
 * once and the chart code arrives beside them as its own file.
 */
export const TrendChart = lazy(() => import('@/components/dashboard-charts').then((m) => ({ default: m.TrendChart })));
export const ReturnTrendChart = lazy(() => import('@/components/dashboard-charts').then((m) => ({ default: m.ReturnTrendChart })));
export const CityReturnChart = lazy(() => import('@/components/dashboard-charts').then((m) => ({ default: m.CityReturnChart })));
export const CashAgeingChart = lazy(() => import('@/components/dashboard-charts').then((m) => ({ default: m.CashAgeingChart })));

/** Holds a chart's place, at its height, while its code loads. */
export function ChartSuspense({ children, height = 240 }: { children: ReactNode; height?: number }) {
  return <Suspense fallback={<Skeleton className="w-full" style={{ height }} aria-busy />}>{children}</Suspense>;
}
