"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import Link from "next/link";
import { Car, Compass, Route as RouteIcon, Sparkles } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { coarseKind } from "@/features/places/ui/discoverTaxonomy";
import { readStayDecision } from "@/packages/contracts/stay";
import { RouteTimeline } from "@/features/maps/ui/RouteTimeline";
import { TransportSurface } from "@/features/transport/ui/TransportSurface";
import type { TransportPreset } from "@/features/transport/application/useTransportSearch";
import { RentalCarList } from "@/features/transport/ui/RentalCarList";
import { AiSearchBar } from "@/components/AiSearchBar";
import { Reveal } from "@/components/motion-primitives";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { cn, formatDuration } from "@/lib/utils";
import type { MapPin as Pin, MapLeg, MapInset, MapOverlay } from "@/components/TripMap";
import { cachedGet } from "@/lib/client/cached-get";
import { buildPins, dayDate, dayNumbers, dayOverlayFor, daysShown, mapLegsFor, modesDrawn, type ItineraryRow, type SavedRow } from "@/features/maps/domain/map-view";
import { useRoutePlan } from "@/features/maps/application/useRoutePlan";
import { EASE, HScrollFade, MapLegend, MapPanel, MapStage } from "@/features/maps/ui/MapChrome";

const TripMap = dynamic(() => import("@/components/TripMap").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <div className="skeleton absolute inset-0 grid place-items-center text-sm text-ink-soft">Loading map…</div>,
});

const kindFor = (category?: string | null): Pin["kind"] => {
  const k = coarseKind(category);
  return k === "Eat" ? "eat" : k === "Stay" ? "stay" : k === "Nature" || k === "Do" ? "do" : "see";
};

export function MapSurface({ tripId, tab, onTab, start }: { tripId: string; tab: "trip" | "browse"; onTab: (t: "trip" | "browse") => void; /** Where a link from chat drops the reader: a search to run, or a day to open. */ start?: { preset?: TransportPreset; day?: number } }) {
  const { data } = useTripData();
  const [activeDay, setActiveDay] = useState<number | "all">(start?.day ?? "all");
  const [inset, setInset] = useState<MapInset>({});

  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);

  const itineraryKey = ((data?.itinerary ?? []) as ItineraryRow[]).map((i) => `${i.id}:${i.day_index}`).join(",");
  const { plan, refresh: refreshPlan } = useRoutePlan(tripId, itineraryKey);

  const pins = useMemo(
    () => buildPins({ itinerary: (data?.itinerary ?? []) as ItineraryRow[], saved: (data?.savedPlaces ?? []) as SavedRow[], plan, stay: lockedStay, tripId, kindOf: kindFor }),
    [data?.itinerary, data?.savedPlaces, lockedStay, tripId, plan],
  );

  const days = useMemo(() => dayNumbers(pins, plan), [pins, plan]);
  // No "whole trip" choice — land on the first day directly rather than a busy all-days overlay.
  useEffect(() => {
    if (activeDay === "all" && days.length > 0) setActiveDay(days[0]);
  }, [activeDay, days]);
  const shown = pins.filter((p) => activeDay === "all" || p.day === activeDay);

  const [hoverLeg, setHoverLeg] = useState<number | null>(null);
  const planDays = useMemo(() => daysShown(plan, activeDay), [plan, activeDay]);
  const mapLegs = mapLegsFor(planDays, activeDay, hoverLeg);
  const dayOverlay = useMemo(() => dayOverlayFor(planDays, hoverLeg, activeDay, formatDuration), [planDays, hoverLeg, activeDay]);

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

  const modesUsed = useMemo(() => modesDrawn(tab, planDays, browseLegs), [planDays, tab, browseLegs]);

  // Nothing pinned yet: still the destination's own map (the same view Directions opens on) with a panel that says what to do next.
  if (tab === "trip" && pins.length === 0) {
    const base = `/trips/${tripId}`;
    const row = "flex min-h-[60px] items-center gap-3 rounded-2xl py-2 pl-2.5 pr-3.5 text-left transition-transform duration-150 active:scale-[0.985]";
    return (
      <MapStage tab={tab} onTab={onTab}>
        <TripMap className="absolute inset-0 h-full min-h-0 w-full rounded-none border-0" pins={[]} activeDay="all" center={center} browse={null} inset={inset} fitControl cinematic />
        <MapPanel onInset={setInset}>
          <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-2 lg:pt-6">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">Nothing on the map yet</h2>
            <p className="mt-1.5 text-body leading-relaxed text-ink-soft">Stops you plan or save show up here, day by day, with the ways between them.</p>
            <div className="mt-5 grid gap-2">
              <Link href={`${base}/discover`} className={cn(row, "bg-primary text-primary-foreground")}>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15"><Compass className="size-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><b className="block text-body font-semibold">Find places to go</b><span className="block text-sm text-primary-foreground/70">{destination ? `Browse ${destination.split(",")[0]} in Discover` : "Browse Discover"}</span></span>
              </Link>
              <Link href={`${base}/chat`} className={cn(row, "bg-muted")}>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card"><Sparkles className="size-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><b className="block text-body font-semibold">Plan the days with Roam</b><span className="block text-sm text-ink-soft">Ask for a day-by-day plan</span></span>
              </Link>
              <button type="button" onClick={() => onTab("browse")} className={cn(row, "bg-muted")}>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card"><RouteIcon className="size-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><b className="block text-body font-semibold">Just need directions?</b><span className="block text-sm text-ink-soft">Any two places, drawn on the map</span></span>
              </button>
            </div>
          </div>
        </MapPanel>
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
                <HScrollFade className="flex gap-2 px-4 py-4">
                  {days.map((d) => (
                    <button key={d} type="button" aria-pressed={activeDay === d} onClick={() => setActiveDay(d)} className="btn-chip shrink-0">
                      Day {d}
                    </button>
                  ))}
                </HScrollFade>
              </div>
            )}
            <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-5">
              <motion.div
                key={String(activeDay)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                {planDays.length > 0 && planDays.some((d) => d.legs.length > 0 || (d.booked?.length ?? 0) > 0) ? (
                  <div className="space-y-10">
                    {planDays.map((d) => (
                      <RouteTimeline key={d.day} day={d} tripId={tripId} onHoverLeg={setHoverLeg} onLegChosen={refreshPlan} date={dayDate(data?.trip?.start_date, d.day)} />
                    ))}
                  </div>
                ) : (
                  <>
                    <ol className="space-y-3">
                      {shown.map((p, i) => (
                        <li key={p.id} className="flex items-center gap-3 text-sm">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-soft">{i + 1}</span>
                          <span className="truncate font-display text-body font-medium">{p.name}</span>
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
            <div className="scrollbar-slim min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 pt-6 max-lg:pt-2">
              <TransportSurface
                tripId={tripId}
                near={rentalCenter ? [rentalCenter.lng, rentalCenter.lat] : undefined}
                preset={gaPreset}
                onRoute={onBrowseRoute}
                driveSlot={
                  rentalCenter && (
                    <div>
                      <button type="button" onClick={() => setShowRentals((v) => !v)} className="btn-chip">
                        <Car className="size-3.5" />
                        {showRentals ? "Hide rental cars" : `Find a rental car near ${destination || "your destination"}`}
                      </button>
                      {showRentals && (
                        <Reveal className="mt-3">
                          <RentalCarList tripId={tripId} center={rentalCenter} />
                        </Reveal>
                      )}
                    </div>
                  )
                }
                searchSlot={
                  <AiSearchBar
                    variant="plain"
                    tripId={tripId}
                    scope="getting-around"
                    placeholder={`“${(origin || "Toronto").split(",")[0]} to ${(destination || "Montreal").split(",")[0]}”`}
                    onDirective={applyGaDirective}
                  />
                }
              />

            </div>
          </MapPanel>
        </>
      )}
    </MapStage>
  );
}
