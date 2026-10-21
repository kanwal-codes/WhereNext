"use client";

import Link from "next/link";
import {
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
import { FactStrip, QuickActions } from "@/components/DetailKit";
import { placeFacts } from "@/features/places/ui/placeFacts";
import { NearbyRecommendations } from "@/components/NearbyRecommendations";
import { BackLink } from "@/components/BackLink";
import { SourceCard } from "@/components/SourceCard";
import { PanelError, PanelLoading, PANEL_PAD, PANEL_HERO } from "@/components/PanelStates";
import { TripWeather } from "@/components/TripWeather";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { PhotoLightbox, usePhotoLightbox } from "@/components/PhotoLightbox";
import { isWeatherRelevantPlace } from "@/packages/reco/vibes";
import { usePlaceDetails } from "@/features/places/application/usePlaceDetails";
import { useHydrated } from "@/lib/use-media-query";
import { readPlaceSeed } from "@/features/places/application/placeDetailsCache";
import { useDocumentTitle } from "@/lib/use-document-title";
import { amenityChips, askAssistantHref, businessStatusLabel, categoryLabel, cityFrom, detailsToPlace, photoProxyUrl, prettyWebsite, priceLabel, secondaryTypes } from "@/lib/places-ui";
import { Badge, compactCount } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import { PlaceAbout } from "@/features/places/ui/PlaceAbout";
import { PlaceHoursContact } from "@/features/places/ui/PlaceHoursContact";
import { PlacePhoneSummary, PlacePhonePhoto } from "@/features/places/ui/PlacePhoneParts";
import { PlacePhotos } from "@/features/places/ui/PlacePhotos";
import { PlaceReviews } from "@/features/places/ui/PlaceReviews";
import { placeDirectionsUrl, telHref, todayHoursOf, usableReviews, wheelchairAccessible } from "@/features/places/domain/place-view";

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
    <div className={cn(panel ? "max-w-md" : "max-w-sm", "max-lg:hidden")}>
      <AddToTripControl tripId={tripId} place={place} size="lg" block />
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">This place can&rsquo;t be added &mdash; we don&rsquo;t have a location for it.</p>
  );

  const asideSecondary = (
    <>
      <PlaceHoursContact details={details} hours={hours} todayHours={todayHours} wheelchair={wheelchair} />

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
      <Reveal delay={0.04} className={cn("max-lg:hidden")}>
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

      <PlaceAbout about={about} aboutLoading={aboutLoading} editorial={details.editorialSummary?.text} typeChips={typeChips} amenities={amenities} />

      <PlacePhotos photos={morePhotos} name={name} panel={panel} onOpen={lightbox.open} />

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

      <PlaceReviews reviews={reviews} />
    </div>
  );

  return (
    <div>
      {titleTag}
      <PlacePhonePhoto tripId={tripId} photo={photo} name={name} place={place} />
      <div className={cn("max-lg:hidden")}>
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
                <p className={cn("text-sm text-muted-foreground", "max-lg:hidden")}>{categoryLabel(details.primaryType)}</p>
                {panel ? (
                  <h1 className="mt-1 font-display text-2xl font-semibold leading-tight max-lg:text-title max-lg:font-medium max-lg:tracking-[-0.03em]">{name}</h1>
                ) : (
                  <WordReveal text={name} delay={0.18} className="mt-1 font-display text-4xl leading-tight max-lg:text-title max-lg:tracking-[-0.03em]" />
                )}
              </div>
              {!panel && <div className="mt-4 max-w-sm shrink-0 sm:mt-2 sm:w-64">{asideAction}</div>}
            </div>
            <PlacePhoneSummary details={details} city={city} price={price} openNow={openNow} todayHours={todayHours} />
            <p className={cn("mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground", "max-lg:hidden")}>
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

        {place && (
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
