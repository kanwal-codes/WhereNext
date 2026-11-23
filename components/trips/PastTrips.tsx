"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TripLineRow } from "@/components/trips/TripLineRow";
import type { TripSummary } from "@/packages/contracts/trip-summary";
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
  return <li><TripLineRow trip={trip} line={[when, travellers].filter(Boolean).join(" · ")} deleting={deleting} onDelete={onDelete} /></li>;
}
