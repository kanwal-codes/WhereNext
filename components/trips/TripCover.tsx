"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
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
    <div aria-hidden className={cn("absolute inset-0 flex justify-between gap-4 p-5 sm:p-6", size === "feature" ? "items-start pt-20 sm:pt-20" : "items-end pt-16 sm:pt-16")}>
      <div className="min-w-0">
        {country && <p className="eyebrow text-ink-soft">{country}</p>}
        <p className={cn("mt-1 line-clamp-2 font-display leading-[0.95] tracking-[-0.03em] font-medium text-balance text-foreground", CITY_SIZE[size][cityScale(city)])}>{city}</p>
      </div>
      {stamp && (
        <div className="shrink-0 -rotate-6 rounded-lg border-[1.5px] border-dashed border-coral/70 px-2.5 py-1.5 text-center text-coral">
          <div className="text-2xs tracking-[0.2em]">{stamp.month}</div>
          <div className="font-display text-2xl leading-none tabular-nums">{stamp.day}</div>
        </div>
      )}
    </div>
  );
}

/**
 * The photo URLs that can cover a trip, best first: the destination photo, then a saved place's.
 * Empty while the destination lookup is still running (so a saved-place photo is never shown and
 * then swapped for the destination one a moment later) and for a null trip.
 */
function useTripPhotoCandidates(trip: TripSummary | null, width?: number): string[] {
  const destination = useDestinationPhoto(trip?.id ?? "", trip?.destination ?? undefined, trip?.hero_photo_name);
  const saved = trip?.saved_photo_name ? (photoProxyUrl(trip.id, trip.saved_photo_name, width) ?? null) : null;
  if (!trip || destination === undefined) return [];
  // The destination URL comes back from the hook at the default width; ask the proxy for a wider one if needed.
  const wide = destination && width ? `${destination}&w=${width}` : destination;
  return [wide, saved].filter((url): url is string => Boolean(url));
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
  width,
  imageClassName,
  typeLed = true,
  parallax = false,
  vtName,
  children,
}: {
  trip: TripSummary;
  size?: "card" | "feature";
  className?: string;
  /** Ask the photo proxy for a wider image (a full-bleed hero needs more than the 800px default). */
  width?: number;
  /** Replaces the default hover zoom on the photo, e.g. for a slow drift on a hero. */
  imageClassName?: string;
  /** false drops the big city name when there is no photo, for a cover whose own content already carries the type. */
  typeLed?: boolean;
  /** The photograph travels slower than the page. Only for a full-bleed hero at the top of a page: on a card mid-page it slides the photo off its own frame. */
  parallax?: boolean;
  /** The name this cover answers to in a shared-element transition. */
  vtName?: string;
  /** Overlay content (badges etc). `photo` is true once a photo is showing, for text that must stay legible on it. */
  children?: (state: { photo: boolean }) => ReactNode;
}) {
  const reduce = useReducedMotion();
  const candidates = useTripPhotoCandidates(trip, width);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const src = candidates.find((url) => !failed.includes(url)) ?? null;
  // A hero asks for a wide photograph, but the card the visitor just clicked already holds the default-width one in
  // the browser's cache: show that at once and let the sharp one fade in over it, so opening a trip never starts on a
  // bare wash.
  const lowSrc = width && src ? src.replace(/&w=\d+$/, "") : null;
  const hasLow = Boolean(lowSrc && lowSrc !== src);
  const [lowDone, setLowDone] = useState(false);
  const [instant, setInstant] = useState(false);
  useLayoutEffect(() => {
    if (!hasLow || !lowSrc) return;
    const probe = new Image();
    probe.src = lowSrc;
    if (probe.complete && probe.naturalWidth > 0) {
      setInstant(true);
      setLowDone(true);
    }
  }, [hasLow, lowSrc]);
  const showPhoto = src !== null && (loaded === src || (hasLow && lowDone));

  return (
    <TripArt seed={hashString(`${trip.id}${trip.name}`)} grain={size === "feature"} className={className} vtName={vtName}>
      {typeLed && <BoardingPass trip={trip} size={size} />}
      {src && (
        <motion.div
          aria-hidden={!showPhoto}
          className={cn("absolute inset-0 z-[1]", parallax && "hero-parallax")}
          initial={false}
          animate={{ opacity: showPhoto ? 1 : 0 }}
          transition={{ duration: reduce || instant ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          {hasLow && lowSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
            <img
              src={lowSrc}
              alt=""
              decoding="async"
              ref={(el) => {
                if (el?.complete && el.naturalWidth > 0) setLowDone(true);
              }}
              onLoad={() => setLowDone(true)}
              className={cn("photo-grade absolute inset-0 h-full w-full object-cover", imageClassName)}
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy; next/image can't size a remote proxy */}
          <img
            key={src}
            src={src}
            alt={trip.destination ? `Photo of ${trip.destination}` : ""}
            loading="lazy"
            decoding="async"
            // A photo that finished loading before the page hydrated (cached, or already in view) never
            // fires onLoad, so check for it here too.
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) setLoaded(src);
            }}
            onLoad={() => setLoaded(src)}
            onError={() => setFailed((current) => [...current, src])}
            className={cn("photo-grade h-full w-full object-cover", hasLow && "relative transition-opacity duration-700", hasLow && (loaded === src ? "opacity-100" : "opacity-0"), imageClassName ?? "transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]")}
          />
          {/* Keeps the badge and menu legible on any photo, bright or dark. */}
          <div className="absolute inset-0 scrim-v [--scrim:0.5]" />
        </motion.div>
      )}
      {children?.({ photo: showPhoto })}
    </TripArt>
  );
}
