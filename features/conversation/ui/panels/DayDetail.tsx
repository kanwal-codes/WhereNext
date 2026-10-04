"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CalendarPlus, Check, Loader2 } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type ItineraryBlock } from "@/components/TripPanelProvider";
import { addStopsToItinerary, dayIndexFromLabel } from "@/features/conversation/application/addPlanToItinerary";
import { ContentSwap } from "@/components/motion-primitives";
import { SlidingTabs } from "@/features/conversation/ui/blocks/SlidingTabs";
import { DayStops } from "./DayStops";
import { pointsFromItinerary } from "@/features/conversation/ui/blocks/mapPoints";
import { Badge, MapButton } from "@/features/conversation/ui/blocks/ui";
import { clockToMinutes, formatClockTime, parseClockTime } from "@/lib/application/clock-time";
import { notifyToast } from "@/lib/application/toast";

const partOfDay = (minutes: number) => (minutes < 720 ? "Morning" : minutes < 1020 ? "Afternoon" : "Evening");
const duration = (minutes: number) => `${minutes >= 60 ? `${Math.floor(minutes / 60)} hr` : ""}${minutes >= 60 && minutes % 60 ? " " : ""}${minutes % 60 || minutes < 60 ? `${minutes % 60} min` : ""}`;

/** The day's timed stops on one line from the first to the last, so its shape reads at a glance. */
function DayArc({ minutes }: { minutes: number[] }) {
  const reduce = useReducedMotion();
  const [start, end] = [minutes[0], minutes[minutes.length - 1]];
  return (
    <div className="mt-7" role="img" aria-label={`${formatClockTime(toClock(start))} to ${formatClockTime(toClock(end))}, ${duration(end - start)}`}>
      <div className="relative mx-1.5 h-4">
        <motion.span aria-hidden className="absolute -inset-x-1.5 top-1/2 h-px origin-left bg-gradient-to-r from-coral via-coral/40 to-coral" initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }} />
        {minutes.map((m, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-coral ring-4 ring-card"
            style={{ left: `${((m - start) / (end - start)) * 100}%` }}
            initial={reduce ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.25 + i * 0.08 }}
          />
        ))}
      </div>
      <div aria-hidden className="mt-2 flex items-center justify-between text-xs font-medium tabular-nums text-muted-foreground">
        <span>{formatClockTime(toClock(start))}</span>
        <span className="rounded-full bg-coral-soft px-2.5 py-0.5 text-coral-ink">{duration(end - start)}</span>
        <span>{formatClockTime(toClock(end))}</span>
      </div>
    </div>
  );
}
const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

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
  const minutes = day.stops.flatMap((s) => { const t = parseClockTime(s.time); return t ? [clockToMinutes(t)] : []; });
  const arc = minutes.length > 1 && minutes[minutes.length - 1] > minutes[0];
  const [from, to] = [partOfDay(minutes[0] ?? 0), partOfDay(minutes[minutes.length - 1] ?? 0)];
  const eyebrow = minutes.length === 0 ? day.label : from === to ? from : `${from} to ${to.toLowerCase()}`;

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
      <header className="relative isolate overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-coral-soft via-card to-card p-5 shadow-soft sm:p-6">
        <span aria-hidden className="pointer-events-none absolute right-5 top-3 -z-10 select-none font-display text-[8rem] font-medium leading-none tracking-[-0.06em] text-coral/10">{index}</span>
        <p className="eyebrow text-coral-ink">{eyebrow}</p>
        {/* The tab and the panel title already say which day this is; the headline is what the day is about. */}
        <h2 className="mt-2 max-w-[16ch] font-display text-4xl font-medium leading-[1.04] tracking-[-0.03em]">{day.subtitle ?? day.label}</h2>
        <p className="mt-3 text-sm text-ink-soft">{day.stops.length} stop{day.stops.length === 1 ? "" : "s"}</p>
        {arc && <DayArc minutes={minutes} />}
        <div className="mt-6 flex flex-wrap items-center gap-2">
        {missing.length === 0 ? (
          <Badge tone="positive" icon={Check} className="h-8 px-3 text-sm">Already in your itinerary</Badge>
        ) : (
          <button
            type="button"
            onClick={() => void addDay()}
            disabled={status === "adding"}
            className="inline-flex h-12 min-w-0 flex-1 whitespace-nowrap items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          >
            {status === "adding" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarPlus className="size-4" aria-hidden />}
            {missing.length < day.stops.length ? `Add the other ${missing.length} stop${missing.length === 1 ? "" : "s"}` : `Add ${day.label} to itinerary`}
          </button>
        )}
        {ctx && dayPoints.length > 0 && <MapButton className="h-12 rounded-full px-5 text-sm max-sm:w-12 max-sm:px-0" onClick={() => ctx.openPanel({ kind: "map", title: `${day.label} on the map`, points: dayPoints })}><span className="max-sm:sr-only">Map</span></MapButton>}
        </div>
      </header>

      <DayStops stops={day.stops} onOpenPlace={ctx ? (stop) => ctx.openPanel({ kind: "place", placeId: stop.placeId!, name: stop.title }) : undefined} />
      </ContentSwap>
    </div>
  );
}
