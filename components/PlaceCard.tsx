"use client";

import { useRouter } from "next/navigation";
import type { Place } from "@/packages/contracts/place";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { Clock } from "lucide-react";
import { CompareMark, compactCount } from "@/features/conversation/ui/blocks/ui";
import { CinePill, CineCard, CineRating } from "@/features/conversation/ui/blocks/CineCard";
import { placeGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { categoryLabel, isFoodPlace, photoProxyUrl, priceLabel, priceRank } from "@/lib/places-ui";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * A place, as Discover shows it. This is the same cinematic card Roam puts in a reply (`CineCard`), so a place
 * never looks like two different things depending on which screen it is on. Only the container differs (a rail
 * in chat, a grid here).
 */
export function PlaceCard({ tripId, place, why, phoneRow = false }: { tripId: string; place: Place; why?: string; /** A horizontal card on a phone (a long list), keeping Add to trip. */ phoneRow?: boolean }) {
  const router = useRouter();
  const photo = photoProxyUrl(tripId, place.photoNames?.[0], 640);
  const price = priceLabel(place.priceLevel);
  const category = place.category ? categoryLabel(place.category) : undefined;
  const href = `/trips/${tripId}/place/${encodeURIComponent(place.providerId)}`;
  const panelCtx = useTripPanelMaybe();
  const itinerary = (useTripDataMaybe()?.data?.itinerary ?? []) as Array<{ title?: string; day_index?: number }>;
  const itinDay = itinerary.find((i) => i.title && norm(i.title) === norm(place.name))?.day_index;
  const compareEntry: CompareEntry = {
    id: place.providerId, kind: "place", name: place.name, href, subtitle: place.address ?? undefined,
    attrs: { price: priceLabel(place.priceLevel) ?? undefined, priceValue: place.priceLevel ? priceRank(place.priceLevel) : undefined,
      rating: typeof place.rating === "number" ? place.rating.toFixed(1) : undefined, ratingValue: typeof place.rating === "number" ? place.rating : undefined,
      lat: place.latitude, lng: place.longitude, address: place.address ?? undefined, detail: place.category ? place.category.replaceAll("_", " ") : undefined,
      when: itinDay ? `Day ${itinDay}` : undefined },
  };
  const open = () => {
    if (!panelCtx) return router.push(href);
    if (panelCtx.compareMode) return panelCtx.compareToggle(compareEntry);
    panelCtx.openPanel({ kind: "place", placeId: place.providerId, name: place.name });
  };
  const comparing = Boolean(panelCtx?.compareMode);
  const selected = comparing && Boolean(panelCtx?.compareHas(place.providerId));
  const glyph = placeGlyph(place.category, place.name).icon;

  return (
    <CineCard
      label={`Open ${place.name}`}
      onOpen={open}
      href={href}
      wide={phoneRow}
      selected={selected}
      src={photo}
      alt={place.name}
      glyph={glyph}
      // No rating: the category stands in, never "0.0".
      topLeft={typeof place.rating === "number" ? <CineRating rating={place.rating} count={place.userRatingCount ? compactCount(place.userRatingCount) : undefined} /> : category ? <CinePill>{category}</CinePill> : undefined}
      eyebrow={category}
      title={place.name}
      pills={
        <>
          {place.openNow !== undefined && <CinePill tone={place.openNow ? "positive" : "glass"} icon={Clock}>{place.openNow ? "Open now" : "Closed now"}</CinePill>}
          {price && isFoodPlace(place.category) && <CinePill>{price}</CinePill>}
        </>
      }
      why={why && why !== "Top-rated" ? why : place.reviewSummary}
      action={comparing ? undefined : <AddToTripControl tripId={tripId} place={place} variant="orb" />}
      overlay={comparing ? <CompareMark selected={selected} /> : undefined}
    />
  );
}
