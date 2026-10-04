import { useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

import { useBrand } from '@/brand/brand-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TableSkeleton, num } from '@/components/skeletons';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import { type BreakdownRow, type Influencer, type StoreKey, type UnassignedCode, apiDelete, apiPatch, apiPost } from '@/lib/api';
import { formatKarachiTime, formatPaisa } from '@/lib/format';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const STORE_LABELS: Record<StoreKey, string> = { nur: 'NUR', organics: 'Organics' };

const failed = (cause: unknown, fallback: string) => toast.error(cause instanceof Error ? cause.message : fallback);

/** Revenue and profit by influencer, from the same ledger lines as the P&L. */
function PerformanceCard({ version }: { version: number }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { brand: store } = useBrand();
  const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(store ? { store } : {}), v: String(version) }).toString();
  const { data, error, loading } = useApi<{ rows: BreakdownRow[] }>(`/api/v1/reports/breakdowns/influencer?${query}`);
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-end justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Sales by influencer</CardTitle>
          <CardDescription>Delivered parcels only, net of returns. Rows add up to the P&amp;L for the same period.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span className="text-muted-foreground">to</span>
          <input type="date" className={selectClass} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data && <TableSkeleton variant="ui" label="Loading the influencers' results" columns={['Influencer', num('Parcels'), num('Revenue'), num('Goods'), num('PostEx'), num('Profit')]} />}
        {error && <p className="text-sm text-brand-coral">{error}</p>}
        {data && data.rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing posted in this period.</p>}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Influencer</TableHead>
                  <TableHead className="text-right">Parcels</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Goods</TableHead>
                  <TableHead className="text-right">PostEx</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.key} className={row.key.startsWith('influencer:') ? '' : 'text-muted-foreground'}>
                    <TableCell className={row.key.startsWith('influencer:') ? 'font-medium' : ''}>{row.label}</TableCell>
                    <TableCell className="text-right">{row.parcels}</TableCell>
                    <TableCell className="text-right">{formatPaisa(row.revenue)}</TableCell>
                    <TableCell className="text-right">{formatPaisa(row.goods)}</TableCell>
                    <TableCell className="text-right">{formatPaisa(row.postexCharges)}</TableCell>
                    <TableCell className="text-right">{formatPaisa(row.profit)}</TableCell>
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

function AddCode({ influencer, onDone }: { influencer: Influencer; onDone: () => void }) {
  const [store, setStore] = useState<StoreKey>('nur');
  const [code, setCode] = useState('');
  const add = async () => {
    if (!code.trim()) return;
    try {
      const result = await apiPost<{ orders: number }>(`/api/v1/influencers/${influencer.id}/codes`, { store, code: code.trim() });
      toast.success(`${code.trim()} is ${influencer.name}'s on ${STORE_LABELS[store]}: ${result.orders} order${result.orders === 1 ? '' : 's'} so far`);
      setCode('');
      onDone();
    } catch (cause) {
      failed(cause, 'Could not add the code');
    }
  };
  return (
    <div className="flex items-center gap-1">
      <select className={`${selectClass} h-7 text-xs`} value={store} onChange={(e) => setStore(e.target.value as StoreKey)} aria-label="Brand">
        <option value="nur">NUR</option>
        <option value="organics">Organics</option>
      </select>
      <Input className="h-7 w-28 text-xs" placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <Button size="icon-sm" variant="outline" onClick={add} aria-label="Add code">
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

function NewInfluencer({ onDone }: { onDone: () => void }) {
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [followers, setFollowers] = useState('');
  const create = async () => {
    if (!handle.trim() || !name.trim()) {
      toast.error('A handle and a name are needed');
      return;
    }
    try {
      await apiPost('/api/v1/influencers', {
        handle: handle.trim(),
        name: name.trim(),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(followers.trim() ? { followers: Number(followers.replaceAll(',', '')) } : {}),
      });
      toast.success(`${name.trim()} added`);
      setHandle('');
      setName('');
      setCity('');
      setFollowers('');
      onDone();
    } catch (cause) {
      failed(cause, 'Could not add the influencer');
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="w-40" placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
      <Input className="w-44" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input className="w-32" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
      <Input className="w-28" placeholder="Followers" inputMode="numeric" value={followers} onChange={(e) => setFollowers(e.target.value)} />
      <Button onClick={create}>
        <Plus className="size-4" />
        Add influencer
      </Button>
    </div>
  );
}

/**
 * Influencers and their discount codes. The influencer breakdown credits an order to whoever owns
 * the code used at checkout, so a code assigned here re-attributes every earlier order with it.
 */
export function InfluencersPage() {
  const list = useApi<{ influencers: Influencer[] }>('/api/v1/influencers');
  const unassigned = useApi<{ codes: UnassignedCode[] }>('/api/v1/influencers/unassigned-codes');
  const [version, setVersion] = useState(0);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});

  const refresh = () => {
    list.reload();
    unassigned.reload();
    setVersion((v) => v + 1);
  };

  const removeCode = async (influencer: Influencer, codeId: string, code: string) => {
    if (!window.confirm(`Remove ${code} from ${influencer.name}? Orders with it will no longer count as theirs.`)) return;
    try {
      await apiDelete(`/api/v1/influencers/${influencer.id}/codes/${codeId}`);
      toast.success(`${code} removed`);
      refresh();
    } catch (cause) {
      failed(cause, 'Could not remove the code');
    }
  };

  const setActive = async (influencer: Influencer, isActive: boolean) => {
    try {
      await apiPatch(`/api/v1/influencers/${influencer.id}`, { isActive });
      refresh();
    } catch (cause) {
      failed(cause, 'Could not update');
    }
  };

  const assign = async (code: UnassignedCode) => {
    const influencerId = assignTo[`${code.store}:${code.code}`];
    if (!influencerId) return;
    try {
      await apiPost(`/api/v1/influencers/${influencerId}/codes`, { store: code.store, code: code.code });
      toast.success(`${code.code} assigned: ${code.orders} order${code.orders === 1 ? '' : 's'} now count as theirs`);
      refresh();
    } catch (cause) {
      failed(cause, 'Could not assign the code');
    }
  };

  const influencers = list.data?.influencers ?? [];
  const active = influencers.filter((i) => i.isActive);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Influencers</h1>
          <p className="text-sm text-muted-foreground">Who promotes the brands, the discount codes that are theirs, and what those codes sell.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={list.loading}>
          <RefreshCw className={list.loading ? 'size-4 animate-spin' : 'size-4'} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{list.data ? `${influencers.length} influencer${influencers.length === 1 ? '' : 's'}` : 'Influencers'}</CardTitle>
            <CardDescription>A code belongs to one influencer per brand, however customers type it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <NewInfluencer onDone={refresh} />
            {list.loading && !list.data && (
              <TableSkeleton
                variant="ui"
                label="Loading the influencers"
                columns={[{ header: 'Influencer', sub: true }, 'City', num('Followers'), { header: 'Codes', as: 'badge' }, { header: 'Add a code', as: 'control' }, { header: 'Active', align: 'right', as: 'badge' }]}
              />
            )}
            {list.error && <p className="text-sm text-brand-coral">{list.error}</p>}
            {influencers.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Influencer</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead className="text-right">Followers</TableHead>
                      <TableHead>Codes</TableHead>
                      <TableHead>Add a code</TableHead>
                      <TableHead className="text-right">Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {influencers.map((influencer) => (
                      <TableRow key={influencer.id} className={influencer.isActive ? '' : 'text-muted-foreground'}>
                        <TableCell>
                          <div className="font-medium">{influencer.name}</div>
                          <div className="text-xs text-muted-foreground">@{influencer.handle}</div>
                        </TableCell>
                        <TableCell>{influencer.city ?? '—'}</TableCell>
                        <TableCell className="text-right">{influencer.followers?.toLocaleString('en-PK') ?? '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {influencer.codes.length === 0 && <span className="text-xs text-muted-foreground">No codes yet</span>}
                            {influencer.codes.map((c) => (
                              <Badge key={c.id} variant="outline" className="gap-1">
                                {STORE_LABELS[c.store]} {c.code} · {c.orders}
                                <button type="button" onClick={() => removeCode(influencer, c.id, c.code)} aria-label={`Remove ${c.code}`}>
                                  <X className="size-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <AddCode influencer={influencer} onDone={refresh} />
                        </TableCell>
                        <TableCell className="text-right">
                          <input type="checkbox" checked={influencer.isActive} onChange={(e) => setActive(influencer, e.target.checked)} aria-label="Active" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Codes customers used that nobody owns</CardTitle>
            <CardDescription>Most used first. Assign an influencer's code here; a sitewide code can stay unassigned.</CardDescription>
          </CardHeader>
          <CardContent>
            {unassigned.loading && !unassigned.data && <TableSkeleton variant="ui" rows={4} label="Loading the codes" columns={['Code', 'Brand', num('Orders'), 'Last used', { header: 'Assign to', as: 'control' }]} />}
            {unassigned.data && unassigned.data.codes.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Every code used at checkout has an owner.</p>}
            {unassigned.data && unassigned.data.codes.length > 0 && (
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead>Last used</TableHead>
                      <TableHead>Assign to</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unassigned.data.codes.map((code) => {
                      const key = `${code.store}:${code.code}`;
                      return (
                        <TableRow key={key}>
                          <TableCell className="font-mono text-xs">{code.code}</TableCell>
                          <TableCell>{STORE_LABELS[code.store]}</TableCell>
                          <TableCell className="text-right">{code.orders}</TableCell>
                          <TableCell className="text-xs">{formatKarachiTime(code.lastUsedAt)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <select
                                className={`${selectClass} h-7 text-xs`}
                                value={assignTo[key] ?? ''}
                                onChange={(e) => setAssignTo({ ...assignTo, [key]: e.target.value })}
                                aria-label={`Assign ${code.code}`}
                              >
                                <option value="">Choose…</option>
                                {active.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.name}
                                  </option>
                                ))}
                              </select>
                              <Button size="sm" variant="outline" disabled={!assignTo[key]} onClick={() => assign(code)}>
                                Assign
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <PerformanceCard version={version} />
      </div>
    </>
  );
}
