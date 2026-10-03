"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Compass } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
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
      className={cn("group relative block h-full min-h-44 overflow-hidden rounded-3xl border border-border/70 shadow-soft focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none")}
    >
      <TripArt seed={hashString(place.name)} className="absolute inset-0">
        <span aria-hidden className="absolute top-3 left-4 font-display text-6xl leading-none text-foreground/10 select-none">
          {place.name.charAt(0)}
        </span>
      </TripArt>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1100ms] ease-out group-hover:scale-[1.06]" />
      )}
      {src && <div aria-hidden className="absolute inset-0 scrim-b" />}
      <div className={cn("absolute inset-x-0 bottom-0 p-4", src ? "text-white" : "text-foreground")}>
        <p className={cn("font-display leading-tight tracking-tight", large ? "text-2xl sm:text-3xl" : "text-lg", src && "[text-shadow:0_1px_14px_rgba(0,0,0,0.55)]")}>{place.name}</p>
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
      <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-dashed border-border bg-card/50 p-7 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border bg-background">
            <Compass className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-xl tracking-tight">Nothing saved yet</p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">Explore places that fit the way you want this trip to feel, and save the ones that catch your eye.</p>
          </div>
        </div>
        <Link href={`/trips/${tripId}/discover`} className="btn-primary w-fit shrink-0">
          Discover places <ArrowRight className="h-4 w-4" />
        </Link>
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
