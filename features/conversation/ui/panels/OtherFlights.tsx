"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Clock } from "lucide-react";
import type { FlightOffer } from "@/components/TripPanelProvider";
import { arrivalDayOffset } from "@/features/conversation/ui/blocks/FlightFilters";
import { Badge, money, type } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";

export const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
};
export const hm = (mins: number) => `${Math.floor(mins / 60)}h ${mins % 60}m`;
/** "British Airways" → "BA", "Iberia" → "I": a monogram stands in when the airline's own logo is not there. */
const monogram = (airline: string) => airline.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
export const stopsText = (o: FlightOffer) => (o.stops === 0 ? "Nonstop" : `${o.stops} stop${o.stops > 1 ? "s" : ""}${o.layoverAirports?.length ? ` via ${o.layoverAirports.join(", ")}` : ""}`);

/** One airline's mark: its logo when Google supplies one, else its initials, in the same round frame. */
function Mark({ airline, logo, className, stacked }: { airline: string; logo?: string; className?: string; stacked?: boolean }) {
  const [broken, setBroken] = useState(false);
  const frame = cn("grid size-9 shrink-0 place-items-center overflow-hidden rounded-full", className);
  if (logo && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <span className={cn(frame, "bg-white", stacked ? "ring-2 ring-card" : "ring-1 ring-black/10")}><img src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-[62%] object-contain" /></span>;
  }
  return <span aria-hidden className={cn(frame, "bg-coral-soft text-xs font-semibold tracking-wide text-coral-ink", stacked && "ring-2 ring-card")}>{monogram(airline)}</span>;
}

/**
 * The airline's mark. When the journey is flown by several airlines and each flight's own logo is known, the marks
 * overlap, one per airline (Google's single "several airlines" picture says nothing); otherwise it is the one logo,
 * or the initials when there is none.
 */
export function AirlineMark({ offer, className }: { offer: Pick<FlightOffer, "airline" | "logo"> & { legs?: FlightOffer["legs"] }; className?: string }) {
  const seen = new Set<string>();
  const each = (offer.legs ?? []).flatMap((l) => (l.airline && l.logo && !seen.has(l.airline) && seen.add(l.airline) ? [{ airline: l.airline, logo: l.logo }] : [])).slice(0, 3);
  if (each.length > 1) {
    return (
      <span className="flex shrink-0 -space-x-3" role="img" aria-label={each.map((m) => m.airline).join(" and ")}>
        {each.map((m) => <Mark key={m.airline} airline={m.airline} logo={m.logo} className={className} stacked />)}
      </span>
    );
  }
  return <Mark airline={offer.airline} logo={offer.logo} className={className} />;
}

/** The route as a line between two times: a dot for each stop along it, so nonstop and connecting read differently at a glance. */
function RouteLine({ stops }: { stops: number }) {
  return (
    <span aria-hidden className="relative block h-px w-full bg-gradient-to-r from-border via-muted-foreground/40 to-border">
      <span className="absolute -top-[2.5px] left-0 size-[6px] rounded-full bg-muted-foreground/70" />
      {Array.from({ length: stops }).map((_, i) => (
        <span key={i} className="absolute -top-[3px] size-[7px] -translate-x-1/2 rounded-full border-[1.5px] border-coral bg-card" style={{ left: `${((i + 1) / (stops + 1)) * 100}%` }} />
      ))}
      <span className="absolute -top-[2.5px] right-0 size-[6px] rounded-full bg-muted-foreground/70" />
    </span>
  );
}

/**
 * One flight as a small boarding-pass card: who flies, when, for how long, and what it costs. `delta` is how that price
 * compares with something (the flight in view, the cheapest); `selected` marks the one chosen.
 */
export function FareCard({ offer, onPick, delta, badges, selected, priceNote }: {
  offer: FlightOffer;
  onPick: (offer: FlightOffer) => void;
  delta?: { text: string; good?: boolean } | null;
  badges?: React.ReactNode;
  selected?: boolean;
  /** Under the price when there is no delta: "round trip", "per person". */
  priceNote?: string;
}) {
  const offset = arrivalDayOffset(offer.departAt, offer.arriveAt);
  const label = `${offer.airline}, ${clock(offer.departAt)} to ${clock(offer.arriveAt)}, ${hm(offer.durationMinutes)}, ${stopsText(offer)}, ${money(offer.price, offer.currency, true)}`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onPick(offer)}
      className={cn(
        "group relative block w-full rounded-2xl border bg-card p-4 text-left shadow-soft transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.99]",
        selected ? "border-coral ring-1 ring-coral/40" : "border-border hover:border-foreground/25",
      )}
    >
      {selected && <span aria-hidden className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-coral text-white"><Check className="size-3" strokeWidth={3} /></span>}
      <span className="flex items-center gap-3">
        <AirlineMark offer={offer} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{offer.airline}</span>
          <span className={cn(type.meta, "block truncate")}>{[stopsText(offer), offer.flightNumbers?.slice(0, 2).join(" · ")].filter(Boolean).join(" · ")}</span>
        </span>
        <span className={cn("shrink-0 text-right", selected && "pr-6")}>
          <span className="block font-display text-lg font-semibold leading-tight tabular-nums tracking-[-0.02em]">
            {offer.listedCurrency && <span className="mr-0.5 font-normal text-muted-foreground">≈</span>}
            {money(offer.price, offer.currency, true)}
          </span>
          {delta ? (
            <span className={cn("block text-xs tabular-nums", delta.good ? "font-medium text-positive" : "text-muted-foreground")}>{delta.text}</span>
          ) : priceNote ? (
            <span className="block text-xs text-muted-foreground">{priceNote}</span>
          ) : null}
        </span>
      </span>

      <span className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-x-3">
        <span>
          <span className="block text-base font-medium leading-none tabular-nums">{clock(offer.departAt)}</span>
          <span className={cn(type.meta, "mt-1 block")}>{offer.originAirport ?? "—"}</span>
        </span>
        <span className="flex flex-col items-center gap-1.5 px-1">
          <RouteLine stops={offer.stops} />
          <span className={cn(type.meta, "tabular-nums")}>{hm(offer.durationMinutes)}</span>
        </span>
        <span className="text-right">
          <span className="block text-base font-medium leading-none tabular-nums">
            {clock(offer.arriveAt)}
            {offset > 0 && <sup className="ml-0.5 text-xs font-normal text-muted-foreground">+{offset}</sup>}
          </span>
          <span className={cn(type.meta, "mt-1 block")}>{offer.destinationAirport ?? "—"}</span>
        </span>
      </span>
      {badges}
    </button>
  );
}

/**
 * The other flights from the same search, as a ladder of cards: how each compares with the flight you are looking at.
 * Tapping one opens it.
 */
export function OtherFlights({ flight, offers, others, onPick, roundTrip }: { flight: FlightOffer; offers: FlightOffer[]; others: FlightOffer[]; onPick: (offer: FlightOffer) => void; roundTrip?: boolean }) {
  const reduce = useReducedMotion();
  // A badge says "this one stands out", so it needs a single winner: a tie is not a standout.
  const lowest = Math.min(...offers.map((o) => Number(o.price)));
  const quickest = Math.min(...offers.map((o) => o.durationMinutes));
  const uniqueLowest = offers.filter((o) => Number(o.price) === lowest).length === 1;
  const uniqueQuickest = offers.filter((o) => o.durationMinutes === quickest).length === 1;
  const here = Number(flight.price);

  return (
    <section aria-label="Other flights" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={type.section}>Other flights on this route</h3>
        <span className={cn(type.meta, "tabular-nums")}>{others.length} more</span>
      </div>
      <ul className="space-y-2.5">
        {others.map((o, i) => {
          const diff = o.currency === flight.currency ? Number(o.price) - here : NaN;
          const cheapest = uniqueLowest && Number(o.price) === lowest;
          const fastest = uniqueQuickest && o.durationMinutes === quickest;
                    return (
            <motion.li
              key={o.id ?? `${o.airline}-${o.departAt}`}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 6) * 0.06 }}
            >
              <FareCard
                offer={o}
                onPick={onPick}
                priceNote={roundTrip ? "round trip" : undefined}
                delta={Number.isFinite(diff) ? { text: diff === 0 ? "Same price" : `${money(Math.abs(diff), o.currency, true)} ${diff < 0 ? "less" : "more"}`, good: diff < 0 } : null}
                badges={(cheapest || fastest) && (
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {cheapest && <Badge tone="positive" icon={Check}>Lowest fare</Badge>}
                    {fastest && <Badge tone="brand" icon={Clock}>Fastest</Badge>}
                  </span>
                )}
              />
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
