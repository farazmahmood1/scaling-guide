import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Check, EyeOff, Link2, Unlink } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { type OrderCandidate, type ReviewItem, type StoreKey, apiGet, apiPost } from '@/lib/api';
import { describeItem, formatKarachiTime, formatPaisa } from '@/lib/format';
import { describeStatus } from '@/lib/postex';
import { SEVERITY_TEXT, confidencePercent, duplicateParcels, explainMatch, profileFor } from '@/lib/reconciliation';

const STORE_LABEL: Record<StoreKey, string> = { nur: 'NUR by Juggun', organics: "Juggun's Organics" };
const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

export type Closed = 'resolved' | 'ignored' | 'linked' | 'unlinked';

function Figure({ label, children, warn }: { label: string; children: ReactNode; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={warn ? 'font-medium text-brand-coral tabular-nums' : 'font-medium tabular-nums'}>{children}</p>
    </div>
  );
}

const parcelSearch = (tracking: string) => `/parcels?q=${encodeURIComponent(tracking)}`;

/** What is wrong, shown the way that kind needs: figures, a list, a count of days, a code. */
function Body({ item }: { item: ReviewItem }) {
  const d = item.detail;
  const match = explainMatch(item);
  switch (item.kind) {
    case 'unmatched_shipment':
      return (
        <div className="space-y-1 text-sm">
          <p>
            Reference on the label: {text(d['orderRefNumber']) ? <span className="font-mono">{text(d['orderRefNumber'])}</span> : <em>none</em>}
          </p>
          {match && <MatchNote match={match} />}
        </div>
      );
    case 'match_suggested':
      return match && <MatchNote match={match} />;
    case 'cod_mismatch':
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Figure label="PostEx collects">{formatPaisa(text(d['codPaisa']))}</Figure>
            <Figure label={`Order ${text(d['orderNumber'])} says`}>{formatPaisa(text(d['expectedPaisa']))}</Figure>
            <Figure label="Difference" warn>
              {formatPaisa(text(d['differencePaisa']))}
            </Figure>
          </div>
          {d['zeroCod'] === true && <p className="text-xs text-muted-foreground">Zero COD: a PR package, a gift or a replacement? PR parcels are classified by a person, never assumed.</p>}
        </div>
      );
    case 'possible_duplicate_booking': {
      const parcels = duplicateParcels(d);
      return (
        <div className="text-sm">
          <p>
            {parcels.length} live parcels for <span className="font-medium">{text(d['orderNumber']) || 'one order'}</span>:
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {parcels.map((p) => (
              <li key={p.trackingNumber}>
                {/* Straight to the parcel when its id is known; items opened before ids were kept search instead. */}
                <Link className="rounded border px-2 py-0.5 font-mono text-xs hover:bg-muted" to={p.id ? `/parcels/${p.id}` : parcelSearch(p.trackingNumber)}>
                  {p.trackingNumber}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case 'stuck_in_transit': {
      const code = text(d['statusCode']);
      const status = describeStatus(code || null);
      return (
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm">
          <Figure label="Days without change" warn>
            {text(d['days']) || '—'}
          </Figure>
          <Figure label="Last status">{status.label}</Figure>
          <Figure label="Since">{typeof d['since'] === 'string' ? formatKarachiTime(d['since']) : '—'}</Figure>
        </div>
      );
    }
    case 'postex_unknown_status':
      return (
        <p className="text-sm">
          Code <span className="font-mono">{text(d['code'])}</span>
          {text(d['exampleTrackingNumber']) && (
            <>
              , first seen on{' '}
              <Link className="font-mono text-xs underline underline-offset-2" to={parcelSearch(text(d['exampleTrackingNumber']))}>
                {text(d['exampleTrackingNumber'])}
              </Link>
            </>
          )}
          . One decision covers every parcel that carries it.
        </p>
      );
    default:
      return <p className="text-sm">{describeItem(item)}</p>;
  }
}

function MatchNote({ match }: { match: NonNullable<ReturnType<typeof explainMatch>> }) {
  return (
    <div className="space-y-1">
      <p>{match.headline}</p>
      {match.confidence !== null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Confidence</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full bg-primary" style={{ width: confidencePercent(match.confidence) }} />
          </div>
          <span className="font-medium text-foreground tabular-nums">{confidencePercent(match.confidence)}</span>
        </div>
      )}
      {match.advice && <p className="text-xs text-muted-foreground">{match.advice}</p>}
    </div>
  );
}

/** Find the order for a parcel: the nearby candidates, narrowed by what is typed, or a number straight in. */
function LinkPanel({ item, onLinked }: { item: ReviewItem; onLinked: (orderNumber: string) => void }) {
  const [candidates, setCandidates] = useState<OrderCandidate[]>();
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiGet<{ candidates: OrderCandidate[] }>(`/api/v1/reconciliation/items/${item.id}/candidates`, controller.signal)
      .then((r) => setCandidates(r.candidates))
      .catch(() => {
        if (!controller.signal.aborted) setCandidates([]);
      });
    return () => controller.abort();
  }, [item.id]);

  const wanted = search.trim().toLowerCase().replace(/^#/, '');
  const shown = useMemo(() => {
    // Digits typed may be an order number or the start of an amount in rupees (stored as paisa).
    const digits = wanted.replaceAll(/\D/g, '');
    return (candidates ?? []).filter(
      (c) =>
        !wanted ||
        c.orderNumber.toLowerCase().replace(/^#/, '').includes(wanted) ||
        (c.city ?? '').toLowerCase().includes(wanted) ||
        (digits !== '' && c.totalPaisa.startsWith(digits)),
    );
  }, [candidates, wanted]);
  // Typing a whole number the candidates do not hold sends it to the server, which looks in this store.
  const typedNumber = /^#?\d{1,10}$/.test(search.trim()) ? search.trim() : null;

  const link = async (target: { orderId: string } | { orderNumber: string }) => {
    setSaving(true);
    try {
      const result = await apiPost<{ orderNumber: string }>(`/api/v1/reconciliation/items/${item.id}/link`, { ...target, ...(note.trim() ? { note: note.trim() } : {}) });
      toast.success(`${item.trackingNumber ?? 'Parcel'} linked to ${result.orderNumber}`);
      onLinked(result.orderNumber);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Link failed');
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border bg-muted/40 p-3">
      <Input aria-label="Search orders" placeholder="Search by order number, city or amount" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      {!candidates && <Skeleton className="h-10 w-full" />}
      {candidates && shown.length === 0 && <p className="text-sm text-muted-foreground">{candidates.length === 0 ? 'No nearby orders in this store.' : 'None of the nearby orders match.'}</p>}
      <ul className="flex flex-wrap gap-2">
        {shown.map((c) => (
          <li key={c.id}>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => link({ orderId: c.id })}>
              {c.orderNumber} · {formatPaisa(c.totalPaisa)}
              {c.city ? ` · ${c.city}` : ''} · {formatKarachiTime(c.placedAt)}
            </Button>
          </li>
        ))}
      </ul>
      {typedNumber && !shown.some((c) => c.orderNumber.replace(/^#/, '') === typedNumber.replace(/^#/, '')) && (
        <Button size="sm" disabled={saving} onClick={() => link({ orderNumber: typedNumber })}>
          <Link2 className="size-4" />
          Link to order {typedNumber.startsWith('#') ? typedNumber : `#${typedNumber}`}
        </Button>
      )}
      <Input aria-label="Note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    </div>
  );
}

/**
 * One item of the queue. Its actions are the ones that kind allows, worded for that kind; a
 * resolve or an ignore always needs a note. `onClosed` runs once the server has closed it, and
 * the caller drops the item from the screen without reloading the list.
 */
export function ReviewItemCard({ item, onClosed, canAct = true }: { item: ReviewItem; onClosed: (how: Closed) => void; /** False for a role that may look at the queue but not act on it: no buttons are offered. */ canAct?: boolean }) {
  const profile = profileFor(item.kind);
  const [mode, setMode] = useState<'idle' | 'resolve' | 'ignore' | 'unlink' | 'link'>('idle');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const open = item.status === 'open' && canAct;
  const canLink = open && profile.actions.includes('link') && item.shipmentId !== null;
  const severity = SEVERITY_TEXT[item.severity] ?? SEVERITY_TEXT.info;

  const decide = async (action: 'resolve' | 'ignore' | 'unlink') => {
    const wording = action === 'unlink' ? profile.unlink : profile[action];
    setSaving(true);
    try {
      await apiPost(`/api/v1/reconciliation/items/${item.id}/${action}`, { note: note.trim() });
      toast.success(action === 'unlink' ? 'Unlinked: the parcel is back in Parcels without an order' : (wording?.label ?? 'Saved'));
      onClosed(action === 'resolve' ? 'resolved' : action === 'ignore' ? 'ignored' : 'unlinked');
    } catch (cause) {
      // Kept as it was, with the note still typed, so nothing has to be written again.
      toast.error(cause instanceof Error ? cause.message : 'Could not save');
      setSaving(false);
    }
  };

  const toggle = (next: typeof mode) => {
    setMode(mode === next ? 'idle' : next);
    setNote('');
  };
  const decision = mode === 'unlink' ? (profile.unlink ?? null) : mode === 'resolve' || mode === 'ignore' ? profile[mode] : null;

  return (
    <li className="border-b py-4 last:border-b-0" data-severity={item.severity}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={severity.variant}>{severity.label}</Badge>
            {item.storeKey && <span className="text-xs text-muted-foreground">{STORE_LABEL[item.storeKey]}</span>}
            {item.trackingNumber && (
              <Link className="font-mono text-xs underline-offset-2 hover:underline" to={item.shipmentId ? `/parcels/${item.shipmentId}` : parcelSearch(item.trackingNumber)}>
                {item.trackingNumber}
              </Link>
            )}
            {item.orderNumber && <span className="text-xs">{item.orderNumber}</span>}
          </div>
          <Body item={item} />
          <p className="text-xs text-muted-foreground">
            Opened {formatKarachiTime(item.createdAt)}
            {item.resolvedAt && ` · ${item.status} ${formatKarachiTime(item.resolvedAt)} by ${item.resolvedBy ?? 'the system'}`}
            {item.note && ` · “${item.note}”`}
          </p>
        </div>
        {open && (
          <div className="flex shrink-0 flex-wrap gap-1">
            {canLink && (
              <Button size="sm" variant={mode === 'link' ? 'secondary' : 'default'} onClick={() => toggle('link')}>
                <Link2 className="size-4" />
                Link order
              </Button>
            )}
            {profile.actions.includes('unlink') && profile.unlink && item.shipmentId !== null && (
              <Button size="sm" variant={mode === 'unlink' ? 'secondary' : 'outline'} onClick={() => toggle('unlink')}>
                <Unlink className="size-4" />
                {profile.unlink.label}
              </Button>
            )}
            {profile.actions.includes('resolve') && (
              <Button size="sm" variant={mode === 'resolve' ? 'secondary' : 'outline'} onClick={() => toggle('resolve')}>
                <Check className="size-4" />
                {profile.resolve.label}
              </Button>
            )}
            {profile.actions.includes('ignore') && (
              <Button size="sm" variant={mode === 'ignore' ? 'secondary' : 'ghost'} onClick={() => toggle('ignore')}>
                <EyeOff className="size-4" />
                {profile.ignore.label}
              </Button>
            )}
          </div>
        )}
      </div>

      {decision && (mode === 'resolve' || mode === 'ignore' || mode === 'unlink') && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim() && !saving) void decide(mode);
          }}
        >
          {mode === 'unlink' && (
            <p className="rounded-lg border border-brand-coral/40 bg-brand-coral/5 p-3 text-sm">
              This takes the parcel off {item.orderNumber ?? 'its order'}. The units it carried go back to the warehouse, its sale is reversed, and the parcel returns to
              “Parcels without an order”. The matcher will not offer this order for it again; you can still link one by hand.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-48 flex-1" aria-label="Note" placeholder={`${decision.prompt} (required)`} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            <Button type="submit" size="sm" disabled={saving || !note.trim()}>
              {decision.label}
            </Button>
          </div>
          {decision.chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {decision.chips.map((chip) => (
                <button key={chip} type="button" className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => setNote(chip)}>
                  {chip}
                </button>
              ))}
            </div>
          )}
        </form>
      )}
      {mode === 'link' && <LinkPanel item={item} onLinked={() => onClosed('linked')} />}
    </li>
  );
}
