"use client";

import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { TripArt, hashString } from "@/components/trips/TripArt";
import { useDocumentTitle } from "@/lib/use-document-title";

export type ChapterStat = { label: string; value: string; desc?: string };

/**
 * The top of a working page (itinerary, bookings, knowledge): a slim typographic header on the
 * trip's warm wash, with the page's few numbers set quietly on the right. The destination photo is
 * kept for the Overview, so these pages stay light and the content starts near the top.
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
  const { tripId, data } = useTripData();
  const place = data?.trip?.destination ?? "";

  return (
    <header>
      {titleTag}
      <TripArt seed={hashString(`${tripId}${data?.trip?.name ?? ""}`)} grain className="border-b border-border/60">
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pt-12 pb-8 sm:px-8 sm:pt-14 sm:pb-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <Reveal delay={0.05}>
              <p className="flex items-center gap-1.5 text-[13px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{[eyebrow, place].filter(Boolean).join(" · ")}</span>
              </p>
            </Reveal>
            <WordReveal text={title} delay={0.15} className="mt-3 font-display text-4xl leading-[1] tracking-tight text-balance sm:text-5xl" />
            {description && (
              <Reveal delay={0.35}>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>
              </Reveal>
            )}
          </div>
          <div className="flex flex-col items-start gap-4 lg:items-end">
            {stats.length > 0 && (
              <Reveal delay={0.4}>
                <dl suppressHydrationWarning className="flex divide-x divide-border/70">
                  {stats.map((stat) => (
                    <div key={stat.label} className="px-5 first:pl-0 last:pr-0">
                      <dt className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{stat.label}</dt>
                      <dd className="mt-0.5 font-display text-3xl leading-tight tracking-tight tabular-nums">{stat.value}</dd>
                      {stat.desc && <dd className="max-w-[9rem] truncate text-xs text-muted-foreground">{stat.desc}</dd>}
                    </div>
                  ))}
                </dl>
              </Reveal>
            )}
            {action}
          </div>
        </div>
      </TripArt>
    </header>
  );
}
