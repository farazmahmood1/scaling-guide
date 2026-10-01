import { Lock } from 'lucide-react';

import { monthLabel } from '@/lib/ledger';
import { cn } from '@/lib/utils';

/** A lock and the word "Closed": the same small mark wherever a month, line or figure is final. */
export function ClosedMark({ className, label = 'Closed' }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border border-slate-500/50 bg-slate-500/15 px-1.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300', className)}>
      <Lock className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/**
 * Above any report whose period includes closed months: it says which, and what that means. A
 * closed month is final, so these figures cannot change; a correction is a new entry in the next
 * open month.
 */
export function ClosedBanner({ months }: { months: readonly string[] }) {
  if (months.length === 0) return null;
  return (
    <div role="note" className="flex items-start gap-3 rounded-lg border-2 border-slate-500/60 bg-slate-500/10 p-3 text-sm" data-testid="closed-banner">
      <Lock className="mt-0.5 size-5 shrink-0 text-slate-600 dark:text-slate-300" aria-hidden />
      <div>
        <p className="font-semibold">
          {months.length === 1 ? '1 closed month' : `${months.length} closed months`} in this period: {months.map(monthLabel).join(', ')}
        </p>
        <p className="text-muted-foreground">Closed months are final. Their figures cannot change; a correction is posted in the next open month.</p>
      </div>
    </div>
  );
}
