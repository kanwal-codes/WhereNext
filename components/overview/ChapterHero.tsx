"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

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
  phoneTitle,
  phoneLine,
  phoneQuiet,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  stats?: ChapterStat[];
  action?: ReactNode;
  /** Phone redesign: below lg the page opens on this one short title, with the editorial title and line kept for screen readers. */
  phoneTitle?: string;
  /** Phone redesign: the one quiet line under the phone title, replacing the stats line. An empty string means no line. */
  phoneLine?: string;
  /** Phone redesign: the header bar already names this page, so the page keeps no big title of its own. */
  phoneQuiet?: boolean;
}) {
  const strip =
    stats.length > 0 ? (
      <div suppressHydrationWarning className="max-lg:hidden daisy-stats w-full rounded-2xl border border-border bg-card shadow-none sm:w-auto [&_.daisy-stat-value]:leading-tight [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:border-border [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3 max-sm:[&>.daisy-stat]:px-3">
        {stats.map((stat) => (
          <div key={stat.label} className="daisy-stat">
            <div className="daisy-stat-title text-2xs tracking-[0.1em] whitespace-normal uppercase">{stat.label}</div>
            <div className="daisy-stat-value font-display text-2xl tracking-tight tabular-nums sm:text-3xl">{stat.value}</div>
            {stat.desc && <div className="daisy-stat-desc max-w-[9rem] whitespace-normal sm:truncate">{stat.desc}</div>}
          </div>
        ))}
      </div>
    ) : null;

  // Phone redesign: the numbers are one quiet line under the title, not a bordered box before the page begins.
  const line = phoneLine !== undefined ? (
    phoneLine ? <p suppressHydrationWarning className="mt-1 text-[0.9375rem] text-ink-soft tabular-nums lg:hidden">{phoneLine}</p> : null
  ) : stats.length > 0 ? (
    <p suppressHydrationWarning className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-muted-foreground tabular-nums lg:hidden">
      {stats.map((stat, i) => (
        <span key={stat.label} className="whitespace-nowrap">
          <span className="font-display text-base font-medium text-foreground">{stat.value}</span>
          {stat.desc && stat.label === stats[0].label ? ` ${stat.desc}` : ""} {stat.label.toLowerCase()}
          {i < stats.length - 1 && <span aria-hidden className="ml-2 text-coral">·</span>}
        </span>
      ))}
    </p>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-5 sm:px-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        phoneTitle={phoneTitle}
        phoneQuietTitle={phoneQuiet}
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
      {line}
    </div>
  );
}
