import { useEffect, useState } from 'react';
import { Check, EyeOff, Link2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import {
  type ItemStatus,
  type MatchingSetting,
  type OrderCandidate,
  type ReconciliationSummary,
  type ReviewItem,
  type ReviewItemPage,
  type StoreKey,
  apiGet,
  apiPost,
  apiPut,
} from '@/lib/api';
import { describeItem, formatPaisa, kindLabel, parsePrefixes, percent } from '@/lib/format';

const STORE_LABEL: Record<StoreKey, string> = { nur: 'NUR by Juggun', organics: "Juggun's Organics" };
const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';

/** Pick an order for a parcel: suggested candidates, or any order number typed in. */
function LinkPanel({ item, onDone }: { item: ReviewItem; onDone: () => void }) {
  const [candidates, setCandidates] = useState<OrderCandidate[]>();
  const [orderNumber, setOrderNumber] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiGet<{ candidates: OrderCandidate[] }>(`/api/v1/reconciliation/items/${item.id}/candidates`, controller.signal)
      .then((r) => setCandidates(r.candidates))
      .catch(() => setCandidates([]));
    return () => controller.abort();
  }, [item.id]);

  const link = async (target: { orderId: string } | { orderNumber: string }) => {
    setSaving(true);
    try {
      const result = await apiPost<{ orderNumber: string }>(`/api/v1/reconciliation/items/${item.id}/link`, { ...target, ...(note.trim() ? { note: note.trim() } : {}) });
      toast.success(`${item.trackingNumber} linked to ${result.orderNumber}`);
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Link failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">Orders of this store placed around the booking, or with the same number:</p>
      {!candidates && <Skeleton className="h-10 w-full" />}
      {candidates?.length === 0 && <p className="text-sm text-muted-foreground">No nearby orders. Type the order number instead.</p>}
      <div className="flex flex-wrap gap-2">
        {candidates?.map((c) => (
          <Button key={c.id} size="sm" variant="outline" disabled={saving} onClick={() => link({ orderId: c.id })}>
            {c.orderNumber} · {formatPaisa(c.totalPaisa)}
            {c.city ? ` · ${c.city}` : ''} · {new Date(c.placedAt).toLocaleDateString()}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="w-40" placeholder="#1234" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        <Input className="min-w-40 flex-1" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" disabled={saving || !orderNumber.trim()} onClick={() => link({ orderNumber: orderNumber.trim() })}>
          <Link2 className="size-4" />
          Link
        </Button>
      </div>
    </div>
  );
}

function ItemRow({ item, onChanged }: { item: ReviewItem; onChanged: () => void }) {
  const [mode, setMode] = useState<'idle' | 'resolve' | 'ignore' | 'link'>('idle');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const canLink = item.status === 'open' && item.kind === 'unmatched_shipment' && item.shipmentId;

  const decide = async (action: 'resolve' | 'ignore') => {
    setSaving(true);
    try {
      await apiPost(`/api/v1/reconciliation/items/${item.id}/${action}`, { note: note.trim() });
      toast.success(action === 'resolve' ? 'Resolved' : 'Ignored');
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.severity === 'info' ? 'secondary' : 'outline'}>{kindLabel(item.kind)}</Badge>
            {item.storeKey && <span className="text-xs text-muted-foreground">{STORE_LABEL[item.storeKey]}</span>}
            {item.trackingNumber && <span className="font-mono text-xs">{item.trackingNumber}</span>}
            {item.orderNumber && <span className="text-xs">{item.orderNumber}</span>}
          </div>
          <p className="mt-1 text-sm">{describeItem(item)}</p>
          <p className="text-xs text-muted-foreground">
            Opened {new Date(item.createdAt).toLocaleString()}
            {item.resolvedAt && ` · ${item.status} ${new Date(item.resolvedAt).toLocaleString()} by ${item.resolvedBy ?? 'the system'}`}
            {item.note && ` · “${item.note}”`}
          </p>
        </div>
        {item.status === 'open' && (
          <div className="flex shrink-0 gap-1">
            {canLink && (
              <Button size="sm" variant={mode === 'link' ? 'secondary' : 'outline'} onClick={() => setMode(mode === 'link' ? 'idle' : 'link')}>
                <Link2 className="size-4" />
                Link order
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setMode(mode === 'resolve' ? 'idle' : 'resolve')}>
              <Check className="size-4" />
              Resolve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(mode === 'ignore' ? 'idle' : 'ignore')}>
              <EyeOff className="size-4" />
              Ignore
            </Button>
          </div>
        )}
      </div>
      {(mode === 'resolve' || mode === 'ignore') && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            className="min-w-48 flex-1"
            placeholder={mode === 'resolve' ? 'What was done? (required)' : 'Why is this not a problem? (required)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
          <Button size="sm" disabled={saving || !note.trim()} onClick={() => decide(mode)}>
            {mode === 'resolve' ? 'Mark resolved' : 'Ignore for good'}
          </Button>
        </div>
      )}
      {mode === 'link' && <LinkPanel item={item} onDone={onChanged} />}
    </div>
  );
}

/** Match rate per PostEx account and the prefixes seen on parcels, with the setting to accept them. */
function MatchingPanel({ summary, onSaved }: { summary?: ReconciliationSummary; onSaved: () => void }) {
  const setting = useApi<{ matching: MatchingSetting }>('/api/v1/settings/matching');
  // Untouched fields show the saved value; an edit is kept until it is saved.
  const [edits, setEdits] = useState<Partial<Record<StoreKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const saved = setting.data?.matching.refPrefixes;
  const drafts: Record<StoreKey, string> = {
    nur: edits.nur ?? saved?.nur.join(', ') ?? '',
    organics: edits.organics ?? saved?.organics.join(', ') ?? '',
  };

  const parsed = { nur: parsePrefixes(drafts.nur), organics: parsePrefixes(drafts.organics) };
  const save = async () => {
    if (!parsed.nur || !parsed.organics || !setting.data) return;
    setSaving(true);
    try {
      await apiPut('/api/v1/settings/matching', { ...setting.data.matching, refPrefixes: { nur: parsed.nur, organics: parsed.organics } });
      toast.success('Saved. The next PostEx sync re-tries every unmatched parcel.');
      setEdits({});
      setting.reload();
      onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parcel matching</CardTitle>
        <CardDescription>Target: at most 4.6% of parcels without an order.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary?.matching.length === 0 && <p className="text-sm text-muted-foreground">No parcels synced yet.</p>}
        {summary?.matching.map((m) => (
          <div key={m.account} className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">PostEx {m.account}</span>
              <Badge variant={m.withinTarget ? 'secondary' : 'outline'}>{percent(m.unmatchedRate)} unmatched</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {m.matched} of {m.parcels} matched{m.unmatchedWithoutItem > 0 ? ` · ${m.unmatchedWithoutItem} unmatched with no queue item` : ''}
            </p>
            <ul className="text-xs">
              {m.prefixes.slice(0, 6).map((p) => (
                <li key={p.prefix ?? '-'} className="flex justify-between">
                  <span className={p.configured ? '' : 'font-medium text-brand-coral'}>{p.prefix ?? 'no prefix (#1234)'}</span>
                  <span className="text-muted-foreground">
                    {p.parcels} parcels{p.configured ? '' : ' · not accepted yet'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">Prefixes each store's team types on parcels, e.g. NBJ for NBJ-1234:</p>
          {(['nur', 'organics'] as const).map((store) => (
            <label key={store} className="block text-xs">
              {STORE_LABEL[store]}
              <Input
                className="mt-1"
                value={drafts[store]}
                aria-invalid={parsed[store] === null}
                placeholder="none"
                onChange={(e) => setEdits({ ...edits, [store]: e.target.value })}
              />
            </label>
          ))}
          <Button size="sm" onClick={save} disabled={saving || !parsed.nur || !parsed.organics || !setting.data}>
            Save prefixes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The reconciliation queue: everything between Shopify and PostEx that a person must look at.
 * Every decision is recorded with the signed-in user and a note.
 */
export function ReconciliationPage() {
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState<ItemStatus>('open');
  const summary = useApi<ReconciliationSummary>('/api/v1/reconciliation/summary');
  const path = `/api/v1/reconciliation/items?status=${status}${kind ? `&kind=${kind}` : ''}`;
  const first = useApi<ReviewItemPage>(path);
  // Later pages belong to the first page they followed; a reload or a new filter drops them.
  const [later, setLater] = useState<{ after?: ReviewItemPage; pages: ReviewItemPage[] }>({ pages: [] });
  const extra = later.after === first.data ? later.pages : [];
  const nextBefore = (extra.at(-1) ?? first.data)?.nextBefore ?? null;

  const loadMore = async () => {
    if (!nextBefore) return;
    const more = await apiGet<ReviewItemPage>(`${path}&before=${nextBefore}`);
    setLater({ after: first.data, pages: [...extra, more] });
  };

  const refresh = () => {
    first.reload();
    summary.reload();
  };
  const counts = summary.data?.open ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const items = [...(first.data?.items ?? []), ...extra.flatMap((p) => p.items)];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
          <p className="text-sm text-muted-foreground">Parcels, orders and cash that do not agree. Nothing here is guessed away.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={first.loading}>
          <RefreshCw className={first.loading ? 'size-4 animate-spin' : 'size-4'} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
                <option value="">All kinds ({total} open)</option>
                {Object.entries(counts).map(([k, n]) => (
                  <option key={k} value={k}>
                    {kindLabel(k)} ({n})
                  </option>
                ))}
              </select>
              <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)} aria-label="Status">
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="ignored">Ignored</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {first.loading && !first.data && <Skeleton className="h-24 w-full" />}
            {first.error && <p className="text-sm text-brand-coral">Could not load the queue: {first.error}</p>}
            {first.data && items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing {status} here.</p>}
            {items.map((item) => (
              <ItemRow key={item.id} item={item} onChanged={refresh} />
            ))}
            {nextBefore && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={loadMore}>
                Load more
              </Button>
            )}
          </CardContent>
        </Card>

        <MatchingPanel summary={summary.data} onSaved={summary.reload} />
      </div>
    </>
  );
}
