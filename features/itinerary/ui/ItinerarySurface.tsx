"use client";

import { TimeField } from "@/components/DateTimeField";
import { HotelPhoto } from "@/components/HotelPhoto";
import { TripRouteWeather } from "@/components/TripWeather";
import { BookingNotices } from "@/components/overview/BookingNotices";
import { stopGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpRight, BedDouble, Check, ChevronDown, ChevronUp, Clock, GripVertical, Loader2, Lock, LockOpen, Map as MapIcon, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Sheet } from "@/components/motion-primitives";
import { useMediaQuery } from "@/lib/use-media-query";
import type { ItineraryItem } from "@/features/itinerary/domain/item";
import type { StayDecision } from "@/packages/contracts/stay";
import { cn } from "@/lib/utils";
import { PHONE_V2 } from "@/lib/phone-v2";
import { textAction } from "@/features/conversation/ui/blocks/ui";
import { fmtDay } from "@/lib/trip-dates";
import { useAddStop } from "../application/useAddStop";
import { useBookings } from "../application/useBookings";
import { useItineraryItems } from "../application/useItineraryItems";
import { useOpenPlace } from "../application/useOpenPlace";
import { bookedLabel, chronological, cityOfDay, dayDate, planCentre, planDays, todayDayNumber, weekParts } from "../domain/plan";
import { KIND_META } from "@/components/overview/ReservationSheet";
import { clockLabel } from "@/lib/trip-reservations";

export function ItinerarySurface({
  tripId,
  initialItems,
  startDate = null,
  lockedStay = null,
  destination = null,
  trip = null,
  plannedDays = 0,
}: {
  tripId: string;
  initialItems?: Array<Record<string, unknown>>;
  startDate?: string | null;
  lockedStay?: StayDecision | null;
  destination?: string | null;
  /** The trip's own record: its saved cities place each day, and drive the per-city weather. */
  trip?: { destination?: string | null; start_date?: string | null; end_date?: string | null; stops?: unknown } | null;
  /** The trip's planned length: every one of its days is listed (and can be added to) even while it is still empty. */
  plannedDays?: number;
}) {
  // Phone redesign: one day at a time, with a week strip, a timeline and a sheet of actions per stop.
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = PHONE_V2 && narrow;
  const [phoneDay, setPhoneDay] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toolsItem, setToolsItem] = useState<ItineraryItem | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const { items, setItems, itemsByDay, removed, move, moveWithinDay, toggleLock, setTime, reorder, remove, restore } = useItineraryItems({ tripId, initialItems });
  const { title, setTitle, setPicked, day, setDay, addOpen, setAddOpen, add } = useAddStop({ tripId, setItems });
  const { bookedByDay, conflictsByDay, reservations } = useBookings({ tripId, startDate, items });
  const { openPlace, resolvingTitle } = useOpenPlace({ tripId, trip, startDate, destination });
  const [dragTitle, setDragTitle] = useState<string | null>(null);
  // On a phone a stop's controls (move, lock, remove) stay tucked away until its ⋯ is tapped.
  const [openTools, setOpenTools] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null); // `${day}:${beforeTitle ?? "end"}`
  const cityFor = (d: number) => cityOfDay(trip, startDate, d, bookedByDay);

  // Both derived from `items` alone — memoized so typing in the "add" title input (or any other
  // state change that doesn't touch `items`) doesn't re-scan and re-sort the whole list.
  // Suggestions are ranked toward where the plan already is: the first stop that has a location.
  const near = useMemo(() => planCentre(items), [items]);
  const days = useMemo(() => planDays(items, bookedByDay.keys(), plannedDays), [items, bookedByDay, plannedDays]);

  function onDropAt(toDay: number, beforeTitle: string | null) {
    setDropHint(null);
    const t = dragTitle;
    setDragTitle(null);
    if (t) reorder(t, toDay, beforeTitle);
  }

  // ---- Phone redesign (the approved Plan): "Day 2 of 20", the date, a week strip, and the day as a timeline. ----
  const today = new Date();
  const todayDay = todayDayNumber(startDate, today);
  const selectedDay = phoneDay ?? (todayDay && days.includes(todayDay) ? todayDay : days[0] ?? 1);
  const norm = (s: string) => s.trim().toLowerCase();
  const weekPartsOf = (d: number) => weekParts(startDate, d);
  useEffect(() => {
    if (!phone) return;
    stripRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [phone, selectedDay]);
  const phoneView = phone ? (() => {
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
  })() : null;
  if (phoneView) return phoneView;

  return (
    <div className="min-w-0 space-y-8 sm:space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* On a phone the days are one swipeable row that runs to the screen edge, not a block that wraps onto a second line. */}
        <nav aria-label="Jump to a day" className="flex min-w-0 flex-wrap gap-2 max-sm:-mx-5 max-sm:w-[calc(100%+2.5rem)] max-sm:flex-nowrap max-sm:snap-x max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:px-5 max-sm:py-1 max-sm:scroll-px-5 no-scrollbar">
          {days.map((d) => (
            <a
              key={d}
              href={`#day-${d}`}
              suppressHydrationWarning
              className="daisy-btn daisy-btn-sm h-9 max-lg:h-10 shrink-0 snap-start rounded-full border-border bg-card px-4 font-medium shadow-none hover:border-foreground/30 hover:bg-accent"
            >
              <span className="font-display tabular-nums">{String(d).padStart(2, "0")}</span>
              <span className="text-muted-foreground">{dayDate(startDate, d)?.split(",")[1]?.trim() ?? `Day ${d}`}</span>
            </a>
          ))}
        </nav>
        <a href={`/trips/${tripId}/today`} className="group inline-flex items-center gap-1 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground max-sm:py-2 max-lg:py-3">
          Today view <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
      </div>

      <BookingNotices tripId={tripId} reservations={reservations} startDate={startDate} endDate={trip?.end_date} />
      {destination && <TripRouteWeather tripId={tripId} trip={trip ?? { destination }} />}

      {lockedStay && (
        <div className="flex items-center gap-4 overflow-hidden rounded-3xl border border-border/70 bg-card p-3 pr-5 shadow-soft">
          <HotelPhoto
            src={lockedStay.thumbnail}
            width={96}
            height={96}
            className="h-16 w-16 shrink-0 rounded-2xl object-cover"
            fallback={
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-muted">
                <BedDouble className="h-5 w-5 text-muted-foreground" />
              </span>
            }
          />
          <div className="min-w-0">
            <p className="text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Based at</p>
            <p className="truncate font-display text-xl tracking-tight">{lockedStay.hotelName}</p>
            <p suppressHydrationWarning className="truncate text-sm text-muted-foreground">
              {fmtDay(lockedStay.checkin)} to {fmtDay(lockedStay.checkout)}
            </p>
          </div>
        </div>
      )}


      {days.map((d) => {
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
                {dayItems.map((item, itemIndex) => {
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
                              className={cn("text-left hover:text-coral hover:underline disabled:opacity-60 max-sm:py-1", PHONE_V2 && "max-lg:py-2 max-sm:py-2.5")}
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
                                    PHONE_V2 && "max-lg:py-2.5 max-sm:py-3",
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
                            disabled={locked || itemIndex === dayItems.length - 1}
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
                })}
              </AnimatePresence>
            </div>
            </div>
            </div>
          </section>
        );
      })}

      {removed && (
        <p role="status" className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
          {removed.title} removed.{" "}
          <button type="button" onClick={() => void restore()} className={cn(textAction, "text-sm underline")}>
            Undo
          </button>
        </p>
      )}
    </div>
  );
}
