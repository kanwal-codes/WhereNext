"use client";

import { Fragment } from "react";
import { Armchair, Check, Clock, Luggage, Plane, Ticket, X } from "lucide-react";
import type { FlightOffer, FlightLeg } from "@/packages/providers/duffel/client";
import { cn } from "@/lib/utils";

const hm = (mins: number) => (mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ` ${String(mins % 60).padStart(2, "0")} min` : ""}`);
/** Flight times are airport-local wall clocks with no zone ("2026-11-16T11:36:00"): read them as written, never shifted. */
const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};
const isRestriction = (rule: string) => /\bnot\b|non-?refundable|no (?:changes|refunds?)/i.test(rule);
const airportName = (name?: string) => name?.replace(/\s+(International\s+)?Airport$/i, "");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type Stop = { code: string; name?: string; time: string; label: "Departs" | "Arrives" | "Lands" };

/** One direction as a rail: each airport with its time, the flight between (number, aircraft, length), and the wait at every connection. */
function Journey({ title, legs }: { title: string; legs: FlightLeg[] }) {
  const last = legs[legs.length - 1]!;
  const stops: Array<Stop & { leg?: FlightLeg; wait?: number; overnight?: boolean }> = [
    { code: legs[0]!.from, name: legs[0]!.fromName, time: legs[0]!.departAt, label: "Departs", leg: legs[0] },
    ...legs.slice(1).map((l, i) => ({ code: l.from, name: l.fromName, time: l.departAt, label: "Departs" as const, leg: l, wait: legs[i]!.layoverMinutes, overnight: legs[i]!.overnight, arrive: legs[i]!.arriveAt })),
    { code: last.to, name: last.toName, time: last.arriveAt, label: "Arrives" },
  ];
  return (
    <section aria-label={title}>
      <h4 className="flex items-baseline justify-between gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
        <span className="font-normal normal-case tracking-normal">{day(legs[0]!.departAt)}</span>
      </h4>
      <ol className="mt-3">
        {stops.map((stop, i) => {
          const end = i === stops.length - 1;
          const connection = !end && i > 0;
          const arrive = "arrive" in stop ? (stop.arrive as string) : undefined;
          return (
            <Fragment key={i}>
              <li className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-3">
                <div className="flex flex-col items-center" aria-hidden="true">
                  <span className={cn("mt-1.5 size-3 shrink-0 rounded-full border-2 bg-card", i === 0 ? "border-muted-foreground" : end ? "border-foreground bg-foreground" : "border-coral")} />
                  {!end && <span className={cn("w-0 flex-1 border-l", connection && stop.wait ? "border-dashed border-coral/60" : "border-solid border-border")} />}
                </div>
                <div className={cn("min-w-0", !end && "pb-4")}>
                  <p className="text-sm">
                    <span className="font-semibold tabular-nums">{connection && arrive ? `${clock(arrive)} → ${clock(stop.time)}` : clock(stop.time)}</span>
                    <span className="ml-2 font-medium">{stop.code}</span>
                    {airportName(stop.name) && <span className="ml-1.5 text-muted-foreground">{airportName(stop.name)}</span>}
                  </p>
                  {connection && stop.wait ? (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-coral-ink">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {hm(stop.wait)} layover{stop.overnight ? " · overnight" : ""}
                    </p>
                  ) : null}
                  {stop.leg && (
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl bg-surface px-3 py-2 text-xs text-muted-foreground">
                      <Plane className="size-3.5 shrink-0 rotate-45 text-ink-soft" aria-hidden="true" />
                      <span className="font-medium text-foreground">{[stop.leg.airline, stop.leg.flightNumber].filter(Boolean).join(" · ") || `Flies to ${stop.leg.to}`}</span>
                      {stop.leg.aircraft && <span>{stop.leg.aircraft}</span>}
                      {stop.leg.minutes ? <span className="tabular-nums">{hm(stop.leg.minutes)}</span> : null}
                    </p>
                  )}
                </div>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}

/** What opens under a flight card: the journey in full, what the fare includes, and what it allows. */
export function FlightDetails({ flight, travellers }: { flight: FlightOffer; travellers: number }) {
  // A search that did not return the flights one by one still has the two airports and the times.
  const outbound: FlightLeg[] =
    flight.legs && flight.legs.length > 0
      ? flight.legs
      : flight.originAirport && flight.destinationAirport
        ? [{ from: flight.originAirport, departAt: flight.departAt, to: flight.destinationAirport, arriveAt: flight.arriveAt, minutes: flight.durationMinutes }]
        : [];
  const facts = [
    flight.cabinClass ? { Icon: Armchair, label: "Cabin", value: flight.cabinClass.replace(/_/g, " ") } : null,
    flight.baggage ? { Icon: Luggage, label: "Bags", value: flight.baggage } : null,
    flight.operatingAirline && flight.operatingAirline !== flight.airline ? { Icon: Plane, label: "Operated by", value: flight.operatingAirline } : null,
    flight.co2Kg ? { Icon: Ticket, label: "CO₂", value: `${flight.co2Kg} kg` } : null,
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null);
  const held = flight.expiresAt ? new Date(flight.expiresAt) : null;

  return (
    <div className="space-y-5 border-t border-border px-4 pb-4 pt-4">
      {outbound.length > 0 && <Journey title={flight.returnLegs?.length ? "Outbound" : "Journey"} legs={outbound} />}
      {flight.returnLegs && flight.returnLegs.length > 0 && <Journey title="Return" legs={flight.returnLegs} />}

      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {facts.map(({ Icon, label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5" aria-hidden="true" />
                {label}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-medium capitalize">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {flight.fareConditions && flight.fareConditions.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Fare rules">
          {flight.fareConditions.map((rule) => {
            const no = isRestriction(rule);
            return (
              <li key={rule} className={cn("inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium", no ? "text-ink-soft" : "text-foreground [&_svg]:text-positive")}>
                {no ? <X className="size-3.5" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
                {rule}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {travellers > 1 ? `Total for ${plural(travellers, "traveller")}. ` : ""}
        {flight.listedAmount && flight.listedCurrency && flight.listedCurrency !== flight.priceCurrency ? `Listed at ${flight.listedAmount} ${flight.listedCurrency}, converted. ` : ""}
        {held && !Number.isNaN(held.getTime()) ? `This fare is held until ${held.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. ` : ""}
        Fares and seats change fast.
      </p>
    </div>
  );
}
