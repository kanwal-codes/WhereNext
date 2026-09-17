"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, MapPin, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Place } from "@/packages/contracts/place";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { BlurImage, Tactile } from "@/components/motion-primitives";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { photoProxyUrl, priceLabel, priceRank } from "@/lib/places-ui";

const norm = (s: string) => s.trim().toLowerCase();

export function PlaceCard({ tripId, place, why }: { tripId: string; place: Place; why?: string }) {
  const photo = photoProxyUrl(tripId, place.photoNames?.[0]);
  const price = priceLabel(place.priceLevel);
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
  const open = panelCtx
    ? (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let new-tab through
        e.preventDefault();
        if (panelCtx.compareMode) { panelCtx.compareToggle(compareEntry); return; }
        panelCtx.openPanel({ kind: "place", placeId: place.providerId, name: place.name });
      }
    : undefined;

  return (
    <Tactile lift={4} className="group flex h-[21rem] flex-col rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-lift">
      <Link href={href} onClick={open} className="relative block h-40 shrink-0 overflow-hidden rounded-t-2xl">
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
        {panelCtx?.compareMode && (
          <span
            aria-hidden
            className={cn(
              "absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full border-2 shadow-sm transition-colors",
              panelCtx.compareHas(place.providerId) ? "border-coral bg-coral text-white" : "border-white bg-black/25 text-transparent",
            )}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        )}
      </Link>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <Link href={href} onClick={open} className="block font-display text-lg leading-tight transition-colors hover:text-primary">
              {/* 2 lines, not 1 — on a narrow 2-column mobile grid a single-line truncate was
                  cutting a name like "Montreal Museum of Archaeology and History" down to
                  "Montreal M...", losing the one thing the card exists to show. */}
              <h3 className="line-clamp-2">{place.name}</h3>
            </Link>
          </div>
          {price && <p className="font-display text-base">{price}</p>}
        </div>

        {(typeof place.rating === "number" || why) && (
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            {typeof place.rating === "number" && (
              <p className="flex shrink-0 items-center gap-1">
                <Star className="h-3 w-3 fill-current text-coral" />
                <span className="text-foreground">{place.rating.toFixed(1)}</span>
                {place.userRatingCount ? <span>({place.userRatingCount.toLocaleString()})</span> : null}
              </p>
            )}
            {why && <span className="min-w-0 truncate rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{why}</span>}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <AddToTripControl tripId={tripId} place={place} size="sm" block className="min-w-0 flex-1" />
          <Link href={href} onClick={open} className="btn-chip shrink-0">
            Details <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {panelCtx?.compareMode && (
          <p className="text-[11px] text-muted-foreground">{panelCtx.compareHas(place.providerId) ? "Selected" : "Click card to select"}</p>
        )}
      </div>
    </Tactile>
  );
}
