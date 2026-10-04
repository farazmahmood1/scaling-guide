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

/** Shopify tags typed one per line or separated by commas: trimmed, de-duplicated, at most 30, each at most 80 characters. */
export const parseTags = (text: string): { tags: string[]; error: string | null } => {
  const tags = [...new Set(text.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean))];
  if (tags.length > 30) return { tags, error: 'At most 30 tags' };
  const long = tags.find((t) => t.length > 80);
  return { tags, error: long ? `"${long.slice(0, 20)}…" is longer than 80 characters` : null };
};

export const tagsToText = (tags: readonly string[]): string => tags.join('\n');
