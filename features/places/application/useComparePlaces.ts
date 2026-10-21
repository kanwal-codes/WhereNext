"use client";

import { useEffect, useMemo, useState } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { detailsToPlace, type GooglePlaceDetails } from "@/lib/places-ui";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { fetchPlaceDetails } from "@/features/places/application/placeDetailsCache";

/** The places being compared: their details (fetched once each), which are already on the trip, and saving one with "Choose this". */
export function useComparePlaces(tripId: string, ids: string[]) {
  const { data } = useTripData();
  const { guest, openGate } = useGuest();
  const [items, setItems] = useState<Record<string, GooglePlaceDetails | null>>({});
  const [loading, setLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const seededSavedIds = useMemo(
    () => new Set(((data?.savedPlaces ?? []) as Array<{ places?: { provider_id?: string } }>).map((p) => p.places?.provider_id).filter(Boolean) as string[]),
    [data?.savedPlaces],
  );

  useEffect(() => {
    if (data) {
      setSavedIds(seededSavedIds);
      return;
    }
    fetch(`/api/trips/${tripId}/places`)
      .then((r) => r.json())
      .then((b) => setSavedIds(new Set((b.places ?? []).map((p: { providerId?: string }) => p.providerId).filter(Boolean))))
      .catch(() => undefined);
  }, [tripId, data, seededSavedIds]);

  useEffect(() => {
    const missing = ids.filter((id) => !(id in items));
    if (missing.length === 0) return;
    setLoading(true);
    // `items` is itself a dep, so adding/removing a compare id in quick succession re-runs this
    // effect before the previous run's fetches land. Without this guard, whichever run's
    // Promise.all resolved LAST decided `loading`'s final value — an earlier run finishing after
    // a later one started could flip loading back to false while the latest run's own fetches
    // were still in flight. `cancelled` lets only the run this effect instance actually belongs
    // to touch state; a superseded run's results still merge in (harmless, already-fetched data)
    // but its `finally` no longer fights over the loading flag.
    let cancelled = false;
    // `fetchPlaceDetails` shares one request per place across every card on the page and the session cache.
    Promise.all(missing.map((id) => fetchPlaceDetails(tripId, id).then((b) => [id, b?.place ?? null] as const)))
      .then((pairs) => setItems((cur) => ({ ...cur, ...Object.fromEntries(pairs) })))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ids, items, tripId]);

  async function choose(id: string, d: GooglePlaceDetails) {
    if (guest) return openGate("save places");
    const place = detailsToPlace(d);
    if (!place) return;
    setSavedIds((cur) => new Set(cur).add(id));
    const r = await fetch(`/api/trips/${tripId}/places`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(place),
    });
    if (r.ok) {
      announceWorkspaceChange("places");
      notifyToast(`${place.name} saved to the trip.`, "success");
    } else {
      setSavedIds((cur) => {
        const n = new Set(cur);
        n.delete(id);
        return n;
      });
      notifyToast("That didn’t save. Try again.", "error");
    }
  }

  const present = ids.map((id) => [id, items[id]] as const).filter((pair): pair is readonly [string, GooglePlaceDetails] => Boolean(pair[1]));
  return { data, present, loading, savedIds, choose };
}
