"use client";

import { CalendarPlus } from "lucide-react";
import { InviteCard } from "@/components/overview/InviteCard";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
import type { PlanDay } from "@/lib/trip-overview";

/** The first few days of the plan as columns: a big day number, the real date, and what is happening, in order. */
export function PlanDays({ tripId, days }: { tripId: string; days: PlanDay[] }) {
  if (days.length === 0) {
    return (
      <div className="mt-6">
        <InviteCard seed={`${tripId}plan`} icon={CalendarPlus} title="Nothing planned yet" href={`/trips/${tripId}/chat`} cta="Plan the days">
          Ask Roam for a first draft of the days, or add places from Discover as you find them.
        </InviteCard>
      </div>
    );
  }
  return (
    <Stagger className="mt-6 grid gap-4 md:grid-cols-3" delay={0.05}>
      {days.map((day) => (
        <StaggerItem key={day.day}>
          <article className="relative h-full overflow-hidden rounded-3xl border border-border/70 bg-card p-6 shadow-soft">
            <span aria-hidden className="pointer-events-none absolute -top-2 right-4 font-display text-[7.5rem] leading-none tabular-nums text-foreground/[0.055] select-none">
              {String(day.day).padStart(2, "0")}
            </span>
            <p className="text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Day {day.day}</p>
            <h3 suppressHydrationWarning className="mt-1 font-display text-2xl tracking-tight">
              {day.label ?? `Day ${day.day}`}
            </h3>
            <ol className="relative mt-6 space-y-4 border-l border-border pl-5">
              {day.items.map((item, index) => (
                <li key={`${item}-${index}`} className="relative text-body leading-snug text-ink-soft">
                  <span aria-hidden className="absolute top-[0.42rem] -left-[1.56rem] h-2 w-2 rounded-full bg-coral ring-4 ring-card" />
                  {item}
                </li>
              ))}
            </ol>
          </article>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
