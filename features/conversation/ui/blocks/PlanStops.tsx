"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, Reorder, useDragControls, useReducedMotion } from "motion/react";
import { motionTokens } from "@/components/motion-primitives";
import { ArrowUpRight, GripVertical } from "lucide-react";
import { formatClockTime } from "@/lib/application/clock-time";
import { cn } from "@/lib/utils";
import { stopGlyph, type Glyph, type StopKind } from "./glyphs";
import { textAction, type } from "./ui";

/** `glyph` overrides the icon a stop would get from its kind (a route step brings its own); `trailing` is a right-aligned figure such as a duration. */
export type PlanStop = { /** Stable identity for a reorderable list. */ id?: string; time?: string; title: string; note?: string; placeId?: string; kind?: StopKind; glyph?: Glyph; trailing?: string };

/** The tint of a stop's icon comes from the plan's kind of stop; the icon itself from what the stop is. */
export const TINT: Record<StopKind, string> = {
  food: "bg-chart-5/15 text-chart-5",
  sight: "bg-chart-1/15 text-chart-1",
  activity: "bg-chart-2/15 text-chart-2",
  nightlife: "bg-chart-4/15 text-chart-4",
  transit: "bg-foreground/10 text-muted-foreground",
  event: "bg-chart-3/15 text-chart-3",
  rest: "bg-foreground/10 text-muted-foreground",
};

const HOLD_MS = 320; // touch and hold this long to pick a row up
const SLOP = 8; // px a finger may drift during the hold before it counts as a scroll

type RowProps = {
  stop: PlanStop;
  index: number;
  last: boolean;
  panel: boolean;
  /** The roomy plan version: a big tinted tile per stop and more air between stops. */
  roomy?: boolean;
  timed: boolean;
  band: string;
  onOpenPlace?: (stop: PlanStop) => void;
  /** Present when the list can be reordered: lets the row lift itself and move by keyboard. */
  reorder?: { id: string; count: number; move: (by: -1 | 1) => void };
  dragging?: boolean;
  controls?: ReturnType<typeof useDragControls>;
};

/** One stop: icon with its connector, time, title, note. Shared by the static list and the reorderable one. */
function StopRow({ stop, last, panel, roomy = false, timed, band, onOpenPlace, reorder, dragging, controls, index }: RowProps) {
  const glyph = stop.glyph ?? stopGlyph(stop.kind, stop.title);
  const Icon = glyph.icon;
  const time = stop.time ? formatClockTime(stop.time) : null;
  const open = stop.placeId && onOpenPlace ? () => onOpenPlace(stop) : null;
  return (
    <>
      {panel && timed && (
        <div className={cn(band, "flex shrink-0 justify-end self-start whitespace-nowrap font-medium tabular-nums", roomy ? cn("pt-1", /\d/.test(time ?? "") ? "w-[3.75rem] font-display text-lg text-foreground" : "w-[4.5rem] text-[0.8125rem] font-semibold text-ink-soft") : "w-[4.5rem] items-center text-sm text-muted-foreground")}>{time}</div>
      )}
      <div className="flex shrink-0 flex-col items-center">
        <span
          role="img"
          aria-label={glyph.label}
          className={cn("grid shrink-0 place-items-center transition-shadow duration-200", roomy ? "size-14 rounded-[1.25rem]" : "rounded-full", panel ? cn(roomy ? "" : "size-9", TINT[stop.kind ?? "activity"]) : "size-8 border border-border bg-card text-coral", dragging && "shadow-lift")}
        >
          {roomy && !timed ? <span className="font-display text-lg font-medium tabular-nums" aria-hidden>{index + 1}</span> : <Icon className={roomy ? "size-6" : "size-4"} aria-hidden />}
        </span>
        {!last && <span aria-hidden className={cn("mt-1 mb-1 w-0.5 flex-1 rounded-full bg-foreground/15 transition-opacity", dragging && "opacity-0")} />}
      </div>
      <div className={cn("min-w-0 flex-1", roomy && "pt-0.5", !last && (roomy ? "pb-7" : panel ? "pb-6" : "pb-4"))}>
        <div className={cn(roomy ? "flex items-center gap-2" : cn(band, "flex items-center gap-2"))}>
          {!panel && time && <span className={cn(type.meta, "shrink-0 font-medium tabular-nums")}>{time}</span>}
          {open ? (
            <button type="button" onClick={open} className={cn(textAction, "min-w-0 text-left", roomy ? "font-display text-[1.0625rem] font-medium leading-snug" : panel ? "font-display text-base font-semibold leading-snug" : "text-sm font-medium")}>
              {stop.title} <ArrowUpRight className={cn("text-muted-foreground", panel ? "size-4" : "size-3.5")} aria-hidden />
            </button>
          ) : (
            <p className={cn("min-w-0", roomy ? "font-display text-[1.0625rem] font-medium leading-snug" : panel ? "font-display text-base font-semibold leading-snug" : cn(type.body, "font-medium"))}>{stop.title}</p>
          )}
          {stop.trailing && <span className={cn(type.meta, "ml-auto shrink-0 font-medium tabular-nums")}>{stop.trailing}</span>}
        </div>
        {stop.note && <p className={cn(roomy ? "mt-1 text-sm leading-snug text-ink-soft" : panel ? cn(type.body, "text-ink-soft") : type.meta)}>{stop.note}</p>}
      </div>
      {reorder && (
        <button
          type="button"
          aria-label={`Move ${stop.title}: stop ${index + 1} of ${reorder.count}. Press the up or down arrow to move it.`}
          onPointerDown={(event) => {
            // The handle picks the row up at once (it is the only part with touch-action: none); the rest of the row needs a hold.
            controls?.start(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              reorder.move(event.key === "ArrowUp" ? -1 : 1);
            }
          }}
          className={cn(
            "-mr-1.5 grid size-9 shrink-0 cursor-grab touch-none place-items-center self-start rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring active:cursor-grabbing",
            dragging && "text-foreground",
          )}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      )}
    </>
  );
}

/** A reorderable row: drag by its handle, or touch and hold anywhere on the row, then slide it to its new place. */
function ReorderableRow(props: Omit<RowProps, "dragging" | "controls" | "reorder"> & { id: string; count: number; move: (by: -1 | 1) => void; onHold: (on: boolean) => void }) {
  const { id, count, move, onHold, ...row } = props;
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  // Once a row is picked up the page must not scroll under the finger. The listener goes on at the moment of the hold
  // (not at the first drag frame), because by then the browser has already taken the gesture for a scroll.
  const block = useRef((event: TouchEvent) => {
    if (event.cancelable) event.preventDefault();
  });
  const unblock = () => document.removeEventListener("touchmove", block.current);
  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    start.current = null;
  };
  useEffect(
    () => () => {
      cancel();
      unblock();
    },
    [],
  );

  return (
    <Reorder.Item
      as="li"
      value={id}
      dragListener={false}
      dragControls={controls}
      layout="position"
      className={cn("relative flex gap-3 rounded-xl px-2 select-none", dragging && "z-10 bg-card shadow-lift ring-1 ring-border")}
      style={{ WebkitTouchCallout: "none" }}
      whileDrag={{ scale: 1.015 }}
      transition={motionTokens.swap}
      onDragStart={() => {
        setDragging(true);
        onHold(true);
      }}
      onDragEnd={() => {
        setDragging(false);
        onHold(false);
        held.current = false;
        unblock();
      }}
      onPointerDown={(event) => {
        // Touch and hold on the row itself. A mouse uses the handle, so a click on the title still works.
        if (event.pointerType === "mouse" || (event.target as HTMLElement).closest("button")) return;
        start.current = { x: event.clientX, y: event.clientY };
        const native = event.nativeEvent;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          if (!start.current) return;
          held.current = true;
          document.addEventListener("touchmove", block.current, { passive: false });
          navigator.vibrate?.(12);
          controls.start(native);
        }, HOLD_MS);
      }}
      onPointerMove={(event) => {
        if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > SLOP && !held.current) cancel();
      }}
      onPointerUp={() => {
        cancel();
        unblock();
        held.current = false;
      }}
      onPointerCancel={() => {
        cancel();
        unblock();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <StopRow {...row} dragging={dragging} controls={controls} reorder={{ id, count, move }} />
    </Reorder.Item>
  );
}

/**
 * A day's stops as a rail: one icon per stop with a connector that runs exactly to the next one.
 * Each row is a flex line whose first line (icon, time, title) shares one fixed-height band, so their
 * centres coincide however long the note runs. `card` sits inside a chat reply (time inline, outlined
 * icons); `panel` is the side-panel version (time in its own column, icons tinted by kind).
 * With `onReorder` the rows can be moved: by the grip, by touch and hold, or by the arrow keys on the grip.
 */
export function PlanStops({ stops, variant, onOpenPlace, stagger = false, onReorder }: { stops: PlanStop[]; variant: "card" | "panel" | "plan"; onOpenPlace?: (stop: PlanStop) => void; /** Rows settle in one after another (for a list that has just opened). */ stagger?: boolean; /** Called with the stop ids in their new order; each stop needs an `id`. */ onReorder?: (ids: string[]) => void }) {
  const reduce = useReducedMotion();
  const roomy = variant === "plan";
  const panel = variant === "panel" || roomy;
  const timed = stops.some((stop) => stop.time); // no time column when no stop has a time
  const band = roomy ? "" : panel ? "min-h-9" : "min-h-8";
  const [carrying, setCarrying] = useState(false);

  if (onReorder && stops.every((stop) => stop.id)) {
    const ids = stops.map((stop) => stop.id as string);
    const move = (from: number, by: -1 | 1) => {
      const to = from + by;
      if (to < 0 || to >= ids.length) return;
      const next = [...ids];
      [next[from], next[to]] = [next[to], next[from]];
      onReorder(next);
    };
    return (
      <Reorder.Group as="ol" axis="y" values={ids} onReorder={onReorder} className={cn("-mx-2", carrying && "cursor-grabbing")}>
        {stops.map((stop, i) => (
          <ReorderableRow
            key={stop.id}
            id={stop.id as string}
            stop={stop}
            index={i}
            count={stops.length}
            last={i === stops.length - 1}
            panel={panel}
            roomy={roomy}
            timed={timed}
            band={band}
            onOpenPlace={onOpenPlace}
            move={(by) => move(i, by)}
            onHold={setCarrying}
          />
        ))}
      </Reorder.Group>
    );
  }

  return (
    <ol>
      {stops.map((stop, i) => (
        <motion.li
          key={`${stop.title}-${i}`}
          className="flex gap-3"
          initial={stagger && !reduce ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...motionTokens.swap, delay: stagger ? 0.05 + i * 0.05 : 0 }}
        >
          <StopRow stop={stop} index={i} last={i === stops.length - 1} panel={panel} roomy={roomy} timed={timed} band={band} onOpenPlace={onOpenPlace} />
        </motion.li>
      ))}
    </ol>
  );
}
