"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { TripCover } from "@/components/trips/TripCover";
import { TripMenu } from "@/components/trips/TripMenu";
import type { TripSummary } from "@/packages/contracts/trip-summary";
import { shortTripTitle } from "@/components/shell/trip-title";
import { tripWhen } from "@/lib/trip-dates";
import { cn } from "@/lib/utils";

/**
 * The trips that are over, folded away at the end of the home page: one quiet row to open them, and when open a short list of small rows (a photo, the name, when) instead
 * of the big covers the trips ahead get, so the past never competes with what is next. Open from the start when it is all there is.
 */
export function PastTrips({ trips, deleting, onDelete, defaultOpen = false }: { trips: TripSummary[]; deleting: string | null; onDelete: (trip: TripSummary) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = useId();
  if (trips.length === 0) return null;
  return (
    <section aria-labelledby={`${panel}-title`} className="mt-12 lg:max-w-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panel}
        className="group flex w-full items-center justify-between gap-3 rounded-3xl bg-muted/70 px-5 py-4 text-left transition-[background-color,transform] duration-200 hover:bg-muted active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span id={`${panel}-title`} className="font-display text-xl font-medium tracking-[-0.015em]">Past trips</span>
          <span className="text-body text-ink-soft tabular-nums">{trips.length}</span>
        </span>
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-foreground shadow-soft ring-1 ring-border transition-transform duration-300 ease-out">
          <ChevronDown className={cn("size-[1.125rem] transition-transform duration-300 ease-out", open && "rotate-180")} />
        </span>
      </button>
      {/* The rows open by growing, not by jumping: a grid row going from 0fr to 1fr. */}
      <div id={panel} className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={!open}>
        <ul className="min-h-0 overflow-hidden">
          {trips.map((trip) => <PastRow key={trip.id} trip={trip} deleting={deleting === trip.id} onDelete={() => onDelete(trip)} />)}
        </ul>
      </div>
    </section>
  );
}

function PastRow({ trip, deleting, onDelete }: { trip: TripSummary; deleting: boolean; onDelete: () => void }) {
  // Just the days it ran, without the length in brackets: the row is small and the name comes first.
  const when = trip.start_date && trip.end_date ? tripWhen(trip.start_date, trip.end_date, trip.duration_days, "").replace(/ \(\d+ days?\)$/, "") : "";
  const travellers = trip.travelers ? `${trip.travelers} ${trip.travelers === 1 ? "traveller" : "travellers"}` : null;
  const line = [when, travellers].filter(Boolean).join(" · ");
  return (
    <li className={cn("relative transition-opacity", deleting && "opacity-60")}>
      <Link href={`/trips/${trip.id}`} className="flex items-center gap-4 rounded-3xl py-3 pr-14 pl-1.5 transition-colors duration-200 hover:bg-muted/50 active:bg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <TripCover trip={trip} typeLed={false} className="size-16 shrink-0 rounded-2xl" />
        <span className="min-w-0">
          <span className="line-clamp-1 block font-display text-widget leading-tight font-medium tracking-[-0.02em]">{shortTripTitle(trip.name)}</span>
          {line && <span className="mt-0.5 block truncate text-body text-ink-soft tabular-nums">{line}</span>}
        </span>
      </Link>
      <TripMenu name={trip.name} href={`/trips/${trip.id}`} deleting={deleting} onDelete={onDelete} isOwner={trip.is_owner !== false} className="absolute top-1/2 right-2 z-20 -translate-y-1/2" />
    </li>
  );
}
