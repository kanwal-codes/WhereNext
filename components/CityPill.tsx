"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AreaSheet } from "@/components/AreaSheet";
import type { TripArea } from "@/lib/client/use-trip-city";
import type { TripStop } from "@/lib/trip-stops";
import { cn } from "@/lib/utils";

/** What the pill needs to narrow a place that is too big to search as one (see `AreaSheet`). */
export type CityRefine = { tripId: string; parent: string; activeStop: string; area: TripArea | null; onPickArea: (area: TripArea | null) => void };

/**
 * Phone redesign: the city a screen is about, as the one pill in the middle of the header. It opens a sheet when there is a choice to make:
 * another city of a multi-city trip, or a place inside a destination that is too big to search as one ("Portugal" becomes "Porto"). On a
 * one-city trip with a city-sized destination it just names the place.
 */
export function CityPill({ stops, city, onPick, refine }: { stops: TripStop[]; city: string; onPick: (city: string) => void; refine?: CityRefine }) {
  const [open, setOpen] = useState(false);
  const choice = stops.length > 1 || Boolean(refine);
  const body = (
    <>
      <span className="truncate">{city}</span>
      {choice && <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );
  const cls = "inline-flex h-11 max-w-full items-center gap-1.5 rounded-full bg-muted px-4 font-display text-body font-semibold tracking-[-0.01em]";
  if (!choice) return <span className={cls}>{body}</span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={`${refine ? "Place" : "City"}: ${city}. Change`} className={cn(cls, "transition-transform active:scale-[0.97]")}>{body}</button>
      <AreaSheet
        open={open}
        onClose={() => setOpen(false)}
        tripId={refine?.tripId ?? ""}
        parent={refine?.parent ?? city}
        stops={stops}
        activeStop={refine?.activeStop ?? city}
        area={refine?.area ?? null}
        onPickStop={onPick}
        onPickArea={refine?.onPickArea ?? (() => {})}
        narrow={Boolean(refine)}
      />
    </>
  );
}
