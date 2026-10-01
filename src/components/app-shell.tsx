import { useEffect, useRef, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigation } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { type Module, moduleForPath, visibleModules } from '@/lib/nav';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'block rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white'
    : 'block rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white';

/** The modules this role may use, grouped. Ones it may not use are not rendered at all. */
function Navigation({ modules, onNavigate }: { modules: Module[]; onNavigate?: () => void }) {
  const groups = [...new Set(modules.map((m) => m.group))];
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((group) => (
        <div key={group}>
          <div className="px-3 pb-1 text-[11px] font-medium tracking-wide text-white/40 uppercase">{group}</div>
          <ul className="space-y-0.5">
            {modules
              .filter((m) => m.group === group)
              .map((m) => (
                <li key={m.key}>
                  <NavLink to={m.path} end={m.path === '/'} className={linkClass} onClick={onNavigate}>
                    {m.label}
                  </NavLink>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-full bg-brand-coral text-sm font-bold text-white">c</span>
      <span className="font-semibold tracking-tight text-white">NUR Organics</span>
    </div>
  );
}

/** The mobile menu: a panel over the page, closed by the button, Escape, the backdrop or a link. */
function Drawer({ open, onClose, modules }: { open: boolean; onClose: () => void; modules: Module[] }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-brand-navy p-4">
        <div className="flex items-center justify-between">
          <Brand />
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close menu" className="text-white/80 hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </Button>
        </div>
        <Navigation modules={modules} onNavigate={onClose} />
      </div>
    </div>
  );
}

/**
 * The frame every signed-in page renders in: a sidebar on wide screens, a drawer behind the menu
 * button on narrow ones, and the current module's page in the middle. The tab title follows the
 * route.
 */
export function AppShell() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const modules = visibleModules(user?.role);
  const current = moduleForPath(pathname);
  // A page's code loads on its first visit; say so rather than leave the old page looking current.
  const loading = useNavigation().state === 'loading';

  useEffect(() => {
    document.title = current ? `${current.label} · NUR Organics` : 'Not found · NUR Organics';
  }, [current]);

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-60 shrink-0 bg-brand-navy lg:block">
        <div className="sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto p-4">
          <Brand />
          <Navigation modules={modules} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-brand-navy px-4 text-white sm:px-6 lg:bg-background lg:text-foreground">
          <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <span className="hidden text-sm font-medium lg:inline">{current?.label ?? ''}</span>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-xs opacity-60 sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-white/80 hover:bg-white/10 hover:text-white lg:text-muted-foreground lg:hover:bg-muted lg:hover:text-foreground">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        {loading && <div role="progressbar" aria-label="Loading page" className="h-0.5 w-full animate-pulse bg-brand-coral" />}
        <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8" aria-busy={loading}>
          <Outlet />
        </main>

        <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">NUR by Juggun · Juggun's Organics — built by Codilated</footer>
      </div>

      <Drawer open={drawer} onClose={() => setDrawer(false)} modules={modules} />
    </div>
  );
}
