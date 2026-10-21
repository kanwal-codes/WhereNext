"use client";

import { motion } from "motion/react";
import { stopGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronDown, ChevronUp, Clock, GripVertical, Loader2, Lock, LockOpen, MoreHorizontal, Trash2 } from "lucide-react";
import type { ItineraryItem } from "@/features/itinerary/domain/item";
import { cn } from "@/lib/utils";
import type { DragState } from "./DaySection";
import type { PlanActions } from "./PhoneDayView";

/** One stop on a wide screen: a draggable card with its time, and move / lock / remove controls (behind a ⋯ on a narrow page). */
export function StopCard({ item, itemIndex, d, count, actions, drag, openTools, setOpenTools }: {
  item: ItineraryItem;
  itemIndex: number;
  /** The day it is on, and how many stops that day has. */
  d: number;
  count: number;
  actions: PlanActions;
  drag: DragState;
  openTools: string | null;
  setOpenTools: (update: (current: string | null) => string | null) => void;
}) {
  const { move, moveWithinDay, toggleLock, setTime, remove, openPlace, resolvingTitle } = actions;
  const { dragTitle, setDragTitle, dropHint, setDropHint, onDropAt } = drag;
  const locked = item.metadata?.locked === true;
  const hint = dropHint === `${d}:${item.title}`;
  const providerId = typeof item.metadata?.provider_id === "string" ? item.metadata.provider_id : null;
  return (
    <motion.div
key={item.id}
layout
initial={{ opacity: 0, x: -8 }}
animate={{ opacity: 1, x: 0 }}
exit={{ opacity: 0, x: 12, height: 0 }}
transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
className={cn("group relative mb-3", dragTitle === item.title && "opacity-40")}
onDragOver={(e) => {
  if (!dragTitle || dragTitle === item.title) return;
  e.preventDefault();
  e.stopPropagation();
  setDropHint(`${d}:${item.title}`);
}}
onDrop={(e) => {
  if (!dragTitle) return;
  e.preventDefault();
  e.stopPropagation();
  onDropAt(d, item.title);
}}
    >
<span className="absolute top-1/2 -left-7 grid h-[18px] w-[18px] -translate-y-1/2 place-items-center rounded-full border border-border bg-background">
  <span className={cn("h-1.5 w-1.5 rounded-full", locked ? "bg-leaf" : "bg-coral")} />
</span>
<div
  className={cn(
    "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-3xl border bg-card px-3 py-4 shadow-soft max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:pl-4 transition-[border-color,box-shadow] duration-300 hover:shadow-lift",
    hint ? "border-coral" : locked ? "border-border" : "border-border/70",
  )}
>
  <button
    type="button"
    aria-label="Drag to reorder"
    draggable={!locked}
    onDragStart={() => setDragTitle(item.title)}
    onDragEnd={() => {
      setDragTitle(null);
      setDropHint(null);
    }}
    // Dragging needs a mouse: on a phone the ⋯ menu moves a stop, so the handle is not shown there.
    className={cn("cursor-grab rounded p-1 text-muted-foreground active:cursor-grabbing max-sm:hidden", locked && "cursor-not-allowed opacity-30")}
  >
    <GripVertical className="h-3.5 w-3.5" />
  </button>
  <div className="flex min-w-0 items-start gap-3">
    {/* What the stop is, drawn the way the plan shows it in Roam. */}
    {(() => {
      const Glyph = stopGlyph(undefined, item.title).icon;
      return (
        <span aria-hidden className={cn("mt-0.5 hidden size-9 shrink-0 place-items-center rounded-xl sm:grid", locked ? "bg-positive-soft text-positive" : "bg-coral-soft text-coral-ink")}>
          <Glyph className="size-[18px]" />
        </span>
      );
    })()}
  <div className="min-w-0">
    <p className="flex items-center gap-2 font-display text-lg leading-snug tracking-tight">
      <button
        type="button"
        onClick={() => void openPlace(item, providerId)}
        disabled={resolvingTitle === item.title}
        className={cn("text-left hover:text-coral hover:underline disabled:opacity-60 max-sm:py-1", "max-lg:py-2 max-sm:py-2.5")}
      >
        {item.title}{" "}
        {resolvingTitle === item.title ? (
          <Loader2 className="inline h-3 w-3 animate-spin align-[-1px] text-muted-foreground" />
        ) : (
          <ArrowUpRight className="inline h-3 w-3 align-[-1px] text-muted-foreground" />
        )}
      </button>
      {locked && <Lock className="h-3 w-3 shrink-0 text-leaf" />}
    </p>
    {(() => {
      const time = typeof item.metadata?.time === "string" ? item.metadata.time : "";
      return (
        <div className="relative mt-0.5 inline-flex items-center">
          <input
            type="time"
            aria-label={`Target time for ${item.title}`}
            value={time}
            disabled={locked}
            onChange={(e) => setTime(item, e.target.value || null)}
            className={cn(
              "rounded border-none bg-transparent p-0 text-xs outline-none transition-colors [color-scheme:auto] disabled:opacity-50 max-sm:py-2 [&::-webkit-calendar-picker-indicator]:hidden",
              "max-lg:py-2.5 max-sm:py-3",
              time ? "text-muted-foreground hover:text-foreground" : "text-transparent",
            )}
          />
          {/* The native empty-time placeholder ("--:-- --") reads as broken, not
              "click to set a time" — this sits on top of the (still functional,
              just transparent) input to say that instead. */}
          {!time && (
            <span className="pointer-events-none absolute left-0 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> <span className="whitespace-nowrap">Add time</span>
            </span>
          )}
        </div>
      );
    })()}
  </div>
  </div>
  <button
    type="button"
    onClick={() => setOpenTools((current) => (current === item.id ? null : item.id))}
    aria-expanded={openTools === item.id}
    aria-label={`Options for ${item.title}`}
    className="grid size-9 max-sm:size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent sm:hidden"
  >
    <MoreHorizontal className="size-4" />
  </button>
  <div className={cn("col-span-3 max-sm:col-span-2 row-start-2 flex-wrap items-center justify-end gap-1 border-t border-border/60 pt-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:flex sm:shrink-0 sm:border-0 sm:pt-0 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100", openTools === item.id ? "flex" : "hidden")}>
    <button
      aria-label={`Move ${item.title} earlier in the day`}
      onClick={() => moveWithinDay(item, -1)}
      disabled={locked || itemIndex === 0}
      className="rounded-lg p-1.5 transition-colors hover:bg-accent disabled:opacity-30"
    >
      <ChevronUp className="h-3.5 w-3.5" />
    </button>
    <button
      aria-label={`Move ${item.title} later in the day`}
      onClick={() => moveWithinDay(item, 1)}
      disabled={locked || itemIndex === count - 1}
      className="rounded-lg p-1.5 transition-colors hover:bg-accent disabled:opacity-30"
    >
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
    <button aria-label="Move to previous day" onClick={() => move(item, -1)} disabled={locked} className="rounded-lg p-1.5 transition-colors hover:bg-accent disabled:opacity-30">
      <ArrowUp className="h-3.5 w-3.5" />
    </button>
    <button aria-label="Move to next day" onClick={() => move(item, 1)} disabled={locked} className="rounded-lg p-1.5 transition-colors hover:bg-accent disabled:opacity-30">
      <ArrowDown className="h-3.5 w-3.5" />
    </button>
    <button aria-label={locked ? "Unlock" : "Lock"} onClick={() => toggleLock(item)} className="rounded-lg p-1.5 transition-colors hover:bg-accent">
      {locked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
    </button>
    <button aria-label="Remove" onClick={() => remove(item)} disabled={locked} className="rounded-lg p-1.5 text-destructive transition-colors hover:bg-accent disabled:opacity-30">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  </div>
</div>
    </motion.div>
  );
}
