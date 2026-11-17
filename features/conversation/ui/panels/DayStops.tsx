"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { motionTokens } from "@/components/motion-primitives";
import { formatClockTime, parseClockTime } from "@/lib/application/clock-time";
import { cn } from "@/lib/utils";
import { stopGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { TINT, type PlanStop } from "@/features/conversation/ui/blocks/PlanStops";

/** A day's stops as a column of cards: the time sits inside each card with what it is, and a short line joins one card to the next. */
export function DayStops({ stops, onOpenPlace }: { stops: PlanStop[]; onOpenPlace?: (stop: PlanStop) => void }) {
  const reduce = useReducedMotion();
  return (
    <ol>
      {stops.map((stop, i) => {
        const glyph = stop.glyph ?? stopGlyph(stop.kind, stop.title);
        const Icon = glyph.icon;
        const last = i === stops.length - 1;
        const clock = parseClockTime(stop.time);
        const time = clock ? formatClockTime(clock) : null;
        const open = stop.placeId && onOpenPlace ? () => onOpenPlace(stop) : null;
        const body = (
          <>
            <span role="img" aria-label={glyph.label} className={cn("grid size-10 shrink-0 place-items-center rounded-full", TINT[stop.kind ?? "activity"])}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {time && <span className="rounded-full bg-coral-soft px-2 py-0.5 tabular-nums text-coral-ink">{time}</span>}
                <span className="truncate">{glyph.label}</span>
              </span>
              <span className="mt-1 block font-display text-lg font-semibold leading-6 tracking-[-0.015em]">{stop.title}</span>
              {stop.note && <span className="mt-1 block text-body leading-normal text-ink-soft">{stop.note}</span>}
            </span>
            {open && <ChevronRight aria-hidden className="mt-2.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />}
          </>
        );
        return (
          <motion.li
            key={`${stop.title}-${i}`}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...motionTokens.swap, delay: 0.08 + i * 0.07 }}
          >
            {open ? (
              <button type="button" onClick={open} className="group flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition-[transform,box-shadow] duration-200 active:scale-[0.985] lg:hover:-translate-y-0.5 lg:hover:shadow-float">
                {body}
              </button>
            ) : (
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">{body}</div>
            )}
            {!last && <span aria-hidden className="mx-9 block h-4 w-px bg-coral/30" />}
          </motion.li>
        );
      })}
    </ol>
  );
}
