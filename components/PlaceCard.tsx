"use client";

import { useRouter } from "next/navigation";
import type { Place } from "@/packages/contracts/place";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { Badge, CardMedia, CompareMark, DetailsButton, EntityCard, MEDIA_ROW, MediaFallback, RatingMeta } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import { placeGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { categoryLabel, photoProxyUrl, priceLabel, priceRank } from "@/lib/places-ui";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * A place, as Discover shows it. This is the same card Roam puts in a reply (`EntityCard`): the same
 * photo shape, title, meta line, hover and actions, so a place never looks like two different things
 * depending on which screen it is on. Only the container differs (a rail in chat, a grid here).
 */
export function PlaceCard({ tripId, place, why, phoneRow = false }: { tripId: string; place: Place; why?: string; /** A horizontal card on a phone (a long list), keeping Add to trip. */ phoneRow?: boolean }) {
  const router = useRouter();
  const photo = photoProxyUrl(tripId, place.photoNames?.[0], 480);
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
    <EntityCard
      label={`Open ${place.name}`}
      onOpen={open}
      href={href}
      phoneRow={phoneRow ? "actions" : false}
      className={selected ? "ring-2 ring-coral" : undefined}
      media={
        <div className={cn("relative", phoneRow && "max-sm:h-full")}>
          <CardMedia row={phoneRow} src={photo} alt={place.name} fallback={<MediaFallback icon={glyph} className={cn("aspect-[16/10] w-full rounded-t-2xl", phoneRow && MEDIA_ROW)} />} />
          {comparing && <CompareMark selected={selected} />}
        </div>
      }
      title={place.name}
      meta={[typeof place.rating === "number" ? <RatingMeta key="r" rating={place.rating} count={place.userRatingCount} /> : null, category, price]}
      badges={why && why !== "Top-rated" ? <Badge tone="brand">{why}</Badge> : undefined}
      extra={comparing ? <p className="text-xs text-muted-foreground">{selected ? "Selected" : "Click card to select"}</p> : undefined}
      actions={
        <>
          <AddToTripControl tripId={tripId} place={place} size="sm" block className="min-w-[6.75rem] flex-1" />
          <DetailsButton label={`Details: ${place.name}`} onClick={open} className={phoneRow ? "max-sm:hidden" : undefined} />
        </>
      }
    />
  );
}
