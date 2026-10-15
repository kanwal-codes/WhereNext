"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight, Minus, PlaneLanding, PlaneTakeoff, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { LoadingNote, SEARCH_NOTES } from "@/components/LoadingNote";
import { Skeleton } from "@/components/Skeleton";
import { ease } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { SlidingTabs } from "./SlidingTabs";
import { money, prettyDate } from "./ui";
import { DayControl, ISO, PlaceField, SearchSweep, daysBetween, shiftIso, tomorrowIso } from "./SearchBarParts";

type FlightsBlock = Extract<AssistantBlock, { type: "flights" }>;
export type FlightItems = FlightsBlock["items"];
export type FaresStatus = "ready" | "loading" | "error" | "empty";
type Insights = NonNullable<FlightsBlock["insights"]>;

/** The day a card's fares are for: its own field, else the first date its note names (cards saved before the field existed). */
const startDate = (block: FlightsBlock): string | null => block.departureDate ?? block.dateNote?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;

export type FlightQuery = { fromLabel: string; fromId?: string; toLabel: string; toId?: string; depart: string | null; ret: string | null };

/**
 * The flights card's own search. It starts from the fares the chat found and, when the traveller changes the route or a
 * day (or turns the trip into a round trip), asks again: a skeleton while it loads, then the new fares. A newer change
 * cancels an older one still in flight, so the list never shows anything but what the bar says.
 */
export function useFlightSearch(block: FlightsBlock, tripId: string, trip: { start?: string | null; end?: string | null }) {
  const [query, setQuery] = useState<FlightQuery>(() => ({ fromLabel: block.origin, fromId: block.originId, toLabel: block.destination, toId: block.destinationId, depart: startDate(block), ret: block.returnDate ?? null }));
  const [items, setItems] = useState<FlightItems>(block.items);
  const [insights, setInsights] = useState<Insights | null>(block.insights ?? null);
  const [assumed, setAssumed] = useState<boolean>(() => block.assumedDate ?? /^example date/i.test(block.dateNote ?? ""));
  const [status, setStatus] = useState<FaresStatus>("ready");
  const [problem, setProblem] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [retrievedAt, setRetrievedAt] = useState(block.retrievedAt);
  const [currency, setCurrency] = useState<string | null>(block.items[0]?.currency ?? null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(query);
  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async (next: FlightQuery) => {
    if (!next.depart || !ISO.test(next.depart)) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    latest.current = next;
    setQuery(next);
    setStatus("loading");
    setProblem(null);
    // A round trip can take ten seconds or more to price; give up (with a way to retry) rather than load forever.
    let gaveUp = false;
    const giveUpTimer = setTimeout(() => { gaveUp = true; request.abort(); }, 40_000);
    try {
      const res = await fetch(`/api/trips/${tripId}/flights`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: next.fromLabel, to: next.toLabel, fromId: next.fromId, toId: next.toId, departureDate: next.depart, ...(next.ret ? { returnDate: next.ret } : {}) }),
        signal: request.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        items?: FlightItems; departureDate?: string; returnDate?: string | null; assumedDate?: boolean; currency?: string; provider?: string;
        insights?: Insights | null; origin?: { id: string; label: string } | null; destination?: { id: string; label: string } | null; freshness?: { retrievedAt?: string };
      };
      if (request.signal.aborted) return;
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const found = body.items ?? [];
      // The server may have named the places better than the text did ("Zagreb" → "Zagreb, Croatia") and may have moved a date.
      setQuery({
        fromLabel: body.origin?.label ?? next.fromLabel, fromId: body.origin?.id ?? next.fromId,
        toLabel: body.destination?.label ?? next.toLabel, toId: body.destination?.id ?? next.toId,
        depart: body.departureDate ?? next.depart, ret: body.returnDate ?? null,
      });
      setItems(found);
      setInsights(body.insights ?? null);
      setAssumed(Boolean(body.assumedDate));
      setCurrency(body.currency ?? found[0]?.currency ?? null);
      setRetrievedAt(body.freshness?.retrievedAt ?? new Date().toISOString());
      setSearched(true);
      setProblem(body.provider === "serpapi" && (!body.origin || !body.destination) ? (!body.origin ? next.fromLabel : next.toLabel) : null);
      setStatus(found.length === 0 ? "empty" : "ready");
    } catch {
      if (!request.signal.aborted || gaveUp) setStatus("error");
    } finally {
      clearTimeout(giveUpTimer);
      if (controller.current === request) controller.current = null;
    }
  }, [tripId]);

  const q = () => latest.current;
  // The trip's own return only goes with the trip's own start; any other day gets a week, not a month-long default.
  const defaultReturn = (depart: string) => (trip.end && trip.start === depart && trip.end > depart ? trip.end : shiftIso(depart, 7));
  return {
    query, items, insights, assumed, status, problem, searched, retrievedAt, currency,
    retry: () => void run(q()),
    setFrom: (label: string) => void run({ ...q(), fromLabel: label, fromId: undefined }),
    setTo: (label: string) => void run({ ...q(), toLabel: label, toId: undefined }),
    swap: () => void run({ ...q(), fromLabel: q().toLabel, fromId: q().toId, toLabel: q().fromLabel, toId: q().fromId }),
    // Moving the departure carries the return with it, so the trip keeps its length.
    setDepart: (day: string) => {
      const cur = q();
      const length = cur.depart && cur.ret ? Math.max(1, daysBetween(cur.depart, cur.ret)) : null;
      void run({ ...cur, depart: day, ret: cur.ret ? shiftIso(day, length ?? 7) : null });
    },
    setReturn: (day: string) => void run({ ...q(), ret: day }),
    setRoundTrip: (round: boolean) => {
      const cur = q();
      void run({ ...cur, ret: round && cur.depart ? defaultReturn(cur.depart) : null });
    },
    setBoth: (start: string, end: string | null) => void run({ ...q(), depart: start, ret: end }),
  };
}

const TRIP_TYPES = [{ key: 0, content: <span>Round trip</span> }, { key: 1, content: <span>One way</span> }];

/** What the bar reads and changes: the query as it stands, and one way to change each part of it. */
export type FlightSearchView = {
  query: FlightQuery;
  status: FaresStatus;
  setFrom: (label: string) => void;
  setTo: (label: string) => void;
  swap: () => void;
  setDepart: (day: string) => void;
  setReturn: (day: string) => void;
  setRoundTrip: (round: boolean) => void;
  setBoth: (start: string, end: string | null) => void;
};

/** Where from and to (each editable), round trip or one way, and the days: everything that decides which fares are shown. */
export function FlightSearchBar({ search, tripId, trip, routeOpen, onRouteDone }: { search: FlightSearchView; tripId: string; trip: { start?: string | null; end?: string | null }; /** The From and To panel is shown only when asked for (the card's own header names the route). */ routeOpen: boolean; onRouteDone: () => void }) {
  const reduce = useReducedMotion();
  const { query, status } = search;
  const busy = status === "loading";
  const min = tomorrowIso();
  const round = query.ret !== null;
  const showTrip = Boolean(trip.start && ISO.test(trip.start) && trip.start >= min && (query.depart !== trip.start || (round && trip.end ? query.ret !== trip.end : false)));
  const codeOf = (id?: string) => (id && /^[A-Z]{3}$/.test(id) ? id : undefined);
  const [turn, setTurn] = useState(0);
  return (
    <div className="relative space-y-3 border-b border-border bg-gradient-to-b from-muted/50 via-muted/20 to-transparent px-4 py-4">
      {/* Where: the header already names the route, so the two ends open here only when the traveller asks to change them. */}
      <AnimatePresence initial={false}>
        {routeOpen && (
          <motion.div
            key="route"
            id="flight-route-editor"
            initial={reduce ? false : { height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
            exit={reduce ? undefined : { height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.34, ease }}
          >
            <div className="relative grid rounded-2xl border border-border bg-card shadow-soft @[34rem]:grid-cols-2">
              <PlaceField variant="panel" className="@max-[34rem]:rounded-t-2xl @[34rem]:rounded-l-2xl @[34rem]:[&>button]:pr-8 @[34rem]:[&>div]:pr-8" caption="From" Icon={PlaneTakeoff} srLabel="Flying from" label={query.fromLabel} code={codeOf(query.fromId)} endpoint={`/api/trips/${tripId}/flights/places`} busy={busy} onPick={(v) => { search.setFrom(v); onRouteDone(); }} />
              <PlaceField variant="panel" className="border-t border-border @max-[34rem]:rounded-b-2xl @[34rem]:rounded-r-2xl @[34rem]:border-l @[34rem]:border-t-0 @[34rem]:[&>button]:pl-8 @[34rem]:[&>div]:pl-8" caption="To" Icon={PlaneLanding} srLabel="Flying to" label={query.toLabel} code={codeOf(query.toId)} endpoint={`/api/trips/${tripId}/flights/places`} busy={busy} onPick={(v) => { search.setTo(v); onRouteDone(); }} />
              <button
                type="button"
                onClick={() => {
                  setTurn((n) => n + 1);
                  search.swap();
                  onRouteDone();
                }}
                disabled={busy}
                aria-label="Swap from and to"
                className="absolute z-10 grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-[color,border-color,transform] hover:border-foreground/25 hover:text-foreground active:scale-90 disabled:pointer-events-none disabled:opacity-50 @max-[34rem]:right-4 @max-[34rem]:top-1/2 @max-[34rem]:-translate-y-1/2 @[34rem]:left-1/2 @[34rem]:top-1/2 @[34rem]:-translate-x-1/2 @[34rem]:-translate-y-1/2"
              >
                <motion.span animate={{ rotate: turn * 180 }} transition={{ duration: reduce ? 0 : 0.4, ease }} className="grid place-items-center @max-[34rem]:rotate-90">
                  <ArrowLeftRight className="size-4" aria-hidden />
                </motion.span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <SlidingTabs label="Trip type" className="w-fit daisy-tabs-sm" value={round ? 0 : 1} onChange={(i) => search.setRoundTrip(i === 0)} items={TRIP_TYPES} />
        {showTrip && (
          <button type="button" disabled={busy} onClick={() => search.setBoth(trip.start!, round && trip.end ? trip.end : null)} className="h-9 rounded-full px-3 text-sm font-medium text-coral-ink transition-colors hover:bg-coral-soft disabled:opacity-50">
            {round && trip.end ? `Use trip dates · ${prettyDate(trip.start)} – ${prettyDate(trip.end)}` : `Use trip start · ${prettyDate(trip.start)}`}
          </button>
        )}
      </div>

      {/* When: the same day pills the stays card uses; with no return, the second one is the way to add it. */}
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 @[34rem]:flex @[34rem]:flex-wrap @[34rem]:items-center @[34rem]:gap-x-4 @[34rem]:gap-y-2.5">
        <DayControl caption="Depart" date={query.depart} min={min} busy={busy} onPick={search.setDepart} prevLabel="Depart: previous day" nextLabel="Depart: next day" dateLabel="Departure date" />
        <AnimatePresence initial={false} mode="popLayout">
          {round ? (
            <motion.div key="return" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.22, ease }}>
              <DayControl caption="Return" date={query.ret} min={query.depart ? shiftIso(query.depart, 1) : min} busy={busy} onPick={search.setReturn} prevLabel="Return: previous day" nextLabel="Return: next day" dateLabel="Return date" />
            </motion.div>
          ) : (
            <motion.button
              key="add-return"
              type="button"
              disabled={busy}
              onClick={() => search.setRoundTrip(true)}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease }}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-dashed border-border px-3.5 text-sm @max-[34rem]:h-11 @max-[34rem]:self-end font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden /> Add return
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <LoadingNote busy={busy} messages={round ? SEARCH_NOTES.roundTrip : SEARCH_NOTES.flights} />
      <p className="sr-only" role="status" aria-live="polite">{busy ? "Loading flights" : ""}</p>
      <SearchSweep busy={busy} />
    </div>
  );
}

/** Google's read on whether these dates are a good time to buy: low, typical or high for the route. */
export function PriceInsight({ insights, currency }: { insights: Insights; currency: string }) {
  const tone = { low: { Icon: TrendingDown, text: "Prices are low for these dates", cls: "bg-positive-soft text-positive" }, typical: { Icon: Minus, text: "Prices are typical for these dates", cls: "bg-muted text-ink-soft" }, high: { Icon: TrendingUp, text: "Prices are higher than usual for these dates", cls: "bg-caution-soft text-caution" } }[insights.level];
  const usual = insights.typicalLow && insights.typicalHigh ? `Usually ${money(insights.typicalLow, currency, true)} to ${money(insights.typicalHigh, currency, true)}` : null;
  return (
    <div className={cn("flex items-center gap-2.5 border-b border-border px-4 py-2.5 text-sm", tone.cls)} role="note">
      <tone.Icon className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">{tone.text}</span>
      {usual && <span className="ml-auto hidden text-xs opacity-80 @[34rem]:inline">{usual}</span>}
    </div>
  );
}

/** Rows shaped like a fare, shown while a new search loads, so the card holds its size and the fares arrive into place. */
export function FlightRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-hidden className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1.5 px-4 py-3">
          <div className="flex min-w-0 gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-[18px] w-44 max-w-full rounded-md" />
              <Skeleton className="h-3.5 w-56 max-w-full rounded-md" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
