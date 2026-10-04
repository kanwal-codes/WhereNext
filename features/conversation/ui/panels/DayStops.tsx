"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { motionTokens } from "@/components/motion-primitives";
import { formatClockTime, parseClockTime } from "@/lib/application/clock-time";
import { cn } from "@/lib/utils";
import { stopGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { TINT, type PlanStop } from "@/features/conversation/ui/blocks/PlanStops";

/** A day's stops as a timeline: the time, a node on a line that runs to the next stop, and a card for the stop itself. */
export function DayStops({ stops, onOpenPlace }: { stops: PlanStop[]; onOpenPlace?: (stop: PlanStop) => void }) {
  const reduce = useReducedMotion();
  const timed = stops.some((stop) => parseClockTime(stop.time));
  return (
    <ol>
      {stops.map((stop, i) => {
        const glyph = stop.glyph ?? stopGlyph(stop.kind, stop.title);
        const Icon = glyph.icon;
        const last = i === stops.length - 1;
        const clock = parseClockTime(stop.time);
        const [hour, period] = clock ? formatClockTime(clock).split(" ") : [null, null];
        const open = stop.placeId && onOpenPlace ? () => onOpenPlace(stop) : null;
        const body = (
          <>
            <span role="img" aria-label={glyph.label} className={cn("mt-1.5 grid size-10 shrink-0 place-items-center rounded-full max-sm:size-9", TINT[stop.kind ?? "activity"])}>
              <Icon className="size-[1.125rem]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="eyebrow block">{glyph.label}</span>
              <span className="block font-display text-lg font-semibold leading-6 tracking-[-0.015em]">{stop.title}</span>
              {stop.note && <span className="mt-1 block text-sm leading-normal text-ink-soft">{stop.note}</span>}
            </span>
            {open && (
              <span aria-hidden className="mt-1.5 grid size-8 shrink-0 max-sm:hidden place-items-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:translate-x-px group-hover:-translate-y-px" />
              </span>
            )}
          </>
        );
        return (
          <motion.li
            key={`${stop.title}-${i}`}
            className="flex gap-2.5 sm:gap-3"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...motionTokens.swap, delay: 0.08 + i * 0.07 }}
          >
            {timed && (
              <div className="w-[4.25rem] shrink-0 whitespace-nowrap sm:w-[4.5rem] pt-8 text-right leading-5">
                {hour && <span className="font-display text-base font-semibold tabular-nums">{hour}</span>}
                {period && <span className="ml-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{period}</span>}
              </div>
            )}
            <div aria-hidden className="relative w-3 shrink-0">
              {stops.length > 1 && <span className={cn("absolute left-1/2 w-px -translate-x-1/2 bg-coral/30", i === 0 ? "top-11 bottom-0" : last ? "top-0 h-11" : "inset-y-0")} />}
              <span className="absolute left-0 top-[2.375rem] size-3 rounded-full bg-coral ring-4 ring-coral-soft" />
            </div>
            <div className={cn("min-w-0 flex-1", !last && "pb-3")}>
              {open ? (
                <button type="button" onClick={open} className="group flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">{body}</div>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
