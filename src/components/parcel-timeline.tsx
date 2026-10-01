import { CircleHelp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { type TimelineEntry } from '@/lib/postex';
import { cn } from '@/lib/utils';

/**
 * A parcel's PostEx history, oldest first: each step in words, with the code PostEx sent and the
 * time in Karachi. A code we do not know is shown as PostEx worded it and marked, so a new status
 * is visible rather than hidden or fatal.
 */
export function ParcelTimeline({ entries }: { entries: readonly TimelineEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">PostEx has reported nothing on this parcel yet.</p>;
  return (
    <ol className="relative space-y-4 border-l pl-5" aria-label="PostEx history">
      {entries.map((entry, index) => {
        const latest = index === entries.length - 1;
        return (
          <li key={index} className="relative" data-known={entry.known}>
            <span aria-hidden className={cn('absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background', latest ? 'bg-primary' : 'bg-muted-foreground/50')} />
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{entry.label}</p>
              {!entry.known && (
                <Badge variant="outline" className="gap-1">
                  <CircleHelp className="size-3" />
                  Unknown code
                </Badge>
              )}
              <span className="font-mono text-xs text-muted-foreground">{entry.code || 'no code'}</span>
            </div>
            {entry.reason && <p className="text-sm">{entry.reason}</p>}
            {entry.detail && <p className="text-sm text-muted-foreground">{entry.detail}</p>}
            <p className="text-xs text-muted-foreground">{entry.when}</p>
          </li>
        );
      })}
    </ol>
  );
}
