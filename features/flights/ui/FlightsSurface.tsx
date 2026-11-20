"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, ChevronDown, Info, Search, SlidersHorizontal } from "lucide-react";
import { LoadingNote, SEARCH_NOTES } from "@/components/LoadingNote";
import { Skeleton } from "@/components/Skeleton";
import { motionTokens } from "@/components/motion-primitives";
import { Sheet } from "@/components/motion-primitives";
import { sheetPrimary } from "@/components/motion/sheetActions";
import { SheetHeader } from "@/components/SheetHeader";
import { useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type PanelState } from "@/components/TripPanelProvider";
import { FlightDetail } from "@/features/conversation/ui/panels/FlightDetail";
import { useMediaQuery } from "@/lib/use-media-query";
import { applyFlightView, DEFAULT_FLIGHT_VIEW, FlightControls, type FlightView } from "@/features/conversation/ui/blocks/FlightFilters";
import { FlightRowsSkeleton, useFlightSearch, type FlightItems } from "@/features/conversation/ui/blocks/FlightSearch";
import { FlightPicks, FlightPicksSkeleton, FlightRowBody, offerKey, pickFares } from "@/features/conversation/ui/blocks/FlightWidget";
import { SearchSweep } from "@/features/conversation/ui/blocks/SearchBarParts";
import { Notice, controlSecondary, money, prettyDate, type } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import { datesLine, draftFromTrip, routeLine, travellersLine, type FlightDraft } from "../domain/flights-page";
import { FlightIdeas } from "./FlightIdeas";
import { FlightSearchSheet } from "./FlightSearchSheet";

/** Rows shown under the picks before "See all". */
const ROWS = 6;
const clock = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
};

/** Google's read on the dates, as one quiet line (not a banner): low, typical or high for the route, and what is usual. */
function InsightLine({ level, usual }: { level: "low" | "typical" | "high"; usual: string | null }) {
  const tone = { low: { text: "Low for these dates", dot: "bg-positive" }, typical: { text: "Typical for these dates", dot: "bg-muted-foreground/60" }, high: { text: "High for these dates", dot: "bg-caution" } }[level];
  return (
    <p role="note" className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-sm">
      <span className="inline-flex items-center gap-2 font-medium"><span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone.dot)} />{tone.text}</span>
      {usual && <span className="text-muted-foreground">{usual}</span>}
    </p>
  );
}

/**
 * Flights, as a page of its own (docs: the v2 renders). One pill in the header names the search and opens it; under it, the days and travellers
 * in the same wide pill Stay uses. Before a search the page is a few places worth flying to; after one it is the best fare first, then the rest.
 * The search is a sheet that drops from the top: it is asked once, and priced once.
 */
export function FlightsSurface({ tripId, active = true }: { tripId: string | null; /** False while another view of the page (My flights) is in front: the search stays mounted but gives up the header. */ active?: boolean }) {
  const reduce = useReducedMotion();
  const trip = useTripDataMaybe()?.data?.trip;
  const standalone = tripId === null;
  // In a trip a flight opens in the trip's side panel; from the home page there is no panel, so it opens in a sheet of its own.
  const panelCtx = useTripPanelMaybe();
  const [own, setOwn] = useState<Extract<PanelState, { kind: "flight" }> | null>(null);
  const openPanel = (panel: PanelState) => { if (panel.kind === "flight" && !panelCtx) setOwn(panel); else panelCtx?.openPanel(panel); };
  const wide = useMediaQuery("(min-width: 1024px)");
  const tripDates = useMemo(() => ({ start: trip?.start_date ?? null, end: trip?.end_date ?? null }), [trip?.start_date, trip?.end_date]);
  // The first search starts from here: the fares card's hook wants a card to begin from, and there is none, so an empty one.
  const seed = useMemo(() => ({ type: "flights" as const, retrievedAt: new Date().toISOString(), origin: trip?.origin ?? "", destination: trip?.destination ?? "", items: [] as FlightItems }), [trip?.origin, trip?.destination]);
  const fares = useFlightSearch(seed, tripId, tripDates);
  const [asked, setAsked] = useState<FlightDraft | null>(null);
  const draft = asked ?? draftFromTrip(trip);
  const started = asked !== null;
  const [sheet, setSheet] = useState<{ open: boolean; focus?: "to" | "dates" }>({ open: false });
  // A place picked from the ideas: the search opens with it as the destination, on the days.
  const [idea, setIdea] = useState<string | null>(null);
  const [view, setView] = useState<FlightView>(DEFAULT_FLIGHT_VIEW);
  const [showAll, setShowAll] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilters = Number(view.nonstop) + Number(view.changes) + Number(view.airport !== null);
  const { query } = fares;
  const loading = fares.status === "loading";
  const ready = fares.status === "ready";
  const roundTrip = query.ret !== null;

  // The first visit of a session opens the search, filled in from the trip, so the way in is one tap and not a page of pictures.
  useEffect(() => {
    if (started) return;
    const key = `flights:opened:${tripId ?? "home"}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* storage blocked: the pill is still there */ }
    setSheet({ open: true });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSheet = useCallback((focus?: "to" | "dates") => setSheet({ open: true, focus }), []);
  const search = (next: FlightDraft) => {
    setAsked(next);
    setIdea(null);
    setView(DEFAULT_FLIGHT_VIEW);
    setShowAll(false);
    fares.search({ fromLabel: next.fromLabel, toLabel: next.toLabel, depart: next.depart, ret: next.ret, adults: next.adults });
  };

  const label = started ? routeLine(query.fromLabel, query.toLabel) : "Where to?";
  const pill = useMemo(() => (
    <button
      type="button"
      onClick={() => openSheet("to")}
      aria-haspopup="dialog"
      aria-label={started ? `Flights: ${label}. Change` : "Search flights"}
      className={cn("relative flex h-11 w-fit max-w-full items-center overflow-hidden rounded-full bg-muted px-5 text-center transition-transform active:scale-[0.985] min-w-[11rem] gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={label} initial={reduce ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -5 }} transition={{ duration: 0.16 }} className="inline-flex min-w-0 items-center gap-2.5">
          {!started && <Search className="size-[1.125rem] shrink-0 text-ink-soft" aria-hidden />}
          <span className={cn("truncate font-display text-body font-semibold tracking-[-0.01em]", started ? "text-foreground" : "text-ink-soft")}>{label}</span>
          {started && <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </button>
  ), [label, started, openSheet, reduce]);
  useSetPhoneHeader({ titleNode: standalone || !active ? undefined : pill });

  // What is shown follows the filters: the best fare among the nonstop ones is the pick when "Nonstop" is on.
  const offers = applyFlightView(fares.items, view);
  const picks = useMemo(() => pickFares(offers), [offers]);
  const pickKeys = useMemo(() => new Set(picks.map((p) => offerKey(p.offer))), [picks]);
  const rest = offers.filter((o) => !pickKeys.has(offerKey(o)));
  const shown = showAll ? rest : rest.slice(0, ROWS);
  const lowest = offers.length ? offers.reduce((best, o) => (Number(o.price) < Number(best.price) ? o : best), offers[0]!) : null;
  const dateNote = query.depart ? `Departing ${query.depart}${query.ret ? `, returning ${query.ret}` : ""}` : undefined;
  const panelFor = (offer: FlightItems[number]) => ({ kind: "flight" as const, flight: offer, route: { origin: query.fromLabel, destination: query.toLabel, dateNote, retrievedAt: fares.retrievedAt, offers: fares.items, departureDate: query.depart ?? undefined, returnDate: query.ret ?? undefined, originId: query.fromId, destinationId: query.toId, onChangeReturn: (day: string) => fares.setReturn(day) } });
  const openOffer = (key: string) => { const offer = offers.find((o) => offerKey(o) === key); if (offer) openPanel(panelFor(offer)); };
  const adults = query.adults ?? draft.adults;
  const day = query.depart ? prettyDate(query.depart) : undefined;
  const currency = fares.currency;
  const usual = fares.insights?.typicalLow && fares.insights.typicalHigh && currency ? `usually ${money(fares.insights.typicalLow, currency, true)} to ${money(fares.insights.typicalHigh, currency, true)}` : null;

  return (
    <div className="mx-auto w-full max-w-[40rem] pb-24 lg:pb-12">
      {/* Alone on the home page the header is one row: back to the trips, the search pill centred, and an empty circle's width to balance it. */}
      {standalone && (
        <div className="mb-5 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-3">
          <Link href="/trips" prefetch={false} aria-label="Back to your trips" className="grid size-11 place-items-center rounded-full bg-muted text-foreground transition-[background-color,transform] duration-200 ease-out hover:bg-muted/70 active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="flex min-w-0 justify-center">{pill}</div>
          <span aria-hidden />
        </div>
      )}
      {/* The search opens from the header pill (a phone, and the home page's own), so there is no second control for it. A trip's desktop has no header pill: it keeps the wide button that reopens the search on the days. */}
      {started && !standalone && (
        <button
          type="button"
          onClick={() => openSheet("dates")}
          aria-haspopup="dialog"
          aria-label="Change days and travellers"
          className="relative flex h-12 w-full items-center gap-3 overflow-hidden rounded-full border border-input bg-card pr-4 pl-4 text-left transition-transform duration-200 ease-out active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-lg:hidden"
        >
          <CalendarDays className="size-[1.125rem] shrink-0 text-ink-soft" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-display text-base font-medium tracking-[-0.01em] tabular-nums">{datesLine(query.depart, query.ret) ?? "Choose your dates"}</span>
            <span className="text-sm text-muted-foreground"> · {travellersLine(adults)}</span>
          </span>
          <ChevronDown className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden />
          <SearchSweep busy={loading} />
        </button>
      )}
      <LoadingNote busy={loading} messages={roundTrip ? SEARCH_NOTES.roundTrip : SEARCH_NOTES.flights} className="mt-2 px-1" />
      <p className="sr-only" role="status" aria-live="polite">{loading ? "Loading flights" : ""}</p>

      {!started && <FlightIdeas tripId={tripId} origin={draft.fromLabel || trip?.origin} destination={trip?.destination} onPick={(city) => { setIdea(city); openSheet("dates"); }} />}

      {started && (
        <div className="mt-4" aria-busy={loading}>
          {loading && fares.items.length === 0 && (
            <>
              <div aria-hidden className="mb-5 flex gap-2"><Skeleton className="h-10 w-44 rounded-full" /><Skeleton className="h-10 w-24 rounded-full" /><Skeleton className="h-10 w-24 rounded-full" /></div>
              <div className="[&>*]:mx-0! [&>*]:mt-0!"><FlightPicksSkeleton /></div>
              <div className="mt-4"><FlightRowsSkeleton /></div>
            </>
          )}

          {fares.status === "error" && (
            <motion.div role="alert" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.standard} className="space-y-3 px-4 py-12 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-caution-soft text-caution" aria-hidden><Info className="size-6" /></span>
              <p className="font-display text-lg font-medium">We couldn’t load flights{day ? ` for ${day}` : ""} just now</p>
              <p className={type.meta}>The fares service didn’t answer. Nothing is wrong with your search.</p>
              <button type="button" onClick={fares.retry} className={controlSecondary}>Try again</button>
            </motion.div>
          )}

          {fares.status === "empty" && (
            <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.standard} className="space-y-3 px-4 py-12 text-center">
              {fares.problem ? (
                <>
                  <p className="font-display text-lg font-medium">We couldn’t find “{fares.problem}”</p>
                  <p className={type.meta}>Try a nearby city, or the airport’s three-letter code.</p>
                  <button type="button" onClick={() => openSheet("to")} className={controlSecondary}>Change the search</button>
                </>
              ) : (
                <>
                  <p className="font-display text-lg font-medium">No flights{day ? ` on ${day}` : ""}</p>
                  <p className={type.meta}>Nothing is flying this route that day. Nearby days often have fares.</p>
                  <button type="button" onClick={() => openSheet("dates")} className={controlSecondary}>Try other days</button>
                </>
              )}
            </motion.div>
          )}

          {ready && fares.items.length > 0 && (
            <motion.div key={fares.retrievedAt} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.standard}>
              {fares.insights && <div className="mb-4 mt-1 px-1"><InsightLine level={fares.insights.level} usual={usual} /></div>}
              {/* A phone: the count, and one Filter button that opens sort and filters in a sheet, as Stay does. A desktop keeps them inline. */}
              <div className={cn("flex items-center justify-between gap-3 px-1 lg:hidden", loading && "pointer-events-none opacity-50")}>
                <p role="status" aria-live="polite" className="text-sm text-ink-soft"><b className="font-semibold text-foreground">{offers.length}</b>{offers.length === fares.items.length ? "" : ` of ${fares.items.length}`} {fares.items.length === 1 ? "flight" : "flights"}</p>
                <button type="button" onClick={() => setFilterOpen(true)} aria-haspopup="dialog" className="-my-2 -mr-2 inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-sm font-medium text-ink-soft transition-colors active:bg-muted">
                  <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
                  Filter
                  {activeFilters > 0 && <span aria-hidden className="size-1.5 rounded-full bg-coral" />}
                </button>
              </div>
              <div className={cn("transition-opacity duration-200 max-lg:hidden", loading && "pointer-events-none opacity-50")}>
                <FlightControls items={fares.items} view={view} onChange={(v) => { setView(v); setShowAll(false); }} shown={offers.length} />
              </div>
              {offers.length === 0 ? (
                <div className="space-y-2 px-4 py-10 text-center">
                  <p className="font-display text-lg font-medium">No flights match those filters</p>
                  <button type="button" onClick={() => setView({ ...DEFAULT_FLIGHT_VIEW, sort: view.sort })} className={controlSecondary}>Clear filters</button>
                </div>
              ) : (
                <>
                  <div className="mt-5 [&>*]:mx-0! [&>*]:mt-0!"><FlightPicks picks={picks} selected={null} onSelect={openOffer} /></div>
                  <ul className="mt-3">
                    {shown.map((offer, i) => {
                      const key = offerKey(offer);
                      return (
                        <motion.li
                          key={key + i}
                          layout="position"
                          initial={reduce ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ ...motionTokens.standard, delay: Math.min(i, 6) * 0.05 }}
                          className="relative -mx-4 cursor-pointer px-4 py-4 transition-colors duration-200 after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden active:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none lg:-mx-3 lg:rounded-2xl lg:px-3 lg:after:inset-x-3 lg:hover:bg-muted/40"
                          role="button"
                          tabIndex={0}
                          onClick={() => openOffer(key)}
                          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openOffer(key); } }}
                          aria-label={`Open details for ${offer.airline}, ${clock(offer.departAt)} to ${clock(offer.arriveAt)}`}
                        >
                          <FlightRowBody offer={offer} cheapest={offers.length > 1 && offer === lowest} onDetails={() => openOffer(key)} />
                        </motion.li>
                      );
                    })}
                  </ul>
                  {!showAll && rest.length > ROWS && (
                    <button type="button" onClick={() => setShowAll(true)} className="btn-primary mt-4 h-12 w-full rounded-full text-body">See all {offers.length} flights</button>
                  )}
                </>
              )}
              <div className="mt-6">
                <Notice>
                  Prices are per person{roundTrip ? " for the round trip" : ""}{currency ? `, in ${currency}` : ""}
                  {fares.items.some((o) => o.listedCurrency) ? `, converted from ${[...new Set(fares.items.map((o) => o.listedCurrency).filter(Boolean))].join(", ")} at today’s rate, so approximate` : ""}, and change quickly. Roam can’t book flights.
                </Notice>
              </div>
            </motion.div>
          )}
        </div>
      )}

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} side="bottom" ariaLabel="Sort and filter flights" padded footer={<button type="button" onClick={() => setFilterOpen(false)} className={sheetPrimary}>Show {offers.length} {offers.length === 1 ? "flight" : "flights"}</button>}>
        <p className="pb-3 pt-1 font-display text-xl font-medium tracking-[-0.02em]">Sort and filter</p>
        <div className="-mx-4"><FlightControls items={fares.items} view={view} onChange={(v) => { setView(v); setShowAll(false); }} shown={offers.length} /></div>
      </Sheet>

      <Sheet open={own !== null} onClose={() => setOwn(null)} side={wide ? "right" : "bottom"} ariaLabel="Flight details" className="lg:max-w-xl">
        {own && (
          <>
            <SheetHeader title={`${routeLine(own.route.origin, own.route.destination)}`} onClose={() => setOwn(null)} />
            <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain"><FlightDetail flight={own.flight} route={own.route} onSwitch={(flight) => setOwn({ ...own, flight })} /></div>
          </>
        )}
      </Sheet>

      <FlightSearchSheet open={sheet.open} focus={sheet.focus} onClose={() => setSheet((s) => ({ ...s, open: false }))} tripId={tripId} draft={idea ? { ...draft, toLabel: idea } : draft} onSearch={search} />
    </div>
  );
}
