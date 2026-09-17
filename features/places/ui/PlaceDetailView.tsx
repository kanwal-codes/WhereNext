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
import { GetYourGuideCard } from "@/components/GetYourGuideCard";
import { Hero } from "@/components/Hero";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { NearbyRecommendations } from "@/components/NearbyRecommendations";
import { BackLink } from "@/components/BackLink";
import { ExternalLink } from "@/components/ExternalLink";
import { SourceCard } from "@/components/SourceCard";
import { Skeleton, SkeletonLines } from "@/components/Skeleton";
import { TripWeather } from "@/components/TripWeather";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { PhotoLightbox, usePhotoLightbox } from "@/components/PhotoLightbox";
import { isWeatherRelevantPlace } from "@/packages/reco/vibes";
import { usePlaceDetails } from "@/features/places/application/usePlaceDetails";
import { useDocumentTitle } from "@/lib/use-document-title";
import { amenityChips, askAssistantHref, businessStatusLabel, categoryLabel, cityFrom, detailsToPlace, photoProxyUrl, priceLabel, secondaryTypes, type GoogleReview } from "@/lib/places-ui";
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
  const { details, webSummary, state } = usePlaceDetails(tripId, placeId);
  const titleTag = useDocumentTitle(panel ? null : details?.displayName?.text ?? "Place");
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const lightbox = usePhotoLightbox();

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
  const amenities = amenityChips(details);

  const place = detailsToPlace(details);
  // The one action, up top. No card wrapper — it's a button, not a module.
  // `max-w-sm`: `block` stretches the button to fill whatever container it's in, which is
  // right for a genuinely narrow sidebar column — but the page variant's aside only becomes an
  // actual sidebar at the `lg` breakpoint (see the grid below); under that, it sits BELOW the
  // body at the body's own full width, and an unconstrained full-width button there stretched
  // into a very long, thin bar spanning nearly the whole page. Capping it keeps it looking like
  // a button at every width instead of a banner at in-between ones.
  const asideAction = place ? (
    <div className="max-w-sm">
      <AddToTripControl tripId={tripId} place={place} size="md" block />
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

      <SourceCard provider="Google Maps" href={details.googleMapsUri} />
    </>
  );

  // Page view keeps the single sticky sidebar; the panel splits it around the body.
  // `asideAction` (Add to trip) is NOT repeated here for the page view — it now sits inline
  // next to the title instead (see the header block below), so it's visible immediately rather
  // than only after scrolling past Photos/Reviews/Hours to reach this sidebar. The panel variant
  // still places it separately, right under its own (narrower) title block.
  const aside = (
    <div className={cn("min-w-0 space-y-4", !panel && "lg:sticky lg:top-8")}>
      {asideSecondary}
    </div>
  );

  const body = (
    <div className="min-w-0 space-y-8">
      <Reveal delay={0.06}>
        <section>
          <DetailSectionHeading>About</DetailSectionHeading>
          {details.editorialSummary?.text ? (
            <p className="mt-2 text-[15px] leading-[1.8] text-ink-soft">{details.editorialSummary.text}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {details.userRatingCount
                ? `A ${categoryLabel(details.primaryType).toLowerCase()} rated ${details.rating?.toFixed(1)} across ${details.userRatingCount.toLocaleString()} reviews.${reviews.length > 0 ? " What people say is below." : ""}`
                : `No description for this ${categoryLabel(details.primaryType).toLowerCase()} yet.`}
            </p>
          )}
          {/* Google's own editorialSummary above is only written for a subset of well-known
              places, and even then is often one generic sentence — this supplements it with a
              real excerpt from the web, clearly sourced rather than presented as Google's own
              words, so a thin or missing summary still leaves the traveller with something. */}
          {webSummary && (
            <p className="mt-2 text-sm leading-[1.75] text-muted-foreground">
              {webSummary.content}{" "}
              <ExternalLink href={webSummary.source.url} className="text-xs whitespace-nowrap">
                {webSummary.source.title}
              </ExternalLink>
            </p>
          )}
          {typeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {typeChips.map((t) => (
                <span key={t} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground capitalize">{t}</span>
              ))}
            </div>
          )}
          {amenities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {amenities.map((a) => (
                <span key={a} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-ink-soft">{a}</span>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {morePhotos.length > 0 && (
        <Reveal delay={0.08}>
          <section>
            <DetailSectionHeading>Photos</DetailSectionHeading>
            <div className={cn("mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain no-scrollbar px-1 pb-1", panel ? "" : "-mx-5 px-5 sm:mx-0 sm:px-0")}>
              {morePhotos.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => lightbox.open(i)}
                  aria-label={`Expand photo ${i + 1} of ${name}`}
                  className="shrink-0 snap-start rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy */}
                  <img src={src} alt={name} loading="lazy" width={288} height={192} className="h-44 w-72 rounded-2xl border border-border object-cover transition-opacity hover:opacity-90" />
                </button>
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
              Ask Roam — it weighs {name} against your budget, pace and the places you&rsquo;ve saved. The question is written for you; just hit send.
            </span>
          </span>
        </Link>
      </Reveal>

      <Reveal delay={0.11}>
        <GetYourGuideCard query={name} label={`Find tours and tickets for ${name}`} />
      </Reveal>

      {reviews.length > 0 && (
        <Reveal delay={0.12}>
          <section>
            <DetailSectionHeading>What people say</DetailSectionHeading>
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
            <DetailSectionHeading>Hours</DetailSectionHeading>
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
      <Hero
        image={photo ?? "/design/place-neighbourhood.jpg"}
        alt={name}
        plain
        surface={panel}
        className={cn(panel ? "h-44" : "h-[38vh] min-h-[240px] sm:h-[46vh] sm:max-h-[420px]")}
        ratingBadge={
          typeof details.rating === "number" && (
            <>
              <Star className="h-3.5 w-3.5 fill-current text-coral" /> {details.rating.toFixed(1)}
              {details.userRatingCount ? ` (${details.userRatingCount.toLocaleString()})` : ""}
            </>
          )
        }
      >
        {!panel && <BackLink fallback={`/trips/${tripId}/discover`} label="Back" className="absolute top-4 left-4" />}
      </Hero>

      <div className={pad}>
        <Reveal>
          <div className="pt-6">
            {/* Add to trip sits beside the title on its own row (not stacked below it) so it's
                visible immediately — it used to only appear in a sidebar that, below the `lg`
                breakpoint, rendered AFTER Photos/Reviews/Hours, past a full scroll of content.
                Stacks back below the title on narrow (mobile) widths, where a side-by-side row
                would leave neither the name nor the button enough room. Panel keeps its own
                separate, already-visible placement (a narrow drawer has no "beside" to offer). */}
            <div className={cn(!panel && "sm:flex sm:items-start sm:justify-between sm:gap-6")}>
              <div className="min-w-0">
                <span className="eyebrow">{categoryLabel(details.primaryType)}</span>
                <WordReveal text={name} delay={0.18} className={cn("mt-2 font-display leading-tight", panel ? "text-2xl" : "text-4xl")} />
              </div>
              {!panel && <div className="mt-4 max-w-sm shrink-0 sm:mt-2 sm:w-64">{asideAction}</div>}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {details.formattedAddress && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {details.formattedAddress}
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
          <div className="mt-7 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
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

      <PhotoLightbox photos={morePhotos} index={lightbox.index} onIndexChange={lightbox.open} onClose={lightbox.close} alt={name} />
    </div>
  );
}
