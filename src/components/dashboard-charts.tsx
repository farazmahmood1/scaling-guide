import type { ReactElement, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Legend } from '@/components/dashboard-ui';
import type { DashboardData, ReturnRateRow } from '@/lib/api';
import { AGE_BUCKETS, type Period, type RatePoint, type TrendPoint, compactRupees, plotRupees, returnedParcelsLink } from '@/lib/dashboard';
import { formatPaisa } from '@/lib/format';

/**
 * The dashboard's charts. Marks are thin (2px lines, bars no thicker than 24px with a rounded
 * data end), markers carry a ring in the card's colour so they stay legible where they cross, and
 * the grid is a recessive hairline. Colours are the two validated series tokens (`--viz-1` the
 * brand navy's lifted step, `--viz-2` the brand coral), which change in dark mode. Values are
 * printed from the exact paisa strings; the number a mark is placed by is only for position.
 */

const SERIES_1 = 'var(--viz-1)';
const SERIES_2 = 'var(--viz-2)';

const axis = {
  tick: { fill: 'var(--muted-foreground)', fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: 'var(--border)' },
} as const;

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const dot = (color: string) => ({ r: 4, fill: color, stroke: 'var(--card)', strokeWidth: 2 });

function TooltipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-semibold">{title}</p>
      {children}
    </div>
  );
}

function Row({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {color && <span aria-hidden className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} />}
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </p>
  );
}

/**
 * The room a chart is given: whatever its card has, and never less than `min`, so a card dragged
 * taller draws a taller chart and one dragged short scrolls rather than squashing the plot flat.
 */
function Plot({ min, children }: { min: number; children: ReactElement }) {
  return (
    <div className="min-h-0 flex-1" style={{ minHeight: min }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Delivered revenue and net profit by month: two lines on one money scale. */
export function TrendChart({ points }: { points: readonly TrendPoint[] }) {
  return (
    <>
      <Legend
        items={[
          { label: 'Delivered revenue', color: SERIES_1 },
          { label: 'Net profit', color: SERIES_2 },
        ]}
      />
      <Plot min={200}>
        <LineChart data={[...points]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
          <YAxis {...axis} width={52} tickFormatter={(v: number) => compactNumber.format(v)} />
          <Tooltip
            cursor={{ stroke: 'var(--border)' }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as TrendPoint | undefined;
              if (!active || !p) return null;
              return (
                <TooltipBox title={p.label}>
                  <Row color={SERIES_1} label="Delivered revenue" value={formatPaisa(p.revenuePaisa)} />
                  <Row color={SERIES_2} label="Net profit" value={formatPaisa(p.profitPaisa)} />
                  <Row label="Parcels" value={String(p.parcels)} />
                </TooltipBox>
              );
            }}
          />
          <Line type="monotone" dataKey="revenue" name="Delivered revenue" stroke={SERIES_1} strokeWidth={2} strokeLinecap="round" dot={dot(SERIES_1)} activeDot={{ ...dot(SERIES_1), r: 5 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="profit" name="Net profit" stroke={SERIES_2} strokeWidth={2} strokeLinecap="round" dot={dot(SERIES_2)} activeDot={{ ...dot(SERIES_2), r: 5 }} isAnimationActive={false} />
        </LineChart>
      </Plot>
    </>
  );
}

/** The return rate by booking month: one series, so the card's title names it and there is no legend. */
export function ReturnTrendChart({ points }: { points: readonly RatePoint[] }) {
  const data = points.map((p) => ({ ...p, pct: p.rate * 100 }));
  return (
    <Plot min={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
        <YAxis {...axis} width={44} domain={[0, (max: number) => Math.max(10, Math.ceil(max / 5) * 5)]} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip
          cursor={{ stroke: 'var(--border)' }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (RatePoint & { pct: number }) | undefined;
            if (!active || !p) return null;
            return (
              <TooltipBox title={p.label}>
                <Row color={SERIES_2} label="Return rate" value={`${p.pct.toFixed(1)}%`} />
                <Row label="Returned" value={`${p.returned} of ${p.of} parcels`} />
              </TooltipBox>
            );
          }}
        />
        <Line type="monotone" dataKey="pct" name="Return rate" stroke={SERIES_2} strokeWidth={2} strokeLinecap="round" dot={dot(SERIES_2)} activeDot={{ ...dot(SERIES_2), r: 5 }} isAnimationActive={false} />
      </LineChart>
    </Plot>
  );
}

/** The highest return rates by city, ranked, the value at each bar's tip. A bar opens that city's returned parcels. */
export function CityReturnChart({ rows, period }: { rows: readonly ReturnRateRow[]; period: Period }) {
  const navigate = useNavigate();
  const data = rows.map((r) => ({ ...r, name: `${r.label} (${r.of})`, pct: r.rate * 100 }));
  return (
    <Plot min={Math.max(120, data.length * 34 + 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 0 }} barCategoryGap={8}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" {...axis} domain={[0, (max: number) => Math.max(10, Math.ceil(max / 5) * 5)]} tickFormatter={(v: number) => `${v}%`} />
        <YAxis type="category" dataKey="name" {...axis} width={112} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (ReturnRateRow & { pct: number }) | undefined;
            if (!active || !p) return null;
            return (
              <TooltipBox title={p.label}>
                <Row color={SERIES_2} label="Return rate" value={`${p.pct.toFixed(1)}%`} />
                <Row label="Returned" value={`${p.returned} of ${p.of} parcels`} />
                <p className="mt-1 text-muted-foreground">Click to open these parcels</p>
              </TooltipBox>
            );
          }}
        />
        <Bar dataKey="pct" fill={SERIES_2} radius={[0, 4, 4, 0]} maxBarSize={20} cursor="pointer" isAnimationActive={false} onClick={(d) => navigate(returnedParcelsLink(period, (d as unknown as ReturnRateRow).label))}>
          <LabelList dataKey="pct" position="right" formatter={(v: unknown) => `${Number(v).toFixed(1)}%`} style={{ fill: 'var(--foreground)', fontSize: 12 }} />
        </Bar>
      </BarChart>
    </Plot>
  );
}

/**
 * Cash PostEx is holding, by how long it has waited. One series: the older the cash, the more it
 * matters, so the oldest bucket is the coral accent and the others the quiet series colour.
 */
export function CashAgeingChart({ cash }: { cash: DashboardData['cash'] }) {
  const data = AGE_BUCKETS.map((b) => {
    const found = cash.buckets.find((x) => x.bucket === b.key);
    const paisa = found?.amount ?? '0';
    return { key: b.key, label: b.label, paisa, parcels: found?.parcels ?? 0, amount: plotRupees(paisa), short: compactRupees(paisa) };
  });
  return (
    <Plot min={180}>
      <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap={16}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...axis} interval={0} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
        <YAxis {...axis} width={48} tickFormatter={(v: number) => compactNumber.format(v)} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
            if (!active || !p) return null;
            return (
              <TooltipBox title={p.label}>
                <Row label="Waiting" value={formatPaisa(p.paisa)} />
                <Row label="Parcels" value={String(p.parcels)} />
              </TooltipBox>
            );
          }}
        />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.key === '31+' ? SERIES_2 : SERIES_1} />
          ))}
          <LabelList dataKey="short" position="top" style={{ fill: 'var(--foreground)', fontSize: 11 }} />
        </Bar>
      </BarChart>
    </Plot>
  );
}
