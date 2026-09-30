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
| `npm run lint` | ESLint |

## Configuration

Only needed when the backend is somewhere other than `localhost:4000`:

```bash
cp .env.example .env.local   # then set VITE_API_URL
```

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

1. Routing (React Router) once there is more than one page.
2. TanStack Query for caching, background refresh and staleness indicators.
3. Recharts for the returns-by-city and profit charts, using the chart tokens already in the theme.
4. Real pages: orders, returns, inventory, profit and loss.
