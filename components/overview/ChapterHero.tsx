"use client";

import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { TripCover } from "@/components/trips/TripCover";
import type { TripSummary } from "@/components/trips/types";
import { placePhotoName } from "@/lib/trip-overview";
import { useDocumentTitle } from "@/lib/use-document-title";
import { cn } from "@/lib/utils";

export type ChapterStat = { label: string; value: string; desc?: string };

/** The trip as the cover component wants it, with a saved place's photo as the fallback image. */
export function useTripCoverSummary(): TripSummary | null {
  const { tripId, data } = useTripData();
  const trip = data?.trip;
  if (!trip) return null;
  const saved = ((data?.savedPlaces ?? []) as Array<{ places?: { metadata?: unknown } }>).map((row) => placePhotoName(row.places)).find(Boolean);
  return {
    id: tripId,
    name: trip.name,
    destination: trip.destination ?? null,
    origin: trip.origin ?? null,
    duration_days: trip.duration_days ?? null,
    start_date: trip.start_date ?? null,
    end_date: trip.end_date ?? null,
    travelers: trip.travelers ?? null,
    hero_photo_name: trip.hero_photo_name ?? null,
    saved_photo_name: saved ?? null,
  };
}

/**
 * The opening frame of a trip chapter (itinerary, bookings, knowledge): the same destination photo as
 * the Overview, cropped shorter, with the chapter's name set large over it and a few frosted numbers.
 * White text over a graded scrim when a photo is showing, dark text on the warm wash when it is not.
 */
export function ChapterHero({
  eyebrow,
  title,
  description,
  stats = [],
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  stats?: ChapterStat[];
  action?: ReactNode;
}) {
  const titleTag = useDocumentTitle(eyebrow);
  const cover = useTripCoverSummary();
  const place = cover?.destination ?? "";

  const body = (photo: boolean) => (
    <>
      <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/45 via-black/10 to-black/80 transition-opacity duration-1000", photo ? "opacity-100" : "opacity-0")} />
      <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(80%_70%_at_18%_90%,rgba(0,0,0,0.55),transparent)] transition-opacity duration-1000", photo ? "opacity-100" : "opacity-0")} />
      <div className={cn("relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pt-28 pb-7 transition-colors duration-1000 sm:px-8 sm:pb-9 lg:flex-row lg:items-end lg:justify-between", photo ? "text-white" : "text-foreground")}>
        <div className="min-w-0 max-w-2xl">
          <Reveal delay={0.05}>
            <p className={cn("flex items-center gap-1.5 text-[13px] font-medium tracking-[0.16em] uppercase transition-colors duration-1000", photo ? "text-white/85 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]" : "text-muted-foreground")}>
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{[eyebrow, place].filter(Boolean).join(" · ")}</span>
            </p>
          </Reveal>
          <WordReveal text={title} delay={0.15} className={cn("mt-3 font-display text-4xl leading-[1] tracking-tight text-balance sm:text-6xl", photo && "[text-shadow:0_2px_30px_rgba(0,0,0,0.5)]")} />
          {description && (
            <Reveal delay={0.35}>
              <p className={cn("mt-3 max-w-xl text-[15px] leading-relaxed transition-colors duration-1000", photo ? "text-white/85 [text-shadow:0_1px_14px_rgba(0,0,0,0.55)]" : "text-muted-foreground")}>{description}</p>
            </Reveal>
          )}
        </div>
        <div className="flex flex-col items-start gap-4 lg:items-end">
          {stats.length > 0 && (
            <Reveal delay={0.4}>
              <div
                suppressHydrationWarning
                className={cn(
                  "daisy-stats rounded-2xl border shadow-none backdrop-blur-md transition-colors duration-1000 [&_.daisy-stat-value]:leading-tight [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3",
                  photo
                    ? "border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] [&_.daisy-stat-desc]:text-white/70 [&_.daisy-stat-title]:text-white/70 [&>.daisy-stat]:border-white/20"
                    : "border-border/60 bg-background/60 [&>.daisy-stat]:border-border/70",
                )}
              >
                {stats.map((stat) => (
                  <div key={stat.label} className="daisy-stat">
                    <div className="daisy-stat-title text-[11px] tracking-[0.1em] uppercase">{stat.label}</div>
                    <div className="daisy-stat-value font-display text-2xl tracking-tight tabular-nums sm:text-3xl">{stat.value}</div>
                    {stat.desc && <div className="daisy-stat-desc">{stat.desc}</div>}
                  </div>
                ))}
              </div>
            </Reveal>
          )}
          {action}
        </div>
      </div>
    </>
  );

  return (
    <header>
      {titleTag}
      {cover ? (
        <TripCover trip={cover} size="feature" typeLed={false} width={1600} imageClassName="hero-drift" className="flex min-h-[22rem] flex-col justify-end sm:min-h-[26rem]">
          {({ photo }) => body(photo)}
        </TripCover>
      ) : (
        <div className="min-h-[22rem] animate-pulse bg-gradient-to-br from-muted to-card sm:min-h-[26rem]" />
      )}
    </header>
  );
}
