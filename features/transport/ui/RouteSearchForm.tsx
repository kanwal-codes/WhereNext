"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowDownUp } from "lucide-react";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import type { useTransportSearch } from "../application/useTransportSearch";

/**
 * "Find your way there": From and To (with the swap). There is no Search button: the search runs by itself once both ends are settled.
 * A field is settled when a suggestion is picked, when Enter is pressed, or when you leave it with both ends filled in; the swap settles
 * both at once. Emptying a field clears what was found, since it no longer answers anything. When and who come after, as pills under the results.
 */
export function RouteSearchForm({ tripId, near, searchSlot, t }: {
  tripId: string;
  /** `[lng, lat]` of the trip's area: suggestions as you type are ranked toward it. */
  near?: [number, number];
  /** An alternative way to fill in From/To (e.g. a natural-language ask bar), shown above the form in the same card. */
  searchSlot?: ReactNode;
  t: ReturnType<typeof useTransportSearch>;
}) {
  const { from, setFrom, to, setTo, status, toRef, search, clear, searched, loading } = t;
  const fromRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Bumped whenever a suggestion is picked or the swap is used: a deferred "settle" (Enter, leaving a field) that finds it changed has been overtaken.
  const settled = useRef(0);
  const latest = useRef({ from, to });
  latest.current = { from, to };
  const run = useRef(search);
  run.current = search;

  /** Search if both ends are there. `focusMissing` (Enter) takes the cursor to the empty one instead. */
  const settle = (focusMissing: boolean) => {
    const { from: a, to: b } = latest.current;
    if (a.trim() && b.trim()) void run.current({ modes: [] });
    else if (focusMissing) (a.trim() ? toRef.current : fromRef.current)?.focus();
  };
  const later = (ms: number, focusMissing: boolean) => {
    const mark = settled.current;
    window.setTimeout(() => { if (settled.current === mark) settle(focusMissing); }, ms);
  };
  useEffect(() => () => { settled.current += 1; }, []);

  const empty = (value: string) => {
    if (!value.trim() && (searched || loading)) clear();
  };
  const field = "h-12 w-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70";
  return (
    <div>
      <h2 className="font-display text-2xl font-medium tracking-[-0.018em]">Find your way there</h2>
      <p className="mt-1 text-sm text-ink-soft">Any two places. The routes draw on the map.</p>
      {searchSlot && <div className="mt-5">{searchSlot}</div>}
      <form
        ref={formRef}
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          settle(true);
        }}
        // Two text fields and no submit button: the browser will not submit on Enter by itself, and the suggestion list swallows the key when it has rows.
        // So the key is watched here; a suggestion pick (which bumps `settled`) takes precedence, otherwise what was typed is what is searched.
        onKeyDownCapture={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) later(0, true);
        }}
        // Leaving the form with both ends filled is "done typing". Tapping a suggestion blurs the input first, hence the wait: the pick lands inside it.
        onBlur={(e) => {
          if (e.relatedTarget instanceof Node && formRef.current?.contains(e.relatedTarget)) return;
          later(250, false);
        }}
      >
        <div className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-2xl bg-surface px-4 py-1 ring-1 ring-border transition-shadow focus-within:bg-card focus-within:ring-2 focus-within:ring-ink/80">
          <span className="grid place-items-center" aria-hidden="true"><span className="size-3 rounded-full bg-coral-fill ring-4 ring-coral-soft" /></span>
          <div className="min-w-0">
            <DestinationCombobox
              tripId={tripId}
              scope="places"
              near={near}
              inputRef={fromRef}
              ariaLabel="From"
              value={from}
              onChange={(v) => { setFrom(v); empty(v); }}
              onSelect={(text) => {
                settled.current += 1;
                setFrom(text);
                if (to.trim()) void search({ from: text, modes: [] });
                // After the dropdown has finished closing: focusing inside its own key handler is undone by it.
                else window.setTimeout(() => toRef.current?.focus(), 0);
              }}
              placeholder="From: station, address or place"
              inputClassName={`${field} pr-11`}
            />
          </div>
          <span aria-hidden="true" className="col-span-2 ml-[0.7rem] h-px bg-border" style={{ marginRight: "3rem" }} />
          <span className="grid place-items-center" aria-hidden="true"><span className="size-3 rounded-[3px] bg-primary" /></span>
          <div className="min-w-0">
            <DestinationCombobox
              tripId={tripId}
              scope="places"
              near={near}
              inputRef={toRef}
              ariaLabel="To"
              value={to}
              onChange={(v) => { setTo(v); empty(v); }}
              onSelect={(text) => {
                settled.current += 1;
                setTo(text);
                // Both ends known: no need for a button. If From is still empty, that is where the cursor goes.
                if (from.trim()) void search({ to: text, modes: [] });
                else window.setTimeout(() => fromRef.current?.focus(), 0);
              }}
              placeholder="To: station, address or place"
              inputClassName={`${field} pr-11`}
            />
          </div>
          <button
            type="button"
            aria-label="Swap start and end"
            onClick={() => {
              settled.current += 1;
              const a = to;
              const b = from;
              setFrom(a);
              setTo(b);
              if (a.trim() && b.trim()) void search({ from: a, to: b, modes: [] });
            }}
            className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-ink-soft shadow-soft transition-[transform,color] duration-150 hover:text-foreground active:scale-[0.97]"
          >
            <ArrowDownUp className="size-4" aria-hidden="true" />
          </button>
        </div>
        {status && (
          <p role="status" className="mt-3 text-xs leading-snug text-muted-foreground">
            {status}
          </p>
        )}
      </form>
    </div>
  );
}
