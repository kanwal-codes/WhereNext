"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, MapPin, Minus, Plus } from "lucide-react";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { LoadingNote, SEARCH_NOTES } from "@/components/LoadingNote";
import { SkeletonCard } from "@/components/Skeleton";
import { cn } from "@/lib/utils";
import { toStayCardItem } from "@/lib/application/stay-items";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { StayOption } from "@/packages/contracts/stay";
import { DayChip, ISO, PlaceField, SearchSweep, daysBetween, shiftIso, tomorrowIso } from "./SearchBarParts";
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

const chip = "inline-flex h-9 items-center rounded-full bg-coral-soft px-3 text-coral-ink transition-colors hover:bg-coral-soft/70 disabled:pointer-events-none disabled:opacity-60";

/** The place, as a chip in the sentence; a tap turns it into a search box for another. */
function PlaceChip({ label, endpoint, busy, onPick }: { label: string; endpoint: string; busy: boolean; onPick: (label: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!editing) return;
    const away = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setEditing(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [editing]);
  if (!editing) {
    return (
      <button type="button" disabled={busy} onClick={() => { setDraft(""); setEditing(true); }} aria-label={`Looking for stays in ${label}. Change`} title={label} className={cn(chip, "flex w-full")}>
        <span className="truncate">{label}</span>
      </button>
    );
  }
  return (
    <span ref={root} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} className="relative block w-full">
      <DestinationCombobox
        endpoint={endpoint}
        scope="areas"
        value={draft}
        onChange={setDraft}
        onSelect={(text) => { setEditing(false); if (text.trim() && text !== label) onPick(text.trim()); }}
        placeholder={label}
        autoFocus
        inputClassName="h-9 w-full rounded-full border border-foreground/30 bg-background px-3 text-base font-medium outline-none placeholder:text-muted-foreground"
      />
    </span>
  );
}

/** Guests, as a chip with a step either way inside it. */
function GuestsChip({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled: boolean }) {
  const btn = "grid size-7 place-items-center rounded-full transition-colors hover:bg-coral/15 disabled:pointer-events-none disabled:opacity-35";
  return (
    <span className={cn(chip, "gap-0.5 px-1")}>
      <button type="button" aria-label="Fewer guests" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)} className={btn}><Minus className="size-3.5" aria-hidden /></button>
      <span className="px-1 tabular-nums" aria-live="polite">{value} guest{value === 1 ? "" : "s"}</span>
      <button type="button" aria-label="More guests" disabled={disabled || value >= 24} onClick={() => onChange(value + 1)} className={btn}><Plus className="size-3.5" aria-hidden /></button>
    </span>
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
    // The search reads as a sentence you can edit in place: each blank is a chip. No labels, no stacked fields.
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-3.5 shadow-soft">
      <p className="font-display text-lg leading-[2.35] tracking-[-0.01em] text-foreground max-lg:text-[1.1875rem]">
        <span className="block text-muted-foreground">Stays in</span>
        <PlaceChip label={query.location} endpoint={`/api/trips/${tripId}/places/google/autocomplete`} busy={busy} onPick={search.setLocation} />
        <span className="text-muted-foreground">from </span>
        <DayChip date={query.checkin} min={min} busy={busy} onPick={search.setCheckin} dateLabel="Check-in date" />
        <span className="text-muted-foreground"> to </span>
        <DayChip date={query.checkout} min={shiftIso(query.checkin, 1)} busy={busy} onPick={search.setCheckout} dateLabel="Check-out date" />
        <br />
        <span className="text-muted-foreground">for </span>
        <GuestsChip value={query.adults} onChange={search.setAdults} disabled={busy} />
        <span className="ml-2 whitespace-nowrap text-base tabular-nums text-muted-foreground">({search.nights} night{search.nights === 1 ? "" : "s"})</span>
      </p>
      {showTrip && (
        <button type="button" disabled={busy} onClick={() => search.setBoth(trip.start!, trip.end!)} className="-ml-3 mt-1 h-9 rounded-full px-3 text-sm font-medium text-coral-ink transition-colors hover:bg-coral-soft disabled:opacity-50">
          Use trip dates · {prettyDate(trip.start)} – {prettyDate(trip.end)}
        </button>
      )}
      {busy && <div className="pt-1"><LoadingNote busy={busy} messages={SEARCH_NOTES.stays} /></div>}
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
