"use client";

import { CATEGORY_HEX } from "@/lib/map-colors";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { animate as animateValue, motion, useDragControls, useMotionValue, useReducedMotion } from "motion/react";
import { Car, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { coarseKind } from "@/features/places/ui/discoverTaxonomy";
import { readStayDecision } from "@/packages/contracts/stay";
import type { RoutePlan } from "@/packages/contracts/route-plan";
import { RouteTimeline } from "@/features/maps/ui/RouteTimeline";
import { TransportSurface, type TransportPreset } from "@/features/transport/ui/TransportSurface";
import { RentalCarList } from "@/features/transport/ui/RentalCarList";
import { AiSearchBar } from "@/components/AiSearchBar";
import { Reveal } from "@/components/motion-primitives";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { MapPin as Pin, MapLeg } from "@/components/TripMap";
import { cachedGet } from "@/lib/client/cached-get";

const TripMap = dynamic(() => import("@/components/TripMap").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <div className="grid h-[52vh] min-h-[320px] place-items-center rounded-2xl border border-border bg-muted/40 text-sm text-muted-foreground">Loading map…</div>,
});

type Row = { places?: { id: string; name: string; provider_id?: string; category?: string | null; metadata?: { latitude?: number; longitude?: number } | null } };
type ItineraryRow = { id: string; title: string; day_index: number; metadata?: { latitude?: number; longitude?: number; source?: string; provider_id?: string } | null };

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
const SHEET_PEEK = 88;

/** On lg+ screens, a floating panel beside the map (unchanged). Below that, the panel would cover
 * the whole map, so it becomes a draggable bottom sheet instead — pull it down to see the map,
 * up to see the plan. No backdrop: the map stays visible and interactive either way. */
function MapPanel({ className, collapsedLabel, children }: { className?: string; collapsedLabel?: string; children: ReactNode }) {
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
          aria-label="Show trip panel"
          className={cn(
            "absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-border bg-card py-2 pl-3.5 pr-2.5 text-sm font-medium shadow-lift transition-colors hover:bg-muted",
            className,
          )}
        >
          {collapsedLabel && <span>{collapsedLabel}</span>}
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      );
    }
    return (
      <>
        <div className={cn("absolute inset-y-3 left-3 z-10 flex w-[380px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lift", className)}>
          {children}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Hide trip panel to see the full map"
          className="absolute left-[392px] top-3 z-20 grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-lift transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
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
      onDragEnd={(_, info) => snapTo(!(info.offset.y > travel / 2 || info.velocity.y > 500))}
      className={cn("absolute inset-x-0 bottom-0 z-10 flex max-h-[70%] flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-lift", className)}
    >
      <button
        type="button"
        aria-label={expanded ? "Collapse to see the map" : "Expand for trip details"}
        onPointerDown={(e) => dragControls.start(e)}
        onClick={() => snapTo(!expanded)}
        className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1.5 active:cursor-grabbing"
      >
        <span className="h-1.5 w-10 rounded-full bg-border" />
      </button>
      {/* Passed straight through, same as the desktop branch above — callers already split their
          own content into a shrink-0 header (day chips) plus a separately-scrolling body; wrapping
          it all in one more scroll container here would make that header scroll away too. */}
      {children}
    </motion.div>
  );
}

export function GettingAroundTabs({ tab, onChange }: { tab: "trip" | "browse"; onChange: (t: "trip" | "browse") => void }) {
  return (
    <div className="flex">
      <div className="inline-flex rounded-full bg-muted p-1 text-sm">
        {(["trip", "browse"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={cn("rounded-full px-5 py-2 font-medium transition-colors", tab === t ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}
          >
            {t === "trip" ? "My trip" : "Browse"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MapSurface({ tripId, tab }: { tripId: string; tab: "trip" | "browse" }) {
  const { data } = useTripData();
  const [activeDay, setActiveDay] = useState<number | "all">("all");

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
    const cacheKey = `route-plan:v1:${tripId}:${itineraryKey}`;
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
  const planDays = activeDay === "all" ? (plan?.days ?? []) : (plan?.days ?? []).filter((d) => d.day === activeDay);
  const mapLegs: MapLeg[] = planDays.flatMap((d, di) =>
    d.legs.map((l, li) => ({
      polyline: l.polyline,
      mode: l.mode,
      dim: activeDay !== "all" && hoverLeg != null && !(di === 0 && li === hoverLeg),
    })),
  );

  // Browse mode: an A→B route the user picked, drawn on the map.
  const [browseLegs, setBrowseLegs] = useState<MapLeg[] | null>(null);
  const browse = useMemo(() => ({ legs: browseLegs ?? [] }), [browseLegs]);
  const [gaPreset, setGaPreset] = useState<TransportPreset | undefined>();
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

  return (
    <div className="min-w-0 space-y-5">
      {tab === "trip" ? (
        pins.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
            <MapPin className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
            Add stops to your itinerary or save places from Discover — they&rsquo;ll appear on the map here, day by day.
          </p>
        ) : (
          // Map fills the whole box; the day panel floats over its left edge and scrolls on its
          // own, like Google Maps' results panel — no page-scroll-linked positioning to fight.
          <div className="relative h-[70vh] min-h-[480px] w-full overflow-hidden rounded-2xl border border-border">
            <TripMap className="absolute inset-0 h-full w-full rounded-none border-0" pins={pins} legs={mapLegs} activeDay={activeDay} />
            <MapPanel collapsedLabel={activeDay !== "all" ? `Day ${activeDay}` : undefined}>
              {days.length > 0 && (
                <div className="shrink-0 border-b border-border">
                  <HScrollFade className="flex gap-1.5 p-3">
                    {days.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setActiveDay(d)}
                        className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium", activeDay === d ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft")}
                      >
                        Day {d}
                      </button>
                    ))}
                  </HScrollFade>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                {planDays.length > 0 && planDays.some((d) => d.legs.length > 0) ? (
                  <div className="space-y-6">
                    {planDays.map((d) => (
                      <RouteTimeline key={d.day} day={d} tripId={tripId} onHoverLeg={setHoverLeg} onLegChosen={() => setPlanVersion((v) => v + 1)} />
                    ))}
                  </div>
                ) : (
                  <>
                    <ol className="space-y-1.5">
                      {shown.map((p, i) => (
                        <li key={p.id} className="flex items-center gap-2.5 text-sm">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-2xs font-semibold text-white" style={{ background: CATEGORY_HEX[p.kind] }}>
                            {i + 1}
                          </span>
                          <span className="truncate">{p.name}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2 text-2xs text-muted-foreground">
                      {plan ? "Working out how to get between these stops…" : "Numbered in visit order."}
                    </p>
                  </>
                )}
              </div>
            </MapPanel>
          </div>
        )
      ) : (
        <div className="relative h-[70vh] min-h-[480px] w-full overflow-hidden rounded-2xl border border-border">
          <TripMap className="absolute inset-0 h-full w-full rounded-none border-0" pins={[]} activeDay="all" center={center} browse={browseLegs && browseLegs.length ? browse : null} />
          <MapPanel>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
              <TransportSurface
                tripId={tripId}
                preset={gaPreset}
                onRoute={setBrowseLegs}
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
        </div>
      )}
    </div>
  );
}
