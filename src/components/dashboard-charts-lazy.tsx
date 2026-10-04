import { type ReactNode, Suspense, lazy } from 'react';

import { ChartSkeleton } from '@/components/skeletons';

/**
 * The charts, loaded when they are needed. The chart library is most of the dashboard's weight, and
 * the dashboard is the first screen, so the tiles, the alert summary and every definition render at
 * once and the chart code arrives beside them as its own file.
 */
export const TrendChart = lazy(() => import('@/components/dashboard-charts').then((m) => ({ default: m.TrendChart })));
export const ReturnTrendChart = lazy(() => import('@/components/dashboard-charts').then((m) => ({ default: m.ReturnTrendChart })));
export const CityReturnChart = lazy(() => import('@/components/dashboard-charts').then((m) => ({ default: m.CityReturnChart })));
export const CashAgeingChart = lazy(() => import('@/components/dashboard-charts').then((m) => ({ default: m.CashAgeingChart })));

/**
 * Holds a chart's place while its code loads, with the same skeleton the card shows while its
 * numbers load, so the two waits read as one.
 */
export function ChartSuspense({ children, skeleton }: { children: ReactNode; skeleton: ReactNode }) {
  return <Suspense fallback={skeleton}>{children}</Suspense>;
}

/** Each chart's skeleton: its kind of mark, at its height. */
export const chartSkeletons = {
  trend: <ChartSkeleton kind="line" series={2} legend />,
  returnTrend: <ChartSkeleton kind="line" />,
  cashAgeing: <ChartSkeleton kind="columns" height={220} count={4} />,
  cityReturns: <ChartSkeleton kind="bars" height={8 * 34 + 32} count={8} />,
  funnel: <ChartSkeleton kind="bars" height={6 * 34} count={6} />,
} as const;
