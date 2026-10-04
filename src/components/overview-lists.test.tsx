import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { ConfirmationQueueCard, RecentOrdersCard, TopProductsCard } from '@/components/overview-lists';

const render = (node: React.ReactNode) => renderToStaticMarkup(<StaticRouter location="/">{node}</StaticRouter>);
const period = { from: '2026-09-05', to: '2026-10-04' };

describe('the lists among the dashboard cards', () => {
  it('each has its title, a definition and, until its figures arrive, a skeleton in their place', () => {
    const cases: Array<[React.ReactNode, string, string]> = [
      [<ConfirmationQueueCard key="q" store={null} />, 'Confirmation queue', 'Loading the queue'],
      [<TopProductsCard key="p" period={period} periodLabel="5 Sep – 4 Oct 2026" store={null} />, 'Top products by sales', 'Loading the products'],
      [<RecentOrdersCard key="r" store={null} />, 'Recent orders', 'Loading the recent orders'],
    ];
    for (const [card, title, loading] of cases) {
      const html = render(card);
      expect(html).toContain(title);
      expect(html).toContain(`aria-label="What ${title}`);
      expect(html).toContain(`aria-label="${loading}"`);
    }
  });

  it('links the queue to the desk and the orders to the Orders list, and says which period the sales are for', () => {
    expect(render(<ConfirmationQueueCard store={null} />)).toContain('href="/confirmations"');
    expect(render(<RecentOrdersCard store={null} />)).toContain('href="/orders"');
    expect(render(<TopProductsCard period={period} periodLabel="5 Sep – 4 Oct 2026" store={null} />)).toContain('Units sold, delivered 5 Sep – 4 Oct 2026');
  });
});
