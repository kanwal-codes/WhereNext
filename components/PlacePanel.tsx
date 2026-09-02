"use client";

import Link from "next/link";
import {
  Accessibility,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  CalendarPlus,
  Clock,
  Globe,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  X,
} from "lucide-react";
import { usePlaceDetails } from "@/features/places/application/usePlaceDetails";
import { BlurImage } from "@/components/motion-primitives";
import { businessStatusLabel, categoryLabel, photoProxyUrl, priceLabel } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

/** The Lovable "foggy" detail image: blur-in load, grain + vignette, and a
 *  bottom gradient + blurred seam that dissolves the photo into the panel. */
function FoggyImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative isolate h-44 overflow-hidden rounded-2xl border border-border">
      <BlurImage src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover object-center" />
      <div className="grain pointer-events-none absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-surface/15" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-surface via-surface/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-10 bg-surface [mask-image:linear-gradient(to_top,black,transparent)] backdrop-blur-md" />
    </div>
  );
}

export function PlacePanel({
  tripId,
  placeId,
  placeName,
  initiallySaved,
  onClose,
}: {
  tripId: string;
  placeId: string;
  placeName: string;
  initiallySaved?: boolean;
  onClose: () => void;
}) {
  const { details, freshness, state, saved, busy, notice, toggleSave, addToItinerary } = usePlaceDetails(tripId, placeId, { initiallySaved });

  const name = details?.displayName?.text ?? placeName;
  const photo = photoProxyUrl(tripId, details?.photos?.[0]?.name);
  const hours = details?.regularOpeningHours?.weekdayDescriptions ?? [];
  const price = priceLabel(details?.priceLevel);
  const status = businessStatusLabel(details?.businessStatus);
  const a11y = details?.accessibilityOptions;
  const wheelchair = Boolean(
    a11y && (a11y.wheelchairAccessibleEntrance || a11y.wheelchairAccessibleParking || a11y.wheelchairAccessibleRestroom || a11y.wheelchairAccessibleSeating),
  );
  const reviews = (details?.reviews ?? []).filter((r) => (r.text?.text || r.originalText?.text)).slice(0, 3);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">Place</p>
          <p className="truncate font-display text-sm">{name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close place panel"
          className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim">
        {state === "loading" && (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            <p className="mt-3">Loading place…</p>
          </div>
        )}

        {state === "error" && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">Details for {name} are unavailable right now.</p>
          </div>
        )}

        {state === "ready" && details && (
          <div className="space-y-5 px-4 py-4">
            {photo ? (
              <FoggyImage src={photo} alt={name} />
            ) : (
              <div className="grid h-44 w-full place-items-center rounded-2xl bg-muted text-muted-foreground">
                <MapPin className="h-6 w-6 opacity-40" />
              </div>
            )}

            <div>
              <span className="eyebrow">{categoryLabel(details.primaryType)}</span>
              <h3 className="mt-1 font-display text-lg leading-tight">{name}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {typeof details.rating === "number" && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3 fill-current text-coral" /> {details.rating.toFixed(1)}
                    {details.userRatingCount ? ` (${details.userRatingCount.toLocaleString()})` : ""}
                  </span>
                )}
                {price && <span>{price}</span>}
                {status && <span>{status}</span>}
              </div>
              {details.formattedAddress && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {details.formattedAddress}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void toggleSave()}
                disabled={busy}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-transform hover:scale-[1.02] disabled:opacity-60",
                  saved ? "border border-leaf/30 bg-leaf-soft text-leaf" : "bg-primary text-primary-foreground",
                )}
              >
                {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {saved ? "On the trip" : "Add to trip"}
              </button>
              <button
                type="button"
                onClick={() => void addToItinerary()}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
              >
                <CalendarPlus className="h-4 w-4" /> Add to itinerary
              </button>
              {notice && <p className="text-center text-xs text-muted-foreground">{notice}</p>}
            </div>

            {details.editorialSummary?.text && (
              <p className="text-sm leading-relaxed text-ink-soft">{details.editorialSummary.text}</p>
            )}

            <Link
              href={`/trips/${tripId}/chat`}
              className="flex items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 text-sm transition-colors hover:bg-accent"
            >
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="eyebrow">Why this may fit</span>
                <span className="mt-1 block leading-relaxed">
                  Ask the assistant how {name} fits your budget, pace and saved places.
                </span>
              </span>
            </Link>

            {(details.nationalPhoneNumber || details.websiteUri || wheelchair) && (
              <section>
                <p className="eyebrow">Details</p>
                <dl className="mt-2 space-y-2 text-xs">
                  {details.nationalPhoneNumber && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <a href={`tel:${details.nationalPhoneNumber.replace(/\s/g, "")}`} className="text-foreground hover:text-primary">
                        {details.nationalPhoneNumber}
                      </a>
                    </div>
                  )}
                  {details.websiteUri && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <a href={details.websiteUri} target="_blank" rel="noreferrer noopener" className="truncate text-foreground hover:text-primary">
                        {details.websiteUri.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                      </a>
                    </div>
                  )}
                  {wheelchair && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Accessibility className="h-3.5 w-3.5 shrink-0" /> Wheelchair accessible
                    </div>
                  )}
                </dl>
              </section>
            )}

            {hours.length > 0 && (
              <section>
                <p className="eyebrow">Hours</p>
                <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                  {hours.map((h) => (
                    <li key={h} className="flex items-center gap-2">
                      <Clock className="h-3 w-3 shrink-0 text-muted-foreground" /> {h}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {reviews.length > 0 && (
              <section>
                <p className="eyebrow">Recent reviews</p>
                <div className="mt-2 space-y-3">
                  {reviews.map((r, i) => (
                    <figure key={i} className="rounded-2xl border border-border bg-card p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {typeof r.rating === "number" && (
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <Star className="h-3 w-3 fill-current text-coral" /> {r.rating}
                          </span>
                        )}
                        <span className="truncate">{r.authorAttribution?.displayName ?? "Google user"}</span>
                        {r.relativePublishTimeDescription && <span>· {r.relativePublishTimeDescription}</span>}
                      </div>
                      <blockquote className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-ink-soft">
                        {r.text?.text || r.originalText?.text}
                      </blockquote>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            <div className="rounded-2xl border border-dashed border-border p-3.5">
              <p className="eyebrow">Source</p>
              <p className="mt-1 text-xs text-ink-soft">Google Places{freshness ? ` · checked ${freshness}` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-primary">
                <Link href={`/trips/${tripId}/place/${encodeURIComponent(placeId)}`}>Open full page</Link>
                {details.googleMapsUri && (
                  <a href={details.googleMapsUri} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1">
                    Google Maps <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
