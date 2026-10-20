"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "@/components/motion-primitives";
import { ArrowUpRight, Armchair, Check, Clock, Luggage, Plane, Ticket, X, type LucideIcon } from "lucide-react";
import { useTripPanelMaybe, type FlightOffer, type FlightRoute } from "@/components/TripPanelProvider";
import { Badge, Notice, money, prettyDate, type } from "@/features/conversation/ui/blocks/ui";
import { arrivalDayOffset } from "@/features/conversation/ui/blocks/FlightFilters";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { AirlineMark, OtherFlights } from "./OtherFlights";
import { ReturnFlights } from "./ReturnFlights";
import { Journey, type FullLeg, clock, dayOf, eyebrow, hm, isRestriction, journeyLegs, sameFlight, stopsLabel } from "./FlightJourney";
import { cn } from "@/lib/utils";

/**
 * One flight, laid out like the boarding pass it stands in for: the two airports large, the times
 * beneath, a perforated fold, then the small print. Below it, the other flights from the same
 * search so the choice stays in view.
 */
export function FlightDetail({ flight, route }: { flight: FlightOffer; route: FlightRoute }) {
  const ctx = useTripPanelMaybe();
  const tripId = useTripDataMaybe()?.tripId;
  const roundTrip = Boolean(route.returnDate);
  const reduce = useReducedMotion();
  const offers = route.offers ?? [];
  const price = Number(flight.price);
  // Ties do not count: two flights at the same price are neither of them the lowest.
  const cheapest = offers.length > 1 && offers.every((o) => sameFlight(o, flight) || Number(o.price) > price);
  const fastest = offers.length > 1 && offers.every((o) => sameFlight(o, flight) || o.durationMinutes > flight.durationMinutes);
  const others = offers.filter((o) => !sameFlight(o, flight)).sort((a, b) => Number(a.price) - Number(b.price));
  const dayOffset = arrivalDayOffset(flight.departAt, flight.arriveAt);
  const city = (place: string) => place.split(",")[0].trim();
  const from = flight.originAirport ?? route.origin;
  const to = flight.destinationAirport ?? route.destination;
  const expired = flight.expiresAt ? new Date(flight.expiresAt).getTime() < Date.now() : false;
  const facts = [
    flight.cabinClass ? { icon: Armchair, label: "Cabin", value: flight.cabinClass } : null,
    flight.baggage ? { icon: Luggage, label: "Baggage", value: flight.baggage } : null,
    flight.flightNumbers?.length ? { icon: Ticket, label: flight.flightNumbers.length > 1 ? "Flights" : "Flight", value: flight.flightNumbers.join(" · ") } : null,
    flight.aircraft ? { icon: Plane, label: "Aircraft", value: flight.aircraft } : null,
  ].filter((f): f is { icon: LucideIcon; label: string; value: string } => f !== null);
  // A card saved before the journey was kept has only its airports and flight numbers. The first time its journey is
  // opened, the same search is asked again and the matching fare's full legs replace them.
  const [fetched, setFetched] = useState<FullLeg[] | null>(null);
  const [loadingLegs, setLoadingLegs] = useState(false);
  const asked = useRef(false);
  useEffect(() => {
    asked.current = false;
    setFetched(null);
    setLoadingLegs(false);
  }, [flight.id]);
  const legs = fetched ?? journeyLegs(flight, route.origin, route.destination);
  const journey = legs.length > 1;
  const loadFull = () => {
    if (asked.current || fetched || (flight.legs && flight.legs.length > 1) || !tripId || !flight.id?.startsWith("serp:")) return;
    asked.current = true;
    setLoadingLegs(true);
    fetch(`/api/trips/${tripId}/flights`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: route.origin, to: route.destination, fromId: route.originId, toId: route.destinationId, departureDate: route.departureDate ?? flight.departAt.slice(0, 10), ...(route.returnDate ? { returnDate: route.returnDate } : {}) }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { items?: FlightOffer[] } | null) => {
        const hit = body?.items?.find((o) => o.id === flight.id);
        if (hit?.legs && hit.legs.length > 1) setFetched(hit.legs);
      })
      .catch(() => undefined)
      .finally(() => setLoadingLegs(false));
  };
  const exampleDate = /^example date/i.test(route.dateNote ?? "");
  const when = route.returnDate ? `${dayOf(flight.departAt)} – ${prettyDate(route.returnDate) ?? route.returnDate}` : dayOf(flight.departAt);
  // Where the connections sit along the line, and where the plane is: mid-route when it is nonstop, nearing the end when it connects.
  const stops = flight.layoverAirports ?? [];
  const stopAt = (i: number) => `${((i + 1) / (stops.length + 1)) * 72}%`;
  const searchUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${route.origin} to ${route.destination} on ${flight.departAt.slice(0, 10)}${route.returnDate ? ` through ${route.returnDate}` : ""}`)}`;

  return (
    <div className="space-y-7 p-5 pb-6 sm:p-6 sm:pb-6">
      <Reveal delay={0} y={10}><header className="space-y-4">
        <div className="flex items-start gap-4">
          <AirlineMark offer={{ ...flight, legs: fetched ?? flight.legs }} className="size-12" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-balance sm:text-2xl">{flight.airline}</h2>
            <p className={cn(type.meta, "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1")}>
              {flight.operatingAirline && flight.operatingAirline !== flight.airline && <span>Operated by {flight.operatingAirline}</span>}
              <span className="tabular-nums">{when}</span>
              {exampleDate && <Badge className="h-5">Example date</Badge>}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-2xl font-light leading-none tabular-nums tracking-[-0.03em] sm:text-3xl">
              {flight.listedCurrency && <span className="mr-1 text-xl font-normal text-muted-foreground">≈</span>}
              {money(flight.price, flight.currency, true)}
            </p>
            <p className={cn(type.meta, "mt-1.5")}>per person{roundTrip ? ", round trip" : ""}</p>
            {flight.listedCurrency && flight.listedPrice && (
              <p className={cn(type.meta, "mt-0.5")}>Airline lists {money(flight.listedPrice, flight.listedCurrency, true)}</p>
            )}
          </div>
        </div>
        {(cheapest || fastest) && (
          <div className="flex flex-wrap gap-1.5">
            {cheapest && <Badge tone="positive" icon={Check}>Lowest fare</Badge>}
            {fastest && <Badge tone="brand" icon={Clock}>Fastest</Badge>}
          </div>
        )}
      </header></Reveal>

      <Reveal delay={0.06} y={10}><section aria-label="Boarding pass" className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
        {/* A warm wash from the top edge, the way a pass catches the light at the gate. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-coral/[0.08] via-coral/[0.03] to-transparent" />

        <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 px-6 pt-6">
          <div>
            <p className={eyebrow}>Departs</p>
            <p className="mt-2 font-display text-[2rem] font-light leading-none tracking-[-0.04em] sm:text-5xl">{from}</p>
            <p className={cn(type.meta, "mt-2 truncate")}>{city(route.origin)}</p>
          </div>
          <div className="flex min-w-0 flex-col items-center pt-[1.6rem]">
            {/* The path is as tall as the code beside it, so its centre is the code's centre. */}
            <div className="relative h-12 w-full" aria-hidden>
              <span className="absolute left-0 top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-muted-foreground bg-card" />
              <span className="absolute inset-x-1 top-1/2 h-px bg-gradient-to-r from-border via-muted-foreground/50 to-border" />
              <span className="absolute right-0 top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-foreground" />
              {stops.map((code, i) => (
                <span key={code + i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: stopAt(i) }}>
                  <span className="block size-2.5 rounded-full border-2 border-coral bg-card" />
                  <span className="absolute left-1/2 top-4 -translate-x-1/2 text-[11px] max-lg:text-xs font-medium tracking-wide text-muted-foreground">{code}</span>
                </span>
              ))}
              <motion.span
                className="absolute top-1/2 -translate-x-1/2 -translate-y-[1.35rem]"
                initial={reduce ? false : { left: "0%" }}
                animate={{ left: stops.length ? "84%" : "50%" }}
                style={reduce ? { left: stops.length ? "84%" : "50%" } : undefined}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
              >
                <Plane className="size-5 rotate-45 text-coral" strokeWidth={1.75} />
              </motion.span>
            </div>
            <p className="mt-1 text-sm font-medium whitespace-nowrap tabular-nums">{hm(flight.durationMinutes)}</p>
            <p className={cn(type.meta, "whitespace-nowrap tabular-nums")}>{stopsLabel(flight)}</p>
          </div>
          <div className="text-right">
            <p className={eyebrow}>Arrives</p>
            <p className="mt-2 font-display text-[2rem] font-light leading-none tracking-[-0.04em] sm:text-5xl">{to}</p>
            <p className={cn(type.meta, "mt-2 truncate")}>{city(route.destination)}</p>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-x-4 px-6">
          <div>
            <p className="font-display text-2xl font-semibold leading-none tabular-nums tracking-[-0.02em]">{clock(flight.departAt)}</p>
            <p className={cn(type.meta, "mt-1.5")}>{dayOf(flight.departAt)}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-semibold leading-none tabular-nums tracking-[-0.02em]">
              {clock(flight.arriveAt)}
              {dayOffset > 0 && <sup className="ml-0.5 text-xs font-normal text-muted-foreground">+{dayOffset}</sup>}
            </p>
            <p className={cn(type.meta, "mt-1.5")}>{dayOf(flight.arriveAt)}</p>
          </div>
        </div>

        {/* The fold: a perforation between the route and the small print, with the notches a torn pass has. */}
        {(facts.length > 0 || journey) && (
          <>
            <div className="relative mt-6" aria-hidden>
              <div className="mx-5 border-t-2 border-dashed border-border" />
              <span className="absolute -left-3 -top-3 size-6 rounded-full border border-border bg-background" />
              <span className="absolute -right-3 -top-3 size-6 rounded-full border border-border bg-background" />
            </div>
            {/* The small print as chips that wrap to the width, so three short facts sit on one line and a long one gets its own. */}
            {facts.length > 0 && (
              <ul className={cn("relative flex flex-wrap gap-2 px-6 pt-5", journey ? "pb-5" : "pb-6")}>
                {facts.map(({ icon: Icon, label, value }) => (
                  <li key={label} className="inline-flex max-w-full items-start gap-2 rounded-xl bg-muted px-3 py-2 text-sm font-medium leading-snug">
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                    <span className="sr-only">{label}: </span>
                    <span className="min-w-0">{value}</span>
                  </li>
                ))}
              </ul>
            )}
            {journey && <div className={facts.length === 0 ? "mt-5" : undefined}><Journey legs={legs} loading={loadingLegs} onOpen={loadFull} /></div>}
          </>
        )}
        {facts.length === 0 && !journey && <div className="h-6" />}
      </section></Reveal>

      {(flight.fareConditions?.length || flight.expiresAt) && (
        <Reveal delay={0.14} y={10}><section aria-label="Fare rules" className="space-y-3">
          <h3 className={type.section}>Fare rules</h3>
          {flight.fareConditions && flight.fareConditions.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              {flight.fareConditions.map((rule) => {
                const restricted = isRestriction(rule);
                const Icon = restricted ? X : Check;
                return (
                  <li key={rule} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", restricted ? "bg-caution-soft text-caution" : "bg-positive-soft text-positive")}>
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <span>{rule}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {flight.expiresAt && (
            <Notice tone={expired ? "caution" : "neutral"}>
              {expired
                ? "This fare may no longer be available. Check the current price before you plan around it."
                : `Fare held until ${new Date(flight.expiresAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`}
            </Notice>
          )}
        </section></Reveal>
      )}

      {roundTrip && tripId && flight.departureToken && (
        <Reveal delay={0.18} y={10}>
          <ReturnFlights tripId={tripId} flight={flight} route={route} />
        </Reveal>
      )}

      {others.length > 0 && (
        <Reveal delay={0.2} y={10}>
          <OtherFlights roundTrip={roundTrip} flight={flight} offers={offers} others={others} onPick={(o) => ctx?.openPanel({ kind: "flight", flight: o, route })} />
        </Reveal>
      )}

      {/* The way on stays in reach while the page scrolls: the button rides the bottom edge over a fade. */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-6 space-y-2.5 bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-5 pt-8 sm:-mx-6 sm:px-6">
        <a
          href={searchUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lift transition-[opacity,transform] hover:opacity-90 active:scale-[0.985]"
        >
          See this route on Google Flights <ArrowUpRight className="size-4" aria-hidden />
        </a>
        <p className={cn(type.meta, "text-center")}>Fares change quickly, and Roam can’t book flights. Check the airline before you commit.</p>
      </div>
    </div>
  );
}
