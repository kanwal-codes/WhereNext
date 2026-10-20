import { useEffect, useRef, useState } from "react";
import type { Place } from "@/packages/contracts/place";
import type { Placement } from "@/packages/contracts/placement";
import { mutate } from "@/lib/client/mutation-queue";
import { notifyToast } from "@/lib/application/toast";
import { placementToast, samePlacement } from "@/features/trip/domain/placement-control";

/**
 * A place's placement and saved state, as the control shows them. A change answers at once and the write follows; a second change while one is
 * in flight queues behind it, in order; a failed write falls back to what the server last confirmed. The trip's own snapshot is taken back
 * only when none of our writes is on its way, nor for a few seconds after the last (a refresh rendered between two quick changes can arrive late).
 */
export function usePlacementControl({ tripId, place, derived, savedDerived, onPlacementChange }: {
  tripId: string;
  place: Place;
  derived: Placement;
  savedDerived: boolean;
  onPlacementChange?: (placement: Placement) => void;
}) {
  const busyRef = useRef(false);
  const [placement, setPlacement] = useState<Placement>(derived);
  // The last placement the server confirmed (what a failed write falls back to), the writes still on their way, and when the last one landed.
  const confirmed = useRef<Placement>(derived);
  const pending = useRef(0);
  const lastWrite = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [saved, setSaved] = useState(savedDerived);
  const [busy, setBusy] = useState(false);

  // Re-sync from the snapshot when it refreshes and we're not mid-write.
  const derivedKey = JSON.stringify(derived);
  useEffect(() => {
    // Not while a write of ours is on its way, nor for a few seconds after: a refresh rendered between two quick changes can arrive late.
    if (!busyRef.current && Date.now() - lastWrite.current > 4000) {
      confirmed.current = JSON.parse(derivedKey) as Placement;
      setPlacement(confirmed.current);
      setSaved(savedDerived);
    }
  }, [derivedKey, savedDerived]);

  function apply(next: Placement) {
    if (samePlacement(next, placement)) return;
    const confirmedBefore = confirmed.current;
    // The label answers at once and the write follows; a second change while one is in flight queues behind it, in order.
    setPlacement(next);
    pending.current += 1;
    busyRef.current = true;
    chain.current = chain.current.then(async () => {
      try {
        const res = await mutate(`/api/trips/${tripId}/places/placement`, {
          method: "PUT",
          body: { place, placement: next },
          announce: ["places", "itinerary"],
        });
        if (!res.ok) throw new Error();
        confirmed.current = next;
        onPlacementChange?.(next);
        notifyToast(res.queued ? `${place.name} — saved, will sync when you're back online.` : placementToast(place.name, next), res.queued ? "info" : "success");
      } catch {
        // Fall back to the last answer the server gave, unless a newer change of ours is already queued behind this one.
        if (pending.current === 1) setPlacement(confirmed.current ?? confirmedBefore);
        notifyToast(`Couldn’t update ${place.name}. Try again.`, "error");
      } finally {
        pending.current -= 1;
        if (pending.current === 0) busyRef.current = false;
        lastWrite.current = Date.now();
      }
    });
  }

  async function toggleBookmark() {
    if (busy) return;
    const previous = saved;
    const next = !previous;
    setSaved(next);
    setBusy(true);
    busyRef.current = true;
    try {
      const res = await mutate(`/api/trips/${tripId}/places/bookmark`, {
        method: "PUT",
        body: { place, saved: next },
        announce: ["places"],
      });
      if (!res.ok) throw new Error();
      notifyToast(!previous ? `${place.name} saved.` : `${place.name} removed from saved places.`, "success");
    } catch {
      setSaved(previous);
      notifyToast(`Couldn’t update ${place.name}. Try again.`, "error");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  return { placement, saved, busy, apply, toggleBookmark };
}
