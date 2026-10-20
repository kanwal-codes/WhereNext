import { useEffect, useState } from "react";
import type { RoutePlan } from "@/packages/contracts/route-plan";
import { cachedGet } from "@/lib/client/cached-get";

/**
 * The day-by-day route plan (real transit legs). Fetched once; refreshes when the itinerary changes or when the rider locks in a
 * different leg option (`refresh`).
 */
export function useRoutePlan(tripId: string, itineraryKey: string) {
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [planVersion, setPlanVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // Route legs are relatively expensive to compute (live transit/driving lookups per hop), so a
    // same-session revisit shows the last plan instantly instead of a multi-second blank reload —
    // then quietly refetches to pick up anything that changed. Same pattern as EventDetailView.
    const cacheKey = `route-plan:v2:${tripId}:${itineraryKey}`;
    try {
      const hit = sessionStorage.getItem(cacheKey);
      if (hit) setPlan(JSON.parse(hit) as RoutePlan);
    } catch { /* unavailable or malformed cache */ }
    cachedGet(`/api/trips/${tripId}/route-plan`, { ttlMs: 0 })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setPlan(body as RoutePlan);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(body)); } catch { /* unavailable, e.g. private browsing */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tripId, itineraryKey, planVersion]);
  return { plan, refresh: () => setPlanVersion((v) => v + 1) };
}
