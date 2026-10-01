import { useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, MessageCircle, Phone, RefreshCw, Save, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/auth/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/use-api';
import {
  type AgentPerformance,
  type AttemptOutcome,
  type Channel,
  type ConfirmationState,
  type CustomerHistory,
  type DeskAlert,
  type DeskOrder,
  type DeskSettings,
  type QueuePage,
  type StoreKey,
  apiPost,
  apiPut,
} from '@/lib/api';
import {
  CONFIRMATION_LABELS,
  OUTCOME_LABELS,
  describeItem,
  formatKarachiTime,
  formatPaisa,
  fromNow,
  karachiLocal,
  karachiToIso,
  kindLabel,
  percent,
} from '@/lib/format';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const STORE_LABELS: Record<StoreKey, string> = { nur: 'NUR', organics: 'Organics' };

/** What the queue's state filter offers; the first is the working queue. */
const VIEWS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'pending,no_answer', label: 'To contact' },
  { value: 'unreachable', label: 'Unreachable' },
  { value: 'confirmed,changed', label: 'Confirmed, not booked' },
  { value: 'cancelled', label: 'Cancelled' },
];

const stateBadge = (state: ConfirmationState) => {
  const variant = state === 'confirmed' || state === 'changed' ? 'default' : state === 'cancelled' || state === 'unreachable' ? 'destructive' : state === 'no_answer' ? 'outline' : 'secondary';
  return <Badge variant={variant}>{CONFIRMATION_LABELS[state] ?? state}</Badge>;
};

const rate = (value: number | null) => (value === null ? '—' : percent(value));

// ---- Alerts ----

function AlertsCard() {
  const { data, error } = useApi<{ alerts: DeskAlert[] }>('/api/v1/confirmations/alerts');
  if (error) return <p className="mb-4 text-sm text-brand-coral">Could not load alerts: {error}</p>;
  if (!data || data.alerts.length === 0) return null;
  return (
    <Card className="mb-6 border-brand-coral/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-brand-coral" />
          {data.alerts.length === 1 ? '1 order needs attention' : `${data.alerts.length} orders need attention`}
        </CardTitle>
        <CardDescription>Raised hourly. Each clears by itself once the order is booked, or the parcel is cancelled in PostEx.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {data.alerts.map((alert) => (
            <li key={alert.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={alert.severity === 'error' ? 'destructive' : 'outline'}>{kindLabel(alert.kind)}</Badge>
              {alert.store && <span className="text-xs text-muted-foreground">{STORE_LABELS[alert.store]}</span>}
              <span>{describeItem(alert)}</span>
              <span className="text-xs text-muted-foreground">since {formatKarachiTime(alert.openedAt)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---- One order ----

function HistoryCard({ history }: { history: CustomerHistory | null }) {
  if (!history) return <p className="text-sm text-muted-foreground">No usable mobile number, so no history to show.</p>;
  const { counts, city } = history;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="text-lg font-semibold">{counts.delivered}</div>
          <div className="text-xs text-muted-foreground">delivered</div>
        </div>
        <div className={`rounded-lg p-2 ${counts.refused > 0 ? 'bg-brand-coral/10' : 'bg-muted/50'}`}>
          <div className={`text-lg font-semibold ${counts.refused > 0 ? 'text-brand-coral' : ''}`}>{counts.refused}</div>
          <div className="text-xs text-muted-foreground">refused or returned</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="text-lg font-semibold">{counts.cancelled}</div>
          <div className="text-xs text-muted-foreground">cancelled</div>
        </div>
      </div>
      <p className="text-muted-foreground">
        {counts.orders === 0 ? 'First order from this number, on either brand.' : `${counts.orders} earlier order${counts.orders === 1 ? '' : 's'} on both brands; delivery rate ${rate(history.deliveryRate)}.`}
        {city && ` Parcels to ${city.name} come back ${rate(city.returnRate)} of the time (${city.returned} of ${city.delivered + city.returned}).`}
      </p>
      {history.orders.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
          {history.orders.slice(0, 20).map((o) => (
            <li key={o.orderId} className="flex justify-between gap-2">
              <span>
                {STORE_LABELS[o.store]} {o.orderNumber} · {formatKarachiTime(o.placedAt)}
              </span>
              <span className="text-muted-foreground">
                {formatPaisa(o.totalPaisa)} · {(o.state ?? '—').replaceAll('_', ' ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DECISIONS: ReadonlyArray<{ outcome: Exclude<AttemptOutcome, 'rescheduled'>; label: string; needs?: 'reason' | 'time'; variant: 'default' | 'outline' | 'destructive' }> = [
  { outcome: 'confirmed', label: 'Confirmed', variant: 'default' },
  { outcome: 'changed', label: 'Confirmed with changes', needs: 'reason', variant: 'outline' },
  { outcome: 'no_answer', label: 'No answer', variant: 'outline' },
  { outcome: 'callback', label: 'Call back at…', needs: 'time', variant: 'outline' },
  { outcome: 'wrong_number', label: 'Wrong number', variant: 'outline' },
  { outcome: 'cancelled', label: 'Cancelled', needs: 'reason', variant: 'destructive' },
];

function OrderPanel({ orderId, onClose, onRecorded }: { orderId: string; onClose: () => void; onRecorded: () => void }) {
  const { data, error, loading, reload } = useApi<{ order: DeskOrder; history: CustomerHistory | null }>(`/api/v1/confirmations/orders/${orderId}`);
  // The server withholds the number from a role that may not see it; this makes the screen say so
  // instead of showing "No number", and shows nothing a number would have filled.
  const { can } = useAuth();
  const seesPhones = can('pii.phone');
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [when, setWhen] = useState(() => karachiLocal(new Date(Date.now() + 2 * 3_600_000)));
  const [busy, setBusy] = useState(false);

  const record = async (outcome: AttemptOutcome, needs?: 'reason' | 'time') => {
    if (needs === 'reason' && !reason.trim()) {
      toast.error(outcome === 'cancelled' ? 'Say why the customer cancelled' : 'Say what the customer changed');
      return;
    }
    const at = needs === 'time' || outcome === 'rescheduled' ? karachiToIso(when) : null;
    if ((needs === 'time' || outcome === 'rescheduled') && !at) {
      toast.error('Pick a date and time');
      return;
    }
    setBusy(true);
    try {
      if (outcome === 'rescheduled') {
        await apiPost(`/api/v1/confirmations/orders/${orderId}/follow-up`, { at, ...(note.trim() ? { note } : {}) });
      } else {
        await apiPost(`/api/v1/confirmations/orders/${orderId}/attempts`, {
          channel,
          outcome,
          ...(reason.trim() && needs === 'reason' ? { reason } : {}),
          ...(note.trim() ? { note } : {}),
          ...(at ? { followUpAt: at } : {}),
        });
      }
      toast.success(`${data?.order.orderNumber ?? 'Order'}: ${OUTCOME_LABELS[outcome]}`);
      setReason('');
      setNote('');
      reload();
      onRecorded();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record it');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Skeleton className="h-96 w-full" />;
  if (error || !data) return <p className="text-sm text-brand-coral">Could not load the order: {error}</p>;
  const { order, history } = data;
  const decided = order.confirmation && ['confirmed', 'changed', 'cancelled'].includes(order.confirmation.state);
  const open = !order.cancelledInShopify;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>
              {order.orderNumber} <span className="text-sm font-normal text-muted-foreground">{STORE_LABELS[order.store]}</span>
            </CardTitle>
            <CardDescription>
              {formatPaisa(order.totalPaisa)} cash on delivery · placed {formatKarachiTime(order.placedAt)}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1 text-sm">
          <div className="font-medium">{order.customerName ?? 'Customer'}</div>
          <div className="text-muted-foreground">
            {seesPhones ? (order.phone ?? 'No number') : 'Phone number hidden for your role'} · {order.city ?? 'No city'}
          </div>
          <ul className="pt-1 text-xs text-muted-foreground">
            {order.lines.map((line, i) => (
              <li key={i}>
                {line.qty} × {line.title} · {formatPaisa(line.totalPaisa)}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {order.confirmation && stateBadge(order.confirmation.state)}
            {order.confirmation?.source === 'shopify_tags' && <Badge variant="outline">from Shopify tags</Badge>}
            {order.booked && <Badge variant="secondary">Booked with PostEx</Badge>}
            {order.cancelledInShopify && <Badge variant="destructive">Cancelled in Shopify</Badge>}
            {order.confirmation?.nextAttemptAt && <span className="text-xs text-muted-foreground">next try {fromNow(order.confirmation.nextAttemptAt)}</span>}
          </div>
        </div>

        {!seesPhones ? (
          <p className="text-sm text-muted-foreground">Your role cannot see customers' phone numbers, so there is no way to contact them from here.</p>
        ) : order.whatsappUrl && order.callUrl ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-[#1fa855] text-white hover:bg-[#1a9049]">
              <a href={order.whatsappUrl} target="_blank" rel="noreferrer" onClick={() => setChannel('whatsapp')}>
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={order.callUrl} onClick={() => setChannel('call')}>
                <Phone className="size-4" />
                Call
              </a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No usable mobile number on this order: confirm it another way, or record it as a wrong number.</p>
        )}

        {open && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Contacted by</span>
              {(['whatsapp', 'call'] as const).map((c) => (
                <Button key={c} size="sm" variant={channel === c ? 'secondary' : 'ghost'} onClick={() => setChannel(c)}>
                  {c === 'whatsapp' ? 'WhatsApp' : 'Call'}
                </Button>
              ))}
            </div>
            <Input placeholder="Reason or change (needed to cancel or change)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Time (Karachi)</span>
              <input type="datetime-local" className={selectClass} value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {DECISIONS.filter((d) => !decided || ['confirmed', 'changed', 'cancelled'].includes(d.outcome))
                .filter((d) => !order.booked || d.outcome === 'changed' || d.outcome === 'cancelled')
                .map((d) => (
                  <Button key={d.outcome} size="sm" variant={d.variant} disabled={busy} onClick={() => record(d.outcome, d.needs)}>
                    {d.label}
                  </Button>
                ))}
              {!decided && !order.booked && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => record('rescheduled')}>
                  <CalendarClock className="size-4" />
                  Follow up at the time
                </Button>
              )}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-medium">Customer history, both brands</h3>
          <HistoryCard history={history} />
        </div>

        {order.attempts.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Attempts</h3>
            <ul className="space-y-2 text-xs">
              {order.attempts.map((a) => (
                <li key={a.id} className="border-l-2 pl-2">
                  <div>
                    <span className="font-medium">{OUTCOME_LABELS[a.outcome]}</span>
                    {a.channel && <span className="text-muted-foreground"> · {a.channel === 'whatsapp' ? 'WhatsApp' : 'call'}</span>}
                    <span className="text-muted-foreground">
                      {' '}
                      · {a.agent} · {formatKarachiTime(a.at)}
                    </span>
                  </div>
                  {a.followUpAt && <div className="text-muted-foreground">for {formatKarachiTime(a.followUpAt)}</div>}
                  {a.reason && <div>{a.reason}</div>}
                  {a.note && <div className="text-muted-foreground">{a.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Queue ----

function QueueTab() {
  const [view, setView] = useState(VIEWS[0]!.value);
  const [store, setStore] = useState<'' | StoreKey>('');
  const [dueOnly, setDueOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string>();
  const pageSize = 25;
  const query = new URLSearchParams({
    state: view,
    due: dueOnly ? 'now' : 'all',
    page: String(page),
    pageSize: String(pageSize),
    ...(store ? { store } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  }).toString();
  const { data, error, loading, reload } = useApi<QueuePage>(`/api/v1/confirmations/queue?${query}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  /** A filter change starts again from the first page. */
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="min-w-0">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{data ? `${data.total} order${data.total === 1 ? '' : 's'}` : 'Orders'}</CardTitle>
              <CardDescription>Due first. A retry after no answer waits for its time, inside desk hours.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
              Refresh
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className={selectClass} value={view} onChange={(e) => filter(setView)(e.target.value)} aria-label="Show">
              {VIEWS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
            <select className={selectClass} value={store} onChange={(e) => filter(setStore)(e.target.value as '' | StoreKey)} aria-label="Brand">
              <option value="">Both brands</option>
              <option value="nur">NUR by Juggun</option>
              <option value="organics">Juggun&apos;s Organics</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={dueOnly} onChange={(e) => filter(setDueOnly)(e.target.checked)} />
              Due now
            </label>
            <Input className="w-full sm:w-56" placeholder="Order number or phone" value={search} onChange={(e) => filter(setSearch)(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading && !data && <Skeleton className="h-40 w-full" />}
          {error && <p className="text-sm text-brand-coral">Could not load the queue: {error}</p>}
          {data && data.rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing here. Every order in this view is done.</p>}
          {data && data.rows.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">COD</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Next</TableHead>
                      <TableHead>History</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow
                        key={row.orderId}
                        className={`cursor-pointer ${selected === row.orderId ? 'bg-muted' : ''}`}
                        onClick={() => setSelected(row.orderId)}
                      >
                        <TableCell>
                          <div className="font-medium">{row.orderNumber}</div>
                          <div className="text-xs text-muted-foreground">
                            {STORE_LABELS[row.store]} · {fromNow(row.placedAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{row.customerName ?? '—'}</div>
                          <div className="max-w-56 truncate text-xs text-muted-foreground" title={row.items}>
                            {row.city ?? 'No city'} · {row.items}
                          </div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatPaisa(row.totalPaisa)}</TableCell>
                        <TableCell>
                          {stateBadge(row.state)}
                          {row.attempts > 0 && <div className="pt-1 text-xs text-muted-foreground">{row.attempts} attempt{row.attempts === 1 ? '' : 's'}</div>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {row.nextAttemptAt ? (row.due ? <Badge variant="secondary">Due</Badge> : fromNow(row.nextAttemptAt)) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          <span title="Delivered">✓ {row.history.delivered}</span>{' '}
                          <span title="Refused or returned" className={row.history.returned > 0 ? 'font-semibold text-brand-coral' : 'text-muted-foreground'}>
                            ↩ {row.history.returned}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 text-sm">
                <span className="text-muted-foreground">
                  Page {page} of {pages}
                </span>
                <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div className="min-w-0">
        {selected ? (
          // Keyed by order, so a half-typed reason never carries over to the next customer.
          <OrderPanel key={selected} orderId={selected} onClose={() => setSelected(undefined)} onRecorded={reload} />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">Pick an order to contact the customer and record what they said.</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---- Agents ----

function AgentsTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const { data, error, loading } = useApi<{ agents: AgentPerformance[] }>(`/api/v1/confirmations/agents?${query}`);
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-end justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Agent performance</CardTitle>
          <CardDescription>Attempts in the period. Returned is what happened to the parcels of the orders each agent confirmed.</CardDescription>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span className="text-muted-foreground">to</span>
          <input type="date" className={selectClass} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data && <Skeleton className="h-24 w-full" />}
        {error && <p className="text-sm text-brand-coral">{error}</p>}
        {data && data.agents.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No attempts in this period.</p>}
        {data && data.agents.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Contacts</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                  <TableHead className="text-right">Cancelled</TableHead>
                  <TableHead className="text-right">No answer</TableHead>
                  <TableHead className="text-right">Unreachable</TableHead>
                  <TableHead className="text-right">Confirmation rate</TableHead>
                  <TableHead className="text-right">First contact</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.agents.map((a) => (
                  <TableRow key={a.agentId}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-right">{a.contacts}</TableCell>
                    <TableCell className="text-right">{a.ordersWorked}</TableCell>
                    <TableCell className="text-right">{a.confirmed + a.changed}</TableCell>
                    <TableCell className="text-right">{a.cancelled}</TableCell>
                    <TableCell className="text-right">{a.noAnswer}</TableCell>
                    <TableCell className="text-right">{a.unreachable}</TableCell>
                    <TableCell className="text-right">{rate(a.confirmationRate)}</TableCell>
                    <TableCell className="text-right">{a.medianMinutesToFirstContact === null ? '—' : `${a.medianMinutesToFirstContact} min`}</TableCell>
                    <TableCell className="text-right">
                      {rate(a.outcomes.returnRate)}
                      <span className="text-xs text-muted-foreground"> ({a.outcomes.returned}/{a.outcomes.delivered + a.outcomes.returned})</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Settings ----

const PLACEHOLDERS = ['{firstName}', '{name}', '{orderNumber}', '{total}', '{items}', '{city}', '{store}'];

function SettingsTab() {
  const { data, error, reload } = useApi<{ confirmationDesk: DeskSettings }>('/api/v1/settings/confirmation-desk');
  if (error) return <p className="text-sm text-brand-coral">{error}</p>;
  if (!data) return <Skeleton className="h-64 w-full" />;
  return <SettingsForm key={JSON.stringify(data.confirmationDesk)} saved={data.confirmationDesk} onSaved={reload} />;
}

function SettingsForm({ saved, onSaved }: { saved: DeskSettings; onSaved: () => void }) {
  const [draft, setDraft] = useState<DeskSettings>(saved);
  const [retry, setRetry] = useState(saved.retryMinutes.join(', '));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const retryMinutes = retry.split(/[\s,]+/).filter(Boolean).map(Number);
    if (retryMinutes.length === 0 || retryMinutes.some((m) => !Number.isInteger(m) || m < 5)) {
      toast.error('Retry delays are whole minutes, 5 or more, separated by commas');
      return;
    }
    setSaving(true);
    try {
      await apiPut('/api/v1/settings/confirmation-desk', { ...draft, retryMinutes });
      toast.success('Desk settings saved');
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
        <CardTitle>Desk settings</CardTitle>
        <CardDescription>How often an unanswered customer is tried again, when the desk works, and what the WhatsApp message says.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            Unreachable after
            <Input
              type="number"
              min={1}
              max={10}
              className="w-20"
              value={draft.maxAttempts}
              onChange={(e) => setDraft({ ...draft, maxAttempts: Number(e.target.value) })}
            />
            unanswered attempts
          </label>
          <label className="flex items-center gap-2">
            Retry after (minutes)
            <Input className="w-32" value={retry} onChange={(e) => setRetry(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            Desk hours (Karachi)
            <input type="time" className={selectClass} value={draft.deskHours.open} onChange={(e) => setDraft({ ...draft, deskHours: { ...draft.deskHours, open: e.target.value } })} />
            –
            <input type="time" className={selectClass} value={draft.deskHours.close} onChange={(e) => setDraft({ ...draft, deskHours: { ...draft.deskHours, close: e.target.value } })} />
          </label>
        </div>
        {(['nur', 'organics'] as const).map((store) => (
          <div key={store} className="space-y-1">
            <div className="font-medium">WhatsApp message, {store === 'nur' ? 'NUR by Juggun' : "Juggun's Organics"}</div>
            <textarea
              className="min-h-24 w-full rounded-lg border bg-background p-2 text-sm"
              value={draft.whatsappTemplates[store]}
              maxLength={1000}
              onChange={(e) => setDraft({ ...draft, whatsappTemplates: { ...draft.whatsappTemplates, [store]: e.target.value } })}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Placeholders: {PLACEHOLDERS.join(' ')}. Anything else in braces is refused.</p>
        <Button onClick={save} disabled={saving}>
          <Save className="size-4" />
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The Confirmation Desk (Step 11): agents work the queue, open an order, message or call the
 * customer from it, and record what happened. The history card shows how this number's earlier
 * parcels went, on both brands, and how often parcels to the city come back.
 */
export function ConfirmationsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Confirmation Desk</h1>
        <p className="text-sm text-muted-foreground">
          Confirm every cash-on-delivery order before it is booked. No answer is retried automatically; after the last try the order is unreachable.
        </p>
      </div>
      <AlertsCard />
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>
        <TabsContent value="agents">
          <AgentsTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
