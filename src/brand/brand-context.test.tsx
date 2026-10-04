import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrandProvider, useBrand } from '@/brand/brand-context';
import { brandLabel, parseBrand, withBrand } from '@/lib/brand';
import { defaultQuery } from '@/lib/list-query';

afterEach(() => {
  vi.unstubAllGlobals();
});

const storage = (saved: string | null) =>
  vi.stubGlobal('localStorage', { getItem: () => saved, setItem: () => undefined, removeItem: () => undefined });

function Shown() {
  return <p>{brandLabel(useBrand().brand)}</p>;
}

const render = (url: string) =>
  renderToStaticMarkup(
    <StaticRouter location={url}>
      <BrandProvider>
        <Shown />
      </BrandProvider>
    </StaticRouter>,
  );

describe('the brand chosen in the sidebar', () => {
  it('reads one brand, and takes anything else as both', () => {
    expect(parseBrand('nur')).toBe('nur');
    expect(parseBrand('organics')).toBe('organics');
    // A list's old Store filter with both ticked, a typo, nothing: both brands.
    for (const text of ['nur,organics', 'NUR', 'nowhere', '', null, undefined]) expect(parseBrand(text)).toBeNull();
  });

  it('narrows a list view to the brand, and leaves it alone for both', () => {
    const query = { ...defaultQuery({ multi: {}, sortKeys: [], defaultSort: null, pageSizes: [25], defaultPageSize: 25, columnKeys: [] }), multi: { stage: ['returned'] } };
    expect(withBrand(query, 'organics').multi).toEqual({ stage: ['returned'], store: ['organics'] });
    expect(withBrand(query, null)).toBe(query);
  });

  it('opens on the brand saved last time', () => {
    storage('organics');
    expect(render('/')).toContain("Juggun&#x27;s Organics");
  });

  it('is both brands with nothing saved, or when storage refuses', () => {
    storage(null);
    expect(render('/')).toContain('Both brands');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(render('/')).toContain('Both brands');
  });

  it('still opens an older link on the brand it names, over the saved one', () => {
    storage('organics');
    expect(render('/reports?store=nur')).toContain('NUR by Juggun');
    expect(render('/parcels?store=nur,organics')).toContain('Both brands');
  });

  it('shows both brands to a page rendered outside the shell', () => {
    expect(renderToStaticMarkup(<Shown />)).toContain('Both brands');
  });
});
