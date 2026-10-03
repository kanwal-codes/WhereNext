"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion-primitives";

export type ChapterStat = { label: string; value: string; desc?: string };

/**
 * The top of a working page (itinerary, bookings, knowledge): the same header every other trip page
 * has (label, title, line of description, rule), with the page's few numbers in a bordered strip at
 * the right (below the title on a phone). One header system, so moving between pages never changes
 * how a page begins.
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
  const strip =
    stats.length > 0 ? (
      <div suppressHydrationWarning className="daisy-stats w-full rounded-2xl border border-border bg-card shadow-none sm:w-auto [&_.daisy-stat-value]:leading-tight [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:border-border [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3 max-sm:[&>.daisy-stat]:px-3">
        {stats.map((stat) => (
          <div key={stat.label} className="daisy-stat">
            <div className="daisy-stat-title text-2xs tracking-[0.1em] whitespace-normal uppercase">{stat.label}</div>
            <div className="daisy-stat-value font-display text-2xl tracking-tight tabular-nums sm:text-3xl">{stat.value}</div>
            {stat.desc && <div className="daisy-stat-desc max-w-[9rem] whitespace-normal sm:truncate">{stat.desc}</div>}
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-10 sm:px-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={
          strip || action ? (
            <Reveal delay={0.25}>
              <div className="flex flex-col items-stretch gap-4 sm:items-end">
                {strip}
                {action}
              </div>
            </Reveal>
          ) : undefined
        }
      />
    </div>
  );
}
