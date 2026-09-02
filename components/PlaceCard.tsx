"use client";

import Link from "next/link";
import { MapPin, Scale, Star } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { BlurImage, Tactile } from "@/components/motion-primitives";
import { ExternalLink } from "@/components/ExternalLink";
import { categoryLabel, photoProxyUrl, priceLabel } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

export function PlaceCard({
  tripId,
  place,
  inCompare,
  onCompare,
  kindLabel,
}: {
  tripId: string;
  place: Place;
  inCompare: boolean;
  onCompare: (place: Place) => void;
  /** Overrides the category pill — e.g. "Sight", "Eat" — so a blended feed still reads. */
  kindLabel?: string;
}) {
  const photo = photoProxyUrl(tripId, place.photoNames?.[0]);
  const price = priceLabel(place.priceLevel);

  return (
    <Tactile lift={4} className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-lift">
      <Link href={`/trips/${tripId}/place/${encodeURIComponent(place.providerId)}`} className="relative block shrink-0 overflow-hidden">
        {photo ? (
          <BlurImage
            src={photo}
            alt={place.name}
            className="block aspect-[3/2] max-h-44 w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid aspect-[3/2] max-h-44 w-full place-items-center bg-muted text-muted-foreground">
            <MapPin className="h-6 w-6 opacity-40" />
          </div>
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-coral/30 bg-background/92 px-2.5 py-1 text-[10px] font-medium tracking-[0.1em] text-coral uppercase backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-coral" />
          {kindLabel ?? categoryLabel(place.category)}
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <Link
              href={`/trips/${tripId}/place/${encodeURIComponent(place.providerId)}`}
              className="block truncate font-display text-lg leading-tight transition-colors hover:text-primary"
            >
              <h3 className="truncate">{place.name}</h3>
            </Link>
            {place.address && (
              <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {place.address}
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

        <div className="mt-auto flex items-center gap-2 pt-1">
          <AddToTripControl tripId={tripId} place={place} size="sm" />
          <button
            type="button"
            title={inCompare ? "Remove from comparison" : "Add to comparison"}
            aria-label={inCompare ? `Remove ${place.name} from comparison` : `Compare ${place.name}`}
            onClick={() => onCompare(place)}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-[background-color,border-color,color,transform] active:scale-90",
              inCompare ? "border-coral/40 bg-coral-soft text-coral" : "border-border bg-background hover:bg-accent",
            )}
          >
            <Scale className="h-3.5 w-3.5" />
          </button>
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
