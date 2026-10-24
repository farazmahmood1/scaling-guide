import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { type ReturnsReconciliation, type ReturnsReconciliationRow, type StoreKey, apiPost } from '@/lib/api';
import { formatPaisa } from '@/lib/format';
import { returnStageText } from '@/lib/returns';

const TONE = { error: 'destructive', warning: 'outline', info: 'secondary' } as const;

/** Shopify's side of one order, in a few words. */
const shopifyText = (s: NonNullable<ReturnsReconciliationRow['shopify']>): string => {
  const parts: string[] = [];
  parts.push(s.cancelled ? 'cancelled' : `open, ${s.fulfillmentStatus ?? 'unfulfilled'}`);
  if (s.unitsRestocked > 0) parts.push(`${s.unitsRestocked} restocked`);
  if (s.unitsReturned > 0) parts.push(`${s.unitsReturned} returned`);
  if (s.refundedPaisa !== '0') parts.push(`${formatPaisa(s.refundedPaisa)} refunded`);
  for (const r of s.returns) parts.push(`return ${r.name ?? ''} ${r.status.toLowerCase()}`.replace('  ', ' '));
  return parts.join(' · ');
};

const checkInText = (row: ReturnsReconciliationRow): string =>
  row.checkIn ? ({ restocked: 'Restocked', damaged: 'Damaged', mixed: 'Split' } as const)[row.checkIn] : row.stage === 'returning' || row.stage === 'returned' ? 'Not yet' : '—';

/**
 * Returns as each source records them, side by side: PostEx (did the parcel come back), the
 * warehouse (was it checked in, and how), Shopify (cancelled, refunded, returned, restocked), and
 * what does not agree. Re-sync reads the order from Shopify and the parcel from PostEx again with
 * the syncs' own keyed upserts, so it can bring a record in line but never duplicate or delete one.
 */
export function ReturnsCheck({ store, canWork }: { store: StoreKey | null; canWork: boolean }) {
  const [all, setAll] = useState(false);
  const query = new URLSearchParams({ ...(store ? { store } : {}), ...(all ? { all: 'true' } : {}) });
  const { data, error, loading, reload } = useApi<ReturnsReconciliation>(`/api/v1/reconciliation/returns?${query}`);
  const [busy, setBusy] = useState<string | null>(null);

  const resync = async (row: ReturnsReconciliationRow) => {
    const key = `${row.orderId}:${row.shipmentId}`;
    setBusy(key);
    try {
      const result = await apiPost<{ order: 'stored' | 'missing' | null; parcel: 'stored' | 'missing' | null }>('/api/v1/reconciliation/returns/resync', {
        ...(row.orderId ? { orderId: row.orderId } : {}),
        ...(row.shipmentId ? { shipmentId: row.shipmentId } : {}),
      });
      const said = [result.order === 'missing' ? 'Shopify no longer has the order (kept here, and queued)' : result.order ? 'order re-read from Shopify' : null, result.parcel === 'missing' ? 'PostEx did not return the parcel' : result.parcel ? 'parcel re-read from PostEx' : null].filter(Boolean);
      toast.success(`${row.orderNumber ?? row.trackingNumber}: ${said.join('; ')}`);
      reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Re-sync failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Returns: PostEx, warehouse and Shopify</CardTitle>
          <CardDescription className="max-w-3xl">
            A PostEx return (a refused parcel coming back), a check-in at the warehouse, and a cancellation, refund or return in Shopify are different records of related events. A refused COD
            parcel is normally only in PostEx, since nobody paid. This lists where they disagree, and what settles it.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={all ? 'outline' : 'secondary'} onClick={() => setAll(false)} aria-pressed={!all}>
            Needs attention{data && !all ? ` (${data.counts['withIssues'] ?? 0})` : ''}
          </Button>
          <Button size="sm" variant={all ? 'secondary' : 'outline'} onClick={() => setAll(true)} aria-pressed={all}>
            All returns
          </Button>
          <Button size="sm" variant="ghost" onClick={reload} disabled={loading} aria-label="Read the returns check again">
            <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && !data && <p role="alert" className="text-sm text-brand-coral">Could not load the returns check: {error}</p>}
        {data && data.rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{all ? 'No returns recorded anywhere yet.' : 'PostEx, the warehouse and Shopify agree on every return.'}</p>}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Returns as PostEx, the warehouse and Shopify record them</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Order / parcel</th>
                  <th className="py-2 pr-3 font-medium">PostEx</th>
                  <th className="py-2 pr-3 font-medium">Warehouse</th>
                  <th className="py-2 pr-3 font-medium">Shopify</th>
                  <th className="py-2 pr-3 font-medium">What disagrees</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const key = `${row.orderId}:${row.shipmentId}`;
                  return (
                    <tr key={key} className="border-t align-top">
                      <td className="py-2 pr-3">
                        {row.orderId ? <Link className="underline underline-offset-4" to={`/orders/${row.orderId}`}>{row.orderNumber}</Link> : <span className="text-muted-foreground">No order</span>}
                        {row.shipmentId && (
                          <Link className="block font-mono text-xs underline-offset-4 hover:underline" to={`/parcels/${row.shipmentId}`}>
                            {row.trackingNumber}
                          </Link>
                        )}
                      </td>
                      <td className="py-2 pr-3">{row.stage ? (row.stage === 'returning' || row.stage === 'returned' ? returnStageText(row.stage) : row.stage.replace('_', ' ')) : 'No parcel here'}</td>
                      <td className="py-2 pr-3">{checkInText(row)}</td>
                      <td className="py-2 pr-3">{row.shopify ? shopifyText(row.shopify) : '—'}</td>
                      <td className="py-2 pr-3">
                        {row.issues.length === 0 ? (
                          <span className="text-muted-foreground">Agrees</span>
                        ) : (
                          <ul className="space-y-1">
                            {row.issues.map((issue) => (
                              <li key={issue.kind} className="flex items-start gap-2">
                                <Badge variant={TONE[issue.severity]}>{issue.severity === 'info' ? 'Note' : issue.severity === 'error' ? 'Wrong' : 'Check'}</Badge>
                                <span>{issue.text}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {canWork && (
                          <Button size="sm" variant="ghost" disabled={busy === key} onClick={() => void resync(row)} aria-label={`Re-sync ${row.orderNumber ?? row.trackingNumber}`}>
                            <RefreshCw className={busy === key ? 'size-3.5 animate-spin' : 'size-3.5'} />
                            Re-sync
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
