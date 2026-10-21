"use client";

import Link from "next/link";
import { useState } from "react";
import { Compass } from "lucide-react";
import { InviteCard } from "@/components/overview/InviteCard";
import { placeGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { BlurImage, Stagger, StaggerItem } from "@/components/motion-primitives";
import { TripArt, hashString } from "@/components/trips/TripArt";
import { photoProxyUrl } from "@/lib/places-ui";
import { categoryLabel } from "@/lib/trip-overview";
import { cn } from "@/lib/utils";

export type MosaicPlace = { id: string; name: string; category?: string | null; photoName?: string };

// Tile shapes by how many places there are: the first one is always the big one.
const SPANS = ["sm:col-span-2 sm:row-span-2", "", "", "", "", ""] as const;
const MAX_TILES = 5;

function Tile({ tripId, place, large, more }: { tripId: string; place: MosaicPlace; large: boolean; more: number }) {
  const [failed, setFailed] = useState(false);
  const src = place.photoName && !failed ? photoProxyUrl(tripId, place.photoName, large ? 1200 : 800) : null;
  return (
    <Link
      href={`/trips/${tripId}/place/${place.id}`}
      className="group relative block h-full min-h-44 overflow-hidden rounded-3xl border border-border/70 shadow-soft focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <TripArt seed={hashString(place.name)} className="absolute inset-0">
        {/* No photograph yet: the kind of place in a small lit tile, the way a card without a photo shows it elsewhere. */}
        {(() => {
          const Glyph = placeGlyph(place.category, place.name).icon;
          return (
            <span aria-hidden className={cn("absolute top-4 left-4 grid place-items-center rounded-xl bg-background/70 text-coral-ink shadow-hairline", large ? "size-12" : "size-9")}>
              <Glyph className={large ? "size-6" : "size-[18px]"} />
            </span>
          );
        })()}
      </TripArt>
      {src && (
        <BlurImage src={src} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.06]" />
      )}
      {src && <div aria-hidden className="absolute inset-0 scrim-b" />}
      <div className={cn("absolute inset-x-0 bottom-0 p-4", src ? "text-white" : "text-foreground")}>
        <p className={cn("font-display leading-tight tracking-tight", large ? "line-clamp-3 text-2xl sm:text-3xl" : "line-clamp-2 text-lg", src && "[text-shadow:0_1px_14px_rgba(0,0,0,0.55)]")}>{place.name}</p>
        {place.category && <p className={cn("mt-0.5 text-xs", src ? "text-white/80" : "text-muted-foreground")}>{categoryLabel(place.category)}</p>}
      </div>
      {more > 0 && (
        <span className="photo-chip absolute top-3 right-3">+{more} more</span>
      )}
    </Link>
  );
}

/** Saved places as a photo mosaic: the first is the big tile, and the rest fall around it. */
export function PlacesMosaic({ tripId, places }: { tripId: string; places: MosaicPlace[] }) {
  if (places.length === 0) {
    return (
      <div className="mt-6">
        <InviteCard seed={`${tripId}places`} icon={Compass} title="Nothing saved yet" href={`/trips/${tripId}/discover`} cta="Discover places">
          Explore places that fit the way you want this trip to feel, and save the ones that catch your eye.
        </InviteCard>
      </div>
    );
  }
  const shown = places.slice(0, MAX_TILES);
  const hidden = places.length - shown.length;
  return (
    <Stagger className="mt-6 grid auto-rows-[11rem] grid-cols-2 gap-3 sm:grid-cols-4" delay={0.04}>
      {shown.map((place, index) => (
        <StaggerItem key={place.id} className={cn("h-full", SPANS[index])}>
          <Tile tripId={tripId} place={place} large={index === 0 && shown.length > 2} more={index === shown.length - 1 ? hidden : 0} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}
