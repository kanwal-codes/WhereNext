import type { Place } from "@/packages/contracts/place";
import type { NearbyEvent } from "@/lib/application/nearby-events";
import { classifyEventVibe, classifyPlaceVibe, type Lane, type LaneAnchor, type Vibe } from "@/packages/reco/vibes";
import type { LaneInput } from "@/packages/reco/shape-lanes";
import { queryFor, type LogRow } from "@/features/places/domain/nearby-reco";

type RawLane = LaneInput<NearbyEvent>;

export async function fetchLane(tripId: string, lane: Lane, anchor: LaneAnchor, signal: AbortSignal): Promise<RawLane> {
  const q = queryFor(lane, anchor);
  try {
    if (lane.source === "events") {
      if (!anchor.city) return { lane, places: [], events: [] };
      const qs = new URLSearchParams({ location: anchor.city });
      if (q) qs.set("query", q);
      const body = await fetch(`/api/trips/${tripId}/events?${qs}`, { signal }).then((r) => (r.ok ? r.json() : { events: [] }));
      return { lane, places: [], events: (body.events ?? []) as NearbyEvent[] };
    }
    // Bias toward the anchor's own coordinates when known — the query text naming a city isn't
    // enough on its own for Google to reliably stay in that city (see LocationBias's doc comment
    // in packages/providers/google-places/client.ts for the live-found bug this fixes).
    // One page (20): a lane shows four cards, and every page past the first is another sequential
    // Google round trip — 60 cost ~2.7 s and ~300 KB per lane, four lanes per panel.
    const qs = new URLSearchParams({ query: q, limit: "20" });
    if (Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng)) {
      qs.set("lat", String(anchor.lat));
      qs.set("lng", String(anchor.lng));
    }
    const body = await fetch(`/api/trips/${tripId}/places?${qs}`, { signal }).then((r) => (r.ok ? r.json() : { places: [] }));
    return { lane, places: (body.places ?? []) as Place[], events: [] };
  } catch {
    return { lane, places: [], events: [] };
  }
}

/** Cosine of each candidate against the anchor, from the server embedding endpoint. `{}` on any failure. */
export async function semanticScores(tripId: string, anchorText: string, candidates: Place[], signal: AbortSignal): Promise<Record<string, number>> {
  try {
    const body = await fetch(`/api/trips/${tripId}/reco`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        op: "rank",
        anchor: anchorText,
        candidates: candidates.slice(0, 24).map((p) => ({ id: p.providerId, text: `${p.name} ${(p.category ?? "").replaceAll("_", " ")}`.trim() })),
      }),
    }).then((r) => (r.ok ? r.json() : { scores: {} }));
    return (body.scores ?? {}) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Fire-and-forget impression / click beacon. `keepalive` so a click survives the navigation. */
export function logReco(tripId: string, anchorKind: "place" | "event", anchorId: string, vibe: string, events: LogRow[]): void {
  if (events.length === 0) return;
  try {
    void fetch(`/api/trips/${tripId}/reco`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ op: "log", anchorKind, anchorId, vibe, events }),
    }).catch(() => undefined);
  } catch {
    /* analytics must never throw */
  }
}

/** Sync classifier, upgraded by the server embedding fallback when a place lands on "default". */
export async function classify(
  tripId: string,
  kind: "place" | "event",
  anchor: { name: string; primaryType?: string | null; types?: string[] | null; id: string; genre?: string | null },
  signal: AbortSignal,
): Promise<{ vibe: Vibe; secondary?: Vibe }> {
  if (kind === "event") {
    return { vibe: classifyEventVibe({ tmSegment: (anchor.genre ?? "").split(/\s*·\s*/)[0] || null, title: anchor.name }) };
  }
  const sync = classifyPlaceVibe({ primaryType: anchor.primaryType, types: anchor.types, name: anchor.name });
  if (sync.vibe !== "default") return sync;
  try {
    const body = await fetch(`/api/trips/${tripId}/reco`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({ op: "classify", id: anchor.id, name: anchor.name, primaryType: anchor.primaryType, types: anchor.types }),
    }).then((r) => (r.ok ? r.json() : sync));
    return (body?.vibe ? body : sync) as { vibe: Vibe; secondary?: Vibe };
  } catch {
    return sync;
  }
}

