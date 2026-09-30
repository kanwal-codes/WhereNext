"use client";

import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Tactile } from "@/components/motion-primitives";
import { TripCover } from "@/components/trips/TripCover";
import { TripMenu } from "@/components/trips/TripMenu";
import type { TripSummary } from "@/components/trips/types";
import { tripDurationDays } from "@/features/trip/domain/trip";
import { tripDayIndex, tripWhen } from "@/lib/trip-dates";
import { featuredLabel, type TripStatus } from "@/lib/trip-status";

type Stat = { title: string; value: string; desc: string };

/** The three numbers under the featured trip. The first one changes with where the trip is in time. */
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
    { title: "Length", value: days ? String(days) : "-", desc: days === 1 ? "day" : "days" },
    { title: "Travellers", value: trip.travelers ? String(trip.travelers) : "-", desc: "going" },
  ];
}

/** The one big card: what is happening now, or what is coming up next. */
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
  const when = tripWhen(trip.start_date, trip.end_date, trip.duration_days, "Dates not set");
  const stats = statsFor(trip, status);
  return (
    <Tactile lift={3} className="group relative has-[details[open]]:z-30">
      <Link
        href={`/trips/${trip.id}`}
        className="grid overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-soft transition-colors duration-300 group-hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none lg:grid-cols-[1.15fr_1fr]"
      >
        <TripCover trip={trip} size="feature" className="min-h-60 lg:min-h-80">
          {() => (
            <span className="daisy-badge absolute top-5 left-5 z-10 h-7 border-border/60 bg-background/80 px-3 text-[13px] font-medium text-foreground backdrop-blur">
              {featuredLabel(status.phase)}
            </span>
          )}
        </TripCover>

        <div className="flex min-w-0 flex-col justify-between gap-8 p-6 sm:p-9">
          <div className="min-w-0 pr-10">
            <h3 className="font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl">{trip.name}</h3>
            <p className="mt-3 flex items-center gap-1.5 text-base text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{trip.destination || "Destination not set"}</span>
            </p>
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">{when}</p>
            {trip.origin && <p className="mt-1 text-sm text-muted-foreground">From {trip.origin}</p>}
          </div>

          <div>
            <div suppressHydrationWarning className="daisy-stats w-full rounded-none border-y border-border/70 bg-transparent shadow-none [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:border-border/70 [&>.daisy-stat]:px-4 [&>.daisy-stat]:py-3 [&>.daisy-stat:first-child]:pl-0">
              {stats.map((stat) => (
                <div key={stat.title} className="daisy-stat">
                  <div className="daisy-stat-title text-[11px] tracking-[0.08em] uppercase">{stat.title}</div>
                  <div className="daisy-stat-value font-display text-3xl tracking-tight tabular-nums sm:text-4xl">{stat.value}</div>
                  <div className="daisy-stat-desc">{stat.desc}</div>
                </div>
              ))}
            </div>
            <span className="btn-primary mt-6 inline-flex w-fit">
              Open trip <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
      <TripMenu name={trip.name} href={`/trips/${trip.id}`} deleting={deleting} onDelete={onDelete} className="absolute top-4 right-4 z-20 lg:top-5 lg:right-5" />
    </Tactile>
  );
}
