import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronDown, RotateCcw } from 'lucide-react';

import { useAuth } from '@/auth/auth-context';
import { useBrand } from '@/brand/brand-context';
import { AlertSummary } from '@/components/alert-summary';
import { CashAgeingChart, ChartSuspense, CityReturnChart, ReturnTrendChart, TrendChart, chartSkeletons } from '@/components/dashboard-charts-lazy';
import { ChartCard, FunnelBars, StatTile } from '@/components/dashboard-ui';
import { IntegrationStatus } from '@/components/integration-status';
import { DashboardControls, DashboardGrid, type GridCard } from '@/components/dashboard-grid';
import { ConfirmationQueueCard, RecentOrdersCard, TopProductsCard } from '@/components/overview-lists';
import { ChartSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useApi } from '@/hooks/use-api';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import type { BreakdownRow, DashboardData, OrderFunnelData, ReturnRateRow, StoreKey } from '@/lib/api';
import {
  AGE_BUCKETS,
  DASH_RANGES,
  DEFAULT_RANGE,
  DEFINITIONS,
  MIN_CITY_OUTCOMES,
  type Period,
  asOfText,
  compactRupees,
  customPeriod,
  funnelPoints,
  isDashRange,
  monthTrend,
  periodText,
  rangeFor,
  rankCities,
  rateBasis,
  rateText,
  rateTrend,
  returnedParcelsLink,
  shareText,
  tileLinks,
  todayKarachi,
  trendWindow,
} from '@/lib/dashboard';
import { brandLabel } from '@/lib/brand';
import { visibleCards } from '@/lib/dashboard-layout';
import { formatPaisa } from '@/lib/format';

const query = (p: Period, store: StoreKey | null, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams(extra);
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  if (store) q.set('store', store);
  return q.toString();
};

const PERIODS = [...DASH_RANGES, { key: 'custom', label: 'Custom' }] as const;
const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** One choice from a short list, as a menu. The trigger names the choice, and sets the menu's width. */
function Picker<K extends string>({ label, value, options, onChange, className }: { label: string; value: K; options: ReadonlyArray<{ key: K; label: string }>; onChange: (key: K) => void; className?: string }) {
  const current = options.find((o) => o.key === value)?.label ?? value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={`h-9 justify-between ${className ?? ''}`} aria-label={`${label}: ${current}`}>
          {current}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={(key) => onChange(key as K)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.key} value={o.key}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The dashboard. Every figure is read from the same report its own screen uses, for the period
 * chosen above and the brand chosen in the sidebar (the trend charts always show the last six months). Each tile says what period
 * it covers, what it means, and links to the report behind it.
 */
export function OverviewPage() {
  const [params, setParams] = useSearchParams();
  const range = isDashRange(params.get('range')) ? (params.get('range') as (typeof DASH_RANGES)[number]['key']) : DEFAULT_RANGE;
  const { brand: store } = useBrand();
  const { can } = useAuth();
  const layout = useDashboardLayout();
  // Two days in the URL are a hand-picked period, and win over the named range.
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const custom = useMemo(() => customPeriod(fromParam, toParam), [fromParam, toParam]);
  const period = useMemo(() => custom ?? rangeFor(range), [custom, range]);
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
  const funnel = useApi<OrderFunnelData>(`/api/v1/reports/funnel?${query(period, store)}`);

  const d = dash.data;
  // The cash figure is a position at the period's last day (today, when the period is open-ended).
  const asOfDay = d?.cash.asOf ?? period.to ?? todayKarachi();
  const links = tileLinks({ range, custom }, asOfDay);
  const tileProps = { loading: dash.loading && !d, error: dash.error && !d ? dash.error : undefined };
  const asOf = asOfText(asOfDay);

  const trendPoints = useMemo(() => monthTrend(months.data?.rows ?? []), [months.data]);
  const returnPoints = useMemo(() => rateTrend(monthReturns.data?.rows ?? []), [monthReturns.data]);
  const cities = useMemo(() => rankCities(cityReturns.data?.rows ?? []), [cityReturns.data]);
  const steps = useMemo(() => (funnel.data ? funnelPoints(funnel.data) : undefined), [funnel.data]);

  const cards: GridCard[] = [
    {
      id: 'revenue',
      label: 'Delivered revenue',
      node: (
            <StatTile
              label="Delivered revenue"
              value={d ? formatPaisa(d.deliveredRevenue.total) : undefined}
              basis={d ? `${d.deliveredRevenue.parcelCount.toLocaleString('en-PK')} delivered parcels${BigInt(d.deliveredRevenue.consignment) > 0n ? `, partners ${compactRupees(d.deliveredRevenue.consignment)}` : ''}` : undefined}
              period={periodLabel}
              definition={DEFINITIONS.revenue}
              href={links.revenue}
              {...tileProps}
            />
      ),
    },
    {
      id: 'profit',
      label: 'Net profit',
      node: (
            <StatTile
              label="Net profit"
              value={d ? formatPaisa(d.profit.netProfit) : undefined}
              basis={d ? `Income ${compactRupees(d.profit.income)} less expenses ${compactRupees(d.profit.expenses)}` : undefined}
              period={periodLabel}
              definition={DEFINITIONS.netProfit}
              href={links.profit}
              {...tileProps}
            />
      ),
    },
    {
      id: 'returnRate',
      label: 'Return rate',
      node: (
            <StatTile
              label="Return rate"
              value={d ? rateText(d.returnRate) : undefined}
              basis={d ? rateBasis(d.returnRate, 'parcels returned') : undefined}
              period={`Parcels booked ${periodLabel}`}
              definition={DEFINITIONS.returnRate}
              href={links.returnRate}
              {...tileProps}
            />
      ),
    },
    {
      id: 'deliverySuccess',
      label: 'Delivery success',
      node: (
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
      ),
    },
    {
      id: 'cash',
      label: 'Cash with PostEx',
      node: (
            <StatTile
              label="Cash with PostEx"
              value={d ? formatPaisa(d.cash.awaiting) : undefined}
              basis={d ? (BigInt(d.cash.owedToPostex) < 0n ? `Plus ${compactRupees(d.cash.owedToPostex.replace('-', ''))} we owe PostEx on parcels with no sale` : 'Delivered, not yet paid out') : undefined}
              period={asOf}
              definition={DEFINITIONS.cash}
              href={links.cash}
              {...tileProps}
            />
      ),
    },
    {
      id: 'profitPerParcel',
      label: 'Profit per parcel',
      node: (
            <StatTile
              label="Profit per parcel"
              value={d ? (d.profitPerParcel.average === null ? '—' : formatPaisa(d.profitPerParcel.average)) : undefined}
              basis={d ? (d.profitPerParcel.parcels === 0 ? 'No parcels with postings in this period' : `Across ${d.profitPerParcel.parcels.toLocaleString('en-PK')} parcels, ${compactRupees(d.profitPerParcel.total)} in all`) : undefined}
              period={periodLabel}
              definition={DEFINITIONS.profitPerParcel}
              href={links.profitPerParcel}
              {...tileProps}
            />
      ),
    },
    {
      id: 'trend',
      label: 'Revenue and profit by month',
      node: (
            <ChartCard
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
              {months.loading && !months.data ? chartSkeletons.trend : trendPoints.length === 0 ? <Empty>Nothing was posted in these months.</Empty> : <ChartSuspense skeleton={chartSkeletons.trend}><TrendChart points={trendPoints} /></ChartSuspense>}
            </ChartCard>
      ),
    },
    {
      id: 'ageing',
      label: 'Cash with PostEx by age',
      node: (
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
              {!d ? chartSkeletons.cashAgeing : <ChartSuspense skeleton={chartSkeletons.cashAgeing}><CashAgeingChart cash={d.cash} /></ChartSuspense>}
            </ChartCard>
      ),
    },
    {
      id: 'returnTrend',
      label: 'Return rate by month',
      node: (
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
              {monthReturns.loading && !monthReturns.data ? chartSkeletons.returnTrend : returnPoints.length === 0 ? <Empty>No parcels have finished yet in these months.</Empty> : <ChartSuspense skeleton={chartSkeletons.returnTrend}><ReturnTrendChart points={returnPoints} /></ChartSuspense>}
            </ChartCard>
      ),
    },
    {
      id: 'cityReturns',
      label: 'Return rate by city',
      node: (
            <ChartCard
              title="Return rate by city"
              period={`Parcels booked ${periodLabel}`}
              definition={DEFINITIONS.cityReturns}
              summary={cities.shown.length === 0 ? 'No city has enough finished parcels.' : cities.shown.map((c) => `${c.label} ${(c.rate * 100).toFixed(1)}%`).join('; ')}
              table={{
                caption: 'Return rate by city',
                columns: ['City', 'Return rate', 'Returned', 'Finished parcels'],
                rows: cities.shown.map((c) => [
                  <Link key={c.key} className="underline underline-offset-4" to={returnedParcelsLink(period, c.label)}>
                    {c.label}
                  </Link>,
                  `${(c.rate * 100).toFixed(1)}%`,
                  c.returned,
                  c.of,
                ]),
              }}
            >
              {cityReturns.loading && !cityReturns.data ? (
                chartSkeletons.cityReturns
              ) : cities.shown.length === 0 ? (
                <Empty>No city has {MIN_CITY_OUTCOMES} finished parcels in this period yet, so no rate is shown. Try a longer period.</Empty>
              ) : (
                <>
                  <ChartSuspense skeleton={<ChartSkeleton kind="bars" height={Math.max(120, cities.shown.length * 34 + 32)} count={cities.shown.length} />}><CityReturnChart rows={cities.shown} period={period} /></ChartSuspense>
                  {cities.leftOut > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {cities.leftOut} {cities.leftOut === 1 ? 'city' : 'cities'} with fewer than {MIN_CITY_OUTCOMES} finished parcels not shown. The number beside each city is its finished parcels.
                    </p>
                  )}
                </>
              )}
            </ChartCard>
      ),
    },
    {
      id: 'funnel',
      label: 'Parcel funnel',
      node: (
            <ChartCard
              title="Parcel funnel"
              period={`Where parcels drop off · orders placed ${periodLabel}`}
              definition={DEFINITIONS.funnel}
              summary={steps ? steps.map((p) => `${p.label} ${p.count}`).join('; ') : 'Loading.'}
              table={{
                caption: 'How far the orders placed in the period got',
                columns: ['Step', 'Orders', 'Of placed'],
                rows: (steps ?? []).map((p) => [p.label, p.count.toLocaleString('en-PK'), shareText(p.share)]),
              }}
            >
              {funnel.error && !steps ? (
                <Empty>Could not load the funnel: {funnel.error}</Empty>
              ) : !steps ? (
                chartSkeletons.funnel
              ) : steps[0]!.count === 0 ? (
                <Empty>No orders were placed in this period.</Empty>
              ) : (
                <FunnelBars points={steps} />
              )}
            </ChartCard>
      ),
    },
    {
      id: 'queue',
      label: 'Confirmation queue',
      node: (
            <ConfirmationQueueCard store={store} />
      ),
    },
    {
      id: 'topProducts',
      label: 'Top products by sales',
      node: (
            <TopProductsCard period={period} periodLabel={periodLabel} store={store} />
      ),
    },
    {
      id: 'recentOrders',
      label: 'Recent orders',
      node: (
            <RecentOrdersCard store={store} />
      ),
    },
    {
      id: 'alerts',
      label: 'Needs attention',
      node: (
            <AlertSummary store={store} />
      ),
    },
    {
      id: 'connections',
      label: 'Connections',
      node: (
            <IntegrationStatus />
      ),
    },
  ];
  const shown = new Set(visibleCards(can));

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Orders, parcels, cash and profit {store ? `for ${brandLabel(store)}` : 'across both brands'}, joined from Shopify and PostEx.</p>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div role="search" aria-label="Period" className="flex flex-wrap items-center gap-2">
          <Picker
            label="Period"
            className="min-w-36"
            value={custom ? 'custom' : range}
            options={PERIODS}
            onChange={(key) => {
              // Custom starts from the days on screen, so picking it changes nothing until a date is edited.
              if (key === 'custom') {
                if (!custom) set({ ...(period.from && period.to ? period : rangeFor(DEFAULT_RANGE)) });
              } else set({ range: key === DEFAULT_RANGE ? null : key, from: null, to: null });
            }}
          />
          {custom && (
            <div className="flex items-center gap-1.5 text-sm">
              {/* An emptied field is ignored, and a day past the other end pulls that end along, so the period is never backwards. */}
              <input
                type="date"
                aria-label="From"
                className={selectClass}
                value={custom.from}
                onChange={(e) => e.target.value && set({ from: e.target.value, to: e.target.value > custom.to ? e.target.value : custom.to })}
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                aria-label="To"
                className={selectClass}
                value={custom.to}
                onChange={(e) => e.target.value && set({ to: e.target.value, from: e.target.value < custom.from ? e.target.value : custom.from })}
              />
              {/* Dropping the two days falls back to the named range Custom was opened from. */}
              <Button size="sm" variant="ghost" className="h-9" onClick={() => set({ from: null, to: null })}>
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            </div>
          )}
          <span className="text-sm text-muted-foreground">{periodLabel}</span>
        </div>
        <DashboardControls layout={layout} />
      </div>

      {dash.error && !d && (
        <p role="alert" className="mb-6 text-sm text-brand-coral">
          Could not load the figures: {dash.error}{' '}
          <Button size="sm" variant="outline" onClick={dash.reload}>
            Try again
          </Button>
        </p>
      )}

      <DashboardGrid cards={cards.filter((c) => shown.has(c.id))} layout={layout} />
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
