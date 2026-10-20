"use client";

import { SaveHeart } from "@/features/trip/ui/SaveHeart";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNearView } from "@/lib/use-near-view";
import { useRouter } from "next/navigation";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { Loader2 } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import { EventCard } from "@/components/EventCard";
import { CompareMark } from "@/features/conversation/ui/blocks/ui";
import { CineCard } from "@/features/conversation/ui/blocks/CineCard";
import { placeGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { Reveal } from "@/components/motion-primitives";
import { ShowMore } from "@/components/DetailKit";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { photoProxyUrl } from "@/lib/places-ui";
import { readStayDecision } from "@/packages/contracts/stay";
import { lanesFor, type LaneAnchor, type Vibe } from "@/packages/reco/vibes";
import { shapeLanes } from "@/packages/reco/shape-lanes";
import { classify, fetchLane, logReco, semanticScores } from "@/features/places/application/nearbyReco";
import { INITIAL_LANES, asList, collectionBlockFor, impressionRows, rankContextFrom, type ShapedLane } from "@/features/places/domain/nearby-reco";

const norm = (s: string) => s.trim().toLowerCase();

function MiniCard({ tripId, place, why, onSelect }: { tripId: string; place: Place; why?: string | null; onSelect?: () => void }) {
  const router = useRouter();
  const photo = photoProxyUrl(tripId, place.photoNames?.[0], 480);
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
      <CineCard
        compact
        label={`Open ${place.name}`}
        onOpen={open}
        href={href}
        selected={selected}
        src={photo}
        alt={place.name}
        glyph={placeGlyph(place.category, place.name).icon}
        save={comparing ? undefined : <SaveHeart tripId={tripId} place={place} compact />}
        title={place.name}
        meta={[typeof place.rating === "number" ? `★ ${place.rating.toFixed(1)}` : null, why && why !== "Top-rated" ? why : null].filter(Boolean).join(" · ")}
        overlay={comparing ? <CompareMark selected={selected} /> : undefined}
      />
    </div>
  );
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
  const rankCtx = useMemo(
    () => rankContextFrom({ prefs, savedPlaces, rejectedPlaceIds, stayLat, stayLng }),
    [prefs, savedPlaces, rejectedPlaceIds, stayLat, stayLng],
  );
  const accessibilityNeeds = useMemo(() => asList(prefs?.accessibilityNeeds), [prefs]);
  // Ranking inputs come from trip data, which refreshes on every workspace change: read the latest at
  // shaping time instead of re-running the whole fan-out (four searches) each time it does.
  const shapeInputs = useRef({ rankCtx, rejectedPlaceIds, accessibilityNeeds });
  useEffect(() => {
    shapeInputs.current = { rankCtx, rejectedPlaceIds, accessibilityNeeds };
  });
  // Callers pass `types` inline. Keyed by value, so a plain re-render (closing the panel, say) can't
  // abort the fan-out in flight and start it over.
  const typesKey = (types ?? []).join("|");
  // The section sits at the foot of a long detail view; its searches wait until someone scrolls toward it.
  const [nearRef, near] = useNearView<HTMLDivElement>();

  useEffect(() => {
    if (guest) {
      setLoading(false);
      return;
    }
    if (!near) return;
    const typesList = typesKey ? typesKey.split("|") : undefined;
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
      const { vibe, secondary } = await classify(tripId, kind, { name: anchorName, primaryType, types: typesList, id: excludeId, genre }, signal);
      if (cancelled) return;
      const lanes = lanesFor(vibe, secondary);
      const laneResults = await Promise.all(lanes.map((lane) => fetchLane(tripId, lane, anchor, signal)));
      if (cancelled) return;

      const anchorPoint = Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat!, longitude: lng! } : null;
      // Richer anchor for the "more like this" embedding — the bare primaryType is often
      // generic ("tourist_attraction") for exactly the places that reached the embedding path.
      const anchorText = [anchorName, primaryType, genre, ...(typesList ?? []).slice(0, 6)]
        .filter(Boolean)
        .join(" ")
        .slice(0, 400)
        .trim();

      const latest = shapeInputs.current;
      const shaped = await shapeLanes(laneResults, {
        seenPlaceIds: new Set<string>([excludeId, ...(latest.rejectedPlaceIds ?? [])]),
        seenEventUrls: new Set<string>(kind === "event" ? [excludeId] : []),
        anchorPoint,
        rankCtx: latest.rankCtx,
        accessibilityNeeds: latest.accessibilityNeeds,
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
  }, [near, tripId, excludeId, anchorName, cityHint, kind, primaryType, typesKey, genre, lat, lng, guest]);

  if (loading) {
    return (
      <div ref={nearRef} className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
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
        const collectionBlock = collectionBlockFor(tripId, lane, places, events);
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
