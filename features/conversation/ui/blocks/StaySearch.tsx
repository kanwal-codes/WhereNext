"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, MapPin, Minus, Plus, Users } from "lucide-react";
import { LoadingNote, SEARCH_NOTES } from "@/components/LoadingNote";
import { SkeletonCard } from "@/components/Skeleton";
import { cn } from "@/lib/utils";
import { toStayCardItem } from "@/lib/application/stay-items";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { StayOption } from "@/packages/contracts/stay";
import { DayControl, ISO, PlaceField, SearchSweep, daysBetween, shiftIso, tomorrowIso } from "./SearchBarParts";
import { prettyDate } from "./ui";

type StaysBlock = Extract<AssistantBlock, { type: "stays" }>;
export type StayItems = StaysBlock["items"];
export type StaysStatus = "ready" | "loading" | "error" | "empty";

export type StayQuery = { location: string; checkin: string; checkout: string; adults: number };

/**
 * The stays card's own search. It starts from the hotels the chat found and, when the traveller changes the place, the
 * days or the number of guests, asks again: a skeleton while it loads, then the new hotels. A newer change cancels an
 * older one still in flight, so the cards never show anything but what the bar says.
 */
export function useStaySearch(block: StaysBlock, tripId: string) {
  const [query, setQuery] = useState<StayQuery>(() => ({ location: block.location, checkin: block.checkin, checkout: block.checkout, adults: block.adults ?? 2 }));
  const [items, setItems] = useState<StayItems>(block.items);
  const [nights, setNights] = useState(block.nights);
  const [assumed, setAssumed] = useState(() => /^example dates/i.test(block.dateNote ?? ""));
  const [status, setStatus] = useState<StaysStatus>("ready");
  const [searched, setSearched] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(query);
  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async (next: StayQuery) => {
    if (!next.location.trim() || !ISO.test(next.checkin) || !ISO.test(next.checkout)) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    latest.current = next;
    setQuery(next);
    setStatus("loading");
    try {
      const qs = new URLSearchParams({ location: next.location, checkin: next.checkin, checkout: next.checkout, adults: String(next.adults) });
      const res = await fetch(`/api/trips/${tripId}/stays?${qs}`, { signal: request.signal });
      const body = (await res.json().catch(() => ({}))) as { options?: StayOption[]; nights?: number; assumedDates?: boolean; checkin?: string; checkout?: string; location?: string };
      if (request.signal.aborted) return;
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const found = (body.options ?? []).map((o) => toStayCardItem(o));
      setQuery({ location: body.location ?? next.location, checkin: body.checkin ?? next.checkin, checkout: body.checkout ?? next.checkout, adults: next.adults });
      setItems(found);
      setNights(body.nights ?? Math.max(1, daysBetween(next.checkin, next.checkout)));
      setAssumed(Boolean(body.assumedDates));
      setSearched(true);
      setStatus(found.length === 0 ? "empty" : "ready");
    } catch {
      if (!request.signal.aborted) setStatus("error");
    } finally {
      if (controller.current === request) controller.current = null;
    }
  }, [tripId]);

  const q = () => latest.current;
  return {
    query, items, nights, assumed, status, searched,
    retry: () => void run(q()),
    setLocation: (location: string) => void run({ ...q(), location }),
    // Moving the check-in carries the check-out with it, so the stay keeps its length.
    setCheckin: (day: string) => {
      const cur = q();
      void run({ ...cur, checkin: day, checkout: shiftIso(day, Math.max(1, daysBetween(cur.checkin, cur.checkout))) });
    },
    setCheckout: (day: string) => void run({ ...q(), checkout: day }),
    setAdults: (adults: number) => void run({ ...q(), adults: Math.max(1, Math.min(24, adults)) }),
    setBoth: (checkin: string, checkout: string) => void run({ ...q(), checkin, checkout }),
  };
}

export type StaySearchView = {
  query: StayQuery;
  nights: number;
  status: StaysStatus;
  setLocation: (location: string) => void;
  setCheckin: (day: string) => void;
  setCheckout: (day: string) => void;
  setAdults: (adults: number) => void;
  setBoth: (checkin: string, checkout: string) => void;
};

/** A small count with a step either way. */
function Counter({ value, min, max, onChange, noun, disabled }: { value: number; min: number; max: number; onChange: (n: number) => void; noun: string; disabled: boolean }) {
  const btn = "grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-background/60">
      <button type="button" aria-label={`Fewer ${noun}s`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)} className={btn}><Minus className="size-4" aria-hidden /></button>
      <span className="inline-flex min-w-[5.5rem] items-center justify-center gap-1.5 text-sm font-medium tabular-nums" aria-live="polite">
        <Users className="size-4 text-coral" aria-hidden />
        {value} {noun}{value === 1 ? "" : "s"}
      </span>
      <button type="button" aria-label={`More ${noun}s`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} className={btn}><Plus className="size-4" aria-hidden /></button>
    </div>
  );
}

/** Where, which days, and for how many: everything that decides which hotels and prices are shown. */
export function StaySearchBar({ search, tripId, trip, defaultOpen = false }: { search: StaySearchView; tripId: string; trip: { start?: string | null; end?: string | null }; /** Open the form straight away (the dates were a guess, so the traveller should set them). */ defaultOpen?: boolean }) {
  const { query, status } = search;
  const busy = status === "loading";
  // At rest the search is one quiet line (where, when, who); the form opens when it is needed, so it never outweighs the hotels beneath it.
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-soft transition-[border-color,box-shadow] hover:border-foreground/25 hover:shadow-lift">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-coral-soft text-coral-ink"><MapPin className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{query.location}</span>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">{prettyDate(query.checkin)} – {prettyDate(query.checkout)} · {search.nights} night{search.nights === 1 ? "" : "s"} · {query.adults} guest{query.adults === 1 ? "" : "s"}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-soft group-hover:text-foreground">Edit <ChevronDown className="size-3.5" aria-hidden /></span>
      </button>
    );
  }
  const min = tomorrowIso();
  const showTrip = Boolean(trip.start && trip.end && ISO.test(trip.start) && ISO.test(trip.end) && trip.start >= min && (query.checkin !== trip.start || query.checkout !== trip.end));
  return (
    <div className="relative space-y-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-soft">
      <PlaceField caption="Where" Icon={MapPin} srLabel="Looking for stays in" label={query.location} endpoint={`/api/trips/${tripId}/places/google/autocomplete`} scope="areas" busy={busy} onPick={search.setLocation} />
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 @[34rem]:flex @[34rem]:flex-wrap @[34rem]:items-center @[34rem]:gap-x-4 @[34rem]:gap-y-2.5">
        <DayControl caption="Check in" date={query.checkin} min={min} busy={busy} onPick={search.setCheckin} prevLabel="Check in: previous day" nextLabel="Check in: next day" dateLabel="Check-in date" />
        <DayControl caption="Check out" date={query.checkout} min={shiftIso(query.checkin, 1)} busy={busy} onPick={search.setCheckout} prevLabel="Check out: previous day" nextLabel="Check out: next day" dateLabel="Check-out date" />
        <div className="col-span-2 flex items-center justify-between gap-3 @[34rem]:contents">
          <span className="pl-1 text-sm tabular-nums text-muted-foreground @[34rem]:pl-0">{search.nights} night{search.nights === 1 ? "" : "s"}</span>
          <Counter value={query.adults} min={1} max={24} onChange={search.setAdults} noun="guest" disabled={busy} />
        </div>
        {showTrip && (
          <button type="button" disabled={busy} onClick={() => search.setBoth(trip.start!, trip.end!)} className="col-span-2 h-9 rounded-full px-3 text-sm font-medium text-coral-ink transition-colors hover:bg-coral-soft disabled:opacity-50 @max-[34rem]:-ml-3 @max-[34rem]:justify-self-start">
            Trip dates · {prettyDate(trip.start)} – {prettyDate(trip.end)}
          </button>
        )}
      </div>
      <LoadingNote busy={busy} messages={SEARCH_NOTES.stays} />
      <p className="sr-only" role="status" aria-live="polite">{busy ? "Loading stays" : ""}</p>
      <SearchSweep busy={busy} />
    </div>
  );
}

/** Cards shaped like a hotel, shown while a new search loads, so the row holds its size and the hotels arrive into place. */
export function StayCardsSkeleton({ className, cardClassName }: { className?: string; cardClassName?: string }) {
  return (
    <div aria-hidden className={className}>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cardClassName}>
          <SkeletonCard />
        </div>
      ))}
    </div>
  );
}
