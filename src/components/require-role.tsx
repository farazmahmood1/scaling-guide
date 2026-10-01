import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { type ModuleKey, canUse, homePath, moduleByKey } from '@/lib/nav';

/**
 * A module's page, or, when this person may not use it, a plain message (or, for the home page,
 * their own first module). The decision is read from the permissions the server last sent, so it
 * follows a change to their role without a reload. The backend refuses the requests anyway; this
 * keeps the screen honest about why.
 */
export function RequireRole({ moduleKey, children }: { moduleKey: ModuleKey; children: ReactNode }) {
  const { permissions } = useAuth();
  const module = moduleByKey(moduleKey);
  if (canUse(module, permissions)) return children;
  // The home page is everyone's first stop; if it is not theirs, take them to what is.
  if (moduleKey === 'overview') return <Navigate to={homePath(permissions)} replace />;
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{module.label}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your role does not include this module. Ask the owner if you need it.</p>
    </div>
  );
}
