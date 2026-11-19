"use client";

import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { type FlightOffer } from "@/components/TripPanelProvider";
import { prettyDate, type } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import { JourneyRail, type RailLeg } from "./JourneyRail";

export { clock } from "./JourneyRail";
export const dayOf = (iso: string) => prettyDate(iso.slice(0, 10)) ?? "";
export const stopsLabel = (o: FlightOffer) => (o.stops === 0 ? "Nonstop" : `${o.stops} stop${o.stops > 1 ? "s" : ""}`);
export const eyebrow = "text-2xs max-lg:text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground";
export const sameFlight = (a: FlightOffer, b: FlightOffer) => (a.id && b.id ? a.id === b.id : a.airline === b.airline && a.departAt === b.departAt);
/** A fare rule that says "not" is a restriction; anything else is a permission. */
export const isRestriction = (rule: string) => /\bnot\b|non-?refundable|no (?:changes|refunds?)/i.test(rule);

export type FullLeg = NonNullable<FlightOffer["legs"]>[number];

/** The flights a journey is made of: Google's own legs when the card has them, else a plainer set built from the airports and flight numbers it does carry. */
export function journeyLegs(flight: FlightOffer, origin: string, destination: string): RailLeg[] {
  if (flight.legs && flight.legs.length > 1) return flight.legs;
  const via = flight.layoverAirports ?? [];
  if (flight.stops < 1 || via.length !== flight.stops) return [];
  const codes = [flight.originAirport ?? origin, ...via, flight.destinationAirport ?? destination];
  const numbers = flight.flightNumbers?.length === codes.length - 1 ? flight.flightNumbers : [];
  return codes.slice(0, -1).map((from, i) => ({ from, to: codes[i + 1]!, flightNumber: numbers[i], ...(i === 0 ? { departAt: flight.departAt } : {}), ...(i === codes.length - 2 ? { arriveAt: flight.arriveAt } : {}) }));
}

/** Every flight has its times and length: the full rail can be drawn. A saved card without them only has its airports. */
const isFullJourney = (legs: RailLeg[]) => legs.length > 1 && legs.every((l) => l.departAt && l.arriveAt && l.minutes);

/**
 * The journey under the pass. With the full legs in hand it is simply there (no extra search, nothing to tap but a flight to
 * open it). A saved card that only has its airports keeps a quiet "See the journey" row: opening it asks for the full legs once.
 */
export function Journey({ legs, loading, onOpen }: { legs: RailLeg[]; loading: boolean; onOpen: () => void }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  if (isFullJourney(legs)) {
    return (
      <section aria-label="Your journey" className="border-t border-border px-6 pb-6 pt-5">
        <h3 className="mb-3 font-display text-lg leading-[1.625rem] font-medium tracking-[-0.006em]">Your journey</h3>
        <JourneyRail legs={legs} showDates={false} />
      </section>
    );
  }
  return (
    <div className="relative border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="flight-journey"
        onClick={() => {
          if (!open) onOpen();
          setOpen((v) => !v);
        }}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{open ? "Hide the journey" : "See the journey"}</span>
          <span className={cn(type.meta, "block truncate")}>{legs.length} flights</span>
        </span>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-[transform,background-color]", open && "rotate-180 bg-muted")}><ChevronDown className="size-4" aria-hidden /></span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="flight-journey"
            key="journey"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {loading && <p className="shimmer-text px-6 pb-2 text-xs">Fetching the full itinerary…</p>}
            <div className="px-6 pb-6 pt-1"><JourneyRail legs={legs} showDates={false} /></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
