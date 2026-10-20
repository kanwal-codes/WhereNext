import { useState, type Dispatch, type SetStateAction } from "react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import type { ItineraryItem } from "../domain/item";
import { withAddedItem } from "../domain/plan";

/** The "Add here" form: the typed title, the place picked from suggestions (if any), the day, and posting a new stop. */
export function useAddStop({ tripId, setItems }: { tripId: string; setItems: Dispatch<SetStateAction<ItineraryItem[]>> }) {
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<{ id: string; text: string } | null>(null);
  const [day, setDay] = useState(1);
  // The add form stays out of the way until a day's "Add here" opens it (inside that day).
  const [addOpen, setAddOpen] = useState(false);

  /** Put a moved place back on its first day and give the new day its own visit. */
  async function addSecondVisit(placeTitle: string, firstDay: number, nextDay: number) {
    const post = (payload: Record<string, unknown>) => fetch(`/api/trips/${tripId}/itinerary`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: placeTitle, ...payload }) });
    const back = await post({ dayIndex: firstDay });
    const again = back.ok ? await post({ dayIndex: nextDay, repeat: true }) : back;
    if (!again.ok) return notifyToast("Couldn’t add the second visit.", "error");
    const list = await fetch(`/api/trips/${tripId}/itinerary`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (list?.items) setItems(list.items);
    announceWorkspaceChange("itinerary");
  }

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
      setItems((cur) => withAddedItem(cur, body.item));
      setAddOpen(false);
      announceWorkspaceChange("itinerary");
      if (body.moved && typeof body.fromDay === "number") {
        // The same place was already on another day, so adding it there moved it. Say so, and offer the other reading: a second visit.
        notifyToast(`${body.item.title} was already on Day ${body.fromDay}, so it moved to Day ${body.item.day_index}.`, "info", {
          label: "Visit it on both days",
          onClick: () => void addSecondVisit(body.item.title, body.fromDay, body.item.day_index),
        });
      }
    } else {
      setTitle((cur) => cur || value);
      notifyToast("Couldn’t add that item.", "error");
    }
  }

  return { title, setTitle, setPicked, day, setDay, addOpen, setAddOpen, add };
}
