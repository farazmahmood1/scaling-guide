import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { PartnerImport } from '@/components/partner-import';
import { VariantPicker } from '@/components/variant-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { type Partner, type PartnerHolding, type PartnerImport as PartnerImportRow, type VariantHit, apiPost } from '@/lib/api';
import { formatKarachiFull, formatPaisa } from '@/lib/format';
import { wholeUnits } from '@/lib/purchasing';

interface TransferLine {
  variant: Pick<VariantHit, 'id' | 'product' | 'variant' | 'sku'>;
  qty: string;
}

/** Goods out to a partner, or back from one. Back cannot exceed what the partner holds; the server checks. */
function TransferForm({ partner, holdings, onDone }: { partner: Partner; holdings: PartnerHolding[]; onDone: () => void }) {
  const [direction, setDirection] = useState<'out' | 'back'>('out');
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const qtys = lines.map((l) => wholeUnits(l.qty));
  const valid = lines.length > 0 && qtys.every((q) => q !== null && q > 0);

  const add = (variant: TransferLine['variant']) => setLines((cur) => (cur.some((l) => l.variant.id === variant.id) ? cur : [...cur, { variant, qty: '' }]));

  const save = async () => {
    setSaving(true);
    try {
      await apiPost('/api/v1/consignment/transfers', {
        partnerId: partner.id,
        direction,
        ...(note.trim() ? { note: note.trim() } : {}),
        lines: lines.map((l, i) => ({ variantId: l.variant.id, qty: qtys[i] })),
      });
      toast.success(direction === 'out' ? `Sent to ${partner.name}` : `Brought back from ${partner.name}`);
      setLines([]);
      setNote('');
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Transfer failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Direction" className="flex gap-1 text-sm">
        {(['out', 'back'] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={direction === d}
            onClick={() => {
              setDirection(d);
              setLines([]);
            }}
            className="rounded-md px-3 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-secondary aria-pressed:font-medium"
          >
            {d === 'out' ? 'Send to partner' : 'Bring back'}
          </button>
        ))}
      </div>
      {direction === 'out' ? (
        <VariantPicker onPick={add} />
      ) : holdings.length === 0 ? (
        <p className="text-sm text-muted-foreground">The partner holds nothing to bring back.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {holdings.map((h) => (
            <Button key={h.variantId} size="sm" variant="outline" onClick={() => add({ id: h.variantId, product: h.title, variant: '', sku: h.sku })}>
              {h.title} ({h.qty})
            </Button>
          ))}
        </div>
      )}
      {lines.map((l, i) => (
        <div key={l.variant.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">
            {l.variant.product}
            {l.variant.variant ? ` · ${l.variant.variant}` : ''}
          </span>
          <Input className="w-24" inputMode="numeric" placeholder="Units" aria-label={`Units of ${l.variant.product}`} value={l.qty} aria-invalid={qtys[i] === null} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
          <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button onClick={save} disabled={!valid || saving}>
        <Plus className="size-4" />
        {direction === 'out' ? 'Record transfer out' : 'Record transfer back'}
      </Button>
    </div>
  );
}

function ImportHistory({ imports, onReversed }: { imports: PartnerImportRow[]; onReversed: () => void }) {
  const [reversing, setReversing] = useState<string>();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const reverse = async (id: string) => {
    setSaving(true);
    try {
      await apiPost(`/api/v1/consignment/imports/${id}/reverse`, { reason: reason.trim() });
      toast.success('Import reversed: the units are back at the partner and the sales undone');
      setReversing(undefined);
      setReason('');
      onReversed();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not reverse');
    } finally {
      setSaving(false);
    }
  };

  if (imports.length === 0) return <p className="text-sm text-muted-foreground">No sales sheet has been imported for this partner yet.</p>;
  return (
    <ul className="divide-y">
      {imports.map((i) => (
        <li key={i.id} className="py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium">{i.fileName}</span> <span className="text-muted-foreground">v{i.version}</span>
              {i.reversedAt ? <Badge variant="destructive" className="ml-2">Reversed</Badge> : i.forced ? <Badge variant="outline" className="ml-2">Valid rows only</Badge> : null}
              <p className="text-xs text-muted-foreground">
                {i.rowsImported} of {i.rowsTotal} rows · {formatPaisa(i.net)} net · {i.importedBy}, {formatKarachiFull(i.importedAt)}
                {i.reversedAt && ` · reversed ${formatKarachiFull(i.reversedAt)}: ${i.reversalReason ?? ''}`}
              </p>
            </div>
            {!i.reversedAt && (
              <Button size="sm" variant="ghost" onClick={() => setReversing(reversing === i.id ? undefined : i.id)}>
                Reverse
              </Button>
            )}
          </div>
          {reversing === i.id && (
            <form
              className="mt-2 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim().length >= 3 && !saving) void reverse(i.id);
              }}
            >
              <Input className="min-w-48 flex-1" aria-label="Reason" placeholder="Why is this import being reversed? (required)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <Button type="submit" size="sm" variant="destructive" disabled={saving || reason.trim().length < 3}>
                Reverse the import
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One partner: what they hold, moving goods to and from them, and their sales sheets. */
export function PartnerDetail({ partner, onChanged }: { partner: Partner; onChanged: () => void }) {
  const stock = useApi<{ stock: PartnerHolding[] }>(`/api/v1/consignment/partners/${partner.id}/stock`);
  const imports = useApi<{ imports: PartnerImportRow[] }>(`/api/v1/consignment/imports?partnerId=${partner.id}`);
  const holdings = stock.data?.stock ?? [];

  const refresh = () => {
    stock.reload();
    imports.reload();
    onChanged();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Holding at {partner.name}</CardTitle>
          <CardDescription>
            {partner.units} units of ours · owes {formatPaisa(partner.receivable)}
            {partner.terms ? ` · ${partner.terms}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stock.loading && !stock.data && <Skeleton className="h-16 w-full" />}
          {stock.error && !stock.data && <p className="text-sm text-brand-coral">Could not load the holdings: {stock.error}</p>}
          {stock.data && holdings.length === 0 && <p className="text-sm text-muted-foreground">Nothing is held here. Send stock to start.</p>}
          {holdings.length > 0 && (
            <table className="w-full text-sm">
              <caption className="sr-only">Units held at the partner</caption>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.variantId} className="border-t first:border-t-0">
                    <td className="py-1.5">
                      {h.title} <span className="font-mono text-xs text-muted-foreground">{h.sku ?? 'no SKU'}</span>
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{h.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Move stock</CardTitle>
          <CardDescription>Goods out to the partner, or back to the warehouse. Recorded with your name.</CardDescription>
        </CardHeader>
        <CardContent>
          <TransferForm partner={partner} holdings={holdings} onDone={refresh} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Sales sheet</CardTitle>
          <CardDescription>The partner's report of what sold. Checked row by row before anything is booked.</CardDescription>
        </CardHeader>
        <CardContent>
          <PartnerImport partnerId={partner.id} onImported={refresh} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Imports</CardTitle>
          <CardDescription>Each import can be reversed as a whole.</CardDescription>
        </CardHeader>
        <CardContent>
          {imports.loading && !imports.data && <Skeleton className="h-12 w-full" />}
          {imports.data && <ImportHistory imports={imports.data.imports} onReversed={refresh} />}
        </CardContent>
      </Card>
    </div>
  );
}
