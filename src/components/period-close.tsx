import { useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/auth/auth-context';
import { ClosedMark } from '@/components/closed-period';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { usePeriods } from '@/hooks/use-periods';
import { type Period, apiPost } from '@/lib/api';
import { formatKarachiFull } from '@/lib/format';
import { closeBlocker, monthKey, monthLabel } from '@/lib/ledger';
import { cn } from '@/lib/utils';

/**
 * Closing a month, with its guard rails in plain sight. A closed month is final and is drawn as
 * such: a slate card, a lock, who closed it and when. An open month says exactly why it cannot be
 * closed yet (not before the 5th of the next month, and months close in order), and closing it
 * takes typing its name, because it can never be reopened. The server enforces every rule again.
 */
export function PeriodClose() {
  const { periods, error, loading, reload } = usePeriods();
  const { can } = useAuth();
  const mayClose = can('accounting.close');
  const [closing, setClosing] = useState<string>();
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  // Karachi's date when the page opened: the server decides too.
  const [today] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }));

  const close = async (period: Period) => {
    setSaving(true);
    try {
      await apiPost(`/api/v1/accounting/periods/${period.year}/${period.month}/close`, {});
      toast.success(`${monthLabel(monthKey(period.year, period.month))} closed for good`);
      setClosing(undefined);
      setTyped('');
      reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not close the month');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div role="note" className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          A month can be closed from the 5th of the next, and only after every earlier month with entries is closed. <strong>A closed month can never be reopened:</strong> nothing can be dated in it, and a correction is posted in the next open month.
        </p>
      </div>
      {loading && !periods && <Skeleton className="h-32 w-full" />}
      {error && !periods && <p role="alert" className="text-sm text-brand-coral">Could not load the months: {error}</p>}
      <ul className="space-y-2">
        {(periods ?? []).map((period) => {
          const key = monthKey(period.year, period.month);
          const isClosed = period.status === 'closed';
          const blocker = closeBlocker(period, periods ?? [], today);
          return (
            <li
              key={key}
              data-closed={isClosed}
              className={cn('rounded-lg border p-3', isClosed ? 'border-2 border-slate-500/60 bg-slate-500/10' : 'bg-background')}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {isClosed ? <Lock className="size-5 text-slate-600 dark:text-slate-300" aria-hidden /> : <LockOpen className="size-5 text-muted-foreground" aria-hidden />}
                  <div>
                    <p className="font-semibold">{monthLabel(key)}</p>
                    <p className="text-xs text-muted-foreground">
                      {period.entries} entries
                      {isClosed ? ` · closed ${period.closedAt ? formatKarachiFull(period.closedAt) : ''} by ${period.closedBy ?? 'unknown'}` : ' · open'}
                    </p>
                  </div>
                </div>
                {isClosed ? (
                  <ClosedMark label="Closed: final" />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {blocker && <span className="text-sm text-muted-foreground">{blocker}</span>}
                    {!mayClose && <span className="text-sm text-muted-foreground">Only the owner, a manager or the accountant can close it</span>}
                    {mayClose && <Button size="sm" variant="outline" disabled={blocker !== null} onClick={() => { setClosing(key); setTyped(''); }}>
                      Close month
                    </Button>}
                  </div>
                )}
              </div>
              {closing === key && !isClosed && (
                <form
                  className="mt-3 space-y-2 border-t pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (typed.trim() === key && !saving) void close(period);
                  }}
                >
                  <p className="text-sm">
                    Closing {monthLabel(key)} cannot be undone. Type <span className="font-mono font-semibold">{key}</span> to confirm.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Input className="w-40 font-mono" aria-label={`Type ${key} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
                    <Button type="submit" variant="destructive" size="sm" disabled={typed.trim() !== key || saving}>
                      Close {monthLabel(key)} for good
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setClosing(undefined)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
