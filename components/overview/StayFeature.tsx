"use client";

import { hotelPhotoSrc } from "@/lib/hotel-photo";
import { useState } from "react";
import Link from "next/link";
import { BedDouble } from "lucide-react";
import { Tactile } from "@/components/motion-primitives";
import { InviteCard } from "@/components/overview/InviteCard";
import { TripArt, hashString } from "@/components/trips/TripArt";
import { fmtDay } from "@/lib/trip-dates";
import type { StayDecision } from "@/packages/contracts/stay";
import type { TimelineItem } from "@/lib/trip-reservations";
import { cn } from "@/lib/utils";

/** Where the group is sleeping: a wide photographic card when a stay is locked, an invitation when it is not. */
export function StayFeature({ tripId, stay, compact = false, booked = [] }: { tripId: string; stay: StayDecision | null; compact?: boolean; booked?: TimelineItem[] }) {
  const [imageFailed, setImageFailed] = useState(false);

  // Stays typed into Bookings count: a trip with its hotels booked is not "where will you sleep?".
  const liveBooked = booked.filter((item) => item.status !== "cancelled" && item.status !== "failed");
  if (!stay && liveBooked.length > 0) {
    return (
      <section aria-label="Where you are staying" className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft sm:p-8">
        <p className="eyebrow">Where you&rsquo;re staying</p>
        <ul className="mt-4 divide-y divide-border">
          {liveBooked.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 max-lg:flex-col max-lg:items-start">
              <span className="min-w-0 font-display text-xl tracking-tight max-lg:text-lg max-lg:leading-snug">{item.title}</span>
              <span suppressHydrationWarning className="text-sm text-muted-foreground tabular-nums">
                {item.date ? fmtDay(item.date) : "dates not set"}
                {item.endDate ? ` to ${fmtDay(item.endDate)}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <Link href={`/trips/${tripId}/stay`} className="mt-4 inline-flex items-center text-sm font-medium underline underline-offset-4 max-lg:min-h-11">Find another stay</Link>
      </section>
    );
  }

  if (!stay) {
    return (
      <InviteCard seed={tripId} icon={BedDouble} title="Where will you sleep?" href={`/trips/${tripId}/stay`} cta="Find a stay">
        Compare places that fit your dates and budget, then lock one in for the whole group.
      </InviteCard>
    );
  }

  const showImage = Boolean(stay.thumbnail) && !imageFailed;
  return (
    <Tactile lift={3} className="group">
      <Link
        href={`/trips/${tripId}/stay/${encodeURIComponent(stay.hotelId)}?checkin=${stay.checkin}&checkout=${stay.checkout}`}
        className="relative block h-full min-h-[24rem] overflow-hidden rounded-3xl border border-border/70 shadow-soft focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <TripArt seed={hashString(stay.hotelName)} className="absolute inset-0" grain />
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
          <img
            src={hotelPhotoSrc(stay.thumbnail!)}
            alt={stay.hotelName}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.05]"
          />
        )}
        <div aria-hidden className={cn("absolute inset-0 scrim-b", !showImage && "opacity-0")} />

        <div className={cn("relative flex h-full min-h-[24rem] flex-col justify-between p-6 sm:p-9", showImage ? "text-white" : "text-foreground")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="photo-chip">Your stay</span>
            {stay.refundable && <span className="photo-chip">Free cancellation</span>}
            {stay.board && <span className="photo-chip">{stay.board}</span>}
          </div>

          <div className={cn("flex flex-col gap-6", !compact && "lg:flex-row lg:items-end lg:justify-between")}>
            <div className="min-w-0 max-w-xl">
              <h3 className={cn("font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl", showImage && "[text-shadow:0_2px_24px_rgba(0,0,0,0.5)]")}>{stay.hotelName}</h3>
              <p className={cn("mt-2 text-base", showImage ? "text-white/85" : "text-muted-foreground")}>{stay.roomName}</p>
              <p suppressHydrationWarning className={cn("mt-0.5 text-sm tabular-nums", showImage ? "text-white/70" : "text-muted-foreground")}>
                {fmtDay(stay.checkin)} to {fmtDay(stay.checkout)}
              </p>
              {stay.address && <p className={cn("mt-0.5 text-sm", showImage ? "text-white/70" : "text-muted-foreground")}>{stay.address}</p>}
            </div>
            <div
              suppressHydrationWarning
              className={cn(
                "daisy-stats w-full rounded-2xl border", !compact && "lg:w-auto", " [&_.daisy-stat-value]:leading-tight [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3",
                showImage
                  ? "glass-photo [&_.daisy-stat-desc]:text-white/70 [&_.daisy-stat-title]:text-white/70 [&>.daisy-stat]:border-white/20"
                  : "border-border/60 bg-background/82 [&>.daisy-stat]:border-border/70",
              )}
            >
              <div className="daisy-stat">
                <div className="daisy-stat-title text-2xs tracking-[0.1em] uppercase">Stay</div>
                <div className="daisy-stat-value font-display text-2xl tracking-tight tabular-nums">{stay.nights}</div>
                <div className="daisy-stat-desc">{stay.nights === 1 ? "night" : "nights"}</div>
              </div>
              <div className="daisy-stat">
                <div className="daisy-stat-title text-2xs tracking-[0.1em] uppercase">Per night</div>
                <div className="daisy-stat-value font-display text-2xl tracking-tight tabular-nums">{Math.round(stay.nightlyAmount)}</div>
                <div className="daisy-stat-desc">{stay.currency}</div>
              </div>
              <div className="daisy-stat">
                <div className="daisy-stat-title text-2xs tracking-[0.1em] uppercase">Total</div>
                <div className="daisy-stat-value font-display text-2xl tracking-tight tabular-nums">{Math.round(stay.totalAmount)}</div>
                <div className="daisy-stat-desc">{stay.currency}</div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </Tactile>
  );
}
