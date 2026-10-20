"use client";

import { type ReactNode } from "react";
import { ArrowDownUp, Loader2, Search } from "lucide-react";
import { todayLocal } from "@/lib/application/travel-time";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import type { useTransportSearch } from "../application/useTransportSearch";
import { TripOptions } from "./TripOptions";

/** "Find your way there": From and To (with the swap), when, travellers, the Search button and its status line. */
export function RouteSearchForm({ tripId, near, searchSlot, t }: {
  tripId: string;
  /** `[lng, lat]` of the trip's area: suggestions as you type are ranked toward it. */
  near?: [number, number];
  /** An alternative way to fill in From/To (e.g. a natural-language ask bar), shown above the form in the same card. */
  searchSlot?: ReactNode;
  t: ReturnType<typeof useTransportSearch>;
}) {
  const { from, setFrom, to, setTo, when, setWhen, returnDate, setReturnDate, travellers, setTravellers, trip, loading, status, toRef, search } = t;
  const field = "h-12 w-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70";
  return (
    <div>
      <h2 className="font-display text-2xl font-medium tracking-[-0.018em]">Find your way there</h2>
      <p className="mt-1 text-sm text-muted-foreground">Any two places. The routes draw on the map.</p>
      {searchSlot && <div className="mt-5">{searchSlot}</div>}
      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void search({ modes: [] });
        }}
      >
        <div className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-2xl bg-surface px-4 py-1 ring-1 ring-border transition-shadow focus-within:bg-card focus-within:ring-2 focus-within:ring-ink/80">
          <span className="grid place-items-center" aria-hidden="true"><span className="size-3 rounded-full bg-coral-fill ring-4 ring-coral-soft" /></span>
          <div className="min-w-0">
            <DestinationCombobox
              tripId={tripId}
              scope="places"
              near={near}
              ariaLabel="From"
              value={from}
              onChange={setFrom}
              onSelect={(text) => {
                setFrom(text);
                // After the dropdown has finished closing: focusing inside its own key handler is undone by it.
                window.setTimeout(() => toRef.current?.focus(), 0);
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
              onChange={setTo}
              onSelect={(text) => {
                setTo(text);
                // Both ends known: no need to press Search.
                if (from.trim()) void search({ to: text });
              }}
              placeholder="To: station, address or place"
              inputClassName={`${field} pr-11`}
            />
          </div>
          <button
            type="button"
            aria-label="Swap start and end"
            onClick={() => { setFrom(to); setTo(from); }}
            className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-ink-soft shadow-soft transition-[transform,color] duration-150 hover:text-foreground active:scale-95"
          >
            <ArrowDownUp className="size-4" aria-hidden="true" />
          </button>
        </div>
        <TripOptions
          when={when}
          onWhen={setWhen}
          travellers={travellers}
          onTravellers={setTravellers}
          returnDate={returnDate}
          onReturnDate={setReturnDate}
          tripDates={trip?.start_date && trip.start_date >= todayLocal() ? { start: trip.start_date, end: trip.end_date } : undefined}
        />
        <button type="submit" disabled={loading} className="btn-primary mt-3 w-full">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {loading ? "Finding routes…" : "Search"}
        </button>
        {status && (
          <p role="status" className="mt-3 text-xs leading-snug text-muted-foreground">
            {status}
          </p>
        )}
      </form>
    </div>
  );
}
