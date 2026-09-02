"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, BedDouble, Lock, LockOpen, MapPin, Plus, Trash2 } from "lucide-react";
import type { ItineraryItem } from "@/features/itinerary/domain/item";
import type { StayDecision } from "@/packages/contracts/stay";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { cn } from "@/lib/utils";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export function ItinerarySurface({
  tripId,
  initialItems,
  lockedStay = null,
}: {
  tripId: string;
  initialItems?: Array<Record<string, unknown>>;
  lockedStay?: StayDecision | null;
}) {
  const [items, setItems] = useState<ItineraryItem[]>((initialItems ?? []) as ItineraryItem[]);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(1);
  const [removed, setRemoved] = useState<ItineraryItem | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialItems) return;
    fetch(`/api/trips/${tripId}/itinerary`)
      .then((r) => r.json())
      .then((body) => setItems(body.items ?? []))
      .catch(() => setError("Itinerary could not load."));
  }, [tripId, initialItems]);

  const patch = async (body: Record<string, unknown>, optimistic: (list: ItineraryItem[]) => ItineraryItem[]) => {
    const previous = items;
    setItems(optimistic);
    const r = await fetch(`/api/trips/${tripId}/itinerary`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) announceWorkspaceChange("itinerary");
    else {
      setItems(previous);
      setError(r.status === 409 ? "Unlock the item first." : "That change could not be saved.");
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
    } else setError("Item could not be added.");
  }

  const move = (item: ItineraryItem, dir: -1 | 1) => {
    if (item.metadata?.locked) {
      setError("Unlock the item first.");
      return;
    }
    const next = Math.max(1, item.day_index + dir);
    if (next === item.day_index) return;
    void patch({ title: item.title, dayIndex: next }, (list) => list.map((c) => (c.id === item.id ? { ...c, day_index: next } : c)));
  };

  const toggleLock = (item: ItineraryItem) => {
    const locked = !(item.metadata?.locked === true);
    void patch({ title: item.title, locked }, (list) =>
      list.map((c) => (c.id === item.id ? { ...c, metadata: { ...(c.metadata ?? {}), locked } } : c)),
    );
  };

  async function remove(item: ItineraryItem) {
    if (item.metadata?.locked) {
      setError("Unlock the item first.");
      return;
    }
    const previous = items;
    setItems((cur) => cur.filter((c) => c.id !== item.id));
    setRemoved(item);
    const r = await fetch(`/api/trips/${tripId}/itinerary`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: item.title }) });
    if (r.ok) announceWorkspaceChange("itinerary");
    else {
      setItems(previous);
      setRemoved(null);
      setError("Item could not be removed.");
    }
  }

  async function restore() {
    if (!removed) return;
    const item = removed;
    const r = await fetch(`/api/trips/${tripId}/itinerary`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: item.title, restore: true }) });
    if (r.ok) {
      setItems((cur) => [...cur, item]);
      announceWorkspaceChange("itinerary");
    } else setError("Item could not be restored.");
    setRemoved(null);
  }

  const days = Array.from(new Set([...items.map((i) => i.day_index), 1])).sort((a, b) => a - b);

  return (
    <div className="space-y-8">
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
          className="min-w-0 flex-1 bg-transparent px-1.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
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
      </form>

      {days.map((d) => {
        const dayItems = items.filter((i) => i.day_index === d);
        return (
          <section key={d}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
              <div className="min-w-0">
                <p className="eyebrow">Day {d}</p>
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
                    className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground"
                  >
                    Nothing scheduled for this day.
                  </motion.p>
                )}
                {dayItems.map((item) => {
                  const locked = item.metadata?.locked === true;
                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12, height: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="group relative mb-3"
                    >
                      <span className="absolute top-4 -left-6 grid h-4 w-4 place-items-center rounded-full border border-border bg-background">
                        <span className={cn("h-1.5 w-1.5 rounded-full", locked ? "bg-leaf" : "bg-coral")} />
                      </span>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <span className="truncate">{item.title}</span>
                            {locked && <Lock className="h-3 w-3 shrink-0 text-leaf" />}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" /> Day {item.day_index}
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
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
