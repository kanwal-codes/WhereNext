"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { ShowMore } from "@/components/DetailKit";
import { Reveal } from "@/components/motion-primitives";
import type { useStayDetails } from "@/features/stays/application/useStayDetails";
import type { reviewDigest } from "@/features/stays/domain/stay-view";
import { reviewerLine } from "@/features/stays/domain/stay-view";
import { StayThemes } from "@/features/stays/ui/GoogleStayParts";
import { relativeDate } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

type Stay = ReturnType<typeof useStayDetails>;

/** The score and verdict, what guests mention, and the reviews: a swipeable row on a phone, a stack of three (or all) elsewhere. */
export function StayGuestReviews({ s, digest }: { s: Stay; digest: ReturnType<typeof reviewDigest> }) {
  const { ratedCount, readable, score: reviewScore } = digest;
  const [reviewsOpen, setReviewsOpen] = useState(false);
  if (!(s.sentiment || s.themes.length > 0 || s.reviews.length > 0)) return null;
  return (
    <Reveal delay={0.14}>
      <section>
        <DetailSectionHeading>What guests say</DetailSectionHeading>
        {/* One card: the score and the one-line verdict across the top, what guests mention beneath. */}
        <div className="mt-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
          {(reviewScore !== null || s.sentiment) && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              {reviewScore !== null && (
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-display text-4xl leading-none tabular-nums tracking-[-0.03em]">{reviewScore.toFixed(1)}</span>
                  <span className="text-xs leading-snug text-muted-foreground">out of 10<br />from {ratedCount} recent review{ratedCount === 1 ? "" : "s"}</span>
                </div>
              )}
              {s.sentiment && <p className={cn("text-sm leading-relaxed text-ink-soft text-pretty", reviewScore !== null && "sm:border-l sm:border-border sm:pl-6")}>{s.sentiment}</p>}
            </div>
          )}
          {s.themes.length > 0 && (
            <div className={cn((reviewScore !== null || s.sentiment) && "mt-3.5 border-t border-border pt-3.5")}>
              <p className="eyebrow mb-2.5">Guests mention · % who liked it</p>
              <StayThemes themes={s.themes} />
            </div>
          )}
        </div>
        {readable.length > 0 && (
          <>
          <div className="-mx-4 mt-3 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 no-scrollbar scroll-px-4 lg:hidden">
            {readable.slice(0, 8).map((r, i) => {
              const who = reviewerLine(r, s.google);
              const body = r.positives || r.negatives || r.text;
              return (
                <figure key={i} className="flex w-[16.5rem] shrink-0 snap-start flex-col rounded-2xl border border-border bg-card p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    {typeof r.rating === "number" ? (
                      <span className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary px-2.5 text-xs font-semibold tabular-nums"><Star className="size-3 fill-current text-coral" aria-hidden />{r.rating.toFixed(1)}</span>
                    ) : <span className="text-xs font-semibold">Guest note</span>}
                    {r.date && <span className="text-xs text-muted-foreground">{relativeDate(r.date)}</span>}
                  </div>
                  {r.headline && <p className="mt-2.5 line-clamp-1 text-sm font-medium leading-5">{r.headline}</p>}
                  {body && <p className={cn("text-sm leading-5 text-ink-soft", r.headline ? "mt-1 line-clamp-2" : "mt-2.5 line-clamp-3")}>{body}</p>}
                  {who && <figcaption className="mt-auto truncate pt-2.5 text-xs text-muted-foreground">{who}</figcaption>}
                </figure>
              );
            })}
          </div>
          <div className={cn("mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4", "max-lg:hidden")}>
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
                {(r.travellerType || r.country || (s.google && r.name)) && <figcaption className="mt-3 text-xs text-muted-foreground">{reviewerLine(r, s.google)}</figcaption>}
              </figure>
            ))}
          </div>
          {readable.length > 3 && <div className={cn("mt-3", "max-lg:hidden")}><ShowMore open={reviewsOpen} onToggle={() => setReviewsOpen((v) => !v)} more={`Show all ${readable.length} reviews`} less="Show fewer reviews" /></div>}
          </>
        )}
      </section>
    </Reveal>
  );
}
