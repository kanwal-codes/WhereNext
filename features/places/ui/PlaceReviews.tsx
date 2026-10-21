"use client";

import { useState } from "react";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { ShowMore } from "@/components/DetailKit";
import { Reveal } from "@/components/motion-primitives";
import { ReviewFigure } from "@/features/places/ui/PlaceReview";
import type { usableReviews } from "@/features/places/domain/place-view";

/** The first review, with the rest behind a "show more". */
export function PlaceReviews({ reviews }: { reviews: ReturnType<typeof usableReviews> }) {
  const [open, setOpen] = useState(false);
  if (reviews.length === 0) return null;
  return (
    <Reveal delay={0.12}>
      <section>
        <DetailSectionHeading>What people say</DetailSectionHeading>
        <div className="mt-3 space-y-3">
          {(open ? reviews : reviews.slice(0, 1)).map((r, i) => (
            <ReviewFigure key={i} r={r} />
          ))}
        </div>
        {reviews.length > 1 && (
          <div className="mt-3">
            <ShowMore open={open} onToggle={() => setOpen((v) => !v)} more={`Show ${reviews.length - 1} more review${reviews.length - 1 === 1 ? "" : "s"}`} less="Show fewer reviews" />
          </div>
        )}
      </section>
    </Reveal>
  );
}
