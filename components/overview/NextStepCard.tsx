"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Phone redesign: what to do next, as one card. A ring for how much of the plan exists, the first day with nothing on it as
 * the next job, and one round button into Roam with that job already typed. No planned days: it offers a first draft instead.
 */
export function NextStepCard({ tripId, plannedDays, totalDays, firstOpenDay }: { tripId: string; plannedDays: number; totalDays: number | null; firstOpenDay: number | null }) {
  const total = totalDays && totalDays > 0 ? totalDays : null;
  const frac = total ? Math.min(1, plannedDays / total) : 0;
  const r = 22, c = 2 * Math.PI * r;
  const job = plannedDays === 0 ? "Plan your first days" : firstOpenDay != null ? `Fill day ${firstOpenDay}` : "Everything has a plan";
  const ask = plannedDays === 0 ? "Plan my first days" : firstOpenDay != null ? `Fill day ${firstOpenDay} of the trip` : "Check the plan for gaps and clashes";
  return (
    <Link href={`/trips/${tripId}/chat?ask=${encodeURIComponent(ask)}`} className="flex items-center gap-3.5 rounded-[1.625rem] border border-border bg-surface p-3.5 pr-3 transition-transform duration-200 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden">
      <svg viewBox="0 0 56 56" className="size-14 shrink-0 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--muted)" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--coral)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block">Next step</span>
        <span className="block truncate font-display text-xl leading-tight font-medium tracking-[-0.02em]">{job}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">{total ? `${plannedDays} of ${total} days planned` : `${plannedDays} day${plannedDays === 1 ? "" : "s"} planned`}</span>
      </span>
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden><ArrowRight className="size-5" /></span>
    </Link>
  );
}
