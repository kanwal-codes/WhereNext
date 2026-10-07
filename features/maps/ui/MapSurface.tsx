"use client";

import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { CATEGORY_HEX } from "@/lib/map-colors";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { animate as animateValue, motion, useDragControls, useMotionValue, useReducedMotion } from "motion/react";
import { Car, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { coarseKind } from "@/features/places/ui/discoverTaxonomy";
import { readStayDecision } from "@/packages/contracts/stay";
import type { RoutePlan } from "@/packages/contracts/route-plan";
import { RouteTimeline } from "@/features/maps/ui/RouteTimeline";
import { modeSwatch } from "@/features/maps/ui/modeParts";
import { MODE_LABEL } from "@/lib/application/mode-visuals";
import { TransportSurface, type TransportPreset } from "@/features/transport/ui/TransportSurface";
import { RentalCarList } from "@/features/transport/ui/RentalCarList";
import { AiSearchBar } from "@/components/AiSearchBar";
import { Reveal } from "@/components/motion-primitives";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn, formatDuration } from "@/lib/utils";
import type { MapPin as Pin, MapLeg, MapInset, MapOverlay } from "@/components/TripMap";
import { interchangeNodes } from "@/lib/application/route-overlay";
import { cachedGet } from "@/lib/client/cached-get";

const TripMap = dynamic(() => import("@/components/TripMap").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <div className="skeleton absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading map…</div>,
});

type Row = { places?: { id: string; name: string; provider_id?: string; category?: string | null; metadata?: { latitude?: number; longitude?: number } | null } };
type ItineraryRow = { id: string; title: string; day_index: number; metadata?: { latitude?: number; longitude?: number; source?: string; provider_id?: string } | null };

/** "Wed, Sep 30" for day N of a trip that has a start date. */
function dayDate(startDate: string | null | undefined, dayN: number): string | null {
  if (!startDate) return null;
  const d = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (dayN - 1));
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const coords = (m?: { latitude?: number; longitude?: number } | null) => {
  const lng = Number(m?.longitude);
  const lat = Number(m?.latitude);
  return Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0) ? { lng, lat } : null;
};

const kindFor = (category?: string | null): Pin["kind"] => {
  const k = coarseKind(category);
  return k === "Eat" ? "eat" : k === "Stay" ? "stay" : k === "Nature" || k === "Do" ? "do" : "see";
};

/** Wraps a horizontally-scrolling row with a fade + arrow on whichever edge still has more to
 * scroll to — the day chips otherwise give no hint that Day 5 exists past the panel's edge. */
function HScrollFade({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setMore({
        left: el.scrollLeft > 4,
        right: el.scrollWidth - el.scrollLeft - el.clientWidth > 4,
      });
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
            className="pointer-events-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
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
            className="pointer-events-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
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
const EASE = [0.22, 1, 0.36, 1] as const;

/** On lg+ screens, a floating panel beside the map. Below that, the panel would cover the whole
 * map, so it becomes a draggable bottom sheet instead — pull it down to see the map, up to see
 * the plan. No backdrop: the map stays visible and interactive either way. Reports how much of
 * the map it covers so the route is framed in what is left. */
function MapPanel({ collapsedLabel, onInset, children }: { collapsedLabel?: string; onInset?: (inset: MapInset) => void; children: ReactNode }) {
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
        className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-3 active:cursor-grabbing"
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
function MapLegend({ modes, panelOpen }: { modes: string[]; panelOpen: boolean }) {
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

export function GettingAroundTabs({ tab, onChange, floating = false }: { tab: "trip" | "browse"; onChange: (t: "trip" | "browse") => void; floating?: boolean }) {
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
function MapStage({ tab, onTab, children }: { tab: "trip" | "browse"; onTab: (t: "trip" | "browse") => void; children: ReactNode }) {
  return (
    <section aria-label="Getting around" className="relative isolate h-[calc(100dvh-var(--topbar)-var(--tabbar))] min-h-[520px] w-full overflow-hidden bg-surface lg:h-[100dvh]">
      <h1 className="sr-only">Getting around</h1>
      {children}
      <div aria-hidden className="vignette pointer-events-none absolute inset-0 z-[1] opacity-30" />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(70%_55%_at_94%_0%,oklch(0.64_0.175_36/0.08),transparent)]" />
      <div aria-hidden className="grain pointer-events-none absolute inset-0 z-[1]" />
      <div aria-hidden className="scrim-t pointer-events-none absolute inset-x-0 top-0 z-[1] h-28 [--scrim:0.14]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-4">
        <div className="pointer-events-auto">
          <GettingAroundTabs tab={tab} onChange={onTab} floating />
        </div>
      </div>
    </section>
  );
}

export function MapSurface({ tripId, tab, onTab, start }: { tripId: string; tab: "trip" | "browse"; onTab: (t: "trip" | "browse") => void; /** Where a link from chat drops the reader: a search to run, or a day to open. */ start?: { preset?: TransportPreset; day?: number } }) {
  const { data } = useTripData();
  const [activeDay, setActiveDay] = useState<number | "all">(start?.day ?? "all");
  const [inset, setInset] = useState<MapInset>({});

  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);

  // Day-by-day route plan (real transit legs). Fetched once; refreshes when the itinerary changes
  // or when the rider locks in a different leg option (bumping planVersion).
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [planVersion, setPlanVersion] = useState(0);
  const itineraryKey = ((data?.itinerary ?? []) as ItineraryRow[]).map((i) => `${i.id}:${i.day_index}`).join(",");
  useEffect(() => {
    let cancelled = false;
    // Route legs are relatively expensive to compute (live transit/driving lookups per hop), so a
    // same-session revisit shows the last plan instantly instead of a multi-second blank reload —
    // then quietly refetches to pick up anything that changed. Same pattern as EventDetailView.
    const cacheKey = `route-plan:v2:${tripId}:${itineraryKey}`;
    try {
      const hit = sessionStorage.getItem(cacheKey);
      if (hit) setPlan(JSON.parse(hit) as RoutePlan);
    } catch { /* unavailable or malformed cache */ }
    cachedGet(`/api/trips/${tripId}/route-plan`, { ttlMs: 0 })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setPlan(body as RoutePlan);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(body)); } catch { /* unavailable, e.g. private browsing */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tripId, itineraryKey, planVersion]);

  const pins = useMemo<Pin[]>(() => {
    const out: Pin[] = [];
    const seenIds = new Set<string>();
    for (const i of (data?.itinerary ?? []) as ItineraryRow[]) {
      const c = coords(i.metadata);
      const providerId = i.metadata?.provider_id;
      if (c) {
        out.push({ id: `it-${i.id}`, name: i.title, ...c, kind: "see", day: i.day_index, href: providerId ? `/trips/${tripId}/place/${encodeURIComponent(providerId)}` : undefined });
        seenIds.add(i.id);
      }
    }
    // The route plan live-geocodes every stop server-side, even ones with no coordinates saved on
    // the itinerary row itself (older items added before that started happening). Fold those in
    // too so the map isn't stuck on the empty state for a trip that otherwise has a real plan.
    for (const day of plan?.days ?? []) {
      for (const stop of day.stops) {
        if (seenIds.has(stop.id)) continue;
        out.push({ id: `it-${stop.id}`, name: stop.name, lng: stop.lng, lat: stop.lat, kind: "see", day: day.day });
        seenIds.add(stop.id);
      }
    }
    const pinnedKey = new Set(out.map((p) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`));
    for (const s of (data?.savedPlaces ?? []) as Row[]) {
      const p = s.places;
      const c = coords(p?.metadata);
      if (p && c && !pinnedKey.has(`${c.lng.toFixed(4)},${c.lat.toFixed(4)}`)) {
        out.push({ id: p.id, name: p.name, ...c, kind: kindFor(p.category), href: p.provider_id ? `/trips/${tripId}/place/${encodeURIComponent(p.provider_id)}` : undefined });
      }
    }
    if (lockedStay && lockedStay.latitude != null && lockedStay.longitude != null) {
      out.unshift({ id: "stay", name: lockedStay.hotelName, lng: lockedStay.longitude, lat: lockedStay.latitude, kind: "stay", href: `/trips/${tripId}/stay/${encodeURIComponent(lockedStay.hotelId)}` });
    }
    return out;
  }, [data?.itinerary, data?.savedPlaces, lockedStay, tripId, plan]);

  const days = useMemo(() => {
    const fromPins = pins.map((p) => p.day).filter((d): d is number => typeof d === "number");
    const fromPlan = (plan?.days ?? []).map((d) => d.day);
    return Array.from(new Set([...fromPins, ...fromPlan])).sort((a, b) => a - b);
  }, [pins, plan]);
  // No "whole trip" choice — land on the first day directly rather than a busy all-days overlay.
  useEffect(() => {
    if (activeDay === "all" && days.length > 0) setActiveDay(days[0]);
  }, [activeDay, days]);
  const shown = pins.filter((p) => activeDay === "all" || p.day === activeDay);

  const [hoverLeg, setHoverLeg] = useState<number | null>(null);
  const planDays = useMemo(() => (activeDay === "all" ? (plan?.days ?? []) : (plan?.days ?? []).filter((d) => d.day === activeDay)), [plan, activeDay]);
  // A journey that changes vehicle is drawn as its parts, each in its own mode; one without per-step lines is drawn whole.
  const mapLegs: MapLeg[] = planDays.flatMap((d, di) =>
    d.legs.flatMap((l, li) => {
      const dim = activeDay !== "all" && hoverLeg != null && !(di === 0 && li === hoverLeg);
      const parts = l.steps.length > 0 && l.steps.every((st) => (st.polyline?.length ?? 0) >= 2);
      return parts ? l.steps.map((st) => ({ polyline: st.polyline!, mode: st.mode, dim })) : [{ polyline: l.polyline, mode: l.mode, dim }];
    }),
  );

  // Where the day changes vehicle, and the time of the hop the pointer is on.
  const dayOverlay = useMemo<MapOverlay>(() => {
    const nodes = planDays.flatMap((d) =>
      d.legs.flatMap((l, li) =>
        l.steps.length > 1 && l.steps.every((st) => (st.polyline?.length ?? 0) >= 2)
          ? interchangeNodes(l.steps.map((st) => ({ mode: st.mode, polyline: st.polyline, from: st.from, to: st.to })), `d${d.day}-${li}`)
          : [],
      ),
    );
    const leg = hoverLeg != null && activeDay !== "all" ? planDays[0]?.legs[hoverLeg] : undefined;
    const pills = leg && leg.polyline.length > 1 && leg.minutes != null ? [{ id: "hover", polyline: leg.polyline, text: formatDuration(leg.minutes), tone: "main" as const }] : [];
    return { nodes, pills };
  }, [planDays, hoverLeg, activeDay]);

  // Browse mode: an A→B route the user picked, drawn on the map.
  const [browseLegs, setBrowseLegs] = useState<MapLeg[] | null>(null);
  const [browseOverlay, setBrowseOverlay] = useState<MapOverlay | undefined>();
  const onBrowseRoute = useCallback((legs: MapLeg[] | null, overlay?: MapOverlay) => {
    setBrowseLegs(legs);
    setBrowseOverlay(overlay);
  }, []);
  const browse = useMemo(() => ({ legs: browseLegs ?? [] }), [browseLegs]);
  const [gaPreset, setGaPreset] = useState<TransportPreset | undefined>(start?.preset);
  const applyGaDirective = (d: AiSearchDirective) =>
    setGaPreset({ from: d.from, to: d.to, modes: d.modes ?? [], nonce: Date.now() });

  const origin = data?.trip?.origin ?? "";
  const destination = data?.trip?.destination ?? "";

  const [showRentals, setShowRentals] = useState(false);

  // Fall-back centre for Browse when nothing is pinned yet — geocode the destination once.
  const [center, setCenter] = useState<[number, number] | undefined>();
  // Same anchor used for the empty-map fallback, preferring a real pin (e.g. the locked stay)
  // when one exists. Memoized (like `browse` above) — RentalCarList's fetch effect depends on
  // this object by reference, and an unmemoized literal here was a fresh object every render,
  // re-fetching /car-rentals on every re-render while that panel was open (e.g. each `onRoute`
  // callback `TransportSurface` fires mid-search) for no reason.
  const rentalCenter = useMemo(
    () => (pins[0] ? { lat: pins[0].lat, lng: pins[0].lng } : center ? { lat: center[1], lng: center[0] } : null),
    [pins, center],
  );
  useEffect(() => {
    if (!destination || pins.length > 0) return;
    let cancelled = false;
    cachedGet(`/api/trips/${tripId}/geocode?q=${encodeURIComponent(destination)}`, { ttlMs: 0 })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => !cancelled && p && setCenter([p.lng, p.lat]))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tripId, destination, pins.length]);

  const modesUsed = useMemo(() => {
    const seen = new Set<string>();
    if (tab === "browse") for (const l of browseLegs ?? []) seen.add(l.mode);
    else for (const d of planDays) for (const l of d.legs) if (l.polyline.length > 1) for (const m of l.steps.length ? l.steps.map((st) => st.mode) : [l.mode]) seen.add(m);
    return Array.from(seen);
  }, [planDays, tab, browseLegs]);

  if (tab === "trip" && pins.length === 0) {
    return (
      <MapStage tab={tab} onTab={onTab}>
        <div className="absolute inset-0 grid place-items-center bg-surface px-6">
          <p className="max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
            <MapPin className="mx-auto mb-3 size-6 text-muted-foreground/50" aria-hidden="true" />
            Add stops to your itinerary or save places from Discover — they&rsquo;ll appear on the map here, day by day.
          </p>
        </div>
      </MapStage>
    );
  }

  return (
    <MapStage tab={tab} onTab={onTab}>
      {tab === "trip" ? (
        <>
          <TripMap className="absolute inset-0 h-full min-h-0 w-full rounded-none border-0" pins={pins} legs={mapLegs} activeDay={activeDay} inset={inset} fitControl cinematic overlay={dayOverlay} />
          <MapLegend modes={modesUsed} panelOpen={Boolean(inset.left)} />
          <MapPanel collapsedLabel={activeDay !== "all" ? `Day ${activeDay}` : undefined} onInset={setInset}>
            {days.length > 1 && (
              <div className="shrink-0 border-b border-border">
                <HScrollFade className="flex gap-2 px-5 py-4">
                  {days.map((d) => (
                    <button key={d} type="button" aria-pressed={activeDay === d} onClick={() => setActiveDay(d)} className="btn-chip shrink-0">
                      Day {d}
                    </button>
                  ))}
                </HScrollFade>
              </div>
            )}
            <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-5">
              <motion.div
                key={String(activeDay)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                {planDays.length > 0 && planDays.some((d) => d.legs.length > 0) ? (
                  <div className="space-y-10">
                    {planDays.map((d) => (
                      <RouteTimeline key={d.day} day={d} tripId={tripId} onHoverLeg={setHoverLeg} onLegChosen={() => setPlanVersion((v) => v + 1)} date={dayDate(data?.trip?.start_date, d.day)} />
                    ))}
                  </div>
                ) : (
                  <>
                    <ol className="space-y-3">
                      {shown.map((p, i) => (
                        <li key={p.id} className="flex items-center gap-3 text-sm">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-soft">{i + 1}</span>
                          <span className="truncate font-display text-[15px] font-medium">{p.name}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-4 text-xs text-muted-foreground">
                      {plan ? "Working out how to get between these stops…" : "Numbered in visit order."}
                    </p>
                  </>
                )}
              </motion.div>
            </div>
          </MapPanel>
        </>
      ) : (
        <>
          <TripMap className="absolute inset-0 h-full min-h-0 w-full rounded-none border-0" pins={[]} activeDay="all" center={center} browse={browseLegs && browseLegs.length ? browse : null} inset={inset} fitControl cinematic overlay={browseOverlay} />
          <MapLegend modes={modesUsed} panelOpen={Boolean(inset.left)} />
          <MapPanel onInset={setInset}>
            <div className="scrollbar-slim min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 pt-6">
              <TransportSurface
                tripId={tripId}
                near={rentalCenter ? [rentalCenter.lng, rentalCenter.lat] : undefined}
                preset={gaPreset}
                onRoute={onBrowseRoute}
                searchSlot={
                  <div className="space-y-1.5">
                    <AiSearchBar
                      variant="plain"
                      tripId={tripId}
                      scope="getting-around"
                      placeholder={`Ask — “${origin || "Toronto"} to ${destination || "Montreal"} by train”, “cheapest way to the airport”`}
                      onDirective={applyGaDirective}
                    />
                    <p className="text-xs text-muted-foreground">Or fill in the fields below. Say “by flight”, “by train” or “driving” to narrow it.</p>
                  </div>
                }
              />

              {rentalCenter && (
                <div>
                  <button type="button" onClick={() => setShowRentals((v) => !v)} className="btn-chip">
                    <Car className="h-3.5 w-3.5" />
                    {showRentals ? "Hide rental cars" : `Find a rental car near ${destination || "your destination"}`}
                  </button>
                  {showRentals && (
                    <Reveal className="mt-3">
                      <RentalCarList tripId={tripId} center={rentalCenter} />
                    </Reveal>
                  )}
                </div>
              )}
            </div>
          </MapPanel>
        </>
      )}
    </MapStage>
  );
}
