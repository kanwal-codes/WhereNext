import { useEffect, useState } from "react";
import type { RouteLeg } from "@/packages/contracts/route-plan";

type HopStop = { id: string; name: string; lat: number; lng: number };
const answers = new Map<string, RouteLeg[]>();

/** How to get from each place to the next. `null` until it is known, and for good if the lookup fails (the map then just joins the stops). */
export function useHops(tripId: string, stops: HopStop[] | null): RouteLeg[] | null {
  const key = stops ? `${tripId}:${stops.map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join("|")}` : "";
  const [found, setFound] = useState<{ key: string; legs: RouteLeg[] } | null>(null);
  useEffect(() => {
    if (!stops || !key || answers.has(key)) return;
    const controller = new AbortController();
    fetch(`/api/trips/${tripId}/route-plan/hops`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stops }), signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { legs?: RouteLeg[] } | null) => {
        if (!body?.legs?.length) return;
        answers.set(key, body.legs);
        setFound({ key, legs: body.legs });
      })
      .catch(() => {});
    return () => controller.abort();
    // `stops` is rebuilt every render; `key` is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, key]);
  if (!key) return null;
  return answers.get(key) ?? (found?.key === key ? found.legs : null);
}
