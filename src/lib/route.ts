import { useEffect, useState } from 'react';

/** The pages that exist. The rest of the nav stays a label until its page is built. */
export const PAGES = ['overview', 'confirmations', 'reconciliation', 'returns', 'inventory', 'influencers', 'accounting'] as const;
export type Page = (typeof PAGES)[number];

/**
 * `#/returns` → `returns`. Hash routes need no server rewrite on Vercel and no router
 * dependency; anything unknown is the overview.
 */
export const parseRoute = (hash: string): Page => {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return (PAGES as readonly string[]).includes(name) ? (name as Page) : 'overview';
};

export const hrefFor = (page: Page): string => (page === 'overview' ? '#/' : `#/${page}`);

export function useRoute(): Page {
  const [page, setPage] = useState<Page>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setPage(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return page;
}
