"use client";

import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { useDocumentTitle } from "@/lib/use-document-title";

export type ChapterStat = { label: string; value: string; desc?: string };

/**
 * The top of a working page (itinerary, bookings, knowledge). It is one of the page's own cards: the
 * same column, corner radius, border and surface as every card below it, with a daisyUI hero layout,
 * breadcrumbs for where you are, and a bordered stats block for the page's few numbers. No tint or
 * gradient: it is the card surface, so it reads as part of the app in light and dark alike.
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
  const { data } = useTripData();
  const place = data?.trip?.destination ?? "";

  return (
    <header className="mx-auto w-full max-w-6xl px-5 pt-8 sm:px-8 sm:pt-10">
      {titleTag}
      <div className="daisy-hero relative isolate overflow-hidden rounded-3xl border border-border/70 bg-card shadow-soft">
        <div className="daisy-hero-content w-full max-w-none flex-col items-stretch justify-between gap-8 p-6 sm:p-9 lg:flex-row lg:items-end">
          <div className="min-w-0 max-w-2xl">
            <Reveal delay={0.05}>
              <nav aria-label="Where you are" className="daisy-breadcrumbs p-0 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                <ul>
                  <li>{eyebrow}</li>
                  {place && (
                    <li>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" />
                        {place}
                      </span>
                    </li>
                  )}
                </ul>
              </nav>
            </Reveal>
            <WordReveal text={title} delay={0.15} className="mt-2 font-display text-4xl leading-[1] tracking-tight text-balance sm:text-5xl" />
            {description && (
              <Reveal delay={0.3}>
                <p className="mt-3 max-w-xl text-body leading-relaxed text-muted-foreground">{description}</p>
              </Reveal>
            )}
          </div>

          <div className="flex flex-col items-stretch gap-4 lg:items-end">
            {stats.length > 0 && (
              <Reveal delay={0.35}>
                <div suppressHydrationWarning className="daisy-stats w-full rounded-2xl border border-border/70 bg-background/50 shadow-none lg:w-auto [&_.daisy-stat-value]:leading-tight [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:border-border/70 [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3">
                  {stats.map((stat) => (
                    <div key={stat.label} className="daisy-stat">
                      <div className="daisy-stat-title text-2xs tracking-[0.1em] uppercase">{stat.label}</div>
                      <div className="daisy-stat-value font-display text-2xl tracking-tight tabular-nums sm:text-3xl">{stat.value}</div>
                      {stat.desc && <div className="daisy-stat-desc max-w-[9rem] truncate">{stat.desc}</div>}
                    </div>
                  ))}
                </div>
              </Reveal>
            )}
            {action}
          </div>
        </div>
      </div>
    </header>
  );
}
