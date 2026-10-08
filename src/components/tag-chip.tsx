import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { tagTone } from '@/lib/tags';

const TONE_VARIANT = { confirmed: 'default', cancelled: 'destructive', status: 'secondary', other: 'outline' } as const;

/** A Shopify tag. A tag another app added is shown quietly: it says nothing about the order's status. */
export function TagChip({ tag, statusTags, onRemove, disabled }: { tag: string; statusTags: readonly string[]; onRemove?: () => void; disabled?: boolean }) {
  const tone = tagTone(tag, statusTags);
  return (
    <Badge variant={TONE_VARIANT[tone]} className={tone === 'other' ? 'font-normal text-muted-foreground' : ''}>
      {tag}
      {onRemove && (
        <button type="button" className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-black/10 disabled:opacity-50" onClick={onRemove} disabled={disabled} aria-label={`Remove ${tag}`}>
          <X className="size-3" />
        </button>
      )}
    </Badge>
  );
}
