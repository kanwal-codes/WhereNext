"use client";

import { useState } from "react";
import Link from "next/link";
import { BedDouble, Check, ChevronDown, Clock, MapPin, MessageCircle, Star } from "lucide-react";
import { Hero } from "@/components/Hero";
import { BackLink } from "@/components/BackLink";
import { NearbyEvents } from "@/components/NearbyEvents";
import { NearbyStays } from "@/features/stays/ui/NearbyStays";
import { NearbyRecommendations } from "@/components/NearbyRecommendations";
import { Skeleton, SkeletonLines } from "@/components/Skeleton";
import { RoomRow } from "@/components/StayPanel";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { useStayDetails } from "@/features/stays/application/useStayDetails";
import { formatMoney } from "@/lib/currency";
import { useDocumentTitle } from "@/lib/use-document-title";
import { askAssistantHref } from "@/lib/places-ui";
import type { StayRoom } from "@/packages/contracts/stay";
import { cn } from "@/lib/utils";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

type RoomFilter = "all" | "refundable" | "best-value";

const facilityGroup = (facility: string) => {
  const value = facility.toLowerCase();
  if (/restaurant|bar|breakfast|coffee|room service|menu|currency/.test(value)) return "Food & drink";
  if (/accessible|lift|elevator|wheelchair|non-smoking|heating|air conditioning|wifi|wi-fi|internet|family/.test(value)) return "Comfort";
  if (/front desk|concierge|housekeeping|luggage|laundry|tour|car hire|parking|transport|meeting|banquet|fax|photocopy/.test(value)) return "Services";
  return "On site";
};

/**
 * The full hotel detail — same content and styling everywhere. `variant="page"`
 * is `/stay/[id]`; `variant="panel"` is the chat side rail (one column, no back-link).
 */
export function StayDetailView({
  tripId,
  hotelId,
  checkin,
  checkout,
  adults,
  rooms,
  variant = "page",
  onDatesChange,
}: {
  tripId: string;
  hotelId: string;
  checkin?: string;
  checkout?: string;
  /** Party size / room count from wherever this hotel was found (a search, a chat card) — kept
   *  so the detail view's room rates match what was already searched, not the trip's defaults. */
  adults?: number;
  rooms?: number;
  variant?: "page" | "panel";
  onDatesChange?: (checkin: string, checkout: string) => void;
}) {
  const panel = variant === "panel";
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [amenityGroupOpen, setAmenityGroupOpen] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");
  const [dates, setDates] = useState({ checkin: checkin ?? "", checkout: checkout ?? "" });
  const s = useStayDetails(tripId, hotelId, { checkin: dates.checkin || undefined, checkout: dates.checkout || undefined, adults, rooms });
  const titleTag = useDocumentTitle(panel ? null : s.hotel?.name ?? "Stay");

  const [ci, setCi] = useState(checkin ?? "");
  const [co, setCo] = useState(checkout ?? "");

  const pad = panel ? "px-4 pb-8" : "mx-auto max-w-5xl px-5 pb-14 sm:px-8";

  if (s.state === "loading") {
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

  if (s.state === "error") {
    return (
      <div className={cn(pad, "pt-10")}>
        {!panel && <BackLink fallback={`/trips/${tripId}/stay`} label="Back" />}
        <h1 className="mt-6 font-display text-2xl">We couldn’t load this hotel</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong just now. Head back to the Stay tab and try again in a moment.</p>
      </div>
    );
  }

  const hotel = s.hotel;
  const name = hotel?.name ?? "Hotel";
  const images = hotel?.images ?? [];
  const isLocked = (room: StayRoom) => s.lockedStay?.hotelId === hotelId && s.lockedStay.roomName === room.name;
  const lockedHere = s.lockedStay?.hotelId === hotelId ? s.lockedStay : null;
  const roomOptions = (s.rooms ?? []).filter((room) => roomFilter !== "refundable" || room.refundable);
  const orderedRooms = roomFilter === "best-value"
    ? [...roomOptions].sort((a, b) => a.totalAmount - b.totalAmount)
    : roomOptions;
  const visibleRooms = roomsOpen ? orderedRooms : orderedRooms.slice(0, 4);
  const groupedFacilities = (hotel?.facilities ?? []).slice(0, 32).reduce<Record<string, string[]>>((groups, facility) => {
    const group = facilityGroup(facility);
    (groups[group] ??= []).push(facility);
    return groups;
  }, {});
  const importantFacilities = (hotel?.facilities ?? []).filter((facility) => /wifi|wi-fi|internet|air conditioning|heating|non-smoking|family|front desk|restaurant|room service|parking|breakfast/i.test(facility)).slice(0, 8);
  const importantSet = new Set(importantFacilities);
  const ratedReviews = s.reviews.filter((review) => typeof review.rating === "number");
  const reviewScore = ratedReviews.length
    ? ratedReviews.reduce((total, review) => total + (review.rating ?? 0), 0) / ratedReviews.length
    : null;

  const body = (
    <div className="min-w-0 space-y-10">
      <Reveal delay={0.06}>
        <section>
          <div className="flex items-center gap-3">
            <span className="h-px w-7 bg-coral" />
            <h2 className="font-display text-xl">The stay</h2>
          </div>
          {hotel?.description ? (
            <p className="mt-2 text-[15px] leading-[1.8] text-ink-soft">{hotel.description}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No description available for this hotel yet.</p>
          )}
          {(hotel?.checkinFrom || hotel?.checkout) && (
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {hotel.checkinFrom && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Check-in from {hotel.checkinFrom}
                  {hotel.checkinTo ? ` to ${hotel.checkinTo}` : ""}
                </span>
              )}
              {hotel.checkout && <span>Check-out by {hotel.checkout}</span>}
            </p>
          )}
        </section>
      </Reveal>

      {images.length > 1 && (
        <Reveal delay={0.08}>
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl">A feel for the place</h2>
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Photos</span>
            </div>
            <div className={cn("mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto no-scrollbar pb-1", panel ? "-mr-4 pr-4" : "-mx-5 px-5 sm:mx-0 sm:px-0")}>
              {images.slice(1).map((src) => (
                // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
                <img key={src} src={src} alt={name} loading="lazy" width={288} height={192} className="h-44 w-72 shrink-0 snap-start rounded-2xl border border-border object-cover" />
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {(hotel?.facilities.length ?? 0) > 0 && (
        <Reveal delay={0.1}>
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl">What&rsquo;s included</h2>
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Amenities</span>
            </div>
            <div className="mt-3 rounded-[1.5rem] border border-border/80 bg-card/60 p-4">
              <p className="text-xs leading-relaxed text-muted-foreground">The essentials for a comfortable stay.</p>
              {importantFacilities.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {importantFacilities.map((facility) => <span key={facility} className="rounded-full bg-muted px-3 py-1.5 text-xs text-ink-soft">{facility}</span>)}
                </div>
              ) : <p className="mt-3 text-sm text-muted-foreground">Amenities will appear here when the hotel provides them.</p>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(groupedFacilities).map(([group, facilities]) => {
                const remaining = facilities.filter((facility) => !importantSet.has(facility));
                if (!remaining.length) return null;
                const open = amenityGroupOpen === group;
                return (
                  <div key={group} className="w-full sm:w-auto">
                    <button type="button" onClick={() => setAmenityGroupOpen(open ? null : group)} aria-expanded={open} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors", open ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground")}>
                      {group} <span className="opacity-70">{remaining.length}</span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                    </button>
                    {open && <div className="mt-2 flex flex-wrap gap-2 rounded-2xl bg-muted/35 p-3">{remaining.map((facility) => <span key={facility} className="rounded-full bg-card px-3 py-1.5 text-xs text-ink-soft shadow-sm">{facility}</span>)}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        </Reveal>
      )}

      <Reveal delay={0.12}>
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="h-px w-7 bg-coral" />
              <h2 className="font-display text-xl">Choose your room</h2>
            </div>
            {s.checkin && (
              <p className="text-xs text-muted-foreground">
                {fmtDay(s.checkin)} → {fmtDay(s.checkout)} · {s.nights} night{s.nights === 1 ? "" : "s"}
                {s.assumedDates ? " · example dates" : ""}
              </p>
            )}
          </div>
          {s.roomsUnavailable || (s.rooms && s.rooms.length === 0) ? (
            <p className="mt-3 rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              Room rates are unavailable for these dates right now.
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(["all", "refundable", "best-value"] as RoomFilter[]).map((filter) => (
                  <button key={filter} type="button" onClick={() => { setRoomFilter(filter); setRoomsOpen(false); }} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", roomFilter === filter ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
                    {filter === "all" ? `All rooms (${s.rooms?.length ?? 0})` : filter === "refundable" ? `Refundable (${(s.rooms ?? []).filter((room) => room.refundable).length})` : "Best price"}
                  </button>
                ))}
              </div>
              {visibleRooms.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">No refundable rooms are available for these dates.</p>
              ) : (
                <div className="mt-3 space-y-2">
              {visibleRooms.map((room, i) => (
                <RoomRow key={`${room.name}-${i}`} room={room} locked={isLocked(room)} busy={s.busy} onLock={(r) => void s.lockRoom(r)} />
              ))}
                </div>
              )}
              {orderedRooms.length > 4 && (
                <button type="button" onClick={() => setRoomsOpen((open) => !open)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  {roomsOpen ? "Show fewer rooms" : `Show all ${orderedRooms.length} rooms`} <span aria-hidden="true">{roomsOpen ? "↑" : "→"}</span>
                </button>
              )}
            </>
          )}
        </section>
      </Reveal>

      {(s.sentiment || s.reviews.length > 0) && (
        <Reveal delay={0.14}>
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl">What guests say</h2>
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Recent stays</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
              {reviewScore !== null && (
                <div className="rounded-[1.5rem] border border-border/80 bg-card/75 p-4">
                  <p className="eyebrow">Guest score</p>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="font-display text-3xl leading-none">{reviewScore.toFixed(1)}</span>
                    <span className="pb-0.5 text-xs text-muted-foreground">/ 10</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Based on {ratedReviews.length} recent review{ratedReviews.length === 1 ? "" : "s"}</p>
                </div>
              )}
              {s.sentiment && (
                <div className={cn("rounded-[1.5rem] border border-border/80 bg-surface/70 p-4", reviewScore === null && "sm:col-span-2")}>
                  <p className="eyebrow">The pattern guests mention</p>
                  <p className="mt-2 text-sm leading-7 text-ink-soft">{s.sentiment}</p>
                </div>
              )}
            </div>
            {s.reviews.length > 0 && (
              <div className="mt-3 divide-y divide-border/70 rounded-[1.25rem] border border-border/80 bg-card/45 px-4">
                {(reviewsOpen ? s.reviews : s.reviews.slice(0, 3)).map((r, i) => (
                  <figure key={i} className="py-3.5 first:pt-3 last:pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-coral/10 px-2.5 py-1 text-xs font-medium text-foreground">
                        <Star className="h-3 w-3 fill-current text-coral" aria-hidden="true" />
                        {typeof r.rating === "number" ? `${r.rating.toFixed(1)}/10` : "Guest note"}
                      </span>
                      {r.date && <span className="text-xs text-muted-foreground">{r.date.slice(0, 10)}</span>}
                    </div>
                    {r.headline && <p className="mt-2 text-sm font-medium leading-5">{r.headline}</p>}
                    {r.positives && <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-ink-soft"><span className="font-medium text-leaf">Liked </span>{r.positives}</p>}
                    {r.negatives && <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink-soft"><span className="font-medium text-muted-foreground">Noted </span>{r.negatives}</p>}
                    {!r.positives && !r.negatives && r.text && <p className="mt-1.5 line-clamp-3 text-sm leading-5 text-ink-soft">{r.text}</p>}
                    {(r.travellerType || r.country) && <figcaption className="mt-3 text-xs text-muted-foreground">{[r.travellerType, r.country].filter(Boolean).join(" · ")}</figcaption>}
                  </figure>
                ))}
                {s.reviews.length > 3 && (
                  <button type="button" onClick={() => setReviewsOpen((v) => !v)} className="mt-3 text-xs font-medium text-primary">
                    {reviewsOpen ? "Show fewer reviews" : `Show all ${s.reviews.length} reviews`}
                  </button>
                )}
              </div>
            )}
          </section>
        </Reveal>
      )}
    </div>
  );

  // The dates form drives the room rates below it, so it stays directly above the
  // content. Everything else is context that reads better after it.
  const datesForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setDates({ checkin: ci, checkout: co });
        onDatesChange?.(ci, co);
      }}
      className="rounded-[1.5rem] border border-border/80 bg-card/75 p-4 shadow-[0_12px_40px_-28px_rgba(20,24,32,0.55)] backdrop-blur-sm sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-coral">Plan your stay</p>
          <p className="mt-1 font-display text-lg">Your dates</p>
        </div>
        <span className="rounded-full bg-coral/10 px-2.5 py-1 text-[11px] font-medium text-coral">For your dates</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Check-in
          <input type="date" value={ci} onChange={(e) => setCi(e.target.value)} className="input-field mt-1.5 [color-scheme:light_dark]" />
        </label>
        <label className="block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Check-out
          <input type="date" value={co} min={ci || undefined} onChange={(e) => setCo(e.target.value)} className="input-field mt-1.5 [color-scheme:light_dark]" />
        </label>
      </div>
      <button type="submit" className="btn-primary-sm mt-4 w-full justify-center">Update rates <span aria-hidden="true">&rarr;</span></button>
    </form>
  );

  const asideSecondary = (
    <>
      {lockedHere ? (
          <div className="rounded-[1.5rem] border border-leaf/30 bg-leaf-soft/45 p-5">
          <p className="eyebrow inline-flex items-center gap-1 text-leaf">
            <Check className="h-3 w-3" /> Your stay
          </p>
          <p className="mt-2 text-sm font-medium">{lockedHere.roomName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmtDay(lockedHere.checkin)} → {fmtDay(lockedHere.checkout)} · {lockedHere.nights} night{lockedHere.nights === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sm tabular-nums">
            {formatMoney(lockedHere.nightlyAmount, lockedHere.currency)}/night · {formatMoney(lockedHere.totalAmount, lockedHere.currency)} total
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">Pick another room above to change it.</p>
        </div>
      ) : (
        <div className="rounded-[1.5rem] border border-border/80 bg-card/65 p-5">
          <p className="eyebrow inline-flex items-center gap-1">
            <BedDouble className="h-3 w-3" /> Not locked yet
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Lock a room to make this hotel the anchor for walking distances and the itinerary.
          </p>
        </div>
      )}

      <Link
        href={askAssistantHref(tripId, { name, address: [hotel?.address, hotel?.city].filter(Boolean).join(", "), kind: "stay" })}
        className="flex items-start gap-3 rounded-[1.5rem] border border-border/80 bg-surface/80 p-4 text-sm transition-colors hover:bg-accent"
      >
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          <span className="eyebrow">Ask Roam</span>
          <span className="mt-1 block leading-relaxed">Whether {name} fits your budget and the area you want to be in. The question is written for you.</span>
        </span>
      </Link>

      <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-card/30 p-5">
        <p className="eyebrow">Good to know</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Prices can change and rooms sell out. Taxes and fees may be added at checkout — confirm the total when you book.
        </p>
      </div>
    </>
  );

  // Page view keeps the single sticky sidebar; the panel splits it around the body.
  const aside = (
    <div className={cn("min-w-0 space-y-4", !panel && "lg:sticky lg:top-8")}>
      {datesForm}
      {asideSecondary}
    </div>
  );

  return (
    <div>
      {titleTag}
      <Hero image={images[0] ?? "/design/place-hotel.jpg"} alt={name} plain className={cn(panel ? "h-56" : "h-[38vh] min-h-[280px] sm:h-[46vh] sm:max-h-[460px]")}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/65 via-ink/10 to-transparent" />
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-end gap-3 text-white sm:inset-x-6 sm:bottom-6">
          {typeof hotel?.rating === "number" && (
            <div className="flex items-center gap-1.5 rounded-full bg-ink/35 px-3 py-1.5 text-xs backdrop-blur-md">
              <Star className="h-3.5 w-3.5 fill-current text-coral" /> {hotel.rating}/10
            </div>
          )}
        </div>
        {!panel && <BackLink fallback={`/trips/${tripId}/stay`} label="Back" className="absolute left-4 top-4 border-white/30 bg-ink/25 text-white hover:bg-ink/45" />}
      </Hero>

      <div className={pad}>
        <Reveal>
          <div className="pt-6">
            <div className="flex items-center gap-2">
              <span className="eyebrow text-coral">Hotel</span>
              {typeof hotel?.stars === "number" && <span className="text-xs text-muted-foreground">{hotel.stars} star{hotel.stars === 1 ? "" : "s"}</span>}
            </div>
            <WordReveal text={name} delay={0.18} className={cn("mt-2 max-w-2xl font-display leading-[1.05] tracking-[-0.03em]", panel ? "text-3xl" : "text-4xl sm:text-5xl")} />
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
            <Reveal delay={0.08}>{datesForm}</Reveal>
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
            <Reveal delay={0.1}>
              <div className="space-y-4">{asideSecondary}</div>
            </Reveal>
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
    </div>
  );
}
