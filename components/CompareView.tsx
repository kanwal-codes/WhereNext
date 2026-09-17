"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, MapPin, Star, X } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { Skeleton } from "@/components/Skeleton";
import { ExternalLink } from "@/components/ExternalLink";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { categoryLabel, detailsToPlace, priceLabel, priceRank, type GooglePlaceDetails } from "@/lib/places-ui";
import { nearest } from "@/lib/application/geo";
import { readStayDecision } from "@/packages/contracts/stay";
import { cn } from "@/lib/utils";

const BASE_ROWS = [
  { key: "category", label: "Type" },
  { key: "rating", label: "Rating" },
  { key: "reviews", label: "Reviews" },
  { key: "price", label: "Price" },
  { key: "hours", label: "Hours" },
  { key: "source", label: "Source" },
] as const;
type RowKey = (typeof BASE_ROWS)[number]["key"] | "distance";

const numberAt = (metadata: unknown, key: "latitude" | "longitude"): number | undefined => {
  const value = (metadata as Record<string, unknown> | null)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

/** The side-by-side place table. Used by the `/compare` route and the chat compare panel. */
export function CompareView({ tripId, ids, onIdsChange }: { tripId: string; ids: string[]; onIdsChange?: (ids: string[]) => void }) {
  const { data } = useTripData();
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
    // Share the per-session cache `usePlaceDetails` fills, so viewing a place and
    // then comparing it (or vice versa) is one fetch, not two.
    Promise.all(
      missing.map((id) => {
        const ck = `place-details:${tripId}:${id}`;
        try {
          const hit = sessionStorage.getItem(ck);
          if (hit) {
            const b = JSON.parse(hit);
            if (b?.place) return Promise.resolve([id, b.place] as const);
          }
        } catch { /* ignore */ }
        return fetch(`/api/trips/${tripId}/places/google?placeId=${encodeURIComponent(id)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((b) => {
            if (b?.place) { try { sessionStorage.setItem(ck, JSON.stringify(b)); } catch { /* ignore */ } }
            return [id, b?.place ?? null] as const;
          })
          .catch(() => [id, null] as const);
      }),
    )
      .then((pairs) => setItems((cur) => ({ ...cur, ...Object.fromEntries(pairs) })))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ids, items, tripId]);

  async function choose(id: string, d: GooglePlaceDetails) {
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

  const present = ids.map((id) => [id, items[id]] as const).filter(([, d]) => d);

  // Distance anchors, most specific first: the locked stay, else the trip's own locked itinerary
  // items (a confirmed dinner reservation, a booked tour — real committed plans, not just
  // anything saved). A place's distance is to whichever of these it's nearest, since with more
  // than one locked anchor there's no single "the" base to measure from — matches how `why`
  // reasoning elsewhere in the app ("Near where you're staying") already treats proximity.
  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  const stayAnchor = lockedStay?.latitude != null && lockedStay?.longitude != null
    ? [{ title: lockedStay.hotelName, latitude: lockedStay.latitude, longitude: lockedStay.longitude }]
    : [];
  const lockedItineraryAnchors = ((data?.itinerary ?? []) as Array<{ title?: unknown; metadata?: unknown }>)
    .filter((item) => (item.metadata as Record<string, unknown> | null)?.locked === true)
    .flatMap((item) => {
      const latitude = numberAt(item.metadata, "latitude");
      const longitude = numberAt(item.metadata, "longitude");
      return typeof item.title === "string" && latitude !== undefined && longitude !== undefined
        ? [{ title: item.title, latitude, longitude }]
        : [];
    });
  const anchors = stayAnchor.length ? stayAnchor : lockedItineraryAnchors;
  const distanceLabel = stayAnchor.length ? "From your stay" : anchors.length ? "From your plans" : null;
  const ROWS = distanceLabel
    ? [...BASE_ROWS.slice(0, 4), { key: "distance" as const, label: distanceLabel }, ...BASE_ROWS.slice(4)]
    : BASE_ROWS;

  if (ids.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <h3 className="font-display text-lg">Nothing to compare yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Pick two to four places from{" "}
          <Link href={`/trips/${tripId}/discover`} className="font-medium text-primary">Discover</Link>, or ask Roam to
          &ldquo;compare these&rdquo;.
        </p>
      </div>
    );
  }

  if (loading && present.length === 0) return <Skeleton className="h-72" />;

  const rated = present.filter(([, d]) => typeof d!.rating === "number");
  const bestRating = rated.length ? Math.max(...rated.map(([, d]) => d!.rating as number)) : -1;
  const bestPrice = Math.min(...present.map(([, d]) => priceRank(d!.priceLevel)));
  const reviewed = present.filter(([, d]) => typeof d!.userRatingCount === "number");
  const mostReviews = reviewed.length ? Math.max(...reviewed.map(([, d]) => d!.userRatingCount as number)) : -1;
  const distanceKm = (d: GooglePlaceDetails): number | null =>
    anchors.length && d.location?.latitude != null && d.location?.longitude != null
      ? nearest({ latitude: d.location.latitude, longitude: d.location.longitude }, anchors)?.km ?? null
      : null;
  const distanced = present.map(([, d]) => distanceKm(d!)).filter((km): km is number => km !== null);
  const closestKm = distanced.length ? Math.min(...distanced) : -1;

  const cell = (id: string, d: GooglePlaceDetails, key: RowKey) => {
    switch (key) {
      case "category":
        return categoryLabel(d.primaryType);
      case "rating":
        return typeof d.rating === "number" ? (
          <span className="inline-flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-current text-coral" />
            {d.rating.toFixed(1)}
            {d.rating === bestRating && <span className="rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-medium text-coral">Best rated</span>}
          </span>
        ) : (
          "—"
        );
      case "reviews":
        return typeof d.userRatingCount === "number" ? (
          <span className="inline-flex items-center gap-2">
            {d.userRatingCount.toLocaleString()}
            {d.userRatingCount === mostReviews && mostReviews > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">Most reviewed</span>
            )}
          </span>
        ) : (
          "—"
        );
      case "price":
        return (
          <span className="inline-flex items-center gap-2">
            {priceLabel(d.priceLevel) ?? "—"}
            {priceLabel(d.priceLevel) && priceRank(d.priceLevel) === bestPrice && (
              <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-[10px] font-medium text-leaf">Lowest</span>
            )}
          </span>
        );
      case "distance": {
        const km = distanceKm(d);
        return km === null ? (
          "—"
        ) : (
          <span className="inline-flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}
            {km === closestKm && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Closest</span>}
          </span>
        );
      }
      case "hours":
        return d.regularOpeningHours?.weekdayDescriptions?.[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] ?? "See listing";
      case "source":
        return d.googleMapsUri ? <ExternalLink href={d.googleMapsUri}>Google Maps</ExternalLink> : "Google Maps";
    }
  };

  return (
    <div className="overflow-x-auto overscroll-x-contain scrollbar-slim">
      <div className="grid min-w-[560px] gap-x-4" style={{ gridTemplateColumns: `120px repeat(${present.length}, minmax(170px, 1fr))` }}>
        <div className="sticky left-0 z-10 bg-background" />
        <AnimatePresence initial={false}>
          {present.map(([id, d]) => (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="relative rounded-2xl border border-border bg-card p-3"
            >
              {onIdsChange && ids.length > 2 && (
                <button
                  onClick={() => onIdsChange(ids.filter((x) => x !== id))}
                  aria-label={`Remove ${d!.displayName?.text ?? "place"} from comparison`}
                  className="absolute top-2 right-2 rounded-full bg-background/90 p-1.5 backdrop-blur"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <Link href={`/trips/${tripId}/place/${encodeURIComponent(id)}`} className="block pr-6 font-display text-base leading-tight hover:text-primary">
                {d!.displayName?.text ?? "Place"}
              </Link>
              {d!.formattedAddress && <p className="mt-0.5 truncate pr-6 text-xs text-muted-foreground">{d!.formattedAddress}</p>}
              <button
                onClick={() => void choose(id, d!)}
                disabled={savedIds.has(id)}
                className={cn(
                  "mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  savedIds.has(id) ? "border-leaf/40 bg-leaf-soft text-leaf" : "border-border hover:bg-accent",
                )}
              >
                {savedIds.has(id) ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> On the trip
                  </>
                ) : (
                  "Choose this"
                )}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {ROWS.map((row, i) => (
          <div key={row.key} className="col-span-full grid grid-cols-subgrid">
            <div className={cn("sticky left-0 z-10 bg-background py-3 pr-2 text-[11px] tracking-[0.1em] text-muted-foreground uppercase", i === 0 && "mt-4")}>{row.label}</div>
            {present.map(([id, d]) => (
              <div key={id + row.key} className={cn("border-t border-border py-3 text-sm leading-relaxed", i === 0 && "mt-4")}>
                {cell(id, d!, row.key)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
