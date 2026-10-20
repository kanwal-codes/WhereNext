"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Accessibility,
  ArrowUpRight,
  ChevronDown,
  Clock,
  Globe,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Star,
} from "lucide-react";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { GetYourGuideCard } from "@/components/GetYourGuideCard";
import { Hero } from "@/components/Hero";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { FactStrip, InfoList, InfoRow, QuickActions, ShowMore } from "@/components/DetailKit";
import { placeFacts } from "@/features/places/ui/placeFacts";
import { NearbyRecommendations } from "@/components/NearbyRecommendations";
import { BackLink } from "@/components/BackLink";
import { ExternalLink } from "@/components/ExternalLink";
import { SourceCard } from "@/components/SourceCard";
import { PanelError, PanelLoading, PANEL_PAD, PANEL_HERO } from "@/components/PanelStates";
import { TripWeather } from "@/components/TripWeather";
import { BlurImage, Reveal, WordReveal } from "@/components/motion-primitives";
import { placeGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { PhotoLightbox, usePhotoLightbox } from "@/components/PhotoLightbox";
import { isWeatherRelevantPlace } from "@/packages/reco/vibes";
import { usePlaceDetails } from "@/features/places/application/usePlaceDetails";
import { useHydrated } from "@/lib/use-media-query";
import { readPlaceSeed } from "@/features/places/application/placeDetailsCache";
import { useDocumentTitle } from "@/lib/use-document-title";
import { amenityChips, askAssistantHref, businessStatusLabel, categoryLabel, cityFrom, detailsToPlace, photoProxyUrl, prettyWebsite, withPhotoWidth, priceLabel, secondaryTypes } from "@/lib/places-ui";
import { Badge, MediaFallback, compactCount } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import { PHONE_V2 } from "@/lib/phone-v2";
import { SaveHeart } from "@/features/trip/ui/SaveHeart";
import { ReviewFigure } from "@/features/places/ui/PlaceReview";
import { openNowChip, placeDirectionsUrl, splitHoursLine, telHref, todayHoursOf, todayIndex, usableReviews, wheelchairAccessible } from "@/features/places/domain/place-view";

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
  const { details, about, aboutLoading, state, retry } = usePlaceDetails(tripId, placeId);
  // The remembered card is read only once on the client: the server never has one, and the two must agree while hydrating.
  const hydrated = useHydrated();
  const titleTag = useDocumentTitle(panel ? null : details?.displayName?.text ?? "Place");
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const lightbox = usePhotoLightbox();

  const pad = panel ? PANEL_PAD : "mx-auto max-w-5xl px-5 pb-14 sm:px-8";

  if (state === "loading") return <PanelLoading what="this place" panel={panel} seed={hydrated ? readPlaceSeed(tripId, placeId) : null} />;

  if (state === "error" || !details) {
    return (
      <>
        {!panel && <div className="mx-auto max-w-5xl px-5 pt-6 sm:px-8"><BackLink fallback={`/trips/${tripId}/discover`} label="Back" /></div>}
        <PanelError what="this place" panel={panel} onRetry={retry} />
      </>
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
  const wheelchair = wheelchairAccessible(a11y);
  const reviews = usableReviews(details.reviews);
  const city = cityFrom(details.formattedAddress);
  const amenities = amenityChips(details);
  const todayHours = todayHoursOf(hours);
  const openNow = details.regularOpeningHours?.openNow;
  const directionsHref = placeDirectionsUrl(name, details.formattedAddress, placeId);

  const place = detailsToPlace(details);
  // The one action, up top. No card wrapper — it's a button, not a module.
  // `max-w-sm`: `block` stretches the button to fill whatever container it's in, which is
  // right for a genuinely narrow sidebar column — but the page variant's aside only becomes an
  // actual sidebar at the `lg` breakpoint (see the grid below); under that, it sits BELOW the
  // body at the body's own full width, and an unconstrained full-width button there stretched
  // into a very long, thin bar spanning nearly the whole page. Capping it keeps it looking like
  // a button at every width instead of a banner at in-between ones.
  const asideAction = place ? (
    <div className={cn(panel ? "max-w-md" : "max-w-sm", PHONE_V2 && "max-lg:hidden")}>
      <AddToTripControl tripId={tripId} place={place} size="lg" block />
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">This place can&rsquo;t be added &mdash; we don&rsquo;t have a location for it.</p>
  );

  const hasContact = Boolean(details.nationalPhoneNumber || details.websiteUri || wheelchair);
  const asideSecondary = (
    <>
      {(hours.length > 0 || hasContact) && (
        <section aria-label="Hours and contact" className="space-y-3">
          <DetailSectionHeading>Hours &amp; contact</DetailSectionHeading>
          <InfoList>
            {hours.length > 0 && (
              <li>
                <details className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                    <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">Today · {todayHours}</span>
                    {hours.length > 1 && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                        All days <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                      </span>
                    )}
                  </summary>
                  <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 pb-3 pl-7 text-sm text-muted-foreground">
                    {hours.map((h, i) => {
                      const [day, hoursText] = splitHoursLine(h);
                      const today = i === todayIndex();
                      return (
                        <div key={h} className={cn("col-span-2 grid grid-cols-subgrid tabular-nums", today && "font-medium text-foreground")}>
                          <dt>{day}</dt>
                          <dd>{hoursText}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </details>
              </li>
            )}
            {details.nationalPhoneNumber && (
              <InfoRow icon={Phone} href={telHref(details.nationalPhoneNumber)}>
                {details.nationalPhoneNumber}
              </InfoRow>
            )}
            {details.websiteUri && (
              <InfoRow icon={Globe} href={details.websiteUri} external trailing={<ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}>
                {prettyWebsite(details.websiteUri)}
              </InfoRow>
            )}
            {wheelchair && <InfoRow icon={Accessibility}>Wheelchair accessible</InfoRow>}
          </InfoList>
        </section>
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
      <Reveal delay={0.04} className={cn(PHONE_V2 && "max-lg:hidden")}>
        <div className="space-y-4">
          <FactStrip
            variant="hero"
            facts={placeFacts({ rating: details.rating, ratingCount: details.userRatingCount, price, openNow, todayHours })}
          />
          <QuickActions
            variant="bar"
            actions={[
              { icon: Navigation, label: "Directions", href: directionsHref, external: true, hint: "Google Maps" },
              details.nationalPhoneNumber && { icon: Phone, label: "Call", href: telHref(details.nationalPhoneNumber), hint: details.nationalPhoneNumber },
              details.websiteUri && { icon: Globe, label: "Website", href: details.websiteUri, external: true, hint: prettyWebsite(details.websiteUri).split("/")[0] },
            ]}
          />
        </div>
      </Reveal>

      {(details.editorialSummary?.text || about || aboutLoading || typeChips.length > 0 || amenities.length > 0) && (
      <Reveal delay={0.06}>
        <section>
          <DetailSectionHeading>About</DetailSectionHeading>
          {/* Written for the page (see lib/application/place-about.ts), never pasted from the web. Google's own one-liner stands in
              while it is written, and when nothing good could be written. */}
          {about ? (
            <p className="mt-2 text-body leading-[1.8] text-ink-soft">
              {about.content}
              {about.source && (
                <>
                  {" "}
                  <ExternalLink href={about.source.url} className="text-xs whitespace-nowrap">
                    {prettyWebsite(about.source.url).split("/")[0]}
                  </ExternalLink>
                </>
              )}
            </p>
          ) : details.editorialSummary?.text ? (
            <p className="mt-2 text-body leading-[1.8] text-ink-soft">{details.editorialSummary.text}</p>
          ) : aboutLoading ? (
            <div aria-hidden className="mt-3 space-y-2.5">
              <div className="skeleton h-4 w-full rounded-md" />
              <div className="skeleton h-4 w-4/5 rounded-md" />
            </div>
          ) : null}
          {(typeChips.length > 0 || amenities.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {typeChips.map((t) => <Badge key={t} className="capitalize">{t}</Badge>)}
              {amenities.map((a) => <Badge key={a} className="bg-transparent text-ink-soft ring-1 ring-inset ring-border">{a}</Badge>)}
            </div>
          )}
        </section>
      </Reveal>
      )}

      {morePhotos.length > 0 && (
        <Reveal delay={0.08}>
          <section>
            <DetailSectionHeading>Photos</DetailSectionHeading>
            <div className={cn("mt-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain no-scrollbar px-1 pb-14 -mb-12 pt-2", panel ? "" : "-mx-5 px-5 sm:mx-0 sm:px-0")}>
              {morePhotos.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => lightbox.open(i)}
                  aria-label={`Expand photo ${i + 1} of ${name}`}
                  className="shrink-0 snap-start rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy */}
                  <img src={withPhotoWidth(src, 640)} alt="" loading="lazy" width={288} height={192} className="h-44 w-72 rounded-2xl border border-border object-cover transition-opacity hover:opacity-90" />
                </button>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {!panel && <Reveal delay={0.1}>
        <Link
          href={askAssistantHref(tripId, { name, address: details.formattedAddress, mapsUrl: details.googleMapsUri })}
          className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-accent"
        >
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-medium">Does {name} fit your trip?</span>
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
              Roam weighs it against your budget, pace and saved places. The question is written for you — just send it.
            </span>
          </span>
        </Link>
      </Reveal>}

      <Reveal delay={0.11}>
        <GetYourGuideCard query={name} label={`Find tours and tickets for ${name}`} />
      </Reveal>

      {reviews.length > 0 && (
        <Reveal delay={0.12}>
          <section>
            <DetailSectionHeading>What people say</DetailSectionHeading>
            <div className="mt-3 space-y-3">
              {(reviewsOpen ? reviews : reviews.slice(0, 1)).map((r, i) => (
                <ReviewFigure key={i} r={r} />
              ))}
            </div>
            {reviews.length > 1 && (
              <div className="mt-3">
                <ShowMore open={reviewsOpen} onToggle={() => setReviewsOpen((v) => !v)} more={`Show ${reviews.length - 1} more review${reviews.length - 1 === 1 ? "" : "s"}`} less="Show fewer reviews" />
              </div>
            )}
          </section>
        </Reveal>
      )}
    </div>
  );

  return (
    <div>
      {titleTag}
      {PHONE_V2 && (
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
      )}
      <div className={cn(PHONE_V2 && "max-lg:hidden")}>
      <Hero
        image={photo ?? null}
        alt={name}
        plain
        kenBurns={!panel}
        surface={panel}
        ratingBadge={typeof details.rating === "number" ? <><Star className="size-3.5 fill-current text-coral-soft" aria-hidden /> {details.rating.toFixed(1)}{details.userRatingCount ? <span className="opacity-70"> {compactCount(details.userRatingCount)}</span> : null}</> : undefined}
        className={cn(panel ? PANEL_HERO : "h-[38vh] min-h-[240px] sm:h-[46vh] sm:max-h-[420px]")}
      >
        {!panel && <BackLink fallback={`/trips/${tripId}/discover`} label="Back" className="absolute top-4 left-4" />}
      </Hero>
      </div>

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
                <p className={cn("text-sm text-muted-foreground", PHONE_V2 && "max-lg:hidden")}>{categoryLabel(details.primaryType)}</p>
                {panel ? (
                  <h1 className="mt-1 font-display text-2xl font-semibold leading-tight max-lg:text-title max-lg:font-medium max-lg:tracking-[-0.03em]">{name}</h1>
                ) : (
                  <WordReveal text={name} delay={0.18} className="mt-1 font-display text-4xl leading-tight max-lg:text-title max-lg:tracking-[-0.03em]" />
                )}
              </div>
              {!panel && <div className="mt-4 max-w-sm shrink-0 sm:mt-2 sm:w-64">{asideAction}</div>}
            </div>
            {PHONE_V2 && (
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
            )}
            <p className={cn("mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground", PHONE_V2 && "max-lg:hidden")}>
              {details.formattedAddress && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {details.formattedAddress}
                </span>
              )}
              {status && <Badge tone="caution">{status}</Badge>}
            </p>
            {city && isWeatherRelevantPlace({ primaryType: details.primaryType, types: details.types }) && (
              <TripWeather tripId={tripId} location={city} className="mt-1.5" />
            )}
          </div>
        </Reveal>

        {PHONE_V2 && place && (
          // The two things you do with a place sit under its name, in the page, not as a bar pinned over the content.
          <div className="mt-5 flex items-center gap-2.5 lg:hidden">
            <div className="min-w-0 flex-1"><AddToTripControl tripId={tripId} place={place} size="lg" block noSave /></div>
            <a href={directionsHref} target="_blank" rel="noreferrer noopener" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-input bg-background px-5 text-[0.9375rem] font-semibold transition-transform active:scale-[0.97]">
              <Navigation className="size-[1.125rem]" aria-hidden /> Directions
            </a>
          </div>
        )}
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
