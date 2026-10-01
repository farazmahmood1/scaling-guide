import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

const number = new Intl.NumberFormat('en-PK');

/** Previous and next, with where you are. For a list the server pages: `total` is all of it. */
export function Pager({ page, pageSize, total, loading, onPage }: { page: number; pageSize: number; total: number; loading?: boolean; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground" aria-live="polite">
        {total === 0 ? 'None' : `${number.format(first)}–${number.format(last)} of ${number.format(total)}`}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">
          Page {number.format(page)} of {number.format(pages)}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon-sm" disabled={page >= pages || loading} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
