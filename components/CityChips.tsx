"use client";

import type { TripStop } from "@/lib/trip-stops";
import { cn } from "@/lib/utils";

const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/** A row of the trip's cities to switch what a screen is about. Renders nothing for a one-city trip. */
export function CityChips({ stops, current, onPick, estimated, className }: { stops: TripStop[]; current: string; onPick: (city: string) => void; estimated?: boolean; className?: string }) {
  if (stops.length < 2) return null;
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto overscroll-x-contain scrollbar-slim px-1 py-1", className)} role="group" aria-label="City">
      {stops.map((s) => {
        const on = s.city === current;
        return (
          <button key={s.city} type="button" onClick={() => onPick(s.city)} aria-pressed={on} className={cn("btn-chip shrink-0", on && "bg-foreground text-background")}>
            {s.city}
            {s.startDate && s.endDate ? <span className={cn("ml-1.5 text-xs font-normal", on ? "opacity-70" : "text-muted-foreground")}>{label(s.startDate)}–{label(s.endDate)}</span> : null}
          </button>
        );
      })}
      {estimated && <span className="shrink-0 pl-1 text-2xs text-muted-foreground">Estimated days · edit on Overview</span>}
    </div>
  );
}
