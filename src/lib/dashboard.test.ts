import { describe, expect, it } from 'vitest';

import type { BreakdownRow, RateFigure, ReturnRateRow } from '@/lib/api';
import { DEFINITIONS, MIN_CITY_OUTCOMES, asOfText, compactRupees, monthTrend, periodText, plotRupees, rangeFor, rankCities, rateBasis, rateText, rateTrend, returnedParcelsLink, tileLinks, trendWindow } from '@/lib/dashboard';

describe('periods', () => {
  const today = '2026-09-17';
  it('gives each named range as Karachi days', () => {
    expect(rangeFor('30d', today)).toEqual({ from: '2026-08-19', to: today });
    expect(rangeFor('month', today)).toEqual({ from: '2026-09-01', to: today });
    expect(rangeFor('last-month', today)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(rangeFor('year', today)).toEqual({ from: '2026-01-01', to: today });
    expect(rangeFor('all', today)).toEqual({ from: null, to: null });
  });

  it('goes back across a year start', () => {
    expect(rangeFor('last-month', '2027-01-09')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(rangeFor('30d', '2027-01-09')).toEqual({ from: '2026-12-11', to: '2027-01-09' });
    expect(trendWindow('2027-02-10')).toEqual({ from: '2026-09-01', to: '2027-02-10' });
    expect(trendWindow('2026-09-17')).toEqual({ from: '2026-04-01', to: '2026-09-17' });
  });

  it('says a period in words, with the year', () => {
    expect(periodText({ from: '2026-09-01', to: '2026-09-17' })).toBe('1 Sep – 17 Sep 2026');
    expect(periodText({ from: '2025-12-20', to: '2026-01-05' })).toBe('20 Dec 2025 – 5 Jan 2026');
    expect(periodText({ from: null, to: null })).toBe('All time');
    expect(asOfText('2026-09-07')).toBe('As of 7 Sep 2026');
  });
});

describe('figures', () => {
  const rate = (count: number, of: number): RateFigure => ({ count, of, rate: of === 0 ? null : count / of });

  it('prints a rate to one decimal, and a dash when there is nothing to divide', () => {
    expect(rateText(rate(117, 994))).toBe('11.8%');
    expect(rateText(rate(0, 40))).toBe('0.0%');
    expect(rateText(rate(0, 0))).toBe('—');
    expect(rateBasis(rate(117, 994), 'parcels')).toBe('117 of 994 parcels');
    expect(rateBasis(rate(0, 0), 'parcels')).toBe('No parcels with a final outcome yet');
  });

  it('compacts rupees exactly, truncating and never rounding up', () => {
    expect(compactRupees('98000')).toBe('Rs 980');
    expect(compactRupees('4529999')).toBe('Rs 45.2K');
    expect(compactRupees('123456789')).toBe('Rs 1.2M');
    expect(compactRupees('199999999')).toBe('Rs 1.9M');
    expect(compactRupees('2000000000')).toBe('Rs 20M');
    expect(compactRupees('1000000000000')).toBe('Rs 10B');
    expect(compactRupees('-123456789')).toBe('−Rs 1.2M');
    expect(compactRupees('5')).toBe('Rs 0');
    // Far beyond any real figure, and still exact on the digits: Rs 9,007,199,254,740,993 is 9007199.2 billion.
    expect(compactRupees('900719925474099312')).toBe('Rs 9007199.2B');
    expect(compactRupees(null)).toBe('—');
    expect(compactRupees('12.5')).toBe('—');
  });

  it('places marks from paisa without ever printing the float', () => {
    expect(plotRupees('275050')).toBe(2750.5);
    expect(plotRupees('x')).toBe(0);
  });
});

describe('chart data', () => {
  const row = (key: string, revenue: string, profit: string): BreakdownRow => ({ key, label: key, revenue, goods: '0', postexCharges: '0', marketing: '0', writeOff: '0', otherExpenses: '0', profit, parcels: 3 });

  it('orders months oldest first, ignores non-months, and keeps the exact paisa beside the plotted number', () => {
    const pts = monthTrend([row('2026-09', '300000', '90000'), row('-', '5', '5'), row('2026-08', '1000000', '250050')]);
    expect(pts.map((p) => p.month)).toEqual(['2026-08', '2026-09']);
    expect(pts[0]).toMatchObject({ label: "Aug '26", revenue: 10000, profit: 2500.5, profitPaisa: '250050' });
  });

  const city = (label: string, delivered: number, returned: number): ReturnRateRow => ({ key: label.toLowerCase(), label, delivered, returned, of: delivered + returned, rate: returned / (delivered + returned) });

  it('ranks cities by return rate among those with enough finished parcels', () => {
    const { shown, leftOut } = rankCities([city('Lahore', 180, 20), city('Quetta', 1, 0), city('Karachi', 400, 60), city('Multan', 8, 4), city('Sukkur', 2, 2)]);
    // Multan has 12 finished parcels, so its 33% is a rate worth showing; Quetta (1) and Sukkur (4) are not.
    expect(shown.map((c) => c.label)).toEqual(['Multan', 'Karachi', 'Lahore']);
    // 1 of 1 returned would read 100%: those are left out and counted, not ranked.
    expect(leftOut).toBe(2);
    expect(MIN_CITY_OUTCOMES).toBe(10);
  });

  it('keeps the top few, and does not rank a parcel with no city', () => {
    const many = Array.from({ length: 12 }, (_, i) => city(`City${i}`, 90, i));
    expect(rankCities(many, { top: 5 }).shown).toHaveLength(5);
    expect(rankCities([{ ...city('x', 50, 40), key: '-' }]).shown).toEqual([]);
  });

  it('shapes a monthly return-rate trend', () => {
    const pts = rateTrend([{ key: '2026-09', label: '2026-09', delivered: 90, returned: 10, of: 100, rate: 0.1 }, { key: '2026-08', label: '2026-08', delivered: 80, returned: 20, of: 100, rate: 0.2 }]);
    expect(pts.map((p) => [p.key, p.rate])).toEqual([['2026-08', 0.2], ['2026-09', 0.1]]);
  });
});

describe('where each figure\'s report is', () => {
  const today = '2026-09-17';
  const links = tileLinks({ range: 'month', store: 'nur' }, '2026-09-17', today);

  it('opens each tile on its own period and brand', () => {
    expect(links.revenue).toBe('/reports?tab=general-ledger&account=4000&from=2026-09-01&to=2026-09-17&store=nur');
    expect(links.profit).toBe('/reports?from=2026-09-01&to=2026-09-17&store=nur');
    expect(links.returnRate).toBe('/parcels?stage=returned&from=2026-09-01&to=2026-09-17&store=nur');
    expect(links.deliverySuccess).toBe('/parcels?stage=delivered&from=2026-09-01&to=2026-09-17&store=nur');
  });

  it('opens the cash ledger from the start up to the day the figure is as of', () => {
    expect(links.cash).toBe('/reports?tab=general-ledger&account=1100&from=2000-01-01&to=2026-09-17&store=nur');
  });

  it('marks all time for the Reports screen, and leaves the flag off the parcels list', () => {
    const all = tileLinks({ range: 'all', store: null }, '2026-09-17', today);
    expect(all.profit).toBe('/reports?all=1');
    expect(all.returnRate).toBe('/parcels?stage=returned');
    expect(returnedParcelsLink({ from: '2026-09-01', to: '2026-09-17' }, null, 'Lahore')).toBe('/parcels?stage=returned&city=Lahore&from=2026-09-01&to=2026-09-17');
  });
});

describe('definitions', () => {
  it('has a definition for every figure, none of them empty', () => {
    for (const key of ['revenue', 'netProfit', 'returnRate', 'deliverySuccess', 'firstAttempt', 'cash', 'ageing', 'profitPerParcel', 'trend', 'returnTrend', 'cityReturns', 'alerts', 'returnsAwaiting'] as const) {
      expect(DEFINITIONS[key].length, key).toBeGreaterThan(40);
    }
  });
});
