import { type ReactNode, useCallback, useMemo } from 'react';
import { Check, GripHorizontal, LayoutDashboard, RotateCcw } from 'lucide-react';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { Button } from '@/components/ui/button';
import type { DashboardLayout } from '@/hooks/use-dashboard-layout';
import { BREAKPOINTS, COLS, type CardId, MARGIN, ROW_HEIGHT, mergeLayouts } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';

/** Customize / Done, and Reset while customizing. */
export function DashboardControls({ layout }: { layout: DashboardLayout }) {
  const { editing, setEditing, reset } = layout;
  return (
    <div className="flex items-center gap-2">
      {editing && (
        <Button size="sm" variant="ghost" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden />
          Reset layout
        </Button>
      )}
      <Button size="sm" variant={editing ? 'default' : 'outline'} aria-pressed={editing} onClick={() => setEditing(!editing)}>
        {editing ? <Check className="size-4" aria-hidden /> : <LayoutDashboard className="size-4" aria-hidden />}
        {editing ? 'Done' : 'Customize'}
      </Button>
    </div>
  );
}

export interface GridCard {
  id: CardId;
  /** What the card is called while it is being moved. */
  label: string;
  node: ReactNode;
}

/**
 * The dashboard's cards on a grid that follows the room the page has: twelve columns when wide,
 * fewer as it narrows, one on a phone. Cards sit still until Customize is pressed (the button is
 * `DashboardControls`, placed by the page); then each can be dragged by its bar and resized by its
 * edges or corner. The arrangement is kept per person on this browser. The grid is measured, not
 * guessed from the window, so it also adapts when the sidebar or the page's width changes.
 */
export function DashboardGrid({ cards, layout: { editing, saved, keep } }: { cards: readonly GridCard[]; layout: DashboardLayout }) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });

  // The cards are rebuilt on every render; what matters here is only which ones there are.
  const key = cards.map((c) => c.id).join(',');
  const ids = useMemo(() => (key ? (key.split(',') as CardId[]) : []), [key]);
  const layouts = useMemo(() => mergeLayouts(saved, ids), [saved, ids]);

  const onLayoutChange = useCallback(
    (_current: unknown, all: unknown) => {
      // Only a person's own drag or resize is kept: the grid also reports the layout it settles on at load.
      if (!editing) return;
      const next = mergeLayouts(all, ids);
      if (JSON.stringify(next) !== JSON.stringify(layouts)) keep(next);
    },
    [editing, ids, layouts, keep],
  );

  return (
    <section aria-label="Dashboard cards">
      {editing && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          Drag a card by its bar to move it; drag an edge or the corner to resize. Changes are saved on this browser.
        </p>
      )}
      {/* Hidden until the page's width is known, so the cards never flash at a guessed size. */}
      <div ref={containerRef} className={cn('dashboard-grid', editing && 'editing')} style={mounted ? undefined : { visibility: 'hidden' }}>
        <Responsive
          width={width}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={layouts}
          rowHeight={ROW_HEIGHT}
          margin={MARGIN}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: editing, handle: '.card-grip' }}
          resizeConfig={{ enabled: editing, handles: ['s', 'e', 'se'] }}
          onLayoutChange={onLayoutChange}
        >
          {cards.map((c) => (
            <div key={c.id} className="h-full [&>*:first-child]:h-full">
              {c.node}
              {editing && (
                // Over the card, so a click while arranging moves nothing it should not; only the bar drags.
                <div className="absolute inset-0 z-20 rounded-xl bg-background/40 ring-2 ring-primary/50">
                  <div className="card-grip flex h-9 cursor-grab touch-none items-center gap-2 rounded-t-xl border-b bg-muted px-3 text-sm font-medium select-none active:cursor-grabbing">
                    <GripHorizontal className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{c.label}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Responsive>
      </div>
    </section>
  );
}
