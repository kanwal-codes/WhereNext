"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { RoamMark } from "@/features/roam/ui/RoamMark";

/**
 * What a trip page shows when it crashes inside the trip's own frame (the menu and tabs around it keep working): the same voice as the full-screen
 * error, at the size of a section. Roam's route breaks, a title says what happened, one sentence says what to do, and there are two ways on:
 * try again, or leave for somewhere that works (the trip's overview, or all trips when the overview is what broke). The reference is for whoever helps.
 */
export function SectionError({ what, digest, reset }: { what: string; digest?: string; reset: () => void }) {
  const { tripId } = useParams<{ tripId?: string }>();
  const pathname = usePathname() ?? "";
  const base = tripId ? `/trips/${tripId}` : "/trips";
  const onOverview = pathname.replace(/\/$/, "") === base;
  return (
    <div className="mx-auto w-full min-w-0 max-w-md px-6 py-14 text-center" role="alert">
      <RoamMark state="error" size={88} className="mx-auto block text-foreground" />
      <h2 className="mt-6 font-display text-2xl leading-tight font-medium tracking-[-0.025em] text-balance">We couldn’t show {what}</h2>
      <p className="mx-auto mt-2 max-w-xs text-body leading-relaxed text-ink-soft text-pretty">Something went wrong on our side. Try again, and if it keeps happening, head back and carry on from there.</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={reset} className="btn-primary-sm">Try again</button>
        {onOverview || !tripId ? <Link href="/trips" className="btn-secondary">All trips</Link> : <Link href={base} className="btn-secondary">Back to overview</Link>}
      </div>
      {digest && <p className="mt-6 text-2xs text-muted-foreground">Reference {digest}</p>}
    </div>
  );
}
