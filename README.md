# NUR Organics platform — frontend

React + TypeScript dashboard, built with Vite, Tailwind CSS v4 and shadcn/ui.
Shows orders, returns, stock and profit across NUR by Juggun and Juggun's Organics.

## Running it

```bash
npm install
npm run dev      # http://127.0.0.1:3000
```

Start the backend too (`cd ../backend && npm run dev`). Vite proxies `/api` to
`http://localhost:4000`, so both run on one origin in development and there is no CORS setup.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type check and build to `dist/` |
| `npm run preview` | Serve the built files |
| `npm run lint` | oxlint |
| `npm run typecheck` | TypeScript across the app and Vite config, no emit |
| `npm test` / `npm run test:watch` | Vitest over `src/**/*.test.ts(x)`, once or on change |

## Configuration

Only needed when the backend is somewhere other than `localhost:4000`:

```bash
cp .env.example .env.local   # then set VITE
```

## Deployment (Vercel)

The dashboard is deployed at `https://scaling-guide-flame.vercel.app`. `VITE` is read at
build time, so set it in the Vercel project settings to the backend's public URL, and add the
Vercel origin to the backend's `CORS_ORIGIN`.

Until the backend is public (it runs on localhost until the Render keys arrive), the deployed site
cannot sign in: with no `VITE`, its `/api` calls go to Vercel itself and get 404. Work
locally with `npm run dev` against the local backend instead.

`vercel.json` rewrites every path except built assets to `index.html`, so a refresh or a shared
link on any page (`/purchase`) loads the app. Links from before the router (`/#/returns`) are
redirected to their path on load.

## Routing and navigation

React Router, one route per module (`src/lib/nav.ts`): Overview, Orders, Confirmations, Parcels,
Returns, Reconciliation, Inventory, Purchase, Partners, PR, Accounting, Reports, Settings. Each
module lists the roles that may use it (the five roles of BUILD-PLAN Step 15); the navigation
shows only those, and a module opened by address that the role may not use says so. The backend
enforces access on every request regardless.

- Each page is its own chunk, loaded on first visit (`npm run build` lists them); modules not
  built yet share a titled placeholder.
- Each route has its own error boundary: a page that throws, or whose code fails to load (a tab
  left open across a deploy), shows the error in place while the navigation keeps working.
- A sidebar on wide screens, a drawer behind the menu button below 1024px; checked at 375px with
  no horizontal scroll. The tab title follows the route; unknown paths get a 404 page.

## Lists: DataTable and FilterBar

Every list screen uses `components/data-table.tsx` and `components/filter-bar.tsx`, with its
state in the URL through `hooks/use-list-query.ts` (`lib/list-query.ts` reads and writes it):
search `q`, `from`/`to` (Karachi days), one parameter per multi-select (`status=pending,confirmed`),
`page`, `size`, `sort=key:dir` and hidden columns `hide`. A filtered view is a link anyone can open
and survives a reload; Back undoes a filter. Defaults are left out, and anything a URL says that
the screen does not understand falls back to the default.

- **DataTable** renders one page from the server (paging, sorting and filtering happen there), so
  a large list costs what one page does. Loading, empty, error (with Try again) and populated
  states; sortable headers with `aria-sort`; a column menu; rows that open by click, Enter or Space,
  with ↑/↓/Home/End between them; CSV export of the current view (every matching row, visible
  columns, formulas defused, UTF-8 for Excel).
- **FilterBar**: search (applied when typing pauses), a date range with presets, and
  multi-selects, all keyboard-operable, with Clear all.

`/dev/table` (not in the menu) is the demo over 10,000 made-up orders; `?sim=slow|error|empty`
forces each state.

## Adding shadcn components

```bash
npx shadcn@latest add dialog
```

Components land in `src/components/ui/` and are yours to edit. Already added: button, card,
table, badge, input, separator, skeleton, tabs, dropdown-menu, sonner.

## Layout

```
src/
  App.tsx                     sign-in gate; the router once signed in
  router.tsx                  the routes: one lazy chunk, role check and error boundary each
  main.tsx                    entry point, toaster
  index.css                   Tailwind + shadcn theme + brand colours
  components/
    app-shell.tsx             sidebar, mobile drawer, header and page frame
    require-role.tsx          a module's page, or a plain "not for your role"
    route-error.tsx           the per-route error boundary
    integration-status.tsx    live connection status from the backend
    ui/                       shadcn components
  hooks/use-api.ts            small fetch hook
  hooks/use-list-query.ts     a list's filters, sort and page, in the URL
  components/data-table.tsx   the list table every screen uses
  components/filter-bar.tsx   search, date range and multi-select filters
  lib/list-query.ts           list state ⇄ URL parameters
  lib/csv.ts                  CSV export
  lib/mock-orders.ts          10,000 made-up orders for the table demo
  pages/dev/table-demo.tsx    the table demo (/dev/table)
  lib/api.ts                  API client and shared types
  lib/format.ts               paisa → rupees (exact, no floats), queue item wording, Karachi
                              time for the desk (offsets from the time zone database)
  lib/nav.ts                  the modules, their paths and the roles that may use each
  pages/overview.tsx          headline tiles and connections
  pages/placeholder.tsx       a module whose screens are not built yet, titled
  pages/not-found.tsx         404
  pages/confirmations.tsx     Confirmation Desk: the queue, one order with WhatsApp and call
                              links and the customer's history on both brands, outcomes and
                              follow-ups, agent performance, desk settings, and the two alerts
  pages/reconciliation.tsx    review queue: resolve, ignore, link a parcel to its order;
                              match rate and the order-number prefixes setting
  pages/returns.tsx           returns PostEx sent back that nobody has checked in; check-in
  pages/inventory.tsx         stock per product and location; counts and corrections
  pages/influencers.tsx       influencers and their discount codes, codes nobody owns yet,
                              and sales by influencer from the ledger
  pages/accounting.tsx        trial balance with each account's entries, month close,
                              opening balances (typed rupees parsed exactly to paisa)
```

Every action on these pages is recorded by the backend in its audit log with the signed-in user.

## Notes

- **Brand colours** are set at the bottom of `src/index.css`: navy `#0a192f` as primary, coral
  `#e44946` as the accent, and both in the chart palette. Dark mode flips primary to coral.
- **The `@/` alias** maps to `src/` (set in `vite.config.ts` and `tsconfig.json`).
- **Vite binds to 127.0.0.1**, because the default `localhost` binding resolved to IPv6 only on
  this machine and connections were refused.
- **The headline tiles are intentionally empty.** They fill in once the sync and reconciliation
  jobs exist; a dashboard showing invented numbers is worse than an empty one.

## Next steps

The build plan for the whole platform, frontend steps included, lives in the backend repository
(`farazmahmood1/jubilant-octo-tribble-b`) at `docs/BUILD-PLAN.md`; section 3.1 has the week-by-week
order. Next for this app: TanStack Query (it replaces `useApi` once caching matters), then the
orders and parcels pages for Release 1.
