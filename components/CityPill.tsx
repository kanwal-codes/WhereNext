"use client";

import { useState } from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import type { TripStop } from "@/lib/trip-stops";
import { cn } from "@/lib/utils";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Phone redesign: the city a screen is about, as the one pill in the middle of the header. On a trip with several cities it opens a sheet
 * to pick another; on a one-city trip it just names the place.
 */
export function CityPill({ stops, city, onPick }: { stops: TripStop[]; city: string; onPick: (city: string) => void }) {
  const [open, setOpen] = useState(false);
  const choice = stops.length > 1;
  const body = (
    <>
      <MapPin className="size-4 shrink-0 text-coral" aria-hidden />
      <span className="truncate">{city}</span>
      {choice && <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );
  const cls = "inline-flex h-11 max-w-full items-center gap-1.5 rounded-full border-[1.5px] border-foreground bg-background px-4 font-display text-[0.9375rem] font-semibold tracking-[-0.01em]";
  if (!choice) return <span className={cls}>{body}</span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={`City: ${city}. Change city`} className={cn(cls, "transition-transform active:scale-[0.97]")}>{body}</button>
      <Sheet open={open} onClose={() => setOpen(false)} side="bottom" ariaLabel="Choose a city" className="icons-fine rounded-t-[1.75rem] bg-background px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <span aria-hidden className="mx-auto mb-3 block h-1 w-9 rounded-full bg-input" />
        <p className="px-2 pb-1 font-display text-xl font-medium tracking-[-0.02em]">Where in the trip?</p>
        <ul className="mt-1">
          {stops.map((s) => {
            const on = s.city === city;
            return (
              <li key={s.city}>
                <button
                  type="button"
                  onClick={() => { onPick(s.city); setOpen(false); }}
                  aria-current={on ? "true" : undefined}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors active:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block font-display text-base", on ? "font-semibold" : "font-medium")}>{s.city}</span>
                    {s.startDate && s.endDate && <span className="block text-sm text-muted-foreground">{day(s.startDate)} to {day(s.endDate)}</span>}
                  </span>
                  {on && <Check className="size-5 text-coral" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
