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
import { useTripPanelMaybe, type FlightOffer, type FlightRoute, type PanelState } from "@/components/TripPanelProvider";
import { clock } from "@/features/conversation/ui/blocks/flightCopy";
import { FlightDetail } from "@/features/conversation/ui/panels/FlightDetail";
import { journeyLegs } from "@/features/conversation/ui/panels/FlightJourney";
import { formatDuration } from "@/lib/application/flight-risks";
import { useMediaQuery } from "@/lib/use-media-query";
import { activeFlightFilters, ALL_SORTS, applyFlightView, availableFilters, DEFAULT_FLIGHT_VIEW, FlightControls, TIMES_OF_DAY, type FlightView } from "@/features/conversation/ui/blocks/FlightFilters";
import { FlightRowsSkeleton, useFlightSearch, type FlightItems } from "@/features/conversation/ui/blocks/FlightSearch";
import { cheapestOffer, FlightPicks, FlightPicksSkeleton, FlightRowBody, offerKey, pickFares } from "@/features/conversation/ui/blocks/FlightWidget";
import { SearchSweep } from "@/features/conversation/ui/blocks/SearchBarParts";
import { controlSecondary, money, prettyDate, type } from "@/features/conversation/ui/blocks/ui";
import { cachedGet } from "@/lib/client/cached-get";
import { AiSearchBar } from "@/components/AiSearchBar";
import { ListingAsk } from "@/components/ListingAsk";
import { AnswerSkeleton, AnswerText } from "@/components/AnswerText";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { useShowMore } from "@/lib/use-show-more";
import { StandaloneHeader } from "@/components/StandaloneHeader";
import { FrostedGround, STICKY_HEAD, stickyRow, TripFrostedGround, tripStickyRow, useStickyBar, useTripStickyRow } from "@/components/StickyBar";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { cn } from "@/lib/utils";
import { airlineNote, canSearch, datesLine, draftFromTrip, routeLine, travellersLine, type FlightDraft } from "../domain/flights-page";
import { RoutePill } from "@/features/transport/ui/RoutePill";
import { FlightIdeas } from "./FlightIdeas";
import { clearSection, FlightFilterSheet, SECTION_TITLES, SectionBody, sectionActive, type FilterSection } from "./FlightFilterSheet";
import { FlightSearchSheet } from "./FlightSearchSheet";

/** Rows shown under the picks before "More". */
const ROWS = 6;

/** Google's read on the dates, as one quiet line on one row (not a banner): low, typical or high for the route, and what is usual. */
function InsightLine({ level, usual }: { level: "low" | "typical" | "high"; usual: string | null }) {
  const tone = { low: { text: "Low prices", dot: "bg-positive" }, typical: { text: "Typical prices", dot: "bg-muted-foreground/60" }, high: { text: "High prices", dot: "bg-caution" } }[level];
  return (
    <p role="note" className="flex items-baseline gap-x-2.5 text-sm">
      <span className="inline-flex shrink-0 items-center gap-2 font-medium"><span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone.dot)} />{tone.text}</span>
      {usual && <span className="min-w-0 truncate text-muted-foreground">{usual}</span>}
    </p>
  );
}

/**
 * Flights, as a page of its own (docs: the v2 renders). One pill in the header names the search and opens it; under it, the days and travellers
 * in the same wide pill Stay uses. Before a search the page is a few places worth flying to; after one it is the best fare first, then the rest.
 * The search is a sheet that drops from the top: it is asked once, and priced once.
 */
/** What the open flight says about itself, in the shape the listing chat reads: the fare, the times, the stops, the layovers leg by leg, the cabin and the bag. */
function flightItem(f: FlightOffer, route: FlightRoute) {
  const legs = journeyLegs(f, route.origin, route.destination);
  const wait = legs.reduce((sum, l) => sum + (l.layoverMinutes ?? 0), 0);
  const detail = [f.airline, f.stops === 0 ? "nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`, formatDuration(f.durationMinutes), f.cabinClass, f.baggage ? `bags: ${f.baggage}` : null].filter(Boolean).join(", ");
  const journey = legs.length > 1
    ? `Journey: ${legs.map((l) => `${l.from} to ${l.to}${l.flightNumber ? ` (${l.flightNumber})` : ""}${l.departAt && l.arriveAt ? ` ${l.departAt.slice(11, 16)}-${l.arriveAt.slice(11, 16)}` : ""}${l.layoverMinutes ? `, then a ${formatDuration(l.layoverMinutes)} layover${l.overnight ? " overnight" : ""}` : ""}`).join("; ")}.${wait ? ` Layovers total ${formatDuration(wait)}.` : ""}`
    : "";
  return {
    name: routeLine(route.origin, route.destination),
    detail: detail.slice(0, 200),
    price: `${f.price} ${f.currency} per person${route.returnDate ? ", round trip" : ", one way"}`,
    when: `${f.departAt} to ${f.arriveAt}`,
    ...(journey || f.fareConditions?.length ? { summary: [journey, f.fareConditions?.length ? `Fare rules: ${f.fareConditions.join("; ")}.` : ""].filter(Boolean).join(" ").slice(0, 700) } : {}),
  };
}

export function FlightsSurface({ tripId, active = true, onSearchActive }: { tripId: string | null; /** In a trip: told when there is a search to cancel (a search on screen or an answer), with the way to cancel it; null when the page is as it started. */ onSearchActive?: (cancel: (() => void) | null) => void; /** False while another view of the page (My flights) is in front: the search stays mounted but gives up the header. */ active?: boolean }) {
  const reduce = useReducedMotion();
  const trip = useTripDataMaybe()?.data?.trip;
  const standalone = tripId === null;
  // With no trip the page is one column: a sticky header, the model's answer, a row of pills that sticks under the header, then the flights (see StickyBar).
  const { headRef, rowRef, stuck } = useStickyBar();
  // In a trip the header is the trip's own, and the row sticks under that instead.
  const tripRow = useTripStickyRow();
  const [answer, setAnswer] = useState<string | null>(null);
  // An ask is on its way: the answer and the fares show as loading until it comes back.
  const [asking, setAsking] = useState(false);
  // The airlines an ask named: once the fares are in, the answer adds what each of them costs.
  const [askedAirlines, setAskedAirlines] = useState<string[]>([]);
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
  // What an ask in words filled in but could not search on yet (no place or day): the search sheet opens with it.
  const [prefill, setPrefill] = useState<FlightDraft | null>(null);
  const [view, setView] = useState<FlightView>(DEFAULT_FLIGHT_VIEW);
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

  // Arriving opens the search, so the way in is one tap and not a page of pictures. From the home page's Flights tile it opens every time (as Stays and
  // Eat do); in a trip only the first visit of a session does, filled in from the trip.
  useEffect(() => {
    if (started) return;
    if (!standalone) {
      const key = `flights:opened:${tripId ?? "home"}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch { /* storage blocked: the pill is still there */ }
    }
    setSheet({ open: true });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // With no trip the arrow out of a search goes back to Flights' own home (the ideas); from there it leaves for the trips.
  const backHome = () => { setAsked(null); setAnswer(null); setAskedAirlines([]); setIdea(null); setPrefill(null); setView(DEFAULT_FLIGHT_VIEW); window.scrollTo(0, 0); };
  const searchActive = !standalone && (started || Boolean(answer));
  const cancelRef = useRef<() => void>(() => undefined);
  cancelRef.current = backHome;
  useEffect(() => {
    onSearchActive?.(searchActive ? () => cancelRef.current() : null);
    return () => onSearchActive?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the callback is the page's setter; only the state matters
  }, [searchActive]);
  const openSheet = useCallback((focus?: "to" | "dates") => setSheet({ open: true, focus }), []);
  // `keepAnswer`: the search came from the Ask bar and brings its own answer; any other search puts the old one away.
  const search = (next: FlightDraft, keepAnswer = false) => {
    if (!keepAnswer) { setAnswer(null); setAskedAirlines([]); }
    setAsked(next);
    setIdea(null);
    setPrefill(null);
    setSheet((s) => ({ ...s, open: false }));
    setView(DEFAULT_FLIGHT_VIEW);
   
    fares.search({ fromLabel: next.fromLabel, toLabel: next.toLabel, depart: next.depart, ret: next.ret, adults: next.adults });
  };

  // The ask bar's sentence: what it names is put on the draft; with a place and a day it searches at once, otherwise the sheet opens with what was read.
  const applyAsk = (d: AiSearchDirective) => {
    const depart = d.depart ?? draft.depart;
    const next: FlightDraft = {
      ...draft,
      fromLabel: d.from?.trim() || draft.fromLabel,
      // A sentence that changes the days of the search on screen keeps its destination; one that only wishes ("somewhere warm") does not inherit the old one.
      toLabel: d.to?.trim() || idea || (d.depart || d.ret || d.oneWay ? draft.toLabel : ""),
      depart,
      ret: d.oneWay ? null : (d.ret ?? (draft.ret && depart && draft.ret > depart ? draft.ret : null)),
      adults: d.adults ?? draft.adults,
    };
    if (canSearch(next)) { search(next, true); setAnswer(d.answer?.trim() || null); setAskedAirlines(d.airlines ?? []); return; }
    // The answer says what is missing ("I need a destination"), so it replaces the one for the search still on screen.
    setAnswer(d.answer?.trim() || null);
    setPrefill(next);
    openSheet(next.toLabel.trim() ? "dates" : "to");
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
  // The rows under the picks: a few first, then the same "More" every list uses (a new filter or search starts the list again).
  const more = useShowMore(rest.length, view, { first: ROWS, step: 9 });
  const shown = rest.slice(0, more.visible);
  const lowest = cheapestOffer(offers);
  const dateNote = query.depart ? `Departing ${query.depart}${query.ret ? `, returning ${query.ret}` : ""}` : undefined;
  const panelFor = (offer: FlightItems[number]) => ({ kind: "flight" as const, flight: offer, route: { origin: query.fromLabel, destination: query.toLabel, dateNote, retrievedAt: fares.retrievedAt, offers: fares.items, departureDate: query.depart ?? undefined, returnDate: query.ret ?? undefined, originId: query.fromId, destinationId: query.toId, onChangeReturn: (day: string) => fares.setReturn(day) } });
  const openOffer = (key: string) => { const offer = offers.find((o) => offerKey(o) === key); if (offer) openPanel(panelFor(offer)); };
  const adults = query.adults ?? draft.adults;
  const day = query.depart ? prettyDate(query.depart) : undefined;
  const usual = fares.insights?.typicalLow && fares.insights.typicalHigh && currency ? `usually ${money(fares.insights.typicalLow, currency, true)} to ${money(fares.insights.typicalHigh, currency, true)}` : null;

  return (
    <div className="mx-auto w-full max-w-[40rem] pb-24 lg:pb-12">
      {/* Alone on the home page the header is one row: back to the trips, the search pill centred, and an empty circle's width to balance it. */}
      {standalone && <FrostedGround stuck={stuck} />}
      {!standalone && <TripFrostedGround stuck={tripRow.stuck} />}
      {standalone && (
        <div ref={headRef} className={STICKY_HEAD}>
          <StandaloneHeader onBack={started ? backHome : undefined}>{pill}</StandaloneHeader>
        </div>
      )}
      {(asking || answer) && <div className="mt-2">{asking ? <AnswerSkeleton /> : <AnswerText body={ready && currency ? [answer, airlineNote(askedAirlines, fares.items, { money: (n) => money(String(n), currency, true), duration: formatDuration })].filter(Boolean).join(" ") : (answer ?? "")} />}</div>}
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

      {!started && !asking && <FlightIdeas tripId={tripId} origin={draft.fromLabel || trip?.origin} destination={trip?.destination} onPick={(city) => { setIdea(city); openSheet("dates"); }} />}

      {!started && asking && (
        <div className="mt-4" aria-busy>
          <div className="[&>*]:mx-0! [&>*]:mt-0!"><FlightPicksSkeleton /></div>
          <div className="mt-4"><FlightRowsSkeleton /></div>
        </div>
      )}

      {started && (
        <div className="mt-4" aria-busy={loading || asking}>
          {(loading || asking) && (
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

          {ready && !asking && fares.items.length > 0 && (
            <motion.div key={fares.retrievedAt} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.standard}>
              {fares.insights && <div className="mb-4 mt-1 px-1"><InsightLine level={fares.insights.level} usual={usual} /></div>}
              {/* A phone: one row of pills, each showing what it is set to and opening the sheet at its group (the first opens it at the top). A desktop keeps its sort and filters inline. */}
              {/* The panel a pill opens floats over the flights under it (it does not push them down); a tap outside, Escape or the cross closes it. */}
              <div ref={(el) => { pillsRef.current = el; rowRef.current = el; tripRow.rowRef.current = el; }} className={cn("relative", standalone ? stickyRow(stuck).className : cn("lg:hidden", tripStickyRow(tripRow.stuck).className))} style={standalone ? stickyRow(stuck).style : tripStickyRow(tripRow.stuck).style}>
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
                          <button type="button" onClick={() => { setView(clearSection(view, openSection)); }} className="rounded-full px-2.5 py-1.5 text-sm font-medium text-ink-soft underline underline-offset-2 active:bg-muted">Clear</button>
                        )}
                        <button type="button" onClick={() => setOpenSection(null)} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted"><X className="size-4" aria-hidden /></button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <SectionBody section={openSection} items={fares.items} view={view} onChange={(v) => { setView(v); if (openSection === "sort" || openSection === "stops") setOpenSection(null); }} currency={currency} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              </div>
              <div className={cn("transition-opacity duration-200 max-lg:hidden", standalone && "hidden", loading && "pointer-events-none opacity-50")}>
                <FlightControls items={fares.items} view={view} onChange={(v) => { setView(v); }} shown={offers.length} />
              </div>
              {offers.length === 0 ? (
                <div className="mt-4">
                  <StateMessage icon={SearchX} title="No flights match" actions={<button type="button" onClick={() => setView({ ...DEFAULT_FLIGHT_VIEW, sort: view.sort })} className={stateButton.primary}>Clear filters</button>}>
                    Loosen a filter to see more flights.
                  </StateMessage>
                </div>
              ) : (
                <>
                  <div className="mt-5 [&>*]:mx-0! [&>*]:mt-0!"><FlightPicks adults={adults} picks={picks} selected={null} onSelect={openOffer} /></div>
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
                  {more.remaining > 0 && <ShowMoreButton next={more.next} visible={more.visible} total={rest.length} onClick={more.showMore} noun="flights" />}
                </>
              )}
            </motion.div>
          )}
        </div>
      )}

      <FlightFilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} items={fares.items} view={view} onChange={(v) => { setView(v); }} shown={offers.length} currency={currency} />

      <Sheet open={own !== null} onClose={() => setOwn(null)} side={wide ? "right" : "bottom"} ariaLabel="Flight details" className="lg:max-w-xl">
        {own && (
          <>
            <SheetHeader title={`${routeLine(own.route.origin, own.route.destination)}`} onClose={() => setOwn(null)} />
            <ListingAsk key={own.flight.id ?? `${own.flight.airline}-${own.flight.departAt}`} panel={{ kind: "flight", flight: own.flight, route: own.route }} subjectKey={`flight:${own.flight.id ?? `${own.flight.airline}-${own.flight.departAt}`}`} placeholder="Ask about this flight — is it a good one?" items={() => [flightItem(own.flight, own.route)]}>
              <FlightDetail flight={own.flight} route={own.route} onSwitch={(flight) => setOwn({ ...own, flight })} />
            </ListingAsk>
          </>
        )}
      </Sheet>

      <FlightSearchSheet open={sheet.open} focus={sheet.focus} onClose={() => setSheet((s) => ({ ...s, open: false }))} tripId={tripId} draft={prefill ?? (idea ? { ...draft, toLabel: idea } : draft)} onSearch={(d) => search(d)} />
      <AiSearchBar
        variant="dock"
        tripId={tripId}
        scope="flights"
        onPendingChange={setAsking}
        place={draft.fromLabel ? draft.fromLabel.split(",")[0]!.trim() : undefined}
        placeholder="Try “Toronto to Lisbon, Dec 10–17”"
        onDirective={applyAsk}
      />
    </div>
  );
}
