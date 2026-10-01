import { useEffect, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { karachiLocal } from '@/lib/format';
import type { ListQuery } from '@/lib/list-query';

export interface MultiFilter {
  key: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export interface FilterBarProps {
  query: ListQuery;
  onChange: (change: Partial<ListQuery>, options?: { replace?: boolean }) => void;
  multi?: readonly MultiFilter[];
  /** The date the range filters on, for its label (`Placed`). Omit for no date range. */
  dateLabel?: string;
  searchPlaceholder?: string;
}

const inputClass = 'h-9 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

const addDays = (day: string, days: number) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Ranges people ask for, in Karachi days. */
const presets = (): Array<{ label: string; from: string; to: string }> => {
  const today = karachiLocal(new Date()).slice(0, 10);
  return [
    { label: 'Today', from: today, to: today },
    { label: 'Last 7 days', from: addDays(today, -6), to: today },
    { label: 'Last 30 days', from: addDays(today, -29), to: today },
    { label: 'This month', from: `${today.slice(0, 7)}-01`, to: today },
  ];
};

function MultiSelect({ filter, selected, onChange }: { filter: MultiFilter; selected: string[]; onChange: (values: string[]) => void }) {
  const summary =
    selected.length === 0
      ? 'All'
      : selected.length === 1
        ? (filter.options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9" aria-label={`${filter.label}: ${summary}`}>
          <span className="text-muted-foreground">{filter.label}:</span> {summary}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {filter.options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => onChange(on ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Search, date range and multi-select filters for a list. Every change goes to the URL (the
 * caller's `onChange`), so a filtered view can be shared and survives a reload. Search waits
 * until typing pauses, and replaces the history entry instead of adding one per keystroke.
 */
export function FilterBar({ query, onChange, multi = [], dateLabel, searchPlaceholder = 'Search' }: FilterBarProps) {
  const [search, setSearch] = useState(query.search);
  const [typed, setTyped] = useState(false);

  // Typing settles into the URL after a pause.
  useEffect(() => {
    if (!typed) return;
    const timer = setTimeout(() => {
      onChange({ search }, { replace: true });
      setTyped(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, typed, onChange]);

  // The URL changed some other way (Back, a shared link, "Clear all"): show what it says.
  const [urlSearch, setUrlSearch] = useState(query.search);
  if (!typed && urlSearch !== query.search) {
    setUrlSearch(query.search);
    setSearch(query.search);
  }

  const active = query.search !== '' || query.from !== null || query.to !== null || Object.keys(query.multi).length > 0;

  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={searchPlaceholder}
          className="pl-8"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setTyped(true);
          }}
        />
      </div>
      {dateLabel && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">{dateLabel}</span>
          <input type="date" aria-label={`${dateLabel} from`} className={inputClass} value={query.from ?? ''} max={query.to ?? undefined} onChange={(e) => onChange({ from: e.target.value || null })} />
          <span className="text-muted-foreground">to</span>
          <input type="date" aria-label={`${dateLabel} to`} className={inputClass} value={query.to ?? ''} min={query.from ?? undefined} onChange={(e) => onChange({ to: e.target.value || null })} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9">
                Ranges
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {presets().map((p) => (
                <DropdownMenuItem key={p.label} onSelect={() => onChange({ from: p.from, to: p.to })}>
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {multi.map((f) => (
        <MultiSelect
          key={f.key}
          filter={f}
          selected={query.multi[f.key] ?? []}
          onChange={(values) => {
            const next = { ...query.multi, [f.key]: values };
            if (values.length === 0) delete next[f.key];
            onChange({ multi: next });
          }}
        />
      ))}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => {
            setTyped(false);
            onChange({ search: '', from: null, to: null, multi: {} });
          }}
        >
          <X className="size-4" />
          Clear all
        </Button>
      )}
    </div>
  );
}
