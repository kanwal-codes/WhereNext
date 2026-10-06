"use client";

import { HotelPhoto } from "@/components/HotelPhoto";
import { stopGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { ArrowDown, ArrowUp, ArrowUpRight, BedDouble, ChevronDown, ChevronUp, Clock, GripVertical, Loader2, Lock, LockOpen, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { ItineraryItem } from "@/features/itinerary/domain/item";
import type { StayDecision } from "@/packages/contracts/stay";
import { useTripPanel } from "@/components/TripPanelProvider";
import { announceWorkspaceChange, subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { cachedGet } from "@/lib/client/cached-get";
import { notifyToast } from "@/lib/application/toast";
import { cn } from "@/lib/utils";
import { fmtDay } from "@/lib/trip-dates";
import { KIND_META } from "@/components/overview/ReservationSheet";
import { clockLabel, reservationsByDay } from "@/lib/trip-reservations";
import type { Reservation } from "@/packages/contracts/reservation";

/** The calendar date for day N (1-based) given the trip's start date, or null when there's no start date. */
function dayDate(startDate: string | null | undefined, dayN: number): string | null {
  if (!startDate) return null;
  const d = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (dayN - 1));
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const byOrder = (a: ItineraryItem, b: ItineraryItem) =>
  (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at);

export function ItinerarySurface({
  tripId,
  initialItems,
  startDate = null,
  lockedStay = null,
  destination = null,
}: {
  tripId: string;
  initialItems?: Array<Record<string, unknown>>;
  startDate?: string | null;
  lockedStay?: StayDecision | null;
  destination?: string | null;
}) {
  const { openPanel } = useTripPanel();
  const [items, setItems] = useState<ItineraryItem[]>((initialItems ?? []) as ItineraryItem[]);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<{ id: string; text: string } | null>(null);
  const [day, setDay] = useState(1);
  const [removed, setRemoved] = useState<ItineraryItem | null>(null);
  const [dragTitle, setDragTitle] = useState<string | null>(null);
  // On a phone a stop's controls (move, lock, remove) stay tucked away until its ⋯ is tapped.
  const [openTools, setOpenTools] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null); // `${day}:${beforeTitle ?? "end"}`
  const [resolvingTitle, setResolvingTitle] = useState<string | null>(null);
  // What is already booked (hotels, tours, dinners), shown on its day beside what is planned. Best-effort:
  // if the request fails the itinerary simply shows no booked rows.
  const [reservations, setReservations] = useState<Reservation[]>([]);
  useEffect(() => {
    const load = () =>
      cachedGet(`/api/trips/${tripId}/reservations`, { ttlMs: 0 })
        .then((r) => (r.ok ? r.json() : { reservations: [] }))
        .then((body) => setReservations(body.reservations ?? []))
        .catch(() => undefined);
    void load();
    return subscribeWorkspaceChanges((changes) => {
      if (changes.includes("decision")) void load();
    });
  }, [tripId]);
  const bookedByDay = useMemo(() => reservationsByDay(reservations, startDate), [reservations, startDate]);

  /** Most itinerary items already carry a provider_id (added from a real place search) and open
   * the panel directly; a few are typed straight into chat with no known place behind them yet
   * — those get looked up by name on click instead of staying a dead label forever. */
  async function openPlace(item: ItineraryItem, providerId: string | null) {
    if (providerId) {
      openPanel({ kind: "place", placeId: providerId, name: item.title });
      return;
    }
    if (resolvingTitle) return;
    setResolvingTitle(item.title);
    try {
      const query = destination ? `${item.title}, ${destination}` : item.title;
      const r = await fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(query)}`);
      const body = await r.json();
      const hit = (body.places ?? [])[0] as { providerId?: string } | undefined;
      if (hit?.providerId) openPanel({ kind: "place", placeId: hit.providerId, name: item.title });
      else notifyToast(`Couldn’t find details for ${item.title}.`, "info");
    } catch {
      notifyToast(`Couldn’t find details for ${item.title}.`, "error");
    } finally {
      setResolvingTitle(null);
    }
  }

  useEffect(() => {
    if (initialItems) return;
    fetch(`/api/trips/${tripId}/itinerary`)
      .then((r) => r.json())
      .then((body) => setItems(body.items ?? []))
      .catch(() => notifyToast("Couldn’t load the itinerary.", "error"));
  }, [tripId, initialItems]);

  // A collaborator's edit lands as a fresh `initialItems` prop via the surrounding page's
  // router.refresh() — this component stays mounted across that (no remount), so without
  // re-syncing here, `items` would keep showing whatever was in state at first mount forever,
  // never picking up a change made anywhere but this exact browser tab.
  useEffect(() => {
    if (initialItems) setItems(initialItems as ItineraryItem[]);
  }, [initialItems]);

  const patch = async (body: Record<string, unknown>, optimistic: (list: ItineraryItem[]) => ItineraryItem[]) => {
    const previous = items;
    setItems(optimistic);
    const r = await fetch(`/api/trips/${tripId}/itinerary`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) announceWorkspaceChange("itinerary");
    else {
      setItems(previous);
      notifyToast(r.status === 409 ? "Unlock the item first." : "That change couldn’t be saved.", "error");
    }
  };

  async function add() {
    const value = title.trim();
    if (!value) return;
    // Cleared BEFORE the request, not after: the POST includes a live geocode and can take a
    // couple of seconds, and a user typing the next item while it's in flight was appending onto
    // this one's still-present text — live-caught as a real corrupted title ("...MontrealDinner
    // at Schwartz's Deli"), two items concatenated with no separator. Restored on failure only,
    // so a real error doesn't lose what they typed.
    setTitle("");
    // Only a place that was picked, and not edited since, is attached by id; anything else is looked up from its name as before.
    const providerId = picked && picked.text === value ? picked.id : undefined;
    setPicked(null);
    const r = await fetch(`/api/trips/${tripId}/itinerary`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: value, dayIndex: day, providerId }) });
    if (r.ok) {
      const body = await r.json();
      setItems((cur) => (cur.some((i) => i.title === body.item.title) ? cur : [...cur, body.item]));
      announceWorkspaceChange("itinerary");
    } else {
      setTitle((cur) => cur || value);
      notifyToast("Couldn’t add that item.", "error");
    }
  }

  const move = (item: ItineraryItem, dir: -1 | 1) => {
    if (item.metadata?.locked) return notifyToast("Unlock the item first.", "error");
    const next = Math.max(1, item.day_index + dir);
    if (next === item.day_index) return;
    reorder(item.title, next, null);
  };

  /**
   * Swap `item` with its previous/next sibling within the same day. The only other way to
   * reorder within a day is dragging the grip handle, which has no keyboard equivalent — this
   * gives keyboard and screen-reader users the same "make this earlier/later today" action.
   */
  const moveWithinDay = (item: ItineraryItem, dir: -1 | 1) => {
    if (item.metadata?.locked) return notifyToast("Unlock the item first.", "error");
    const dayList = (itemsByDay.get(item.day_index) ?? []).slice();
    const idx = dayList.findIndex((i) => i.title === item.title);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= dayList.length) return;
    if (dayList[swapIdx].metadata?.locked) return notifyToast("The item next to it is locked.", "error");
    [dayList[idx], dayList[swapIdx]] = [dayList[swapIdx], dayList[idx]];
    const renumbered = dayList.map((i, position) => ({ ...i, position }));
    const byTitle = new Map(renumbered.map((i) => [i.title, i]));
    void patch(
      { order: renumbered.map((i) => ({ title: i.title, dayIndex: i.day_index, position: i.position ?? 0 })) },
      (list) => list.map((i) => byTitle.get(i.title) ?? i),
    );
  };

  const toggleLock = (item: ItineraryItem) => {
    const locked = !(item.metadata?.locked === true);
    void patch({ title: item.title, locked }, (list) =>
      list.map((c) => (c.id === item.id ? { ...c, metadata: { ...(c.metadata ?? {}), locked } } : c)),
    );
  };

  /** `time` is "HH:MM" to set it, or `null` to clear it. */
  const setTime = (item: ItineraryItem, time: string | null) => {
    if (item.metadata?.locked) return notifyToast("Unlock the item first.", "error");
    void patch({ title: item.title, time }, (list) =>
      list.map((c) => {
        if (c.id !== item.id) return c;
        const metadata = { ...(c.metadata ?? {}) };
        if (time === null) delete metadata.time;
        else metadata.time = time;
        return { ...c, metadata };
      }),
    );
  };

  /** Move `dragTitle` to `toDay`, positioned before `beforeTitle` (or at the end). Renumbers the touched days and persists them in one request. */
  function reorder(movedTitle: string, toDay: number, beforeTitle: string | null) {
    const moved = items.find((i) => i.title === movedTitle);
    if (!moved || moved.metadata?.locked === true) {
      notifyToast("Unlock the item first.", "error");
      return;
    }
    const fromDay = moved.day_index;
    const rest = items.filter((i) => i.title !== movedTitle);
    const target = rest.filter((i) => i.day_index === toDay).sort(byOrder);
    const at = beforeTitle ? target.findIndex((i) => i.title === beforeTitle) : -1;
    target.splice(at < 0 ? target.length : at, 0, { ...moved, day_index: toDay });

    const renumber = (list: ItineraryItem[], dayN: number) =>
      list.filter((i) => i.day_index === dayN).sort(byOrder).map((i, idx) => ({ ...i, position: idx }));
    const touched = [...renumber(target, toDay), ...(fromDay !== toDay ? renumber(rest, fromDay) : [])];
    const touchedByTitle = new Map(touched.map((i) => [i.title, i]));

    void patch(
      { order: touched.map((i) => ({ title: i.title, dayIndex: i.day_index, position: i.position ?? 0 })) },
      (list) => list.map((i) => touchedByTitle.get(i.title) ?? i),
    );
  }

  async function remove(item: ItineraryItem) {
    if (item.metadata?.locked) return notifyToast("Unlock the item first.", "error");
    const previous = items;
    setItems((cur) => cur.filter((c) => c.id !== item.id));
    setRemoved(item);
    const r = await fetch(`/api/trips/${tripId}/itinerary`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: item.title }) });
    if (r.ok) announceWorkspaceChange("itinerary");
    else {
      setItems(previous);
      setRemoved(null);
      notifyToast("Couldn’t remove that item.", "error");
    }
  }

  async function restore() {
    if (!removed) return;
    const item = removed;
    const r = await fetch(`/api/trips/${tripId}/itinerary`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: item.title, restore: true }) });
    if (r.ok) {
      setItems((cur) => [...cur, item]);
      announceWorkspaceChange("itinerary");
    } else notifyToast("Couldn’t restore that item.", "error");
    setRemoved(null);
  }

  // Both derived from `items` alone — memoized so typing in the "add" title input (or any other
  // state change that doesn't touch `items`) doesn't re-scan and re-sort the whole list.
  // Suggestions are ranked toward where the plan already is: the first stop that has a location.
  const near = useMemo<[number, number] | undefined>(() => {
    const at = items.find((i) => typeof i.metadata?.latitude === "number" && typeof i.metadata?.longitude === "number");
    return at ? [at.metadata!.longitude as number, at.metadata!.latitude as number] : undefined;
  }, [items]);
  const days = useMemo(() => Array.from(new Set([...items.map((i) => i.day_index), ...bookedByDay.keys(), 1])).sort((a, b) => a - b), [items, bookedByDay]);
  const itemsByDay = useMemo(() => {
    const map = new Map<number, ItineraryItem[]>();
    for (const item of items) {
      const list = map.get(item.day_index);
      if (list) list.push(item);
      else map.set(item.day_index, [item]);
    }
    for (const list of map.values()) list.sort(byOrder);
    return map;
  }, [items]);

  function onDropAt(toDay: number, beforeTitle: string | null) {
    setDropHint(null);
    const t = dragTitle;
    setDragTitle(null);
    if (t) reorder(t, toDay, beforeTitle);
  }

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
              className="daisy-btn daisy-btn-sm h-9 shrink-0 snap-start rounded-full border-border bg-card px-4 font-medium shadow-none hover:border-foreground/30 hover:bg-accent"
            >
              <span className="font-display tabular-nums">{String(d).padStart(2, "0")}</span>
              <span className="text-muted-foreground">{dayDate(startDate, d)?.split(",")[1]?.trim() ?? `Day ${d}`}</span>
            </a>
          ))}
        </nav>
        <a href={`/trips/${tripId}/today`} className="group inline-flex items-center gap-1 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground max-sm:py-2">
          Today view <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
      </div>

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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex flex-wrap items-center gap-2 rounded-3xl border border-border/70 bg-card p-2 pl-5 shadow-soft transition-colors focus-within:border-foreground/30"
      >
        <Plus aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 basis-48">
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
            maxLength={200}
            placeholder="Add something to the plan…"
            inputClassName="w-full min-w-0 bg-transparent px-1 py-2 text-body outline-none placeholder:text-muted-foreground"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Day
          <input
            type="number"
            min={1}
            value={day}
            onChange={(e) => setDay(Math.max(1, Number(e.target.value)))}
            className="w-16 rounded-full border border-border bg-background px-3 py-1.5 text-center text-sm tabular-nums text-foreground outline-none focus:border-foreground/40"
          />
        </label>
        <button type="submit" className="daisy-btn daisy-btn-neutral h-10 rounded-full border-0 px-6 shadow-none">
          Add
        </button>
      </form>

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
                  {dayItems.length === 0 ? "Open day" : `${dayItems.length} ${dayItems.length === 1 ? "stop" : "stops"}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDay(d);
                  document.querySelector<HTMLInputElement>('input[aria-label="Add itinerary item"]')?.focus();
                }}
                className="daisy-btn daisy-btn-sm h-9 shrink-0 rounded-full border-border bg-card px-4 font-medium shadow-none hover:border-foreground/30 hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" /> Add here
              </button>
            </div>

            <div className="min-w-0">
            {(bookedByDay.get(d) ?? []).length > 0 && (
              <ul aria-label={`Booked on day ${d}`} className="mb-4 space-y-2">
                {(bookedByDay.get(d) ?? []).map(({ reservation, note }) => {
                  const Icon = KIND_META[reservation.kind].icon;
                  return (
                    <li key={`${reservation.id}-${note ?? "on"}`}>
                      <a href={`/trips/${tripId}/bookings`} className="flex items-center gap-3 rounded-2xl border border-leaf/30 bg-leaf/5 px-4 py-2.5 text-sm transition-colors hover:bg-leaf/10">
                        <Icon className="h-4 w-4 shrink-0 text-leaf" />
                        <span className="min-w-0 flex-1 truncate font-medium">{reservation.title}</span>
                        <span suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {note ?? (reservation.startTime ? clockLabel(reservation.startTime) : "Booked")}
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
                    Nothing planned. Add something above, or drag an item here.
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
                          hint ? "border-coral" : locked ? "border-leaf/30" : "border-border/70",
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
                              className="text-left hover:text-coral hover:underline disabled:opacity-60 max-sm:py-1"
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
                                    "rounded border-none bg-transparent p-0 text-xs outline-none [color-scheme:auto] disabled:opacity-50 max-sm:py-2 [&::-webkit-calendar-picker-indicator]:hidden",
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
                          className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent sm:hidden"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                        <div className={cn("col-span-3 max-sm:col-span-2 row-start-2 flex-wrap items-center justify-end gap-1 border-t border-border/60 pt-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:flex sm:shrink-0 sm:border-0 sm:pt-0 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100", openTools === item.id ? "flex" : "hidden")}>
                          <button
                            aria-label={`Move ${item.title} earlier in the day`}
                            onClick={() => moveWithinDay(item, -1)}
                            disabled={locked || itemIndex === 0}
                            className="rounded-lg p-1.5 hover:bg-accent disabled:opacity-30"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            aria-label={`Move ${item.title} later in the day`}
                            onClick={() => moveWithinDay(item, 1)}
                            disabled={locked || itemIndex === dayItems.length - 1}
                            className="rounded-lg p-1.5 hover:bg-accent disabled:opacity-30"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button aria-label="Move to previous day" onClick={() => move(item, -1)} disabled={locked} className="rounded-lg p-1.5 hover:bg-accent disabled:opacity-30">
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button aria-label="Move to next day" onClick={() => move(item, 1)} disabled={locked} className="rounded-lg p-1.5 hover:bg-accent disabled:opacity-30">
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button aria-label={locked ? "Unlock" : "Lock"} onClick={() => toggleLock(item)} className="rounded-lg p-1.5 hover:bg-accent">
                            {locked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                          </button>
                          <button aria-label="Remove" onClick={() => remove(item)} disabled={locked} className="rounded-lg p-1.5 text-destructive hover:bg-accent disabled:opacity-30">
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
          <button type="button" onClick={() => void restore()} className="font-medium text-primary underline">
            Undo
          </button>
        </p>
      )}
    </div>
  );
}
