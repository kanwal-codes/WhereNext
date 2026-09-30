"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { TripArt, hashString } from "@/components/trips/TripArt";
import type { TripSummary } from "@/components/trips/types";
import { useDestinationPhoto } from "@/features/places/application/useDestinationPhoto";
import { cityScale, coverText, stampParts } from "@/lib/trip-cover";
import { photoProxyUrl } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

const CITY_SIZE = {
  card: { lg: "text-5xl", md: "text-4xl", sm: "text-3xl" },
  feature: { lg: "text-7xl sm:text-8xl", md: "text-6xl sm:text-7xl", sm: "text-5xl sm:text-6xl" },
} as const;

/** The type-led cover: the city set large, the country beneath it, and a passport-style date stamp. */
function BoardingPass({ trip, size }: { trip: TripSummary; size: "card" | "feature" }) {
  const { city, country } = coverText(trip);
  const stamp = stampParts(trip.start_date);
  return (
    <div aria-hidden className="absolute inset-0 flex items-end justify-between gap-4 p-5 pt-16 sm:p-6 sm:pt-16">
      <div className="min-w-0">
        {country && <p className="text-[11px] tracking-[0.2em] text-ink-soft uppercase">{country}</p>}
        <p className={cn("mt-1 line-clamp-2 font-display leading-[0.95] tracking-tight text-balance text-foreground/90", CITY_SIZE[size][cityScale(city)])}>{city}</p>
      </div>
      {stamp && (
        <div className="shrink-0 -rotate-6 rounded-lg border-[1.5px] border-dashed border-coral/70 px-2.5 py-1.5 text-center text-coral">
          <div className="text-[10px] tracking-[0.2em]">{stamp.month}</div>
          <div className="font-display text-2xl leading-none tabular-nums">{stamp.day}</div>
        </div>
      )}
    </div>
  );
}

/**
 * A trip's cover, best first:
 *   1. a real photo of the destination (saved on the trip, or looked up once, exactly as the
 *      Overview page does),
 *   2. a photo of a place the group saved to the trip,
 *   3. the type-led boarding-pass cover.
 * The type-led cover is always underneath, so the photo fades in over it when (and only when) it
 * has actually loaded; a photo that fails to load simply never appears.
 */
export function TripCover({
  trip,
  size = "card",
  className,
  children,
}: {
  trip: TripSummary;
  size?: "card" | "feature";
  className?: string;
  /** Overlay content (badges etc). `photo` is true once a photo is showing, for text that must stay legible on it. */
  children?: (state: { photo: boolean }) => ReactNode;
}) {
  const reduce = useReducedMotion();
  const destination = useDestinationPhoto(trip.id, trip.destination ?? undefined, trip.hero_photo_name);
  const saved = trip.saved_photo_name ? (photoProxyUrl(trip.id, trip.saved_photo_name) ?? null) : null;
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  // While the destination lookup is still running there is nothing to show yet: going straight to a
  // saved-place photo would then be swapped for the destination one a moment later.
  const candidates = destination === undefined ? [] : [destination, saved].filter((url): url is string => Boolean(url));
  const src = candidates.find((url) => !failed.includes(url)) ?? null;
  const showPhoto = src !== null && loaded === src;

  return (
    <TripArt seed={hashString(`${trip.id}${trip.name}`)} grain={size === "feature"} className={className}>
      <BoardingPass trip={trip} size={size} />
      {src && (
        <motion.div
          aria-hidden={!showPhoto}
          className="absolute inset-0 z-[1]"
          initial={false}
          animate={{ opacity: showPhoto ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy; next/image can't size a remote proxy */}
          <img
            key={src}
            src={src}
            alt={trip.destination ? `Photo of ${trip.destination}` : ""}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(src)}
            onError={() => setFailed((current) => [...current, src])}
            className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
          />
          {/* Keeps the badge and menu legible on any photo, bright or dark. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/20" />
        </motion.div>
      )}
      {children?.({ photo: showPhoto })}
    </TripArt>
  );
}
