"use client";

import { useMemo, useState } from "react";
import { Info, Pencil, Plane, ChevronDown, X } from "lucide-react";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { cn } from "@/lib/utils";
import { FlightHero, FlightJourney, FlightPicks, FlightPicksSkeleton, FlightRowBody, offerKey, pickFares } from "./FlightWidget";
import { WidgetFoot } from "./Widget";
import { AnimatePresence, motion } from "motion/react";
import { motionTokens } from "@/components/motion-primitives";
import { DEFAULT_FLIGHT_VIEW, FlightControls, applyFlightView, type FlightView } from "./FlightFilters";
import { FlightRowsSkeleton, FlightSearchBar, PriceInsight, useFlightSearch } from "./FlightSearch";
import { shiftIso } from "./SearchBarParts";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { resolveCurrency } from "@/lib/currency";
import { Notice, controlSecondary, money, prettyDate, textAction, type } from "./ui";
import { BlockHandlers } from "./blockShared";

/** Time of day for a departure/arrival ("6:20 PM"); a bare or unparsable value is shown as given. */
function clock(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

type FlightsBlockData = Extract<AssistantBlock, { type: "flights" }>;

export function FlightsBlockView({ block, tripId, onOpenPanel }: { block: FlightsBlockData; tripId: string } & Pick<BlockHandlers, "onOpenPanel">) {
  const [view, setView] = useState<FlightView>(DEFAULT_FLIGHT_VIEW);
  const trip = useTripDataMaybe()?.data?.trip;
  const tripDates = { start: trip?.start_date ?? null, end: trip?.end_date ?? null };
  const fares = useFlightSearch(block, tripId, tripDates);
  const [routeOpen, setRouteOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { query } = fares;
  const roundTrip = query.ret !== null;
  const offers = applyFlightView(fares.items, view);
  const filtersOn = view.nonstop || view.changes || view.airport !== null;
  const loading = fares.status === "loading";
  const ready = fares.status === "ready";
  const day = query.depart ? prettyDate(query.depart) : undefined;
  const picks = useMemo(() => pickFares(fares.items), [fares.items]);
  const chosenPick = picks.find((p) => offerKey(p.offer) === chosen) ?? picks[0] ?? null;
  // A long list shows its best rows and the rest on request; the card never grows without limit.
  const ROWS = 6;
  const shown = showAll || filtersOn ? offers : offers.slice(0, ROWS);
  // Phone: the two picks above are the best and the cheapest; the list shows two others, and the rest on request.
  const pickKeys = new Set(picks.map((p) => offerKey(p.offer)));
  let phoneSeen = 0;
  const phoneHide = shown.map((o) => (showAll ? false : pickKeys.has(offerKey(o)) ? true : ++phoneSeen > 2));
  // A new search starts with a clean view: an airport filter from the last one may not exist in this one.
  const resetView = () => {
    setView((v) => ({ ...v, airport: null }));
    setChosen(null);
    setShowAll(false);
  };
  const change = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    resetView();
    fn(...args);
  };
  // A card saved before the trip had a currency (or before prices were converted) keeps its old one until it is searched again.
  const tripCurrency = resolveCurrency(useTripDataMaybe()?.data?.preferences);
  const shownCurrency = fares.items[0]?.currency;
  const staleCurrency = !fares.searched && ready && Boolean(shownCurrency) && shownCurrency !== tripCurrency && !fares.items.some((o) => o.listedCurrency);
  const dateNote = query.depart ? `${fares.assumed ? `Example date ${query.depart} — no travel date set yet` : `Departing ${query.depart}`}${query.ret ? `, returning ${query.ret}` : ""}` : block.dateNote;
  const searchForBar = { ...fares, setFrom: change(fares.setFrom), setTo: change(fares.setTo), swap: change(fares.swap), setDepart: change(fares.setDepart), setReturn: change(fares.setReturn), setRoundTrip: change(fares.setRoundTrip), setBoth: change(fares.setBoth) };
  const lowest = fares.items.length ? fares.items.reduce((best, o) => (Number(o.price) < Number(best.price) ? o : best), fares.items[0]) : null;
  const shortest = fares.items.length ? Math.min(...fares.items.map((o) => o.durationMinutes)) : 0;
  const fromName = query.fromLabel.split(",")[0];
  const toName = query.toLabel.split(",")[0];
  // No airport code known: the city name stands in for it.
  const fromCode = fares.items[0]?.originAirport ?? (fromName.length <= 14 ? fromName : fromName.slice(0, 3).toUpperCase());
  const toCode = fares.items[0]?.destinationAirport ?? (toName.length <= 14 ? toName : toName.slice(0, 3).toUpperCase());
  const panelFor = (offer: FlightsBlockData["items"][number]) => ({ kind: "flight" as const, flight: offer, route: { origin: query.fromLabel, destination: query.toLabel, dateNote, retrievedAt: fares.retrievedAt, offers: fares.items, departureDate: query.depart ?? undefined, returnDate: query.ret ?? undefined, originId: query.fromId, destinationId: query.toId } });
  const footNote = (
    <Notice>
      Prices are per person{roundTrip ? ", for the round trip" : ""}{fares.currency ? `, in ${fares.currency}` : ""}
      {fares.items.some((o) => o.listedCurrency) ? `, converted from ${[...new Set(fares.items.map((o) => o.listedCurrency).filter(Boolean))].join(", ")} at today’s rate, so approximate` : ""}. Fares change quickly — check the airline or a travel site before booking.
      {staleCurrency && <button type="button" onClick={() => { resetView(); fares.retry(); }} className={cn(textAction, "ml-1.5 align-baseline")}>Show prices in {tripCurrency}</button>}
    </Notice>
  );
  return (
    <section aria-label="Flights" className="roam-widget @container relative overflow-hidden rounded-3xl border border-border bg-card shadow-widget">
      <div className="px-[1.125rem] pt-[1.125rem] lg:hidden">
        <p className="eyebrow flex items-center gap-1.5 text-coral-ink"><Plane className="size-4" aria-hidden />Flights · {roundTrip ? "round trip" : "one way"}{day ? ` · ${day}` : ""}</p>
        <h3 className="mt-0.5 font-display text-widget leading-6 font-medium tracking-[-0.012em] text-balance">{fromName} to {toName}</h3>
        <button
          type="button"
          onClick={() => { setSearchOpen((v) => !v); setRouteOpen(!searchOpen); }}
          aria-expanded={searchOpen}
          className="mt-3 flex min-h-10 w-full items-center gap-2 rounded-full bg-muted px-4 text-left text-sm"
        >
          <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{day ?? "Pick a date"}</b>{fares.items[0] && ready ? ` · ${fromCode} to ${toCode}` : ""}</span>
          <span className="shrink-0 font-semibold text-coral-ink">{searchOpen ? "Done" : "Edit search"}</span>
        </button>
      </div>
      <div className={cn("max-lg:hidden")}>
      <FlightHero
        eyebrow={`Flights · ${roundTrip ? "round trip" : "one way"}${day ? ` · ${day}` : ""}`}
        title={<>{fromName} to {toName}</>}
        from={{ code: fromCode, name: fromName }}
        to={{ code: toCode, name: toName }}
        duration={ready ? shortest : 0}
        dim={!ready}
        chip={loading ? <span className="inline-flex h-7 items-center rounded-full border border-white/25 bg-white/15 px-3 text-xs font-medium text-white">Searching…</span> : fares.status === "empty" && !fares.problem ? <span className="inline-flex h-7 items-center rounded-full border border-white/25 bg-white/15 px-3 text-xs font-medium text-white">No flights</span> : lowest && ready ? <span className="inline-flex h-7 items-center rounded-full border border-white/25 bg-white/15 px-3 text-xs font-semibold text-white tabular-nums">From {money(lowest.price, lowest.currency, true)}</span> : undefined}
        right={
          <button
            type="button"
            onClick={() => setRouteOpen((v) => !v)}
            aria-expanded={routeOpen}
            aria-controls="flight-route-editor"
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium backdrop-blur-md transition-[background-color,border-color,color,transform] active:scale-95", routeOpen ? "border-white/50 bg-white/25 text-white" : "border-white/25 bg-white/10 text-white/90 hover:bg-white/20")}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={routeOpen ? "done" : "edit"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="inline-flex items-center gap-1.5">
                {routeOpen ? <X className="size-3.5" aria-hidden /> : <Pencil className="size-3.5" aria-hidden />}
                {routeOpen ? "Done" : "Edit route"}
              </motion.span>
            </AnimatePresence>
          </button>
        }
      />
      </div>
      {/* While the search is being edited on a phone, the form comes first and the fares it will change sit beneath it. */}
      <div className="flex flex-col">
        <div className={cn(searchOpen && "max-lg:order-2 max-lg:pb-1")}>
          {loading && fares.items.length === 0 ? <FlightPicksSkeleton /> : ready && picks.length > 0 && <FlightPicks picks={picks} selected={chosenPick ? offerKey(chosenPick.offer) : null} onSelect={setChosen} roundTrip={roundTrip} />}
        </div>
        <div className={cn(!searchOpen && "max-lg:hidden")}>
          <FlightSearchBar search={searchForBar} tripId={tripId} trip={tripDates} routeOpen={routeOpen} onRouteDone={() => setRouteOpen(false)} />
        </div>
      </div>
      {ready && fares.assumed && (
        <div role="note" className="mx-4 mb-1 flex items-center gap-2.5 rounded-2xl bg-secondary px-3.5 py-3 text-sm text-foreground [&_svg]:text-caution @[34rem]:mx-5">
          <Info className="size-4 shrink-0" aria-hidden />
          <span>No travel date set, so these are example prices. Pick your date above.</span>
        </div>
      )}
      {fares.insights && ready && fares.currency && <div className={cn("max-lg:hidden")}><PriceInsight insights={fares.insights} currency={fares.currency} /></div>}
      {ready && chosenPick && <div className={cn("max-lg:hidden")}><FlightJourney offer={chosenPick.offer} labels={chosenPick.labels} roundTrip={roundTrip} onDetails={onOpenPanel ? () => onOpenPanel(panelFor(chosenPick.offer)) : undefined} tripCurrency={tripCurrency} /></div>}
      {fares.items.length > 0 && fares.status !== "error" && (
        <div className={cn("mt-4 transition-opacity duration-200", loading && "pointer-events-none opacity-50", !showAll && "max-lg:hidden")} aria-busy={loading}>
          <FlightControls items={fares.items} view={view} onChange={setView} shown={offers.length} />
        </div>
      )}
      {fares.status === "error" && (
        <motion.div role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.standard} className="space-y-3 px-4 py-9 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-caution-soft text-caution" aria-hidden><Info className="size-6" /></span>
          <p className="font-display text-lg font-medium">We couldn’t load flights{day ? ` for ${day}` : ""} just now</p>
          <p className={type.meta}>The fares service didn’t answer. Nothing is wrong with your search.</p>
          <button type="button" onClick={fares.retry} className={controlSecondary}>Try again</button>
        </motion.div>
      )}
      {fares.status === "empty" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.standard} className="space-y-3 px-4 py-9 text-center">
          {fares.problem ? (
            <>
              <p className="font-display text-lg font-medium">We couldn’t find “{fares.problem}”</p>
              <p className={type.meta}>Try a nearby city, or the airport’s three-letter code.</p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-medium">No flights{day ? ` on ${day}` : ""}{roundTrip && query.ret ? ` to ${prettyDate(query.ret)}` : ""}</p>
              <p className={type.meta}>Nothing is flying this route that day. Nearby days often have fares.</p>
              {query.depart && (
                <div className="flex justify-center gap-2">
                  <button type="button" onClick={() => searchForBar.setDepart(shiftIso(query.depart!, -1))} className={controlSecondary}>Day before</button>
                  <button type="button" onClick={() => searchForBar.setDepart(shiftIso(query.depart!, 1))} className={controlSecondary}>Day after</button>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}
      {fares.status !== "error" && fares.status !== "empty" && (
      <div>
      {loading && <FlightRowsSkeleton />}
      {ready && offers.length === 0 && (
        <div className="space-y-2 px-4 py-8 text-center">
          <p className="font-display text-lg font-medium">No flights match those filters</p>
          <p className={type.meta}>The picks above ignore filters. Clear them to see all {fares.items.length}.</p>
          <button type="button" onClick={() => setView({ ...DEFAULT_FLIGHT_VIEW, sort: view.sort })} className={controlSecondary}>Clear filters</button>
        </div>
      )}
      {ready && fares.items.length > 1 && (
      <ul className="divide-y divide-border">
        {shown.map((offer, offerIndex) => {
          const flightPanel = panelFor(offer);
          const openFlight = () => onOpenPanel?.(flightPanel);
          const key = offerKey(offer);
          const isPicked = chosenPick ? offerKey(chosenPick.offer) === key : false;
          return (
            <motion.li
              layout="position"
              transition={{ ...motionTokens.standard, delay: fares.searched ? Math.min(offerIndex, 6) * 0.045 : 0 }}
              initial={fares.searched ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              key={key + offerIndex}
              className={cn("px-4 py-3.5 @[34rem]:px-[1.125rem]", phoneHide[offerIndex] && "max-lg:hidden", onOpenPanel && "cursor-pointer transition-colors hover:bg-muted/35 focus-visible:bg-muted/45 focus-visible:outline-none")}
              onClick={onOpenPanel ? () => openFlight() : undefined}
              onKeyDown={onOpenPanel ? (event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openFlight();
                }
              } : undefined}
              role={onOpenPanel ? "button" : undefined}
              tabIndex={onOpenPanel ? 0 : undefined}
              aria-label={onOpenPanel ? `Open details for ${offer.airline}, ${clock(offer.departAt)} to ${clock(offer.arriveAt)}` : undefined}
            >
              <FlightRowBody offer={offer} roundTrip={roundTrip} cheapest={offers.length > 1 && offer === lowest} selected={isPicked} onDetails={onOpenPanel ? openFlight : undefined} />
            </motion.li>
          );
        })}
      </ul>
      )}
      {ready && !showAll && offers.length > 2 + pickKeys.size && (
        <div className="px-[1.125rem] pb-1 pt-2 lg:hidden">
          <button type="button" onClick={() => setShowAll(true)} className="flex h-12 w-full items-center justify-center rounded-full border border-hairline text-[0.9375rem] font-semibold">See all {offers.length} flights</button>
        </div>
      )}
      {ready && !showAll && !filtersOn && offers.length > ROWS && (
        <div className={cn("border-t border-border px-4 py-3.5 text-center", "max-lg:hidden")}>
          <button type="button" onClick={() => setShowAll(true)} className={controlSecondary}>Show {offers.length - ROWS} more <ChevronDown className="size-3.5" aria-hidden /></button>
        </div>
      )}
      </div>
      )}
      <WidgetFoot foot={footNote} />
    </section>
  );
}
