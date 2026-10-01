import { PackageX } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import type { AwaitingReturn } from '@/lib/api';

/**
 * The returns-not-checked-in alert: parcels PostEx has returned that nobody has checked in. Until
 * then their stock counts as returning, not on the shelf, and a damaged one is not written off.
 * Shown wherever parcels are worked; nothing when there is nothing waiting.
 */
export function ReturnsAlert({ waiting: override, onOpen = true }: { waiting?: number; onOpen?: boolean }) {
  const { data } = useApi<{ returns: AwaitingReturn[] }>('/api/v1/stock/returns-awaiting');
  if (!data) return null;
  const waiting = override ?? data.returns.length;
  if (waiting === 0) return null;
  const oldest = data.returns.map((r) => r.returnedAt).filter((d): d is string => d !== null).sort()[0];
  const days = oldest ? Math.floor((Date.now() - Date.parse(oldest)) / 86_400_000) : null;
  return (
    <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-brand-coral/40 bg-brand-coral/5 p-4">
      <PackageX className="size-5 shrink-0 text-brand-coral" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {waiting} returned parcel{waiting === 1 ? '' : 's'} not checked in
        </p>
        <p className="text-sm text-muted-foreground">
          PostEx has brought {waiting === 1 ? 'it' : 'them'} back{days !== null && days > 0 ? `; the oldest ${days} day${days === 1 ? '' : 's'} ago` : ''}. Until someone checks them in, the stock is not on the shelf.
        </p>
      </div>
      {onOpen && (
        <Button asChild size="sm">
          <Link to="/returns">Check in</Link>
        </Button>
      )}
    </div>
  );
}
