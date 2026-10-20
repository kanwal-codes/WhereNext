import { useState } from "react";
import { useTripPanel } from "@/components/TripPanelProvider";
import { notifyToast } from "@/lib/application/toast";
import { effectiveStops, stopForDate } from "@/lib/trip-stops";
import type { ItineraryItem } from "../domain/item";
import { isoForDay } from "../domain/plan";

/** Opening a stop's place in the side panel: straight away when it came from a real place, otherwise looked up by name in the stop's city. */
export function useOpenPlace({ tripId, trip, startDate, destination }: {
  tripId: string;
  trip: { destination?: string | null; start_date?: string | null; end_date?: string | null; stops?: unknown } | null;
  startDate: string | null;
  destination: string | null;
}) {
  const { openPanel } = useTripPanel();
  const [resolvingTitle, setResolvingTitle] = useState<string | null>(null);
  const isoFor = (d: number) => isoForDay(startDate, d);

  async function openPlace(item: ItineraryItem, providerId: string | null) {
    if (providerId) {
      openPanel({ kind: "place", placeId: providerId, name: item.title });
      return;
    }
    if (resolvingTitle) return;
    setResolvingTitle(item.title);
    try {
      // A stop is looked up in the city of the day it sits on, not in the whole list of cities.
      const where = (trip ? stopForDate(effectiveStops(trip).stops, isoFor(item.day_index))?.city : null) ?? destination;
      const query = where ? `${item.title}, ${where}` : item.title;
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

  return { openPlace, resolvingTitle };
}
