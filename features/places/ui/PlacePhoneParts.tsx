"use client";

import type React from "react";
import { Clock, Star, type LucideIcon } from "lucide-react";
import { BlurImage } from "@/components/motion-primitives";
import { placeGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { MediaFallback, compactCount } from "@/features/conversation/ui/blocks/ui";
import { SaveHeart } from "@/features/trip/ui/SaveHeart";
import { openNowChip } from "@/features/places/domain/place-view";
import { categoryLabel, withPhotoWidth, type GooglePlaceDetails, type detailsToPlace } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

type PlaceForTrip = ReturnType<typeof detailsToPlace>;

/** The phone's photo: rounded, with the save heart on it. */
export function PlacePhonePhoto({ tripId, photo, name, place, placeholder }: { tripId: string | null; photo: string | undefined; name: string; place: PlaceForTrip; /** The card's smaller photo, already cached: shown until the sharp one has loaded. */ placeholder?: string | null }) {
  return (
    <div className="px-4 pt-3 lg:hidden">
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-muted">
        {/* No photo: the app's own stand-in with the kind of place drawn on it, never someone else's stock picture. */}
        {photo ? (
          <BlurImage src={withPhotoWidth(photo, 960)} placeholder={placeholder} alt={name} className="photo-grade absolute inset-0 h-full w-full object-cover" />
        ) : (
          <MediaFallback icon={placeGlyph(place?.category, name).icon} className="absolute inset-0 size-full" />
        )}
        {place && tripId && <div className="absolute top-2 right-2"><SaveHeart tripId={tripId} place={place} /></div>}
      </div>
    </div>
  );
}

/** Under the name on a phone: rating, kind · city · price, and whether it is open now. */
export function PlacePhoneSummary({ details, city, price, openNow, todayHours }: { details: GooglePlaceDetails; city: string | undefined; price: string | undefined; openNow: boolean | undefined; todayHours: string | null }) {
  return (
    <div className="mt-2 lg:hidden">
      <p className="flex flex-wrap items-center gap-x-2 text-body text-ink-soft">
        {typeof details.rating === "number" && (
          <span className="inline-flex items-center gap-1 font-semibold text-foreground tabular-nums">
            <Star className="size-4 fill-coral text-coral" aria-hidden />
            {details.rating.toFixed(1)}
            {details.userRatingCount ? <span className="font-normal text-muted-foreground">({compactCount(details.userRatingCount)})</span> : null}
          </span>
        )}
        <span>{[categoryLabel(details.primaryType), city, price].filter(Boolean).join(" · ")}</span>
      </p>
      {(typeof openNow === "boolean" || todayHours) && (
        <p className="mt-3 flex flex-wrap gap-2">
          {typeof openNow === "boolean" && (
            <span className={cn("inline-flex h-9 items-center gap-1.5 rounded-full bg-muted px-3.5 text-sm font-medium", openNow ? "text-foreground" : "text-ink-soft")}>
              <Clock className={cn("size-4", openNow ? "text-positive" : "text-muted-foreground")} aria-hidden />
              {openNowChip(openNow, todayHours)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The phone's photo for a stay or an event: the same rounded 16:10 picture as a place's, so the three details open the same way.
 * `badge` rides the bottom-right corner (a rating); the name goes below as text, never over the photo.
 */
export function DetailPhonePhoto({ src, fallbackSrc, alt, icon, badge }: { src: string | null | undefined; fallbackSrc?: string; alt: string; icon: LucideIcon; badge?: React.ReactNode }) {
  const shown = src || fallbackSrc;
  return (
    <div className="px-4 pt-3 lg:hidden">
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-muted">
        {shown ? (
          <BlurImage src={withPhotoWidth(shown, 960)} alt={alt} className="photo-grade absolute inset-0 h-full w-full object-cover" />
        ) : (
          <MediaFallback icon={icon} className="absolute inset-0 size-full" />
        )}
        {badge && <span className="absolute right-3 bottom-3 inline-flex h-8 items-center gap-1 rounded-full bg-white/94 px-3 text-sm font-semibold text-ink shadow-soft">{badge}</span>}
      </div>
    </div>
  );
}
