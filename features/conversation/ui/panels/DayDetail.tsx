"use client";

import React, { useState } from "react";
import { CalendarPlus, Check, Loader2 } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type ItineraryBlock } from "@/components/TripPanelProvider";
import { addStopsToItinerary, dayIndexFromLabel } from "@/features/conversation/application/addPlanToItinerary";
import { ContentSwap } from "@/components/motion-primitives";
import { SlidingTabs } from "@/features/conversation/ui/blocks/SlidingTabs";
import { PlanStops } from "@/features/conversation/ui/blocks/PlanStops";
import { pointsFromItinerary } from "@/features/conversation/ui/blocks/mapPoints";
import { Badge, MapButton, Meta, segmentTab, surface } from "@/features/conversation/ui/blocks/ui";
import { formatClockTime, parseClockTime } from "@/lib/application/clock-time";
import { notifyToast } from "@/lib/application/toast";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** One day of a plan Roam suggested: the day at a glance, its stops in order, and one action, putting the day in the itinerary. */
export function DayDetail({ block, dayIndex, tripId }: { block: ItineraryBlock; dayIndex: number; tripId: string }) {
  const ctx = useTripPanelMaybe();
  const { data } = useTripData();
  const [active, setActive] = useState(Math.min(dayIndex, block.days.length - 1));
  const [status, setStatus] = useState<"idle" | "adding">("idle");
  const day = block.days[active];
  const index = dayIndexFromLabel(day.label, active + 1);
  // What the itinerary already holds for this day, so the button never offers to add it twice.
  const saved = new Set((data?.itinerary ?? []).filter((row) => row.day_index === index).map((row) => norm(String(row.title ?? ""))));
  const missing = day.stops.filter((stop) => !saved.has(norm(stop.title)));
  const dayPoints = pointsFromItinerary(block, active);
  const times = day.stops.map((s) => s.time).filter((t): t is string => Boolean(t && parseClockTime(t)));

  async function addDay() {
    if (status !== "idle" || missing.length === 0) return;
    setStatus("adding");
    const failures = await addStopsToItinerary(tripId, index, missing);
    setStatus("idle");
    if (failures === missing.length) notifyToast(`Couldn’t add ${day.label}. Try again.`, "error");
    else notifyToast(failures ? `Added ${day.label} — ${failures} stop${failures === 1 ? "" : "s"} didn’t save.` : `Added ${day.label} to your itinerary.`, failures ? "info" : "success");
  }

  return (
    <div className="space-y-5 p-4 pb-8">
      {block.days.length > 1 && (
        <SlidingTabs
          label="Days"
          className="w-fit max-w-full overflow-x-auto no-scrollbar daisy-tabs-sm"
          value={active}
          onChange={setActive}
          items={block.days.map((d, i) => ({ key: i, content: <span>{d.label}</span> }))}
        />
      )}

      <ContentSwap swapKey={String(active)} className="space-y-5">
      <header className={cn(surface, "space-y-4 p-5")}>
        <div className="space-y-1.5">
          {/* The tab and the panel title already say which day this is; the headline is what the day is about. */}
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-[-0.03em]">{day.subtitle ?? day.label}</h2>
          <Meta items={[`${day.stops.length} stop${day.stops.length === 1 ? "" : "s"}`, times.length > 1 ? `${formatClockTime(times[0])} to ${formatClockTime(times[times.length - 1])}` : null]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {missing.length === 0 ? (
          <Badge tone="positive" icon={Check} className="h-8 px-3 text-sm">Already in your itinerary</Badge>
        ) : (
          <button
            type="button"
            onClick={() => void addDay()}
            disabled={status === "adding"}
            className="inline-flex h-11 min-w-48 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          >
            {status === "adding" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarPlus className="size-4" aria-hidden />}
            {missing.length < day.stops.length ? `Add the other ${missing.length} stop${missing.length === 1 ? "" : "s"}` : `Add ${day.label} to itinerary`}
          </button>
        )}
        {ctx && dayPoints.length > 0 && <MapButton className="h-11 rounded-full px-5 text-sm" onClick={() => ctx.openPanel({ kind: "map", title: `${day.label} on the map`, points: dayPoints })} />}
        </div>
      </header>

      <PlanStops stops={day.stops} variant="panel" stagger onOpenPlace={ctx ? (stop) => ctx.openPanel({ kind: "place", placeId: stop.placeId!, name: stop.title }) : undefined} />
      </ContentSwap>
    </div>
  );
}
