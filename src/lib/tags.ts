/**
 * Shopify order tags as the Confirmations page shows them. The same tag is often spelled with and
 * without its emoji (`✅ Order Confirmed`, `Order Confirmed`), so tags are compared by their words,
 * as the server compares them.
 */

export const tagWords = (tag: string): string =>
  tag
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export const sameTag = (a: string, b: string): boolean => tagWords(a) === tagWords(b);

export const isStatusTag = (tag: string, statusTags: readonly string[]): boolean => statusTags.some((s) => sameTag(s, tag));

/**
 * How a tag reads at a glance: a decision in colour, the rest quiet. `other` is a tag another app
 * added (Loox, Quoli…), which says nothing about where the order stands.
 */
export type TagTone = 'confirmed' | 'cancelled' | 'status' | 'other';

export const tagTone = (tag: string, statusTags: readonly string[]): TagTone => {
  if (!isStatusTag(tag, statusTags)) return 'other';
  const words = tagWords(tag);
  if (words.includes('cancel')) return 'cancelled';
  if (words === 'order confirmed' || words === 'cod confirmed') return 'confirmed';
  return 'status';
};
