"use client";

import { Clock, Star } from "lucide-react";
import { BlurImage } from "@/components/motion-primitives";
import { placeGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { MediaFallback, compactCount } from "@/features/conversation/ui/blocks/ui";
import { SaveHeart } from "@/features/trip/ui/SaveHeart";
import { openNowChip } from "@/features/places/domain/place-view";
import { categoryLabel, withPhotoWidth, type GooglePlaceDetails, type detailsToPlace } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

type PlaceForTrip = ReturnType<typeof detailsToPlace>;

/** The phone's photo: rounded, with the save heart on it. */
export function PlacePhonePhoto({ tripId, photo, name, place }: { tripId: string; photo: string | undefined; name: string; place: PlaceForTrip }) {
  return (
    <div className="px-5 pt-3 lg:hidden">
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-muted">
        {/* No photo: the app's own stand-in with the kind of place drawn on it, never someone else's stock picture. */}
        {photo ? (
          <BlurImage src={withPhotoWidth(photo, 960)} alt={name} className="photo-grade absolute inset-0 h-full w-full object-cover" />
        ) : (
          <MediaFallback icon={placeGlyph(place?.category, name).icon} className="absolute inset-0 size-full" />
        )}
        {place && <div className="absolute top-2 right-2"><SaveHeart tripId={tripId} place={place} /></div>}
      </div>
    </div>
  );
}

/** Under the name on a phone: rating, kind · city · price, and whether it is open now. */
export function PlacePhoneSummary({ details, city, price, openNow, todayHours }: { details: GooglePlaceDetails; city: string | undefined; price: string | undefined; openNow: boolean | undefined; todayHours: string | null }) {
  return (
    <div className="mt-2 lg:hidden">
      <p className="flex flex-wrap items-center gap-x-2 text-[0.9375rem] text-ink-soft">
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
            <span className={cn("inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium", openNow ? "text-foreground" : "text-ink-soft")}>
              <Clock className={cn("size-4", openNow ? "text-positive" : "text-muted-foreground")} aria-hidden />
              {openNowChip(openNow, todayHours)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
