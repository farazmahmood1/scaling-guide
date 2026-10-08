import { useState } from 'react';
import { CircleCheck, RefreshCw } from 'lucide-react';

import { type Closed } from '@/components/review-item';
import { useAuth } from '@/auth/auth-context';
import { ReviewGroup } from '@/components/review-group';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import { type ItemStatus, type MatchingSetting, type ReconciliationSummary, type StoreKey, apiPut } from '@/lib/api';
import { KIND_LABELS, kindLabel, parsePrefixes, percent } from '@/lib/format';
import { dropOne, orderKinds } from '@/lib/reconciliation';
import { toast } from 'sonner';

const STORE_LABEL: Record<StoreKey, string> = { nur: 'NUR by Juggun', organics: "Juggun's Organics" };
const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';

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
 * The reconciliation queue: everything between Shopify and PostEx that a person must look at,
 * grouped by the rule that raised it. Every decision is recorded with the signed-in user and a
 * note. Closing an item removes it from its group and lowers the counts; nothing is re-fetched.
 */
export function ReconciliationPage() {
  const { can } = useAuth();
  // A role that may read the queue but not work it (the accountant) is not offered the buttons.
  const canWork = can('reconciliation.work');
  const [status, setStatus] = useState<ItemStatus>('open');
  const [historyKind, setHistoryKind] = useState('');
  const summary = useApi<ReconciliationSummary>('/api/v1/reconciliation/summary');
  // The open counts as this screen has them: the server's, less what has been closed since.
  const [counts, setCounts] = useState<{ source?: ReconciliationSummary; open: Record<string, number> }>({ open: {} });
  if (summary.data && counts.source !== summary.data) setCounts({ source: summary.data, open: summary.data.open });

  // Bumped when an unlink opens a new "without an order" item, so that one group reads again.
  const [unmatchedReads, setUnmatchedReads] = useState(0);

  const onClosed = (kind: string, how: Closed) => {
    setCounts((c) => ({ ...c, open: dropOne(c.open, kind) }));
    // Linking or unlinking changes the match rate, so the small summary is read again; the
    // lists are not, except the one an unlink just added a parcel to.
    if (how === 'linked' || how === 'unlinked') summary.reload();
    if (how === 'unlinked') setUnmatchedReads((n) => n + 1);
  };

  const kinds = orderKinds(Object.keys(counts.open));
  const total = Object.values(counts.open).reduce((a, b) => a + b, 0);
  const ready = summary.data !== undefined;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
          <p className="text-sm text-muted-foreground">Parcels, orders and cash that do not agree. Nothing here is guessed away.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)} aria-label="Show">
            <option value="open">{ready ? `Open (${total})` : 'Open'}</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
          </select>
          {status !== 'open' && (
            <select className={selectClass} value={historyKind} onChange={(e) => setHistoryKind(e.target.value)} aria-label="Kind">
              <option value="">All kinds</option>
              {Object.keys(KIND_LABELS).map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          )}
          <Button variant="ghost" size="sm" onClick={summary.reload} disabled={summary.loading}>
            <RefreshCw className={summary.loading ? 'size-4 animate-spin' : 'size-4'} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border bg-muted/30 p-4 text-sm">
        <p className="font-medium">What this page is</p>
        <p className="mt-1 text-muted-foreground">
          A to-do list of things the platform cannot decide on its own: a PostEx parcel with no Shopify order, a COD that differs from the order, a product with no cost
          price, and so on. Each group says what it means and what to do. Work an item, then Resolve or Ignore it with a note; every decision is kept with your name.
        </p>
        <p className="mt-2 text-muted-foreground">
          It is not where orders are made. An order made by hand in Shopify (for example for someone who comes to the office) is an ordinary Shopify order: it appears under
          Orders by itself. It only shows here if a PostEx parcel is booked with a number Shopify does not have.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {summary.error && !summary.data && (
            <p role="alert" className="text-sm text-brand-coral">
              Could not load the queue: {summary.error}
            </p>
          )}
          {status !== 'open' && <ReviewGroup key={`${status}:${historyKind}`} kind={historyKind || null} status={status} onClosed={() => {}} canAct={canWork} />}
          {status === 'open' && ready && total === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center" role="status">
              <CircleCheck className="size-10 text-primary" />
              <p className="text-lg font-medium">Everything agrees</p>
              <p className="max-w-sm text-sm text-muted-foreground">Every parcel has its order, every COD matches, and no status is a mystery. There is nothing for a person to look at.</p>
            </div>
          )}
          {status === 'open' &&
            kinds.map((kind) => (
              <ReviewGroup key={kind === 'unmatched_shipment' ? `${kind}:${unmatchedReads}` : kind} kind={kind} status="open" count={counts.open[kind]} onClosed={onClosed} canAct={canWork} />
            ))}
        </div>

        <MatchingPanel summary={summary.data} onSaved={summary.reload} />
      </div>
    </>
  );
}
