"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/components/motion-primitives";
import { ArrowUpRight } from "lucide-react";
import { formatClockTime } from "@/lib/application/clock-time";
import { cn } from "@/lib/utils";
import { stopGlyph, type Glyph, type StopKind } from "./glyphs";
import { textAction, type } from "./ui";

/** `glyph` overrides the icon a stop would get from its kind (a route step brings its own); `trailing` is a right-aligned figure such as a duration. */
export type PlanStop = { time?: string; title: string; note?: string; placeId?: string; kind?: StopKind; glyph?: Glyph; trailing?: string };

/** The tint of a stop's icon comes from the plan's kind of stop; the icon itself from what the stop is. */
const TINT: Record<StopKind, string> = {
  food: "bg-chart-5/15 text-chart-5",
  sight: "bg-chart-1/15 text-chart-1",
  activity: "bg-chart-2/15 text-chart-2",
  nightlife: "bg-chart-4/15 text-chart-4",
  transit: "bg-foreground/10 text-muted-foreground",
  event: "bg-chart-3/15 text-chart-3",
  rest: "bg-foreground/10 text-muted-foreground",
};

/**
 * A day's stops as a rail: one icon per stop with a connector that runs exactly to the next one.
 * Each row is a flex line whose first line (icon, time, title) shares one fixed-height band, so their
 * centres coincide however long the note runs. `card` sits inside a chat reply (time inline, outlined
 * icons); `panel` is the side-panel version (time in its own column, icons tinted by kind).
 */
export function PlanStops({ stops, variant, onOpenPlace, stagger = false }: { stops: PlanStop[]; variant: "card" | "panel"; onOpenPlace?: (stop: PlanStop) => void; /** Rows settle in one after another (for a list that has just opened). */ stagger?: boolean }) {
  const reduce = useReducedMotion();
  const panel = variant === "panel";
  const timed = stops.some((stop) => stop.time); // no time column when no stop has a time
  const band = panel ? "min-h-9" : "min-h-8";
  return (
    <ol>
      {stops.map((stop, i) => {
        const glyph = stop.glyph ?? stopGlyph(stop.kind, stop.title);
        const Icon = glyph.icon;
        const last = i === stops.length - 1;
        const time = stop.time ? formatClockTime(stop.time) : null;
        const open = stop.placeId && onOpenPlace ? () => onOpenPlace(stop) : null;
        return (
          <motion.li
            key={`${stop.title}-${i}`}
            className="flex gap-3"
            initial={stagger && !reduce ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...motionTokens.swap, delay: stagger ? 0.05 + i * 0.05 : 0 }}
          >
            {panel && timed && (
              <div className={cn(band, "flex w-[4.5rem] shrink-0 items-center justify-end self-start whitespace-nowrap text-sm font-medium tabular-nums text-muted-foreground")}>{time}</div>
            )}
            <div className="flex shrink-0 flex-col items-center" aria-hidden={!open ? undefined : undefined}>
              <span
                role="img"
                aria-label={glyph.label}
                className={cn("grid shrink-0 place-items-center rounded-full", panel ? cn("size-9", TINT[stop.kind ?? "activity"]) : "size-8 border border-border bg-card text-coral")}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              {!last && <span aria-hidden className="mt-1 mb-1 w-0.5 flex-1 rounded-full bg-foreground/15" />}
            </div>
            <div className={cn("min-w-0 flex-1", !last && (panel ? "pb-6" : "pb-4"))}>
              <div className={cn(band, "flex items-center gap-2")}>
                {!panel && time && <span className={cn(type.meta, "shrink-0 font-medium tabular-nums")}>{time}</span>}
                {open ? (
                  <button type="button" onClick={open} className={cn(textAction, "min-w-0 text-left", panel ? "font-display text-base font-semibold leading-snug" : "text-sm font-medium")}>
                    {stop.title} <ArrowUpRight className={cn("text-muted-foreground", panel ? "size-4" : "size-3.5")} aria-hidden />
                  </button>
                ) : (
                  <p className={cn("min-w-0", panel ? "font-display text-base font-semibold leading-snug" : cn(type.body, "font-medium"))}>{stop.title}</p>
                )}
                {stop.trailing && <span className={cn(type.meta, "ml-auto shrink-0 font-medium tabular-nums")}>{stop.trailing}</span>}
              </div>
              {stop.note && <p className={cn(panel ? cn(type.body, "text-ink-soft") : type.meta)}>{stop.note}</p>}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
