"use client";

import { Star } from "lucide-react";
import { SaveHeart } from "@/features/trip/ui/SaveHeart";
import { useRouter } from "next/navigation";
import type { Place } from "@/packages/contracts/place";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { CompareMark, compactCount } from "@/features/conversation/ui/blocks/ui";
import { CineAddress, CinePill, CineCard, CineRating, PlaceFloatingPills } from "@/features/conversation/ui/blocks/CineCard";
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
      topRight={<PlaceFloatingPills place={place} />}
      topLeft={typeof place.rating === "number" ? <CineRating rating={place.rating} count={place.userRatingCount ? compactCount(place.userRatingCount) : undefined} /> : category ? <CinePill>{category}</CinePill> : undefined}
      eyebrow={category}
      title={place.name}
      why={why && why !== "Top-rated" ? why : place.reviewSummary}
      foot={place.address ? <CineAddress address={place.address} /> : undefined}
      save={comparing ? undefined : <SaveHeart tripId={tripId} place={place} />}
      action={comparing ? undefined : <AddToTripControl tripId={tripId} place={place} variant="orb" />}
      overlay={comparing ? <CompareMark selected={selected} /> : undefined}
      row={{
        meta: typeof place.rating === "number" ? (
          <span className="inline-flex items-center gap-1">
            <Star className="size-3.5 fill-current text-foreground/80" aria-hidden />
            <span className="font-medium text-foreground">{place.rating.toFixed(1)}</span>
            {place.userRatingCount ? <span>{compactCount(place.userRatingCount)}</span> : null}
            {isFoodPlace(place.category) && priceLabel(place.priceLevel) ? <span>· {priceLabel(place.priceLevel)}</span> : null}
          </span>
        ) : undefined,
        sub: place.address ? place.address.split(",").slice(0, 2).join(",").trim() : undefined,
        save: comparing ? undefined : <SaveHeart tripId={tripId} place={place} compact light />,
        action: comparing ? undefined : <AddToTripControl tripId={tripId} place={place} variant="orb" size="sm" />,
      }}
    />
  );
}
