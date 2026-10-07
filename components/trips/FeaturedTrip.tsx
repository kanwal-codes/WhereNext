"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { openWithTransition } from "@/lib/view-transition";
import { ArrowRight, MapPin } from "lucide-react";
import { Tactile } from "@/components/motion-primitives";
import { TripCover } from "@/components/trips/TripCover";
import { TripMenu } from "@/components/trips/TripMenu";
import type { TripSummary } from "@/components/trips/types";
import { tripDurationDays } from "@/features/trip/domain/trip";
import { tripDayIndex, tripWhen } from "@/lib/trip-dates";
import { featuredLabel, type TripStatus } from "@/lib/trip-status";
import { cn } from "@/lib/utils";

type Stat = { title: string; value: string; desc: string };

/** The three numbers on the featured trip. The first one changes with where the trip is in time. */
function statsFor(trip: TripSummary, status: TripStatus): Stat[] {
  const days = tripDurationDays(trip.start_date, trip.end_date) ?? trip.duration_days;
  const first: Stat =
    status.phase === "upcoming" && status.daysUntil !== null
      ? { title: "Countdown", value: String(status.daysUntil), desc: status.daysUntil === 1 ? "day to go" : "days to go" }
      : status.phase === "underway"
        ? { title: "Today", value: `Day ${tripDayIndex(trip.start_date) ?? 1}`, desc: days ? `of ${days}` : "under way" }
        : status.phase === "past"
          ? { title: "Status", value: "Done", desc: "completed" }
          : { title: "Dates", value: "TBD", desc: "not set yet" };
  return [
    first,
    days ? { title: "Length", value: String(days), desc: days === 1 ? "day" : "days" } : { title: "Length", value: "—", desc: "not set" },
    trip.travelers ? { title: "Travellers", value: String(trip.travelers), desc: "going" } : { title: "Travellers", value: "—", desc: "not set" },
  ];
}

/**
 * The one big card: what is happening now, or what is coming up next. The cover runs edge to edge;
 * the trip's name and a frosted panel of numbers sit over it. Text switches to white once a photo
 * is showing and stays dark on the light type-led cover, fading between the two.
 */
export function FeaturedTrip({
  trip,
  status,
  deleting,
  onDelete,
}: {
  trip: TripSummary;
  status: TripStatus;
  deleting: boolean;
  onDelete: () => void;
}) {
  const router = useRouter();
  const when = tripWhen(trip.start_date, trip.end_date, trip.duration_days, "Dates not set");
  const stats = statsFor(trip, status);
  return (
    <Tactile lift={3} className="group relative has-[details[open]]:z-30">
      <Link
        href={`/trips/${trip.id}`}
        onClick={(event) => {
          // A plain click morphs the cover into the trip's hero; a modified click keeps its usual meaning (new tab, etc.).
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          openWithTransition(router, `/trips/${trip.id}`, event.currentTarget.firstElementChild as HTMLElement | null);
        }}
        className="block overflow-hidden rounded-3xl border border-border/70 bg-card shadow-soft transition-colors duration-300 group-hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <TripCover trip={trip} size="feature" className="flex min-h-[28rem] flex-col justify-end sm:min-h-[32rem]">
          {({ photo }) => (
            <>
              <span className="photo-chip absolute top-5 left-5 z-10">
                {featuredLabel(status.phase)}
              </span>

              {/* Darkens the lower part of a photo so the white text on it always reads. */}
              {/* A pale or overcast sky would read as a blank band above the title; the top is shaded to match the bottom. */}
              <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 z-[5] h-1/2 scrim-t [--scrim:0.8] transition-opacity duration-700", photo ? "opacity-100" : "opacity-0")} />
              <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-4/5 scrim-b transition-opacity duration-700", photo ? "opacity-100" : "opacity-0")} />

              <div className={cn("relative z-10 flex flex-col gap-6 px-6 pt-52 pb-6 transition-colors duration-700 sm:px-9 sm:pb-9 lg:flex-row lg:items-end lg:justify-between", photo ? "text-white" : "text-foreground")}>
                <div className="min-w-0 max-w-xl pr-12 lg:pr-0">
                  <h3 className="font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl">{trip.name}</h3>
                  <p className={cn("mt-3 flex items-center gap-1.5 text-base transition-colors duration-700", photo ? "text-white/85" : "text-muted-foreground")}>
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="truncate">{trip.destination || "Destination not set"}</span>
                  </p>
                  <p className={cn("mt-1 text-sm tabular-nums transition-colors duration-700", photo ? "text-white/75" : "text-muted-foreground")}>{when}</p>
                  {trip.origin && <p className={cn("mt-0.5 text-sm transition-colors duration-700", photo ? "text-white/75" : "text-muted-foreground")}>From {trip.origin}</p>}
                </div>

                <div className="flex w-full flex-col gap-4 lg:w-auto lg:items-end">
                  <div
                    suppressHydrationWarning
                    className={cn(
                      "daisy-stats w-full rounded-2xl border transition-colors duration-700 lg:w-auto [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3 max-sm:[&>.daisy-stat]:px-3",
                      photo
                        ? "glass-photo [&_.daisy-stat-desc]:text-white/70 [&_.daisy-stat-title]:text-white/70 [&>.daisy-stat]:border-white/20"
                        : "border-border/60 bg-background/82 [&>.daisy-stat]:border-border/70",
                    )}
                  >
                    {stats.map((stat) => (
                      <div key={stat.title} className="daisy-stat">
                        <div className="daisy-stat-title text-2xs tracking-[0.1em] uppercase">{stat.title}</div>
                        <div className="daisy-stat-value font-display text-3xl tracking-tight tabular-nums sm:text-4xl">{stat.value}</div>
                        <div className="daisy-stat-desc">{stat.desc}</div>
                      </div>
                    ))}
                  </div>
                  <span className={cn("daisy-btn w-fit border-0 shadow-none transition-colors duration-700", photo ? "bg-white text-zinc-900 group-hover:bg-white/90" : "daisy-btn-neutral")}>
                    Open trip <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </>
          )}
        </TripCover>
      </Link>
      <TripMenu name={trip.name} href={`/trips/${trip.id}`} deleting={deleting} onDelete={onDelete} isOwner={trip.is_owner !== false} className="absolute top-4 right-4 z-20 sm:top-5 sm:right-5" />
    </Tactile>
  );
}
