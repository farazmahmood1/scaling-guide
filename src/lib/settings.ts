import { parseRupees } from '@/lib/format';

/**
 * Reading and checking what a person types into a settings form. The server validates every one of
 * these again and is the authority; these exist so a form can say what is wrong, in words, before
 * anything is sent, and so a save is only offered when the server would accept it.
 */

/** A whole number in `[min, max]` typed in a box; null if it is not one. */
export const wholeNumber = (text: string, min: number, max: number): number | null => {
  const t = text.trim();
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
};

/** A decimal in `[min, max]` (a percentage, say); null if it is not one. */
export const decimalNumber = (text: string, min: number, max: number): number | null => {
  const t = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
};

/** Rupees typed in a box as whole paisa, for a setting the API holds as a number of paisa; null if not an amount in range. */
export const rupeesToPaisaNumber = (text: string, maxPaisa: number): number | null => {
  const paisa = parseRupees(text);
  if (paisa === null || paisa.startsWith('-')) return null;
  const n = Number(paisa);
  return Number.isSafeInteger(n) && n <= maxPaisa ? n : null;
};

/** Minutes between desk retries, typed as `60, 180`: one to five values, each 5 minutes to a day. */
export const parseRetryMinutes = (text: string): number[] | null => {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 5) return null;
  const minutes = parts.map((p) => wholeNumber(p, 5, 24 * 60));
  return minutes.every((m): m is number => m !== null) ? minutes : null;
};

/** Shopify tags typed one per line or separated by commas: trimmed, de-duplicated, at most 30, each at most 80 characters. */
export const parseTags = (text: string): { tags: string[]; error: string | null } => {
  const tags = [...new Set(text.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean))];
  if (tags.length > 30) return { tags, error: 'At most 30 tags' };
  const long = tags.find((t) => t.length > 80);
  return { tags, error: long ? `"${long.slice(0, 20)}…" is longer than 80 characters` : null };
};

export const tagsToText = (tags: readonly string[]): string => tags.join('\n');

/** The desk's hours as the server wants them: `HH:MM`, 24-hour, opening before closing. */
export const deskHoursError = (open: string, close: string): string | null => {
  const ok = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  if (!ok(open) || !ok(close)) return 'Give both times as HH:MM';
  return open < close ? null : 'The desk must open before it closes';
};

// ---- WhatsApp templates ----

/** The placeholders a template may use, and what each is replaced with (the server's `TEMPLATE_FIELDS`). */
export const TEMPLATE_FIELDS = [
  { name: 'firstName', hint: "The customer's first name" },
  { name: 'name', hint: "The customer's full name" },
  { name: 'orderNumber', hint: 'The order number, e.g. #1042' },
  { name: 'total', hint: 'The order total, e.g. Rs 2,750' },
  { name: 'items', hint: 'What was ordered' },
  { name: 'city', hint: 'The delivery city' },
  { name: 'store', hint: 'The brand the order is from' },
] as const;

const FIELD_NAMES: readonly string[] = TEMPLATE_FIELDS.map((f) => f.name);

/** The `{placeholders}` in a template that are not fields; the server refuses a template that has any. */
export const unknownPlaceholders = (template: string): string[] => [...new Set([...template.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!))].filter((f) => !FIELD_NAMES.includes(f));

/** Obviously made-up values, so the preview shows the shape of a message and never anyone's real details. */
export const SAMPLE_VALUES: Record<(typeof TEMPLATE_FIELDS)[number]['name'], string> = {
  firstName: 'Sample',
  name: 'Sample Customer',
  orderNumber: '#1042',
  total: 'Rs 2,750',
  items: '2 × Sample product',
  city: 'Sampletown',
  store: 'NUR by Juggun',
};

/** The message as an agent's customer would read it, with a placeholder the server does not know left as typed. */
export const previewTemplate = (template: string): string =>
  template.replace(/\{([^{}]*)\}/g, (match, field: string) => (Object.hasOwn(SAMPLE_VALUES, field) ? SAMPLE_VALUES[field as keyof typeof SAMPLE_VALUES] : match));

/** Why a template cannot be saved, or null. */
export const templateError = (template: string): string | null => {
  const t = template.trim();
  if (t.length === 0) return 'The message cannot be empty';
  if (t.length > 1000) return 'At most 1000 characters';
  const unknown = unknownPlaceholders(t);
  return unknown.length > 0 ? `Unknown placeholder${unknown.length === 1 ? '' : 's'}: ${unknown.map((f) => `{${f}}`).join(', ')}` : null;
};
