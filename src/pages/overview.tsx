import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';

import { AlertSummary } from '@/components/alert-summary';
import { CashAgeingChart, ChartSuspense, CityReturnChart, ReturnTrendChart, TrendChart } from '@/components/dashboard-charts-lazy';
import { ChartCard, StatTile } from '@/components/dashboard-ui';
import { IntegrationStatus } from '@/components/integration-status';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import type { BreakdownRow, DashboardData, ReturnRateRow, StoreKey } from '@/lib/api';
import {
  AGE_BUCKETS,
  DASH_RANGES,
  DEFINITIONS,
  MIN_CITY_OUTCOMES,
  type Period,
  asOfText,
  compactRupees,
  isDashRange,
  monthTrend,
  periodText,
  rangeFor,
  rankCities,
  rateBasis,
  rateText,
  rateTrend,
  returnedParcelsLink,
  tileLinks,
  todayKarachi,
  trendWindow,
} from '@/lib/dashboard';
import { formatPaisa } from '@/lib/format';

const query = (p: Period, store: StoreKey | null, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams(extra);
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  if (store) q.set('store', store);
  return q.toString();
};

const BRANDS = { nur: 'NUR by Juggun', organics: "Juggun's Organics" } as const;
const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * The dashboard. Every figure is read from the same report its own screen uses, for the period and
 * brand chosen above (the trend charts always show the last six months). Each tile says what period
 * it covers, what it means, and links to the report behind it.
 */
export function OverviewPage() {
  const [params, setParams] = useSearchParams();
  const range = isDashRange(params.get('range')) ? (params.get('range') as (typeof DASH_RANGES)[number]['key']) : '30d';
  const store: StoreKey | null = params.get('store') === 'nur' || params.get('store') === 'organics' ? (params.get('store') as StoreKey) : null;
  const period = useMemo(() => rangeFor(range), [range]);
  const trend = useMemo(() => trendWindow(), []);
  const periodLabel = periodText(period);
  const trendLabel = `Last six months (${periodText(trend)})`;

  const set = (change: Record<string, string | null>) =>
    setParams((p) => {
      for (const [k, v] of Object.entries(change)) {
        if (v === null || v === '') p.delete(k);
        else p.set(k, v);
      }
      return p;
    });

  const dash = useApi<DashboardData>(`/api/v1/reports/dashboard?${query(period, store)}`);
  const months = useApi<{ rows: BreakdownRow[] }>(`/api/v1/reports/breakdowns/month?${query(trend, store)}`);
  const monthReturns = useApi<{ rows: ReturnRateRow[] }>(`/api/v1/reports/return-rate?${query(trend, store, { by: 'month' })}`);
  const cityReturns = useApi<{ rows: ReturnRateRow[] }>(`/api/v1/reports/return-rate?${query(period, store, { by: 'city' })}`);

  const d = dash.data;
  // The cash figure is a position at the period's last day (today, when the period is open-ended).
  const asOfDay = d?.cash.asOf ?? period.to ?? todayKarachi();
  const links = tileLinks({ range, store }, asOfDay);
  const tileProps = { loading: dash.loading && !d, error: dash.error && !d ? dash.error : undefined };
  const asOf = asOfText(asOfDay);

  const trendPoints = useMemo(() => monthTrend(months.data?.rows ?? []), [months.data]);
  const returnPoints = useMemo(() => rateTrend(monthReturns.data?.rows ?? []), [monthReturns.data]);
  const cities = useMemo(() => rankCities(cityReturns.data?.rows ?? []), [cityReturns.data]);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Orders, parcels, cash and profit across both brands, joined from Shopify and PostEx.</p>
      </div>

      <div role="search" aria-label="Period and brand" className="mb-6 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Period" className="flex flex-wrap gap-1">
          {DASH_RANGES.map((r) => (
            <Button key={r.key} size="sm" variant={range === r.key ? 'secondary' : 'ghost'} aria-pressed={range === r.key} onClick={() => set({ range: r.key === '30d' ? null : r.key })}>
              {r.label}
            </Button>
          ))}
        </div>
        <select className={selectClass} value={store ?? ''} onChange={(e) => set({ store: e.target.value || null })} aria-label="Brand">
          <option value="">Both brands</option>
          <option value="nur">{BRANDS.nur}</option>
          <option value="organics">{BRANDS.organics}</option>
        </select>
        <span className="text-sm text-muted-foreground">{periodLabel}</span>
      </div>

      <section aria-label="Headline figures" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Delivered revenue"
          value={d ? formatPaisa(d.deliveredRevenue.total) : undefined}
          basis={d ? `${d.deliveredRevenue.parcelCount.toLocaleString('en-PK')} delivered parcels${BigInt(d.deliveredRevenue.consignment) > 0n ? `, partners ${compactRupees(d.deliveredRevenue.consignment)}` : ''}` : undefined}
          period={periodLabel}
          definition={DEFINITIONS.revenue}
          href={links.revenue}
          {...tileProps}
        />
        <StatTile
          label="Net profit"
          value={d ? formatPaisa(d.profit.netProfit) : undefined}
          basis={d ? `Income ${compactRupees(d.profit.income)} less expenses ${compactRupees(d.profit.expenses)}` : undefined}
          period={periodLabel}
          definition={DEFINITIONS.netProfit}
          href={links.profit}
          {...tileProps}
        />
        <StatTile
          label="Return rate"
          value={d ? rateText(d.returnRate) : undefined}
          basis={d ? rateBasis(d.returnRate, 'parcels returned') : undefined}
          period={`Parcels booked ${periodLabel}`}
          definition={DEFINITIONS.returnRate}
          href={links.returnRate}
          {...tileProps}
        />
        <StatTile
          label="Delivery success"
          value={d ? rateText(d.deliverySuccess.success) : undefined}
          basis={d ? `${rateBasis(d.deliverySuccess.success, 'parcels delivered')}; ${rateText(d.deliverySuccess.firstAttempt)} on the first attempt` : undefined}
          period={`Parcels booked ${periodLabel}`}
          definition={
            <>
              {DEFINITIONS.deliverySuccess}
              <br />
              <br />
              <strong>First attempt:</strong> {DEFINITIONS.firstAttempt}
            </>
          }
          href={links.deliverySuccess}
          {...tileProps}
        />
        <StatTile
          label="Cash with PostEx"
          value={d ? formatPaisa(d.cash.awaiting) : undefined}
          basis={d ? (BigInt(d.cash.owedToPostex) < 0n ? `Plus ${compactRupees(d.cash.owedToPostex.replace('-', ''))} we owe PostEx on parcels with no sale` : 'Delivered, not yet paid out') : undefined}
          period={asOf}
          definition={DEFINITIONS.cash}
          href={links.cash}
          {...tileProps}
        />
        <StatTile
          label="Profit per parcel"
          value={d ? (d.profitPerParcel.average === null ? '—' : formatPaisa(d.profitPerParcel.average)) : undefined}
          basis={d ? (d.profitPerParcel.parcels === 0 ? 'No parcels with postings in this period' : `Across ${d.profitPerParcel.parcels.toLocaleString('en-PK')} parcels, ${compactRupees(d.profitPerParcel.total)} in all`) : undefined}
          period={periodLabel}
          definition={DEFINITIONS.profitPerParcel}
          href={links.profitPerParcel}
          {...tileProps}
        />
      </section>

      {dash.error && !d && (
        <p role="alert" className="mb-6 text-sm text-brand-coral">
          Could not load the figures: {dash.error}{' '}
          <Button size="sm" variant="outline" onClick={dash.reload}>
            Try again
          </Button>
        </p>
      )}

      <section aria-label="Trends" className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Revenue and profit by month"
          period={trendLabel}
          definition={DEFINITIONS.trend}
          summary={trendPoints.length === 0 ? 'No months to show.' : `${trendPoints.length} months, from ${trendPoints[0]?.label} to ${trendPoints.at(-1)?.label}.`}
          table={{
            caption: 'Delivered revenue and net profit by month',
            columns: ['Month', 'Delivered revenue', 'Net profit', 'Parcels'],
            rows: trendPoints.map((p) => [p.label, formatPaisa(p.revenuePaisa), formatPaisa(p.profitPaisa), p.parcels]),
          }}
        >
          {months.loading && !months.data ? <Skeleton className="h-60 w-full" /> : trendPoints.length === 0 ? <Empty>Nothing was posted in these months.</Empty> : <ChartSuspense><TrendChart points={trendPoints} /></ChartSuspense>}
        </ChartCard>

        <ChartCard
          title="Cash with PostEx by age"
          period={asOf}
          definition={DEFINITIONS.ageing}
          summary={d ? AGE_BUCKETS.map((b) => `${b.label}: ${formatPaisa(d.cash.buckets.find((x) => x.bucket === b.key)?.amount ?? '0')}`).join('; ') : 'Loading.'}
          table={{
            caption: 'Cash PostEx holds, by days since delivery',
            columns: ['Waiting', 'Amount', 'Parcels'],
            rows: AGE_BUCKETS.map((b) => {
              const x = d?.cash.buckets.find((y) => y.bucket === b.key);
              return [b.label, formatPaisa(x?.amount ?? '0'), x?.parcels ?? 0];
            }),
          }}
        >
          {!d ? <Skeleton className="h-56 w-full" /> : <ChartSuspense height={220}><CashAgeingChart cash={d.cash} /></ChartSuspense>}
        </ChartCard>

        <ChartCard
          title="Return rate by month"
          period={trendLabel}
          definition={DEFINITIONS.returnTrend}
          summary={returnPoints.length === 0 ? 'No months to show.' : returnPoints.map((p) => `${p.label} ${(p.rate * 100).toFixed(1)}%`).join('; ')}
          table={{
            caption: 'Return rate by booking month',
            columns: ['Month', 'Return rate', 'Returned', 'Finished parcels'],
            rows: returnPoints.map((p) => [p.label, `${(p.rate * 100).toFixed(1)}%`, p.returned, p.of]),
          }}
        >
          {monthReturns.loading && !monthReturns.data ? <Skeleton className="h-60 w-full" /> : returnPoints.length === 0 ? <Empty>No parcels have finished yet in these months.</Empty> : <ChartSuspense><ReturnTrendChart points={returnPoints} /></ChartSuspense>}
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="Return rate by city"
          period={`Parcels booked ${periodLabel}`}
          definition={DEFINITIONS.cityReturns}
          summary={cities.shown.length === 0 ? 'No city has enough finished parcels.' : cities.shown.map((c) => `${c.label} ${(c.rate * 100).toFixed(1)}%`).join('; ')}
          table={{
            caption: 'Return rate by city',
            columns: ['City', 'Return rate', 'Returned', 'Finished parcels'],
            rows: cities.shown.map((c) => [
              <Link key={c.key} className="underline underline-offset-4" to={returnedParcelsLink(period, store, c.label)}>
                {c.label}
              </Link>,
              `${(c.rate * 100).toFixed(1)}%`,
              c.returned,
              c.of,
            ]),
          }}
        >
          {cityReturns.loading && !cityReturns.data ? (
            <Skeleton className="h-60 w-full" />
          ) : cities.shown.length === 0 ? (
            <Empty>No city has {MIN_CITY_OUTCOMES} finished parcels in this period yet, so no rate is shown. Try a longer period.</Empty>
          ) : (
            <>
              <ChartSuspense height={cities.shown.length * 34 + 32}><CityReturnChart rows={cities.shown} period={period} store={store} /></ChartSuspense>
              {cities.leftOut > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {cities.leftOut} {cities.leftOut === 1 ? 'city' : 'cities'} with fewer than {MIN_CITY_OUTCOMES} finished parcels not shown. The number beside each city is its finished parcels.
                </p>
              )}
            </>
          )}
        </ChartCard>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <AlertSummary store={store} />
        <div className="lg:col-span-2">
          <IntegrationStatus />
        </div>
      </div>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
