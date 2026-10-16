"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Compass } from "lucide-react";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { cn } from "@/lib/utils";

const secondary = "daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-5 font-medium shadow-none hover:border-foreground/30 hover:bg-accent";

/**
 * The Overview's next steps, right under the hero. On a desktop it stays with you: once the hero has scrolled away
 * the row sticks to the top, gains a hairline and a soft shadow, and the trip's name fades in at its left, so the
 * hero hands over to a slim bar instead of vanishing. On a phone the bottom tab bar already carries these, so the
 * row simply scrolls with the page.
 */
export function ActionBar({ tripId, name }: { tripId: string; name: string }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px" />
      <div className={cn("z-20 transition-[box-shadow,background-color,border-color] duration-300 lg:sticky lg:top-0", "border-b border-transparent", stuck && "lg:border-border lg:bg-background/95 lg:shadow-[0_12px_28px_-20px_oklch(0.2_0.012_65/0.45)]")}>
        {/* On a short screen the row gives up its breathing room rather than let the shortcuts sit under the
            phone's fixed tab bar — the hero above has already shrunk as far as its own content allows. */}
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-4 [@media(max-height:700px)]:py-2 sm:px-8">
          <p aria-hidden={!stuck} className={cn("hidden min-w-0 flex-1 truncate font-display text-lg tracking-[-0.01em] transition-[opacity,transform] duration-300 lg:block", stuck ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0")}>
            {name}
          </p>
          {/* The main action, then the two shortcuts: on a phone the action is full width with the shortcuts side by side; from sm up all three sit in a row. */}
          <div className="grid w-full grid-cols-2 gap-3 [@media(max-height:700px)]:gap-2 sm:flex sm:w-auto sm:flex-wrap lg:shrink-0 lg:flex-nowrap">
            <Link href={`/trips/${tripId}/chat`} className="btn-primary col-span-2 h-11 rounded-full px-6 sm:col-span-1">
              <RoamMark state="settled" size={30} /> Continue planning
            </Link>
            <Link href={`/trips/${tripId}/itinerary`} className={secondary}>
              <CalendarDays className="h-4 w-4" /> Itinerary
            </Link>
            <Link href={`/trips/${tripId}/discover`} className={secondary}>
              <Compass className="h-4 w-4" /> Discover
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
