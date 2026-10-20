"use client";

import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Armchair, ChevronDown, Clock, Plane, Plug, Tv, Wifi, type LucideIcon } from "lucide-react";
import { type FlightOffer } from "@/components/TripPanelProvider";
import { prettyDate, type } from "@/features/conversation/ui/blocks/ui";
import { AirlineMark } from "./OtherFlights";
import { cn } from "@/lib/utils";

export const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
};
export const dayOf = (iso: string) => prettyDate(iso.slice(0, 10)) ?? "";
export const hm = (mins: number) => (mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`);
export const stopsLabel = (o: FlightOffer) => (o.stops === 0 ? "Nonstop" : `${o.stops} stop${o.stops > 1 ? "s" : ""}`);
export const eyebrow = "text-[11px] max-lg:text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground";
export const sameFlight = (a: FlightOffer, b: FlightOffer) => (a.id && b.id ? a.id === b.id : a.airline === b.airline && a.departAt === b.departAt);
/** A fare rule that says "not" is a restriction; anything else is a permission. */
export const isRestriction = (rule: string) => /\bnot\b|non-?refundable|no (?:changes|refunds?)/i.test(rule);


export type FullLeg = NonNullable<FlightOffer["legs"]>[number];
/** A leg as the rail needs it. Times and length are missing for a card saved before the journey was kept. */
type Leg = Omit<FullLeg, "departAt" | "arriveAt" | "minutes"> & { departAt?: string; arriveAt?: string; minutes?: number };
type Station = { code: string; name?: string; arrive?: string; depart?: string; wait?: number; overnight?: boolean; leg?: Leg };

/** The flights a journey is made of: Google's own legs when the card has them, else a plainer set built from the airports and flight numbers it does carry. */
export function journeyLegs(flight: FlightOffer, origin: string, destination: string): Leg[] {
  if (flight.legs && flight.legs.length > 1) return flight.legs;
  const via = flight.layoverAirports ?? [];
  if (flight.stops < 1 || via.length !== flight.stops) return [];
  const codes = [flight.originAirport ?? origin, ...via, flight.destinationAirport ?? destination];
  const numbers = flight.flightNumbers?.length === codes.length - 1 ? flight.flightNumbers : [];
  return codes.slice(0, -1).map((from, i) => ({ from, to: codes[i + 1]!, flightNumber: numbers[i], ...(i === 0 ? { departAt: flight.departAt } : {}), ...(i === codes.length - 2 ? { arriveAt: flight.arriveAt } : {}) }));
}
const airportName = (name?: string) => name?.replace(/\s+(International\s+)?Airport$/i, "");

/** What a flight's listed comfort is, as an icon and a short line. */
const comfort = (text: string): { Icon: LucideIcon; label: string } | null =>
  /wi-?fi/i.test(text) ? { Icon: Wifi, label: text }
  : /power|usb|outlet/i.test(text) ? { Icon: Plug, label: text.replace(/^in-seat /i, "") }
  : /video|entertainment|stream/i.test(text) ? { Icon: Tv, label: text.replace(/^in-seat /i, "") }
  : null;

/** One flight of the journey as a small card: who flies it and in what, for how long, and what the seat comes with. */
function LegCard({ leg }: { leg: Leg }) {
  const perks = (leg.amenities ?? []).map(comfort).filter((c): c is NonNullable<typeof c> => c !== null);
  const title = [leg.airline, leg.flightNumber].filter(Boolean).join(" · ") || `Flies to ${leg.to}`;
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-3.5">
      <div className="flex items-center gap-3">
        {leg.airline ? <AirlineMark offer={{ airline: leg.airline, logo: leg.logo }} className="size-8" /> : <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Plane className="size-4 rotate-45" /></span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          {leg.aircraft && <p className={cn(type.meta, "truncate")}>{leg.aircraft}</p>}
        </div>
        {leg.minutes ? <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">{hm(leg.minutes)}</span> : null}
      </div>
      {(perks.length > 0 || leg.legroom || leg.oftenDelayed) && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {perks.map(({ Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-ink-soft"><Icon className="size-3.5 text-coral" aria-hidden />{label}</li>
          ))}
          {leg.legroom && <li className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-ink-soft"><Armchair className="size-3.5 text-coral" aria-hidden />{leg.legroom} legroom</li>}
          {leg.oftenDelayed && <li className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground"><Clock className="size-3.5 text-caution" aria-hidden />Often over 30 min late</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * The journey as a rail: each stop with its times, a card for each flight between stops, and a dashed coral stretch
 * through every layover. Closed it is one quiet row on the pass; opened it answers "how long do I sit in Zurich, and
 * what am I flying on?".
 */
export function Journey({ legs, loading, onOpen }: { legs: Leg[]; loading: boolean; onOpen: () => void }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const last = legs[legs.length - 1]!;
  const waits = legs.reduce((sum, l) => sum + (l.layoverMinutes ?? 0), 0);
  const stations: Station[] = [
    { code: legs[0]!.from, name: legs[0]!.fromName, depart: legs[0]!.departAt, leg: legs[0] },
    ...legs.slice(1).map((l, i): Station => ({ code: l.from, name: l.fromName, arrive: legs[i]!.arriveAt, depart: l.departAt, wait: legs[i]!.layoverMinutes, overnight: legs[i]!.overnight, leg: l })),
    { code: last.to, name: last.toName, arrive: last.arriveAt },
  ];
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
          <span className={cn(type.meta, "block truncate")}>{legs.length} flights{waits > 0 ? ` · ${hm(waits)} of layover` : ""}</span>
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
            <ol className="px-6 pb-6 pt-1">
              {stations.map((st, i) => {
                const first = i === 0;
                const end = i === stations.length - 1;
                const time = first ? st.depart : st.arrive;
                const connection = !first && !end;
                return (
                  <React.Fragment key={i}>
                    <li className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-3">
                      <div className="flex flex-col items-center" aria-hidden>
                        <span className={cn("mt-1.5 size-3 shrink-0 rounded-full border-2 bg-card", first ? "border-muted-foreground" : end ? "border-foreground bg-foreground" : "border-coral")} />
                        {!end && <span className={cn("w-0 flex-1 border-l", connection && st.wait ? "border-dashed border-coral/60" : "border-solid border-border")} />}
                      </div>
                      <div className={cn("min-w-0", end ? "pb-0" : connection ? "pb-4" : "pb-3")}>
                        {!connection && time && (
                          <p className="flex items-baseline justify-between gap-3">
                            <span className="font-display text-xl font-semibold tabular-nums tracking-[-0.02em]">{clock(time)}</span>
                            <span className={type.meta}>{dayOf(time)}</span>
                          </p>
                        )}
                        <p className={cn("text-sm", connection && "font-medium")}>
                          {airportName(st.name) ? <>{airportName(st.name)} <span className="font-normal text-muted-foreground">{st.code}</span></> : st.code}
                        </p>
                        {connection && st.arrive && st.depart && (
                          <div className="mt-2 grid max-w-xs grid-cols-2 gap-3">
                            <div><p className={eyebrow}>Lands</p><p className="font-display text-base font-semibold tabular-nums">{clock(st.arrive)}</p></div>
                            <div><p className={eyebrow}>Leaves</p><p className="font-display text-base font-semibold tabular-nums">{clock(st.depart)}</p></div>
                          </div>
                        )}
                        {st.wait !== undefined && st.wait > 0 && (
                          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-coral-soft px-2.5 py-1 text-xs font-medium text-coral-ink">
                            <Clock className="size-3" aria-hidden />{hm(st.wait)} layover{st.overnight ? ", overnight" : ""}
                          </span>
                        )}
                      </div>
                    </li>
                    {!end && st.leg && (
                      <li className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-3">
                        <div className="flex justify-center" aria-hidden><span className="w-0 border-l border-solid border-border" /></div>
                        <div className="pb-4 pt-1"><LegCard leg={st.leg} /></div>
                      </li>
                    )}
                  </React.Fragment>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
