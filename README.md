# NUR Organics platform — frontend

React + TypeScript dashboard, built with Vite, Tailwind CSS v4 and shadcn/ui.
Shows orders, returns, stock and profit across NUR by Juggun and Juggun's Organics.

## Running it

```bash
npm install
npm run dev      # http://127.0.0.1:5173
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
cp .env.example .env.local   # then set VITE_API_URL
```

## Deployment (Vercel)

The dashboard is deployed at `https://scaling-guide-flame.vercel.app`. `VITE_API_URL` is read at
build time, so set it in the Vercel project settings to the backend's public URL, and add the
Vercel origin to the backend's `CORS_ORIGIN`.

Until the backend is public (it runs on localhost until the Render keys arrive), the deployed site
cannot sign in: with no `VITE_API_URL`, its `/api` calls go to Vercel itself and get 404. Work
locally with `npm run dev` against the local backend instead.

Once React Router adds more than one page, Vercel also needs a rewrite of all paths to
`index.html` (a `vercel.json`), or a refresh on any page other than `/` returns 404.

## Adding shadcn components

```bash
npx shadcn@latest add dialog
```

Components land in `src/components/ui/` and are yours to edit. Already added: button, card,
table, badge, input, separator, skeleton, tabs, dropdown-menu, sonner.

## Layout

```
src/
  App.tsx                     Overview page
  main.tsx                    entry point, toaster
  index.css                   Tailwind + shadcn theme + brand colours
  components/
    app-shell.tsx             header, navigation, page frame
    integration-status.tsx    live connection status from the backend
    ui/                       shadcn components
  hooks/use-api.ts            small fetch hook
  lib/api.ts                  API client and shared types
```

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
order. Next for this app: React Router and TanStack Query, then the orders, shipments, returns and
confirmation pages for Release 1.
