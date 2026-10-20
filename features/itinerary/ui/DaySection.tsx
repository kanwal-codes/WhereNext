"use client";

import { AnimatePresence, motion } from "motion/react";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { KIND_META } from "@/components/overview/ReservationSheet";
import { AlertTriangle, Plus, X } from "lucide-react";
import { clockLabel } from "@/lib/trip-reservations";
import { cn } from "@/lib/utils";
import { bookedLabel, dayDate } from "../domain/plan";
import type { PlanActions, PlanView, StopAdder } from "./PhoneDayView";
import { StopCard } from "./StopCard";

/** Dragging a stop between days (or within one): which stop is held, where it would land, and the drop itself. */
export type DragState = {
  dragTitle: string | null;
  setDragTitle: (title: string | null) => void;
  dropHint: string | null;
  setDropHint: (hint: string | null) => void;
  onDropAt: (toDay: number, beforeTitle: string | null) => void;
};

/** One day of the plan on a wide screen: its date and city, the add form, clashes and bookings, and its stops as draggable cards. */
export function DaySection({ d, startDate, tripId, plan, actions, adder, drag, openTools, setOpenTools }: {
  d: number;
  startDate: string | null;
  tripId: string;
  plan: PlanView;
  actions: PlanActions;
  adder: StopAdder;
  drag: DragState;
  /** On a phone-width page a stop's controls stay tucked away until its ⋯ is tapped. */
  openTools: string | null;
  setOpenTools: (update: (current: string | null) => string | null) => void;
}) {
  const { itemsByDay, days, bookedByDay, conflictsByDay, near, cityFor } = plan;
  const { move, moveWithinDay, toggleLock, setTime, remove, openPlace, resolvingTitle } = actions;
  const { title, setTitle, setPicked, day, setDay, addOpen, setAddOpen, add } = adder;
  const { dragTitle, setDragTitle, dropHint, setDropHint, onDropAt } = drag;
  const dayItems = itemsByDay.get(d) ?? [];
  const date = dayDate(startDate, d);
  return (
    <section
      key={d}
      id={`day-${d}`}
      className="scroll-mt-6"
      onDragOver={(e) => {
        if (dragTitle) {
          e.preventDefault();
          if (dayItems.length === 0) setDropHint(`${d}:end`);
        }
      }}
      onDrop={(e) => {
        if (!dragTitle) return;
        e.preventDefault();
        if (dayItems.length === 0) onDropAt(d, null);
      }}
    >
      <div className="grid gap-x-10 gap-y-5 md:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="flex items-end justify-between gap-4 md:sticky md:top-6 md:flex-col md:items-start md:justify-start md:self-start">
        <div className="min-w-0">
          <p aria-hidden className="font-display text-6xl leading-none tabular-nums text-foreground/15 sm:text-7xl">{String(d).padStart(2, "0")}</p>
          <h3 suppressHydrationWarning className="mt-2 font-display text-2xl tracking-tight">{date ?? `Day ${d}`}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {cityFor(d) ? `${cityFor(d)} · ` : ""}
            {dayItems.length === 0 ? ((bookedByDay.get(d) ?? []).length > 0 ? "Booked only" : "Open day") : `${dayItems.length} ${dayItems.length === 1 ? "stop" : "stops"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDay(d);
            setAddOpen(true);
          }}
          className="daisy-btn daisy-btn-sm h-9 shrink-0 rounded-full border-border bg-card px-4 font-medium shadow-none hover:border-foreground/30 hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" /> Add here
        </button>
      </div>

      <div className="min-w-0">
      {addOpen && day === d && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAddOpen(false);
          }}
          className="relative mb-4 flex flex-wrap items-center gap-2 rounded-3xl border border-border/70 bg-card p-2 pl-5 shadow-soft transition-colors focus-within:border-foreground/30"
        >
          <Plus aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 basis-48 max-sm:pr-8">
            <DestinationCombobox
              tripId={tripId}
              scope="places"
              near={near}
              enter="free"
              onEnter={() => void add()}
              ariaLabel="Add itinerary item"
              value={title}
              onChange={setTitle}
              onPick={(sug) => {
                setPicked({ id: sug.placeId, text: sug.text });
                setTitle(sug.text);
              }}
              onSelect={() => undefined}
              autoFocus
              maxLength={200}
              placeholder={`Add something to ${date ?? `day ${d}`}…`}
              inputClassName="w-full min-w-0 bg-transparent px-1 py-2 text-body outline-none placeholder:text-muted-foreground"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Day
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-foreground/40"
            >
              {days.map((n) => (
                <option key={n} value={n}>
                  {`Day ${n}${dayDate(startDate, n) ? ` · ${dayDate(startDate, n)}` : ""}`}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="daisy-btn daisy-btn-neutral h-10 rounded-full border-0 px-6 shadow-none">
            Add
          </button>
          <button type="button" onClick={() => setAddOpen(false)} aria-label="Close" className="grid size-9 shrink-0 max-sm:absolute max-sm:top-1.5 max-sm:right-1.5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X aria-hidden className="size-4" />
          </button>
        </form>
      )}
      {(conflictsByDay.get(d) ?? []).length > 0 && (
        <ul aria-label={`Scheduling clashes on day ${d}`} className="mb-4 space-y-2">
          {(conflictsByDay.get(d) ?? []).map((c) => (
            <li key={`${c.a}-${c.b}`} className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-caution" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.a}</span> and <span className="font-medium">{c.b}</span> are close together, around {clockLabel(c.at)}.
              </span>
            </li>
          ))}
        </ul>
      )}
      {(bookedByDay.get(d) ?? []).length > 0 && (
        <ul aria-label={`Booked on day ${d}`} className="mb-4 space-y-2">
          {(bookedByDay.get(d) ?? []).map(({ reservation, note }) => {
            const Icon = KIND_META[reservation.kind].icon;
            return (
              <li key={`${reservation.id}-${note ?? "on"}`}>
                <a href={`/trips/${tripId}/bookings`} className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-2.5 text-sm transition-colors hover:bg-accent">
                  <Icon className="h-4 w-4 shrink-0 text-leaf" />
                  <span className="min-w-0 flex-1 truncate font-medium">{reservation.title}</span>
                  <span suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {bookedLabel(reservation, note)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <div className="relative pl-7">
        <span className="absolute top-3 bottom-3 left-[9px] w-px bg-border" />
        <AnimatePresence initial={false}>
          {dayItems.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                "rounded-3xl border border-dashed px-5 py-8 text-sm text-muted-foreground",
                dropHint === `${d}:end` ? "border-coral bg-coral-soft/40" : "border-border",
              )}
            >
              Nothing planned. Use Add here<span className="max-lg:hidden">, or drag an item here</span>.
            </motion.p>
          )}
          {dayItems.map((item, itemIndex) => (
            <StopCard key={item.id} item={item} itemIndex={itemIndex} d={d} count={dayItems.length} actions={actions} drag={drag} openTools={openTools} setOpenTools={setOpenTools} />
          ))}
        </AnimatePresence>
      </div>
      </div>
      </div>
    </section>
  );
}
