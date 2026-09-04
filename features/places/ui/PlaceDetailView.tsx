"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Accessibility,
  ChevronDown,
  Clock,
  Globe,
  MapPin,
  MessageCircle,
  Phone,
  Star,
} from "lucide-react";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { Hero } from "@/components/Hero";
import { NearbyRecommendations } from "@/components/NearbyRecommendations";
import { BackLink } from "@/components/BackLink";
import { ExternalLink } from "@/components/ExternalLink";
import { Skeleton, SkeletonLines } from "@/components/Skeleton";
import { TripWeather } from "@/components/TripWeather";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { isWeatherRelevantPlace } from "@/packages/reco/vibes";
import { usePlaceDetails } from "@/features/places/application/usePlaceDetails";
import { useDocumentTitle } from "@/lib/use-document-title";
import { askAssistantHref, businessStatusLabel, categoryLabel, detailsToPlace, photoProxyUrl, priceLabel, secondaryTypes, type GoogleReview } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

function ReviewFigure({ r }: { r: GoogleReview }) {
  return (
    <figure className="rounded-2xl bg-surface p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          {typeof r.rating === "number" && (
            <span className="inline-flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, s) => (
                <Star key={s} className={`h-3 w-3 ${s < Math.round(r.rating!) ? "fill-current text-coral" : "text-border"}`} />
              ))}
            </span>
          )}
          <span className="font-medium text-foreground">{r.authorAttribution?.displayName ?? "Google user"}</span>
        </span>
        {r.relativePublishTimeDescription && <span>{r.relativePublishTimeDescription}</span>}
      </div>
      <blockquote className="mt-2 line-clamp-5 text-sm leading-relaxed text-ink-soft">
        {r.text?.text || r.originalText?.text}
      </blockquote>
    </figure>
  );
}

/** Rough "City, Country" from a Google formatted address. */
function cityFrom(address: string | undefined): string {
  if (!address) return "";
  return address.split(",").map((p) => p.trim()).filter(Boolean).slice(-2).join(", ");
}

/**
 * The full place detail — same content and styling everywhere. `variant="page"`
 * is the routed `/place/[id]`; `variant="panel"` is the chat side rail (one
 * column, tighter padding, no back-link — the panel chrome owns close).
 */
export function PlaceDetailView({
  tripId,
  placeId,
  variant = "page",
}: {
  tripId: string;
  placeId: string;
  variant?: "page" | "panel";
}) {
  const panel = variant === "panel";
  const { details, state } = usePlaceDetails(tripId, placeId);
  const titleTag = useDocumentTitle(panel ? null : details?.displayName?.text ?? "Place");
  const [reviewsOpen, setReviewsOpen] = useState(false);

  const pad = panel ? "px-4 pb-8" : "mx-auto max-w-5xl px-5 pb-14 sm:px-8";

  if (state === "loading") {
    return (
      <div>
        <Skeleton className={cn("rounded-none", panel ? "h-44" : "h-[38vh] min-h-[240px] sm:h-[46vh] sm:max-h-[420px]")} />
        <div className={cn(pad, "pt-6")}>
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="mt-3 h-8 w-2/3 rounded-lg" />
          <SkeletonLines lines={3} className="mt-6" />
        </div>
      </div>
    );
  }

  if (state === "error" || !details) {
    return (
      <div className={cn(pad, "pt-10")}>
        {!panel && <BackLink fallback={`/trips/${tripId}/discover`} label="Back" />}
        <h1 className="mt-6 font-display text-2xl">We couldn’t load this place</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong just now. Head back to Discover and try again in a moment.</p>
      </div>
    );
  }

  const name = details.displayName?.text ?? "Place";
  const photo = photoProxyUrl(tripId, details.photos?.[0]?.name);
  const morePhotos = (details.photos ?? []).slice(1).map((p) => photoProxyUrl(tripId, p.name)).filter((u): u is string => Boolean(u));
  const hours = details.regularOpeningHours?.weekdayDescriptions ?? [];
  const price = priceLabel(details.priceLevel);
  const status = businessStatusLabel(details.businessStatus);
  const typeChips = secondaryTypes(details.primaryType, details.types);
  const a11y = details.accessibilityOptions;
  const wheelchair = Boolean(a11y && (a11y.wheelchairAccessibleEntrance || a11y.wheelchairAccessibleParking || a11y.wheelchairAccessibleRestroom || a11y.wheelchairAccessibleSeating));
  const reviews = (details.reviews ?? []).filter((r) => r.text?.text || r.originalText?.text).slice(0, 4);
  const city = cityFrom(details.formattedAddress);

  const place = detailsToPlace(details);
  // The one action, up top. No card wrapper — it's a button, not a module.
  const asideAction = place ? (
    <div>
      <AddToTripControl tripId={tripId} place={place} size="md" block />
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Shortlist</span> while you&rsquo;re deciding &mdash; open the menu to drop it on a day.
      </p>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">This place can&rsquo;t be added &mdash; we don&rsquo;t have a location for it.</p>
  );

  const asideSecondary = (
    <>
      {(details.nationalPhoneNumber || details.websiteUri || wheelchair) && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="eyebrow">Details</p>
          <dl className="mt-2 space-y-2.5 text-sm">
            {details.nationalPhoneNumber && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <a href={`tel:${details.nationalPhoneNumber.replace(/\s/g, "")}`} className="hover:text-primary">{details.nationalPhoneNumber}</a>
              </div>
            )}
            {details.websiteUri && (
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <ExternalLink href={details.websiteUri} className="min-w-0 max-w-full truncate text-sm">
                  {details.websiteUri.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </ExternalLink>
              </div>
            )}
            {wheelchair && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Accessibility className="h-3.5 w-3.5 shrink-0" /> Wheelchair accessible
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border px-3 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Source</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>Google Maps</span>
          {details.googleMapsUri && <ExternalLink href={details.googleMapsUri} className="text-xs">Open map</ExternalLink>}
        </div>
      </div>
    </>
  );

  // Page view keeps the single sticky sidebar; the panel splits it around the body.
  const aside = (
    <div className={cn("space-y-4", !panel && "lg:sticky lg:top-8")}>
      {asideAction}
      {asideSecondary}
    </div>
  );

  const body = (
    <div className="space-y-8">
      <Reveal delay={0.06}>
        <section>
          <h2 className="font-display text-xl">About</h2>
          {details.editorialSummary?.text ? (
            <p className="mt-2 text-[15px] leading-[1.8] text-ink-soft">{details.editorialSummary.text}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {details.userRatingCount
                ? `A ${categoryLabel(details.primaryType).toLowerCase()} rated ${details.rating?.toFixed(1)} across ${details.userRatingCount.toLocaleString()} reviews. What people say is below.`
                : `No description for this ${categoryLabel(details.primaryType).toLowerCase()} yet.`}
            </p>
          )}
          {typeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {typeChips.map((t) => (
                <span key={t} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground capitalize">{t}</span>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {morePhotos.length > 0 && (
        <Reveal delay={0.08}>
          <section>
            <h2 className="font-display text-xl">Photos</h2>
            <div className={cn("mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto no-scrollbar px-1 pb-1", panel ? "" : "-mx-5 px-5 sm:mx-0 sm:px-0")}>
              {morePhotos.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
                <img key={src} src={src} alt={name} loading="lazy" width={288} height={192} className="h-44 w-72 shrink-0 snap-start rounded-2xl border border-border object-cover" />
              ))}
            </div>
          </section>
        </Reveal>
      )}

      <Reveal delay={0.1}>
        <Link
          href={askAssistantHref(tripId, { name, address: details.formattedAddress, mapsUrl: details.googleMapsUri })}
          className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-accent"
        >
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="eyebrow">Why this may fit your trip</span>
            <span className="mt-1 block text-sm leading-[1.75]">
              Ask the assistant — it weighs {name} against your budget, pace and the places you&rsquo;ve saved. The question is written for you; just hit send.
            </span>
          </span>
        </Link>
      </Reveal>

      {reviews.length > 0 && (
        <Reveal delay={0.12}>
          <section>
            <h2 className="font-display text-xl">What people say</h2>
            {reviewsOpen || reviews.length === 1 ? (
              <div className="mt-4 space-y-3">
                {reviews.map((r, i) => (
                  <ReviewFigure key={i} r={r} />
                ))}
              </div>
            ) : (
              // First review, with the rest as "stacked paper" edges peeking below it.
              <div className="relative mt-4" style={{ paddingBottom: reviews.length > 2 ? 22 : 12 }}>
                <div aria-hidden className="pointer-events-none absolute inset-x-3 bottom-0 top-2.5 rounded-2xl border border-border bg-surface/80" />
                {reviews.length > 2 && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-[-10px] top-5 rounded-2xl border border-border bg-surface/50" />
                )}
                <div className="relative">
                  <ReviewFigure r={reviews[0]} />
                </div>
              </div>
            )}
            {reviews.length > 1 && (
              <button
                type="button"
                onClick={() => setReviewsOpen((v) => !v)}
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary"
              >
                {reviewsOpen ? "Show less" : `Show ${reviews.length - 1} more review${reviews.length - 1 === 1 ? "" : "s"}`}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", reviewsOpen && "rotate-180")} />
              </button>
            )}
          </section>
        </Reveal>
      )}

      {hours.length > 0 && (
        <Reveal delay={0.14}>
          <section>
            <h2 className="font-display text-xl">Hours</h2>
            <ul className="mt-3 space-y-1 text-sm text-ink-soft">
              {hours.map((h) => (
                <li key={h} className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {h}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}
    </div>
  );

  return (
    <div>
      {titleTag}
      <Hero image={photo ?? "/design/place-neighbourhood.jpg"} alt={name} plain className={cn(panel ? "h-44" : "h-[38vh] min-h-[240px] sm:h-[46vh] sm:max-h-[420px]")}>
        {!panel && <BackLink fallback={`/trips/${tripId}/discover`} label="Back" className="absolute top-4 left-4" />}
      </Hero>

      <div className={pad}>
        <Reveal>
          <div className="pt-6">
            <span className="eyebrow">{categoryLabel(details.primaryType)}</span>
            <WordReveal text={name} delay={0.18} className={cn("mt-2 font-display leading-tight", panel ? "text-2xl" : "text-4xl")} />
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {details.formattedAddress && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {details.formattedAddress}
                </span>
              )}
              {typeof details.rating === "number" && (
                <span className="inline-flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 fill-current text-coral" /> {details.rating.toFixed(1)}
                  {details.userRatingCount ? ` (${details.userRatingCount.toLocaleString()})` : ""}
                </span>
              )}
              {price && <span>{price}</span>}
              {status && <span>{status}</span>}
            </p>
            {city && isWeatherRelevantPlace({ primaryType: details.primaryType, types: details.types }) && (
              <TripWeather tripId={tripId} location={city} className="mt-1.5" />
            )}
          </div>
        </Reveal>

        {panel ? (
          <div className="mt-6 space-y-8">
            <Reveal delay={0.08}>{asideAction}</Reveal>
            {body}
            <Reveal delay={0.1}>
              <div className="space-y-4">{asideSecondary}</div>
            </Reveal>
          </div>
        ) : (
          <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {body}
            <Reveal delay={0.1}>{aside}</Reveal>
          </div>
        )}

        <NearbyRecommendations
          tripId={tripId}
          excludeId={placeId}
          anchorName={name}
          cityHint={city}
          primaryType={details.primaryType}
          types={details.types}
          lat={details.location?.latitude}
          lng={details.location?.longitude}
        />
      </div>
    </div>
  );
}
