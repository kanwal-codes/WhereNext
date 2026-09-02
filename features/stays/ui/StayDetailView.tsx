"use client";

import { useState } from "react";
import Link from "next/link";
import { BedDouble, Check, Clock, MapPin, MessageCircle, Star } from "lucide-react";
import { Hero } from "@/components/Hero";
import { BackLink } from "@/components/BackLink";
import { NearbyEvents } from "@/components/NearbyEvents";
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

/**
 * The full hotel detail — same content and styling everywhere. `variant="page"`
 * is `/stay/[id]`; `variant="panel"` is the chat side rail (one column, no back-link).
 */
export function StayDetailView({
  tripId,
  hotelId,
  checkin,
  checkout,
  variant = "page",
  onDatesChange,
}: {
  tripId: string;
  hotelId: string;
  checkin?: string;
  checkout?: string;
  variant?: "page" | "panel";
  onDatesChange?: (checkin: string, checkout: string) => void;
}) {
  const panel = variant === "panel";
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [dates, setDates] = useState({ checkin: checkin ?? "", checkout: checkout ?? "" });
  const s = useStayDetails(tripId, hotelId, { checkin: dates.checkin || undefined, checkout: dates.checkout || undefined });
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
        <h1 className="mt-6 font-display text-2xl">Hotel details are unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">LiteAPI returned nothing for this hotel right now. Try again from the Stay tab.</p>
      </div>
    );
  }

  const hotel = s.hotel;
  const name = hotel?.name ?? "Hotel";
  const images = hotel?.images ?? [];
  const isLocked = (room: StayRoom) => s.lockedStay?.hotelId === hotelId && s.lockedStay.roomName === room.name;
  const lockedHere = s.lockedStay?.hotelId === hotelId ? s.lockedStay : null;

  const body = (
    <div className="space-y-8">
      <Reveal delay={0.06}>
        <section>
          <h2 className="font-display text-xl">About</h2>
          {hotel?.description ? (
            <p className="mt-2 text-[15px] leading-[1.8] text-ink-soft">{hotel.description}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">LiteAPI has no description for this hotel.</p>
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
            <h2 className="font-display text-xl">Photos</h2>
            <div className={cn("mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-slim pb-1", panel ? "-mx-4 px-4" : "-mx-5 px-5 sm:mx-0 sm:px-0")}>
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
            <h2 className="font-display text-xl">Facilities</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {hotel!.facilities.slice(0, 24).map((f) => (
                <span key={f} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{f}</span>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      <Reveal delay={0.12}>
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl">Rooms</h2>
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
            <div className="mt-3 space-y-2">
              {(s.rooms ?? []).map((room, i) => (
                <RoomRow key={`${room.name}-${i}`} room={room} locked={isLocked(room)} busy={s.busy} onLock={(r) => void s.lockRoom(r)} />
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {(s.sentiment || s.reviews.length > 0) && (
        <Reveal delay={0.14}>
          <section>
            <h2 className="font-display text-xl">What guests say</h2>
            {s.sentiment && <p className="mt-2 text-[15px] leading-[1.8] text-ink-soft">{s.sentiment}</p>}
            {s.reviews.length > 0 && (
              <div className="mt-4 space-y-3">
                {(reviewsOpen ? s.reviews : s.reviews.slice(0, 3)).map((r, i) => (
                  <figure key={i} className="rounded-2xl bg-surface p-4">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {typeof r.rating === "number" ? `${r.rating.toFixed(1)}/10` : "Guest"}
                        {r.travellerType ? ` · ${r.travellerType}` : ""}
                        {r.country ? ` · ${r.country}` : ""}
                      </span>
                      {r.date && <span>{r.date.slice(0, 10)}</span>}
                    </div>
                    {r.headline && <p className="mt-1.5 text-sm font-medium">{r.headline}</p>}
                    {r.positives && <p className="mt-1 text-sm leading-relaxed text-ink-soft"><span className="text-leaf">+ </span>{r.positives}</p>}
                    {r.negatives && <p className="mt-0.5 text-sm leading-relaxed text-ink-soft"><span className="text-destructive">− </span>{r.negatives}</p>}
                    {!r.positives && !r.negatives && r.text && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{r.text}</p>}
                  </figure>
                ))}
                {s.reviews.length > 3 && (
                  <button type="button" onClick={() => setReviewsOpen((v) => !v)} className="text-xs font-medium text-primary">
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

  const aside = (
    <div className={cn("space-y-4", !panel && "lg:sticky lg:top-8")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDates({ checkin: ci, checkout: co });
          onDatesChange?.(ci, co);
        }}
        className="rounded-2xl border border-border bg-card p-5 shadow-soft"
      >
        <p className="eyebrow">Dates</p>
        <label className="mt-3 block text-sm font-medium">
          Check-in
          <input type="date" value={ci} onChange={(e) => setCi(e.target.value)} className="input-field" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Check-out
          <input type="date" value={co} onChange={(e) => setCo(e.target.value)} className="input-field" />
        </label>
        <button type="submit" className="btn-secondary mt-4 w-full">Update rates</button>
      </form>

      {lockedHere ? (
        <div className="rounded-2xl border border-leaf/30 bg-leaf-soft/40 p-5">
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
        <div className="rounded-2xl border border-border bg-card p-5">
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
        className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm transition-colors hover:bg-accent"
      >
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          <span className="eyebrow">Ask the assistant</span>
          <span className="mt-1 block leading-relaxed">Whether {name} fits your budget and the area you want to be in. The question is written for you.</span>
        </span>
      </Link>

      <div className="rounded-2xl border border-dashed border-border p-5">
        <p className="eyebrow">Where this came from</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">LiteAPI live rates</p>
        {s.freshness && <p className="mt-1 text-xs text-muted-foreground">Checked {s.freshness}</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">Taxes/fees may be extra; confirm availability at booking.</p>
      </div>
    </div>
  );

  return (
    <div>
      {titleTag}
      <Hero image={images[0] ?? "/design/place-hotel.jpg"} alt={name} plain className={cn(panel ? "h-44" : "h-[38vh] min-h-[240px] sm:h-[46vh] sm:max-h-[420px]")}>
        {!panel && <BackLink fallback={`/trips/${tripId}/stay`} label="Back" className="absolute top-4 left-4" />}
      </Hero>

      <div className={pad}>
        <Reveal>
          <div className="pt-6">
            <span className="eyebrow">Hotel</span>
            <WordReveal text={name} delay={0.18} className={cn("mt-2 font-display leading-tight", panel ? "text-2xl" : "text-4xl")} />
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {hotel?.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {[hotel.address, hotel.city, hotel.country].filter(Boolean).join(", ")}
                </span>
              )}
              {typeof hotel?.stars === "number" && <span>{hotel.stars}★</span>}
              {typeof hotel?.rating === "number" && (
                <span className="inline-flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 fill-current text-coral" /> {hotel.rating}/10
                  {hotel.reviewCount ? ` (${hotel.reviewCount.toLocaleString()})` : ""}
                </span>
              )}
            </p>
          </div>
        </Reveal>

        {panel ? (
          <div className="mt-6 space-y-8">
            <Reveal delay={0.08}>{aside}</Reveal>
            {body}
          </div>
        ) : (
          <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {body}
            <Reveal delay={0.1}>{aside}</Reveal>
          </div>
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
