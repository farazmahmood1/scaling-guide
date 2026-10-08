import { type ReactNode, useId, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormSkeleton } from '@/components/skeletons';
import { useApi } from '@/hooks/use-api';
import { type AlertSettings, type ConfirmationTagSettings, type PurchasingSettings, apiPut } from '@/lib/api';
import { paisaToInput } from '@/lib/format';
import { decimalNumber, parseTags, rupeesToPaisaNumber, tagsToText, wholeNumber } from '@/lib/settings';

/**
 * Loads one setting, and holds the form for it. The form is only drawn once the saved value is in,
 * and is re-seeded from the server after every save, so what is on screen is always what is stored.
 */
function useSetting<T>(path: string, key: string) {
  const { data, error, loading, reload } = useApi<Record<string, T>>(path);
  const save = async (value: T) => {
    try {
      await apiPut(path, value);
      toast.success('Saved');
      reload();
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save');
      return false;
    }
  };
  return { saved: data?.[key], error, loading, save };
}

function Loading({ error, loading, hasData, fields, columns = 3, multiline }: { error?: string; loading: boolean; hasData: boolean; /** The form's shape while it loads. */ fields: number; columns?: 2 | 3; multiline?: boolean }) {
  if (error && !hasData) return <p role="alert" className="text-sm text-brand-coral">Could not load this setting: {error}</p>;
  if (loading && !hasData) return <FormSkeleton fields={fields} columns={columns} multiline={multiline} />;
  return null;
}

/** A labelled input with its explanation and, when the value is wrong, what is wrong, tied to the input for screen readers. */
function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (props: { id: string; 'aria-describedby': string; 'aria-invalid': boolean }) => ReactNode }) {
  const id = useId();
  const describedBy = `${id}-note`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': !!error })}
      <p id={describedBy} className={error ? 'text-xs text-brand-coral' : 'text-xs text-muted-foreground'} role={error ? 'alert' : undefined}>
        {error ?? hint}
      </p>
    </div>
  );
}

function SaveBar({ dirty, valid, saving, onSave, onDiscard }: { dirty: boolean; valid: boolean; saving: boolean; onSave: () => void; onDiscard: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <Button onClick={onSave} disabled={!dirty || !valid || saving}>
        <Save className="size-4" />
        {saving ? 'Saving…' : 'Save'}
      </Button>
      <Button variant="ghost" onClick={onDiscard} disabled={!dirty || saving}>
        <RotateCcw className="size-4" />
        Discard changes
      </Button>
      {dirty && <Badge variant="outline">Unsaved changes</Badge>}
    </div>
  );
}

// ---- Alert thresholds ----

function AlertsEditor({ saved, onSave }: { saved: AlertSettings; onSave: (v: AlertSettings) => Promise<boolean> }) {
  const seed = () => ({ stuck: String(saved.stuckDays), hours: String(saved.confirmedNotBookedHours), lookback: String(saved.confirmedLookbackDays) });
  const [draft, setDraft] = useState(seed);
  const [saving, setSaving] = useState(false);
  const stuckDays = wholeNumber(draft.stuck, 1, 90);
  const hours = wholeNumber(draft.hours, 1, 720);
  const lookback = wholeNumber(draft.lookback, 1, 180);
  const valid = stuckDays !== null && hours !== null && lookback !== null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(seed());
  const set = (k: keyof typeof draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Stuck in transit after (days)" hint="A parcel with no status change for this long is flagged." error={stuckDays === null ? 'A whole number of days, 1 to 90' : null}>
          {(p) => <Input {...p} inputMode="numeric" value={draft.stuck} onChange={set('stuck')} />}
        </Field>
        <Field label="Confirmed, not booked after (hours)" hint="A confirmed order with no parcel booked by then is flagged." error={hours === null ? 'A whole number of hours, 1 to 720' : null}>
          {(p) => <Input {...p} inputMode="numeric" value={draft.hours} onChange={set('hours')} />}
        </Field>
        <Field label="Only chase orders confirmed within (days)" hint="Older confirmed orders are history, not a missed booking." error={lookback === null ? 'A whole number of days, 1 to 180' : null}>
          {(p) => <Input {...p} inputMode="numeric" value={draft.lookback} onChange={set('lookback')} />}
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">The reconciliation scan runs hourly and reads these each time, so a change applies at the next scan.</p>
      <SaveBar
        dirty={dirty}
        valid={valid}
        saving={saving}
        onDiscard={() => setDraft(seed())}
        onSave={async () => {
          if (!valid) return;
          setSaving(true);
          await onSave({ stuckDays, confirmedNotBookedHours: hours, confirmedLookbackDays: lookback });
          setSaving(false);
        }}
      />
    </div>
  );
}

export function AlertsForm() {
  const { saved, error, loading, save } = useSetting<AlertSettings>('/api/v1/settings/alerts', 'alerts');
  return (
    <>
      <Loading fields={3} error={error} loading={loading} hasData={!!saved} />
      {saved && <AlertsEditor key={JSON.stringify(saved)} saved={saved} onSave={save} />}
    </>
  );
}

// ---- Purchasing and reorder levels ----

const MAX_TOLERANCE_PAISA = 100_000_000;

function PurchasingEditor({ saved, onSave }: { saved: PurchasingSettings; onSave: (v: PurchasingSettings) => Promise<boolean> }) {
  const seed = () => ({
    percent: String(saved.tolerancePercent),
    amount: paisaToInput(String(saved.toleranceAbsolutePaisa)),
    window: String(saved.velocityWindowDays),
    cover: String(saved.coverDays),
    lead: String(saved.defaultLeadTimeDays),
  });
  const [draft, setDraft] = useState(seed);
  const [saving, setSaving] = useState(false);
  const percent = decimalNumber(draft.percent, 0, 50);
  const amount = rupeesToPaisaNumber(draft.amount, MAX_TOLERANCE_PAISA);
  const window = wholeNumber(draft.window, 7, 365);
  const cover = wholeNumber(draft.cover, 0, 365);
  const lead = wholeNumber(draft.lead, 0, 365);
  const valid = percent !== null && amount !== null && window !== null && cover !== null && lead !== null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(seed());
  const set = (k: keyof typeof draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <div className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">When to reorder</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sales measured over (days)" hint="Delivered units over this window set how fast something sells." error={window === null ? 'A whole number of days, 7 to 365' : null}>
            {(p) => <Input {...p} inputMode="numeric" value={draft.window} onChange={set('window')} />}
          </Field>
          <Field label="Cover to order for (days)" hint="How many days of sales an order should last after it arrives." error={cover === null ? 'A whole number of days, 0 to 365' : null}>
            {(p) => <Input {...p} inputMode="numeric" value={draft.cover} onChange={set('cover')} />}
          </Field>
          <Field label="Lead time when a vendor has none (days)" hint="How long goods take to arrive." error={lead === null ? 'A whole number of days, 0 to 365' : null}>
            {(p) => <Input {...p} inputMode="numeric" value={draft.lead} onChange={set('lead')} />}
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">How closely a vendor's bill must match</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Allowed difference (%)" hint="A bill may exceed what was received by this share of its value…" error={percent === null ? 'A percentage from 0 to 50, up to two decimals' : null}>
            {(p) => <Input {...p} inputMode="decimal" value={draft.percent} onChange={set('percent')} />}
          </Field>
          <Field label="…or by this amount (Rs)" hint="Whichever is larger is allowed. Above it, the bill is refused." error={amount === null ? 'An amount in rupees, up to Rs 1,000,000' : null}>
            {(p) => <Input {...p} inputMode="decimal" value={draft.amount} onChange={set('amount')} />}
          </Field>
        </div>
      </fieldset>
      <SaveBar
        dirty={dirty}
        valid={valid}
        saving={saving}
        onDiscard={() => setDraft(seed())}
        onSave={async () => {
          if (!valid) return;
          setSaving(true);
          await onSave({ tolerancePercent: percent, toleranceAbsolutePaisa: amount, velocityWindowDays: window, coverDays: cover, defaultLeadTimeDays: lead });
          setSaving(false);
        }}
      />
    </div>
  );
}

export function PurchasingForm() {
  const { saved, error, loading, save } = useSetting<PurchasingSettings>('/api/v1/settings/purchasing', 'purchasing');
  return (
    <>
      <Loading fields={5} error={error} loading={loading} hasData={!!saved} />
      {saved && <PurchasingEditor key={JSON.stringify(saved)} saved={saved} onSave={save} />}
    </>
  );
}

// ---- Confirmation tags ----

const TAG_FIELDS = [
  { key: 'confirmed', label: 'Means confirmed' },
  { key: 'cancelled', label: 'Means cancelled' },
  { key: 'pending', label: 'Means still to contact' },
  { key: 'noAnswer', label: 'Means no answer' },
  { key: 'unreachable', label: 'Means unreachable' },
] as const;

function TagsEditor({ saved, onSave }: { saved: ConfirmationTagSettings; onSave: (v: ConfirmationTagSettings) => Promise<boolean> }) {
  const seed = () => Object.fromEntries(TAG_FIELDS.map((f) => [f.key, tagsToText(saved[f.key])])) as Record<(typeof TAG_FIELDS)[number]['key'], string>;
  const [draft, setDraft] = useState(seed);
  const [saving, setSaving] = useState(false);
  const parsed = Object.fromEntries(TAG_FIELDS.map((f) => [f.key, parseTags(draft[f.key])])) as Record<(typeof TAG_FIELDS)[number]['key'], ReturnType<typeof parseTags>>;
  const valid = TAG_FIELDS.every((f) => parsed[f.key].error === null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(seed());

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {TAG_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint="One Shopify tag per line." error={parsed[f.key].error}>
            {(p) => <textarea {...p} rows={3} className="w-full rounded-lg border bg-background p-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-brand-coral" value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />}
          </Field>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">The team's own tags on Shopify orders that show the platform what was agreed on the phone. After a change, run <span className="font-mono">npm run orders:states</span> so existing orders are read again.</p>
      <SaveBar
        dirty={dirty}
        valid={valid}
        saving={saving}
        onDiscard={() => setDraft(seed())}
        onSave={async () => {
          if (!valid) return;
          setSaving(true);
          await onSave(Object.fromEntries(TAG_FIELDS.map((f) => [f.key, parsed[f.key].tags])) as unknown as ConfirmationTagSettings);
          setSaving(false);
        }}
      />
    </div>
  );
}

export function TagsForm() {
  const { saved, error, loading, save } = useSetting<ConfirmationTagSettings>('/api/v1/settings/confirmation-tags', 'confirmationTags');
  return (
    <>
      <Loading fields={5} columns={2} multiline error={error} loading={loading} hasData={!!saved} />
      {saved && <TagsEditor key={JSON.stringify(saved)} saved={saved} onSave={save} />}
    </>
  );
}

/**
 * Whether checking a return in also updates Shopify: an open order is cancelled with its items
 * restocked, a fulfilled one has the units added back. Saved at once; on unless switched off.
 */
export function ShopifyWritebackForm() {
  const { saved, error, loading, save } = useSetting<{ returnsWriteback: boolean }>('/api/v1/settings/shopify', 'shopify');
  const [saving, setSaving] = useState(false);
  const toggle = async (next: boolean) => {
    setSaving(true);
    await save({ returnsWriteback: next });
    setSaving(false);
  };
  return (
    <>
      <Loading fields={1} columns={2} error={error} loading={loading} hasData={!!saved} />
      {saved && (
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5 size-4" checked={saved.returnsWriteback} disabled={saving} onChange={(e) => void toggle(e.target.checked)} />
            <span>
              <span className="font-medium">Update Shopify when a return is checked in</span>
              <span className="block text-muted-foreground">
                Restocked: an order still open in Shopify is cancelled with its items restocked (no refund, no email to the customer); a fulfilled one gets the units back on
                available. Damaged: an open order is cancelled and the units are taken off as damaged.
              </span>
            </span>
          </label>
          <p className="text-muted-foreground">
            Shopify accepts these only once the store's app has the write_orders and write_inventory permissions; until then each check-in is kept with Shopify's reason and
            can be retried from the Returns page.
          </p>
        </div>
      )}
    </>
  );
}
