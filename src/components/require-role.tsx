import type { ReactNode } from 'react';

import { useAuth } from '@/auth/auth-context';
import { type ModuleKey, canUse, moduleByKey } from '@/lib/nav';

/**
 * A module's page, or, when this role may not use it (opened by its address), a plain message.
 * The backend refuses the role's requests anyway; this keeps the screen honest about why.
 */
export function RequireRole({ moduleKey, children }: { moduleKey: ModuleKey; children: ReactNode }) {
  const { user } = useAuth();
  const module = moduleByKey(moduleKey);
  if (canUse(module, user?.role)) return children;
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{module.label}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your role does not include this module. Ask the owner if you need it.</p>
    </div>
  );
}
