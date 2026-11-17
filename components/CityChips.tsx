"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AreaSheet } from "@/components/AreaSheet";
import type { CityRefine } from "@/components/CityPill";
import type { TripStop } from "@/lib/trip-stops";
import { cn } from "@/lib/utils";

const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * A row of the trip's cities to switch what a screen is about, and, when the current place is too big to search as one, a chip that narrows it
 * to a place inside it. Renders nothing for a one-city trip with a city-sized destination.
 */
export function CityChips({ stops, current, onPick, estimated, className, refine }: { stops: TripStop[]; current: string; onPick: (city: string) => void; estimated?: boolean; className?: string; refine?: CityRefine }) {
  const [open, setOpen] = useState(false);
  if (stops.length < 2 && !refine) return null;
  const inside = refine?.parent.split(",")[0]?.trim() ?? "";
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto overscroll-x-contain scrollbar-slim px-1 py-1", className)} role="group" aria-label="City">
      {stops.length > 1 && stops.map((s) => {
        const on = s.city === current;
        return (
          <button key={s.city} type="button" onClick={() => onPick(s.city)} aria-pressed={on} className="btn-chip shrink-0">
            {s.city}
            {s.startDate && s.endDate ? <span className={cn("ml-1.5 text-xs font-normal", on ? "opacity-70" : "text-muted-foreground")}>{label(s.startDate)}–{label(s.endDate)}</span> : null}
          </button>
        );
      })}
      {refine && (
        <>
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="btn-chip shrink-0" data-active={refine.area ? "true" : undefined}>
            {refine.area ? refine.area.name : `Anywhere in ${inside}`}
            <ChevronDown className="size-3.5" aria-hidden />
          </button>
          <AreaSheet
            open={open}
            onClose={() => setOpen(false)}
            tripId={refine.tripId}
            parent={refine.parent}
            stops={stops}
            activeStop={refine.activeStop}
            area={refine.area}
            onPickStop={onPick}
            onPickArea={refine.onPickArea}
            narrow
          />
        </>
      )}
      {estimated && <span className="shrink-0 pl-1 text-2xs text-muted-foreground">Estimated days · edit on Overview</span>}
    </div>
  );
}
