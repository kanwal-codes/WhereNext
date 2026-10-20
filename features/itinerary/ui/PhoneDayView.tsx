"use client";

import { TimeField } from "@/components/DateTimeField";
import { BookingNotices } from "@/components/overview/BookingNotices";
import { KIND_META } from "@/components/overview/ReservationSheet";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { Sheet } from "@/components/motion-primitives";
import { stopGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronUp, Clock, Lock, LockOpen, Map as MapIcon, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ItineraryItem } from "@/features/itinerary/domain/item";
import { clockLabel } from "@/lib/trip-reservations";
import { cn } from "@/lib/utils";
import type { useAddStop } from "../application/useAddStop";
import type { useBookings } from "../application/useBookings";
import type { useItineraryItems } from "../application/useItineraryItems";
import type { useOpenPlace } from "../application/useOpenPlace";
import { bookedLabel, chronological, dayDate, todayDayNumber, weekParts } from "../domain/plan";

/** What the plan looks like: every stop, the days, what is booked and clashing, and where the plan is centred. */
export type PlanView = {
  items: ItineraryItem[];
  itemsByDay: Map<number, ItineraryItem[]>;
  days: number[];
  bookedByDay: ReturnType<typeof useBookings>["bookedByDay"];
  conflictsByDay: ReturnType<typeof useBookings>["conflictsByDay"];
  reservations: ReturnType<typeof useBookings>["reservations"];
  removed: ReturnType<typeof useItineraryItems>["removed"];
  near: [number, number] | undefined;
  cityFor: (day: number) => string | null | undefined;
};
export type PlanActions = ReturnType<typeof useItineraryItems> & ReturnType<typeof useOpenPlace>;
export type StopAdder = ReturnType<typeof useAddStop>;

/** The phone's plan: one day at a time, with a week strip, a timeline and a sheet of actions per stop ("Day 2 of 20"). */
export function PhoneDayView({ tripId, startDate, trip, plan, actions, adder }: {
  tripId: string;
  startDate: string | null;
  trip: { end_date?: string | null } | null;
  plan: PlanView;
  actions: PlanActions;
  adder: StopAdder;
}) {
  const [phoneDay, setPhoneDay] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toolsItem, setToolsItem] = useState<ItineraryItem | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const { items, itemsByDay, days, bookedByDay, conflictsByDay, reservations, removed, near, cityFor } = plan;
  const { move, moveWithinDay, toggleLock, setTime, remove, restore, openPlace, resolvingTitle } = actions;
  const { title, setTitle, setPicked, day, setDay, addOpen, setAddOpen, add } = adder;
  // ---- Phone redesign (the approved Plan): "Day 2 of 20", the date, a week strip, and the day as a timeline. ----
  const today = new Date();
  const todayDay = todayDayNumber(startDate, today);
  const selectedDay = phoneDay ?? (todayDay && days.includes(todayDay) ? todayDay : days[0] ?? 1);
  const norm = (s: string) => s.trim().toLowerCase();
  const weekPartsOf = (d: number) => weekParts(startDate, d);
  useEffect(() => {
    stripRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [selectedDay]);

  const d = selectedDay;
  // Chronological: what has a time goes in time order, what has none follows in the order it was added.
  const dayItems = chronological(itemsByDay.get(d) ?? []);
  const booked = bookedByDay.get(d) ?? [];
  const city = cityFor(d);
  return (
    <div className="min-w-0 pb-24">
      <p className="eyebrow">Day {d} of {days.length}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h2 suppressHydrationWarning className="min-w-0 font-display text-[2.5rem] leading-[1.05] font-medium tracking-[-0.04em]">{dayDate(startDate, d) ?? `Day ${d}`}</h2>
        <button type="button" onClick={() => setPickerOpen(true)} aria-label="Choose a day" aria-haspopup="dialog" className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-foreground transition-transform active:scale-95">
          <ChevronDown className="size-5" aria-hidden />
        </button>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.9375rem] text-ink-soft">
        <span>{city ? `${city} · ` : ""}{dayItems.length === 0 ? (booked.length > 0 ? "Booked only" : "Open day") : `${dayItems.length} ${dayItems.length === 1 ? "stop" : "stops"}`}</span>
        <Link href={`/trips/${tripId}/today`} className="inline-flex min-h-11 items-center gap-0.5 font-medium text-foreground underline underline-offset-4">Today view <ArrowUpRight className="size-3.5" aria-hidden /></Link>
      </p>

      <div ref={stripRef} role="group" aria-label="Days" className="-mx-5 mt-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-5 py-1 no-scrollbar scroll-px-5">
        {days.map((n) => {
          const parts = weekPartsOf(n);
          const on = n === d;
          const planned = (itemsByDay.get(n) ?? []).length > 0;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setPhoneDay(n)}
              aria-current={on ? "date" : undefined}
              aria-label={`Day ${n}${dayDate(startDate, n) ? `, ${dayDate(startDate, n)}` : ""}${planned ? ", has plans" : ""}`}
              className={cn("flex h-[4.5rem] w-14 shrink-0 snap-center flex-col items-center justify-center gap-0.5 rounded-3xl border transition-colors", on ? "border-foreground bg-foreground text-background" : "border-border bg-background")}
            >
              <span className={cn("text-2xs tracking-[0.06em] uppercase", on ? "opacity-80" : "text-muted-foreground")}>{parts.dow}</span>
              <b className="font-display text-xl leading-none font-medium tabular-nums">{parts.num}</b>
              <i aria-hidden className={cn("mt-0.5 size-1.5 rounded-full", planned ? "bg-coral" : "bg-transparent")} />
            </button>
          );
        })}
      </div>

      {booked.length > 0 && (
        <ul aria-label={`Booked on day ${d}`} className="mt-5 space-y-2">
          {booked.map(({ reservation, note }) => {
            const Icon = KIND_META[reservation.kind].icon;
            return (
              <li key={`${reservation.id}-${note ?? "on"}`}>
                <a href={`/trips/${tripId}/bookings`} className="flex min-h-12 items-center gap-3 rounded-2xl bg-secondary px-4 py-2.5 text-sm">
                  <Icon className="size-[1.125rem] shrink-0 text-leaf" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{reservation.title}</span>
                  <span suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground tabular-nums">{bookedLabel(reservation, note)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {(conflictsByDay.get(d) ?? []).map((c) => (
        <p key={`${c.a}-${c.b}`} className="mt-2 flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-caution" aria-hidden />
          <span><span className="font-medium">{c.a}</span> and <span className="font-medium">{c.b}</span> are close together, around {clockLabel(c.at)}.</span>
        </p>
      ))}

      <ol className="relative mt-4 before:pointer-events-none before:absolute before:top-8 before:bottom-8 before:left-[0.3125rem] before:border-l-[1.5px] before:border-dashed before:border-input">
        {dayItems.map((item) => {
          const locked = item.metadata?.locked === true;
          const time = typeof item.metadata?.time === "string" ? item.metadata.time : "";
          const providerId = typeof item.metadata?.provider_id === "string" ? item.metadata.provider_id : null;
          const Glyph = stopGlyph(undefined, item.title);
          const isBooked = booked.some((b) => norm(b.reservation.title) === norm(item.title));
          return (
            <li key={item.id} className="relative flex items-center gap-3 py-2">
              <span aria-hidden className={cn("relative z-[1] size-2.5 shrink-0 rounded-full ring-4 ring-background", locked ? "bg-leaf" : "bg-coral")} />
              <button type="button" onClick={() => void openPlace(item, providerId)} disabled={resolvingTitle === item.title} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60">
                <span aria-hidden className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", locked ? "bg-positive-soft text-positive" : "bg-coral-soft text-coral-ink")}>
                  <Glyph.icon className="size-[1.375rem]" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-base leading-snug font-medium tracking-[-0.01em] text-balance">{item.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    {time && <span suppressHydrationWarning className="font-medium text-ink-soft tabular-nums">{clockLabel(time)}</span>}
                    <span>{Glyph.label}</span>
                    {isBooked && <span className="inline-flex items-center gap-1 font-semibold text-positive"><Check className="size-3.5" aria-hidden />Booked</span>}
                    {locked && !isBooked && <span className="inline-flex items-center gap-1"><Lock className="size-3" aria-hidden />Locked</span>}
                  </span>
                </span>
              </button>
              <button type="button" onClick={() => setToolsItem(item)} aria-label={`Options for ${item.title}`} aria-haspopup="dialog" className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted">
                <MoreHorizontal className="size-5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => { setDay(d); setAddOpen(true); }}
        className="mt-3 flex h-14 w-full items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-input px-4 text-[0.9375rem] font-medium text-ink-soft transition-colors active:bg-muted"
      >
        <Plus className="size-[1.125rem] text-coral" aria-hidden /> {dayItems.length === 0 ? "Plan this day" : "Add a stop"}
      </button>

      <div className="mt-5 space-y-3">
        <BookingNotices tripId={tripId} reservations={reservations} startDate={startDate} endDate={trip?.end_date} />
      </div>

      {removed && (
        <p role="status" className="mt-4 rounded-2xl bg-secondary px-4 py-3 text-sm">
          {removed.title} removed.{" "}
          <button type="button" onClick={() => void restore()} className="min-h-11 font-medium underline underline-offset-4">Undo</button>
        </p>
      )}

      <Link href={`/trips/${tripId}/map?day=${d}`} className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-20 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 text-[0.9375rem] font-semibold text-background shadow-lift transition-transform active:scale-[0.97]">
        <MapIcon className="size-[1.125rem]" aria-hidden /> View on map
      </Link>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} side="bottom" ariaLabel="Choose a day" className="icons-fine max-h-[78dvh] rounded-t-4xl bg-background px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="px-2 pb-1 font-display text-xl font-medium tracking-[-0.02em]">Go to a day</p>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {days.map((n) => {
            const on = n === d;
            const count = (itemsByDay.get(n) ?? []).length;
            return (
              <li key={n}>
                <button type="button" onClick={() => { setPhoneDay(n); setPickerOpen(false); }} aria-current={on ? "date" : undefined} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors active:bg-muted">
                  <span className="w-9 shrink-0 font-display text-lg tabular-nums text-muted-foreground">{String(n).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span suppressHydrationWarning className={cn("block font-display text-base", on ? "font-semibold" : "font-medium")}>{dayDate(startDate, n) ?? `Day ${n}`}</span>
                    <span className="block truncate text-sm text-muted-foreground">{[cityFor(n), count ? `${count} ${count === 1 ? "stop" : "stops"}` : "Open day"].filter(Boolean).join(" · ")}</span>
                  </span>
                  {on && <Check className="size-5 text-coral" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      <Sheet open={toolsItem !== null} onClose={() => setToolsItem(null)} side="bottom" ariaLabel={toolsItem ? `Options for ${toolsItem.title}` : "Stop options"} className="icons-fine rounded-t-4xl bg-background px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {toolsItem && (() => {
          const item = items.find((i) => i.id === toolsItem.id) ?? toolsItem;
          const list = itemsByDay.get(item.day_index) ?? [];
          const at = list.findIndex((i) => i.id === item.id);
          const locked = item.metadata?.locked === true;
          const time = typeof item.metadata?.time === "string" ? item.metadata.time : "";
          const row = "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left text-[0.9375rem] font-medium transition-colors active:bg-muted disabled:opacity-40";
          const run = (fn: () => void) => () => { fn(); setToolsItem(null); };
          return (
            <>
              <p className="truncate px-2 font-display text-xl font-medium tracking-[-0.02em]">{item.title}</p>
              <label className="mt-2 flex min-h-14 items-center justify-between gap-3 rounded-2xl px-3">
                <span className="flex items-center gap-3 text-[0.9375rem] font-medium"><Clock className="size-5 text-muted-foreground" aria-hidden /> Time</span>
                <TimeField value={time} disabled={locked} onChange={(v) => setTime(item, v || null)} ariaLabel={`Target time for ${item.title}`} placeholder="Add time" className="w-40" />
              </label>
              <button type="button" className={row} disabled={locked || Boolean(time) || at <= 0} onClick={run(() => moveWithinDay(item, -1))}><ChevronUp className="size-5 text-muted-foreground" aria-hidden /> Earlier in the day</button>
              <button type="button" className={row} disabled={locked || Boolean(time) || at < 0 || at >= list.length - 1} onClick={run(() => moveWithinDay(item, 1))}><ChevronDown className="size-5 text-muted-foreground" aria-hidden /> Later in the day</button>
              <button type="button" className={row} disabled={locked || item.day_index <= 1} onClick={run(() => { move(item, -1); setPhoneDay(Math.max(1, item.day_index - 1)); })}><ArrowUp className="size-5 text-muted-foreground" aria-hidden /> Move to the day before</button>
              <button type="button" className={row} disabled={locked} onClick={run(() => { move(item, 1); setPhoneDay(item.day_index + 1); })}><ArrowDown className="size-5 text-muted-foreground" aria-hidden /> Move to the day after</button>
              <button type="button" className={row} onClick={run(() => toggleLock(item))}>{locked ? <LockOpen className="size-5 text-muted-foreground" aria-hidden /> : <Lock className="size-5 text-muted-foreground" aria-hidden />} {locked ? "Unlock" : "Lock this stop"}</button>
              <button type="button" className={cn(row, "text-destructive")} disabled={locked} onClick={run(() => void remove(item))}><Trash2 className="size-5" aria-hidden /> Remove</button>
            </>
          );
        })()}
      </Sheet>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} side="bottom" ariaLabel="Add a stop" className="icons-fine rounded-t-4xl bg-background px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="px-2 font-display text-xl font-medium tracking-[-0.02em]">Add to {dayDate(startDate, day) ?? `day ${day}`}</p>
        <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="mt-3 space-y-3">
          <div className="rounded-2xl border border-input px-3">
            <DestinationCombobox
              tripId={tripId}
              scope="places"
              near={near}
              enter="free"
              onEnter={() => void add()}
              ariaLabel="Add itinerary item"
              value={title}
              onChange={setTitle}
              onPick={(sug) => { setPicked({ id: sug.placeId, text: sug.text }); setTitle(sug.text); }}
              onSelect={() => undefined}
              autoFocus
              maxLength={200}
              placeholder="A museum, a dinner, a walk…"
              inputClassName="h-12 w-full min-w-0 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button type="submit" disabled={!title.trim()} className="btn-primary h-12 w-full rounded-full disabled:opacity-50">Add to the plan</button>
        </form>
      </Sheet>
    </div>
  );
}
