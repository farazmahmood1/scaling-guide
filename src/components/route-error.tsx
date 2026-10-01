import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

import { Button } from '@/components/ui/button';

/**
 * A route's error boundary: a page that throws, or whose code fails to load, shows this in place
 * of itself; the navigation and every other page keep working.
 */
export function RouteError() {
  const error = useRouteError();
  // After a deploy, a tab open on the old version asks for chunks that no longer exist.
  const stale = error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : 'Unknown error';
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-xl border p-6">
      <h1 className="text-xl font-semibold tracking-tight">{stale ? 'A new version is available' : 'This page ran into a problem'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {stale ? 'The app was updated while this tab was open. Reload to continue.' : 'The rest of the app still works. Reload to try again; if it keeps happening, send this message to support.'}
      </p>
      {!stale && <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{message}</pre>}
      <div className="mt-4 flex gap-2">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Button variant="outline" asChild>
          <Link to="/">Overview</Link>
        </Button>
      </div>
    </div>
  );
}

/** Rethrows during render, so a page whose code failed to load reaches its route's boundary. */
export function Rethrow({ error }: { error: unknown }): never {
  throw error;
}
