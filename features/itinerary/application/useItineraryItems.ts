import { useEffect, useMemo, useState } from "react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import type { ItineraryItem } from "../domain/item";
import { dayAfterMove, groupByDay, reorderChange, swapWithinDay, withLock, withTime } from "../domain/plan";

/**
 * The trip's planned stops and every change to them. Each change shows at once and is sent to the server; if the server
 * refuses, the previous list comes back and the traveller is told. `initialItems` is what the page rendered; without it
 * the stops are fetched.
 */
export function useItineraryItems({ tripId, initialItems }: { tripId: string; initialItems?: Array<Record<string, unknown>> }) {
  const [items, setItems] = useState<ItineraryItem[]>((initialItems ?? []) as ItineraryItem[]);
  const [removed, setRemoved] = useState<ItineraryItem | null>(null);

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

  // Derived from `items` alone — memoized so typing in the "add" title input (or any other state change that doesn't touch `items`)
  // doesn't re-scan and re-sort the whole list.
  const itemsByDay = useMemo(() => groupByDay(items), [items]);

  const move = (item: ItineraryItem, dir: -1 | 1) => {
    if (item.metadata?.locked) return notifyToast("Unlock the item first.", "error");
    const next = dayAfterMove(item, dir);
    if (next === item.day_index) return;
    reorder(item.title, next, null);
  };

  /**
   * Swap `item` with its previous/next sibling within the same day. The only other way to
   * reorder within a day is dragging the grip handle, which has no keyboard equivalent — this
   * gives keyboard and screen-reader users the same "make this earlier/later today" action.
   */
  const moveWithinDay = (item: ItineraryItem, dir: -1 | 1) => {
    const result = swapWithinDay(itemsByDay.get(item.day_index) ?? [], item, dir);
    if (result.kind === "locked") return notifyToast("Unlock the item first.", "error");
    if (result.kind === "neighbour-locked") return notifyToast("The item next to it is locked.", "error");
    if (result.kind === "ok") void patch({ order: result.change.order }, result.change.apply);
  };

  const toggleLock = (item: ItineraryItem) => {
    const locked = !(item.metadata?.locked === true);
    void patch({ title: item.title, locked }, (list) => withLock(list, item, locked));
  };

  /** `time` is "HH:MM" to set it, or `null` to clear it. */
  const setTime = (item: ItineraryItem, time: string | null) => {
    if (item.metadata?.locked) return notifyToast("Unlock the item first.", "error");
    void patch({ title: item.title, time }, (list) => withTime(list, item, time));
  };

  /** Move a stop to `toDay`, positioned before `beforeTitle` (or at the end), and persist the touched days in one request. */
  function reorder(movedTitle: string, toDay: number, beforeTitle: string | null) {
    const change = reorderChange(items, movedTitle, toDay, beforeTitle);
    if (!change) {
      notifyToast("Unlock the item first.", "error");
      return;
    }
    void patch({ order: change.order }, change.apply);
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

  return { items, setItems, itemsByDay, removed, move, moveWithinDay, toggleLock, setTime, reorder, remove, restore };
}
