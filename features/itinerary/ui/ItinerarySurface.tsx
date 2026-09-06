"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowUpRight, BedDouble, GripVertical, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import type { ItineraryItem } from "@/features/itinerary/domain/item";
import type { StayDecision } from "@/packages/contracts/stay";
import { useTripPanel } from "@/components/TripPanelProvider";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { cn } from "@/lib/utils";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

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
}: {
  tripId: string;
  initialItems?: Array<Record<string, unknown>>;
  startDate?: string | null;
  lockedStay?: StayDecision | null;
}) {
  const { openPanel } = useTripPanel();
  const [items, setItems] = useState<ItineraryItem[]>((initialItems ?? []) as ItineraryItem[]);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(1);
  const [removed, setRemoved] = useState<ItineraryItem | null>(null);
  const [dragTitle, setDragTitle] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null); // `${day}:${beforeTitle ?? "end"}`

  useEffect(() => {
    if (initialItems) return;
    fetch(`/api/trips/${tripId}/itinerary`)
      .then((r) => r.json())
      .then((body) => setItems(body.items ?? []))
      .catch(() => notifyToast("Couldn’t load the itinerary.", "error"));
  }, [tripId, initialItems]);

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
    const r = await fetch(`/api/trips/${tripId}/itinerary`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: value, dayIndex: day }) });
    if (r.ok) {
      const body = await r.json();
      setItems((cur) => (cur.some((i) => i.title === body.item.title) ? cur : [...cur, body.item]));
      setTitle("");
      announceWorkspaceChange("itinerary");
    } else notifyToast("Couldn’t add that item.", "error");
  }

  const move = (item: ItineraryItem, dir: -1 | 1) => {
    if (item.metadata?.locked) return notifyToast("Unlock the item first.", "error");
    const next = Math.max(1, item.day_index + dir);
    if (next === item.day_index) return;
    reorder(item.title, next, null);
  };

  const toggleLock = (item: ItineraryItem) => {
    const locked = !(item.metadata?.locked === true);
    void patch({ title: item.title, locked }, (list) =>
      list.map((c) => (c.id === item.id ? { ...c, metadata: { ...(c.metadata ?? {}), locked } } : c)),
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

  const days = Array.from(new Set([...items.map((i) => i.day_index), 1])).sort((a, b) => a - b);

  function onDropAt(toDay: number, beforeTitle: string | null) {
    setDropHint(null);
    const t = dragTitle;
    setDragTitle(null);
    if (t) reorder(t, toDay, beforeTitle);
  }

  return (
    <div className="min-w-0 space-y-8">
      <div className="flex justify-end">
        <a href={`/trips/${tripId}/today`} className="text-xs font-medium text-primary hover:underline">
          Today view →
        </a>
      </div>
      {lockedStay && (
        <p className="flex items-center gap-2 rounded-2xl border border-leaf/30 bg-leaf-soft/40 px-4 py-2.5 text-sm text-ink-soft">
          <BedDouble className="h-4 w-4 shrink-0 text-leaf" />
          <span className="min-w-0 truncate">
            Based at <span className="font-medium text-foreground">{lockedStay.hotelName}</span> · {fmtDay(lockedStay.checkin)} → {fmtDay(lockedStay.checkout)}
          </span>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-input bg-card px-3 py-2 shadow-soft"
      >
        <input
          aria-label="Add itinerary item"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add something to the plan…"
          className="min-w-0 flex-1 basis-48 bg-transparent px-1.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Day
            <input
              type="number"
              min={1}
              value={day}
              onChange={(e) => setDay(Math.max(1, Number(e.target.value)))}
              className="w-14 rounded-lg border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
          <button type="submit" className="btn-primary-sm">
            Add
          </button>
        </div>
      </form>

      {days.map((d) => {
        const dayItems = items.filter((i) => i.day_index === d).sort(byOrder);
        const date = dayDate(startDate, d);
        return (
          <section
            key={d}
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
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
              <div className="min-w-0">
                <p className="eyebrow">Day {d}{date ? ` · ${date}` : ""}</p>
                <h3 className="mt-1 font-display text-xl">
                  {dayItems.length} item{dayItems.length === 1 ? "" : "s"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDay(d);
                  document.querySelector<HTMLInputElement>('input[aria-label="Add itinerary item"]')?.focus();
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" /> Add here
              </button>
            </div>

            <div className="relative mt-4 pl-6">
              <span className="absolute top-2 bottom-2 left-[7px] w-px bg-border" />
              <AnimatePresence initial={false}>
                {dayItems.length === 0 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn(
                      "rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground",
                      dropHint === `${d}:end` ? "border-coral bg-coral-soft/40" : "border-border",
                    )}
                  >
                    Nothing scheduled for this day.
                  </motion.p>
                )}
                {dayItems.map((item) => {
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
                      <span className="absolute top-1/2 -left-6 grid h-4 w-4 -translate-y-1/2 place-items-center rounded-full border border-border bg-background">
                        <span className={cn("h-1.5 w-1.5 rounded-full", locked ? "bg-leaf" : "bg-coral")} />
                      </span>
                      <div
                        className={cn(
                          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border bg-card px-3 py-3 shadow-soft transition-colors",
                          hint ? "border-coral" : "border-border",
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
                          className={cn("cursor-grab rounded p-1 text-muted-foreground active:cursor-grabbing", locked && "cursor-not-allowed opacity-30")}
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </button>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            {providerId ? (
                              <button
                                type="button"
                                onClick={() => openPanel({ kind: "place", placeId: providerId, name: item.title })}
                                className="truncate text-left hover:text-coral hover:underline"
                              >
                                {item.title} <ArrowUpRight className="inline h-3 w-3 align-[-1px] text-muted-foreground" />
                              </button>
                            ) : (
                              <span className="truncate">{item.title}</span>
                            )}
                            {locked && <Lock className="h-3 w-3 shrink-0 text-leaf" />}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
