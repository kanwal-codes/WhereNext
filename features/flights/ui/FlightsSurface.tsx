"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CalendarDays, ChevronDown, Plane, Search, SearchX, SlidersHorizontal, WifiOff, X } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { StateMessage, stateButton } from "@/components/StateMessage";
import { motionTokens } from "@/components/motion-primitives";
import { Sheet } from "@/components/motion-primitives";
import { SheetHeader } from "@/components/SheetHeader";
import { useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type PanelState } from "@/components/TripPanelProvider";
import { FlightDetail } from "@/features/conversation/ui/panels/FlightDetail";
import { useMediaQuery } from "@/lib/use-media-query";
import { activeFlightFilters, ALL_SORTS, applyFlightView, availableFilters, DEFAULT_FLIGHT_VIEW, FlightControls, TIMES_OF_DAY, type FlightView } from "@/features/conversation/ui/blocks/FlightFilters";
import { FlightRowsSkeleton, useFlightSearch, type FlightItems } from "@/features/conversation/ui/blocks/FlightSearch";
import { FlightPicks, FlightPicksSkeleton, FlightRowBody, offerKey, pickFares } from "@/features/conversation/ui/blocks/FlightWidget";
import { SearchSweep } from "@/features/conversation/ui/blocks/SearchBarParts";
import { Notice, controlSecondary, money, prettyDate, type } from "@/features/conversation/ui/blocks/ui";
import { cachedGet } from "@/lib/client/cached-get";
import { cn } from "@/lib/utils";
import { datesLine, draftFromTrip, routeLine, travellersLine, type FlightDraft } from "../domain/flights-page";
import { RoutePill } from "@/features/transport/ui/RoutePill";
import { FlightIdeas } from "./FlightIdeas";
import { clearSection, FlightFilterSheet, SECTION_TITLES, SectionBody, sectionActive, type FilterSection } from "./FlightFilterSheet";
import { FlightSearchSheet } from "./FlightSearchSheet";

/** Rows shown under the picks before "See all". */
const ROWS = 6;
const clock = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
};

/** Google's read on the dates, as one quiet line (not a banner): low, typical or high for the route, and what is usual. */
function InsightLine({ level, usual }: { level: "low" | "typical" | "high"; usual: string | null }) {
  const tone = { low: { text: "Prices are low for these dates", dot: "bg-positive" }, typical: { text: "Prices are typical for these dates", dot: "bg-muted-foreground/60" }, high: { text: "Prices are high for these dates", dot: "bg-caution" } }[level];
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
  // Where you leave from: the trip's start, else your home city (profile, then where this request comes from). Never overwrites what was typed.
  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void cachedGet("/api/flights/home", { ttlMs: 30 * 60_000 })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { place?: string | null } | null) => { if (live && b?.place) setHome(b.place); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  const tripDraft = useMemo(() => draftFromTrip(trip), [trip]);
  const draft = useMemo(() => asked ?? (tripDraft.fromLabel || !home ? tripDraft : { ...tripDraft, fromLabel: home }), [asked, tripDraft, home]);
  const started = asked !== null;
  const [sheet, setSheet] = useState<{ open: boolean; focus?: "to" | "dates" }>({ open: false });
  // A place picked from the ideas: the search opens with it as the destination, on the days.
  const [idea, setIdea] = useState<string | null>(null);
  const [view, setView] = useState<FlightView>(DEFAULT_FLIGHT_VIEW);
  const [showAll, setShowAll] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  // The pill whose small panel is open under the row (one at a time); "Filters" opens the whole sheet instead.
  const [openSection, setOpenSection] = useState<FilterSection | null>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openSection) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenSection(null); };
    const away = (e: PointerEvent) => { if (!pillsRef.current?.contains(e.target as Node)) setOpenSection(null); };
    document.addEventListener("keydown", esc);
    document.addEventListener("pointerdown", away);
    return () => { document.removeEventListener("keydown", esc); document.removeEventListener("pointerdown", away); };
  }, [openSection]);
  const activeFilters = activeFlightFilters(view);
  const { query } = fares;
  const currency = fares.currency;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
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

  // The same two-line pill as Getting around: where you leave from small, where you are going bold; "Where to?" before a search.
  const pill = useMemo(
    () => <RoutePill from={started ? query.fromLabel : ""} to={started ? query.toLabel : ""} loading={loading} onOpen={() => openSheet("to")} />,
    [started, query.fromLabel, query.toLabel, loading, openSheet],
  );
  useSetPhoneHeader({ titleNode: standalone || !active ? undefined : pill });

  // What is shown follows the filters: the best fare among the nonstop ones is the pick when "Nonstop" is on.
  const offers = applyFlightView(fares.items, view);
  const picks = useMemo(() => pickFares(offers), [offers]);
  // The pills under the header: what each setting is now, so the row reads as the current filters. Only settings that would change the list get one.
  const available = useMemo(() => availableFilters(fares.items), [fares.items]);
  const cost = (n: number) => (currency ? money(String(n), currency, true) : String(n));
  const timeNames = view.times.map((t) => TIMES_OF_DAY.find((x) => x.id === t)?.label ?? t).join(", ");
  const pills: Array<{ key: string; label: string; on: boolean; section: FilterSection | null }> = [
    { key: "all", label: activeFilters > 0 ? `Filters · ${activeFilters}` : "Filters", on: activeFilters > 0, section: null },
    { key: "sort", label: `Sort: ${ALL_SORTS.find((x) => x.id === view.sort)?.label ?? "Cheapest"}`, on: view.sort !== DEFAULT_FLIGHT_VIEW.sort, section: "sort" },
    ...(available.nonstop || available.stops1 ? [{ key: "stops", label: view.nonstop ? "Nonstop" : view.stops1 ? "Up to 1 stop" : "Stops", on: view.nonstop || view.stops1, section: "stops" as const }] : []),
    ...(available.price ? [{ key: "price", label: view.maxPrice !== null ? `Up to ${cost(view.maxPrice)}` : "Price", on: view.maxPrice !== null, section: "price" as const }] : []),
    ...(available.times.length > 0 ? [{ key: "times", label: timeNames || "Departure", on: view.times.length > 0, section: "times" as const }] : []),
    ...(available.airlines.length > 0 ? [{ key: "airlines", label: view.airlines.length === 1 ? view.airlines[0]! : view.airlines.length > 1 ? `${view.airlines.length} airlines` : "Airlines", on: view.airlines.length > 0, section: "airlines" as const }] : []),
    ...(available.airports.length > 0 ? [{ key: "airports", label: view.airport ?? "Airport", on: view.airport !== null, section: "airports" as const }] : []),
  ];
  const pickKeys = useMemo(() => new Set(picks.map((p) => offerKey(p.offer))), [picks]);
  const rest = offers.filter((o) => !pickKeys.has(offerKey(o)));
  const shown = showAll ? rest : rest.slice(0, ROWS);
  const lowest = offers.length ? offers.reduce((best, o) => (Number(o.price) < Number(best.price) ? o : best), offers[0]!) : null;
  const dateNote = query.depart ? `Departing ${query.depart}${query.ret ? `, returning ${query.ret}` : ""}` : undefined;
  const panelFor = (offer: FlightItems[number]) => ({ kind: "flight" as const, flight: offer, route: { origin: query.fromLabel, destination: query.toLabel, dateNote, retrievedAt: fares.retrievedAt, offers: fares.items, departureDate: query.depart ?? undefined, returnDate: query.ret ?? undefined, originId: query.fromId, destinationId: query.toId, onChangeReturn: (day: string) => fares.setReturn(day) } });
  const openOffer = (key: string) => { const offer = offers.find((o) => offerKey(o) === key); if (offer) openPanel(panelFor(offer)); };
  const adults = query.adults ?? draft.adults;
  const day = query.depart ? prettyDate(query.depart) : undefined;
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
            <StateMessage icon={offline ? WifiOff : AlertCircle} title={offline ? "You’re offline" : `We couldn’t load flights${day ? ` for ${day}` : ""}`} actions={<button type="button" onClick={fares.retry} className={stateButton.primary}>Try again</button>}>
              {offline ? "Reconnect and the flights will load." : "The problem is on our end, not with your search."}
            </StateMessage>
          )}

          {fares.status === "empty" && (fares.problem ? (
            <StateMessage icon={SearchX} title={`We couldn’t find “${fares.problem}”`} actions={<button type="button" onClick={() => openSheet("to")} className={stateButton.primary}>Change the search</button>}>
              Try a nearby city, or the airport’s three-letter code.
            </StateMessage>
          ) : (
            <StateMessage icon={Plane} title={`No flights${day ? ` on ${day}` : ""}`} actions={<button type="button" onClick={() => openSheet("dates")} className={stateButton.primary}>Try other days</button>}>
              Nothing is flying this route that day. Nearby days often have flights.
            </StateMessage>
          ))}

          {ready && fares.items.length > 0 && (
            <motion.div key={fares.retrievedAt} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.standard}>
              {fares.insights && <div className="mb-4 mt-1 px-1"><InsightLine level={fares.insights.level} usual={usual} /></div>}
              {/* A phone: one row of pills, each showing what it is set to and opening the sheet at its group (the first opens it at the top). A desktop keeps its sort and filters inline. */}
              {/* The panel a pill opens floats over the flights under it (it does not push them down); a tap outside, Escape or the cross closes it. */}
              <div ref={pillsRef} className="relative lg:hidden">
              <div role="group" aria-label="Sort and filter" className={cn("no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4", loading && "pointer-events-none opacity-50")}>
                {pills.map((pill) => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => (pill.section ? setOpenSection((cur) => (cur === pill.section ? null : pill.section)) : setFilterOpen(true))}
                    aria-haspopup={pill.section ? undefined : "dialog"}
                    aria-expanded={pill.section ? openSection === pill.section : undefined}
                    aria-pressed={pill.on}
                    className="btn-chip shrink-0 gap-1.5"
                  >
                    {pill.key === "all" && <SlidersHorizontal className="size-3.5" aria-hidden />}
                    {pill.label}
                    {pill.section && <ChevronDown className={cn("size-3.5 opacity-60 transition-transform duration-200", openSection === pill.section && "rotate-180")} aria-hidden />}
                  </button>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {openSection && (
                  <motion.div
                    key={openSection}
                    role="region"
                    aria-label={SECTION_TITLES[openSection]}
                    initial={reduce ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: -6 }}
                    transition={motionTokens.fast}
                    className="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl bg-card p-4 shadow-lift ring-1 ring-border"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">{SECTION_TITLES[openSection]}</h3>
                      <div className="-mr-2 flex items-center gap-1">
                        {sectionActive(view, openSection) && openSection !== "sort" && (
                          <button type="button" onClick={() => { setView(clearSection(view, openSection)); setShowAll(false); }} className="rounded-full px-2.5 py-1.5 text-sm font-medium text-ink-soft underline underline-offset-2 active:bg-muted">Clear</button>
                        )}
                        <button type="button" onClick={() => setOpenSection(null)} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted"><X className="size-4" aria-hidden /></button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <SectionBody section={openSection} items={fares.items} view={view} onChange={(v) => { setView(v); setShowAll(false); if (openSection === "sort" || openSection === "stops") setOpenSection(null); }} currency={currency} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              </div>
              <div className={cn("transition-opacity duration-200 max-lg:hidden", loading && "pointer-events-none opacity-50")}>
                <FlightControls items={fares.items} view={view} onChange={(v) => { setView(v); setShowAll(false); }} shown={offers.length} />
              </div>
              {offers.length === 0 ? (
                <div className="mt-4">
                  <StateMessage icon={SearchX} title="No flights match" actions={<button type="button" onClick={() => setView({ ...DEFAULT_FLIGHT_VIEW, sort: view.sort })} className={stateButton.primary}>Clear filters</button>}>
                    Loosen a filter to see more flights.
                  </StateMessage>
                </div>
              ) : (
                <>
                  <div className="mt-5 [&>*]:mx-0! [&>*]:mt-0!"><FlightPicks picks={picks} selected={null} onSelect={openOffer} /></div>
                  <ul className="mt-4 space-y-3 lg:mt-3 lg:space-y-0" aria-label="Flights">
                    {shown.map((offer, i) => {
                      const key = offerKey(offer);
                      return (
                        <motion.li
                          key={key + i}
                          layout="position"
                          initial={reduce ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ ...motionTokens.standard, delay: Math.min(i, 6) * 0.05 }}
                          className="relative cursor-pointer rounded-2xl bg-card p-4 ring-1 ring-border transition-[box-shadow,transform] duration-200 hover:ring-input active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:-mx-3 lg:rounded-2xl lg:bg-transparent lg:px-3 lg:py-3.5 lg:ring-0 lg:after:absolute lg:after:inset-x-3 lg:after:bottom-0 lg:after:h-px lg:after:bg-border lg:last:after:hidden lg:hover:bg-muted/40"
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
                  {fares.items.some((o) => o.listedCurrency) ? `, converted from ${[...new Set(fares.items.map((o) => o.listedCurrency).filter(Boolean))].join(", ")} at today’s rate, so approximate` : ""}, and change quickly.
                </Notice>
              </div>
            </motion.div>
          )}
        </div>
      )}

      <FlightFilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} items={fares.items} view={view} onChange={(v) => { setView(v); setShowAll(false); }} shown={offers.length} currency={currency} />

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
