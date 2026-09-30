"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BedDouble } from "lucide-react";
import { Tactile } from "@/components/motion-primitives";
import { TripArt, hashString } from "@/components/trips/TripArt";
import { fmtDay } from "@/lib/trip-dates";
import type { StayDecision } from "@/packages/contracts/stay";
import { cn } from "@/lib/utils";

/** Where the group is sleeping: a wide photographic card when a stay is locked, an invitation when it is not. */
export function StayFeature({ tripId, stay }: { tripId: string; stay: StayDecision | null }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!stay) {
    return (
      <Link href={`/trips/${tripId}/stay`} className="group block focus-visible:outline-none">
        <TripArt seed={hashString(tripId)} className="rounded-[1.75rem] border border-border/70 p-7 shadow-soft transition-colors duration-300 group-hover:border-foreground/20 sm:p-10">
          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border/60 bg-background/70 backdrop-blur">
                <BedDouble className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-2xl tracking-tight sm:text-3xl">Where will you sleep?</h3>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">Compare places that fit your dates and budget, then lock one in for the whole group.</p>
              </div>
            </div>
            <span className="daisy-btn daisy-btn-neutral w-fit shrink-0 border-0">
              Find a stay <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
          </div>
        </TripArt>
      </Link>
    );
  }

  const showImage = Boolean(stay.thumbnail) && !imageFailed;
  return (
    <Tactile lift={3} className="group">
      <Link
        href={`/trips/${tripId}/stay/${encodeURIComponent(stay.hotelId)}?checkin=${stay.checkin}&checkout=${stay.checkout}`}
        className="relative block min-h-[24rem] overflow-hidden rounded-[1.75rem] border border-border/70 shadow-soft focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <TripArt seed={hashString(stay.hotelName)} className="absolute inset-0" grain />
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
          <img
            src={stay.thumbnail!}
            alt={stay.hotelName}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.05]"
          />
        )}
        <div aria-hidden className={cn("absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/15", !showImage && "opacity-0")} />

        <div className={cn("relative flex min-h-[24rem] flex-col justify-between p-6 sm:p-9", showImage ? "text-white" : "text-foreground")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="daisy-badge h-7 border-border/60 bg-background/80 px-3 text-[13px] font-medium text-foreground backdrop-blur">Your stay</span>
            {stay.refundable && <span className="daisy-badge h-7 border-border/60 bg-background/80 px-3 text-[13px] font-medium text-foreground backdrop-blur">Free cancellation</span>}
            {stay.board && <span className="daisy-badge h-7 border-border/60 bg-background/80 px-3 text-[13px] font-medium text-foreground backdrop-blur">{stay.board}</span>}
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
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
                "daisy-stats w-full rounded-2xl border shadow-none backdrop-blur-md lg:w-auto [&_.daisy-stat-value]:leading-tight [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3",
                showImage
                  ? "border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] [&_.daisy-stat-desc]:text-white/70 [&_.daisy-stat-title]:text-white/70 [&>.daisy-stat]:border-white/20"
                  : "border-border/60 bg-background/60 [&>.daisy-stat]:border-border/70",
              )}
            >
              <div className="daisy-stat">
                <div className="daisy-stat-title text-[11px] tracking-[0.1em] uppercase">Stay</div>
                <div className="daisy-stat-value font-display text-2xl tracking-tight tabular-nums">{stay.nights}</div>
                <div className="daisy-stat-desc">{stay.nights === 1 ? "night" : "nights"}</div>
              </div>
              <div className="daisy-stat">
                <div className="daisy-stat-title text-[11px] tracking-[0.1em] uppercase">Per night</div>
                <div className="daisy-stat-value font-display text-2xl tracking-tight tabular-nums">{Math.round(stay.nightlyAmount)}</div>
                <div className="daisy-stat-desc">{stay.currency}</div>
              </div>
              <div className="daisy-stat">
                <div className="daisy-stat-title text-[11px] tracking-[0.1em] uppercase">Total</div>
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
