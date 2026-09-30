"use client";

import Link from "next/link";
import { ArrowRight, Plane } from "lucide-react";
import { Tactile } from "@/components/motion-primitives";
import { TripArt, hashString } from "@/components/trips/TripArt";

export type FlightChoice = { from: string; to: string; airline: string; fare: string; stops: number | null; minutes: number | null; departAt: string | null; arriveAt: string | null };

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The latest flight saved from Getting around (decisions come newest first), or null. */
export function readFlightChoice(decisions: ReadonlyArray<{ kind: string; value: unknown }>): FlightChoice | null {
  for (const decision of decisions) {
    if (decision.kind !== "transport") continue;
    const v = (decision.value ?? {}) as Record<string, unknown>;
    if (v.mode !== "flight") continue;
    return {
      from: text(v.from),
      to: text(v.to),
      airline: text(v.airline),
      fare: text(v.fare),
      stops: num(v.stops),
      minutes: num(v.minutes),
      departAt: text(v.departAt) || null,
      arriveAt: text(v.arriveAt) || null,
    };
  }
  return null;
}

const clock = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const day = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};
const duration = (minutes: number | null): string | null => (minutes ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m` : null);

/** "Toronto (YYZ)" -> { code: "YYZ", city: "Toronto" }; anything else is shown whole. */
function endpoint(label: string): { big: string; small: string | null } {
  const match = /^(.*?)\s*\(([A-Za-z]{3})\)\s*$/.exec(label);
  return match ? { big: match[2]!.toUpperCase(), small: match[1] || null } : { big: label, small: null };
}

/** How you are getting there: the saved flight as a boarding pass, or an invitation to find one. */
export function FlightFeature({ tripId, flight, destination }: { tripId: string; flight: FlightChoice | null; destination: string }) {
  const href = `/trips/${tripId}/map`;
  if (!flight) {
    return (
      <Link href={href} className="group block h-full focus-visible:outline-none">
        <TripArt seed={hashString(`${tripId}flight`)} className="flex h-full min-h-[16rem] flex-col justify-between rounded-[1.75rem] border border-border/70 p-7 shadow-soft transition-colors duration-300 group-hover:border-foreground/20">
          <span className="relative z-10 grid h-12 w-12 place-items-center rounded-2xl border border-border/60 bg-background/70 backdrop-blur">
            <Plane className="h-5 w-5" />
          </span>
          <div className="relative z-10">
            <h3 className="font-display text-2xl tracking-tight sm:text-3xl">How are you getting to {destination}?</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Compare flights, trains and drives, then save the one you choose.</p>
            <span className="daisy-btn daisy-btn-neutral mt-4 w-fit border-0 shadow-none">
              Find a flight <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
          </div>
        </TripArt>
      </Link>
    );
  }
  const origin = endpoint(flight.from || "Home");
  const target = endpoint(flight.to || destination);
  const leave = clock(flight.departAt);
  const arrive = clock(flight.arriveAt);
  const stops = flight.stops === null ? null : flight.stops === 0 ? "Non-stop" : `${flight.stops} ${flight.stops === 1 ? "stop" : "stops"}`;
  return (
    <Tactile lift={3} className="h-full">
      <Link href={href} className="group relative flex h-full min-h-[16rem] flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-soft focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
        <TripArt seed={hashString(`${tripId}flight`)} className="flex items-center justify-between gap-3 px-6 py-4">
          <span className="relative z-10 flex items-center gap-2 text-[11px] font-medium tracking-[0.16em] uppercase">
            <Plane className="h-4 w-4" /> Flight
          </span>
          <span className="daisy-badge relative z-10 h-7 border-border/60 bg-background/80 px-3 text-[13px] font-medium backdrop-blur">{flight.airline || "Saved"}</span>
        </TripArt>
        <div className="relative flex flex-1 flex-col justify-center gap-6 border-t-2 border-dashed border-border px-6 py-5">
          <span aria-hidden className="absolute -top-[9px] -left-[9px] h-4 w-4 rounded-full bg-background" />
          <span aria-hidden className="absolute -top-[9px] -right-[9px] h-4 w-4 rounded-full bg-background" />
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-4xl tracking-tight sm:text-5xl">{origin.big}</p>
              {origin.small && <p className="truncate text-sm text-muted-foreground">{origin.small}</p>}
              {leave && <p suppressHydrationWarning className="mt-0.5 text-sm tabular-nums text-muted-foreground">{leave}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1 text-muted-foreground">
              <Plane className="h-4 w-4" />
              {duration(flight.minutes) && <span className="text-xs tabular-nums">{duration(flight.minutes)}</span>}
            </div>
            <div className="min-w-0 flex-1 text-right">
              <p className="truncate font-display text-4xl tracking-tight sm:text-5xl">{target.big}</p>
              {target.small && <p className="truncate text-sm text-muted-foreground">{target.small}</p>}
              {arrive && <p suppressHydrationWarning className="mt-0.5 text-sm tabular-nums text-muted-foreground">{arrive}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {day(flight.departAt) && <span suppressHydrationWarning className="daisy-badge h-7 border-border bg-background px-3 text-[13px]">{day(flight.departAt)}</span>}
            {stops && <span className="daisy-badge h-7 border-border bg-background px-3 text-[13px]">{stops}</span>}
            {flight.fare && <span className="daisy-badge h-7 border-border bg-background px-3 text-[13px] tabular-nums">{flight.fare}</span>}
          </div>
        </div>
      </Link>
    </Tactile>
  );
}
