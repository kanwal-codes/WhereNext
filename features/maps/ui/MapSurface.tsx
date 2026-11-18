"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTripPanelMaybe } from "@/components/TripPanelProvider";
import { Car, Compass, Route as RouteIcon, Sparkles } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { SheetHeader } from "@/components/SheetHeader";
import { useMediaQuery } from "@/lib/use-media-query";
import { useTripData } from "@/components/TripDataProvider";
import { coarseKind } from "@/features/places/ui/discoverTaxonomy";
import { readStayDecision } from "@/packages/contracts/stay";
import { RouteTimeline } from "@/features/maps/ui/RouteTimeline";
import { TransportSurface } from "@/features/transport/ui/TransportSurface";
import { useTransportSearch, type TransportPreset } from "@/features/transport/application/useTransportSearch";
import { useRouteAsk } from "@/features/transport/application/useRouteAsk";
import { ClearRoute, RoutePill } from "@/features/transport/ui/RoutePill";
import { RouteEditor } from "@/features/transport/ui/RouteEditor";
import { RentalCarList } from "@/features/transport/ui/RentalCarList";
import { Reveal } from "@/components/motion-primitives";
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

export function MapSurface({ tripId, start }: { tripId: string; /** Where a link from chat drops the reader: a search to run, or a day to open. */ start?: { preset?: TransportPreset; day?: number } }) {
  const { data } = useTripData();
  const phone = useMediaQuery("(max-width: 1023.98px)");
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
  // A stop on the timeline opens the page of the place it is, when the pin for it knows one.
  const panel = useTripPanelMaybe();
  const router = useRouter();
  const openStop = useCallback((stopId: string) => {
    const pin = pins.find((p) => p.id === `it-${stopId}` || p.id === stopId);
    if (!pin?.href) return undefined;
    const placeId = pin.href.match(/\/place\/([^/?#]+)/)?.[1];
    // A place opens in the same sheet Roam uses; the stay has a page of its own.
    return placeId && panel ? () => panel.openPanel({ kind: "place", placeId: decodeURIComponent(placeId), name: pin.name }) : () => router.push(pin.href!);
  }, [pins, panel, router]);
  // No "whole trip" choice: land on the first day directly rather than a busy all-days overlay.
  useEffect(() => {
    if (activeDay === "all" && days.length > 0) setActiveDay(days[0]);
  }, [activeDay, days]);
  const shown = pins.filter((p) => activeDay === "all" || p.day === activeDay);

  const [hoverLeg, setHoverLeg] = useState<number | null>(null);
  const planDays = useMemo(() => daysShown(plan, activeDay), [plan, activeDay]);
  const mapLegs = mapLegsFor(planDays, activeDay, hoverLeg);
  const dayOverlay = useMemo(() => dayOverlayFor(planDays, hoverLeg, activeDay, formatDuration), [planDays, hoverLeg, activeDay]);

  // A route searched for: drawn on the map in place of the trip, and its results take the sheet.
  const [browseLegs, setBrowseLegs] = useState<MapLeg[] | null>(null);
  const [browseOverlay, setBrowseOverlay] = useState<MapOverlay | undefined>();
  const onBrowseRoute = useCallback((legs: MapLeg[] | null, overlay?: MapOverlay) => {
    setBrowseLegs(legs);
    setBrowseOverlay(overlay);
  }, []);
  const browse = useMemo(() => ({ legs: browseLegs ?? [] }), [browseLegs]);
  const [gaPreset] = useState<TransportPreset | undefined>(start?.preset);

  const origin = data?.trip?.origin ?? "";
  const destination = data?.trip?.destination ?? "";

  const t = useTransportSearch({ tripId, preset: gaPreset, onRoute: onBrowseRoute });
  const [editing, setEditing] = useState(false);
  const toRef = useRef<HTMLInputElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const ask = useRouteAsk({ tripId, t, home: origin, stay: lockedStay?.hotelName ?? "", onGo: () => setEditing(false) });
  // A route is on screen while one is loading or has been found; before that the sheet is the trip.
  const routeOn = t.searched || t.loading;
  const hasValue = Boolean(t.from.trim() || t.to.trim());

  /** Leaving the editor: two places that changed are searched; a place that was emptied goes back to the route on screen. */
  const closeEditor = () => {
    setEditing(false);
    const a = t.from.trim();
    const b = t.to.trim();
    const last = t.queryRef.current;
    if (a && b) {
      ask.reset();
      if (a !== last.a || b !== last.b) void t.search({ from: a, to: b, modes: [] });
    } else if (last.a && last.b) {
      t.setFrom(last.a);
      t.setTo(last.b);
      ask.reset();
    }
  };
  const clearRoute = () => {
    t.clear();
    t.setFrom("");
    t.setTo("");
    ask.reset();
    setEditing(false);
  };
  // The header keeps stable nodes: they are rebuilt only when what they show changes.
  const open = useCallback(() => setEditing(true), []);
  const pill = useMemo(() => <RoutePill from={t.from} to={t.to} loading={t.loading} onOpen={open} />, [t.from, t.to, t.loading, open]);
  // Phone: taking the route away sits in the sheet that shows it (the header keeps just the menu and the pill). Desktop keeps it beside the pill.
  const clearInSheet = phone && hasValue ? <ClearRoute onClear={clearRoute} className="size-10" /> : undefined;
  useEffect(() => {
    if (editing && !phone) window.setTimeout(() => toRef.current?.focus(), 80);
  }, [editing, phone]);

  const [showRentals, setShowRentals] = useState(false);

  // Fall-back centre for the map when nothing is pinned yet: geocode the destination once.
  const [center, setCenter] = useState<[number, number] | undefined>();
  // Same anchor used for the empty-map fallback, preferring a real pin (e.g. the locked stay) when one exists. Memoized: RentalCarList's
  // fetch effect depends on this object by reference, and a fresh literal each render re-fetched /car-rentals on every re-render.
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

  const modesUsed = useMemo(() => modesDrawn(routeOn ? "browse" : "trip", planDays, browseLegs), [planDays, routeOn, browseLegs]);
  const showTrip = !routeOn && pins.length > 0;

  const editor = (
    <RouteEditor
      tripId={tripId}
      near={rentalCenter ? [rentalCenter.lng, rentalCenter.lat] : undefined}
      t={t}
      ask={ask}
      chips={{ home: origin, stay: lockedStay?.hotelName ?? "", destination }}
      onClose={closeEditor}
      toRef={toRef}
      fromRef={fromRef}
    />
  );

  return (
    <MapStage pill={pill}>
      <TripMap
        key={showTrip ? "trip" : "route"}
        className="absolute inset-0 h-full min-h-0 w-full rounded-none border-0"
        pins={showTrip ? pins : []}
        legs={showTrip ? mapLegs : undefined}
        activeDay={showTrip ? activeDay : "all"}
        center={showTrip ? undefined : center}
        browse={!showTrip && browseLegs && browseLegs.length ? browse : null}
        inset={inset}
        fitControl
        cinematic
        overlay={showTrip ? dayOverlay : browseOverlay}
      />
      <MapLegend modes={modesUsed} panelOpen={Boolean(inset.left)} />
      <MapPanel collapsedLabel={showTrip && activeDay !== "all" ? `Day ${activeDay}` : routeOn ? "Route" : undefined} onInset={setInset} opens={routeOn ? "route" : "trip"}>
        {!phone && (
          <div className="shrink-0 border-b border-border">
            {editing ? (
              <>
                <SheetHeader title="Directions" onClose={closeEditor} bordered={false} />
                <div className="px-4 pb-4">{editor}</div>
              </>
            ) : (
              <div className="flex items-center gap-2 p-4">
                <RoutePill from={t.from} to={t.to} loading={t.loading} onOpen={open} className="w-full flex-1" />
                {hasValue && <ClearRoute onClear={clearRoute} />}
              </div>
            )}
          </div>
        )}

        {/* Phone, no results yet (a half-filled route): the way out sits at the sheet's top right, level with the grip. With results it is in the title row below. */}
        {!routeOn && clearInSheet && <div className="absolute right-3 top-1.5 z-10">{clearInSheet}</div>}

        {routeOn ? (
          <>
          <SheetTitle eyebrow="Directions" title="Ways to get there" trailing={clearInSheet} />
          <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(2rem+var(--phone-bottom))] pt-1">
            <TransportSurface
              tripId={tripId}
              t={t}
              onEdit={open}
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
            />
          </div>
          </>
        ) : pins.length === 0 ? (
          <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(2rem+var(--phone-bottom))] pt-2 lg:pt-5">
            <NothingYet tripId={tripId} destination={destination} onDirections={open} />
          </div>
        ) : (
          <>
            {days.length > 1 && (
              <div className="shrink-0 border-b border-border">
                <HScrollFade className="flex gap-2 px-4 pb-4 pt-1">
                  {days.map((d) => (
                    <button key={d} type="button" aria-pressed={activeDay === d} onClick={() => setActiveDay(d)} className="btn-chip shrink-0">
                      Day {d}
                    </button>
                  ))}
                </HScrollFade>
              </div>
            )}
            <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(2rem+var(--phone-bottom))] pt-5">
              <motion.div key={String(activeDay)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
                {planDays.length > 0 && planDays.some((d) => d.legs.length > 0 || (d.booked?.length ?? 0) > 0) ? (
                  <div className="space-y-10">
                    {planDays.map((d) => (
                      <RouteTimeline key={d.day} day={d} tripId={tripId} onHoverLeg={setHoverLeg} onLegChosen={refreshPlan} date={dayDate(data?.trip?.start_date, d.day)} onOpenStop={openStop} />
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
                    <p className="mt-4 text-xs text-muted-foreground">{plan ? "Working out how to get between these stops…" : "Numbered in visit order."}</p>
                  </>
                )}
              </motion.div>
            </div>
          </>
        )}
      </MapPanel>

      {phone && (
        <Sheet open={editing} onClose={closeEditor} side="top" ariaLabel="Directions" initialFocus={toRef} className="icons-fine">
          <SheetHeader title="Directions" onClose={closeEditor} bordered={false} />
          <div className="px-4 pb-5">{editor}</div>
        </Sheet>
      )}
    </MapStage>
  );
}

/** What the sheet is showing, said at its top so it reads even when the sheet is folded to its peek: the trip, or the route that was asked for. */
function SheetTitle({ eyebrow, title, sub, trailing }: { eyebrow: string; title: string; sub?: string; trailing?: ReactNode }) {
  return (
    <div data-sheet-grip className="flex shrink-0 touch-none items-start justify-between gap-3 px-4 pb-3 pt-1">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 font-display text-xl font-medium leading-tight tracking-[-0.02em]">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-ink-soft">{sub}</p>}
      </div>
      {trailing && <div className="-mt-1.5 shrink-0">{trailing}</div>}
    </div>
  );
}

/** A trip with nothing planned yet: where to go next, and the way to ask for directions without a plan. */
function NothingYet({ tripId, destination, onDirections }: { tripId: string; destination: string; onDirections: () => void }) {
  const base = `/trips/${tripId}`;
  const row = "flex min-h-[60px] items-center gap-3 rounded-2xl py-2 pl-2.5 pr-3.5 text-left transition-transform duration-150 active:scale-[0.985]";
  return (
    <>
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
        <button type="button" onClick={onDirections} className={cn(row, "bg-muted")}>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card"><RouteIcon className="size-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><b className="block text-body font-semibold">Just need directions?</b><span className="block text-sm text-ink-soft">Any two places, drawn on the map</span></span>
        </button>
      </div>
    </>
  );
}
