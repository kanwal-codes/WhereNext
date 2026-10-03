"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, MapPin, MessageCircle, Navigation, Star, Users } from "lucide-react";
import { Hero } from "@/components/Hero";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { FactStrip, QuickActions, ShowMore } from "@/components/DetailKit";
import { BackLink } from "@/components/BackLink";
import { NearbyEvents } from "@/components/NearbyEvents";
import { NearbyStays } from "@/features/stays/ui/NearbyStays";
import { NearbyRecommendations } from "@/components/NearbyRecommendations";
import { PanelError, PanelLoading, PANEL_PAD, PANEL_HERO } from "@/components/PanelStates";
import { Badge, Notice, money, prettyDate, type as T } from "@/features/conversation/ui/blocks/ui";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { PhotoLightbox, usePhotoLightbox } from "@/components/PhotoLightbox";
import { useStayDetails } from "@/features/stays/application/useStayDetails";
import { useDocumentTitle } from "@/lib/use-document-title";
import { askAssistantHref } from "@/lib/places-ui";
import { relativeDate } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { displayClockTime } from "@/lib/application/clock-time";

// Stable reference so the memos below don't see a "new" empty array (and recompute for
// nothing) on every render for a hotel with no facilities yet.
const NO_FACILITIES: string[] = [];

const facilityGroup = (facility: string) => {
  const value = facility.toLowerCase();
  if (/restaurant|bar|breakfast|coffee|room service|menu|currency/.test(value)) return "Food & drink";
  if (/accessible|lift|elevator|wheelchair|non-smoking|heating|air conditioning|wifi|wi-fi|internet|family/.test(value)) return "Comfort";
  if (/front desk|concierge|housekeeping|luggage|laundry|tour|car hire|parking|transport|meeting|banquet|fax|photocopy/.test(value)) return "Services";
  return "On site";
};

/** Rooms and rates for the dates: the price, the terms, and the one action a stay panel exists for. */
function RoomsSection({ s, hotelId }: { s: ReturnType<typeof useStayDetails>; hotelId: string }) {
  const [all, setAll] = useState(false);
  const rooms = s.rooms ?? [];
  const shown = all ? rooms : rooms.slice(0, 3);
  const locked = s.lockedStay && s.lockedStay.hotelId === hotelId ? s.lockedStay : null;
  const dates = s.checkin && s.checkout ? `${prettyDate(s.checkin)} – ${prettyDate(s.checkout)}` : null;
  return (
    <section aria-labelledby="stay-rooms" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <DetailSectionHeading id="stay-rooms">Rooms &amp; rates</DetailSectionHeading>
        {dates && <p className={cn(T.meta, "tabular-nums")}>{dates}{s.nights ? ` · ${s.nights} night${s.nights === 1 ? "" : "s"}` : ""}</p>}
      </div>
      {s.assumedDates && <Notice tone="caution">These are example dates — set your real dates to see accurate rates.</Notice>}
      {s.roomsUnavailable || rooms.length === 0 ? (
        <Notice>No rates came back for these dates. The hotel may be full, or the rates provider didn’t answer — try different dates.</Notice>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {shown.map((room, i) => {
              const isLocked = Boolean(locked && (locked.rateId ? locked.rateId === room.rateId : locked.roomName === room.name));
              return (
                <li key={room.rateId ?? room.offerId ?? `${room.name}-${i}`} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <p className={cn(T.body, "font-medium")}>{room.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {room.boardName && <Badge>{room.boardName}</Badge>}
                        {room.refundable ? (
                          <Badge tone="positive" icon={Check}>{room.cancelBefore ? `Free cancellation until ${prettyDate(room.cancelBefore.slice(0, 10))}` : "Refundable"}</Badge>
                        ) : (
                          <Badge>Non-refundable</Badge>
                        )}
                        {room.maxOccupancy ? <Badge icon={Users}>{room.maxOccupancy} guest{room.maxOccupancy === 1 ? "" : "s"}</Badge> : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-semibold leading-tight tabular-nums">{money(room.nightlyAmount, room.currency)}<span className={cn(T.meta, "font-sans font-normal")}> / night</span></p>
                      <p className={cn(T.meta, "tabular-nums")}>{money(room.totalAmount, room.currency)} total{room.taxesAndFees ? ` · incl. ${money(room.taxesAndFees, room.currency)} taxes` : ""}</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {isLocked ? (
                      <Badge tone="positive" icon={Check}>Your stay</Badge>
                    ) : (
                      <button type="button" className="btn-primary-sm" disabled={s.busy} onClick={() => void s.lockRoom(room)}>
                        {s.busy ? "Saving…" : "Choose this room"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {rooms.length > 3 && <ShowMore open={all} onToggle={() => setAll((v) => !v)} more={`Show all ${rooms.length} rooms`} less="Show fewer rooms" />}
          <Notice>Taxes and fees can change at checkout — confirm the total with the hotel when you book.</Notice>
        </>
      )}
    </section>
  );
}

/**
 * The full hotel detail — same content and styling everywhere. `variant="page"`
 * is `/stay/[id]`; `variant="panel"` is the chat side rail (one column, no back-link).
 */
/** "family_with_children" -> "Family with children". */
const prettyTraveller = (t?: string | null) => (t ? t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");
const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
/** "se" -> "Sweden"; anything that is not a two-letter code is left as it is. */
const prettyCountry = (c?: string | null) => {
  if (!c) return "";
  if (!/^[a-z]{2}$/i.test(c)) return c;
  try { return regionNames?.of(c.toUpperCase()) ?? c.toUpperCase(); } catch { return c.toUpperCase(); }
};
/** "WiFi available" and "Free WiFi" are one fact: keep the first of each. */
const facilityKey = (f: string) => f.toLowerCase().replace(/\b(?:free|available|complimentary)\b/g, "").replace(/[^a-z0-9]/g, "");
const dedupeFacilities = (list: string[]) => list.filter((f, i) => list.findIndex((g) => facilityKey(g) === facilityKey(f)) === i);

export function StayDetailView({
  tripId,
  hotelId,
  checkin,
  checkout,
  seedName,
  variant = "page",
}: {
  tripId: string;
  hotelId: string;
  checkin?: string;
  checkout?: string;
  /** The name the card already showed: used until (or in place of) the hotel's own details, so the page never says just "Hotel". */
  seedName?: string;
  variant?: "page" | "panel";
}) {
  const panel = variant === "panel";
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [amenityGroupOpen, setAmenityGroupOpen] = useState<string | null>(null);
  const lightbox = usePhotoLightbox();
  const s = useStayDetails(tripId, hotelId, { checkin, checkout });
  const titleTag = useDocumentTitle(panel ? null : s.hotel?.name ?? "Stay");

  // Derived from `s.hotel`/`s.reviews` alone — memoized (and computed before the loading/error
  // early returns below, so the hook order stays fixed) so toggling `amenityGroupOpen` or
  // `reviewsOpen` doesn't re-run the facility classification and review averaging on every render.
  const facilities = s.hotel?.facilities ?? NO_FACILITIES;
  const groupedFacilities = useMemo(() => facilities.slice(0, 32).reduce<Record<string, string[]>>((groups, facility) => {
    const group = facilityGroup(facility);
    (groups[group] ??= []).push(facility);
    return groups;
  }, {}), [facilities]);
  const importantFacilities = useMemo(
    () => facilities.filter((facility) => /wifi|wi-fi|internet|air conditioning|heating|non-smoking|family|front desk|restaurant|room service|parking|breakfast/i.test(facility)).slice(0, 8),
    [facilities],
  );
  const importantSet = useMemo(() => new Set(importantFacilities), [importantFacilities]);
  const ratedReviews = useMemo(() => s.reviews.filter((review) => typeof review.rating === "number"), [s.reviews]);
  // A score with nothing written next to it tells the reader nothing.
  const readable = s.reviews.filter((r) => r.headline || r.positives || r.negatives || r.text);
  const reviewScore = useMemo(
    () => (ratedReviews.length ? ratedReviews.reduce((total, review) => total + (review.rating ?? 0), 0) / ratedReviews.length : null),
    [ratedReviews],
  );

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
  const images = hotel?.images ?? [];

  const directionsHref = hotel?.latitude != null && hotel?.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${hotel.latitude},${hotel.longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([name, hotel?.address, hotel?.city].filter(Boolean).join(", "))}`;

  const body = (
    <div className="min-w-0 space-y-10">
      <Reveal delay={0.02}>
        <div className="space-y-3">
          <FactStrip
            facts={[
              typeof hotel?.rating === "number" && { label: "Guests", value: <><Star className="size-4 fill-current text-coral" aria-hidden /> {hotel.rating}</>, note: "out of 10" },
              typeof hotel?.stars === "number" && { label: "Class", value: `${hotel.stars}-star`, note: "hotel" },
              hotel?.checkinFrom && { label: "Check-in", value: displayClockTime(hotel.checkinFrom), note: hotel.checkout ? `Out by ${displayClockTime(hotel.checkout)}` : undefined },
            ]}
          />
          <QuickActions actions={[{ icon: Navigation, label: "Directions", href: directionsHref, external: true }]} />
        </div>
      </Reveal>

      <Reveal delay={0.04}>
        <RoomsSection s={s} hotelId={hotelId} />
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
            <div className={cn("mt-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain no-scrollbar pb-9 -mb-8 pt-2", panel ? "-mr-4 pr-4" : "-mx-5 px-5 sm:mx-0 sm:px-0")}>
              {images.slice(1).map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => lightbox.open(i)}
                  aria-label={`Expand photo ${i + 1} of ${name}`}
                  className="shrink-0 snap-start rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI */}
                  <img src={src} alt="" loading="lazy" width={288} height={192} className="h-44 w-72 rounded-2xl border border-border object-cover transition-opacity hover:opacity-90" />
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

      {(s.sentiment || s.reviews.length > 0) && (
        <Reveal delay={0.14}>
          <section>
            <DetailSectionHeading>What guests say</DetailSectionHeading>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
              {reviewScore !== null && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-medium">Recent reviews</p>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="font-display text-3xl leading-none">{reviewScore.toFixed(1)}</span>
                    <span className="pb-0.5 text-xs text-muted-foreground">/ 10</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Average of the last {ratedReviews.length} review{ratedReviews.length === 1 ? "" : "s"}</p>
                </div>
              )}
              {s.sentiment && (
                <div className={cn("rounded-2xl border border-border bg-card p-4", reviewScore === null && "sm:col-span-2")}>
                  <p className="text-sm font-medium">What guests keep mentioning</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.sentiment}</p>
                </div>
              )}
            </div>
            {readable.length > 0 && (
              <>
              <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4">
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
                    {(r.travellerType || r.country) && <figcaption className="mt-3 text-xs text-muted-foreground">{[prettyTraveller(r.travellerType), prettyCountry(r.country)].filter(Boolean).join(" · ")}</figcaption>}
                  </figure>
                ))}
              </div>
              {readable.length > 3 && <div className="mt-3"><ShowMore open={reviewsOpen} onToggle={() => setReviewsOpen((v) => !v)} more={`Show all ${readable.length} reviews`} less="Show fewer reviews" /></div>}
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
        image={images[0] ?? "/design/place-hotel.jpg"}
        alt={name}
        plain
        surface={panel}
        className={cn(panel ? PANEL_HERO : "h-[38vh] min-h-[240px] sm:h-[46vh] sm:max-h-[420px]")}
      >
        {!panel && <BackLink fallback={`/trips/${tripId}/stay`} label="Back" className="absolute left-4 top-4 border-white/30 bg-black/30 text-white hover:bg-black/50" />}
      </Hero>

      <div className={pad}>
        <Reveal>
          <div className="pt-6">
            <p className="text-sm text-muted-foreground">Hotel</p>
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
