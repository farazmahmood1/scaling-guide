import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { StatTile } from '@/components/dashboard-ui';
import { alertRows } from '@/lib/alerts';
import { OverviewPage } from '@/pages/overview';

const page = (url = '/') =>
  renderToStaticMarkup(
    <StaticRouter location={url}>
      <OverviewPage />
    </StaticRouter>,
  );

describe('the dashboard\'s tiles', () => {
  const html = page();
  const tiles = html.split('data-testid="stat-tile"').slice(1);

  it('has the six headline figures', () => {
    expect(tiles).toHaveLength(6);
    for (const label of ['Delivered revenue', 'Net profit', 'Return rate', 'Delivery success', 'Cash with PostEx', 'Profit per parcel']) expect(html).toContain(label);
  });

  it('states the period on every tile, and links every tile to the report behind it', () => {
    for (const tile of tiles) {
      // A period in words (a range, "All time" or "As of …"), never left out.
      expect(tile).toMatch(/\d{4}|All time|As of/);
      expect(tile).toContain('Open the report');
      expect(tile).toMatch(/href="\/(reports|parcels)\?/);
    }
  });

  it('gives every tile a definition, reachable by keyboard and by tap', () => {
    for (const tile of tiles) expect(tile).toMatch(/<button[^>]*aria-label="What [^"]+ means"/);
  });

  it('opens each tile\'s report on the period and brand chosen above', () => {
    const chosen = page('/?range=year&store=organics');
    expect(chosen).toMatch(/href="\/reports\?tab=general-ledger&amp;account=4000&amp;from=\d{4}-01-01&amp;to=\d{4}-\d\d-\d\d&amp;store=organics"/);
    expect(chosen).toMatch(/href="\/parcels\?stage=returned&amp;from=\d{4}-01-01&amp;to=\d{4}-\d\d-\d\d&amp;store=organics"/);
    expect(page('/?range=all')).toContain('href="/reports?all=1"');
  });

  it('puts a definition on each chart and on the alert summary, with the period each covers', () => {
    for (const title of ['Revenue and profit by month', 'Cash with PostEx by age', 'Return rate by month', 'Return rate by city', 'Needs attention']) {
      expect(html).toContain(title);
      expect(html).toContain(`aria-label="What ${title} means"`);
    }
    expect(html).toContain('Last six months');
  });

  it('offers every chart as a table too', () => {
    expect((html.match(/Show as a table/g) ?? []).length).toBe(4);
  });

  it('has the brand and period controls, with the chosen ones marked', () => {
    expect(html).toContain('aria-label="Brand"');
    expect(html).toContain('aria-pressed="true"');
    expect(page('/?range=all')).toMatch(/aria-pressed="true"[^>]*>All time/);
  });

  it('ignores a period or brand it does not know', () => {
    const odd = page('/?range=forever&store=nowhere');
    expect(odd).toContain('Last 30 days');
    expect(odd).not.toContain('store=nowhere');
  });
});

describe('a tile with a value', () => {
  const tile = (props: Partial<Parameters<typeof StatTile>[0]> = {}) =>
    renderToStaticMarkup(
      <StaticRouter location="/">
        <StatTile label="Return rate" value="11.8%" basis="117 of 994 parcels returned" period="Parcels booked 1 Sep – 17 Sep 2026" definition="Returned ÷ finished." href="/parcels?stage=returned" {...props} />
      </StaticRouter>,
    );

  it('shows the value, what it is made of, its period and its report', () => {
    const html = tile();
    expect(html).toContain('11.8%');
    expect(html).toContain('117 of 994 parcels returned');
    expect(html).toContain('Parcels booked 1 Sep – 17 Sep 2026');
    expect(html).toContain('href="/parcels?stage=returned"');
  });

  it('shows no number while loading, and says so when it could not load', () => {
    expect(tile({ loading: true })).not.toContain('11.8%');
    const failed = tile({ error: 'boom' });
    expect(failed).not.toContain('11.8%');
    expect(failed).toContain('Could not load');
  });
});

describe('the alert summary\'s rows', () => {
  it('lists returns first, then the queue in its own order, and nothing that has nothing open', () => {
    const rows = alertRows({ stuck_in_transit: 2, unmatched_shipment: 5, cod_mismatch: 0, confirmed_not_booked: 1 }, 3);
    expect(rows.map((r) => [r.key, r.count, r.href])).toEqual([
      ['returns', 3, '/returns'],
      ['unmatched_shipment', 5, '/reconciliation'],
      ['stuck_in_transit', 2, '/reconciliation'],
      ['confirmed_not_booked', 1, '/confirmations'],
    ]);
    for (const r of rows) expect(r.meaning.length).toBeGreaterThan(20);
  });

  it('is empty when all is clear', () => {
    expect(alertRows({}, 0)).toEqual([]);
  });
});
