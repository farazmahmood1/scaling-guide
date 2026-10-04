import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '@/auth/auth-context';
import { AppSkeleton, ChartSkeleton, FactsSkeleton, FormSkeleton, ListSkeleton, TableSkeleton, num } from '@/components/skeletons';
import { OverviewPage } from '@/pages/overview';

const bars = (html: string) => (html.match(/data-slot="skeleton"/g) ?? []).length;

describe('a table while it loads', () => {
  const html = renderToStaticMarkup(<TableSkeleton rows={4} label="Loading the partners" columns={['Partner', { header: 'City', sub: true }, num('Units held'), { as: 'button', align: 'right' }]} />);

  it('keeps the table\'s own headers, with numbers on the right', () => {
    expect(html).toContain('>Partner</th>');
    expect(html).toMatch(/<th[^>]*text-right[^>]*>Units held<\/th>/);
  });

  it('has a row per expected row and a bar per cell, two where the cell carries a second line', () => {
    expect((html.match(/<tr/g) ?? []).length).toBe(5);
    expect(bars(html)).toBe(4 * 5);
  });

  it('says it is loading once, and hides the bars from assistive technology', () => {
    expect((html.match(/role="status"/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-label="Loading the partners"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('draws the same widths every time', () => {
    expect(renderToStaticMarkup(<TableSkeleton columns={['A', num('B')]} />)).toBe(renderToStaticMarkup(<TableSkeleton columns={['A', num('B')]} />));
  });

  it('has no header row when the table has none, and a totals row when asked', () => {
    const plain = renderToStaticMarkup(<TableSkeleton rows={3} footer columns={[{}, { align: 'right' }]} />);
    expect(plain).not.toContain('<thead');
    expect(plain).toContain('<tfoot');
  });
});

describe('the other shapes', () => {
  it('draws a list row for each row, ending in what the row ends in', () => {
    const html = renderToStaticMarkup(<ListSkeleton rows={3} trailing="badge-button" />);
    expect((html.match(/<li/g) ?? []).length).toBe(3);
    // Two lines, a badge and a button on each row.
    expect(bars(html)).toBe(3 * 4);
  });

  it('draws a label and a value for each fact', () => {
    expect(bars(renderToStaticMarkup(<FactsSkeleton rows={5} />))).toBe(10);
  });

  it('draws each field of a form as its label, input and hint, then the save bar', () => {
    expect(bars(renderToStaticMarkup(<FormSkeleton fields={4} columns={2} />))).toBe(4 * 3 + 2);
  });

  it('draws a chart at the chart\'s height, in the chart\'s kind of mark', () => {
    const line = renderToStaticMarkup(<ChartSkeleton kind="line" series={2} legend />);
    expect(line).toContain('height:240px');
    expect((line.match(/clip-path/g) ?? []).length).toBe(2);
    const ranked = renderToStaticMarkup(<ChartSkeleton kind="bars" height={304} count={8} />);
    expect(ranked).toContain('height:304px');
    expect((ranked.match(/h-\[34px\]/g) ?? []).length).toBe(8);
  });

  it('draws the frame before the first page arrives', () => {
    const html = renderToStaticMarkup(<AppSkeleton />);
    expect(html).toContain('role="status"');
    expect(html).toContain('bg-brand-navy');
  });
});

describe('the dashboard while it loads', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/">
      <AuthProvider>
        <OverviewPage />
      </AuthProvider>
    </StaticRouter>,
  );

  it('holds every tile at its final shape: a figure and the line under it', () => {
    for (const label of ['Delivered revenue', 'Net profit', 'Return rate', 'Delivery success', 'Cash with PostEx', 'Profit per parcel']) expect(html).toContain(`aria-label="Loading ${label}"`);
  });

  it('shows each chart as a chart, and the lists as lists, never one grey block', () => {
    expect((html.match(/aria-label="Loading the chart"/g) ?? []).length).toBe(5);
    expect(html).toContain('aria-label="Loading what needs attention"');
    expect(html).toContain('aria-label="Checking Shopify"');
    expect(html).not.toMatch(/data-slot="skeleton" class="[^"]*h-(24|56|60) w-full/);
  });
});
