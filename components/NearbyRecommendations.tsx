"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Star } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import type { NearbyEvent } from "@/components/EventCard";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { EventCard } from "@/components/EventCard";
import { Reveal } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { photoProxyUrl } from "@/lib/places-ui";
import { type RankContext, type RankedPlace } from "@/lib/application/rank-places";
import { classifyEventVibe, classifyPlaceVibe, lanesFor, type Lane, type LaneAnchor, type Vibe } from "@/packages/reco/vibes";
import { shapeLanes, type LaneInput, type LaneOutput } from "@/packages/reco/shape-lanes";

type RawLane = LaneInput<NearbyEvent>;
type ShapedLane = LaneOutput<NearbyEvent>;

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);

function MiniCard({ tripId, place, why, onSelect }: { tripId: string; place: Place; why?: string | null; onSelect?: () => void }) {
  const photo = photoProxyUrl(tripId, place.photoNames?.[0]);
  const panelCtx = useTripPanelMaybe();
  const href = `/trips/${tripId}/place/${encodeURIComponent(place.providerId)}`;
  const entry: CompareEntry = { id: place.providerId, kind: "place", name: place.name, href, subtitle: place.address ?? undefined, attrs: { rating: typeof place.rating === "number" ? place.rating.toFixed(1) : undefined, ratingValue: place.rating, address: place.address ?? undefined, lat: place.latitude, lng: place.longitude } };
  return (
    <Link
      href={href}
      onClick={(event) => {
        onSelect?.();
        if (!panelCtx || event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
        event.preventDefault();
        if (panelCtx.compareMode) panelCtx.compareToggle(entry);
        else panelCtx.openPanel({ kind: "place", placeId: place.providerId, name: place.name });
      }}
      className="block w-[196px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-lift"
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
        <img src={photo} alt={place.name} width={196} height={110} loading="lazy" className="h-28 w-full object-cover" />
      ) : (
        <div className="h-28 w-full bg-muted" />
      )}
      <div className="p-3">
        <p className="truncate text-sm font-medium">{place.name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {typeof place.rating === "number" && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-current text-coral" />
              {place.rating.toFixed(1)}
            </span>
          )}
          <span className="truncate">{(place.category ?? "").replaceAll("_", " ")}</span>
        </p>
        {why && <p className="mt-1 truncate text-[11px]" style={{ color: "var(--color-accent-trip)" }}>{why}</p>}
        {panelCtx?.compareMode && <p className="mt-1 text-[10px] font-medium text-muted-foreground">{panelCtx.compareHas(place.providerId) ? "Selected" : "Click to compare"}</p>}
      </div>
    </Link>
  );
}

function queryFor(lane: Lane, anchor: LaneAnchor): string {
  const base = (typeof lane.query === "function" ? lane.query(anchor) : lane.query).trim();
  if (lane.source === "events") {
    // "More concerts" from a Rock gig should surface rock gigs, not worship concerts —
    // fold the anchor's genre into the keyword when we have it.
    const g = (anchor.genre ?? "").split(/\s*·\s*/).slice(1).join(" ").trim();
    return g && base ? `${base} ${g}` : base;
  }
  // A radius lane is filtered client-side, so keep its query city-wide; others lean on the anchor.
  return lane.radiusKm ? `${base} in ${anchor.city}`.trim() : `${base} near ${anchor.name} ${anchor.city}`.trim();
}

async function fetchLane(tripId: string, lane: Lane, anchor: LaneAnchor, signal: AbortSignal): Promise<RawLane> {
  const q = queryFor(lane, anchor);
  try {
    if (lane.source === "events") {
      if (!anchor.city) return { lane, places: [], events: [] };
      const qs = new URLSearchParams({ location: anchor.city });
      if (q) qs.set("query", q);
      const body = await fetch(`/api/trips/${tripId}/events?${qs}`, { signal }).then((r) => (r.ok ? r.json() : { events: [] }));
      return { lane, places: [], events: (body.events ?? []) as NearbyEvent[] };
    }
    const body = await fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(q)}`, { signal }).then((r) => (r.ok ? r.json() : { places: [] }));
    return { lane, places: (body.places ?? []) as Place[], events: [] };
  } catch {
    return { lane, places: [], events: [] };
  }
}

/** Cosine of each candidate against the anchor, from the server embedding endpoint. `{}` on any failure. */
async function semanticScores(tripId: string, anchorText: string, candidates: Place[], signal: AbortSignal): Promise<Record<string, number>> {
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

type LogRow = { laneId: string; action: "impression" | "click"; itemKind: "place" | "event"; itemId: string; position?: number };

/** Fire-and-forget impression / click beacon. `keepalive` so a click survives the navigation. */
function logReco(tripId: string, anchorKind: "place" | "event", anchorId: string, vibe: string, events: LogRow[]): void {
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
async function classify(
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

/**
 * Situational "around here" recommendations. The anchor (place or event) is classified into
 * a vibe (`packages/reco/vibes.ts`) which picks the sections and their order; each section
 * is a live query against the same places/events endpoints the rest of the app uses. A
 * "more like this" lane is re-ranked by embedding similarity to the anchor, and the
 * traveller's stated interests / dislikes / shortlist feed the base rank.
 */
export function NearbyRecommendations({
  tripId,
  excludeId,
  anchorName,
  cityHint = "",
  kind = "place",
  primaryType,
  types,
  genre,
  lat,
  lng,
}: {
  tripId: string;
  excludeId: string;
  anchorName: string;
  cityHint?: string;
  kind?: "place" | "event";
  primaryType?: string | null;
  types?: string[] | null;
  genre?: string | null;
  lat?: number;
  lng?: number;
}) {
  const [results, setResults] = useState<ShapedLane[]>([]);
  const [pageVibe, setPageVibe] = useState<Vibe>("default");
  const [loading, setLoading] = useState(true);
  const panelCtx = useTripPanelMaybe();

  const trip = useTripDataMaybe();
  const prefs = trip?.data?.preferences as Record<string, unknown> | undefined;
  const savedPlaces = trip?.data?.savedPlaces;
  const rejectedPlaceIds = trip?.data?.rejectedPlaceIds;
  const rankCtx = useMemo<Omit<RankContext, "anchor">>(() => {
    const savedIds = (savedPlaces ?? [])
      .map((row) => {
        const rec = row as { places?: { provider_id?: string }; provider_id?: string };
        return rec.places?.provider_id ?? rec.provider_id;
      })
      .filter((id): id is string => Boolean(id));
    return {
      interests: asList(prefs?.interests),
      likes: asList(prefs?.likes),
      dislikes: asList(prefs?.dislikes),
      savedIds,
      rejectedIds: rejectedPlaceIds ?? [],
    };
  }, [prefs, savedPlaces, rejectedPlaceIds]);

  useEffect(() => {
    const anchor: LaneAnchor = { name: anchorName, city: cityHint, lat, lng, genre };
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(9_000)]);
    let cancelled = false;
    setLoading(true);
    setResults([]);

    // Re-opening the same anchor in a session shouldn't re-run the whole fan-out
    // (classify + a query per lane + the embedding re-rank). Keyed on the anchor's
    // identity only — a fresh shortlist won't reorder these until the next session,
    // which is fine for "around here" discovery.
    const cacheKey = `nearby-reco:${tripId}:${kind}:${excludeId}:${cityHint}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { results: hit, vibe } = JSON.parse(cached) as { results: ShapedLane[]; vibe: Vibe };
        setResults(hit);
        setPageVibe(vibe);
        setLoading(false);
        return () => {
          cancelled = true;
          controller.abort();
        };
      }
    } catch { /* unavailable or malformed cache */ }

    (async () => {
      const { vibe, secondary } = await classify(tripId, kind, { name: anchorName, primaryType, types, id: excludeId, genre }, signal);
      if (cancelled) return;
      const lanes = lanesFor(vibe, secondary);
      const laneResults = await Promise.all(lanes.map((lane) => fetchLane(tripId, lane, anchor, signal)));
      if (cancelled) return;

      const anchorPoint = Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat!, longitude: lng! } : null;
      // Richer anchor for the "more like this" embedding — the bare primaryType is often
      // generic ("tourist_attraction") for exactly the places that reached the embedding path.
      const anchorText = [anchorName, primaryType, genre, ...(types ?? []).slice(0, 6)]
        .filter(Boolean)
        .join(" ")
        .slice(0, 400)
        .trim();

      const shaped = await shapeLanes(laneResults, {
        seenPlaceIds: new Set<string>([excludeId, ...(rejectedPlaceIds ?? [])]),
        seenEventUrls: new Set<string>(kind === "event" ? [excludeId] : []),
        anchorPoint,
        rankCtx,
        score: (_lane, candidates) => semanticScores(tripId, anchorText, candidates, signal),
      });

      if (cancelled) return;
      setResults(shaped);
      setPageVibe(vibe);
      setLoading(false);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ results: shaped, vibe })); } catch { /* ignore */ }

      logReco(
        tripId,
        kind,
        excludeId,
        vibe,
        shaped.flatMap(({ lane, places, events }) => [
          ...places.map((r, idx): LogRow => ({ laneId: lane.id, action: "impression", itemKind: "place", itemId: r.place.providerId, position: idx })),
          ...events.map((e, idx): LogRow => ({ laneId: lane.id, action: "impression", itemKind: "event", itemId: e.url, position: idx })),
        ]),
      );
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tripId, excludeId, anchorName, cityHint, kind, primaryType, types, genre, lat, lng, rankCtx, rejectedPlaceIds]);

  if (loading) {
    return (
      <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Finding what&rsquo;s around {anchorName}…
      </div>
    );
  }
  if (results.length === 0) return null;

  const onSelect = (laneId: string, itemKind: "place" | "event", itemId: string, position: number) =>
    logReco(tripId, kind, excludeId, pageVibe, [{ laneId, action: "click", itemKind, itemId, position }]);

  return (
    <div className="mt-12 space-y-8 border-t border-border pt-8">
      <div>
        <p className="eyebrow" style={{ color: "var(--color-accent-trip)" }}>Around here</p>
        <p className="mt-1 text-sm text-muted-foreground">Picked to match {anchorName} — tap any to open it.</p>
      </div>
      {results.map(({ lane, places, events }, i) => {
        const shownPlaces = places.slice(0, 4);
        const shownEvents = events.slice(0, Math.max(0, 4 - shownPlaces.length));
        const hasMore = places.length > shownPlaces.length || events.length > shownEvents.length;
        const collectionBlock: AssistantBlock = events.length > 0
          ? ({
              type: "events",
              retrievedAt: new Date().toISOString(),
              items: events,
            } as AssistantBlock)
          : ({
              type: "place_list",
              title: lane.title,
              places: places.map((result) => result.place),
            } as AssistantBlock);
        return (
          <Reveal key={lane.id} delay={0.05 * i}>
            <section>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg">{lane.title}</h3>
                {hasMore && panelCtx && (
                  <button
                    type="button"
                    onClick={() => panelCtx.openPanel({ kind: "collection", title: lane.title, block: collectionBlock })}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    See more <span aria-hidden>→</span>
                  </button>
                )}
              </div>
              <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto no-scrollbar pb-1">
                {shownPlaces.map((r, idx) => (
                  <MiniCard
                    key={r.place.providerId}
                    tripId={tripId}
                    place={r.place}
                    why={r.why}
                    onSelect={() => onSelect(lane.id, "place", r.place.providerId, idx)}
                  />
                ))}
                {shownEvents.map((event, idx) => (
                  <EventCard
                    key={event.url}
                    tripId={tripId}
                    event={event}
                    className="w-[240px] shrink-0 snap-start"
                    onSelect={() => onSelect(lane.id, "event", event.url, idx)}
                  />
                ))}
              </div>
            </section>
          </Reveal>
        );
      })}
    </div>
  );
}
