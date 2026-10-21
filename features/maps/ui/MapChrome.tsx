"use client";

import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate as animateValue, motion, useDragControls, useMotionValue, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Route as RouteIcon, Search } from "lucide-react";
import { PHONE_ROUND, useSetPhoneHeader } from "@/components/shell/PhoneHeader";
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
            className="pointer-events-auto grid h-6 w-6 shrink-0 place-items-center rounded-full max-lg:h-10 max-lg:w-10 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}
      {more.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-card to-transparent pr-1.5">
          <button
            type="button"
            aria-label="Show more days"
            onClick={() => page(1)}
            className="pointer-events-auto grid h-6 w-6 shrink-0 place-items-center rounded-full max-lg:h-10 max-lg:w-10 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Peek height (px) when the mobile sheet is collapsed — just the drag handle plus enough of the
 * first row to hint there's more, deliberately short so most of the map stays visible. */
const SHEET_PEEK = 96;
const PANEL_WIDTH = 420;
const PANEL_GAP = 16;
export const EASE = [0.22, 1, 0.36, 1] as const;

/** On lg+ screens, a floating panel beside the map. Below that, the panel would cover the whole
 * map, so it becomes a draggable bottom sheet instead — pull it down to see the map, up to see
 * the plan. No backdrop: the map stays visible and interactive either way. Reports how much of
 * the map it covers so the route is framed in what is left. */
export function MapPanel({ collapsedLabel, onInset, children }: { collapsedLabel?: string; onInset?: (inset: MapInset) => void; children: ReactNode }) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduce = useReducedMotion();
  const dragControls = useDragControls();
  const containerRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const [travel, setTravel] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (desktop) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setTravel(Math.max(0, el.getBoundingClientRect().height - SHEET_PEEK));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [desktop]);

  useEffect(() => {
    if (desktop) onInset?.({ left: collapsed ? 0 : PANEL_WIDTH + PANEL_GAP });
    else onInset?.({ bottom: Math.min(expanded ? travel + SHEET_PEEK : SHEET_PEEK, Math.round(window.innerHeight * 0.38)) });
  }, [desktop, collapsed, expanded, travel, onInset]);

  const snapTo = (next: boolean) => {
    setExpanded(next);
    animateValue(y, next ? 0 : travel, reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 42 });
  };

  // The sheet's content (and so `travel`) can change height — e.g. switching to a day with more
  // stops — keep a collapsed sheet resting at the new peek offset instead of drifting mid-way.
  useEffect(() => {
    if (!expanded) y.set(travel);
  }, [travel, expanded, y]);

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
          className="absolute top-[5.25rem] z-20 grid size-9 place-items-center rounded-full bg-card text-muted-foreground shadow-lift ring-1 ring-black/[0.04] transition-[transform,color] duration-150 hover:text-foreground active:scale-95"
          style={{ left: PANEL_WIDTH + PANEL_GAP + 8 }}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
      </>
    );
  }

  return (
    <motion.div
      ref={containerRef}
      style={{ y }}
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: travel }}
      dragElastic={0}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
      onDragEnd={(_, info) => snapTo(!(info.offset.y > travel / 2 || info.velocity.y > 500))}
      className="absolute inset-x-0 bottom-0 z-10 flex max-h-[54%] flex-col overflow-hidden rounded-t-3xl bg-card shadow-float ring-1 ring-black/[0.05]"
    >
      <button
        type="button"
        aria-label={expanded ? "Collapse to see the map" : "Expand for trip details"}
        onPointerDown={(e) => dragControls.start(e)}
        onClick={() => snapTo(!expanded)}
        className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-3 max-lg:py-[17px] active:cursor-grabbing"
      >
        <span className="h-1.5 w-10 rounded-full bg-input" />
      </button>
      {/* Passed straight through, same as the desktop branch above — callers already split their
          own content into a shrink-0 header (day chips) plus a separately-scrolling body; wrapping
          it all in one more scroll container here would make that header scroll away too. */}
      {children}
    </motion.div>
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

function GettingAroundTabs({ tab, onChange, floating = false }: { tab: "trip" | "browse"; onChange: (t: "trip" | "browse") => void; floating?: boolean }) {
  return (
    <SegmentedSwitch
      label="Map view"
      value={tab}
      onChange={onChange}
      floating={floating}
      options={[
        { key: "browse", label: "Browse" },
        { key: "trip", label: "My trip" },
      ]}
    />
  );
}

/** The whole screen is the map: a quiet shade at the top, a vignette at the edges, and the controls float over it. */
export function MapStage({ tab, onTab, children }: { tab: "trip" | "browse"; onTab: (t: "trip" | "browse") => void; children: ReactNode }) {
  // Phone redesign: no Browse | My trip switch floating on the map. One round button at the right of the header goes to the other view.
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = narrow;
  const headerSwitch = useMemo(() => {
    if (!phone) return undefined;
    const toBrowse = tab === "trip";
    return (
      <button type="button" onClick={() => onTab(toBrowse ? "browse" : "trip")} aria-label={toBrowse ? "Browse the map" : "Back to my trip"} className={PHONE_ROUND}>
        {toBrowse ? <Search className="size-[1.2rem]" /> : <RouteIcon className="size-[1.2rem]" />}
      </button>
    );
  }, [phone, tab, onTab]);
  useSetPhoneHeader({ trailing: headerSwitch });
  return (
    <section aria-label="Getting around" className="relative isolate h-[calc(100dvh-var(--topbar)-var(--tabbar))] min-h-[520px] w-full overflow-hidden bg-surface lg:h-[100dvh]">
      <h1 className="sr-only">Getting around</h1>
      {children}
      <div aria-hidden className="vignette pointer-events-none absolute inset-0 z-[1] opacity-30" />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(70%_55%_at_94%_0%,oklch(0.64_0.175_36/0.08),transparent)]" />
      <div aria-hidden className="grain pointer-events-none absolute inset-0 z-[1]" />
      <div aria-hidden className="scrim-t pointer-events-none absolute inset-x-0 top-0 z-[1] h-28 [--scrim:0.14]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-4 max-lg:hidden">
        <div className="pointer-events-auto">
          <GettingAroundTabs tab={tab} onChange={onTab} floating />
        </div>
      </div>
    </section>
  );
}

