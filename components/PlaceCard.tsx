"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { BlurImage, Tactile } from "@/components/motion-primitives";
import { ExternalLink } from "@/components/ExternalLink";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { photoProxyUrl, priceLabel, priceRank } from "@/lib/places-ui";

export function PlaceCard({ tripId, place, why }: { tripId: string; place: Place; why?: string }) {
  const photo = photoProxyUrl(tripId, place.photoNames?.[0]);
  const price = priceLabel(place.priceLevel);
  const href = `/trips/${tripId}/place/${encodeURIComponent(place.providerId)}`;
  const panelCtx = useTripPanelMaybe();
  const compareEntry: CompareEntry = {
    id: place.providerId, kind: "place", name: place.name, href, subtitle: place.address ?? undefined,
    attrs: { price: priceLabel(place.priceLevel) ?? undefined, priceValue: place.priceLevel ? priceRank(place.priceLevel) : undefined,
      rating: typeof place.rating === "number" ? place.rating.toFixed(1) : undefined, ratingValue: typeof place.rating === "number" ? place.rating : undefined,
      lat: place.latitude, lng: place.longitude, address: place.address ?? undefined, detail: place.category ? place.category.replaceAll("_", " ") : undefined },
  };
  const open = panelCtx
    ? (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let new-tab through
        e.preventDefault();
        if (panelCtx.compareMode) { panelCtx.compareToggle(compareEntry); return; }
        panelCtx.openPanel({ kind: "place", placeId: place.providerId, name: place.name });
      }
    : undefined;

  return (
    <Tactile lift={4} className="group flex h-[19rem] flex-col rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-lift">
      <Link href={href} onClick={open} className="block h-40 shrink-0 overflow-hidden rounded-t-2xl">
        {photo ? (
          <BlurImage
            src={photo}
            alt={place.name}
            className="block h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-muted text-muted-foreground">
            <MapPin className="h-6 w-6 opacity-40" />
          </div>
        )}
      </Link>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <Link href={href} onClick={open} className="block truncate font-display text-lg leading-tight transition-colors hover:text-primary">
              <h3 className="truncate">{place.name}</h3>
            </Link>
            {place.address && (
              <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{place.address}</span>
              </p>
            )}
          </div>
          {price && <p className="font-display text-base">{price}</p>}
        </div>

        {typeof place.rating === "number" && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 fill-current text-coral" />
            <span className="text-foreground">{place.rating.toFixed(1)}</span>
            {place.userRatingCount ? <span>({place.userRatingCount.toLocaleString()})</span> : null}
          </p>
        )}

        {why && <p className="truncate text-[11px] font-medium text-primary/80">{why}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <AddToTripControl tripId={tripId} place={place} size="sm" />
          {panelCtx?.compareMode && <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">{panelCtx.compareHas(place.providerId) ? "Selected" : "Click card to select"}</span>}
          {place.sourceUrl && (
            <ExternalLink href={place.sourceUrl} className="ml-auto">
              Maps
            </ExternalLink>
          )}
        </div>
      </div>
    </Tactile>
  );
}
