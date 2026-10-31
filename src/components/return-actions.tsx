import { type ReactElement, cloneElement, useMemo, useState } from 'react';
import { Ban, PackageCheck, PackageX, RotateCw, Split } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useApi } from '@/hooks/use-api';
import type { CheckInLine, ParcelUnit, ShopifySyncState } from '@/lib/api';
import type { Outcome } from '@/lib/check-in';
import { shopifyEffect, splitLines, splitProblem } from '@/lib/returns';

/**
 * The returns actions both the register and a parcel's page offer: checking a parcel in (all
 * restocked, all damaged, or split product by product), which also settles the order in Shopify,
 * and where it stands there, with a retry and the cancel kept as its own button.
 */

// A button inside a clickable row: neither the click nor Enter/Space may also open the row.
const own = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(), onKeyDown: (e: { stopPropagation: () => void }) => e.stopPropagation() };

export function CheckInControls({
  shipmentId,
  trackingNumber,
  orderNumber,
  busy,
  onCheckIn,
  size = 'sm',
}: {
  shipmentId: string;
  trackingNumber: string;
  /** The Shopify order the check-in settles; without one, nothing changes in Shopify and nothing is asked. */
  orderNumber: string | null;
  busy: boolean;
  onCheckIn: (outcome: Outcome, lines?: CheckInLine[]) => Promise<boolean> | void;
  size?: 'sm' | 'default';
}) {
  const [splitOpen, setSplitOpen] = useState(false);
  return (
    <span className="flex flex-wrap justify-end gap-2" {...own}>
      <ConfirmedCheckIn outcome="restocked" orderNumber={orderNumber} busy={busy} onConfirm={() => void onCheckIn('restocked')}>
        <Button size={size} variant="outline" disabled={busy} aria-label={`Restock ${trackingNumber}`}>
          <PackageCheck className="size-4" />
          Restock
        </Button>
      </ConfirmedCheckIn>
      <ConfirmedCheckIn outcome="damaged" orderNumber={orderNumber} busy={busy} onConfirm={() => void onCheckIn('damaged')}>
        <Button size={size} variant="destructive" disabled={busy} aria-label={`Mark ${trackingNumber} damaged`}>
          <PackageX className="size-4" />
          Damaged
        </Button>
      </ConfirmedCheckIn>
      <Popover open={splitOpen} onOpenChange={setSplitOpen}>
        <PopoverTrigger asChild>
          <Button size={size} variant="ghost" disabled={busy} aria-label={`Split ${trackingNumber}: part restocked, part damaged`}>
            <Split className="size-4" />
            Split…
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-3">
          {splitOpen && (
            <SplitForm
              shipmentId={shipmentId}
              orderNumber={orderNumber}
              busy={busy}
              onSubmit={async (lines) => {
                const saved = await onCheckIn('mixed', lines);
                if (saved !== false) setSplitOpen(false);
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}

/**
 * Asks once before a check-in that changes a Shopify order, naming the order and what happens to
 * it there. A parcel with no Shopify order is checked in at once.
 */
function ConfirmedCheckIn({ outcome, orderNumber, busy, onConfirm, children }: { outcome: 'restocked' | 'damaged'; orderNumber: string | null; busy: boolean; onConfirm: () => void; children: ReactElement<{ onClick?: () => void }> }) {
  const [open, setOpen] = useState(false);
  if (!orderNumber) return cloneElement(children, { onClick: onConfirm });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 p-3">
        <p className="font-medium">{outcome === 'restocked' ? 'Restock this parcel?' : 'Check this parcel in as damaged?'}</p>
        <p className="text-sm text-muted-foreground">{outcome === 'restocked' ? 'Its items go back on the shelf here.' : 'Its items go to Damaged here and their cost is written off.'}</p>
        <p className="text-sm text-muted-foreground">{shopifyEffect(orderNumber, outcome)}</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Not yet
          </Button>
          <Button
            size="sm"
            variant={outcome === 'damaged' ? 'destructive' : 'default'}
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {outcome === 'restocked' ? 'Restock and update Shopify' : 'Mark damaged and update Shopify'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Per product the parcel carried: how many go back on the shelf; the rest are damaged. */
function SplitForm({ shipmentId, orderNumber, busy, onSubmit }: { shipmentId: string; orderNumber: string | null; busy: boolean; onSubmit: (lines: CheckInLine[]) => Promise<void> }) {
  const { data, error } = useApi<{ units: ParcelUnit[] }>(`/api/v1/stock/returns/${shipmentId}/units`);
  const units = useMemo(() => data?.units ?? [], [data]);
  const [good, setGood] = useState<Record<string, number>>({});
  const lines = splitLines(units, good);
  const problem = splitProblem(units, lines);

  if (error) return <p className="text-sm text-brand-coral">Could not load what the parcel carried: {error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading what the parcel carried…</p>;
  if (units.length === 0) return <p className="text-sm text-muted-foreground">This parcel's items are not linked to products, so it can only be checked in whole.</p>;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) void onSubmit(lines);
      }}
    >
      <p className="font-medium">How many of each are fine?</p>
      <ul className="space-y-2">
        {units.map((u) => {
          const line = lines.find((l) => l.variantId === u.variantId)!;
          return (
            <li key={u.variantId} className="grid grid-cols-[1fr_auto] items-center gap-2">
              <label htmlFor={`good-${u.variantId}`} className="text-sm">
                {u.title}
                <span className="block text-xs text-muted-foreground">
                  {u.qty} came back · {line.damaged} damaged
                </span>
              </label>
              <Input
                id={`good-${u.variantId}`}
                type="number"
                min={0}
                max={u.qty}
                className="h-8 w-16"
                value={line.restocked}
                onChange={(e) => setGood({ ...good, [u.variantId]: Number(e.target.value) })}
              />
            </li>
          );
        })}
      </ul>
      {problem && <p className="text-xs text-muted-foreground">{problem}</p>}
      {orderNumber && <p className="text-xs text-muted-foreground">{shopifyEffect(orderNumber, 'mixed')}</p>}
      <Button type="submit" size="sm" className="w-full" disabled={busy || problem !== null}>
        Check in: shelve the good ones, write off the rest{orderNumber ? ', update Shopify' : ''}
      </Button>
    </form>
  );
}

const LOOK: Record<ShopifySyncState['outcome'], { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  done: { label: 'Updated', variant: 'secondary' },
  skipped: { label: 'Nothing to do', variant: 'outline' },
  pending: { label: 'Waiting on order', variant: 'outline' },
  failed: { label: 'Not updated', variant: 'destructive' },
};

/**
 * Where a checked-in parcel stands in Shopify, with what can be done about it: Retry, which does
 * whatever is left (cancel, return, restock) when Shopify refused or could not be reached; and,
 * when the order is still open there with the returned units committed to it, Cancel in Shopify,
 * which asks once more before doing anything.
 */
export function ShopifySyncCell({
  sync,
  trackingNumber,
  canAct,
  busy,
  onRetry,
  onCancel,
  detailed = false,
}: {
  sync: ShopifySyncState | null;
  trackingNumber: string;
  canAct: boolean;
  busy: boolean;
  onRetry: () => void;
  onCancel: () => void;
  /** Show Shopify's sentence under the badge rather than only on hover. */
  detailed?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!sync) {
    return canAct ? (
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        disabled={busy}
        onKeyDown={own.onKeyDown}
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
      >
        <RotateCw className="size-3.5" />
        Update Shopify
      </Button>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    );
  }
  const look = LOOK[sync.outcome];
  return (
    <span className="flex flex-col items-start gap-1" {...own}>
      <span className="flex flex-wrap items-center gap-2" title={sync.message}>
        <Badge variant={look.variant}>{look.label}</Badge>
        {/* An open order waiting to be cancelled is settled by the confirmed Cancel below, not by a retry that would cancel unasked. */}
        {canAct && (sync.outcome === 'failed' || (sync.outcome === 'pending' && !sync.cancellable)) && (
          <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={onRetry} aria-label={`Check Shopify again for ${trackingNumber}`}>
            <RotateCw className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} />
            {sync.outcome === 'failed' ? 'Retry' : 'Check again'}
          </Button>
        )}
        {canAct && sync.outcome === 'pending' && sync.cancellable && (
          <Popover open={confirming} onOpenChange={setConfirming}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy} aria-label={`Cancel the Shopify order of ${trackingNumber}`}>
                <Ban className="size-3.5" />
                Cancel in Shopify
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-2 p-3">
              <p className="font-medium">Cancel this order in Shopify?</p>
              <p className="text-muted-foreground">
                Shopify frees the units it still holds for the order: back to available if they came back fine, off its stock if damaged. No refund, and the customer is not emailed. This cannot be undone in Shopify.
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep it open
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    onCancel();
                  }}
                >
                  Cancel the order
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </span>
      {detailed && <span className="text-xs text-muted-foreground">{sync.message}</span>}
    </span>
  );
}
