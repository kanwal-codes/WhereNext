"use client";

import { use } from "react";
import Link from "next/link";
import {
  Accessibility,
  ArrowLeft,
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
} from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { Hero } from "@/components/Hero";
import { NearbyRecommendations } from "@/components/NearbyRecommendations";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { usePlaceDetails } from "@/features/places/application/usePlaceDetails";
import { businessStatusLabel, categoryLabel, photoProxyUrl, priceLabel, secondaryTypes } from "@/lib/places-ui";

/** Rough "City, Country" from a Google formatted address. */
function cityFrom(address: string | undefined): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.slice(-2).join(", ");
}

export default function PlaceDetailPage({ params }: { params: Promise<{ placeId: string }> }) {
  const { tripId, data } = useTripData();
  const { placeId } = use(params);

  const initiallySaved = (data?.savedPlaces ?? []).some((s) => {
    const p = (s as { places?: { provider_id?: string } }).places;
    return p?.provider_id === placeId;
  });
  const { details, freshness, state, saved, busy, notice, toggleSave, addToItinerary } = usePlaceDetails(tripId, placeId, { initiallySaved });

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        <p className="mt-3">Loading place…</p>
      </div>
    );
  }

  if (state === "error" || !details) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <Link href={`/trips/${tripId}/discover`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Discover
        </Link>
        <h1 className="mt-6 font-display text-2xl">Place details are unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">The provider returned nothing for this place right now. Try again from Discover.</p>
      </div>
    );
  }

  const name = details.displayName?.text ?? "Place";
  const photo = photoProxyUrl(tripId, details.photos?.[0]?.name);
  const morePhotos = (details.photos ?? [])
    .slice(1)
    .map((p) => photoProxyUrl(tripId, p.name))
    .filter((u): u is string => Boolean(u));
  const hours = details.regularOpeningHours?.weekdayDescriptions ?? [];
  const price = priceLabel(details.priceLevel);
  const status = businessStatusLabel(details.businessStatus);
  const typeChips = secondaryTypes(details.primaryType, details.types);
  const a11y = details.accessibilityOptions;
  const wheelchair = Boolean(a11y && (a11y.wheelchairAccessibleEntrance || a11y.wheelchairAccessibleParking || a11y.wheelchairAccessibleRestroom || a11y.wheelchairAccessibleSeating));
  const reviews = (details.reviews ?? []).filter((r) => r.text?.text || r.originalText?.text).slice(0, 4);
  const city = cityFrom(details.formattedAddress);

  return (
    <div>
      <Hero image={photo ?? "/design/place-neighbourhood.jpg"} alt={name} className="h-[38vh] min-h-[240px] sm:h-[46vh] sm:max-h-[420px]">
        <Link
          href={`/trips/${tripId}/discover`}
          className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/85 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-background"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Discover
        </Link>
      </Hero>

      <div className="mx-auto max-w-5xl px-5 pb-14 sm:px-8">
        <Reveal>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 pt-7">
            <div className="min-w-0">
              <span className="eyebrow">{categoryLabel(details.primaryType)}</span>
              <WordReveal text={name} delay={0.18} className="mt-2 font-display text-4xl leading-tight" />
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
            </div>
          </div>
        </Reveal>

        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
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
                      : `Google Places has no editorial description for this ${categoryLabel(details.primaryType).toLowerCase()}.`}
                  </p>
                )}
                {typeChips.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {typeChips.map((t) => (
                      <span key={t} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground capitalize">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            </Reveal>

            {morePhotos.length > 0 && (
              <Reveal delay={0.08}>
                <section>
                  <h2 className="font-display text-xl">Photos</h2>
                  <div className="mt-3 -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-slim px-5 pb-1 sm:mx-0 sm:px-0">
                    {morePhotos.map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
                      <img
                        key={src}
                        src={src}
                        alt={name}
                        loading="lazy"
                        width={288}
                        height={192}
                        className="h-44 w-72 shrink-0 snap-start rounded-2xl border border-border object-cover"
                      />
                    ))}
                  </div>
                </section>
              </Reveal>
            )}

            <Reveal delay={0.1}>
              <Link href={`/trips/${tripId}/chat`} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-accent">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="eyebrow">Why this may fit your trip</span>
                  <span className="mt-1 block text-sm leading-[1.75]">
                    Ask the assistant — it weighs {name} against your budget, pace and the places you&rsquo;ve saved.
                  </span>
                </span>
              </Link>
            </Reveal>

            {reviews.length > 0 && (
              <Reveal delay={0.12}>
                <section>
                  <h2 className="font-display text-xl">What people say</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {reviews.map((r, i) => (
                      <figure key={i} className="rounded-2xl border border-border bg-card p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {typeof r.rating === "number" && (
                            <span className="inline-flex items-center gap-1 text-foreground">
                              <Star className="h-3 w-3 fill-current text-coral" /> {r.rating}
                            </span>
                          )}
                          <span className="truncate">{r.authorAttribution?.displayName ?? "Google user"}</span>
                          {r.relativePublishTimeDescription && <span>· {r.relativePublishTimeDescription}</span>}
                        </div>
                        <blockquote className="mt-1.5 line-clamp-5 text-sm leading-relaxed text-ink-soft">
                          {r.text?.text || r.originalText?.text}
                        </blockquote>
                      </figure>
                    ))}
                  </div>
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

          <Reveal delay={0.1}>
            <aside className="space-y-4 lg:sticky lg:top-8">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <button
                  type="button"
                  onClick={() => void toggleSave()}
                  disabled={busy}
                  className={
                    "flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-transform hover:scale-[1.02] disabled:opacity-60 " +
                    (saved ? "border border-leaf/30 bg-leaf-soft text-leaf" : "bg-primary text-primary-foreground")
                  }
                >
                  {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  {saved ? "On the trip" : "Add to trip"}
                </button>
                <button
                  type="button"
                  onClick={() => void addToItinerary()}
                  disabled={busy}
                  className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <CalendarPlus className="h-4 w-4" /> Add to itinerary
                </button>
                {notice && <p className="mt-2 text-center text-xs text-muted-foreground">{notice}</p>}
              </div>

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
                        <a href={details.websiteUri} target="_blank" rel="noreferrer noopener" className="truncate hover:text-primary">
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
                </div>
              )}

              <div className="rounded-2xl border border-dashed border-border p-5">
                <p className="eyebrow">Where this came from</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">Google Places</p>
                {freshness && <p className="mt-1 text-xs text-muted-foreground">Checked {freshness}</p>}
                {details.googleMapsUri && (
                  <a href={details.googleMapsUri} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                    Open in Google Maps <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </div>
            </aside>
          </Reveal>
        </div>

        <NearbyRecommendations tripId={tripId} excludeId={placeId} anchorName={name} cityHint={city} />
      </div>
    </div>
  );
}
