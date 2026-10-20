import { useCallback, useEffect, useState } from "react";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import type { Place } from "@/packages/contracts/place";

/** The trip's shortlist: seeded by the page, re-read whenever places change, and its size reported upward. */
export function useSavedPlaces({ tripId, initialSaved, onSavedCountChange }: {
  tripId: string;
  initialSaved?: Array<Record<string, unknown>>;
  onSavedCountChange?: (n: number) => void;
}) {
  const seedSaved = (initialSaved ?? []).map((item) => (item.places ?? item) as unknown as Place).filter((p) => p?.providerId);
  const [saved, setSaved] = useState<Place[]>(seedSaved);
  const refreshSaved = useCallback(() => {
    fetch(`/api/trips/${tripId}/places`)
      .then((r) => r.json())
      .then((body) => setSaved((body.places ?? []).map((item: { places?: Place }) => item.places ?? item)))
      .catch(() => undefined);
  }, [tripId]);
  useEffect(() => {
    // The server already seeds `saved`; only fetch on mount when it didn't (preview route).
    if (!initialSaved) refreshSaved();
    return subscribeWorkspaceChanges((changes) => {
      if (changes.includes("places")) refreshSaved();
    });
  }, [refreshSaved, initialSaved]);
  useEffect(() => {
    onSavedCountChange?.(saved.length);
  }, [saved.length, onSavedCountChange]);

  return { saved };
}
