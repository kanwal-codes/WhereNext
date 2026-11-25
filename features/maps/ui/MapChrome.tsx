"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate as animateValue, motion, useDragControls, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { modeSwatch } from "@/features/maps/ui/modeParts";
import { MODE_LABEL } from "@/lib/application/mode-visuals";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { MapInset } from "@/components/TripMap";

/** Wraps a horizontally-scrolling row with a fade + arrow on whichever edge still has more to
 * scroll to — the day chips otherwise give no hint that Day 5 exists past the panel's edge. */
export function HScrollFade({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollWidth - el.scrollLeft - el.clientWidth > 4;
      setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [children]);

  const page = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });

  return (
    <div className="relative">
      <div ref={ref} className={cn("overflow-x-auto overscroll-x-contain scrollbar-slim", className)}>
        {children}
      </div>
      {more.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex w-8 items-center bg-gradient-to-r from-card to-transparent">
          <button
            type="button"
            aria-label="Show earlier days"
            onClick={() => page(-1)}
            className="pointer-events-auto grid size-6 shrink-0 place-items-center rounded-full max-lg:size-10 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>
      )}
      {more.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-card to-transparent pr-1.5">
          <button
            type="button"
            aria-label="Show more days"
            onClick={() => page(1)}
            className="pointer-events-auto grid size-6 shrink-0 place-items-center rounded-full max-lg:size-10 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Peek height (px) when the mobile sheet is collapsed — just the drag handle plus enough of the
 * first row to hint there's more, deliberately short so most of the map stays visible. */
const SHEET_PEEK = 96;
type Detent = "peek" | "half" | "tall";
const SHEET_BLEED = 40;
const PANEL_WIDTH = 420;
const PANEL_GAP = 16;
export const EASE = [0.22, 1, 0.36, 1] as const;

/** On lg+ screens, a floating panel beside the map. Below that, the panel would cover the whole
 * map, so it becomes a draggable bottom sheet instead — pull it down to see the map, up to see
 * the plan. No backdrop: the map stays visible and interactive either way. Reports how much of
 * the map it covers so the route is framed in what is left. */
export function MapPanel({ collapsedLabel, onInset, opens, children }: { collapsedLabel?: string; onInset?: (inset: MapInset) => void; /** Changes when something new has arrived to look at (a route was found, or cleared): a folded sheet opens to show it. */ opens?: string | number | boolean; children: ReactNode }) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduce = useReducedMotion();
  const dragControls = useDragControls();
  const containerRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const anim = useRef<ReturnType<typeof animateValue> | null>(null);
  // The map's own height (the sheet's parent) and the bar above it: what "pulled all the way up" is measured against.
  const [stageH, setStageH] = useState(0);
  const [barH, setBarH] = useState(56);
  // Three resting places on a phone: the peek, half (54% of the map), and tall (nearly the whole screen).
  const [detent, setDetent] = useState<Detent>("half");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (desktop) return;
    const el = containerRef.current;
    const stage = el?.parentElement;
    if (!el || !stage) return;
    const measure = () => {
      setStageH(stage.clientHeight);
      setBarH(document.querySelector<HTMLElement>("[data-trip-topbar]")?.offsetHeight ?? 56);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [desktop]);

  // The sheet is always as tall as it gets and only ever moves by transform (nothing is laid out while it moves): `y` is how far it is let down from tall.
  const tallH = stageH ? stageH - barH - 8 : 0;
  const halfH = Math.min(Math.round(stageH * 0.54), tallH);
  const pos: Record<Detent, number> = { tall: 0, half: tallH - halfH, peek: Math.max(0, tallH - SHEET_PEEK) };
  const shown = tallH - pos[detent];

  useEffect(() => {
    if (desktop) onInset?.({ left: collapsed ? 0 : PANEL_WIDTH + PANEL_GAP });
    else onInset?.({ bottom: Math.min(tallH ? shown : SHEET_PEEK, Math.round(window.innerHeight * 0.38)) });
  }, [desktop, collapsed, shown, tallH, onInset]);

  const settle = (next: Detent, velocity = 0) => {
    setDetent(next);
    anim.current?.stop();
    // Lets go at the speed the finger had, then settles without bounce: a flick carries on, a slow release eases in.
    anim.current = animateValue(y, pos[next], reduce ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 36, velocity });
  };

  const firstOpens = useRef(true);
  useEffect(() => {
    if (firstOpens.current) { firstOpens.current = false; return; }
    if (!desktop && opens !== undefined && detent === "peek") settle("half");
    // `settle` is rebuilt every render; a change of `opens` is what should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opens]);

  // The map's height changed (first measure, rotation, Safari's toolbar): rest at the new place for the same detent, without animating.
  useEffect(() => {
    if (!tallH) return;
    anim.current?.stop();
    y.set(pos[detent]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tallH, halfH]);

  // The map dims a little as the sheet comes up, so it reads as a layer rising over it.
  const scrim = useTransform(y, [0, Math.max(1, pos.peek)], [0.16, 0]);

  if (desktop) {
    if (collapsed) {
      return (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show the trip panel"
          className="absolute left-4 top-4 z-10 flex h-11 items-center gap-1.5 rounded-full bg-card/95 pl-5 pr-3.5 text-sm font-semibold shadow-lift ring-1 ring-black/[0.04] transition-[transform,background-color] duration-150 hover:bg-card active:scale-[0.97]"
        >
          {collapsedLabel && <span>{collapsedLabel}</span>}
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      );
    }
    return (
      <>
        <motion.div
          initial={reduce ? false : { opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease: EASE }}
          className="absolute left-4 top-[4.5rem] z-10 flex max-h-[calc(100%-5.5rem)] w-[420px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-3xl bg-card shadow-float ring-1 ring-black/[0.05]"
        >
          {children}
        </motion.div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Hide the trip panel to see the full map"
          className="absolute top-[5.25rem] z-20 grid size-9 place-items-center rounded-full bg-card text-muted-foreground shadow-lift ring-1 ring-black/[0.04] transition-[transform,color] duration-150 hover:text-foreground active:scale-[0.97]"
          style={{ left: PANEL_WIDTH + PANEL_GAP + 8 }}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
      </>
    );
  }

  const begin = (e: React.PointerEvent) => { anim.current?.stop(); dragControls.start(e); };

  return (
    <>
      <motion.div aria-hidden style={{ opacity: scrim }} className="pointer-events-none absolute inset-0 z-[9] bg-[oklch(0.2_0.012_65)]" />
      <motion.div
        ref={containerRef}
        // 40px of the sheet lies below the screen, so pulling it past the top (it stretches a little) never shows a gap under it.
        style={{ y, height: tallH ? tallH + SHEET_BLEED : undefined, bottom: tallH ? -SHEET_BLEED : 0 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: pos.peek }}
        dragElastic={{ top: 0.08, bottom: 0.04 }}
        dragMomentum={false}
        data-sheet-lock={detent === "tall" ? undefined : ""}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        // Below the top position the whole sheet is the handle (its content does not scroll there); at the top, only the grip and the title are.
        onPointerDown={(e) => { if (detent !== "tall" || (e.target as HTMLElement).closest("[data-sheet-grip],[data-sheet-handle]")) begin(e); }}
        onDragEnd={(_, info) => {
          // Where it would come to rest if it kept going a moment: the nearest of the three places to that.
          const projected = y.get() + info.velocity.y * 0.2;
          const next = (["tall", "half", "peek"] as Detent[]).reduce((best, d) => (Math.abs(pos[d] - projected) < Math.abs(pos[best] - projected) ? d : best), "half" as Detent);
          settle(next, info.velocity.y);
        }}
        className={cn("absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-3xl bg-card shadow-float ring-1 ring-black/[0.05]", !tallH && "max-h-[54%]")}
      >
        <button
          type="button"
          data-sheet-handle
          aria-label={detent === "tall" ? "Bring the sheet back down" : detent === "half" ? "Collapse to see the map" : "Expand for trip details"}
          onClick={() => settle(detent === "tall" ? "half" : detent === "half" ? "peek" : "half")}
          className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-3 max-lg:py-[17px] active:cursor-grabbing"
        >
          <span className="h-1.5 w-10 rounded-full bg-input" />
        </button>
        {/* Passed straight through, same as the desktop branch above — callers already split their
            own content into a shrink-0 header (day chips) plus a separately-scrolling body; wrapping
            it all in one more scroll container here would make that header scroll away too. */}
        {children}
      </motion.div>
    </>
  );
}

/** Which ways of getting around the day uses, drawn the way the map draws them. */
export function MapLegend({ modes, panelOpen }: { modes: string[]; panelOpen: boolean }) {
  if (modes.length === 0) return null;
  return (
    <ul
      aria-label="Map key"
      className="pointer-events-none absolute bottom-5 z-10 hidden items-center gap-4 rounded-full bg-card/95 px-4 py-2.5 shadow-lift ring-1 ring-black/[0.04] lg:flex"
      style={{ left: panelOpen ? PANEL_WIDTH + PANEL_GAP * 2 : PANEL_GAP }}
    >
      {modes.map((m) => (
        <li key={m} className="flex items-center gap-2 text-xs font-medium text-ink-soft">
          <span className="h-1.5 w-6 rounded-full" style={modeSwatch(m)} aria-hidden="true" />
          {MODE_LABEL[m] ?? m}
        </li>
      ))}
    </ul>
  );
}

/** The whole screen is the map: a quiet shade at the top, a vignette at the edges, and the controls float over it. */
export function MapStage({ pill, trailing, children }: {
  /** Phone: the pill that starts and shows a route, in the middle of the header where other pages have their title. Keep it memoised. */
  pill?: ReactNode;
  /** Phone: the round button at the header's right edge (taking the route away). Keep it memoised. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  // Phone: the same header as every other tab, with the route pill where Discover has its city. No bar behind it: the map runs up under it.
  const phone = useMediaQuery("(max-width: 1023.98px)");
  useSetPhoneHeader({ titleNode: phone ? pill : undefined, trailing: phone ? trailing : undefined, variant: phone ? "overlay" : undefined });
  return (
    <section aria-label="Getting around" className="map-under-header relative isolate h-[100dvh] min-h-[520px] w-full overflow-hidden bg-surface max-lg:-mt-[var(--topbar)] lg:h-[100dvh]">
      <h1 className="sr-only">Getting around</h1>
      {children}
      <div aria-hidden className="vignette pointer-events-none absolute inset-0 z-[1] opacity-30" />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(70%_55%_at_94%_0%,oklch(0.64_0.175_36/0.08),transparent)]" />
      <div aria-hidden className="grain pointer-events-none absolute inset-0 z-[1]" />
      <div aria-hidden className="scrim-t pointer-events-none absolute inset-x-0 top-0 z-[1] h-28 [--scrim:0.14]" />
    </section>
  );
}
