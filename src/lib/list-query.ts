/**
 * The state of a list screen (filters, sort, page, hidden columns) as it lives in the URL, so a
 * filtered view is a link anyone can open and it survives a reload. Parsing is strict and total:
 * a hand-edited or stale URL never throws; anything it does not understand falls back to the
 * default, never to a guess.
 */

export type SortDir = 'asc' | 'desc';

export interface ListQuery {
  search: string;
  /** Karachi calendar days, `YYYY-MM-DD`, inclusive. */
  from: string | null;
  to: string | null;
  /** Multi-select filters by key, e.g. `{ status: ['pending', 'confirmed'] }`. */
  multi: Record<string, string[]>;
  page: number;
  pageSize: number;
  sort: { key: string; dir: SortDir } | null;
  hidden: string[];
}

export interface QuerySpec {
  /** Multi-select filter keys and the values each accepts. */
  multi: Record<string, readonly string[]>;
  sortKeys: readonly string[];
  defaultSort: { key: string; dir: SortDir } | null;
  pageSizes: readonly number[];
  defaultPageSize: number;
  columnKeys: readonly string[];
  defaultHidden?: readonly string[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (text: string | null): text is string => {
  if (!text || !DAY.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const list = (text: string | null): string[] => [...new Set((text ?? '').split(',').map((v) => v.trim()).filter(Boolean))];

export const defaultQuery = (spec: QuerySpec): ListQuery => ({
  search: '',
  from: null,
  to: null,
  multi: {},
  page: 1,
  pageSize: spec.defaultPageSize,
  sort: spec.defaultSort,
  hidden: [...(spec.defaultHidden ?? [])],
});

export const parseQuery = (params: URLSearchParams, spec: QuerySpec): ListQuery => {
  const query = defaultQuery(spec);
  query.search = (params.get('q') ?? '').slice(0, 200);
  let from = isDay(params.get('from')) ? params.get('from') : null;
  let to = isDay(params.get('to')) ? params.get('to') : null;
  // A range typed backwards means the same days.
  if (from && to && from > to) [from, to] = [to, from];
  query.from = from;
  query.to = to;
  for (const [key, allowed] of Object.entries(spec.multi)) {
    const values = list(params.get(key)).filter((v) => allowed.includes(v));
    if (values.length > 0) query.multi[key] = values;
  }
  const page = Number(params.get('page'));
  if (Number.isSafeInteger(page) && page >= 1) query.page = page;
  const size = Number(params.get('size'));
  if (spec.pageSizes.includes(size)) query.pageSize = size;
  const [key, dir] = (params.get('sort') ?? '').split(':');
  if (key && spec.sortKeys.includes(key) && (dir === 'asc' || dir === 'desc')) query.sort = { key, dir };
  // `sort=` with nothing: the default sort was turned off on purpose.
  else if (params.get('sort') === '') query.sort = null;
  if (params.has('hide')) query.hidden = list(params.get('hide')).filter((k) => spec.columnKeys.includes(k));
  return query;
};

/** The URL form of a query; defaults are left out, so a plain view has a plain URL. */
export const toParams = (query: ListQuery, spec: QuerySpec): URLSearchParams => {
  const params = new URLSearchParams();
  if (query.search.trim()) params.set('q', query.search.trim());
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  for (const key of Object.keys(spec.multi)) {
    const values = query.multi[key];
    if (values && values.length > 0) params.set(key, values.join(','));
  }
  if (query.page > 1) params.set('page', String(query.page));
  if (query.pageSize !== spec.defaultPageSize) params.set('size', String(query.pageSize));
  const def = spec.defaultSort;
  if (query.sort && (!def || query.sort.key !== def.key || query.sort.dir !== def.dir)) params.set('sort', `${query.sort.key}:${query.sort.dir}`);
  if (!query.sort && def) params.set('sort', '');
  const defaultHidden = [...(spec.defaultHidden ?? [])].sort().join(',');
  if ([...query.hidden].sort().join(',') !== defaultHidden) params.set('hide', query.hidden.join(','));
  return params;
};

/**
 * A change to the query. Anything but paging sends the view back to page 1: page 7 of the old
 * filter is not page 7 of the new one.
 */
export const applyChange = (query: ListQuery, change: Partial<ListQuery>): ListQuery => {
  const keepsPage = Object.keys(change).every((k) => k === 'page' || k === 'hidden');
  return { ...query, ...change, page: change.page ?? (keepsPage ? query.page : 1) };
};

/** Next sort when a column header is clicked: ascending, descending, then back to the default. */
export const nextSort = (current: ListQuery['sort'], key: string, fallback: ListQuery['sort']): ListQuery['sort'] => {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return fallback && fallback.key !== key ? fallback : null;
};
