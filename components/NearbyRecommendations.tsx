"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { Loader2 } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import type { NearbyEvent } from "@/components/EventCard";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { EventCard } from "@/components/EventCard";
import { CardMedia, CompareMark, EntityCard, MediaFallback, RatingMeta } from "@/features/conversation/ui/blocks/ui";
import { placeGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { Reveal } from "@/components/motion-primitives";
import { ShowMore } from "@/components/DetailKit";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { photoProxyUrl } from "@/lib/places-ui";
import { readStayDecision } from "@/packages/contracts/stay";
import { type RankContext, type RankedPlace } from "@/lib/application/rank-places";
import { classifyEventVibe, classifyPlaceVibe, lanesFor, type Lane, type LaneAnchor, type Vibe } from "@/packages/reco/vibes";
import { shapeLanes, type LaneInput, type LaneOutput } from "@/packages/reco/shape-lanes";

type RawLane = LaneInput<NearbyEvent>;
type ShapedLane = LaneOutput<NearbyEvent>;

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
const norm = (s: string) => s.trim().toLowerCase();

function MiniCard({ tripId, place, why, onSelect }: { tripId: string; place: Place; why?: string | null; onSelect?: () => void }) {
  const router = useRouter();
  const photo = photoProxyUrl(tripId, place.photoNames?.[0], 400);
  const panelCtx = useTripPanelMaybe();
  const href = `/trips/${tripId}/place/${encodeURIComponent(place.providerId)}`;
  const itinerary = (useTripDataMaybe()?.data?.itinerary ?? []) as Array<{ title?: string; day_index?: number }>;
  const itinDay = itinerary.find((i) => i.title && norm(i.title) === norm(place.name))?.day_index;
  const entry: CompareEntry = { id: place.providerId, kind: "place", name: place.name, href, subtitle: place.address ?? undefined, attrs: { rating: typeof place.rating === "number" ? place.rating.toFixed(1) : undefined, ratingValue: place.rating, address: place.address ?? undefined, lat: place.latitude, lng: place.longitude, when: itinDay ? `Day ${itinDay}` : undefined } };
  const open = () => {
    onSelect?.();
    if (!panelCtx) return router.push(href);
    if (panelCtx.compareMode) return panelCtx.compareToggle(entry);
    panelCtx.openPanel({ kind: "place", placeId: place.providerId, name: place.name });
  };
  const comparing = Boolean(panelCtx?.compareMode);
  const selected = comparing && Boolean(panelCtx?.compareHas(place.providerId));
  return (
    <div className="w-[196px] shrink-0 snap-start">
      <EntityCard
        compact
        label={`Open ${place.name}`}
        onOpen={open}
        href={href}
        className={selected ? "ring-2 ring-coral" : undefined}
        media={
          <div className="relative">
            <CardMedia src={photo} alt={place.name} fallback={<MediaFallback icon={placeGlyph(place.category, place.name).icon} className="aspect-[16/10] w-full rounded-t-2xl" />} />
            {comparing && <CompareMark selected={selected} />}
          </div>
        }
        title={place.name}
        meta={[typeof place.rating === "number" ? <RatingMeta key="r" rating={place.rating} count={place.userRatingCount} /> : null, why && why !== "Top-rated" ? why : null]}
      />
    </div>
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
    // Bias toward the anchor's own coordinates when known — the query text naming a city isn't
    // enough on its own for Google to reliably stay in that city (see LocationBias's doc comment
    // in packages/providers/google-places/client.ts for the live-found bug this fixes).
    const qs = new URLSearchParams({ query: q });
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

/** Lanes shown before "More nearby": the first two carry the point; the rest are there for whoever wants them. */
const INITIAL_LANES = 2;

/** Only the cards actually rendered (the same `slice(0, 4)` the JSX applies) count as an "impression". */
const impressionRows = (lanes: ShapedLane[]): LogRow[] =>
  lanes.flatMap(({ lane, places, events }) => {
    const shownPlaces = places.slice(0, 4);
    const shownEvents = events.slice(0, Math.max(0, 4 - shownPlaces.length));
    return [
      ...shownPlaces.map((r, idx): LogRow => ({ laneId: lane.id, action: "impression", itemKind: "place", itemId: r.place.providerId, position: idx })),
      ...shownEvents.map((e, idx): LogRow => ({ laneId: lane.id, action: "impression", itemKind: "event", itemId: e.url, position: idx })),
    ];
  });

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
  const [showAll, setShowAll] = useState(false);
  const panelCtx = useTripPanelMaybe();
  // These are trip-search lookups, closed to guests (Roam only): the section simply isn't shown.
  const { guest } = useGuest();

  const trip = useTripDataMaybe();
  const prefs = trip?.data?.preferences as Record<string, unknown> | undefined;
  const savedPlaces = trip?.data?.savedPlaces;
  const rejectedPlaceIds = trip?.data?.rejectedPlaceIds;
  // Distinct from `anchorPoint` below (the place this whole "around here" section is anchored
  // to) — only ever a real, confirmed hotel, so the ranker's "why" label can honestly say "from
  // your stay" (see rank-places.ts's stayAnchor doc). Read as primitives (not the `lockedStay`
  // object itself) so the memo below only recomputes when the actual coordinates change.
  const lockedStay = readStayDecision((trip?.data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  const stayLat = lockedStay?.latitude ?? null;
  const stayLng = lockedStay?.longitude ?? null;
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
      stayAnchor: stayLat != null && stayLng != null ? { latitude: stayLat, longitude: stayLng } : null,
    };
  }, [prefs, savedPlaces, rejectedPlaceIds, stayLat, stayLng]);
  const accessibilityNeeds = useMemo(() => asList(prefs?.accessibilityNeeds), [prefs]);

  useEffect(() => {
    if (guest) {
      setLoading(false);
      return;
    }
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
        accessibilityNeeds,
        score: (_lane, candidates) => semanticScores(tripId, anchorText, candidates, signal),
      });

      if (cancelled) return;
      setResults(shaped);
      setPageVibe(vibe);
      setLoading(false);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ results: shaped, vibe })); } catch { /* ignore */ }

      // Logging every ranked-but-offscreen place was always wrong, and once a lane's result count
      // stopped being hard-capped a lane's full list could exceed the `log` op's 60-row cap and the
      // whole beacon would silently 400 — so only what is on screen counts.
      logReco(tripId, kind, excludeId, vibe, impressionRows(shaped.slice(0, INITIAL_LANES)));
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tripId, excludeId, anchorName, cityHint, kind, primaryType, types, genre, lat, lng, rankCtx, rejectedPlaceIds, accessibilityNeeds, guest]);

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
      <h2 className="font-display text-xl">Around here</h2>
      {(showAll ? results : results.slice(0, INITIAL_LANES)).map(({ lane, places, events }, i) => {
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
              // The collection panel's PlaceCardView reads `photoUrl` (a resolved proxy URL), not
              // the raw `photoNames` this Place carries — without this every card falls back to
              // the pin-icon placeholder.
              places: places.map((result) => ({ ...result.place, photoUrl: photoProxyUrl(tripId, result.place.photoNames?.[0], 480) })),
            } as AssistantBlock);
        return (
          <Reveal key={lane.id} delay={0.05 * i}>
            <section>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-base font-semibold">{lane.title}</h3>
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
              <div className="mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain no-scrollbar -mx-2 px-2 scroll-px-2 pb-14 -mb-12 pt-2">
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
                    key={`${event.url}|${event.date ?? ""}|${idx}`}
                    tripId={tripId}
                    event={event}
                    compact
                    className="w-[196px] shrink-0 snap-start"
                    onSelect={() => onSelect(lane.id, "event", event.url, idx)}
                  />
                ))}
              </div>
            </section>
          </Reveal>
        );
      })}
      {results.length > INITIAL_LANES && (
        <ShowMore
          open={showAll}
          onToggle={() => {
            if (!showAll) logReco(tripId, kind, excludeId, pageVibe, impressionRows(results.slice(INITIAL_LANES)));
            setShowAll((v) => !v);
          }}
          more={`More nearby · ${results.length - INITIAL_LANES} more group${results.length - INITIAL_LANES === 1 ? "" : "s"}`}
          less="Show less"
        />
      )}
    </div>
  );
}
