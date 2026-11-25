"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useScrollCompact } from "@/lib/use-scroll-compact";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * The header and the row of pills under it, for a page that scrolls as one column (Eat, Stays and Flights without a trip): the header sticks at the top,
 * the row sticks right under it once it gets there, and from then on a frosted ground sits behind both. Only the row holds; everything else scrolls.
 *
 * `headRef` goes on the sticky header, `rowRef` on the row. `stuck` is that the row has got there; how far down it sticks is the `--head-top` variable.
 */
export function useStickyBar() {
  const headRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  // The header slides away while the reader heads down the page and comes back on the way up, as the trip's own header does; the row then sticks to the top.
  // On a phone only: a desktop keeps its header where it is. A control focused from the keyboard brings it back.
  // None of this is React state: the header's height and whether it is away live in two CSS variables on the page, so the row and the frosted ground
  // follow it without the whole page (the list of results) rendering again each time the reader changes direction.
  const phone = useMediaQuery("(max-width: 1023.98px)");
  const measured = useRef(72);
  const hidden = useRef(false);
  const apply = useCallback(() => {
    const px = hidden.current ? 0 : measured.current;
    const root = document.documentElement.style;
    root.setProperty("--head-px", `${px}px`);
    root.setProperty("--head-top", px ? `${px}px` : "env(safe-area-inset-top)");
    headRef.current?.classList.toggle("-translate-y-full", hidden.current);
  }, []);
  const setHidden = useCallback((value: boolean) => {
    if (hidden.current === value) return;
    hidden.current = value;
    apply();
  }, [apply]);
  useScrollCompact({ enabled: phone, onChange: (compact) => setHidden(compact) });
  useEffect(() => {
    if (!phone) setHidden(false);
  }, [phone, setHidden]);
  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const measure = () => { measured.current = Math.round(head.getBoundingClientRect().height); apply(); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(head);
    return () => {
      ro.disconnect();
      const root = document.documentElement.style;
      root.removeProperty("--head-px");
      root.removeProperty("--head-top");
    };
  }, [apply]);
  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const show = () => setHidden(false);
    head.addEventListener("focusin", show);
    return () => head.removeEventListener("focusin", show);
  }, [setHidden]);
  useEffect(() => {
    const on = () => {
      const row = rowRef.current;
      const headH = hidden.current ? 0 : measured.current;
      setStuck(Boolean(row && window.scrollY > 4 && row.getBoundingClientRect().top <= headH + 1));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return { headRef, rowRef, stuck };
}

/** The class of the sticky header's wrapper. */
export const STICKY_HEAD = "sticky top-0 z-30 -mx-4 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 transition-transform duration-[var(--compact-duration)] ease-[var(--ease-out)] motion-reduce:transition-none";

/** The class and style of the row's wrapper (the row sits one header's height below the top, `--head-top`). */
export function stickyRow(stuck: boolean, extra?: string): { className: string; style: CSSProperties } {
  return {
    className: cn("sticky z-20 -mx-4 px-4 py-3 transition-[top] duration-[var(--compact-duration)] ease-[var(--ease-out)] [&_.btn-chip]:transition-shadow", stuck && "[&_.btn-chip]:shadow-[0_1px_2px_rgb(40_25_10/0.07)]", extra),
    style: { top: "var(--head-top, env(safe-area-inset-top))" },
  };
}

/** One frosted ground behind the header and the row together, shown once the row is stuck. Its lower edge fades, so the page dissolves under it instead of being cut by a line. */
export function FrostedGround({ stuck }: { stuck: boolean }) {
  return (
    <div
      aria-hidden
      style={{ height: "calc(var(--head-px, 72px) + 3.75rem)" }}
      className={cn("pointer-events-none fixed inset-x-0 top-0 z-[15] bg-background/90 backdrop-blur-xl transition-[opacity,height] duration-[var(--compact-duration)] ease-[var(--ease-out)] [mask-image:linear-gradient(to_bottom,#000_calc(100%_-_1.5rem),transparent)]", stuck ? "opacity-100" : "opacity-0")}
    />
  );
}

/** The place pill's look: it lifts onto a white pill once the bar is stuck, so it doesn't wash out on the frosted ground. */
export const stuckPill = (stuck: boolean) => (stuck ? "bg-card shadow-[0_1px_2px_rgb(40_25_10/0.08),0_6px_14px_-8px_rgb(40_25_10/0.22)]" : "bg-muted");

/**
 * The same bar inside a trip, where the header is the trip's own phone header (it slides away on the way down and comes back on the way up) and there is no
 * header of the page's to stick under. `PhoneHeader` publishes where its lower edge is (`--topbar-now`: the bar's height while it shows, the notch's while it
 * is away), so the row sticks right under the bar, and slides up with it when it goes. `rowRef` goes on the row's wrapper; `stuck` is that the row has got there.
 * Phone only: from `lg` up the row stays where it is.
 */
export function useTripStickyRow() {
  const rowRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const on = () => {
      const row = rowRef.current;
      const bar = document.querySelector("[data-trip-topbar]");
      const edge = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
      setStuck(Boolean(row && window.innerWidth < 1024 && window.scrollY > 4 && row.getBoundingClientRect().top <= edge + 1));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);
  return { rowRef, stuck };
}

/** The class and style of the row's wrapper inside a trip (see `useTripStickyRow`). */
export function tripStickyRow(stuck: boolean, extra?: string): { className: string; style: CSSProperties } {
  return {
    className: cn("max-lg:sticky max-lg:z-20 max-lg:-mx-4 max-lg:px-4 max-lg:py-3 max-lg:transition-[top] max-lg:duration-[var(--compact-duration)] max-lg:ease-[var(--ease-out)] [&_.btn-chip]:transition-shadow", stuck && "[&_.btn-chip]:shadow-[0_1px_2px_rgb(40_25_10/0.07)]", extra),
    style: { top: "var(--topbar-now, var(--topbar))" },
  };
}

/** The frosted ground behind the trip's header and the stuck row: one layer from the top of the screen, fading at its lower edge. */
export function TripFrostedGround({ stuck }: { stuck: boolean }) {
  return (
    <div
      aria-hidden
      style={{ height: "calc(var(--topbar-now, var(--topbar)) + 3.75rem)" }}
      className={cn("pointer-events-none fixed inset-x-0 top-0 z-[15] bg-background/90 backdrop-blur-xl transition-[opacity,height] duration-[var(--compact-duration)] ease-[var(--ease-out)] lg:hidden [mask-image:linear-gradient(to_bottom,#000_calc(100%_-_1.5rem),transparent)]", stuck ? "opacity-100" : "opacity-0")}
    />
  );
}
