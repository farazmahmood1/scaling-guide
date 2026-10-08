import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { Link } from 'react-router';

import { useBrand } from '@/brand/brand-context';
import { useApi } from '@/hooks/use-api';
import type { StockHealth } from '@/lib/api';
import { formatKarachiTime } from '@/lib/format';
import { storeLabel } from '@/lib/parcels';
import { cn } from '@/lib/utils';

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One reason, ticked when it is no longer a problem; `info` is a standing rule, not a problem. */
function Reason({ ok, info, title, children }: { ok: boolean; info?: boolean; title: string; children: React.ReactNode }) {
  const Icon = info ? Info : ok ? CircleCheck : CircleAlert;
  return (
    <li className="flex gap-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', info ? 'text-muted-foreground' : ok ? 'text-primary' : 'text-brand-coral')} />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

/**
 * Why the shelf figures are below zero, from the live facts, and what makes each one right. The
 * shelf is worked out, never typed: it starts from the opening count, goes down with every parcel
 * sent and up with every return checked in and every delivery received. Without the opening count
 * it starts from zero, so every parcel sent so far takes it below zero.
 */
export function StockExplainer({ onCount }: { onCount: () => void }) {
  const { brand } = useBrand();
  const { data } = useApi<{ stores: StockHealth[] }>('/api/v1/stock/health');
  const stores = (data?.stores ?? []).filter((s) => !brand || s.store === brand);
  const troubled = stores.filter((s) => s.negativeProducts > 0 || !s.openingCountAt || s.returnsWaiting > 0);
  if (!data || troubled.length === 0) return null;

  return (
    <div role="status" className="mb-6 rounded-xl border border-brand-coral/40 bg-brand-coral/5 p-4 text-sm">
      <p className="mb-1 text-base font-semibold">Why stock shows in minus, and how it becomes right</p>
      <p className="mb-4 text-muted-foreground">
        Nobody types the shelf figure. It starts from an opening count, goes down by every unit sent with PostEx, and goes up by every return checked in and every purchase
        received. Without the opening count it starts from zero, so everything sent so far pushes it below zero.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {troubled.map((s) => (
          <div key={s.store} className="rounded-lg border bg-background p-3">
            <p className="mb-2 font-medium">
              {storeLabel(s.store)}: {plural(s.negativeProducts, 'product')} below zero, {plural(s.shelfUnits, 'unit')} on the shelf in all
            </p>
            <ol className="space-y-2">
              <Reason ok={s.openingCountAt !== null} title={s.openingCountAt ? `Opening count entered (as at ${formatKarachiTime(s.openingCountAt)})` : '1. No opening count yet'}>
                {s.openingCountAt ? (
                  'The shelf started from a real count.'
                ) : (
                  <>
                    Count the shelf once and enter it under{' '}
                    <button type="button" className="underline underline-offset-2" onClick={onCount}>
                      Count the shelf
                    </button>
                    . This is the main reason for the minus.
                  </>
                )}
              </Reason>
              <Reason ok={s.returnsWaiting === 0} title={s.returnsWaiting === 0 ? 'Every return is checked in' : `2. ${plural(s.returnsWaiting, 'returned parcel')} not checked in`}>
                {s.returnsWaiting === 0 ? (
                  'Nothing is stuck on its way back.'
                ) : (
                  <>
                    {plural(s.comingBack, 'unit')} {s.comingBack === 1 ? 'is' : 'are'} counted as "Coming back", not on the shelf, until someone checks them in on{' '}
                    <Link className="underline underline-offset-2" to="/returns">
                      Returns
                    </Link>
                    . Do this before the count.
                  </>
                )}
              </Reason>
              <Reason ok={s.unmappedLines === 0} title={s.unmappedLines === 0 ? 'Every order line has its product' : `3. ${plural(s.unmappedLines, 'order line')} ${s.unmappedLines === 1 ? 'has' : 'have'} no product`}>
                {s.unmappedLines === 0 ? (
                  'Every unit sent is counted against its product.'
                ) : (
                  <>
                    These orders name a product that no longer exists in Shopify (deleted or re-created), so their units cannot be taken off any shelf. They are listed under{' '}
                    <Link className="underline underline-offset-2" to="/reconciliation">
                      Reconciliation
                    </Link>
                    , "Order line with no product".
                  </>
                )}
              </Reason>
              <Reason ok info title="From now on: receive new stock through Purchase">
                When goods arrive from the supplier, record them under Purchase → Receive. That is what puts them on the shelf, at their cost.
              </Reason>
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
