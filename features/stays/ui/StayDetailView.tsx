"use client";

import { hotelPhotoSrc } from "@/lib/hotel-photo";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Globe, LogIn, LogOut, MapPin, MessageCircle, Navigation, Phone, Star } from "lucide-react";
import { Hero } from "@/components/Hero";
import { useTripPanelMaybe } from "@/components/TripPanelProvider";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { QuickActions, ShowMore } from "@/components/DetailKit";
import { BackLink } from "@/components/BackLink";
import { NearbyEvents } from "@/components/NearbyEvents";
import { NearbyStays } from "@/features/stays/ui/NearbyStays";
import { NearbyRecommendations } from "@/components/NearbyRecommendations";
import { PanelError, PanelLoading, PANEL_PAD, PANEL_HERO } from "@/components/PanelStates";
import { Badge } from "@/features/conversation/ui/blocks/ui";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { PhotoLightbox, usePhotoLightbox } from "@/components/PhotoLightbox";
import { useStayDetails } from "@/features/stays/application/useStayDetails";
import { RoomsSection } from "@/features/stays/ui/StayRooms";
import { dedupeFacilities, directionsUrl, groupFacilities, headlineFacilities, reviewDigest, reviewerLine } from "@/features/stays/domain/stay-view";
import { StayNearby, StayThemes, WhereToBook } from "./GoogleStayParts";
import { useDocumentTitle } from "@/lib/use-document-title";
import { askAssistantHref } from "@/lib/places-ui";
import { relativeDate } from "@/lib/relative-time";
import { cn, safeHref } from "@/lib/utils";
import { displayClockTime } from "@/lib/application/clock-time";
import { PHONE_V2 } from "@/lib/phone-v2";

// Stable reference so the memos below don't see a "new" empty array (and recompute for
// nothing) on every render for a hotel with no facilities yet.
const NO_FACILITIES: string[] = [];

/**
 * The full hotel detail — same content and styling everywhere. `variant="page"`
 * is `/stay/[id]`; `variant="panel"` is the chat side rail (one column, no back-link).
 */
/** One of the two arrival boxes on a stay: what it is, and the time. */
function StayTime({ icon: Icon, label, note, time }: { icon: React.ComponentType<{ className?: string }>; label: string; note: string; time: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5 shadow-soft">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="size-3.5" aria-hidden />{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5"><span className="text-xs text-muted-foreground">{note}</span><span className="font-display text-xl leading-none font-medium tracking-[-0.02em] tabular-nums">{time}</span></p>
    </div>
  );
}

export function StayDetailView({
  tripId,
  hotelId,
  checkin,
  checkout,
  adults,
  seedName,
  variant = "page",
  onAsk,
}: {
  tripId: string;
  hotelId: string;
  checkin?: string;
  checkout?: string;
  /** Guests the prices are for, when the search that opened this had a number. */
  adults?: number;
  /** The name the card already showed: used until (or in place of) the hotel's own details, so the page never says just "Hotel". */
  seedName?: string;
  variant?: "page" | "panel";
  /** Panel only: hands a question to the chat already open beside this panel, instead of the page's "ask Roam" link navigating away from nowhere. */
  onAsk?: (prompt: string) => void;
}) {
  const panel = variant === "panel";
  const panelCtx = useTripPanelMaybe();
  const ask = (prompt: string) => {
    onAsk?.(prompt);
    panelCtx?.closePanel();
  };
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [amenityGroupOpen, setAmenityGroupOpen] = useState<string | null>(null);
  const lightbox = usePhotoLightbox();
  const [deadPhotos, setDeadPhotos] = useState<string[]>([]);
  const s = useStayDetails(tripId, hotelId, { checkin, checkout, adults });
  const titleTag = useDocumentTitle(panel ? null : s.hotel?.name ?? "Stay");

  // Derived from `s.hotel`/`s.reviews` alone — memoized (and computed before the loading/error
  // early returns below, so the hook order stays fixed) so toggling `amenityGroupOpen` or
  // `reviewsOpen` doesn't re-run the facility classification and review averaging on every render.
  const facilities = s.hotel?.facilities ?? NO_FACILITIES;
  const groupedFacilities = useMemo(() => groupFacilities(facilities), [facilities]);
  const importantFacilities = useMemo(() => headlineFacilities(facilities), [facilities]);
  const importantSet = useMemo(() => new Set(importantFacilities), [importantFacilities]);
  const { ratedCount, readable, score: reviewScore } = useMemo(() => reviewDigest(s.reviews), [s.reviews]);

  const pad = panel ? PANEL_PAD : "mx-auto max-w-5xl px-5 pb-14 sm:px-8";

  if (s.state === "loading") return <PanelLoading what="this hotel" panel={panel} />;

  if (s.state === "error") {
    return (
      <>
        {!panel && <div className="mx-auto max-w-5xl px-5 pt-6 sm:px-8"><BackLink fallback={`/trips/${tripId}/stay`} label="Back" /></div>}
        <PanelError what="this hotel" panel={panel} onRetry={s.retry} />
      </>
    );
  }

  const hotel = s.hotel;
  const name = hotel?.name ?? seedName ?? "Hotel";
  // Proxied: hotel photo hosts refuse many direct browser loads (lib/hotel-photo.ts). A photo that fails to load (a dead link) is
  // dropped, so the strip never shows an empty frame and the lightbox never opens on one.
  const images = [...new Set((hotel?.images ?? []).map((src) => hotelPhotoSrc(src)))].filter((src) => !deadPhotos.includes(src));

  const directionsHref = directionsUrl(hotel, name);

  const body = (
    <div className="min-w-0 space-y-10">
      <Reveal delay={0.02}>
        <div className="space-y-3">
          {/* The guest score is on the photo already; what the page adds is when you can arrive and when you leave. */}
          {(hotel?.checkinFrom || hotel?.checkout) && (
            <div className="grid grid-cols-2 gap-3">
              {hotel?.checkinFrom && <StayTime icon={LogIn} label="Check-in" note="from" time={displayClockTime(hotel.checkinFrom)} />}
              {hotel?.checkout && <StayTime icon={LogOut} label="Check-out" note="by" time={displayClockTime(hotel.checkout)} />}
            </div>
          )}
          <QuickActions actions={[
            { icon: Navigation, label: "Directions", href: directionsHref, external: true },
            s.phone && { icon: Phone, label: "Call", href: `tel:${s.phone.replace(/\s/g, "")}`, hint: s.phone },
            s.website && safeHref(s.website) && { icon: Globe, label: "Website", href: safeHref(s.website)!, external: true },
          ]} />
        </div>
      </Reveal>

      <Reveal delay={0.04}>
        {s.google ? <WhereToBook s={s} hotelId={hotelId} /> : <RoomsSection s={s} hotelId={hotelId} />}
      </Reveal>

      <Reveal delay={0.06}>
        <section>
          <DetailSectionHeading>The stay</DetailSectionHeading>
          {hotel?.description ? (
            <p className="mt-2 text-body leading-relaxed text-ink-soft">{hotel.description}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No description available for this hotel yet.</p>
          )}
        </section>
      </Reveal>

      {images.length > 1 && (
        <Reveal delay={0.08}>
          <section>
            <DetailSectionHeading>Photos</DetailSectionHeading>
            <div className={cn("mt-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain no-scrollbar pb-14 -mb-12 pt-2", panel ? "-mr-4 pr-4" : "-mx-5 px-5 sm:mx-0 sm:px-0")}>
              {images.slice(1).map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => lightbox.open(i)}
                  aria-label={`Expand photo ${i + 1} of ${name}`}
                  className="shrink-0 snap-start rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI */}
                  <img src={src} alt="" loading="lazy" width={288} height={192} onError={() => setDeadPhotos((current) => [...current, src])} className="h-44 w-72 rounded-2xl border border-border object-cover transition-opacity hover:opacity-90" />
                </button>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {(hotel?.facilities.length ?? 0) > 0 && (
        <Reveal delay={0.1}>
          <section>
            <DetailSectionHeading>What&rsquo;s included</DetailSectionHeading>
            {importantFacilities.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {dedupeFacilities(importantFacilities).map((facility) => <Badge key={facility}>{facility}</Badge>)}
              </div>
            ) : <p className="mt-3 text-sm text-muted-foreground">Amenities will appear here when the hotel provides them.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(groupedFacilities).map(([group, facilities]) => {
                const remaining = dedupeFacilities(facilities.filter((facility) => !importantSet.has(facility)));
                if (!remaining.length) return null;
                const open = amenityGroupOpen === group;
                return (
                  <div key={group}>
                    <button type="button" onClick={() => setAmenityGroupOpen(open ? null : group)} aria-expanded={open} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors", open ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground")}>
                      {group} <span className="opacity-70">{remaining.length}</span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                    </button>
                    {open && <div className="mt-2 flex flex-wrap gap-2 rounded-2xl bg-muted/35 p-3">{remaining.map((facility) => <Badge key={facility} className="bg-card">{facility}</Badge>)}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        </Reveal>
      )}

      {s.nearby.length > 0 && (
        <Reveal delay={0.12}>
          <StayNearby nearby={s.nearby} />
        </Reveal>
      )}

      {(s.sentiment || s.themes.length > 0 || s.reviews.length > 0) && (
        <Reveal delay={0.14}>
          <section>
            <DetailSectionHeading>What guests say</DetailSectionHeading>
            {/* One card: the score and the one-line verdict across the top, what guests mention beneath. */}
            <div className="mt-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
              {(reviewScore !== null || s.sentiment) && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                  {reviewScore !== null && (
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-display text-4xl leading-none tabular-nums tracking-[-0.03em]">{reviewScore.toFixed(1)}</span>
                      <span className="text-xs leading-snug text-muted-foreground">out of 10<br />from {ratedCount} recent review{ratedCount === 1 ? "" : "s"}</span>
                    </div>
                  )}
                  {s.sentiment && <p className={cn("text-sm leading-relaxed text-ink-soft text-pretty", reviewScore !== null && "sm:border-l sm:border-border sm:pl-6")}>{s.sentiment}</p>}
                </div>
              )}
              {s.themes.length > 0 && (
                <div className={cn((reviewScore !== null || s.sentiment) && "mt-3.5 border-t border-border pt-3.5")}>
                  <p className="eyebrow mb-2.5">Guests mention · % who liked it</p>
                  <StayThemes themes={s.themes} />
                </div>
              )}
            </div>
            {readable.length > 0 && (
              <>
              {PHONE_V2 && (
                // On a phone the reviews are a row of short cards to swipe through, not a long stack to scroll past.
                <div className="-mx-4 mt-3 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 no-scrollbar scroll-px-4 lg:hidden">
                  {readable.slice(0, 8).map((r, i) => {
                    const who = reviewerLine(r, s.google);
                    const body = r.positives || r.negatives || r.text;
                    return (
                      <figure key={i} className="flex w-[16.5rem] shrink-0 snap-start flex-col rounded-2xl border border-border bg-card p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          {typeof r.rating === "number" ? (
                            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary px-2.5 text-xs font-semibold tabular-nums"><Star className="size-3 fill-current text-coral" aria-hidden />{r.rating.toFixed(1)}</span>
                          ) : <span className="text-xs font-semibold">Guest note</span>}
                          {r.date && <span className="text-xs text-muted-foreground">{relativeDate(r.date)}</span>}
                        </div>
                        {r.headline && <p className="mt-2.5 line-clamp-1 text-sm font-medium leading-5">{r.headline}</p>}
                        {body && <p className={cn("text-sm leading-5 text-ink-soft", r.headline ? "mt-1 line-clamp-2" : "mt-2.5 line-clamp-3")}>{body}</p>}
                        {who && <figcaption className="mt-auto truncate pt-2.5 text-xs text-muted-foreground">{who}</figcaption>}
                      </figure>
                    );
                  })}
                </div>
              )}
              <div className={cn("mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4", PHONE_V2 && "max-lg:hidden")}>
                {(reviewsOpen ? readable : readable.slice(0, 3)).map((r, i) => (
                  <figure key={i} className="py-3.5 first:pt-3 last:pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold tabular-nums">{typeof r.rating === "number" ? `${r.rating.toFixed(1)}/10` : "Guest note"}</span>
                      {r.date && <span className="text-xs text-muted-foreground">{relativeDate(r.date)}</span>}
                    </div>
                    {r.headline && <p className="mt-2 text-sm font-medium leading-5">{r.headline}</p>}
                    {r.positives && <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-ink-soft"><span className="font-medium text-positive">Liked </span>{r.positives}</p>}
                    {r.negatives && <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink-soft"><span className="font-medium text-caution">Didn’t like </span>{r.negatives}</p>}
                    {!r.positives && !r.negatives && r.text && <p className="mt-1.5 line-clamp-3 text-sm leading-5 text-ink-soft">{r.text}</p>}
                    {(r.travellerType || r.country || (s.google && r.name)) && <figcaption className="mt-3 text-xs text-muted-foreground">{reviewerLine(r, s.google)}</figcaption>}
                  </figure>
                ))}
              </div>
              {readable.length > 3 && <div className={cn("mt-3", PHONE_V2 && "max-lg:hidden")}><ShowMore open={reviewsOpen} onToggle={() => setReviewsOpen((v) => !v)} more={`Show all ${readable.length} reviews`} less="Show fewer reviews" /></div>}
              </>
            )}
          </section>
        </Reveal>
      )}
    </div>
  );

  // The dates form drives the room rates below it, so it stays directly above the
  // content. Everything else is context that reads better after it.
  const asideSecondary = (
    <Link
      href={askAssistantHref(tripId, { name, address: [hotel?.address, hotel?.city].filter(Boolean).join(", "), kind: "stay" })}
      className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-sm transition-colors hover:bg-accent"
    >
      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>
        <span className="block text-sm font-medium">Does {name} fit your trip?</span>
        <span className="mt-1 block leading-relaxed text-muted-foreground">Roam checks it against your budget and the area you want. The question is written for you.</span>
      </span>
    </Link>
  );

  // Page view keeps the single sticky sidebar; the panel splits it around the body.
  const aside = <div className={cn("min-w-0 space-y-4", !panel && "lg:sticky lg:top-8")}>{asideSecondary}</div>;

  return (
    <div>
      {titleTag}
      <Hero
        image="/design/place-hotel.jpg"
        coverImages={images}
        onCoverError={(src) => setDeadPhotos((current) => (current.includes(src) ? current : [...current, src]))}
        coverAlt={name}
        alt=""
        plain
        kenBurns={!panel}
        surface={panel}
        ratingBadge={typeof hotel?.rating === "number" ? <><Star className="size-3.5 fill-current text-coral-soft" aria-hidden /> {hotel.rating.toFixed(1)}<span className="opacity-70">/10</span></> : undefined}
        className={cn(panel ? PANEL_HERO : "h-[38vh] min-h-[240px] sm:h-[46vh] sm:max-h-[420px]")}
      >
        {!panel && <BackLink fallback={`/trips/${tripId}/stay`} label="Back" className="absolute left-4 top-4 border-transparent bg-white text-ink hover:bg-white" />}
      </Hero>

      <div className={pad}>
        <Reveal>
          <div className="pt-6">
            <p className="text-sm text-muted-foreground">{typeof hotel?.stars === "number" ? `Hotel · ${hotel.stars}-star` : "Hotel"}</p>
            {panel ? (
              <h1 className="mt-2 max-w-2xl font-display text-2xl font-semibold leading-tight">{name}</h1>
            ) : (
              <WordReveal text={name} delay={0.18} className="mt-2 max-w-2xl font-display text-4xl leading-tight" />
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {hotel?.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {[hotel.address, hotel.city, hotel.country].filter(Boolean).join(", ")}
                </span>
              )}
            </p>
          </div>
        </Reveal>

        {panel ? (
          <div className="mt-6 space-y-8">
            {body}
            {onAsk && (
              <Reveal delay={0.03}>
                <button
                  type="button"
                  onClick={() => ask(`Does ${name} fit my trip — my budget, pace, and what I've saved so far?\n${name}${hotel?.address ? ` — ${hotel.address}` : ""}`)}
                  className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left text-sm transition-colors hover:bg-accent"
                >
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <span className="block text-sm font-medium">Does {name} fit your trip?</span>
                    <span className="mt-1 block leading-relaxed text-muted-foreground">Ask Roam — it weighs this against your budget and the area you want.</span>
                  </span>
                </button>
              </Reveal>
            )}
            <NearbyStays
              tripId={tripId}
              currentHotelId={hotelId}
              location={hotel?.city ?? hotel?.address ?? ""}
              checkin={s.checkin}
              checkout={s.checkout}
              anchor={hotel?.latitude != null && hotel?.longitude != null ? { lat: hotel.latitude, lng: hotel.longitude } : null}
              currency={s.currency}
            />
            <NearbyRecommendations tripId={tripId} excludeId={hotelId} anchorName={name} cityHint={hotel?.city ?? hotel?.address ?? ""} primaryType="hotel" types={["hotel", "lodging"]} lat={hotel?.latitude ?? undefined} lng={hotel?.longitude ?? undefined} />
          </div>
        ) : (
          <>
            <div className="mt-7 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              {body}
              <Reveal delay={0.1}>{aside}</Reveal>
            </div>
            <NearbyStays
              tripId={tripId}
              currentHotelId={hotelId}
              location={hotel?.city ?? hotel?.address ?? ""}
              checkin={s.checkin}
              checkout={s.checkout}
              anchor={hotel?.latitude != null && hotel?.longitude != null ? { lat: hotel.latitude, lng: hotel.longitude } : null}
              currency={s.currency}
            />
            <NearbyRecommendations tripId={tripId} excludeId={hotelId} anchorName={name} cityHint={hotel?.city ?? hotel?.address ?? ""} primaryType="hotel" types={["hotel", "lodging"]} lat={hotel?.latitude ?? undefined} lng={hotel?.longitude ?? undefined} />
          </>
        )}

        {(hotel?.city || hotel?.address) && (
          <div className="mt-12 border-t border-border pt-8">
            <NearbyEvents tripId={tripId} location={hotel?.city ?? hotel?.address ?? ""} />
          </div>
        )}
      </div>

      <PhotoLightbox photos={images.slice(1)} index={lightbox.index} onIndexChange={lightbox.open} onClose={lightbox.close} alt={name} />
    </div>
  );
}
