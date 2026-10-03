"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "@/components/motion-primitives";
import { ArrowUpRight, Check, Clock, Plane, X } from "lucide-react";
import { useTripPanelMaybe, type FlightOffer, type FlightRoute } from "@/components/TripPanelProvider";
import { Badge, Notice, money, prettyDate, surface, type } from "@/features/conversation/ui/blocks/ui";
import { arrivalDayOffset } from "@/features/conversation/ui/blocks/FlightFilters";
import { cn } from "@/lib/utils";

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
};
const dayOf = (iso: string) => prettyDate(iso.slice(0, 10)) ?? "";
const hm = (mins: number) => `${Math.floor(mins / 60)}h ${mins % 60}m`;
const stopsLabel = (o: FlightOffer) => (o.stops === 0 ? "Nonstop" : `${o.stops} stop${o.stops > 1 ? "s" : ""}`);
const sameFlight = (a: FlightOffer, b: FlightOffer) => (a.id && b.id ? a.id === b.id : a.airline === b.airline && a.departAt === b.departAt);
/** A fare rule that says "not" is a restriction; anything else is a permission. */
const isRestriction = (rule: string) => /\bnot\b|non-?refundable|no (?:changes|refunds?)/i.test(rule);

/**
 * One flight, laid out like the boarding pass it stands in for: the two airports large, the times
 * beneath, a perforated fold, then the small print. Below it, the other flights from the same
 * search so the choice stays in view.
 */
export function FlightDetail({ flight, route }: { flight: FlightOffer; route: FlightRoute }) {
  const ctx = useTripPanelMaybe();
  const reduce = useReducedMotion();
  const offers = route.offers ?? [];
  const price = Number(flight.price);
  const cheapest = offers.length > 1 && offers.every((o) => Number(o.price) >= price);
  const fastest = offers.length > 1 && offers.every((o) => o.durationMinutes >= flight.durationMinutes);
  const others = offers.filter((o) => !sameFlight(o, flight)).sort((a, b) => Number(a.price) - Number(b.price));
  const dayOffset = arrivalDayOffset(flight.departAt, flight.arriveAt);
  const city = (place: string) => place.split(",")[0].trim();
  const from = flight.originAirport ?? route.origin;
  const to = flight.destinationAirport ?? route.destination;
  const expired = flight.expiresAt ? new Date(flight.expiresAt).getTime() < Date.now() : false;
  const facts = [
    flight.cabinClass ? { label: "Cabin", value: flight.cabinClass } : null,
    flight.baggage ? { label: "Baggage", value: flight.baggage } : null,
    flight.aircraft ? { label: "Aircraft", value: flight.aircraft } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);
  const searchUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${route.origin} to ${route.destination} on ${flight.departAt.slice(0, 10)}`)}`;

  return (
    <div className="space-y-6 p-4 pb-8">
      <Reveal delay={0} y={10}><header className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h2 className="font-display text-2xl font-semibold leading-tight tracking-[-0.02em]">{flight.airline}</h2>
            <p className={type.meta}>
              {flight.operatingAirline && flight.operatingAirline !== flight.airline ? `Operated by ${flight.operatingAirline} · ` : ""}
              {route.dateNote ? route.dateNote.replace(/\d{4}-\d{2}-\d{2}/g, (m) => prettyDate(m) ?? m) : dayOf(flight.departAt)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-3xl font-semibold leading-none tabular-nums tracking-[-0.03em]">{money(flight.price, flight.currency)}</p>
            <p className={cn(type.meta, "mt-1")}>{flight.currency}</p>
          </div>
        </div>
        {(cheapest || fastest) && (
          <div className="flex flex-wrap gap-1.5">
            {cheapest && <Badge tone="positive" icon={Check}>Lowest fare</Badge>}
            {fastest && <Badge tone="brand" icon={Clock}>Fastest</Badge>}
          </div>
        )}
      </header></Reveal>

      <Reveal delay={0.06} y={10}><section aria-label="Boarding pass" className={cn(surface, "overflow-hidden")}>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-5 pt-5 pb-4">
          <div>
            <p className="font-display text-4xl font-semibold leading-none tracking-[-0.03em]">{from}</p>
            <p className={cn(type.meta, "mt-1.5")}>{city(route.origin)}</p>
            <p className="mt-3 text-lg font-medium tabular-nums leading-none">{clock(flight.departAt)}</p>
            <p className={cn(type.meta, "mt-1")}>{dayOf(flight.departAt)}</p>
          </div>
          <div className="flex min-w-0 flex-col items-center self-start">
            {/* Same height as the airport code beside it, so the path's centre is the code's centre. */}
            <div className="flex h-9 w-full items-center" aria-hidden>
              <span className="size-2 shrink-0 rounded-full border-2 border-muted-foreground" />
              {/* The plane leaves the departure end and settles in the middle of the route. */}
              <motion.span className="h-px bg-gradient-to-r from-border via-muted-foreground/60 to-border" style={{ flexShrink: 1, flexBasis: 0 }} initial={reduce ? false : { flexGrow: 0.02 }} animate={{ flexGrow: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.25 }} />
              <Plane className="mx-1.5 size-5 shrink-0 rotate-45 text-coral" strokeWidth={1.75} />
              <motion.span className="h-px bg-gradient-to-r from-border via-muted-foreground/60 to-border" style={{ flexShrink: 1, flexBasis: 0 }} initial={reduce ? false : { flexGrow: 2 }} animate={{ flexGrow: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.25 }} />
              <span className="size-2 shrink-0 rounded-full bg-muted-foreground" />
            </div>
            <p className={cn(type.meta, "mt-1.5 tabular-nums")}>
              {hm(flight.durationMinutes)} · {stopsLabel(flight)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl font-semibold leading-none tracking-[-0.03em]">{to}</p>
            <p className={cn(type.meta, "mt-1.5")}>{city(route.destination)}</p>
            <p className="mt-3 text-lg font-medium tabular-nums leading-none">
              {clock(flight.arriveAt)}
              {dayOffset > 0 && <sup className="ml-0.5 text-xs font-normal text-muted-foreground">+{dayOffset}</sup>}
            </p>
            <p className={cn(type.meta, "mt-1")}>{dayOf(flight.arriveAt)}</p>
          </div>
        </div>

        {flight.layoverAirports && flight.layoverAirports.length > 0 && (
          <p className={cn(type.meta, "px-5 pb-4 text-center")}>Connects in {flight.layoverAirports.join(", ")}</p>
        )}

        {/* The fold: a dashed perforation between the route and the small print. */}
        {facts.length > 0 && (
          <>
            <div className="mx-5 border-t-2 border-dashed border-border" aria-hidden />
            <div className="daisy-stats daisy-stats-vertical w-full rounded-none bg-transparent sm:daisy-stats-horizontal">
              {facts.map(({ label, value }) => (
                <div key={label} className="daisy-stat min-w-0 px-5 py-3">
                  <div className="daisy-stat-title text-xs text-muted-foreground">{label}</div>
                  <div className="daisy-stat-value whitespace-normal text-sm font-semibold leading-snug">{value}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </section></Reveal>

      {(flight.fareConditions?.length || flight.expiresAt) && (
        <Reveal delay={0.14} y={10}><section aria-label="Fare rules" className="space-y-3">
          <h3 className={type.section}>Fare rules</h3>
          {flight.fareConditions && flight.fareConditions.length > 0 && (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {flight.fareConditions.map((rule) => {
                const restricted = isRestriction(rule);
                const Icon = restricted ? X : Check;
                return (
                  <li key={rule} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className={cn("grid size-6 place-items-center rounded-full", restricted ? "bg-caution-soft text-caution" : "bg-positive-soft text-positive")}>
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

      {others.length > 0 && (
        <Reveal delay={0.2} y={10}><section aria-label="Other flights" className="space-y-3">
          <h3 className={type.section}>Other flights on this route</h3>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card">
            {others.map((o) => (
              <li key={o.id ?? `${o.airline}-${o.departAt}`} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => ctx?.openPanel({ kind: "flight", flight: o, route })}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium tabular-nums">
                      {clock(o.departAt)} – {clock(o.arriveAt)}
                    </span>
                    <span className={cn(type.meta, "block truncate")}>
                      {o.airline} · {hm(o.durationMinutes)} · {stopsLabel(o)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{money(o.price, o.currency)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section></Reveal>
      )}

      <div className="space-y-3 pt-1">
        <a
          href={searchUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]"
        >
          Search this route on Google Flights <ArrowUpRight className="size-4" aria-hidden />
        </a>
        <Notice>Fares change quickly, and Roam can’t book flights. Check the airline or a travel site before you commit.</Notice>
      </div>
    </div>
  );
}
