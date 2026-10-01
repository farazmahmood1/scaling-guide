import { useState } from 'react';
import { PackageCheck, PackageX, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import { type AwaitingReturn, apiPost } from '@/lib/api';

const daysSince = (iso: string | null): string => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
};

/**
 * The returns-not-checked-in alert: PostEx says these parcels are back at the merchant (0006),
 * and nobody has checked them in. Checking one in puts its units back on the shelf, or into
 * damaged, through the stock ledger.
 */
export function ReturnsPage() {
  const { data, error, loading, reload } = useApi<{ returns: AwaitingReturn[] }>('/api/v1/stock/returns-awaiting');
  const [busy, setBusy] = useState<string>();
  const [filter, setFilter] = useState('');

  const checkIn = async (row: AwaitingReturn, outcome: 'restocked' | 'damaged') => {
    setBusy(row.shipmentId);
    try {
      await apiPost(`/api/v1/stock/returns/${row.shipmentId}/check-in`, { outcome });
      toast.success(`${row.trackingNumber} checked in as ${outcome}`);
      reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Check-in failed');
    } finally {
      setBusy(undefined);
    }
  };

  const rows = (data?.returns ?? []).filter((r) => !filter || r.trackingNumber.includes(filter.trim()));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Returns to check in</h1>
          <p className="text-sm text-muted-foreground">
            PostEx has returned these parcels. Until someone checks each one in, its stock counts as returning, not on the shelf.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{data ? `${data.returns.length} waiting` : 'Waiting'}</CardTitle>
            <CardDescription>Oldest first</CardDescription>
          </div>
          <Input className="w-full sm:w-64" placeholder="Scan or type a tracking number" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </CardHeader>
        <CardContent>
          {loading && !data && <Skeleton className="h-24 w-full" />}
          {error && <p className="text-sm text-brand-coral">Could not load returns: {error}</p>}
          {data && rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting. Every returned parcel is checked in.</p>}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tracking number</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Returned</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead className="text-right">Check in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.shipmentId}>
                      <TableCell className="font-mono text-xs">{row.trackingNumber}</TableCell>
                      <TableCell>{row.account}</TableCell>
                      <TableCell>{daysSince(row.returnedAt)} ago</TableCell>
                      <TableCell>{row.orderId ? <Badge variant="secondary">Linked</Badge> : <Badge variant="outline">No order</Badge>}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={busy === row.shipmentId} onClick={() => checkIn(row, 'restocked')}>
                            <PackageCheck className="size-4" />
                            Restock
                          </Button>
                          <Button size="sm" variant="destructive" disabled={busy === row.shipmentId} onClick={() => checkIn(row, 'damaged')}>
                            <PackageX className="size-4" />
                            Damaged
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
